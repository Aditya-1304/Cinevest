// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import { Campaign } from "./Campaign.sol";
import { CampaignTypes } from "./CampaignTypes.sol";

/// @notice Campaign deployment entry point; term validation and the chain/token fixture are pinned here.
/// @dev The registry is the only trusted source for whether an address is a real campaign.
contract CampaignFactory {
    /// @notice Reverts when a registry index has no campaign behind it.
    error CampaignIndexOutOfBounds(uint256 index);

    /// @notice Canonical creation event; the campaign and creator identify the film for web, chain, and registry reads.
    event CampaignCreated(address indexed creator, address indexed campaign);

    /// @notice The only token campaigns created through this factory may settle in.
    address public immutable USDC;

    /// @notice Deployment administrator may configure a separate verifier key exactly once.
    address public immutable worldVerifierAdmin;
    address public worldVerifierSigner;
    event WorldVerifierConfigured(address indexed signer);

    mapping(address campaign => bool registered) private _isCampaign;
    address[] private _campaigns;

    constructor() {
        CampaignTypes.ensureArcTestnet();
        USDC = CampaignTypes.ARC_TESTNET_USDC;
        worldVerifierAdmin = msg.sender;
    }

    /// @notice Pins the backend attestation key before gated campaigns can be created.
    /// @dev Existing campaigns retain their captured signer; no creator-controlled signer override exists.
    function configureWorldVerifierSigner(address signer) external {
        if (msg.sender != worldVerifierAdmin) revert CampaignTypes.WorldVerifierAdminOnly();
        if (worldVerifierSigner != address(0)) revert CampaignTypes.WorldVerifierAlreadyConfigured();
        if (signer == address(0) || signer == worldVerifierAdmin) revert CampaignTypes.WorldVerifierRequired();
        worldVerifierSigner = signer;
        emit WorldVerifierConfigured(signer);
    }

    /// @notice Deploys a campaign with validated immutable terms; invalid terms revert here at the creation boundary.
    function createCampaign(CampaignTypes.CampaignTerms calldata terms)
        external
        returns (address campaign)
    {
        if (terms.creator == address(0)) revert CampaignTypes.CreatorRequired();
        if (msg.sender != terms.creator) revert CampaignTypes.CreatorOnly();
        campaign = address(new Campaign(terms, terms.worldGated ? worldVerifierSigner : address(0)));
        _isCampaign[campaign] = true;
        _campaigns.push(campaign);
        emit CampaignCreated(terms.creator, campaign);
    }

    /// @notice Confirms that an address was created by this factory; unknown addresses report false.
    function isCampaign(address campaign) external view returns (bool) {
        return _isCampaign[campaign];
    }

    /// @notice Returns the campaign at a stable, zero-based deployment index.
    function campaignAt(uint256 index) external view returns (address) {
        if (index >= _campaigns.length) revert CampaignIndexOutOfBounds(index);
        return _campaigns[index];
    }

    /// @notice Returns how many campaigns this factory has deployed.
    function campaignCount() external view returns (uint256) {
        return _campaigns.length;
    }
}
