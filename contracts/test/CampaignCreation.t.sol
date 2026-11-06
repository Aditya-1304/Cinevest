// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import { Campaign } from "../src/Campaign.sol";
import { CampaignFactory } from "../src/CampaignFactory.sol";
import { CampaignTypes } from "../src/CampaignTypes.sol";

/// @notice Minimal cheatcode surface for the focused campaign tests; the repo carries no forge-std dependency.
interface Cheats {
    function prank(address) external;
    function chainId(uint256) external;
    function getNonce(address) external view returns (uint64);
    function computeCreateAddress(address, uint256) external pure returns (address);
    function expectRevert(bytes calldata) external;
    function expectEmit(bool, bool, bool, bool, address) external;
}

Cheats constant vm = Cheats(0x7109709ECfa91a80626fF3989D68f67F5b1DD12D);

/// @notice Focused P1.3/P1.4 checks: fresh stage/terms, canonical creation event, and term validation at the boundary.
contract CampaignCreationTest {
    event CampaignCreated(address indexed creator, address indexed campaign);

    uint256 internal constant LOCAL_CHAIN_ID = 31_337;

    address internal constant CREATOR = address(0xa11c);
    address internal constant REVIEWER = address(0xb0b0);

    CampaignFactory internal factory;
    CampaignTypes.CampaignTerms internal terms;

    function setUp() external {
        vm.chainId(CampaignTypes.ARC_TESTNET_CHAIN_ID);
        factory = new CampaignFactory();
        factory.configureWorldVerifierSigner(address(0x1234));
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

    function test_FreshCampaignReportsFundingAndFullTerms() external {
        vm.prank(CREATOR);
        address campaignAddress = factory.createCampaign(terms);
        Campaign campaign = Campaign(campaignAddress);
        require(campaign.getStage() == CampaignTypes.Stage.Funding, "wrong fresh stage");
        require(
            keccak256(abi.encode(campaign.getTerms())) == keccak256(abi.encode(terms)),
            "terms mismatch"
        );
    }

    function test_CreateCampaignEmitsCanonicalCreationEvent() external {
        address expected = vm.computeCreateAddress(address(factory), vm.getNonce(address(factory)));
        vm.expectEmit(true, true, false, true, address(factory));
        emit CampaignCreated(CREATOR, expected);
        vm.prank(CREATOR);
        address campaign = factory.createCampaign(terms);
        require(campaign == expected, "campaign address mismatch");
        require(Campaign(campaign).getTerms().creator == CREATOR, "creator mismatch");
    }

    function test_CreateCampaignRejectsUnsupportedToken() external {
        CampaignTypes.CampaignTerms memory bad = terms;
        bad.usdc = address(1);
        vm.expectRevert(abi.encodeWithSelector(CampaignTypes.TokenUnsupported.selector));
        vm.prank(CREATOR);
        factory.createCampaign(bad);
    }

    function test_CreateCampaignRejectsMissingCreator() external {
        CampaignTypes.CampaignTerms memory bad = terms;
        bad.creator = address(0);
        vm.expectRevert(abi.encodeWithSelector(CampaignTypes.CreatorRequired.selector));
        vm.prank(CREATOR);
        factory.createCampaign(bad);
    }

    function test_FactoryDeploymentRequiresArcTestnet() external {
        vm.chainId(LOCAL_CHAIN_ID);
        vm.expectRevert(
            abi.encodeWithSelector(CampaignTypes.UnsupportedChain.selector, LOCAL_CHAIN_ID)
        );
        new CampaignFactory();
    }
}
