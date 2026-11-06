// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import { Campaign } from "../src/Campaign.sol";
import { CampaignFactory } from "../src/CampaignFactory.sol";
import { CampaignTypes } from "../src/CampaignTypes.sol";

/// @notice Minimal cheatcode surface for the focused phase-1 tests; the repo carries no forge-std dependency.
interface Cheats {
    function chainId(uint256) external;
    function expectRevert(bytes calldata) external;
}

Cheats constant vm = Cheats(0x7109709ECfa91a80626fF3989D68f67F5b1DD12D);

/// @notice Focused P1.5/P1.6 checks: factory registry membership and indexing, exact tranche math.
contract RegistryAndTranchesTest {
    address internal constant CREATOR = address(0xa11c);
    address internal constant REVIEWER = address(0xb0b0);
    address internal constant UNKNOWN = address(0xfead);

    CampaignFactory internal factory;
    CampaignTypes.CampaignTerms internal terms;

    function setUp() external {
        vm.chainId(CampaignTypes.ARC_TESTNET_CHAIN_ID);
        factory = new CampaignFactory();
        terms = CampaignTypes.CampaignTerms({
            creator: CREATOR,
            reviewer: REVIEWER,
            usdc: CampaignTypes.ARC_TESTNET_USDC,
            fundingGoal: 1_000e6,
            fundingDeadline: uint64(12_000),
            productionDeadline: uint64(20_000),
            rightsDuration: uint64(10_000_000),
            watchPrice: 10e6,
            funderBps: 8_000,
            repaymentCapBps: 20_000,
            pitchReference: keccak256(bytes("pitch")),
            worldGated: true,
            perHumanLimit: 2
        });
    }

    function test_RegistryKnowsOnlyCreatedCampaigns() external {
        address first = factory.createCampaign(terms);
        address second = factory.createCampaign(terms);
        require(factory.isCampaign(first), "first campaign missing");
        require(factory.isCampaign(second), "second campaign missing");
        require(!factory.isCampaign(UNKNOWN), "unknown address accepted");
        require(factory.campaignCount() == 2, "count mismatch");
        require(factory.campaignAt(0) == first, "index 0 mismatch");
        require(factory.campaignAt(1) == second, "index 1 mismatch");
    }

    function test_CampaignAtRejectsOutOfRangeIndex() external {
        factory.createCampaign(terms);
        vm.expectRevert(
            abi.encodeWithSelector(CampaignFactory.CampaignIndexOutOfBounds.selector, 1)
        );
        factory.campaignAt(1);
    }

    function test_TrancheStepsAreFullQuartersForDivisibleGoal() external {
        Campaign campaign = Campaign(factory.createCampaign(terms));
        // 1_000e6 goal divides evenly: 40% / 30% / 30%.
        require(campaign.trancheAmount(0) == 400_000_000, "tranche 0 mismatch");
        require(campaign.trancheAmount(1) == 300_000_000, "tranche 1 mismatch");
        require(campaign.trancheAmount(2) == 300_000_000, "tranche 2 mismatch");
    }

    function test_TrancheSumIsExactForTinyGoal() external {
        terms.fundingGoal = 3;
        Campaign campaign = Campaign(factory.createCampaign(terms));
        uint256[3] memory tranches = campaign.trancheAmounts();
        // Floor rounding must not appear in or vanish from the sum: 1 + 1 + 1.
        require(tranches[0] == 1 && tranches[1] == 1 && tranches[2] == 1, "tiny split mismatch");
        require(tranches[0] + tranches[1] + tranches[2] == 3, "tiny sum mismatch");
    }

    function test_TrancheSumIsExactForNonDivisibleGoal() external {
        terms.fundingGoal = 101;
        Campaign campaign = Campaign(factory.createCampaign(terms));
        uint256[3] memory tranches = campaign.trancheAmounts();
        // 40 + 30 + 31 from floor(40F/100) and floor(70F/100) differences.
        require(tranches[0] == 40 && tranches[1] == 30 && tranches[2] == 31, "split mismatch");
        require(tranches[0] + tranches[1] + tranches[2] == 101, "sum mismatch");
    }

    function test_TrancheSumIsExactAtGoalOverflowBoundary() external {
        terms.fundingGoal = type(uint256).max;
        Campaign campaign = Campaign(factory.createCampaign(terms));
        uint256[3] memory tranches = campaign.trancheAmounts();
        // No reversion from percent multiplication; maximum goal stays fully allocated.
        require(tranches[0] == 2 * (type(uint256).max / 5), "boundary tranche 0 mismatch");
        require(
            tranches[0] + tranches[1] + tranches[2] == type(uint256).max, "boundary sum mismatch"
        );
    }

    function test_TrancheSumsExactlyForAnyAcceptedGoal(uint256 goal) external {
        if (goal == 0) return; // zero goals are rejected at creation, so nothing to check
        terms.fundingGoal = goal;
        Campaign campaign = Campaign(factory.createCampaign(terms));
        uint256[3] memory tranches = campaign.trancheAmounts();
        require(tranches[0] + tranches[1] + tranches[2] == goal, "fuzz sum mismatch");
        require(
            campaign.trancheAmount(0) == tranches[0] && campaign.trancheAmount(1) == tranches[1]
                && campaign.trancheAmount(2) == tranches[2],
            "per-index and tuple getters disagree"
        );
    }

    function test_TrancheGettersRejectInvalidIndex() external {
        Campaign campaign = Campaign(factory.createCampaign(terms));
        vm.expectRevert(abi.encodeWithSelector(CampaignTypes.TrancheIndexOutOfBounds.selector, 3));
        campaign.trancheAmount(3);
        vm.expectRevert(
            abi.encodeWithSelector(
                CampaignTypes.TrancheIndexOutOfBounds.selector, type(uint256).max
            )
        );
        campaign.trancheAmount(type(uint256).max);
    }
}
