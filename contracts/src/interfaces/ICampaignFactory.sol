// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import { CampaignTypes } from "../CampaignTypes.sol";

/// @notice Factory interface that provides the canonical campaign registry for all app routes.
/// @dev Sensitive reads and writes should first confirm a campaign through `isCampaign`.
interface ICampaignFactory {
    /// @notice Creates a campaign with immutable terms and returns its deployed address.
    function createCampaign(CampaignTypes.CampaignTerms calldata terms) external returns (address);

    /// @notice Confirms that an address was created by this factory.
    function isCampaign(address campaign) external view returns (bool);

    /// @notice Returns the campaign at a stable, zero-based factory index.
    function campaignAt(uint256 index) external view returns (address);

    /// @notice Returns how many campaigns this factory has deployed.
    function campaignCount() external view returns (uint256);
}
