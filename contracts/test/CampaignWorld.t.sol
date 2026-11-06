// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import { Campaign } from "../src/Campaign.sol";
import { CampaignFactory } from "../src/CampaignFactory.sol";
import { CampaignTypes } from "../src/CampaignTypes.sol";
import { MockUSDC } from "./CampaignContribution.t.sol";
import { ECDSA } from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

interface WorldCheats {
    function chainId(uint256) external;
    function warp(uint256) external;
    function prank(address) external;
    function etch(address, bytes calldata) external;
    function expectRevert(bytes calldata) external;
    function addr(uint256) external returns (address);
    function sign(uint256, bytes32) external returns (uint8, bytes32, bytes32);
}

/// @notice P9.7a adversarial funding coverage; only the two declared funding entrypoints can credit principal.
contract CampaignWorldTest {
    WorldCheats private constant vm = WorldCheats(0x7109709ECfa91a80626fF3989D68f67F5b1DD12D);
    uint256 private constant SIGNER_KEY = 0xa11ce;
    address private constant ALICE = address(0xaaa1);
    address private constant BOB = address(0xbbb2);
    address private constant CREATOR = address(0xc001);
    uint256 private constant LIMIT = 25e6;
    CampaignFactory private factory;
    Campaign private campaign;
    CampaignTypes.CampaignTerms private terms;

    function setUp() external {
        vm.chainId(CampaignTypes.ARC_TESTNET_CHAIN_ID);
        vm.warp(1000);
        MockUSDC token = new MockUSDC(0);
        vm.etch(CampaignTypes.ARC_TESTNET_USDC, address(token).code);
        factory = new CampaignFactory();
        factory.configureWorldVerifierSigner(vm.addr(SIGNER_KEY));
        terms = CampaignTypes.CampaignTerms({
            creator: CREATOR, reviewer: address(0xc002), usdc: CampaignTypes.ARC_TESTNET_USDC,
            fundingGoal: 100e6, fundingDeadline: 12_000, productionDeadline: 20_000,
            rightsDuration: 10_000_000, watchPrice: 1e6, funderBps: 8000, repaymentCapBps: 20_000,
            pitchReference: keccak256("pitch"), worldGated: true, perHumanLimit: LIMIT
        });
        campaign = _create();
        _prepare(campaign, ALICE);
        _prepare(campaign, BOB);
    }

    function _create() private returns (Campaign) {
        vm.prank(CREATOR);
        return Campaign(factory.createCampaign(terms));
    }

    function _prepare(Campaign target, address wallet) private {
        MockUSDC token = MockUSDC(CampaignTypes.ARC_TESTNET_USDC);
        token.mint(wallet, 100e6);
        vm.prank(wallet);
        token.approve(address(target), type(uint256).max);
    }

    function _authorization(bytes32 seed, address wallet) private view returns (CampaignTypes.WorldAuthorization memory) {
        return CampaignTypes.WorldAuthorization({
            wallet: wallet, campaign: address(campaign), scopedNullifierHash: keccak256(abi.encode("human", seed)),
            nonce: keccak256(abi.encode("nonce", seed)), deadline: block.timestamp + 300
        });
    }

    function _sign(Campaign target, CampaignTypes.WorldAuthorization memory authorization) private returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(SIGNER_KEY, target.worldAuthorizationDigest(authorization));
        return abi.encodePacked(r, s, v);
    }

    function _fund(uint256 amount, CampaignTypes.WorldAuthorization memory authorization) private {
        bytes memory signature = _sign(campaign, authorization);
        vm.prank(authorization.wallet);
        campaign.contributeWithAuthorization(amount, authorization, signature);
    }

    function _expectUnsigned(uint256 amount) private {
        vm.expectRevert(abi.encodeWithSelector(CampaignTypes.WorldAuthorizationRequired.selector));
        vm.prank(ALICE);
        campaign.contribute(amount);
    }

    function testFuzz_WorldUnsignedRejectedOnEveryFundingRoute(uint96 amount, bytes32 seed) external {
        uint256 value = uint256(amount) % LIMIT + 1;
        _expectUnsigned(value);
        CampaignTypes.WorldAuthorization memory authorization = _authorization(seed, ALICE);
        vm.expectRevert(abi.encodeWithSelector(CampaignTypes.InvalidWorldAuthorization.selector));
        vm.prank(ALICE);
        campaign.contributeWithAuthorization(value, authorization, "");
        require(campaign.raised() == 0 && campaign.contribution(ALICE) == 0, "unsigned credit");
        require(campaign.nullifierOwner(authorization.scopedNullifierHash) == address(0), "unsigned binding");
    }

    function testFuzz_WorldExpired(uint96 amount, uint64 deadline) external {
        CampaignTypes.WorldAuthorization memory authorization = _authorization(bytes32(uint256(deadline)), ALICE);
        authorization.deadline = uint256(deadline) % 1000;
        bytes memory signature = _sign(campaign, authorization);
        vm.expectRevert(abi.encodeWithSelector(CampaignTypes.WorldAuthorizationExpired.selector));
        vm.prank(ALICE);
        campaign.contributeWithAuthorization(uint256(amount) % LIMIT + 1, authorization, signature);
        _expectUnsigned(1);
        require(campaign.raised() == 0, "expired credit");
    }

    function testFuzz_WorldReplayDoesNotDoubleConsume(uint96 amount, bytes32 seed) external {
        uint256 value = uint256(amount) % (LIMIT / 2) + 1;
        CampaignTypes.WorldAuthorization memory authorization = _authorization(seed, ALICE);
        bytes memory signature = _sign(campaign, authorization);
        _fund(value, authorization);
        vm.expectRevert(abi.encodeWithSelector(CampaignTypes.WorldAuthorizationUsed.selector));
        vm.prank(ALICE);
        campaign.contributeWithAuthorization(value, authorization, signature);
        _expectUnsigned(value);
        require(campaign.humanContribution(authorization.scopedNullifierHash) == value, "double consumed");
        require(campaign.raised() == value, "replayed principal");
    }

    function testFuzz_WorldCrossChain(uint64 otherChain, bytes32 seed) external {
        CampaignTypes.WorldAuthorization memory authorization = _authorization(seed, ALICE);
        bytes memory signature = _sign(campaign, authorization);
        uint256 chain = uint256(otherChain);
        if (chain == CampaignTypes.ARC_TESTNET_CHAIN_ID) ++chain;
        vm.chainId(chain);
        vm.expectRevert(abi.encodeWithSelector(CampaignTypes.InvalidWorldAuthorization.selector));
        vm.prank(ALICE);
        campaign.contributeWithAuthorization(1, authorization, signature);
        _expectUnsigned(1);
        require(campaign.raised() == 0, "cross-chain credit");
    }

    function testFuzz_WorldCrossCampaign(bytes32 seed) external {
        CampaignTypes.WorldAuthorization memory authorization = _authorization(seed, ALICE);
        bytes memory signature = _sign(campaign, authorization);
        Campaign second = _create();
        _prepare(second, ALICE);
        vm.expectRevert(abi.encodeWithSelector(CampaignTypes.InvalidWorldAuthorization.selector));
        vm.prank(ALICE);
        second.contributeWithAuthorization(1, authorization, signature);
        authorization.campaign = address(second);
        vm.expectRevert(abi.encodeWithSelector(CampaignTypes.InvalidWorldAuthorization.selector));
        vm.prank(ALICE);
        second.contributeWithAuthorization(1, authorization, signature);
        vm.expectRevert(abi.encodeWithSelector(CampaignTypes.WorldAuthorizationRequired.selector));
        vm.prank(ALICE);
        second.contribute(1);
        require(second.raised() == 0, "cross-campaign credit");
    }

    function testFuzz_WorldWalletSubstitution(bytes32 seed) external {
        CampaignTypes.WorldAuthorization memory authorization = _authorization(seed, ALICE);
        bytes memory signature = _sign(campaign, authorization);
        vm.expectRevert(abi.encodeWithSelector(CampaignTypes.InvalidWorldAuthorization.selector));
        vm.prank(BOB);
        campaign.contributeWithAuthorization(1, authorization, signature);
        authorization.wallet = BOB;
        vm.expectRevert(abi.encodeWithSelector(CampaignTypes.InvalidWorldAuthorization.selector));
        vm.prank(BOB);
        campaign.contributeWithAuthorization(1, authorization, signature);
        _expectUnsigned(1);
        require(campaign.raised() == 0, "wallet substitution credit");
    }

    function testFuzz_WorldSameHumanSecondWallet(uint96 amount, bytes32 seed) external {
        uint256 value = uint256(amount) % (LIMIT / 2) + 1;
        CampaignTypes.WorldAuthorization memory authorization = _authorization(seed, ALICE);
        _fund(value, authorization);
        authorization.wallet = BOB;
        authorization.nonce = keccak256(abi.encode("second wallet", seed));
        bytes memory signature = _sign(campaign, authorization);
        vm.expectRevert(abi.encodeWithSelector(CampaignTypes.WorldNullifierOwned.selector));
        vm.prank(BOB);
        campaign.contributeWithAuthorization(1, authorization, signature);
        vm.expectRevert(abi.encodeWithSelector(CampaignTypes.WorldAuthorizationRequired.selector));
        vm.prank(BOB);
        campaign.contribute(1);
        require(campaign.contribution(BOB) == 0, "second wallet credited");
        require(campaign.nullifierOwner(authorization.scopedNullifierHash) == ALICE, "owner replaced");
    }

    function testFuzz_WorldCapIsCumulativeAcrossFreshPermissions(uint96 amount, bytes32 seed) external {
        uint256 first = uint256(amount) % (LIMIT - 1) + 1;
        CampaignTypes.WorldAuthorization memory authorization = _authorization(seed, ALICE);
        _fund(first, authorization);
        authorization.nonce = keccak256(abi.encode("retry", seed));
        bytes32 digest = campaign.worldAuthorizationDigest(authorization);
        bytes memory signature = _sign(campaign, authorization);
        vm.expectRevert(abi.encodeWithSelector(CampaignTypes.PerHumanLimitExceeded.selector));
        vm.prank(ALICE);
        campaign.contributeWithAuthorization(LIMIT - first + 1, authorization, signature);
        require(!campaign.usedWorldAuthorizations(digest), "failed cap consumed digest");
        _fund(LIMIT - first, authorization);
        require(campaign.humanContribution(authorization.scopedNullifierHash) == LIMIT, "cumulative cap mismatch");
        require(campaign.raised() == LIMIT, "principal mismatch");
    }

    function test_WorldFailedTransferRollsBackPermissionAndBinding() external {
        CampaignTypes.WorldAuthorization memory authorization = _authorization(bytes32(uint256(1)), ALICE);
        bytes32 digest = campaign.worldAuthorizationDigest(authorization);
        bytes memory signature = _sign(campaign, authorization);
        MockUSDC failing = new MockUSDC(1);
        vm.etch(CampaignTypes.ARC_TESTNET_USDC, address(failing).code);
        vm.expectRevert(abi.encodeWithSignature("Error(string)", "MockUSDC: transfer failed"));
        vm.prank(ALICE);
        campaign.contributeWithAuthorization(1, authorization, signature);
        require(!campaign.usedWorldAuthorizations(digest), "transfer consumed permission");
        require(campaign.nullifierOwner(authorization.scopedNullifierHash) == address(0), "transfer bound owner");
        require(campaign.humanContribution(authorization.scopedNullifierHash) == 0, "transfer counted cap");
        require(campaign.raised() == 0, "transfer credited principal");
    }

    function test_WorldRefundDoesNotResetHumanCap() external {
        CampaignTypes.WorldAuthorization memory authorization = _authorization(bytes32(uint256(1)), ALICE);
        _fund(LIMIT, authorization);
        vm.warp(terms.fundingDeadline);
        campaign.expire();
        vm.prank(ALICE);
        campaign.claimFundingRefund();
        require(campaign.contribution(ALICE) == 0, "refund not paid");
        require(campaign.humanContribution(authorization.scopedNullifierHash) == LIMIT, "refund reopened cap");
    }

    function test_WorldSignerConfigurationIsRestrictedAndPermanent() external {
        CampaignFactory fresh = new CampaignFactory();
        vm.prank(CREATOR);
        vm.expectRevert(abi.encodeWithSelector(CampaignTypes.WorldVerifierAdminOnly.selector));
        fresh.configureWorldVerifierSigner(BOB);
        vm.expectRevert(abi.encodeWithSelector(CampaignTypes.WorldVerifierRequired.selector));
        fresh.configureWorldVerifierSigner(address(0));
        vm.expectRevert(abi.encodeWithSelector(CampaignTypes.WorldVerifierRequired.selector));
        vm.prank(CREATOR);
        fresh.createCampaign(terms);
        fresh.configureWorldVerifierSigner(BOB);
        vm.expectRevert(abi.encodeWithSelector(CampaignTypes.WorldVerifierAlreadyConfigured.selector));
        fresh.configureWorldVerifierSigner(ALICE);
        require(campaign.worldVerifierSigner() == vm.addr(SIGNER_KEY), "existing signer changed");
    }

    /// @dev Public TypeScript fixture from docs/world/authorization-vector.json, evaluated by the actual campaign digest code.
    function test_WorldTypeScriptVectorMatchesSolidity() external {
        address fixtureCampaign = 0x2222222222222222222222222222222222222222;
        vm.etch(fixtureCampaign, address(campaign).code);
        CampaignTypes.WorldAuthorization memory authorization = CampaignTypes.WorldAuthorization({
            wallet: 0x3333333333333333333333333333333333333333, campaign: fixtureCampaign,
            scopedNullifierHash: 0x4444444444444444444444444444444444444444444444444444444444444444,
            nonce: 0x5555555555555555555555555555555555555555555555555555555555555555,
            deadline: 2_000_000_000
        });
        bytes32 digest = Campaign(fixtureCampaign).worldAuthorizationDigest(authorization);
        require(digest == 0x36285ed4ff461622809e869cd24c178deabc440295357ebe625c5d1200316d5c, "TS digest mismatch");
        bytes memory signature = hex"095fd19ddfe36e032cb6f815a835c7bed66e67c2f0e3f66d76838a89bcf21af834d41e5890fe61afb7ce60d282a260cc06e3bcef597fcef201833d5186bbd5d51c";
        require(ECDSA.recover(digest, signature) == 0x19E7E376E7C213B7E7e7e46cc70A5dD086DAff2A, "TS signer mismatch");
    }
}
