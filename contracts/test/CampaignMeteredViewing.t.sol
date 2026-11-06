// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import { Campaign } from "../src/Campaign.sol";
import { CampaignFactory } from "../src/CampaignFactory.sol";
import { CampaignTypes } from "../src/CampaignTypes.sol";
import { CampaignSafetyFixture } from "./CampaignSafety.t.sol";
import { vm } from "./CampaignContribution.t.sol";
import { ECDSA } from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

interface MeterCheats {
    function addr(uint256) external returns (address);
    function sign(uint256, bytes32) external returns (uint8, bytes32, bytes32);
    function assume(bool) external;
    function etch(address, bytes calldata) external;
}

MeterCheats constant meterCheats = MeterCheats(0x7109709ECfa91a80626fF3989D68f67F5b1DD12D);
uint256 constant METER_KEY = 0xa11ce;

function signReceipt(Campaign campaign, CampaignTypes.ViewingReceipt memory receipt) returns (bytes memory) {
    return signReceiptWith(METER_KEY, campaign, receipt);
}

function signReceiptWith(uint256 key, Campaign campaign, CampaignTypes.ViewingReceipt memory receipt) returns (bytes memory) {
    (uint8 v, bytes32 r, bytes32 s) = meterCheats.sign(key, campaign.viewingReceiptDigest(receipt));
    return abi.encodePacked(r, s, v);
}

/// @notice Adversarial coverage of refundable viewing escrow; the meter is trusted, the viewer and relayers are not.
contract CampaignMeteredViewingTest is CampaignSafetyFixture {
    uint256 private constant PRICE = 20e6;
    address private constant RELAYER = address(0xcafe);
    Campaign private campaign;
    uint64 private sequence;

    function setUp() public override {
        super.setUp();
        factory.configureMeterSigner(meterCheats.addr(METER_KEY));
        campaign = _released(PRICE);
    }

    function _released(uint256 price) private returns (Campaign created) {
        CampaignTypes.CampaignTerms memory terms = _terms(100e6);
        terms.watchPrice = price;
        created = Campaign(factory.createCampaign(terms));
        _fund(created, ALICE, 100e6);
        _release(created);
        created.claimApprovedTranche();
    }

    function _deposit(address viewer, uint256 amount) private {
        token.mint(viewer, amount);
        vm.prank(viewer); token.approve(address(campaign), amount);
        vm.prank(viewer); campaign.depositViewing(amount);
    }

    function _receipt(address viewer, uint256 cumulative, bool closing) private returns (CampaignTypes.ViewingReceipt memory) {
        sequence += 1;
        return CampaignTypes.ViewingReceipt(viewer, address(campaign), campaign.livepeerPlaybackIdHash(), bytes32(uint256(1)),
            sequence, cumulative, PRICE, closing, block.timestamp + 600);
    }

    function _settle(address viewer, uint256 cumulative) private {
        CampaignTypes.ViewingReceipt memory receipt = _receipt(viewer, cumulative, false);
        bytes memory signature = signReceipt(campaign, receipt);
        vm.prank(RELAYER); campaign.settleViewing(receipt, signature);
    }

    function _balance(address viewer) private view returns (uint256 balance) { (balance,,,) = campaign.viewingAccounts(viewer); }
    function _charged(address viewer) private view returns (uint256 charged) { (, charged,,) = campaign.viewingAccounts(viewer); }

    function _solvent() private view {
        require(token.balanceOf(address(campaign)) == campaign.reservedUSDC(), "liabilities differ from balance");
    }

    function _expectInvalid(CampaignTypes.ViewingReceipt memory receipt, bytes memory signature, bytes4 selector) private {
        vm.expectRevert(abi.encodeWithSelector(selector));
        campaign.settleViewing(receipt, signature);
    }

    function test_FundedChunkExample_PaysOnlyForWhatWasWatched() external {
        uint256 liabilities = campaign.reservedUSDC();
        _deposit(BOB, 5e6);
        require(campaign.reservedUSDC() == liabilities + 5e6 && campaign.viewingEscrow() == 5e6, "escrow not held as a liability");
        uint256 creatorBefore = campaign.creatorAllocated();
        _settle(BOB, 3e6);
        require(_balance(BOB) == 2e6 && _charged(BOB) == 3e6 && campaign.viewingEscrow() == 2e6, "balance split");
        require(campaign.funderAllocated() == 600_000, "funder share");
        require(campaign.creatorAllocated() - creatorBefore == 2_400_000, "creator share");
        CampaignTypes.ViewingReceipt memory closing = _receipt(BOB, 3e6, true);
        bytes memory signature = signReceipt(campaign, closing);
        vm.prank(BOB); campaign.settleAndWithdrawViewing(closing, signature);
        require(token.balanceOf(BOB) == 2e6 && campaign.viewingEscrow() == 0, "refund");
        require(!campaign.hasAccess(BOB), "partial viewing granted access");
        _solvent();
    }

    function test_UnsettledDepositNeverReachesRevenueClaims() external {
        _deposit(BOB, 5e6);
        vm.expectRevert(abi.encodeWithSelector(CampaignTypes.NothingToClaim.selector));
        campaign.claimCreatorRevenue();
        vm.prank(ALICE); vm.expectRevert(abi.encodeWithSelector(CampaignTypes.NothingToClaim.selector));
        campaign.claimFunderRevenue();
        _solvent();
    }

    function test_DepositGates() external {
        vm.expectRevert(abi.encodeWithSelector(CampaignTypes.ZeroViewingDeposit.selector));
        vm.prank(BOB); campaign.depositViewing(0);
        vm.expectRevert(abi.encodeWithSelector(CampaignTypes.ViewingDepositOverPrice.selector));
        vm.prank(BOB); campaign.depositViewing(PRICE + 1);
        _deposit(BOB, 15e6);
        _settle(BOB, 10e6);
        vm.expectRevert(abi.encodeWithSelector(CampaignTypes.ViewingDepositOverPrice.selector));
        vm.prank(BOB); campaign.depositViewing(5e6 + 1);
        _deposit(BOB, 5e6);
        Campaign unreleased = _create(100e6);
        vm.expectRevert(abi.encodeWithSelector(CampaignTypes.ReleasedStageRequired.selector));
        vm.prank(BOB); unreleased.depositViewing(1);
    }

    function test_CampaignsBeforeMeterConfigurationStayFullPurchaseOnly() external {
        CampaignFactory fresh = new CampaignFactory();
        Campaign plain = Campaign(fresh.createCampaign(_terms(100e6)));
        require(plain.meterSigner() == address(0), "signer invented");
        fresh.configureMeterSigner(address(0xfeed));
        _fund(plain, ALICE, 100e6); _release(plain);
        vm.expectRevert(abi.encodeWithSelector(CampaignTypes.MeteredViewingDisabled.selector));
        vm.prank(BOB); plain.depositViewing(1);
    }

    function test_MeterSignerConfigurationIsRestrictedAndPermanent() external {
        CampaignFactory fresh = new CampaignFactory();
        vm.prank(BOB); vm.expectRevert(abi.encodeWithSelector(CampaignTypes.WorldVerifierAdminOnly.selector));
        fresh.configureMeterSigner(BOB);
        vm.expectRevert(abi.encodeWithSelector(CampaignTypes.MeterSignerRequired.selector));
        fresh.configureMeterSigner(address(0));
        vm.expectRevert(abi.encodeWithSelector(CampaignTypes.MeterSignerRequired.selector));
        fresh.configureMeterSigner(address(this));
        fresh.configureMeterSigner(BOB);
        vm.expectRevert(abi.encodeWithSelector(CampaignTypes.MeterSignerAlreadyConfigured.selector));
        fresh.configureMeterSigner(ALICE);
    }

    function test_ReplayAndStaleReceiptsCannotChargeTwice() external {
        _deposit(BOB, 10e6);
        CampaignTypes.ViewingReceipt memory receipt = _receipt(BOB, 4e6, false);
        bytes memory signature = signReceipt(campaign, receipt);
        campaign.settleViewing(receipt, signature);
        _expectInvalid(receipt, signature, CampaignTypes.ViewingReceiptReplayed.selector);
        _settle(BOB, 2e6);
        require(_charged(BOB) == 4e6 && _balance(BOB) == 6e6, "lower cumulative moved money");
        _settle(BOB, 5e6);
        require(_charged(BOB) == 5e6 && _balance(BOB) == 5e6, "only the delta is charged");
        _solvent();
    }

    function test_RejectsForgedAndMisboundReceipts() external {
        _deposit(BOB, 10e6);
        bytes4 invalid = CampaignTypes.InvalidViewingReceipt.selector;
        CampaignTypes.ViewingReceipt memory receipt = _receipt(BOB, 1e6, false);
        _expectInvalid(receipt, signReceiptWith(0xbad, campaign, receipt), invalid);
        bytes memory good = signReceipt(campaign, receipt);

        CampaignTypes.ViewingReceipt memory tampered = _receipt(BOB, 1e6, false);
        tampered.sequence = receipt.sequence;
        tampered.cumulativeCharge = 9e6;
        _expectInvalid(tampered, good, invalid);
        tampered.cumulativeCharge = 1e6;
        tampered.viewer = ALICE;
        _expectInvalid(tampered, good, invalid);

        CampaignTypes.ViewingReceipt memory wrongFilm = _receipt(BOB, 1e6, false);
        wrongFilm.filmHash = keccak256("other film");
        _expectInvalid(wrongFilm, signReceipt(campaign, wrongFilm), invalid);

        CampaignTypes.ViewingReceipt memory overCap = _receipt(BOB, 2e6, false);
        overCap.spendCap = 1e6;
        _expectInvalid(overCap, signReceipt(campaign, overCap), invalid);

        CampaignTypes.ViewingReceipt memory overPrice = _receipt(BOB, PRICE + 1, false);
        overPrice.spendCap = PRICE + 1;
        _expectInvalid(overPrice, signReceipt(campaign, overPrice), invalid);

        CampaignTypes.ViewingReceipt memory expired = _receipt(BOB, 1e6, false);
        expired.deadline = block.timestamp - 1;
        _expectInvalid(expired, signReceipt(campaign, expired), CampaignTypes.ViewingReceiptExpired.selector);
        require(_charged(BOB) == 0 && _balance(BOB) == 10e6, "rejected receipt moved money");
    }

    function test_ReceiptForOneCampaignCannotChargeAnother() external {
        Campaign other = _released(PRICE);
        _deposit(BOB, 5e6);
        CampaignTypes.ViewingReceipt memory receipt = _receipt(BOB, 1e6, false);
        bytes memory signature = signReceipt(campaign, receipt);
        vm.expectRevert(abi.encodeWithSelector(CampaignTypes.InvalidViewingReceipt.selector));
        other.settleViewing(receipt, signature);
        // Same fields with the other campaign named still fail: the domain binds the verifying contract.
        receipt.campaign = address(other);
        vm.expectRevert(abi.encodeWithSelector(CampaignTypes.InvalidViewingReceipt.selector));
        other.settleViewing(receipt, signature);
    }

    function test_ChargeNeverExceedsEscrowAndShortfallCarries() external {
        _deposit(BOB, 2e6);
        _settle(BOB, 3e6);
        require(_balance(BOB) == 0 && _charged(BOB) == 2e6, "charged beyond escrow");
        _deposit(BOB, 5e6);
        _settle(BOB, 3e6);
        require(_balance(BOB) == 4e6 && _charged(BOB) == 3e6, "shortfall not collected once");
        _solvent();
    }

    function test_ReachingFullPriceGrantsAccessAndFreesRemainder() external {
        _deposit(BOB, PRICE);
        _settle(BOB, PRICE - 1);
        require(!campaign.hasAccess(BOB), "access before full price");
        _settle(BOB, PRICE);
        require(campaign.hasAccess(BOB) && campaign.hasPaidAccess(BOB), "access missing");
        vm.expectRevert(abi.encodeWithSelector(CampaignTypes.AccessAlreadyPurchased.selector));
        vm.prank(BOB); campaign.depositViewing(1);
        vm.expectRevert(abi.encodeWithSelector(CampaignTypes.AccessAlreadyPurchased.selector));
        vm.prank(BOB); campaign.buyAccess();
        _solvent();
    }

    function test_BuyAccessCreditsSettledChargesAndNeutralizesLateReceipts() external {
        _deposit(BOB, 8e6);
        _settle(BOB, 6e6);
        token.mint(BOB, 14e6);
        vm.prank(BOB); token.approve(address(campaign), 14e6);
        vm.prank(BOB); campaign.buyAccess();
        require(token.balanceOf(BOB) == 0 && _charged(BOB) == PRICE && campaign.hasAccess(BOB), "remainder price");
        _settle(BOB, 7e6);
        require(_balance(BOB) == 2e6 && _charged(BOB) == PRICE, "late receipt charged a full-access wallet");
        vm.prank(BOB); campaign.withdrawViewing();
        require(token.balanceOf(BOB) == 2e6, "escrow stranded after full access");
        require(campaign.creatorAllocated() + campaign.funderAllocated() == PRICE, "revenue differs from full price");
        _solvent();
    }

    function test_ExitPathNeedsNoMeterAndWaitsForSettlementWindow() external {
        _deposit(BOB, 5e6);
        vm.prank(BOB); vm.expectRevert(abi.encodeWithSelector(CampaignTypes.ViewingExitNotReady.selector, uint64(0)));
        campaign.withdrawViewing();
        uint64 exitAt = uint64(block.timestamp + campaign.VIEWING_EXIT_DELAY());
        vm.prank(BOB); campaign.requestViewingExit();
        vm.prank(BOB); campaign.requestViewingExit();
        (,,, uint64 stored) = campaign.viewingAccounts(BOB);
        require(stored == exitAt, "repeat request moved the window");
        vm.warp(exitAt - 1);
        _settle(BOB, 1e6);
        vm.prank(BOB); vm.expectRevert(abi.encodeWithSelector(CampaignTypes.ViewingExitNotReady.selector, exitAt));
        campaign.withdrawViewing();
        vm.warp(exitAt);
        vm.prank(BOB); campaign.withdrawViewing();
        require(token.balanceOf(BOB) == 4e6 && _balance(BOB) == 0, "exit payout");
        _settle(BOB, 2e6);
        require(_charged(BOB) == 1e6, "charged after exit");
        vm.prank(BOB); vm.expectRevert(abi.encodeWithSelector(CampaignTypes.NothingToClaim.selector));
        campaign.requestViewingExit();
        _solvent();
    }

    function test_TopUpCancelsExitSoItCannotShortenTheWindow() external {
        _deposit(BOB, 1e6);
        vm.prank(BOB); campaign.requestViewingExit();
        vm.warp(block.timestamp + campaign.VIEWING_EXIT_DELAY());
        _deposit(BOB, 1e6);
        vm.prank(BOB); vm.expectRevert(abi.encodeWithSelector(CampaignTypes.ViewingExitNotReady.selector, uint64(0)));
        campaign.withdrawViewing();
    }

    function test_ClosingReceiptIsViewerOnlyAndCannotBeBurnedByRelayers() external {
        _deposit(BOB, 5e6);
        CampaignTypes.ViewingReceipt memory closing = _receipt(BOB, 1e6, true);
        bytes memory signature = signReceipt(campaign, closing);
        vm.prank(ALICE); vm.expectRevert(abi.encodeWithSelector(CampaignTypes.InvalidViewingReceipt.selector));
        campaign.settleAndWithdrawViewing(closing, signature);
        // A mempool observer must not be able to spend the sequence through the public relay path.
        vm.prank(RELAYER); vm.expectRevert(abi.encodeWithSelector(CampaignTypes.InvalidViewingReceipt.selector));
        campaign.settleViewing(closing, signature);
        vm.prank(BOB); campaign.settleAndWithdrawViewing(closing, signature);
        require(token.balanceOf(BOB) == 4e6, "closing refund");

        _deposit(BOB, 1e6);
        CampaignTypes.ViewingReceipt memory ordinary = _receipt(BOB, 1e6, false);
        signature = signReceipt(campaign, ordinary);
        vm.prank(BOB); vm.expectRevert(abi.encodeWithSelector(CampaignTypes.InvalidViewingReceipt.selector));
        campaign.settleAndWithdrawViewing(ordinary, signature);
    }

    function test_ExpiredClosingReceiptIsDead() external {
        _deposit(BOB, 5e6);
        CampaignTypes.ViewingReceipt memory closing = _receipt(BOB, 1e6, true);
        bytes memory signature = signReceipt(campaign, closing);
        vm.warp(closing.deadline + 1);
        vm.prank(BOB); vm.expectRevert(abi.encodeWithSelector(CampaignTypes.ViewingReceiptExpired.selector));
        campaign.settleAndWithdrawViewing(closing, signature);
    }

    function test_SettlementAfterRightsExpiryGoesToCreator() external {
        _deposit(BOB, 5e6);
        vm.warp(campaign.releasedAt() + campaign.getTerms().rightsDuration);
        _settle(BOB, 1e6);
        require(campaign.funderAllocated() == 0, "funder credited after rights expiry");
    }

    function testFuzz_AnyReceiptOrderConservesMoney(uint96 first, uint96 second, uint96 third, uint96 deposit) external {
        uint256 amount = uint256(deposit) % PRICE + 1;
        _deposit(BOB, amount);
        uint256 highest;
        uint96[3] memory figures = [first, second, third];
        for (uint256 i; i < 3; ++i) {
            uint256 cumulative = uint256(figures[i]) % (PRICE + 1);
            _settle(BOB, cumulative);
            if (cumulative > highest) highest = cumulative;
        }
        uint256 expected = highest < amount ? highest : amount;
        require(_charged(BOB) == expected, "charge is not the capped high-water mark");
        require(_balance(BOB) + _charged(BOB) == amount, "viewer money not conserved");
        _solvent();
    }

    function test_TypeScriptReceiptVectorMatchesSolidity() external {
        address fixture = 0x2222222222222222222222222222222222222222;
        meterCheats.etch(fixture, address(campaign).code);
        CampaignTypes.ViewingReceipt memory receipt = CampaignTypes.ViewingReceipt({
            viewer: 0x3333333333333333333333333333333333333333, campaign: fixture,
            filmHash: 0x4444444444444444444444444444444444444444444444444444444444444444,
            sessionId: 0x5555555555555555555555555555555555555555555555555555555555555555,
            sequence: 7, cumulativeCharge: 3_000_000, spendCap: 5_000_000, finalForWithdrawal: true, deadline: 2_000_000_000
        });
        bytes32 digest = Campaign(fixture).viewingReceiptDigest(receipt);
        require(digest == 0x9c8189e04b87af58df71aec6cc82abf1d3a0fce52b9cbf1f8c13f5e5df5a184a, "TS digest mismatch");
        bytes memory signature = hex"e57f5d3378764101269dc125fc71fc0f0e5252c44df1c473f99846463b6f7abc350eb49054ae0f4ca372080b39f32ec14be52aa4aed058e4d8074eea7bdb024e1b";
        require(ECDSA.recover(digest, signature) == 0xe05fcC23807536bEe418f142D19fa0d21BB0cfF7, "TS signer mismatch");
    }
}
