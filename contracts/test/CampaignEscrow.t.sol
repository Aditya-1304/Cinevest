// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import { Campaign } from "../src/Campaign.sol";
import { CampaignFactory } from "../src/CampaignFactory.sol";
import { CampaignTypes } from "../src/CampaignTypes.sol";
import { MockUSDC, vm } from "./CampaignContribution.t.sol";

/// @notice Focused production escrow checks for tranche authorization, evidence, claims, and disputes.
contract CampaignEscrowTest {
    event EvidenceSubmitted(uint8 indexed milestoneIndex, bytes32 evidenceReference);
    event ClaimPaid(address indexed claimant, uint256 amount);
    event StageDisputed(
        uint8 indexed milestoneIndex, address indexed backer, bytes32 evidenceReference
    );
    event DisputeResolved(
        uint8 indexed milestoneIndex, bytes32 evidenceReference, bool disputeApproved
    );

    address internal constant CREATOR = address(0xa11c);
    address internal constant REVIEWER = address(0xb0b0);
    address internal constant ALICE = address(0xaaa1);
    address internal constant BOB = address(0xbbb2);

    uint256 internal constant GOAL = 1_000e6;
    bytes32 internal constant ROUGH_CUT = keccak256(bytes("rough-cut-v1"));
    bytes32 internal constant ROUGH_CUT_REVISED = keccak256(bytes("rough-cut-v2"));

    CampaignFactory internal factory;
    Campaign internal campaign;
    CampaignTypes.CampaignTerms internal terms;

    function setUp() external {
        vm.chainId(CampaignTypes.ARC_TESTNET_CHAIN_ID);
        vm.etch(CampaignTypes.ARC_TESTNET_USDC, address(new MockUSDC(0)).code);
        factory = new CampaignFactory();
        terms = CampaignTypes.CampaignTerms({
            creator: CREATOR,
            reviewer: REVIEWER,
            usdc: CampaignTypes.ARC_TESTNET_USDC,
            fundingGoal: GOAL,
            fundingDeadline: uint64(12_000),
            productionDeadline: uint64(20_000),
            rightsDuration: uint64(10_000_000),
            watchPrice: 10e6,
            funderBps: 8_000,
            repaymentCapBps: 20_000,
            pitchReference: keccak256(bytes("pitch")),
            worldGated: false,
            perHumanLimit: 0
        });
        vm.prank(CREATOR);
        campaign = Campaign(factory.createCampaign(terms));
    }

    function _fundGoal() internal {
        MockUSDC(CampaignTypes.ARC_TESTNET_USDC).mint(ALICE, GOAL);
        vm.prank(ALICE);
        MockUSDC(CampaignTypes.ARC_TESTNET_USDC).approve(address(campaign), GOAL);
        vm.prank(ALICE);
        campaign.contribute(GOAL);
    }

    function test_FinalizeAuthorizesExactlyTrancheZero() external {
        require(campaign.approvedTrancheAmount() == 0, "premature approval");
        _fundGoal();
        campaign.finalize();
        require(campaign.trancheAmount(0) == 400e6, "tranche 0 not 40%");
        require(campaign.approvedTrancheAmount() == 400e6, "approved not 40%");
    }

    function test_OnlyCreatorSubmitsNonzeroEvidence() external {
        _fundGoal();
        campaign.finalize();

        vm.expectRevert(abi.encodeWithSelector(CampaignTypes.CreatorOnly.selector));
        vm.prank(BOB);
        campaign.submitEvidence(1, ROUGH_CUT);

        vm.expectRevert(abi.encodeWithSelector(CampaignTypes.EvidenceReferenceRequired.selector));
        vm.prank(CREATOR);
        campaign.submitEvidence(1, bytes32(0));

        vm.expectEmit(true, false, false, true, address(campaign));
        emit EvidenceSubmitted(1, ROUGH_CUT);
        vm.prank(CREATOR);
        campaign.submitEvidence(1, ROUGH_CUT);
        require(campaign.evidenceReference(1) == ROUGH_CUT, "reference not stored");
    }

    function test_EvidenceIsReplaceableUntilApprovalThenLocked() external {
        _fundGoal();
        campaign.finalize();

        vm.prank(CREATOR);
        campaign.submitEvidence(1, ROUGH_CUT);
        vm.prank(CREATOR);
        campaign.submitEvidence(1, ROUGH_CUT_REVISED);
        require(campaign.evidenceReference(1) == ROUGH_CUT_REVISED, "revision not stored");

        vm.prank(REVIEWER);
        campaign.approveStage(1, ROUGH_CUT_REVISED);

        vm.expectRevert(abi.encodeWithSelector(CampaignTypes.EvidenceLocked.selector, 1));
        vm.prank(CREATOR);
        campaign.submitEvidence(1, ROUGH_CUT);
    }

    function test_OnlyReviewerApprovesSubmittedRoughCutForThirtyPercent() external {
        _fundGoal();
        campaign.finalize();

        vm.expectRevert(abi.encodeWithSelector(CampaignTypes.EvidenceRequired.selector, 1));
        vm.prank(REVIEWER);
        campaign.approveStage(1, bytes32(0));

        vm.prank(CREATOR);
        campaign.submitEvidence(1, ROUGH_CUT);

        vm.expectRevert(abi.encodeWithSelector(CampaignTypes.ReviewerOnly.selector));
        vm.prank(CREATOR);
        campaign.approveStage(1, ROUGH_CUT);

        vm.prank(REVIEWER);
        campaign.approveStage(1, ROUGH_CUT);
        require(campaign.trancheAmount(1) == 300e6, "tranche 1 not 30%");
        require(campaign.approvedTrancheAmount() == 700e6, "approval did not unlock exactly 30%");

        vm.expectRevert(abi.encodeWithSelector(CampaignTypes.TrancheAlreadyApproved.selector, 1));
        vm.prank(REVIEWER);
        campaign.approveStage(1, ROUGH_CUT);
    }

    function test_StaleReviewRevertsAfterEvidenceReplacement() external {
        _fundGoal();
        campaign.finalize();

        vm.prank(CREATOR);
        campaign.submitEvidence(1, ROUGH_CUT);
        vm.prank(CREATOR);
        campaign.submitEvidence(1, ROUGH_CUT_REVISED);

        vm.expectRevert(
            abi.encodeWithSelector(
                CampaignTypes.EvidenceHashMismatch.selector,
                uint256(1),
                ROUGH_CUT,
                ROUGH_CUT_REVISED
            )
        );
        vm.prank(REVIEWER);
        campaign.approveStage(1, ROUGH_CUT);

        require(campaign.approvedTrancheAmount() == 400e6, "stale review unlocked tranche");
        require(campaign.evidenceReference(1) == ROUGH_CUT_REVISED, "replacement was not preserved");

        vm.prank(REVIEWER);
        campaign.approveStage(1, ROUGH_CUT_REVISED);
        require(campaign.approvedTrancheAmount() == 700e6, "current evidence was not approvable");
    }

    function test_CreatorClaimsOnlyNewlyApprovedCumulativeTranches() external {
        _fundGoal();
        campaign.finalize();

        vm.expectRevert(abi.encodeWithSelector(CampaignTypes.CreatorOnly.selector));
        vm.prank(BOB);
        campaign.claimApprovedTranche();

        vm.expectEmit(true, false, false, true, address(campaign));
        emit ClaimPaid(CREATOR, 400e6);
        vm.prank(CREATOR);
        campaign.claimApprovedTranche();
        require(campaign.paidTrancheAmount() == 400e6, "initial claim not tracked");

        vm.expectRevert(abi.encodeWithSelector(CampaignTypes.NothingToClaim.selector));
        vm.prank(CREATOR);
        campaign.claimApprovedTranche();

        vm.prank(CREATOR);
        campaign.submitEvidence(1, ROUGH_CUT);
        vm.prank(REVIEWER);
        campaign.approveStage(1, ROUGH_CUT);

        vm.expectEmit(true, false, false, true, address(campaign));
        emit ClaimPaid(CREATOR, 300e6);
        vm.prank(CREATOR);
        campaign.claimApprovedTranche();
        require(campaign.paidTrancheAmount() == 700e6, "cumulative claim mismatch");
        require(
            MockUSDC(CampaignTypes.ARC_TESTNET_USDC).balanceOf(CREATOR) == 700e6,
            "creator did not receive approved tranches"
        );
    }

    function test_BackersCanDisputeCurrentEvidenceBeforeApproval() external {
        _fundGoal();
        campaign.finalize();
        vm.prank(CREATOR);
        campaign.submitEvidence(1, ROUGH_CUT);

        vm.expectRevert(abi.encodeWithSelector(CampaignTypes.NotAContributor.selector));
        vm.prank(BOB);
        campaign.disputeStage(1, ROUGH_CUT);

        vm.expectEmit(true, true, false, true, address(campaign));
        emit StageDisputed(1, ALICE, ROUGH_CUT);
        vm.prank(ALICE);
        campaign.disputeStage(1, ROUGH_CUT);

        vm.expectRevert(abi.encodeWithSelector(CampaignTypes.DisputePending.selector, 1));
        vm.prank(CREATOR);
        campaign.submitEvidence(1, ROUGH_CUT_REVISED);

        vm.expectRevert(abi.encodeWithSelector(CampaignTypes.DisputePending.selector, 1));
        vm.prank(REVIEWER);
        campaign.approveStage(1, ROUGH_CUT);

        vm.expectRevert(
            abi.encodeWithSelector(
                CampaignTypes.EvidenceHashMismatch.selector,
                uint256(1),
                ROUGH_CUT_REVISED,
                ROUGH_CUT
            )
        );
        vm.prank(REVIEWER);
        campaign.resolveStage(1, ROUGH_CUT_REVISED, false);

        vm.expectEmit(true, false, false, true, address(campaign));
        emit DisputeResolved(1, ROUGH_CUT, false);
        vm.prank(REVIEWER);
        campaign.resolveStage(1, ROUGH_CUT, false);
        require(
            campaign.disputeStatus(1) == CampaignTypes.DisputeStatus.Rejected,
            "rejected dispute result not public"
        );
        require(campaign.disputedEvidenceReference(1) == ROUGH_CUT, "dispute lost evidence binding");
        require(!campaign.isEvidenceRejected(1), "rejected dispute rejected the evidence");

        vm.prank(REVIEWER);
        campaign.approveStage(1, ROUGH_CUT);
        require(campaign.approvedTrancheAmount() == 700e6, "resolved evidence was not approvable");
    }

    function test_UpheldDisputeFreezesAllEscrowUntilResolutionAndRejectsEvidence() external {
        _fundGoal();
        campaign.finalize();

        vm.prank(CREATOR);
        campaign.submitEvidence(1, ROUGH_CUT);
        vm.prank(REVIEWER);
        campaign.approveStage(1, ROUGH_CUT);

        vm.prank(ALICE);
        campaign.disputeStage(1, ROUGH_CUT);
        require(
            campaign.approvedTrancheAmount() == 700e6,
            "pending dispute changed cumulative approvals"
        );
        require(campaign.withdrawableTrancheAmount() == 0, "pending dispute did not freeze escrow");
        vm.expectRevert(abi.encodeWithSelector(CampaignTypes.DisputePending.selector, 1));
        vm.prank(CREATOR);
        campaign.claimApprovedTranche();
        require(campaign.paidTrancheAmount() == 0, "pending dispute paid an approved tranche");

        vm.expectEmit(true, false, false, true, address(campaign));
        emit DisputeResolved(1, ROUGH_CUT, true);
        vm.prank(REVIEWER);
        campaign.resolveStage(1, ROUGH_CUT, true);
        require(
            campaign.disputeStatus(1) == CampaignTypes.DisputeStatus.Approved,
            "upheld dispute result not public"
        );
        require(campaign.isEvidenceRejected(1), "upheld dispute did not reject evidence");
        require(
            campaign.approvedTrancheAmount() == 700e6,
            "historical approvals decreased after challenge"
        );
        require(
            campaign.withdrawableTrancheAmount() == 400e6,
            "rejected evidence remained eligible for withdrawal"
        );
        vm.prank(CREATOR);
        campaign.claimApprovedTranche();
        require(
            campaign.paidTrancheAmount() == 400e6, "tranche zero stayed frozen after resolution"
        );

        vm.expectRevert(abi.encodeWithSelector(CampaignTypes.EvidenceRejected.selector, 1));
        vm.prank(REVIEWER);
        campaign.approveStage(1, ROUGH_CUT);

        vm.prank(CREATOR);
        campaign.submitEvidence(1, ROUGH_CUT_REVISED);
        require(
            campaign.evidenceReference(1) == ROUGH_CUT_REVISED, "replacement evidence not stored"
        );
        require(!campaign.isEvidenceRejected(1), "replacement inherited rejection");
        require(
            campaign.withdrawableTrancheAmount() == 400e6,
            "prior approval authorized replacement evidence"
        );
        vm.expectRevert(abi.encodeWithSelector(CampaignTypes.EvidenceRejected.selector, 1));
        vm.prank(CREATOR);
        campaign.submitEvidence(1, ROUGH_CUT);
        vm.prank(REVIEWER);
        campaign.approveStage(1, ROUGH_CUT_REVISED);
        require(campaign.approvedTrancheAmount() == 700e6, "historical approval not retained");
        require(campaign.withdrawableTrancheAmount() == 700e6, "replacement approval not eligible");
        vm.prank(CREATOR);
        campaign.claimApprovedTranche();
        require(campaign.paidTrancheAmount() == 700e6, "replacement tranche not paid once");
        require(
            MockUSDC(CampaignTypes.ARC_TESTNET_USDC).balanceOf(CREATOR) == 700e6,
            "creator payout exceeded cumulative approval"
        );
    }

    function test_UpheldDisputeDoesNotRecoverOrRepayAlreadyPaidTranches() external {
        _fundGoal();
        campaign.finalize();

        vm.prank(CREATOR);
        campaign.claimApprovedTranche();
        vm.prank(CREATOR);
        campaign.submitEvidence(1, ROUGH_CUT);
        vm.prank(REVIEWER);
        campaign.approveStage(1, ROUGH_CUT);
        vm.prank(CREATOR);
        campaign.claimApprovedTranche();
        require(campaign.paidTrancheAmount() == 700e6, "approved amount not fully paid");

        vm.prank(ALICE);
        campaign.disputeStage(1, ROUGH_CUT);
        require(campaign.withdrawableTrancheAmount() == 0, "pending dispute did not freeze escrow");
        vm.expectRevert(abi.encodeWithSelector(CampaignTypes.DisputePending.selector, 1));
        vm.prank(CREATOR);
        campaign.claimApprovedTranche();

        vm.prank(REVIEWER);
        campaign.resolveStage(1, ROUGH_CUT, true);
        require(campaign.approvedTrancheAmount() == 700e6, "historical approval decreased");
        require(campaign.withdrawableTrancheAmount() == 400e6, "upheld tranche stayed eligible");
        require(campaign.paidTrancheAmount() == 700e6, "dispute changed paid accounting");
        require(
            MockUSDC(CampaignTypes.ARC_TESTNET_USDC).balanceOf(CREATOR) == 700e6,
            "dispute recovered a past payment"
        );

        vm.expectRevert(abi.encodeWithSelector(CampaignTypes.NothingToClaim.selector));
        vm.prank(CREATOR);
        campaign.claimApprovedTranche();

        vm.prank(CREATOR);
        campaign.submitEvidence(1, ROUGH_CUT_REVISED);
        require(
            campaign.withdrawableTrancheAmount() == 400e6,
            "old approval authorized replacement evidence"
        );
        vm.prank(REVIEWER);
        campaign.approveStage(1, ROUGH_CUT_REVISED);
        require(campaign.withdrawableTrancheAmount() == 700e6, "replacement approval not eligible");
        vm.expectRevert(abi.encodeWithSelector(CampaignTypes.NothingToClaim.selector));
        vm.prank(CREATOR);
        campaign.claimApprovedTranche();
        require(campaign.paidTrancheAmount() == 700e6, "replacement was paid a second time");
        require(
            MockUSDC(CampaignTypes.ARC_TESTNET_USDC).balanceOf(CREATOR) == 700e6,
            "replacement duplicated past payments"
        );
    }

    function test_CancelGuardsAndRefundsOnlyUnspentPrincipal() external {
        vm.expectRevert(abi.encodeWithSelector(CampaignTypes.ReviewerOnly.selector));
        campaign.cancelProduction();
        vm.expectRevert(abi.encodeWithSelector(CampaignTypes.ProductionStageRequired.selector));
        vm.prank(REVIEWER);
        campaign.cancelProduction();
        _fundGoal();
        campaign.finalize();
        vm.prank(CREATOR);
        campaign.claimApprovedTranche();
        vm.prank(CREATOR);
        campaign.submitEvidence(1, ROUGH_CUT);
        vm.prank(ALICE);
        campaign.disputeStage(1, ROUGH_CUT);
        vm.expectRevert(
            abi.encodeWithSelector(
                CampaignTypes.ProductionDeadlineNotReached.selector, terms.productionDeadline
            )
        );
        vm.prank(REVIEWER);
        campaign.cancelProduction();
        vm.warp(terms.productionDeadline);
        vm.prank(REVIEWER);
        campaign.cancelProduction();
        require(campaign.getStage() == CampaignTypes.Stage.CancelledProduction, "wrong stage");
        require(campaign.withdrawableTrancheAmount() == 0, "cancelled approval usable");
        vm.expectRevert(abi.encodeWithSelector(CampaignTypes.ProductionStageRequired.selector));
        vm.prank(CREATOR);
        campaign.claimApprovedTranche();
        vm.prank(ALICE);
        campaign.claimFundingRefund();
        require(campaign.refundsPaid() == 600e6, "spent principal refunded");
        require(campaign.paidTrancheAmount() == 400e6, "paid amount changed");
        vm.expectRevert(abi.encodeWithSelector(CampaignTypes.NothingToRefund.selector));
        vm.prank(ALICE);
        campaign.claimFundingRefund();
        vm.expectRevert(abi.encodeWithSelector(CampaignTypes.ProductionStageRequired.selector));
        vm.prank(REVIEWER);
        campaign.cancelProduction();
    }

    function _smallFund(Campaign target, address wallet, uint256 amount) internal {
        MockUSDC token = MockUSDC(CampaignTypes.ARC_TESTNET_USDC);
        token.mint(wallet, amount);
        vm.prank(wallet);
        token.approve(address(target), amount);
        vm.prank(wallet);
        target.contribute(amount);
    }

    function test_CancelSnapshotIsOrderIndependentAndRetainsDust() external {
        terms.fundingGoal = 101;
        vm.prank(CREATOR);
        Campaign first = Campaign(factory.createCampaign(terms));
        vm.prank(CREATOR);
        Campaign second = Campaign(factory.createCampaign(terms));
        _smallFund(first, ALICE, 50);
        _smallFund(first, BOB, 51);
        _smallFund(second, ALICE, 50);
        _smallFund(second, BOB, 51);
        first.finalize();
        second.finalize();
        vm.prank(CREATOR);
        first.claimApprovedTranche();
        vm.prank(CREATOR);
        second.claimApprovedTranche();
        vm.warp(terms.productionDeadline);
        vm.prank(REVIEWER);
        first.cancelProduction();
        vm.prank(REVIEWER);
        second.cancelProduction();
        vm.prank(ALICE);
        first.claimFundingRefund();
        vm.prank(BOB);
        first.claimFundingRefund();
        vm.prank(BOB);
        second.claimFundingRefund();
        vm.prank(ALICE);
        second.claimFundingRefund();
        require(first.refundsPaid() == 60 && second.refundsPaid() == 60, "order changed payouts");
        MockUSDC token = MockUSDC(CampaignTypes.ARC_TESTNET_USDC);
        require(token.balanceOf(ALICE) == 60 && token.balanceOf(BOB) == 60, "wrong shares");
        require(
            token.balanceOf(address(first)) == 1 && token.balanceOf(address(second)) == 1,
            "dust lost"
        );
        require(token.balanceOf(CREATOR) == 80, "spent principal recovered");
    }

    function test_I05_TrancheSumEqualsGoalAndNoTranchePaidTwice() external {
        _fundGoal();
        campaign.finalize();
        uint256[3] memory tranches = campaign.trancheAmounts();
        require(tranches[0] + tranches[1] + tranches[2] == GOAL, "I05: sum != F");

        vm.prank(CREATOR);
        campaign.claimApprovedTranche();
        require(campaign.paidTrancheAmount() == tranches[0], "I05: tranche 0 unpaid");

        vm.expectRevert(abi.encodeWithSelector(CampaignTypes.NothingToClaim.selector));
        vm.prank(CREATOR);
        campaign.claimApprovedTranche();

        vm.prank(CREATOR);
        campaign.submitEvidence(1, ROUGH_CUT);
        vm.prank(REVIEWER);
        campaign.approveStage(1, ROUGH_CUT);

        vm.expectRevert(abi.encodeWithSelector(CampaignTypes.TrancheAlreadyApproved.selector, 1));
        vm.prank(REVIEWER);
        campaign.approveStage(1, ROUGH_CUT);

        vm.prank(CREATOR);
        campaign.claimApprovedTranche();
        require(campaign.paidTrancheAmount() == tranches[0] + tranches[1], "I05: tranche 1 unpaid");

        vm.expectRevert(abi.encodeWithSelector(CampaignTypes.NothingToClaim.selector));
        vm.prank(CREATOR);
        campaign.claimApprovedTranche();
    }

    function test_I06_CreatorNeverApprovesEvidenceAndReviewerNeverWithdraws() external {
        _fundGoal();
        campaign.finalize();
        vm.prank(CREATOR);
        campaign.submitEvidence(1, ROUGH_CUT);

        vm.expectRevert(abi.encodeWithSelector(CampaignTypes.ReviewerOnly.selector));
        vm.prank(CREATOR);
        campaign.approveStage(1, ROUGH_CUT);

        vm.expectRevert(abi.encodeWithSelector(CampaignTypes.CreatorOnly.selector));
        vm.prank(REVIEWER);
        campaign.claimApprovedTranche();

        vm.expectRevert(abi.encodeWithSelector(CampaignTypes.ReviewerOnly.selector));
        vm.prank(CREATOR);
        campaign.resolveStage(1, ROUGH_CUT, true);

        vm.expectRevert(abi.encodeWithSelector(CampaignTypes.CreatorOnly.selector));
        vm.prank(REVIEWER);
        campaign.submitEvidence(1, ROUGH_CUT_REVISED);
    }

    function test_I07_DisputeBlocksMilestoneAndPastPaidTranchesCannotBeClawedBack() external {
        _fundGoal();
        campaign.finalize();

        vm.prank(CREATOR);
        campaign.claimApprovedTranche();
        require(MockUSDC(CampaignTypes.ARC_TESTNET_USDC).balanceOf(CREATOR) == 400e6, "tranche 0 not paid");

        vm.prank(CREATOR);
        campaign.submitEvidence(1, ROUGH_CUT);
        vm.prank(REVIEWER);
        campaign.approveStage(1, ROUGH_CUT);

        vm.prank(ALICE);
        campaign.disputeStage(1, ROUGH_CUT);

        vm.expectRevert(abi.encodeWithSelector(CampaignTypes.DisputePending.selector, 1));
        vm.prank(CREATOR);
        campaign.claimApprovedTranche();

        vm.prank(REVIEWER);
        campaign.resolveStage(1, ROUGH_CUT, true);

        vm.expectRevert(abi.encodeWithSelector(CampaignTypes.NothingToClaim.selector));
        vm.prank(CREATOR);
        campaign.claimApprovedTranche();

        require(MockUSDC(CampaignTypes.ARC_TESTNET_USDC).balanceOf(CREATOR) == 400e6, "I07: past payment clawed back");
        require(campaign.paidTrancheAmount() == 400e6, "I07: paid tracking altered");
    }

    function test_I08_CancellationDistributesOnlyUnspentPrincipalNeverNewlyMintedFunds() external {
        _fundGoal();
        campaign.finalize();

        vm.prank(CREATOR);
        campaign.claimApprovedTranche();
        require(campaign.paidTrancheAmount() == 400e6, "40% not spent");

        vm.expectRevert(
            abi.encodeWithSelector(
                CampaignTypes.ProductionDeadlineNotReached.selector, terms.productionDeadline
            )
        );
        vm.prank(REVIEWER);
        campaign.cancelProduction();

        vm.warp(terms.productionDeadline);
        vm.prank(REVIEWER);
        campaign.cancelProduction();
        require(campaign.getStage() == CampaignTypes.Stage.CancelledProduction, "not cancelled");

        vm.expectRevert(abi.encodeWithSelector(CampaignTypes.ProductionStageRequired.selector));
        vm.prank(REVIEWER);
        campaign.cancelProduction();

        vm.expectRevert(abi.encodeWithSelector(CampaignTypes.ProductionStageRequired.selector));
        vm.prank(CREATOR);
        campaign.claimApprovedTranche();

        MockUSDC token = MockUSDC(CampaignTypes.ARC_TESTNET_USDC);
        uint256 balBefore = token.balanceOf(ALICE);
        vm.prank(ALICE);
        campaign.claimFundingRefund();
        uint256 refundAmount = token.balanceOf(ALICE) - balBefore;

        require(refundAmount == 600e6, "I08: unspent principal mismatch");
        require(campaign.refundsPaid() == 600e6, "I08: refundsPaid mismatch");
        require(campaign.paidTrancheAmount() + campaign.refundsPaid() == GOAL, "I08: newly minted funds");
        require(token.balanceOf(address(campaign)) == 0, "I08: funds leaked or retained");

        vm.expectRevert(abi.encodeWithSelector(CampaignTypes.NothingToRefund.selector));
        vm.prank(ALICE);
        campaign.claimFundingRefund();

        CampaignTypes.CampaignTerms memory relTerms = terms;
        relTerms.fundingDeadline = uint64(block.timestamp + 100);
        relTerms.productionDeadline = uint64(block.timestamp + 200);
        vm.prank(CREATOR);
        Campaign releasedCampaign = Campaign(factory.createCampaign(relTerms));
        token.mint(ALICE, GOAL);
        vm.prank(ALICE);
        token.approve(address(releasedCampaign), GOAL);
        vm.prank(ALICE);
        releasedCampaign.contribute(GOAL);
        releasedCampaign.finalize();
        vm.prank(CREATOR);
        releasedCampaign.submitEvidence(1, ROUGH_CUT);
        vm.prank(REVIEWER);
        releasedCampaign.approveStage(1, ROUGH_CUT);
        vm.prank(CREATOR);
        releasedCampaign.submitEvidence(2, keccak256("final"));
        vm.prank(CREATOR);
        releasedCampaign.configureRelease(keccak256("playback"));
        vm.prank(REVIEWER);
        releasedCampaign.approveStage(2, keccak256("final"));
        vm.prank(CREATOR);
        releasedCampaign.publishFilm();
        vm.warp(relTerms.productionDeadline + 1);
        vm.expectRevert(abi.encodeWithSelector(CampaignTypes.ProductionStageRequired.selector));
        vm.prank(REVIEWER);
        releasedCampaign.cancelProduction();
    }
}
