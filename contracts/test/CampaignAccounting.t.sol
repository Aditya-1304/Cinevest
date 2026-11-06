// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import { Campaign } from "../src/Campaign.sol";
import { CampaignViewingTest } from "./CampaignViewing.t.sol";
import { MockUSDC, vm } from "./CampaignContribution.t.sol";

contract CampaignAccountingTest is CampaignViewingTest {
    function _assertLiability(uint256 escrow, uint256 reserved) internal view {
        require(campaign.escrowLiability() == escrow, "escrow liability");
        require(campaign.reservedUSDC() == reserved, "reserved liability");
        require(MockUSDC(terms.usdc).balanceOf(address(campaign)) == reserved, "balance mismatch");
    }

    function test_AccountingFundingAndFailedRefundLiabilities() external {
        _assertLiability(0, 0);
        require(!campaign.isRevenueRightMature(), "unreleased matured");
        _smallFund(campaign, ALICE, GOAL / 4);
        _smallFund(campaign, BOB, GOAL / 4);
        _assertLiability(GOAL / 2, GOAL / 2);
        vm.warp(terms.fundingDeadline);
        campaign.expire();
        _assertLiability(GOAL / 2, GOAL / 2);
        vm.prank(ALICE);
        campaign.claimFundingRefund();
        _assertLiability(GOAL / 4, GOAL / 4);
        vm.prank(BOB);
        campaign.claimFundingRefund();
        _assertLiability(0, 0);
    }

    function test_AccountingProductionCancellationLiabilities() external {
        _fundGoal();
        campaign.finalize();
        _assertLiability(GOAL, GOAL);
        vm.prank(CREATOR);
        campaign.claimApprovedTranche();
        _assertLiability(600e6, 600e6);
        vm.warp(terms.productionDeadline);
        vm.prank(REVIEWER);
        campaign.cancelProduction();
        _assertLiability(600e6, 600e6);
        vm.prank(ALICE);
        campaign.claimFundingRefund();
        _assertLiability(0, 0);
    }

    function test_AccountingReleasedClaimsAndDonationSurplus() external {
        _release();
        _assertLiability(GOAL, GOAL);
        _buy(BOB);
        _assertLiability(GOAL, GOAL + 10e6);
        vm.prank(CREATOR);
        campaign.claimApprovedTranche();
        _assertLiability(0, 10e6);
        vm.prank(ALICE);
        campaign.claimFunderRevenue();
        _assertLiability(0, 2e6);
        vm.prank(CREATOR);
        campaign.claimCreatorRevenue();
        _assertLiability(0, 0);
        MockUSDC(terms.usdc).mint(address(campaign), 7);
        require(campaign.reservedUSDC() == 0, "donation became liability");
        require(campaign.creatorAllocated() == campaign.creatorClaimed(), "donation became revenue");
    }

    function test_AccountingDelayedReleaseRetainsFullTermAndAccruedClaims() external {
        _fundGoal();
        campaign.finalize();
        vm.warp(uint256(terms.productionDeadline) + terms.rightsDuration);
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
        require(!campaign.isRevenueRightMature(), "late release lost term");
        _buy(BOB);
        vm.warp(campaign.releasedAt() + terms.rightsDuration - 1);
        require(!campaign.isRevenueRightMature(), "early maturity");
        _buy(address(100));
        require(campaign.funderAllocated() == 16e6, "full sharing term lost");
        vm.warp(campaign.releasedAt() + terms.rightsDuration);
        require(campaign.isRevenueRightMature(), "expiry not mature");
        _buy(address(101));
        require(
            campaign.funderAllocated() == 16e6 && campaign.creatorAllocated() == 14e6,
            "expired split"
        );
        vm.prank(ALICE);
        campaign.claimFunderRevenue();
        require(campaign.funderClaimed() == 16e6, "expired accrued claim lost");
        _assertLiability(GOAL, GOAL + 14e6);
    }

    function test_AccountingCapCrossingKeepsPurchasesAndClaimsOpen() external {
        terms.watchPrice = 1500e6;
        campaign = Campaign(factory.createCampaign(terms));
        _release();
        _buy(BOB);
        require(!campaign.isRevenueRightMature(), "cap matured early");
        _buy(address(100));
        require(campaign.isRevenueRightMature(), "cap not mature");
        require(
            campaign.funderAllocated() == 2000e6 && campaign.creatorAllocated() == 1000e6,
            "cap split"
        );
        _buy(address(101));
        require(
            campaign.funderAllocated() == 2000e6 && campaign.creatorAllocated() == 2500e6,
            "post-cap split"
        );
        vm.prank(ALICE);
        campaign.claimFunderRevenue();
        _assertLiability(GOAL, GOAL + 2500e6);
    }
}
