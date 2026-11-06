// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import { CampaignEscrowTest } from "./CampaignEscrow.t.sol";
import { CampaignTypes } from "../src/CampaignTypes.sol";
import { vm } from "./CampaignContribution.t.sol";

contract CampaignReleaseTest is CampaignEscrowTest {
    bytes32 constant FINAL = keccak256("final");
    bytes32 constant PLAYBACK = keccak256("playback");

    function _prepareRelease() internal {
        _fundGoal();
        campaign.finalize();
        vm.prank(CREATOR);
        campaign.submitEvidence(1, ROUGH_CUT);
        vm.prank(REVIEWER);
        campaign.approveStage(1, ROUGH_CUT);
        vm.prank(CREATOR);
        campaign.submitEvidence(2, FINAL);
        vm.prank(CREATOR);
        campaign.configureRelease(PLAYBACK);
    }

    function test_ReleaseRequiresFinalApprovalAndPreservesEscrowClaims() external {
        _prepareRelease();
        vm.expectRevert(abi.encodeWithSelector(CampaignTypes.FinalApprovalRequired.selector));
        vm.prank(CREATOR);
        campaign.publishFilm();
        vm.prank(REVIEWER);
        campaign.approveStage(2, FINAL);
        vm.expectRevert(abi.encodeWithSelector(CampaignTypes.EvidenceLocked.selector, 2));
        vm.prank(CREATOR);
        campaign.configureRelease(keccak256("replacement"));
        vm.prank(CREATOR);
        campaign.publishFilm();
        require(campaign.getStage() == CampaignTypes.Stage.Released, "not released");
        require(campaign.releasedAt() == block.timestamp, "wrong release time");
        require(campaign.livepeerPlaybackIdHash() == PLAYBACK, "wrong source");
        vm.prank(CREATOR);
        campaign.claimApprovedTranche();
        require(campaign.paidTrancheAmount() == GOAL, "final escrow locked");
    }

    function test_ReleaseConfigurationAuthorizationAndNonzeroSource() external {
        _fundGoal();
        campaign.finalize();
        vm.expectRevert(abi.encodeWithSelector(CampaignTypes.CreatorOnly.selector));
        campaign.configureRelease(PLAYBACK);
        vm.expectRevert(abi.encodeWithSelector(CampaignTypes.PlaybackReferenceRequired.selector));
        vm.prank(CREATOR);
        campaign.configureRelease(bytes32(0));
        vm.expectRevert(abi.encodeWithSelector(CampaignTypes.PlaybackReferenceRequired.selector));
        vm.prank(CREATOR);
        campaign.publishFilm();
    }

    function test_FinalDisputeBlocksPublicationUntilFreshApproval() external {
        _prepareRelease();
        vm.prank(REVIEWER);
        campaign.approveStage(2, FINAL);
        vm.prank(ALICE);
        campaign.disputeStage(2, FINAL);
        vm.expectRevert(abi.encodeWithSelector(CampaignTypes.FinalApprovalRequired.selector));
        vm.prank(CREATOR);
        campaign.publishFilm();
        vm.prank(REVIEWER);
        campaign.resolveStage(2, FINAL, true);
        vm.prank(CREATOR);
        campaign.submitEvidence(2, keccak256("revised"));
        vm.prank(REVIEWER);
        campaign.approveStage(2, keccak256("revised"));
        vm.prank(CREATOR);
        campaign.publishFilm();
        require(campaign.getStage() == CampaignTypes.Stage.Released, "not released");
    }
}
