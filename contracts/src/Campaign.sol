// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import { Math } from "@openzeppelin/contracts/utils/math/Math.sol";
import { CampaignTypes } from "./CampaignTypes.sol";
import { ICampaignEvents } from "./interfaces/ICampaign.sol";

/// @notice Per-film campaign exposing immutable terms and the lifecycle stage.
/// @dev Terms are written once at construction; funding, escrow, and viewing actions are added by their own slices.
contract Campaign is ICampaignEvents, ReentrancyGuard {
    /// @dev Milestone release schedule is fixed at three cumulative 40/70/100 percent steps of the goal.
    uint256 private constant MAX_TRANCHE_INDEX = 2;

    CampaignTypes.CampaignTerms private _terms;
    CampaignTypes.Stage private _stage;

    /// @dev Accepted principal and per-wallet claim units; units equal principal; raised never exceeds the goal.
    uint256 private _raised;
    mapping(address wallet => uint256 units) private _units;
    uint256 private _refundsPaid;

    /// @dev Historical approvals form a prefix and never decrease after a later challenge.
    uint8 private _approvedTrancheCount;
    mapping(uint256 index => bytes32 evidenceRef) private _evidence;
    mapping(uint256 index => bytes32 evidenceRef) private _approvedEvidence;
    mapping(uint256 index => mapping(bytes32 evidenceRef => bool rejected)) private
        _rejectedEvidence;
    uint256 private _paidTrancheAmount;
    /// @dev Fixed unspent-principal snapshot; claims never reduce the pro-rata numerator.
    uint256 private _cancellationRefundPool;
    mapping(uint256 index => CampaignTypes.DisputeStatus status) private _disputeStatus;
    mapping(uint256 index => bytes32 evidenceRef) private _disputedEvidence;

    uint256 public constant Q = 1e27;
    mapping(address wallet => bool paid) public hasAccess;
    uint256 public funderAllocated;
    uint256 public creatorAllocated;
    uint256 public funderClaimed;
    uint256 public creatorClaimed;
    mapping(address wallet => uint256 paid) public funderClaimedBy;
    /// @dev Shared index and carried remainder distribute receipts without iterating over contributors.
    uint256 public accRewardPerUnit;
    uint256 public scaledRemainder;

    uint256 public releasedAt;
    bytes32 public livepeerPlaybackIdHash;

    constructor(CampaignTypes.CampaignTerms memory terms) {
        CampaignTypes.validateTerms(terms);
        _terms = terms;
        _stage = CampaignTypes.Stage.Funding;
    }

    /// @notice Accepts a USDC principal contribution while funding is open and below the goal.
    /// @dev Checks, then records state, then pulls USDC, so a failed pull leaves no accounting behind.
    ///      World-gated campaigns stay fail-closed until the Phase 9 attestation verifier exists; there is
    ///      deliberately no permissionless path through the gate.
    function contribute(uint256 amount) external nonReentrant {
        if (amount == 0) revert CampaignTypes.ZeroContribution();
        if (_stage != CampaignTypes.Stage.Funding) revert CampaignTypes.FundingStageEnded();
        if (block.timestamp >= _terms.fundingDeadline) {
            revert CampaignTypes.FundingDeadlinePassed();
        }
        if (_terms.worldGated) revert CampaignTypes.WorldGateUnenforced();
        uint256 remaining = _terms.fundingGoal - _raised; // raised is always <= goal, so this is safe
        if (amount > remaining) revert CampaignTypes.ContributionOverRemaining(amount, remaining);
        _raised += amount;
        _units[msg.sender] += amount;
        SafeERC20.safeTransferFrom(IERC20(_terms.usdc), msg.sender, address(this), amount);
        emit ContributionReceived(msg.sender, amount, _raised);
    }

    /// @notice Moves a fully funded campaign to Production; anyone may call so the creator cannot stall it.
    function finalize() external {
        if (_stage != CampaignTypes.Stage.Funding) revert CampaignTypes.FundingStageEnded();
        if (_raised != _terms.fundingGoal) {
            revert CampaignTypes.FundingGoalNotReached(_raised, _terms.fundingGoal);
        }
        _stage = CampaignTypes.Stage.Production;
        _approvedTrancheCount = 1;
        emit StageChanged(CampaignTypes.Stage.Production);
    }

    /// @notice Records evidence before approval or replaces it after an upheld dispute.
    function submitEvidence(uint8 index, bytes32 swarmRef) external {
        if (msg.sender != _terms.creator) revert CampaignTypes.CreatorOnly();
        if (_stage != CampaignTypes.Stage.Production) {
            revert CampaignTypes.ProductionStageRequired();
        }
        if (index < 1 || index > 2) revert CampaignTypes.MilestoneNotOpen(index);
        if (swarmRef == bytes32(0)) revert CampaignTypes.EvidenceReferenceRequired();
        if (_disputeStatus[index] == CampaignTypes.DisputeStatus.Pending) {
            revert CampaignTypes.DisputePending(index);
        }
        bytes32 currentEvidence = _evidence[index];
        if (
            currentEvidence != bytes32(0) && _approvedEvidence[index] == currentEvidence
                && !_rejectedEvidence[index][currentEvidence]
        ) {
            revert CampaignTypes.EvidenceLocked(index);
        }
        if (_rejectedEvidence[index][swarmRef]) {
            revert CampaignTypes.EvidenceRejected(index);
        }
        _evidence[index] = swarmRef;
        emit EvidenceSubmitted(index, swarmRef);
    }

    /// @notice Approves a milestone only if its evidence still matches the reviewer's inspected hash.
    function approveStage(uint8 index, bytes32 expectedEvidenceHash) external {
        if (msg.sender != _terms.reviewer) revert CampaignTypes.ReviewerOnly();
        if (_stage != CampaignTypes.Stage.Production) {
            revert CampaignTypes.ProductionStageRequired();
        }
        if (index < 1 || index > 2) revert CampaignTypes.MilestoneNotOpen(index);
        if (_disputeStatus[index] == CampaignTypes.DisputeStatus.Pending) {
            revert CampaignTypes.DisputePending(index);
        }
        if (index == 2 && livepeerPlaybackIdHash == bytes32(0)) {
            revert CampaignTypes.PlaybackReferenceRequired();
        }
        if (index == 2 && withdrawableTrancheAmount() < _cumulativeTrancheAmount(1)) {
            revert CampaignTypes.MilestoneNotOpen(index);
        }
        bytes32 actualEvidenceHash = _evidence[index];
        if (actualEvidenceHash == bytes32(0)) revert CampaignTypes.EvidenceRequired(index);
        if (_rejectedEvidence[index][actualEvidenceHash]) {
            revert CampaignTypes.EvidenceRejected(index);
        }
        if (_approvedEvidence[index] == actualEvidenceHash) {
            revert CampaignTypes.TrancheAlreadyApproved(index);
        }
        if (actualEvidenceHash != expectedEvidenceHash) {
            revert CampaignTypes.EvidenceHashMismatch(
                index, expectedEvidenceHash, actualEvidenceHash
            );
        }
        _approvedEvidence[index] = actualEvidenceHash;
        if (_approvedTrancheCount <= index) _approvedTrancheCount = index + 1;
    }

    /// @notice Pays the currently eligible cumulative tranche amount not already withdrawn.
    /// @dev The cumulative paid amount prevents repeat claims; upheld disputes only change future
    ///      withdrawal eligibility and never reverse amounts already transferred.
    function claimApprovedTranche() external nonReentrant {
        if (msg.sender != _terms.creator) revert CampaignTypes.CreatorOnly();
        if (_stage != CampaignTypes.Stage.Production && _stage != CampaignTypes.Stage.Released) {
            revert CampaignTypes.ProductionStageRequired();
        }
        if (_disputeStatus[1] == CampaignTypes.DisputeStatus.Pending) {
            revert CampaignTypes.DisputePending(1);
        }
        if (_disputeStatus[2] == CampaignTypes.DisputeStatus.Pending) {
            revert CampaignTypes.DisputePending(2);
        }
        uint256 eligible = withdrawableTrancheAmount();
        if (eligible <= _paidTrancheAmount) revert CampaignTypes.NothingToClaim();
        uint256 amount = eligible - _paidTrancheAmount;
        _paidTrancheAmount = eligible;
        SafeERC20.safeTransfer(IERC20(_terms.usdc), _terms.creator, amount);
        emit ClaimPaid(_terms.creator, amount);
    }

    /// @notice Opens a challenge against the current milestone evidence for an original contributor.
    /// @dev The challenged reference is fixed until the reviewer resolves this dispute.
    function disputeStage(uint8 index, bytes32 expectedEvidenceHash) external {
        if (_stage != CampaignTypes.Stage.Production) {
            revert CampaignTypes.ProductionStageRequired();
        }
        if (index < 1 || index > 2) revert CampaignTypes.MilestoneNotOpen(index);
        if (_units[msg.sender] == 0) revert CampaignTypes.NotAContributor();
        if (_disputeStatus[index] == CampaignTypes.DisputeStatus.Pending) {
            revert CampaignTypes.DisputeAlreadyPending(index);
        }
        bytes32 actualEvidenceHash = _evidence[index];
        if (actualEvidenceHash == bytes32(0)) revert CampaignTypes.EvidenceRequired(index);
        if (actualEvidenceHash != expectedEvidenceHash) {
            revert CampaignTypes.EvidenceHashMismatch(
                index, expectedEvidenceHash, actualEvidenceHash
            );
        }
        _disputedEvidence[index] = actualEvidenceHash;
        _disputeStatus[index] = CampaignTypes.DisputeStatus.Pending;
        emit StageDisputed(index, msg.sender, actualEvidenceHash);
    }

    /// @notice Resolves the pending challenge against the exact evidence reference reviewed.
    /// @param disputeApproved True upholds the challenge and rejects the evidence; false rejects the challenge.
    function resolveStage(uint8 index, bytes32 expectedEvidenceHash, bool disputeApproved)
        external
    {
        if (msg.sender != _terms.reviewer) revert CampaignTypes.ReviewerOnly();
        if (_stage != CampaignTypes.Stage.Production) {
            revert CampaignTypes.ProductionStageRequired();
        }
        if (index < 1 || index > 2) revert CampaignTypes.MilestoneNotOpen(index);
        if (_disputeStatus[index] != CampaignTypes.DisputeStatus.Pending) {
            revert CampaignTypes.DisputeNotPending(index);
        }
        bytes32 disputedEvidenceHash = _disputedEvidence[index];
        if (
            expectedEvidenceHash != disputedEvidenceHash || _evidence[index] != disputedEvidenceHash
        ) {
            revert CampaignTypes.EvidenceHashMismatch(index, expectedEvidenceHash, _evidence[index]);
        }

        _disputeStatus[index] = disputeApproved
            ? CampaignTypes.DisputeStatus.Approved
            : CampaignTypes.DisputeStatus.Rejected;
        if (disputeApproved) {
            _rejectedEvidence[index][disputedEvidenceHash] = true;
        }
        emit DisputeResolved(index, disputedEvidenceHash, disputeApproved);
    }

    /// @notice Moves an underfunded campaign to Refundable after its funding deadline.
    function expire() external {
        if (_stage != CampaignTypes.Stage.Funding) revert CampaignTypes.FundingStageEnded();
        if (block.timestamp < _terms.fundingDeadline) {
            revert CampaignTypes.FundingDeadlineNotReached(_terms.fundingDeadline);
        }
        if (_raised == _terms.fundingGoal) revert CampaignTypes.FundingGoalReached();
        _stage = CampaignTypes.Stage.Refundable;
        emit StageChanged(CampaignTypes.Stage.Refundable);
    }

    /// @notice Returns failed-funding principal or the wallet's share of cancelled production escrow.
    /// @dev Clears the wallet's units before transferring USDC, so a repeated claim finds nothing owed.
    function claimFundingRefund() external nonReentrant {
        if (
            _stage != CampaignTypes.Stage.Refundable
                && _stage != CampaignTypes.Stage.CancelledProduction
        ) {
            revert CampaignTypes.RefundStageRequired();
        }
        uint256 units = _units[msg.sender];
        if (units == 0) revert CampaignTypes.NothingToRefund();
        uint256 amount = _stage == CampaignTypes.Stage.Refundable
            ? units
            : Math.mulDiv(_cancellationRefundPool, units, _raised);
        _units[msg.sender] = 0;
        _refundsPaid += amount;
        SafeERC20.safeTransfer(IERC20(_terms.usdc), msg.sender, amount);
        emit ClaimPaid(msg.sender, amount);
    }

    /// @notice Lets the reviewer cancel production after its immutable deadline and refund remaining escrow pro rata.
    function cancelProduction() external {
        if (msg.sender != _terms.reviewer) revert CampaignTypes.ReviewerOnly();
        if (_stage != CampaignTypes.Stage.Production) {
            revert CampaignTypes.ProductionStageRequired();
        }
        if (block.timestamp < _terms.productionDeadline) {
            revert CampaignTypes.ProductionDeadlineNotReached(_terms.productionDeadline);
        }
        uint256 remaining = _raised - _paidTrancheAmount;
        _cancellationRefundPool = remaining;
        _stage = CampaignTypes.Stage.CancelledProduction;
        emit ProductionCancelled(remaining);
        emit StageChanged(CampaignTypes.Stage.CancelledProduction);
    }

    /// @notice Records the playback source before final review; approval locks the source.
    function configureRelease(bytes32 playbackIdHash) external {
        if (msg.sender != _terms.creator) revert CampaignTypes.CreatorOnly();
        if (_stage != CampaignTypes.Stage.Production) {
            revert CampaignTypes.ProductionStageRequired();
        }
        if (playbackIdHash == bytes32(0)) revert CampaignTypes.PlaybackReferenceRequired();
        if (_approvedEvidence[2] != bytes32(0) && !_rejectedEvidence[2][_approvedEvidence[2]]) {
            revert CampaignTypes.EvidenceLocked(2);
        }
        livepeerPlaybackIdHash = playbackIdHash;
    }

    /// @notice Publishes the reviewed film and starts its release-relative revenue term.
    function publishFilm() external {
        if (msg.sender != _terms.creator) revert CampaignTypes.CreatorOnly();
        if (_stage != CampaignTypes.Stage.Production) {
            revert CampaignTypes.ProductionStageRequired();
        }
        if (livepeerPlaybackIdHash == bytes32(0)) revert CampaignTypes.PlaybackReferenceRequired();
        if (withdrawableTrancheAmount() != _raised || _approvedTrancheCount != 3) {
            revert CampaignTypes.FinalApprovalRequired();
        }
        releasedAt = block.timestamp;
        _stage = CampaignTypes.Stage.Released;
        emit FilmReleased(livepeerPlaybackIdHash, releasedAt);
        emit StageChanged(CampaignTypes.Stage.Released);
    }

    /// @notice Buys permanent wallet access and credits the immutable, cap-bounded revenue split.
    function buyAccess() external nonReentrant {
        if (_stage != CampaignTypes.Stage.Released) revert CampaignTypes.ReleasedStageRequired();
        if (hasAccess[msg.sender]) revert CampaignTypes.AccessAlreadyPurchased();
        uint256 price = _terms.watchPrice;
        uint256 cap = Math.mulDiv(_raised, _terms.repaymentCapBps, CampaignTypes.BPS);
        uint256 funderAmount;
        if (block.timestamp < releasedAt + _terms.rightsDuration && funderAllocated < cap) {
            funderAmount = Math.min(
                Math.mulDiv(price, _terms.funderBps, CampaignTypes.BPS), cap - funderAllocated
            );
        }
        uint256 creatorAmount = price - funderAmount;
        hasAccess[msg.sender] = true;
        funderAllocated += funderAmount;
        creatorAllocated += creatorAmount;
        if (funderAmount != 0) {
            uint256 increment = Math.mulDiv(funderAmount, Q, _raised);
            uint256 remainder = mulmod(funderAmount, Q, _raised);
            // Carry without overflowing the sum of two remainders.
            if (remainder >= _raised - scaledRemainder) {
                increment += 1;
                scaledRemainder = remainder - (_raised - scaledRemainder);
            } else {
                scaledRemainder += remainder;
            }
            accRewardPerUnit += increment;
        }
        SafeERC20.safeTransferFrom(IERC20(_terms.usdc), msg.sender, address(this), price);
        emit WatchPurchased(msg.sender, price);
        emit RevenueCredited(funderAmount, creatorAmount);
    }

    /// @notice Cumulative pro-rata entitlement less revenue already withdrawn by this wallet.
    function claimableFunder(address wallet) public view returns (uint256) {
        return Math.mulDiv(_units[wallet], accRewardPerUnit, Q) - funderClaimedBy[wallet];
    }

    /// @notice Withdraws accrued viewing revenue without consuming contribution units.
    function claimFunderRevenue() external nonReentrant {
        uint256 amount = claimableFunder(msg.sender);
        if (amount == 0) revert CampaignTypes.NothingToClaim();
        if (amount > funderAllocated - funderClaimed) {
            revert CampaignTypes.RevenueAllocationExceeded();
        }
        funderClaimedBy[msg.sender] += amount;
        funderClaimed += amount;
        SafeERC20.safeTransfer(IERC20(_terms.usdc), msg.sender, amount);
        emit ClaimPaid(msg.sender, amount);
    }

    /// @notice Withdraws only credited creator viewing revenue, independently of production escrow.
    function claimCreatorRevenue() external nonReentrant {
        if (msg.sender != _terms.creator) revert CampaignTypes.CreatorOnly();
        uint256 amount = creatorAllocated - creatorClaimed;
        if (amount == 0) revert CampaignTypes.NothingToClaim();
        creatorClaimed += amount;
        SafeERC20.safeTransfer(IERC20(_terms.usdc), msg.sender, amount);
        emit ClaimPaid(msg.sender, amount);
    }

    function hasPaidAccess(address wallet) external view returns (bool) {
        return hasAccess[wallet];
    }

    /// @notice Unpaid principal, including refund liabilities after failure or production cancellation.
    function escrowLiability() public view returns (uint256) {
        return _raised - _refundsPaid - _paidTrancheAmount;
    }

    /// @notice Total tracked liabilities; direct token donations do not increase eligible revenue.
    function reservedUSDC() public view returns (uint256) {
        return
            escrowLiability() + (funderAllocated - funderClaimed)
                + (creatorAllocated - creatorClaimed);
    }

    /// @notice Whether future viewing receipts belong entirely to the creator.
    function isRevenueRightMature() external view returns (bool) {
        if (_stage != CampaignTypes.Stage.Released) return false;
        return block.timestamp >= releasedAt + _terms.rightsDuration
            || funderAllocated >= Math.mulDiv(_raised, _terms.repaymentCapBps, CampaignTypes.BPS);
    }

    /// @notice Total accepted principal; always <= fundingGoal. Refunded principal is tracked separately.
    function raised() external view returns (uint256) {
        return _raised;
    }

    /// @notice Principal already returned to failed-campaign backers.
    function refundsPaid() external view returns (uint256) {
        return _refundsPaid;
    }

    /// @notice One wallet's claim units, equal to the principal it transferred in.
    function contribution(address wallet) external view returns (uint256) {
        return _units[wallet];
    }

    function getTerms() external view returns (CampaignTypes.CampaignTerms memory) {
        return _terms;
    }

    function getStage() external view returns (CampaignTypes.Stage) {
        return _stage;
    }

    /// @notice Returns one milestone tranche of the funding goal.
    /// @dev Tranches build from cumulative floor steps so the 40/30/30 split always sums exactly to the goal.
    function trancheAmount(uint256 index) external view returns (uint256) {
        return _trancheAmount(index);
    }

    /// @notice Cumulative amount ever approved, including tranche 0 from finalization.
    function approvedTrancheAmount() public view returns (uint256 amount) {
        for (uint256 index; index < _approvedTrancheCount; ++index) {
            amount += _trancheAmount(index);
        }
    }

    /// @notice Cumulative amount currently eligible for withdrawal under the approved evidence.
    /// @dev A pending dispute freezes every unpaid tranche; an upheld dispute suspends its tranche
    ///      until replacement evidence receives a fresh reviewer approval.
    function withdrawableTrancheAmount() public view returns (uint256 amount) {
        if (_stage != CampaignTypes.Stage.Production && _stage != CampaignTypes.Stage.Released) {
            return 0;
        }
        if (_disputeStatus[1] == CampaignTypes.DisputeStatus.Pending) return 0;
        if (_disputeStatus[2] == CampaignTypes.DisputeStatus.Pending) return 0;
        for (uint256 index; index < _approvedTrancheCount; ++index) {
            if (index != 0) {
                bytes32 currentEvidence = _evidence[index];
                if (
                    currentEvidence == bytes32(0) || _approvedEvidence[index] != currentEvidence
                        || _rejectedEvidence[index][currentEvidence]
                ) {
                    break;
                }
            }
            amount += _trancheAmount(index);
        }
    }

    /// @notice Total cumulative tranche amount already paid to the creator.
    function paidTrancheAmount() external view returns (uint256) {
        return _paidTrancheAmount;
    }

    /// @notice Public evidence reference recorded for one milestone; zero until the creator submits it.
    function evidenceReference(uint256 index) external view returns (bytes32) {
        return _evidence[index];
    }

    /// @notice Returns the latest dispute status and the evidence reference it challenged.
    function disputeStatus(uint256 index) external view returns (CampaignTypes.DisputeStatus) {
        return _disputeStatus[index];
    }

    function disputedEvidenceReference(uint256 index) external view returns (bytes32) {
        return _disputedEvidence[index];
    }

    function isEvidenceRejected(uint256 index) external view returns (bool) {
        return _rejectedEvidence[index][_evidence[index]];
    }

    /// @notice Returns all milestone tranches in approval order, not yet bound to accepted principal.
    function trancheAmounts() external view returns (uint256[3] memory amounts) {
        uint256 cumulativeFirst = _cumulativeTrancheAmount(0);
        uint256 cumulativeSecond = _cumulativeTrancheAmount(1);
        amounts = [
            cumulativeFirst,
            cumulativeSecond - cumulativeFirst,
            _terms.fundingGoal - cumulativeSecond
        ];
    }

    function _trancheAmount(uint256 index) private view returns (uint256) {
        uint256 cumulative = _cumulativeTrancheAmount(index);
        if (index == 0) return cumulative;
        return cumulative - _cumulativeTrancheAmount(index - 1);
    }

    /// @dev Finalized funding makes accepted principal equal the goal, so tranches are derived from terms alone.
    function _cumulativeTrancheAmount(uint256 index) private view returns (uint256) {
        if (index > MAX_TRANCHE_INDEX) revert CampaignTypes.TrancheIndexOutOfBounds(index);
        uint256 cumulativeBps = index == 0 ? 4_000 : index == 1 ? 7_000 : CampaignTypes.BPS;
        return Math.mulDiv(_terms.fundingGoal, cumulativeBps, CampaignTypes.BPS);
    }
}
