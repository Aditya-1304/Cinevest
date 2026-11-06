// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import { CampaignTypes } from "../CampaignTypes.sol";

/// @notice Read interface shared by the web app and contracts for one film campaign.
/// @dev This interface exposes canonical state only; write methods are added with their guarded
///      implementations so no caller relies on an action before its accounting rules exist.
interface ICampaign {
    /// @notice Returns the campaign's immutable creator, token, deadlines, price, and payout terms.
    function getTerms() external view returns (CampaignTypes.CampaignTerms memory);

    /// @notice Returns the current funding and production lifecycle stage.
    /// @notice Purchases released-film access once per wallet and credits viewing revenue.
    function buyAccess() external;
    function depositViewing(uint256 amount) external;
    function settleViewing(CampaignTypes.ViewingReceipt calldata receipt, bytes calldata signature) external;
    function settleAndWithdrawViewing(CampaignTypes.ViewingReceipt calldata receipt, bytes calldata signature) external;
    function requestViewingExit() external;
    function withdrawViewing() external;
    function viewingEscrow() external view returns (uint256);
    function meterSigner() external view returns (address);
    function hasAccess(address wallet) external view returns (bool);
    function hasPaidAccess(address wallet) external view returns (bool);
    function funderAllocated() external view returns (uint256);
    function creatorAllocated() external view returns (uint256);
    function funderClaimed() external view returns (uint256);
    function creatorClaimed() external view returns (uint256);
    function funderClaimedBy(address wallet) external view returns (uint256);
    function claimFunderRevenue() external;
    function claimCreatorRevenue() external;
    function accRewardPerUnit() external view returns (uint256);
    function scaledRemainder() external view returns (uint256);

    function configureRelease(bytes32 playbackIdHash) external;
    function publishFilm() external;
    function releasedAt() external view returns (uint256);
    function livepeerPlaybackIdHash() external view returns (bytes32);

    function getStage() external view returns (CampaignTypes.Stage);

    /// @notice Contributes USDC principal while funding is open; World-gated campaigns require authorization.
    function contribute(uint256 amount) external;

    /// @notice Gated funding consumes a wallet-bound EIP-712 permission and applies the cumulative human cap.
    function contributeWithAuthorization(uint256 amount, CampaignTypes.WorldAuthorization calldata authorization, bytes calldata signature) external;
    function worldAuthorizationDigest(CampaignTypes.WorldAuthorization calldata authorization) external view returns (bytes32);
    function worldVerifierSigner() external view returns (address);
    function usedWorldAuthorizations(bytes32 digest) external view returns (bool);
    function nullifierOwner(bytes32 nullifierHash) external view returns (address);
    function humanContribution(bytes32 nullifierHash) external view returns (uint256);

    /// @notice Extension state for campaigns whose World gate opens after a fixed number of humans.
    function publicFundingOpen() external view returns (bool);
    function verifiedFirstRoundTarget() external view returns (uint256);
    function verifiedHumanCount() external view returns (uint256);

    /// @notice Reviewer approval commits to independently reviewed offchain sponsor conditions.
    function approveSponsor(bytes32 approvalId, address sponsor, uint256 amount, bytes32 conditionsHash, bool approved) external;

    /// @notice Pulls approved sponsor USDC into the same waterfall as paid viewing without granting access.
    function depositSponsor(bytes32 approvalId, uint256 amount, bytes32 conditionsHash) external;

    /// @notice Moves a goal-reached campaign to Production; callable by anyone.
    function finalize() external;

    /// @notice Moves a below-target campaign to Refundable once the funding deadline has passed.
    function expire() external;

    /// @notice Returns failed-funding principal or the wallet's share of cancelled production escrow.
    function claimFundingRefund() external;
    /// @notice Claims only the contributor's share of the fixed unspent cancellation pool.
    function claimCancelledEscrow() external;

    /// @notice Cancels production after the immutable deadline and opens remaining escrow to pro-rata claims.
    function cancelProduction() external;

    /// @notice Records evidence before approval or replaces it after an upheld dispute.
    function submitEvidence(uint8 index, bytes32 swarmRef) external;

    /// @notice Approves a milestone only if its evidence still matches the reviewer's inspected hash.
    function approveStage(uint8 index, bytes32 expectedEvidenceHash) external;

    /// @notice Pays the currently eligible cumulative tranche amount not already withdrawn.
    function claimApprovedTranche() external;

    /// @notice Opens a challenge against the current milestone evidence for an original contributor.
    function disputeStage(uint8 index, bytes32 expectedEvidenceHash) external;

    /// @notice Resolves a pending challenge against the exact evidence reference reviewed.
    function resolveStage(uint8 index, bytes32 expectedEvidenceHash, bool disputeApproved) external;

    /// @notice Returns the cumulative amount ever approved, including approvals later challenged.
    function approvedTrancheAmount() external view returns (uint256);

    /// @notice Returns the cumulative amount currently eligible for creator withdrawal.
    function withdrawableTrancheAmount() external view returns (uint256);

    /// @notice Returns the cumulative tranche amount already paid to the creator.
    function paidTrancheAmount() external view returns (uint256);

    /// @notice Returns the recorded evidence reference for one milestone.
    function evidenceReference(uint256 index) external view returns (bytes32);

    /// @notice Returns the latest dispute status for a milestone.
    function disputeStatus(uint256 index) external view returns (CampaignTypes.DisputeStatus);

    /// @notice Returns the evidence reference challenged by the latest dispute.
    function disputedEvidenceReference(uint256 index) external view returns (bytes32);

    /// @notice Indicates whether the current evidence was rejected by an upheld dispute.
    function isEvidenceRejected(uint256 index) external view returns (bool);

    /// @notice Returns the accepted cumulative funding principal.
    function raised() external view returns (uint256);

    /// @notice Returns the principal already refunded to failed-campaign backers.
    function refundsPaid() external view returns (uint256);

    /// @notice Returns one wallet's claim units, equal to the principal it transferred in.
    function contribution(address wallet) external view returns (uint256);

    /// @notice Returns one milestone tranche of the funding goal from the cumulative 40/70/100 release math.
    function trancheAmount(uint256 index) external view returns (uint256);

    /// @notice Returns all milestone tranches; they always sum exactly to the funding goal.
    function trancheAmounts() external view returns (uint256[3] memory);

    /// @notice Indicates whether the capped, release-relative backer revenue right has matured.
    function isRevenueRightMature() external view returns (bool);

    /// @notice Returns currently accrued but unclaimed eligible receipts for one funder.
    function claimableFunder(address wallet) external view returns (uint256);

    /// @notice Returns unpaid escrow liabilities tracked by the campaign.
    function escrowLiability() external view returns (uint256);

    /// @notice Returns total USDC reserved for funders, creator claims, and escrow liabilities.
    function reservedUSDC() external view returns (uint256);
}

/// @notice Canonical lifecycle events of one film campaign; this frozen ABI is what the web app reads.
/// @dev Actions implemented in later slices emit these signatures exactly; do not reshape them per phase.
interface ICampaignEvents {
    /// @notice Distinguishes principal and revenue payouts while preserving the legacy ClaimPaid event.
    enum PayoutKind { FundingRefund, ProductionTranche, FunderRevenue, CreatorRevenue, CancelledEscrow }
    event PayoutPaid(address indexed claimant, PayoutKind indexed kind, uint256 amount);
    /// @notice Commits the configured playback identifier; availability is checked offchain before review.
    event ReleaseConfigured(bytes32 indexed playbackIdHash);
    event FilmReleased(bytes32 indexed playbackIdHash, uint256 releasedAt);

    /// @notice Accepted contribution while funding; `totalRaised` is the campaign's cumulative principal.
    event ContributionReceived(address indexed backer, uint256 amount, uint256 totalRaised);

    /// @notice Every lifecycle transition, including finalization, expiry, release and cancellation.
    event StageChanged(CampaignTypes.Stage stage);

    /// @notice Creator evidence reference; replacements are allowed before approval or after an upheld dispute.
    event EvidenceSubmitted(uint8 indexed milestoneIndex, bytes32 evidenceReference);

    /// @notice Contributor challenge tied to the exact evidence reference under dispute.
    event StageDisputed(
        uint8 indexed milestoneIndex, address indexed backer, bytes32 evidenceReference
    );

    /// @notice Reviewer outcome for a challenge; approved means the challenge was upheld.
    event DisputeResolved(
        uint8 indexed milestoneIndex, bytes32 evidenceReference, bool disputeApproved
    );

    /// @notice Paid access purchase on a released campaign; `price` is charged in USDC base units.
    event WatchPurchased(address indexed viewer, uint256 price);

    /// @notice Per-purchase revenue split credited to the funder pool and creator before any claim.
    event RevenueCredited(uint256 funderAmount, uint256 creatorAmount);

    /// @notice One-time payout of owed funds: funding refund, approved tranche, revenue share, or cancelled escrow.
    event ClaimPaid(address indexed claimant, uint256 amount);

    /// @notice World verification binds a campaign-scoped human nullifier to its first funding wallet.
    event ProofVerified(bytes32 indexed nullifierHash, address indexed wallet);

    /// @notice Reviewer cancellation of unreleased production; `remainingEscrow` becomes pro-rata refundable.
    event ProductionCancelled(uint256 remainingEscrow);
}
