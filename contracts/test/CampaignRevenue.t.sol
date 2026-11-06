// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import { Campaign } from "../src/Campaign.sol";
import { CampaignTypes } from "../src/CampaignTypes.sol";
import { CampaignViewingTest } from "./CampaignViewing.t.sol";
import { MockUSDC, vm } from "./CampaignContribution.t.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

contract CampaignRevenueTest is CampaignViewingTest {
    function test_RevenueWeightedEntitlementsAndIncrementalClaims() external {
        _release();
        _buy(BOB);
        require(campaign.claimableFunder(ALICE) == 8e6, "wrong entitlement");
        require(campaign.claimableFunder(BOB) == 0, "viewer entitlement");
        vm.expectEmit(true, false, false, true, address(campaign));
        emit ClaimPaid(ALICE, 8e6);
        vm.prank(ALICE);
        campaign.claimFunderRevenue();
        require(
            campaign.funderClaimedBy(ALICE) == 8e6 && campaign.funderClaimed() == 8e6,
            "claim untracked"
        );
        require(campaign.claimableFunder(ALICE) == 0, "paid entitlement remains");
        vm.expectRevert(abi.encodeWithSelector(CampaignTypes.NothingToClaim.selector));
        vm.prank(ALICE);
        campaign.claimFunderRevenue();
        _buy(address(100));
        require(campaign.claimableFunder(ALICE) == 8e6, "new entitlement incorrect");
        vm.warp(campaign.releasedAt() + terms.rightsDuration);
        vm.prank(ALICE);
        campaign.claimFunderRevenue();
        require(MockUSDC(terms.usdc).balanceOf(ALICE) == 16e6, "wrong funder payout");
        require(campaign.contribution(ALICE) == GOAL, "claim consumed units");
    }

    function test_RevenueTwoContributorsReceiveWeightedShares() external {
        _smallFund(campaign, ALICE, GOAL / 4);
        _smallFund(campaign, BOB, GOAL * 3 / 4);
        campaign.finalize();
        vm.prank(CREATOR);
        campaign.submitEvidence(1, ROUGH_CUT);
        vm.prank(REVIEWER);
        campaign.approveStage(1, ROUGH_CUT);
        vm.prank(CREATOR);
        campaign.submitEvidence(2, ROUGH_CUT);
        vm.prank(CREATOR);
        campaign.configureRelease(ROUGH_CUT);
        vm.prank(REVIEWER);
        campaign.approveStage(2, ROUGH_CUT);
        vm.prank(CREATOR);
        campaign.publishFilm();
        _buy(address(100));
        require(campaign.claimableFunder(ALICE) == 2e6, "quarter share");
        require(campaign.claimableFunder(BOB) == 6e6, "three-quarter share");
        vm.prank(BOB);
        campaign.claimFunderRevenue();
        vm.prank(ALICE);
        campaign.claimFunderRevenue();
        require(campaign.funderClaimed() == campaign.funderAllocated(), "aggregate mismatch");
    }

    function test_RevenueCreatorOnlyWithdrawsCreditsLeavingPrincipalAndFunderFunds() external {
        _release();
        _buy(BOB);
        vm.expectRevert(abi.encodeWithSelector(CampaignTypes.CreatorOnly.selector));
        vm.prank(BOB);
        campaign.claimCreatorRevenue();
        vm.expectEmit(true, false, false, true, address(campaign));
        emit ClaimPaid(CREATOR, 2e6);
        vm.prank(CREATOR);
        campaign.claimCreatorRevenue();
        require(campaign.creatorClaimed() == 2e6, "creator claim untracked");
        require(MockUSDC(terms.usdc).balanceOf(CREATOR) == 2e6, "wrong creator payout");
        require(
            MockUSDC(terms.usdc).balanceOf(address(campaign)) == GOAL + 8e6,
            "other liabilities spent"
        );
        vm.expectRevert(abi.encodeWithSelector(CampaignTypes.NothingToClaim.selector));
        vm.prank(CREATOR);
        campaign.claimCreatorRevenue();
        _buy(address(100));
        vm.prank(CREATOR);
        campaign.claimCreatorRevenue();
        require(campaign.creatorClaimed() == 4e6, "incremental creator claim");
    }

    function test_RevenueFailedTransfersRollBackBothClaimCounters() external {
        _release();
        _buy(BOB);
        vm.etch(terms.usdc, address(new MockUSDC(2)).code);
        vm.expectRevert(
            abi.encodeWithSelector(SafeERC20.SafeERC20FailedOperation.selector, terms.usdc)
        );
        vm.prank(ALICE);
        campaign.claimFunderRevenue();
        require(
            campaign.funderClaimed() == 0 && campaign.funderClaimedBy(ALICE) == 0, "funder rollback"
        );
        require(campaign.claimableFunder(ALICE) == 8e6, "entitlement lost");
        vm.expectRevert(
            abi.encodeWithSelector(SafeERC20.SafeERC20FailedOperation.selector, terms.usdc)
        );
        vm.prank(CREATOR);
        campaign.claimCreatorRevenue();
        require(campaign.creatorClaimed() == 0, "creator rollback");
    }
}
