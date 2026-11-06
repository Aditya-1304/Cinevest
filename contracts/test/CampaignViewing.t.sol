// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import { Campaign } from "../src/Campaign.sol";
import { CampaignTypes } from "../src/CampaignTypes.sol";
import { CampaignEscrowTest } from "./CampaignEscrow.t.sol";
import { MockUSDC, vm } from "./CampaignContribution.t.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

contract CampaignViewingTest is CampaignEscrowTest {
    event WatchPurchased(address indexed viewer, uint256 price);
    event RevenueCredited(uint256 funderAmount, uint256 creatorAmount);

    function _release() internal {
        _fundGoal();
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
    }

    function _approveViewer(address viewer) internal {
        MockUSDC token = MockUSDC(terms.usdc);
        token.mint(viewer, terms.watchPrice);
        vm.prank(viewer);
        token.approve(address(campaign), terms.watchPrice);
    }

    function _buy(address viewer) internal {
        _approveViewer(viewer);
        vm.prank(viewer);
        campaign.buyAccess();
    }

    function test_ViewingRequiresReleaseAndRejectsDoublePurchase() external {
        vm.expectRevert(abi.encodeWithSelector(CampaignTypes.ReleasedStageRequired.selector));
        campaign.buyAccess();
        _release();
        _approveViewer(BOB);
        vm.expectEmit(false, false, false, true, address(campaign));
        emit RevenueCredited(8e6, 2e6);
        vm.expectEmit(true, false, false, true, address(campaign));
        emit WatchPurchased(BOB, terms.watchPrice);
        vm.prank(BOB);
        campaign.buyAccess();
        require(campaign.hasAccess(BOB) && campaign.hasPaidAccess(BOB), "access missing");
        require(campaign.contribution(BOB) == 0, "viewer received units");
        require(
            MockUSDC(terms.usdc).balanceOf(address(campaign)) == GOAL + terms.watchPrice,
            "payment missing"
        );
        vm.expectRevert(abi.encodeWithSelector(CampaignTypes.AccessAlreadyPurchased.selector));
        vm.prank(BOB);
        campaign.buyAccess();
    }

    function test_ViewingFailedPaymentRollsBackAccessAndAccounting() external {
        _release();
        _approveViewer(BOB);
        vm.etch(terms.usdc, address(new MockUSDC(2)).code);
        vm.expectRevert(
            abi.encodeWithSelector(SafeERC20.SafeERC20FailedOperation.selector, terms.usdc)
        );
        vm.prank(BOB);
        campaign.buyAccess();
        require(!campaign.hasAccess(BOB), "failed payment granted access");
        require(
            campaign.funderAllocated() == 0 && campaign.creatorAllocated() == 0,
            "allocation persisted"
        );
        require(
            campaign.accRewardPerUnit() == 0 && campaign.scaledRemainder() == 0, "index persisted"
        );
        require(MockUSDC(terms.usdc).balanceOf(address(campaign)) == GOAL, "transfer persisted");
    }

    function test_ViewingCapCrossingAndComplementaryCreatorAllocation() external {
        terms.fundingGoal = 11;
        terms.watchPrice = 10;
        terms.funderBps = 8000;
        terms.repaymentCapBps = 10000;
        vm.prank(CREATOR);
        campaign = Campaign(factory.createCampaign(terms));
        // The shared funding helper supplies GOAL; use an exact small contribution here.
        MockUSDC token = MockUSDC(terms.usdc);
        token.mint(ALICE, 11);
        vm.prank(ALICE);
        token.approve(address(campaign), 11);
        vm.prank(ALICE);
        campaign.contribute(11);
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
        _buy(BOB);
        _buy(address(100));
        require(
            campaign.funderAllocated() == 11 && campaign.creatorAllocated() == 9,
            "cap crossing split"
        );
        _buy(address(101));
        require(
            campaign.funderAllocated() == 11 && campaign.creatorAllocated() == 19, "post-cap split"
        );
        require(
            campaign.funderAllocated() + campaign.creatorAllocated() == 30, "receipts not conserved"
        );
        require(
            campaign.accRewardPerUnit() == campaign.Q() && campaign.scaledRemainder() == 0,
            "remainder not carried"
        );
    }

    function test_ViewingExpiryBoundaryKeepsAccessPurchasesOpen() external {
        _release();
        vm.warp(campaign.releasedAt() + terms.rightsDuration - 1);
        _buy(BOB);
        uint256 index = campaign.accRewardPerUnit();
        vm.warp(campaign.releasedAt() + terms.rightsDuration);
        _buy(address(100));
        require(
            campaign.funderAllocated() == 8e6 && campaign.creatorAllocated() == 12e6, "expiry split"
        );
        require(campaign.accRewardPerUnit() == index, "expired index changed");
        require(campaign.hasAccess(address(100)), "expired purchase denied");
    }
}
