// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import { Campaign } from "../src/Campaign.sol";
import { CampaignFactory } from "../src/CampaignFactory.sol";
import { CampaignTypes } from "../src/CampaignTypes.sol";
import { MockUSDC, vm } from "./CampaignContribution.t.sol";

/// @notice Focused P2.3/P2.4 checks: permissionless success finalization and deadline failure.
contract CampaignLifecycleTest {
    event StageChanged(CampaignTypes.Stage stage);

    address internal constant CREATOR = address(0xa11c);
    address internal constant REVIEWER = address(0xb0b0);
    address internal constant ALICE = address(0xaaa1);
    address internal constant BOB = address(0xbbb2);

    uint256 internal constant GOAL = 1_000e6;

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

    function _fund(address wallet, uint256 amount) internal {
        MockUSDC(CampaignTypes.ARC_TESTNET_USDC).mint(wallet, amount);
        vm.prank(wallet);
        MockUSDC(CampaignTypes.ARC_TESTNET_USDC).approve(address(campaign), amount);
        vm.prank(wallet);
        campaign.contribute(amount);
    }

    function test_FinalizeByAnyoneMovesGoalReachedCampaignToProductionOnce() external {
        _fund(ALICE, GOAL);
        vm.expectEmit(false, false, false, true, address(campaign));
        emit StageChanged(CampaignTypes.Stage.Production);
        vm.prank(BOB);
        campaign.finalize();
        require(campaign.getStage() == CampaignTypes.Stage.Production, "stage not production");

        vm.expectRevert(abi.encodeWithSelector(CampaignTypes.FundingStageEnded.selector));
        vm.prank(CREATOR);
        campaign.finalize();
    }

    function test_FinalizeRevertsBelowGoal() external {
        _fund(ALICE, GOAL - 1);
        vm.expectRevert(
            abi.encodeWithSelector(CampaignTypes.FundingGoalNotReached.selector, GOAL - 1, GOAL)
        );
        campaign.finalize();
    }

    function test_ExpireAfterDeadlineMovesBelowTargetToRefundableOnce() external {
        _fund(ALICE, GOAL - 1);
        vm.warp(terms.fundingDeadline);
        vm.expectEmit(false, false, false, true, address(campaign));
        emit StageChanged(CampaignTypes.Stage.Refundable);
        vm.prank(BOB);
        campaign.expire();
        require(campaign.getStage() == CampaignTypes.Stage.Refundable, "stage not refundable");

        vm.expectRevert(abi.encodeWithSelector(CampaignTypes.FundingStageEnded.selector));
        campaign.expire();
    }

    function test_ExpireRevertsBeforeDeadlineAndWhenGoalReached() external {
        vm.expectRevert(
            abi.encodeWithSelector(
                CampaignTypes.FundingDeadlineNotReached.selector, terms.fundingDeadline
            )
        );
        campaign.expire();

        _fund(ALICE, GOAL);
        vm.warp(terms.fundingDeadline);
        vm.expectRevert(abi.encodeWithSelector(CampaignTypes.FundingGoalReached.selector));
        campaign.expire();
        require(campaign.getStage() == CampaignTypes.Stage.Funding, "goal campaign expired");
    }
}
