// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import { Campaign } from "../src/Campaign.sol";
import { CampaignTypes } from "../src/CampaignTypes.sol";
import { CampaignSafetyFixture } from "./CampaignSafety.t.sol";
import { MockUSDC, vm } from "./CampaignContribution.t.sol";

/// @notice Test-only token callback that captures the exact nested-call failure during a token transfer.
contract CallbackUSDC is MockUSDC {
    address private target;
    bytes private payload;
    bool private entered;
    bool public attempted;
    bool public nestedSucceeded;
    bytes4 public nestedError;
    constructor() MockUSDC(0) {}
    function arm(address campaign, bytes calldata data) external {
        target = campaign; payload = data; attempted = false; nestedSucceeded = false;
    }
    function _callback() private {
        if (target == address(0) || entered) return;
        entered = true; attempted = true;
        bytes memory reason;
        (nestedSucceeded, reason) = target.call(payload);
        if (reason.length >= 4) nestedError = bytes4(reason);
        entered = false;
    }
    function transferFrom(address from, address to, uint256 amount) public override returns (bool) {
        _callback(); return super.transferFrom(from, to, amount);
    }
    function transfer(address to, uint256 amount) public override returns (bool) {
        _callback(); return super.transfer(to, amount);
    }
}

/// @notice Exercises both incoming and outgoing ERC-20 callbacks; accounting must remain solvent.
contract CampaignReentrancyTest is CampaignSafetyFixture {
    function test_CallbackCannotReenterContributionOrRefund() external {
        vm.etch(address(token), address(new CallbackUSDC()).code);
        CallbackUSDC callback = CallbackUSDC(address(token));
        Campaign campaign = _create(100e6);
        callback.arm(address(campaign), abi.encodeCall(Campaign.contribute, (1)));
        _fund(campaign, ALICE, 50e6);
        _blocked(callback);
        _solvent(campaign);
        vm.warp(campaign.getTerms().fundingDeadline); campaign.expire();
        callback.arm(address(campaign), abi.encodeCall(Campaign.claimFundingRefund, ()));
        vm.prank(ALICE); campaign.claimFundingRefund();
        _blocked(callback);
        _solvent(campaign);
    }

    function test_CallbackCannotReenterViewingOrAnyPayout() external {
        vm.etch(address(token), address(new CallbackUSDC()).code);
        CallbackUSDC callback = CallbackUSDC(address(token));
        Campaign campaign = _create(100e6);
        _fund(campaign, ALICE, 100e6); _release(campaign);
        callback.arm(address(campaign), abi.encodeCall(Campaign.buyAccess, ()));
        _buy(campaign, BOB); _blocked(callback);
        callback.arm(address(campaign), abi.encodeCall(Campaign.claimFunderRevenue, ()));
        vm.prank(ALICE); campaign.claimFunderRevenue(); _blocked(callback);
        callback.arm(address(campaign), abi.encodeCall(Campaign.claimCreatorRevenue, ()));
        campaign.claimCreatorRevenue(); _blocked(callback);
        callback.arm(address(campaign), abi.encodeCall(Campaign.claimApprovedTranche, ()));
        campaign.claimApprovedTranche(); _blocked(callback);
        _solvent(campaign);
    }

    function test_CallbackCannotReenterMeteredViewing() external {
        vm.etch(address(token), address(new CallbackUSDC()).code);
        CallbackUSDC callback = CallbackUSDC(address(token));
        factory.configureMeterSigner(address(0xfeed));
        Campaign campaign = _create(100e6);
        _fund(campaign, ALICE, 100e6); _release(campaign);
        token.mint(BOB, 2e6);
        vm.prank(BOB); token.approve(address(campaign), 2e6);
        callback.arm(address(campaign), abi.encodeCall(Campaign.withdrawViewing, ()));
        vm.prank(BOB); campaign.depositViewing(1e6); _blocked(callback);
        vm.prank(BOB); campaign.requestViewingExit();
        vm.warp(block.timestamp + campaign.VIEWING_EXIT_DELAY());
        callback.arm(address(campaign), abi.encodeCall(Campaign.depositViewing, (1)));
        vm.prank(BOB); campaign.withdrawViewing(); _blocked(callback);
        _solvent(campaign);
    }

    function _blocked(CallbackUSDC callback) private view {
        require(callback.attempted() && !callback.nestedSucceeded(), "callback bypass");
        require(callback.nestedError() == bytes4(keccak256("ReentrancyGuardReentrantCall()")), "guard was not reached");
    }
}
