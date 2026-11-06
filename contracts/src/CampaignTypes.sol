// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @notice Shared immutable terms and lifecycle labels used by the factory and per-film campaigns.
/// @dev Keep this tuple aligned with `packages/abi/src/campaign.ts`; frontend reads depend on it.
library CampaignTypes {
    /// @notice Basis points denominator for all share and cap arithmetic.
    uint16 internal constant BPS = 10_000;

    /// @notice The only chain campaigns may settle value on.
    uint256 internal constant ARC_TESTNET_CHAIN_ID = 5_042_002;

    /// @notice Fixed Arc USDC ERC-20 predeploy (six-decimal interface of native USDC gas).
    address internal constant ARC_TESTNET_USDC = 0x3600000000000000000000000000000000000000;

    error UnsupportedChain(uint256 code);
    error CreatorRequired();
    error ReviewerRequired();
    error ReviewerIndependent();
    error TokenUnsupported();
    error GoalRequired();
    error WatchPriceRequired();
    error FunderShareTooHigh();
    error RepaymentCapRequired();
    error FundingDeadlineTooSoon();
    error ProductionDeadlineTooSoon();
    error RightsDurationRequired();
    error TrancheIndexOutOfBounds(uint256 index);
    error ZeroContribution();
    error FundingStageEnded();
    error FundingDeadlinePassed();
    error ContributionOverRemaining(uint256 requested, uint256 remaining);
    error WorldGateUnenforced();
    error FundingGoalNotReached(uint256 raised, uint256 goal);
    error FundingGoalReached();
    error FundingDeadlineNotReached(uint256 deadline);
    error ProductionDeadlineNotReached(uint256 deadline);
    error RefundStageRequired();
    error NothingToRefund();
    error PlaybackReferenceRequired();
    error FinalApprovalRequired();
    error ReleasedStageRequired();
    error AccessAlreadyPurchased();
    error CreatorOnly();
    error ReviewerOnly();
    error ProductionStageRequired();
    error MilestoneNotOpen(uint256 index);
    error EvidenceReferenceRequired();
    error EvidenceLocked(uint256 index);
    error EvidenceRequired(uint256 index);
    error EvidenceHashMismatch(uint256 index, bytes32 expected, bytes32 actual);
    error TrancheAlreadyApproved(uint256 index);
    error NothingToClaim();
    error RevenueAllocationExceeded();
    error NotAContributor();
    error DisputeAlreadyPending(uint256 index);
    error DisputeNotPending(uint256 index);
    error DisputePending(uint256 index);
    error EvidenceRejected(uint256 index);

    /// @notice Reverts unless the deployment chain is the configured Arc Testnet.
    function ensureArcTestnet() internal view {
        if (block.chainid != ARC_TESTNET_CHAIN_ID) revert UnsupportedChain(block.chainid);
    }

    /// @notice Reverts on terms that could create an unfundable or self-dealing campaign.
    function validateTerms(CampaignTerms memory terms) internal view {
        if (terms.creator == address(0)) revert CreatorRequired();
        if (terms.reviewer == address(0)) revert ReviewerRequired();
        if (terms.reviewer == terms.creator) revert ReviewerIndependent();
        if (terms.usdc != ARC_TESTNET_USDC) revert TokenUnsupported();
        if (terms.fundingGoal == 0) revert GoalRequired();
        if (terms.watchPrice == 0) revert WatchPriceRequired();
        if (terms.funderBps > BPS) revert FunderShareTooHigh();
        if (terms.repaymentCapBps == 0) revert RepaymentCapRequired();
        if (terms.fundingDeadline <= block.timestamp) revert FundingDeadlineTooSoon();
        if (terms.productionDeadline <= terms.fundingDeadline) revert ProductionDeadlineTooSoon();
        if (terms.rightsDuration == 0) revert RightsDurationRequired();
    }

    /// @notice Lifecycle states that gate contributions, escrow claims, release, and viewing.
    enum Stage {
        Funding,
        Refundable,
        Production,
        Released,
        CancelledProduction
    }

    /// @notice Review result for the latest challenge tied to a milestone evidence reference.
    enum DisputeStatus {
        None,
        Pending,
        Approved,
        Rejected
    }

    /// @notice Immutable funding, production, viewing, and revenue-sharing configuration.
    /// @dev All monetary values are ERC-20 USDC base units with six decimals.
    struct CampaignTerms {
        address creator;
        address reviewer;
        address usdc;
        uint256 fundingGoal;
        uint64 fundingDeadline;
        uint64 productionDeadline;
        uint64 rightsDuration;
        uint256 watchPrice;
        uint16 funderBps;
        uint16 repaymentCapBps;
        bytes32 pitchReference;
        bool worldGated;
        uint256 perHumanLimit;
    }
}
