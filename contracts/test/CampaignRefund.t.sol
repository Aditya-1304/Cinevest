// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import { Campaign } from "../src/Campaign.sol";
import { CampaignFactory } from "../src/CampaignFactory.sol";
import { CampaignTypes } from "../src/CampaignTypes.sol";
import { MockUSDC, vm } from "./CampaignContribution.t.sol";

/// @notice Focused P2.5/P2.6 checks: a failed campaign returns each original wallet's principal once.
contract CampaignRefundTest {
    event ClaimPaid(address indexed claimant, uint256 amount);

    address internal constant CREATOR = address(0xa11c);
    address internal constant REVIEWER = address(0xb0b0);
    address internal constant ALICE = address(0xaaa1);
    address internal constant BOB = address(0xbbb2);
    address internal constant CAROL = address(0xccc3);

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
        campaign = Campaign(factory.createCampaign(terms));
    }

    function _prepare(address wallet, uint256 amount) internal {
        MockUSDC(CampaignTypes.ARC_TESTNET_USDC).mint(wallet, amount);
        vm.prank(wallet);
        MockUSDC(CampaignTypes.ARC_TESTNET_USDC).approve(address(campaign), amount);
    }

    function _fund(address wallet, uint256 amount) internal {
        _prepare(wallet, amount);
        vm.prank(wallet);
        campaign.contribute(amount);
    }

    function _expire() internal {
        vm.warp(terms.fundingDeadline);
        campaign.expire();
    }

    function test_RefundReturnsCumulativePrincipalAndClearsUnits() external {
        _fund(ALICE, 300e6);
        _fund(ALICE, 200e6);
        _fund(BOB, 400e6);
        _expire();

        vm.expectEmit(true, false, false, true, address(campaign));
        emit ClaimPaid(ALICE, 500e6);
        vm.prank(ALICE);
        campaign.claimFundingRefund();

        require(campaign.contribution(ALICE) == 0, "refunded units not cleared");
        require(campaign.refundsPaid() == 500e6, "refund total mismatch");
        require(campaign.raised() == 900e6, "raised principal changed");
        require(
            MockUSDC(CampaignTypes.ARC_TESTNET_USDC).balanceOf(ALICE) == 500e6,
            "principal not returned"
        );
        require(
            MockUSDC(CampaignTypes.ARC_TESTNET_USDC).balanceOf(address(campaign)) == 400e6,
            "escrow mismatch"
        );
    }

    function test_DoubleRefundReverts() external {
        _fund(ALICE, 100e6);
        _expire();
        vm.prank(ALICE);
        campaign.claimFundingRefund();

        vm.expectRevert(abi.encodeWithSelector(CampaignTypes.NothingToRefund.selector));
        vm.prank(ALICE);
        campaign.claimFundingRefund();
        require(
            MockUSDC(CampaignTypes.ARC_TESTNET_USDC).balanceOf(ALICE) == 100e6, "double refund paid"
        );
    }

    function test_WrongWalletCannotClaimAnotherBackersRefund() external {
        _fund(ALICE, 500e6);
        _fund(BOB, 100e6);
        _expire();

        vm.expectRevert(abi.encodeWithSelector(CampaignTypes.NothingToRefund.selector));
        vm.prank(CAROL);
        campaign.claimFundingRefund();

        vm.prank(BOB);
        campaign.claimFundingRefund();
        require(
            MockUSDC(CampaignTypes.ARC_TESTNET_USDC).balanceOf(BOB) == 100e6,
            "bob received wrong principal"
        );
        require(
            MockUSDC(CampaignTypes.ARC_TESTNET_USDC).balanceOf(CAROL) == 0,
            "non-contributor received funds"
        );
        require(campaign.contribution(ALICE) == 500e6, "alice units changed");
    }

    function test_RefundRejectedWhileFundingIsOpen() external {
        _fund(ALICE, 100e6);
        vm.expectRevert(abi.encodeWithSelector(CampaignTypes.RefundStageRequired.selector));
        vm.prank(ALICE);
        campaign.claimFundingRefund();
    }

    function test_RefundRejectedAfterSuccessfulFinalize() external {
        _fund(ALICE, GOAL);
        campaign.finalize();
        vm.expectRevert(abi.encodeWithSelector(CampaignTypes.RefundStageRequired.selector));
        vm.prank(ALICE);
        campaign.claimFundingRefund();
        require(
            MockUSDC(CampaignTypes.ARC_TESTNET_USDC).balanceOf(ALICE) == 0,
            "successful campaign refunded"
        );
    }

    function test_AllRefundsDrainEscrowExactly() external {
        _fund(ALICE, 600e6);
        _fund(BOB, 300e6);
        _expire();

        vm.prank(ALICE);
        campaign.claimFundingRefund();
        vm.prank(BOB);
        campaign.claimFundingRefund();

        require(campaign.refundsPaid() == 900e6, "refund total mismatch");
        require(
            MockUSDC(CampaignTypes.ARC_TESTNET_USDC).balanceOf(address(campaign)) == 0,
            "escrow not fully drained"
        );
    }
}
