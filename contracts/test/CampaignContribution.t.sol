// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import { Campaign } from "../src/Campaign.sol";
import { CampaignFactory } from "../src/CampaignFactory.sol";
import { CampaignTypes } from "../src/CampaignTypes.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @notice Minimal cheatcode surface for the focused phase-2 tests; the repo carries no forge-std dependency.
interface Cheats {
    function chainId(uint256) external;
    function prank(address) external;
    function warp(uint256) external;
    function etch(address, bytes calldata) external;
    function expectRevert(bytes calldata) external;
    function expectEmit(bool, bool, bool, bool, address) external;
}

Cheats constant vm = Cheats(0x7109709ECfa91a80626fF3989D68f67F5b1DD12D);

/// @notice Fixed-address USDC stand-in; `failMode` bakes transfer behavior into the etched code.
/// @dev 0 = ok, 1 = transferFrom reverts, 2 = transferFrom returns false. Storage survives re-etching.
contract MockUSDC {
    uint8 internal immutable failMode;

    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    constructor(uint8 mode) {
        failMode = mode;
    }

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
    }

    function approve(address spender, uint256 amount) external {
        allowance[msg.sender][spender] = amount;
    }

    function transferFrom(address from, address to, uint256 amount) public virtual returns (bool) {
        if (failMode == 1) revert("MockUSDC: transfer failed");
        uint256 allowed = allowance[from][msg.sender];
        require(allowed >= amount, "MockUSDC: allowance");
        allowance[from][msg.sender] = allowed - amount;
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        return failMode != 2;
    }

    function transfer(address to, uint256 amount) public virtual returns (bool) {
        if (failMode == 1) revert("MockUSDC: transfer failed");
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        return failMode != 2;
    }
}

/// @notice Focused P2.1/P2.2 checks: exact goal, over-goal rejection, multi-wallet units, failed-pull rollback.
contract CampaignContributionTest {
    event ContributionReceived(address indexed backer, uint256 amount, uint256 totalRaised);
    address internal constant CREATOR = address(0xa11c);
    address internal constant REVIEWER = address(0xb0b0);
    address internal constant ALICE = address(0xaaa1);
    address internal constant BOB = address(0xbbb2);
    address internal constant CAROL = address(0xccc3);

    uint256 internal constant GOAL = 1_000e6;
    uint8 internal constant OK = 0;
    uint8 internal constant REVERTS = 1;
    uint8 internal constant FALSE_RETURN = 2;

    CampaignFactory internal factory;
    Campaign internal campaign;
    CampaignTypes.CampaignTerms internal terms;

    function setUp() external {
        vm.chainId(CampaignTypes.ARC_TESTNET_CHAIN_ID);
        _etchUsdc(OK);
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

    function _etchUsdc(uint8 failMode) internal {
        MockUSDC mock = new MockUSDC(failMode);
        vm.etch(CampaignTypes.ARC_TESTNET_USDC, address(mock).code);
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

    function test_ContributeAcceptsExactGoalAndStopsFunding() external {
        _fund(ALICE, GOAL);
        require(campaign.raised() == GOAL, "raised mismatch");
        require(campaign.contribution(ALICE) == GOAL, "units mismatch");
        require(
            MockUSDC(CampaignTypes.ARC_TESTNET_USDC).balanceOf(address(campaign)) == GOAL,
            "escrow balance mismatch"
        );
        vm.expectRevert(
            abi.encodeWithSelector(CampaignTypes.ContributionOverRemaining.selector, 1, 0)
        );
        vm.prank(BOB);
        campaign.contribute(1);
    }

    function test_ContributeRevertsOverRemainingGoal() external {
        _prepare(BOB, 400_000_001);
        _fund(ALICE, 600e6);
        vm.expectRevert(
            abi.encodeWithSelector(
                CampaignTypes.ContributionOverRemaining.selector, 400_000_001, 400_000_000
            )
        );
        vm.prank(BOB);
        campaign.contribute(400_000_001);
        require(campaign.raised() == 600e6, "overdraft polluted raised");
        require(campaign.contribution(BOB) == 0, "overdraft credited units");
    }

    function test_RepeatedMultiWalletContributionsMatchTransferredPrincipal() external {
        _prepare(ALICE, 499e6);
        _prepare(BOB, 1e6);
        _prepare(CAROL, 500e6);
        vm.expectEmit(true, false, false, true, address(campaign));
        emit ContributionReceived(ALICE, 300e6, 300e6);
        vm.prank(ALICE);
        campaign.contribute(300e6);
        vm.prank(BOB);
        campaign.contribute(1e6);
        vm.expectEmit(true, false, false, true, address(campaign));
        emit ContributionReceived(ALICE, 199e6, 500e6);
        vm.prank(ALICE);
        campaign.contribute(199e6);
        vm.prank(CAROL);
        campaign.contribute(500e6);
        require(campaign.raised() == GOAL, "total raised mismatch");
        require(campaign.contribution(ALICE) == 499e6, "alice units mismatch");
        require(campaign.contribution(BOB) == 1e6, "bob units mismatch");
        require(campaign.contribution(CAROL) == 500e6, "carol units mismatch");
        require(
            MockUSDC(CampaignTypes.ARC_TESTNET_USDC).balanceOf(address(campaign)) == GOAL,
            "recorded principal diverges from token"
        );
    }

    function test_RevertingTransferRollsBackAccounting() external {
        _prepare(ALICE, GOAL);
        _etchUsdc(REVERTS);
        vm.expectRevert(bytes("MockUSDC: transfer failed"));
        vm.prank(ALICE);
        campaign.contribute(GOAL);
        require(campaign.raised() == 0, "raise pollution after failed pull");
        require(campaign.contribution(ALICE) == 0, "unit pollution after failed pull");
        require(
            MockUSDC(CampaignTypes.ARC_TESTNET_USDC).balanceOf(address(campaign)) == 0,
            "token pollution after failed pull"
        );
    }

    function test_FalseReturnTransferRollsBackAccounting() external {
        _prepare(ALICE, GOAL);
        _etchUsdc(FALSE_RETURN);
        vm.expectRevert(
            abi.encodeWithSelector(
                SafeERC20.SafeERC20FailedOperation.selector, CampaignTypes.ARC_TESTNET_USDC
            )
        );
        vm.prank(ALICE);
        campaign.contribute(GOAL);
        require(campaign.raised() == 0, "raise pollution after failed pull");
        require(campaign.contribution(ALICE) == 0, "unit pollution after failed pull");
        require(
            MockUSDC(CampaignTypes.ARC_TESTNET_USDC).balanceOf(ALICE) == GOAL,
            "fail-mode wallet lost principal"
        );
    }

    function test_ContributeRejectsZeroAmount() external {
        vm.expectRevert(abi.encodeWithSelector(CampaignTypes.ZeroContribution.selector));
        vm.prank(ALICE);
        campaign.contribute(0);
    }

    function test_LateContributionAfterDeadlineReverts() external {
        vm.warp(terms.fundingDeadline);
        _prepare(ALICE, 100e6);
        vm.expectRevert(abi.encodeWithSelector(CampaignTypes.FundingDeadlinePassed.selector));
        vm.prank(ALICE);
        campaign.contribute(100e6);
        require(campaign.raised() == 0, "late contribution accepted");
        require(campaign.contribution(ALICE) == 0, "late contribution credited units");
    }

    function test_WorldGatedCampaignRejectsPermissionlessContribution() external {
        terms.worldGated = true;
        vm.prank(CREATOR);
        Campaign gated = Campaign(factory.createCampaign(terms));
        MockUSDC(CampaignTypes.ARC_TESTNET_USDC).mint(ALICE, GOAL);
        vm.prank(ALICE);
        MockUSDC(CampaignTypes.ARC_TESTNET_USDC).approve(address(gated), GOAL);
        vm.expectRevert(abi.encodeWithSelector(CampaignTypes.WorldGateUnenforced.selector));
        vm.prank(ALICE);
        gated.contribute(GOAL);
        require(gated.raised() == 0, "gated campaign accepted funding");
        require(gated.contribution(ALICE) == 0, "gated campaign credited units");
    }
}
