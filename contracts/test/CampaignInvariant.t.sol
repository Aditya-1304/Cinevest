// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import { Campaign } from "../src/Campaign.sol";
import { CampaignTypes } from "../src/CampaignTypes.sol";
import { CampaignSafetyFixture } from "./CampaignSafety.t.sol";
import { vm } from "./CampaignContribution.t.sol";
import { Math } from "@openzeppelin/contracts/utils/math/Math.sol";

/// @notice Bounded state-machine actor covering successful production, failed funding, and cancellation.
/// @dev The invariant runner targets only step(); token minting is confined to explicit funding,
///      purchase, or recorded donation operations, so unsolicited mock calls cannot fake solvency.
contract CampaignHandler is CampaignSafetyFixture {
    Campaign[] public campaigns;
    mapping(address => uint256) public donated;
    mapping(address => bytes32) private termsHash;
    uint256 public successfulActions;

    constructor() {
        setUp();
        Campaign failed = _create(100e6); _fund(failed, ALICE, 40e6);
        vm.warp(failed.getTerms().fundingDeadline); failed.expire(); campaigns.push(failed);
        Campaign cancelled = _create(100e6); _fund(cancelled, ALICE, 100e6); cancelled.finalize();
        cancelled.claimApprovedTranche(); vm.warp(cancelled.getTerms().productionDeadline);
        vm.prank(REVIEWER); cancelled.cancelProduction(); campaigns.push(cancelled);
        Campaign funding = _create(100e6); _fund(funding, ALICE, 40e6); campaigns.push(funding);
        Campaign production = _create(100e6); _fund(production, ALICE, 60e6); _fund(production, BOB, 40e6);
        production.finalize(); campaigns.push(production);
        Campaign released = _create(100e6); _fund(released, ALICE, 60e6); _fund(released, BOB, 40e6);
        _release(released); campaigns.push(released);
        for (uint256 i; i < campaigns.length; ++i) termsHash[address(campaigns[i])] = keccak256(abi.encode(campaigns[i].getTerms()));
    }

    function step(uint8 rawAction, uint256 seed) external {
        Campaign campaign = campaigns[seed % campaigns.length];
        uint256 action = rawAction % 12;
        address actor = seed % 2 == 0 ? ALICE : BOB;
        CampaignTypes.Stage stage = campaign.getStage();
        if (action == 0 && stage == CampaignTypes.Stage.Funding && block.timestamp < campaign.getTerms().fundingDeadline) {
            uint256 remaining = campaign.getTerms().fundingGoal - campaign.raised();
            if (remaining > 0) { _fund(campaign, actor, seed % remaining + 1); successfulActions++; }
        } else if (action == 1 && stage == CampaignTypes.Stage.Funding) {
            if (campaign.raised() == campaign.getTerms().fundingGoal) { campaign.finalize(); successfulActions++; }
            else if (block.timestamp >= campaign.getTerms().fundingDeadline) { campaign.expire(); successfulActions++; }
        } else if (action == 2 && (stage == CampaignTypes.Stage.Refundable || stage == CampaignTypes.Stage.CancelledProduction)) {
            vm.prank(actor); (bool ok,) = address(campaign).call(abi.encodeCall(Campaign.claimFundingRefund, ()));
            if (ok) successfulActions++;
        } else if (action == 3 && stage == CampaignTypes.Stage.Production) {
            uint8 index = seed % 2 == 0 ? 1 : 2;
            bytes32 evidence = keccak256(abi.encode(seed));
            (bool ok,) = address(campaign).call(abi.encodeCall(Campaign.submitEvidence, (index, evidence)));
            if (ok) successfulActions++;
        } else if (action == 4 && stage == CampaignTypes.Stage.Production) {
            uint8 index = seed % 2 == 0 ? 1 : 2;
            bytes32 evidence = campaign.evidenceReference(index);
            vm.prank(REVIEWER);
            (bool ok,) = address(campaign).call(abi.encodeCall(Campaign.approveStage, (index, evidence)));
            if (ok) successfulActions++;
        } else if (action == 5 && stage == CampaignTypes.Stage.Production) {
            uint8 index = seed % 2 == 0 ? 1 : 2;
            bytes32 evidence = campaign.evidenceReference(index);
            if (campaign.disputeStatus(index) == CampaignTypes.DisputeStatus.Pending) {
                vm.prank(REVIEWER); campaign.resolveStage(index, evidence, seed % 3 == 0); successfulActions++;
            } else {
                vm.prank(actor); (bool ok,) = address(campaign).call(abi.encodeCall(Campaign.disputeStage, (index, evidence)));
                if (ok) successfulActions++;
            }
        } else if (action == 6 && stage == CampaignTypes.Stage.Production) {
            (bool configured,) = address(campaign).call(abi.encodeCall(Campaign.configureRelease, (keccak256("asset"))));
            (bool published,) = address(campaign).call(abi.encodeCall(Campaign.publishFilm, ()));
            if (configured || published) successfulActions++;
        } else if (action == 7 && stage == CampaignTypes.Stage.Production && block.timestamp >= campaign.getTerms().productionDeadline) {
            vm.prank(REVIEWER); campaign.cancelProduction(); successfulActions++;
        } else if (action == 8 && stage == CampaignTypes.Stage.Released) {
            address viewer = address(uint160(0x10000 + seed % 256));
            if (!campaign.hasAccess(viewer)) { _buy(campaign, viewer); successfulActions++; }
        } else if (action == 9) {
            (bool a,) = address(campaign).call(abi.encodeCall(Campaign.claimApprovedTranche, ()));
            (bool b,) = address(campaign).call(abi.encodeCall(Campaign.claimCreatorRevenue, ()));
            vm.prank(actor); (bool c,) = address(campaign).call(abi.encodeCall(Campaign.claimFunderRevenue, ()));
            if (a || b || c) successfulActions++;
        } else if (action == 10) {
            vm.warp(block.timestamp + seed % 86401); successfulActions++;
        } else if (action == 11) {
            uint256 amount = seed % 1000;
            token.mint(address(campaign), amount); donated[address(campaign)] += amount; successfulActions++;
        }
    }

    function assertAccounting() external view {
        for (uint256 i; i < campaigns.length; ++i) {
            Campaign campaign = campaigns[i];
            CampaignTypes.CampaignTerms memory terms = campaign.getTerms();
            require(termsHash[address(campaign)] == keccak256(abi.encode(terms)), "immutable terms changed");
            require(campaign.raised() <= terms.fundingGoal, "overfunded");
            require(campaign.funderClaimed() <= campaign.funderAllocated(), "funder overclaim");
            require(campaign.creatorClaimed() <= campaign.creatorAllocated(), "creator overclaim");
            require(campaign.funderAllocated() <= Math.mulDiv(terms.fundingGoal, terms.repaymentCapBps, 10000), "cap exceeded");
            require(token.balanceOf(address(campaign)) == campaign.reservedUSDC() + donated[address(campaign)], "solvency/surplus mismatch");
            require(campaign.paidTrancheAmount() + campaign.refundsPaid() <= campaign.raised(), "principal double spent");
            if (campaign.getStage() == CampaignTypes.Stage.Released) {
                require(campaign.livepeerPlaybackIdHash() != bytes32(0) && campaign.releasedAt() > 0, "release without source");
                require(campaign.withdrawableTrancheAmount() == campaign.raised(), "release without complete review");
            }
            if (campaign.getStage() == CampaignTypes.Stage.CancelledProduction) require(campaign.withdrawableTrancheAmount() == 0, "cancelled funds still withdrawable");
        }
    }
}

/// @notice Foundry invariant entrypoint with explicit selector targeting; no mock/token methods are fuzzed.
contract CampaignInvariantTest {
    struct FuzzSelector { address addr; bytes4[] selectors; }
    CampaignHandler private handler;
    function setUp() external { handler = new CampaignHandler(); }
    function targetContracts() external view returns (address[] memory result) {
        result = new address[](1); result[0] = address(handler);
    }
    function targetSelectors() external view returns (FuzzSelector[] memory result) {
        result = new FuzzSelector[](1); bytes4[] memory selectors = new bytes4[](1);
        selectors[0] = CampaignHandler.step.selector; result[0] = FuzzSelector(address(handler), selectors);
    }
    function invariant_LiabilitiesAndImmutableTermsRemainConsistent() external view { handler.assertAccounting(); }
}
