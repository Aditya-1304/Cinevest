// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import { Campaign } from "../src/Campaign.sol";
import { CampaignFactory } from "../src/CampaignFactory.sol";
import { CampaignTypes } from "../src/CampaignTypes.sol";
import { MockUSDC, vm } from "./CampaignContribution.t.sol";
import { Math } from "@openzeppelin/contracts/utils/math/Math.sol";

/// @notice Shared deterministic fixture for accounting fuzzing, deadline races, and gas measurements.
/// @dev Every campaign is created by its designated creator; only the fixed USDC predeploy is mocked.
contract CampaignSafetyFixture {
    address internal constant REVIEWER = address(0xb0b0);
    address internal constant ALICE = address(0xaaa1);
    address internal constant BOB = address(0xbbb2);
    MockUSDC internal token;
    CampaignFactory internal factory;

    function setUp() public virtual {
        vm.chainId(CampaignTypes.ARC_TESTNET_CHAIN_ID);
        vm.etch(CampaignTypes.ARC_TESTNET_USDC, address(new MockUSDC(0)).code);
        token = MockUSDC(CampaignTypes.ARC_TESTNET_USDC);
        factory = new CampaignFactory();
    }

    function _terms(uint256 goal) internal view returns (CampaignTypes.CampaignTerms memory) {
        return CampaignTypes.CampaignTerms({ creator: address(this), reviewer: REVIEWER,
            usdc: address(token), fundingGoal: goal, fundingDeadline: uint64(block.timestamp + 100),
            productionDeadline: uint64(block.timestamp + 200), rightsDuration: 86400,
            watchPrice: 2e6, funderBps: 2000, repaymentCapBps: 15000,
            pitchReference: keccak256("public-pitch"), worldGated: false, perHumanLimit: 0 });
    }

    function _create(uint256 goal) internal returns (Campaign) {
        return Campaign(factory.createCampaign(_terms(goal)));
    }

    function _fund(Campaign campaign, address actor, uint256 amount) internal {
        if (amount == 0) return;
        token.mint(actor, amount);
        vm.prank(actor); token.approve(address(campaign), amount);
        vm.prank(actor); campaign.contribute(amount);
    }

    function _release(Campaign campaign) internal {
        campaign.finalize();
        campaign.submitEvidence(1, keccak256("rough"));
        vm.prank(REVIEWER); campaign.approveStage(1, keccak256("rough"));
        campaign.configureRelease(keccak256("playback"));
        campaign.submitEvidence(2, keccak256("final"));
        vm.prank(REVIEWER); campaign.approveStage(2, keccak256("final"));
        campaign.publishFilm();
    }

    function _buy(Campaign campaign, address viewer) internal {
        uint256 price = campaign.getTerms().watchPrice;
        token.mint(viewer, price);
        vm.prank(viewer); token.approve(address(campaign), price);
        vm.prank(viewer); campaign.buyAccess();
    }

    function _solvent(Campaign campaign) internal view {
        require(token.balanceOf(address(campaign)) == campaign.reservedUSDC(), "liabilities differ from balance");
        require(campaign.funderClaimed() <= campaign.funderAllocated(), "funder overpayment");
        require(campaign.creatorClaimed() <= campaign.creatorAllocated(), "creator overpayment");
    }
}

/// @notice Arbitrary principal splits, cumulative revenue, expiry edges, and terminal-state race regressions.
contract CampaignSafetyTest is CampaignSafetyFixture {
    event log_named_uint(string key, uint256 value);

    function test_NominalHundredDollarFixtureReachesCapOnView375() external {
        Campaign campaign = _create(100e6);
        _fund(campaign, ALICE, 60e6); _fund(campaign, BOB, 40e6); _release(campaign);
        for (uint256 index; index < 375; ++index) _buy(campaign, address(uint160(0x10000 + index)));
        require(campaign.funderAllocated() == 150e6 && campaign.creatorAllocated() == 600e6, "nominal waterfall mismatch");
        require(campaign.claimableFunder(ALICE) == 90e6 && campaign.claimableFunder(BOB) == 60e6, "nominal entitlement mismatch");
        require(campaign.isRevenueRightMature(), "aggregate cap did not mature");
        _buy(campaign, address(0x9999));
        require(campaign.funderAllocated() == 150e6 && campaign.creatorAllocated() == 602e6, "post-cap receipts mismatch");
        vm.prank(ALICE); campaign.claimFunderRevenue();
        vm.prank(BOB); campaign.claimFunderRevenue();
        campaign.claimCreatorRevenue(); campaign.claimApprovedTranche();
        require(campaign.reservedUSDC() == 0, "nominal fixture left liabilities");
        _solvent(campaign);
    }

    function test_RejectsCreatorImpersonationAndZeroPitch() external {
        CampaignTypes.CampaignTerms memory terms = _terms(100e6);
        vm.expectRevert(abi.encodeWithSelector(CampaignTypes.CreatorOnly.selector));
        vm.prank(ALICE); factory.createCampaign(terms);
        terms.pitchReference = bytes32(0);
        vm.expectRevert(abi.encodeWithSelector(CampaignTypes.PitchReferenceRequired.selector));
        factory.createCampaign(terms);
        terms = _terms(type(uint256).max);
        vm.expectRevert(abi.encodeWithSelector(CampaignTypes.FundingGoalTooHigh.selector));
        factory.createCampaign(terms);
    }

    function test_TinyGoalCannotSkipRoughCutApproval() external {
        Campaign campaign = _create(1); _fund(campaign, ALICE, 1); campaign.finalize();
        campaign.configureRelease(keccak256("asset")); campaign.submitEvidence(2, keccak256("final"));
        vm.expectRevert(abi.encodeWithSelector(CampaignTypes.MilestoneNotOpen.selector, 2));
        vm.prank(REVIEWER); campaign.approveStage(2, keccak256("final"));
    }

    function testFuzz_CapCrossingAndExactExpiry(uint32 rawGoal, uint32 rawPrice, uint16 rawBps) external {
        uint256 goal = uint256(rawGoal) % 1e6 + 1;
        CampaignTypes.CampaignTerms memory terms = _terms(goal);
        terms.watchPrice = uint256(rawPrice) + 1;
        terms.funderBps = uint16(uint256(rawBps) % 10001);
        Campaign campaign = Campaign(factory.createCampaign(terms));
        _fund(campaign, ALICE, goal); _release(campaign);
        uint256 cap = Math.mulDiv(goal, terms.repaymentCapBps, 10000);
        uint256 eligible = Math.min(Math.mulDiv(terms.watchPrice, terms.funderBps, 10000), cap);
        vm.warp(campaign.releasedAt() + terms.rightsDuration - 1);
        _buy(campaign, BOB);
        require(campaign.funderAllocated() == eligible, "pre-expiry allocation");
        vm.warp(block.timestamp + 1);
        _buy(campaign, address(0xdead));
        require(campaign.funderAllocated() == eligible, "exact expiry allocation");
        require(campaign.creatorAllocated() + eligible == terms.watchPrice * 2, "receipt conservation");
        _solvent(campaign);
    }

    function testFuzz_FailedFundingRefundsExactlyOnce(uint96 rawGoal, uint96 rawAmount) external {
        uint256 goal = uint256(rawGoal) % 1e18 + 2;
        uint256 amount = uint256(rawAmount) % (goal - 1) + 1;
        Campaign campaign = _create(goal);
        _fund(campaign, ALICE, amount);
        vm.warp(campaign.getTerms().fundingDeadline);
        campaign.expire();
        vm.prank(ALICE); campaign.claimFundingRefund();
        require(token.balanceOf(ALICE) == amount && campaign.refundsPaid() == amount, "refund mismatch");
        vm.expectRevert(abi.encodeWithSelector(CampaignTypes.NothingToRefund.selector));
        vm.prank(ALICE); campaign.claimFundingRefund();
        _solvent(campaign);
    }

    function testFuzz_RevenueMatchesIndependentProRataOracle(uint96 rawGoal, uint96 split, uint8 purchases) external {
        uint256 goal = uint256(rawGoal) % 1e15 + 2;
        uint256 alice = uint256(split) % (goal - 1) + 1;
        Campaign campaign = _create(goal);
        _fund(campaign, ALICE, alice);
        _fund(campaign, BOB, goal - alice);
        _release(campaign);
        uint256 count = uint256(purchases) % 40 + 1;
        for (uint256 index; index < count; ++index) _buy(campaign, address(uint160(0x10000 + index)));
        uint256 allocated = Math.min(count * 400000, Math.mulDiv(goal, 15000, 10000));
        require(campaign.funderAllocated() == allocated, "cap/allocation mismatch");
        require(campaign.creatorAllocated() == count * 2e6 - allocated, "complement mismatch");
        uint256 reward = Math.mulDiv(allocated, campaign.Q(), goal);
        require(campaign.claimableFunder(ALICE) == Math.mulDiv(alice, reward, campaign.Q()), "alice pro rata");
        require(campaign.claimableFunder(BOB) == Math.mulDiv(goal - alice, reward, campaign.Q()), "bob pro rata");
        uint256 owed = campaign.claimableFunder(ALICE) + campaign.claimableFunder(BOB);
        require(owed <= allocated && allocated - owed <= 2, "unexpected rounding dust");
        if (campaign.claimableFunder(ALICE) > 0) { vm.prank(ALICE); campaign.claimFunderRevenue(); }
        if (campaign.claimableFunder(BOB) > 0) { vm.prank(BOB); campaign.claimFunderRevenue(); }
        require(campaign.claimableFunder(ALICE) == 0 && campaign.claimableFunder(BOB) == 0, "double claim");
        campaign.claimCreatorRevenue();
        vm.warp(campaign.releasedAt() + campaign.getTerms().rightsDuration);
        _buy(campaign, address(0x9999));
        require(campaign.funderAllocated() == allocated, "allocation after expiry");
        _solvent(campaign);
    }

    function testFuzz_CancelledRefundPoolIsOrderIndependent(uint96 rawGoal, uint96 split, bool reverse) external {
        uint256 goal = uint256(rawGoal) % 1e18 + 2;
        uint256 alice = uint256(split) % (goal - 1) + 1;
        Campaign campaign = _create(goal);
        _fund(campaign, ALICE, alice); _fund(campaign, BOB, goal - alice);
        campaign.finalize();
        if (campaign.withdrawableTrancheAmount() > 0) campaign.claimApprovedTranche();
        uint256 pool = goal - campaign.paidTrancheAmount();
        vm.warp(campaign.getTerms().productionDeadline + campaign.CANCELLATION_GRACE_PERIOD());
        vm.prank(BOB); campaign.cancelProduction();
        vm.prank(reverse ? BOB : ALICE); campaign.claimFundingRefund();
        vm.prank(reverse ? ALICE : BOB); campaign.claimFundingRefund();
        require(token.balanceOf(ALICE) == Math.mulDiv(alice, pool, goal), "alice cancellation share");
        require(token.balanceOf(BOB) == Math.mulDiv(goal - alice, pool, goal), "bob cancellation share");
        require(campaign.escrowLiability() <= 1, "cancellation dust exceeds rounding bound");
        _solvent(campaign);
    }

    function test_ReviewerDisappearanceGraceBoundaryAndReleaseCancelRace() external {
        Campaign campaign = _create(100e6);
        _fund(campaign, ALICE, 100e6); campaign.finalize();
        uint256 deadline = campaign.getTerms().productionDeadline;
        vm.warp(deadline + campaign.CANCELLATION_GRACE_PERIOD() - 1);
        vm.expectRevert(abi.encodeWithSelector(CampaignTypes.ReviewerOnly.selector));
        vm.prank(BOB); campaign.cancelProduction();
        vm.warp(block.timestamp + 1);
        vm.prank(BOB); campaign.cancelProduction();
        vm.expectRevert(abi.encodeWithSelector(CampaignTypes.ProductionStageRequired.selector));
        campaign.publishFilm();
        require(campaign.withdrawableTrancheAmount() == 0, "cancelled tranches withdrawable");
        _solvent(campaign);

        Campaign released = _create(100e6);
        _fund(released, ALICE, 100e6); _release(released);
        vm.warp(released.getTerms().productionDeadline + released.CANCELLATION_GRACE_PERIOD());
        vm.expectRevert(abi.encodeWithSelector(CampaignTypes.ProductionStageRequired.selector));
        vm.prank(BOB); released.cancelProduction();
        _solvent(released);
    }

    function test_BuyAccessCostDoesNotGrowWithOneHundredBackers() external {
        Campaign one = _create(100e6);
        Campaign hundred = _create(100e6);
        _fund(one, ALICE, 100e6);
        for (uint256 index; index < 100; ++index) _fund(hundred, address(uint160(0x10000 + index)), 1e6);
        _release(one); _release(hundred);
        token.mint(BOB, 4e6);
        vm.prank(BOB); token.approve(address(one), 2e6);
        vm.prank(BOB); token.approve(address(hundred), 2e6);
        vm.prank(BOB); uint256 beforeOne = gasleft(); one.buyAccess(); uint256 gasOne = beforeOne - gasleft();
        vm.prank(BOB); uint256 beforeHundred = gasleft(); hundred.buyAccess(); uint256 gasHundred = beforeHundred - gasleft();
        emit log_named_uint("buyAccess one backer", gasOne);
        emit log_named_uint("buyAccess 100 backers", gasHundred);
        require(gasHundred <= gasOne + 20000, "purchase cost grows with backer count");
    }
}
