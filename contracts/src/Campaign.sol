// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import { EIP712 } from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import { ECDSA } from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import { Math } from "@openzeppelin/contracts/utils/math/Math.sol";
import { CampaignTypes } from "./CampaignTypes.sol";
import { ICampaignEvents } from "./interfaces/ICampaign.sol";

/// @notice Per-film campaign exposing immutable terms and the lifecycle stage.
/// @dev Arc owns financial authority; playback hashes commit an asset identifier, not provider availability.
contract Campaign is ICampaignEvents, ReentrancyGuard, EIP712 {
    /// @dev Milestone release schedule is fixed at three cumulative 40/70/100 percent steps of the goal.
    uint256 private constant MAX_TRANCHE_INDEX = 2;
    /// @notice After this fixed grace period anyone may recover unspent escrow if the reviewer disappears.
    uint256 public constant CANCELLATION_GRACE_PERIOD = 7 days;

    /// @notice Captured at creation; an authorization cannot be moved between campaigns or chains.
    address public immutable worldVerifierSigner;
    bytes32 public constant WORLD_AUTHORIZATION_TYPEHASH = keccak256(
        "WorldAuthorization(address wallet,address campaign,bytes32 scopedNullifierHash,bytes32 nonce,uint256 deadline)"
    );
    /// @notice Trusted usage reporter captured at creation; zero disables metered viewing for this film.
    /// @dev Signatures authenticate its reports, not that anyone watched. Exposure is limited to escrow a viewer deposited.
    address public immutable meterSigner;
    /// @notice Time the meter has to settle outstanding usage before an uncooperative exit pays out.
    uint256 public constant VIEWING_EXIT_DELAY = 6 hours;
    bytes32 public constant VIEWING_RECEIPT_TYPEHASH = keccak256(
        "ViewingReceipt(address viewer,address campaign,bytes32 filmHash,bytes32 sessionId,uint64 sequence,uint256 cumulativeCharge,uint256 spendCap,bool finalForWithdrawal,uint256 deadline)"
    );
    mapping(address wallet => CampaignTypes.ViewingAccount account) public viewingAccounts;
    /// @notice Refundable viewer money; excluded from revenue until a receipt finalizes it.
    uint256 public viewingEscrow;
    mapping(bytes32 digest => bool consumed) public usedWorldAuthorizations;
    mapping(bytes32 nullifierHash => address wallet) public nullifierOwner;
    /// @notice Lifetime principal per human; refunds never reopen the funding cap.
    mapping(bytes32 nullifierHash => uint256 principal) public humanContribution;

    /// @notice Optional initial human quota; zero preserves perpetual World gating.
    uint256 public verifiedFirstRoundTarget;
    uint256 public verifiedHumanCount;
    address private immutable _deploymentFactory;
    bool private _roundConfigured;
    mapping(bytes32 approvalId => bool approved) public sponsorApprovals;
    mapping(bytes32 approvalKey => bool consumed) public consumedSponsorApprovals;
    event MilestoneApproved(uint8 indexed milestoneIndex, bytes32 evidenceReference);
    event VerifiedFirstRoundConfigured(uint256 target);
    event PublicFundingOpened(uint256 verifiedHumans);
    event SponsorApproved(bytes32 indexed approvalId, address indexed sponsor, uint256 amount, bytes32 conditionsHash);
    event SponsorDeposited(bytes32 indexed approvalId, address indexed sponsor, uint256 amount);
    error InvalidExtensionConfiguration();
    error SponsorApprovalRequired();
    error IncorrectTokenReceipt();
    event ViewingDeposited(address indexed viewer, uint256 amount, uint256 balance);
    event ViewingExitRequested(address indexed viewer, uint64 exitAt);
    event ViewingSettled(address indexed viewer, bytes32 indexed sessionId, uint64 sequence, uint256 charge, uint256 cumulativeCharge);
    event ViewingWithdrawn(address indexed viewer, uint256 amount);

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

    constructor(CampaignTypes.CampaignTerms memory terms, address verifierSigner, address usageSigner)
        EIP712("CinevestWorldAuthorization", "1")
    {
        CampaignTypes.validateTerms(terms);
        if (terms.worldGated && verifierSigner == address(0)) revert CampaignTypes.WorldVerifierRequired();
        _deploymentFactory = msg.sender;
        worldVerifierSigner = verifierSigner;
        meterSigner = usageSigner;
        _terms = terms;
        _stage = CampaignTypes.Stage.Funding;
    }

    /// @notice Permissionless funding is available only to campaigns that do not require World ID.
    function contribute(uint256 amount) external nonReentrant {
        if (_terms.worldGated && !publicFundingOpen()) revert CampaignTypes.WorldAuthorizationRequired();
        _contribute(amount);
    }

    /// @notice Accepts gated funding with a one-use permission issued after backend World verification.
    /// @dev The same transaction consumes the permission, binds the human and pulls principal;
    ///      any lifecycle, cap or token-transfer failure rolls all three changes back.
    function contributeWithAuthorization(
        uint256 amount, CampaignTypes.WorldAuthorization calldata authorization, bytes calldata signature
    ) external nonReentrant {
        if (!_terms.worldGated) revert CampaignTypes.WorldGateNotEnabled();
        if (authorization.wallet != msg.sender || authorization.campaign != address(this)
            || authorization.scopedNullifierHash == bytes32(0) || authorization.nonce == bytes32(0)) {
            revert CampaignTypes.InvalidWorldAuthorization();
        }
        if (block.timestamp > authorization.deadline) revert CampaignTypes.WorldAuthorizationExpired();
        bytes32 digest = worldAuthorizationDigest(authorization);
        if (usedWorldAuthorizations[digest]) revert CampaignTypes.WorldAuthorizationUsed();
        (address signer, ECDSA.RecoverError error,) = ECDSA.tryRecoverCalldata(digest, signature);
        if (error != ECDSA.RecoverError.NoError || signer != worldVerifierSigner) {
            revert CampaignTypes.InvalidWorldAuthorization();
        }
        bytes32 nullifier = authorization.scopedNullifierHash;
        address owner = nullifierOwner[nullifier];
        if (owner != address(0) && owner != msg.sender) revert CampaignTypes.WorldNullifierOwned();
        uint256 funded = humanContribution[nullifier];
        if (amount > _terms.perHumanLimit - funded) revert CampaignTypes.PerHumanLimitExceeded();
        usedWorldAuthorizations[digest] = true;
        nullifierOwner[nullifier] = msg.sender;
        humanContribution[nullifier] = funded + amount;
        if (owner == address(0)) {
            verifiedHumanCount += 1;
            emit ProofVerified(nullifier, msg.sender);
            if (verifiedFirstRoundTarget != 0 && verifiedHumanCount == verifiedFirstRoundTarget) {
                emit PublicFundingOpened(verifiedHumanCount);
            }
        }
        _contribute(amount);
    }

    /// @notice Factory-only creation configuration; cannot change once published in the registry.
    function configureVerifiedFirstRound(uint256 target) external {
        if (msg.sender != _deploymentFactory || _roundConfigured || !_terms.worldGated
            || target == 0 || _raised != 0) revert InvalidExtensionConfiguration();
        _roundConfigured = true;
        verifiedFirstRoundTarget = target;
        emit VerifiedFirstRoundConfigured(target);
    }

    /// @notice Public contributions unlock permanently after N distinct, successfully funded humans.
    function publicFundingOpen() public view returns (bool) {
        return !_terms.worldGated || (verifiedFirstRoundTarget != 0 && verifiedHumanCount >= verifiedFirstRoundTarget);
    }

    /// @notice Returns the exact EIP-712 digest used by the backend encoder and replay guard.
    function worldAuthorizationDigest(CampaignTypes.WorldAuthorization calldata authorization) public view returns (bytes32) {
        return _hashTypedDataV4(keccak256(abi.encode(
            WORLD_AUTHORIZATION_TYPEHASH, authorization.wallet, authorization.campaign,
            authorization.scopedNullifierHash, authorization.nonce, authorization.deadline
        )));
    }

    /// @dev Both external funding routes share lifecycle, goal, accounting and transfer behavior.
    function _contribute(uint256 amount) private {
        if (amount == 0) revert CampaignTypes.ZeroContribution();
        if (_stage != CampaignTypes.Stage.Funding) revert CampaignTypes.FundingStageEnded();
        if (block.timestamp >= _terms.fundingDeadline) revert CampaignTypes.FundingDeadlinePassed();
        uint256 remaining = _terms.fundingGoal - _raised;
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
        if (index == 2 && (_approvedTrancheCount < 2 || withdrawableTrancheAmount() < _cumulativeTrancheAmount(1))) {
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
        emit MilestoneApproved(index, actualEvidenceHash);
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
        emit PayoutPaid(_terms.creator, PayoutKind.ProductionTranche, amount);
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
        _claimPrincipalRefund();
    }

    /// @notice Explicit cancellation-only claim entrypoint for clients that distinguish refund categories.
    function claimCancelledEscrow() external nonReentrant {
        if (_stage != CampaignTypes.Stage.CancelledProduction) revert CampaignTypes.RefundStageRequired();
        _claimPrincipalRefund();
    }

    /// @dev Both public refund entrypoints share one checks-effects-interactions settlement path.
    function _claimPrincipalRefund() private {
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
        emit PayoutPaid(msg.sender, _stage == CampaignTypes.Stage.Refundable ? PayoutKind.FundingRefund : PayoutKind.CancelledEscrow, amount);
    }

    /// @notice Cancels unfinished production at its deadline for the reviewer, or after seven days for anyone.
    /// @dev The permissionless fallback snapshots the same unspent pool and cannot cancel a released film.
    function cancelProduction() external {
        if (msg.sender != _terms.reviewer && block.timestamp < uint256(_terms.productionDeadline) + CANCELLATION_GRACE_PERIOD) revert CampaignTypes.ReviewerOnly();
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
        emit ReleaseConfigured(playbackIdHash);
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

    /// @notice Buys permanent wallet access, less metered charges, and credits the cap-bounded revenue split.
    /// @dev Marking the full price as charged turns later receipts for earlier usage into no-ops.
    function buyAccess() external nonReentrant {
        if (_stage != CampaignTypes.Stage.Released) revert CampaignTypes.ReleasedStageRequired();
        if (hasAccess[msg.sender]) revert CampaignTypes.AccessAlreadyPurchased();
        CampaignTypes.ViewingAccount storage account = viewingAccounts[msg.sender];
        uint256 price = _terms.watchPrice - account.charged;
        account.charged = _terms.watchPrice;
        hasAccess[msg.sender] = true;
        SafeERC20.safeTransferFrom(IERC20(_terms.usdc), msg.sender, address(this), price);
        _creditRevenue(price);
        emit WatchPurchased(msg.sender, price);
    }

    /// @notice Adds refundable viewing escrow; a wallet never holds more than the rest of the full price.
    /// @dev New funds cancel a pending exit, so topping up cannot shorten the meter's settlement window.
    function depositViewing(uint256 amount) external nonReentrant {
        if (meterSigner == address(0)) revert CampaignTypes.MeteredViewingDisabled();
        if (_stage != CampaignTypes.Stage.Released) revert CampaignTypes.ReleasedStageRequired();
        if (hasAccess[msg.sender]) revert CampaignTypes.AccessAlreadyPurchased();
        if (amount == 0) revert CampaignTypes.ZeroViewingDeposit();
        CampaignTypes.ViewingAccount storage account = viewingAccounts[msg.sender];
        if (account.charged + account.balance + amount > _terms.watchPrice) revert CampaignTypes.ViewingDepositOverPrice();
        account.balance += amount;
        account.exitAt = 0;
        viewingEscrow += amount;
        IERC20 token = IERC20(_terms.usdc);
        uint256 beforeBalance = token.balanceOf(address(this));
        SafeERC20.safeTransferFrom(token, msg.sender, address(this), amount);
        if (token.balanceOf(address(this)) - beforeBalance != amount) revert IncorrectTokenReceipt();
        emit ViewingDeposited(msg.sender, amount, account.balance);
    }

    /// @notice Finalizes cumulative usage into the waterfall; anyone may relay a meter-signed receipt.
    /// @dev Closing receipts are excluded: relaying one here would burn its sequence and block the viewer's refund.
    function settleViewing(CampaignTypes.ViewingReceipt calldata receipt, bytes calldata signature) external nonReentrant {
        if (receipt.finalForWithdrawal) revert CampaignTypes.InvalidViewingReceipt();
        _applyViewingReceipt(receipt, signature);
    }

    /// @notice Cooperative stop: settles the meter's closing receipt and refunds the rest immediately.
    function settleAndWithdrawViewing(CampaignTypes.ViewingReceipt calldata receipt, bytes calldata signature)
        external
        nonReentrant
    {
        if (receipt.viewer != msg.sender || !receipt.finalForWithdrawal) revert CampaignTypes.InvalidViewingReceipt();
        _applyViewingReceipt(receipt, signature);
        if (viewingAccounts[msg.sender].balance != 0) _withdrawViewing(msg.sender);
    }

    /// @notice Starts the recovery path that needs no meter cooperation.
    function requestViewingExit() external {
        CampaignTypes.ViewingAccount storage account = viewingAccounts[msg.sender];
        if (account.balance == 0) revert CampaignTypes.NothingToClaim();
        if (account.exitAt != 0) return;
        account.exitAt = uint64(block.timestamp + VIEWING_EXIT_DELAY);
        emit ViewingExitRequested(msg.sender, account.exitAt);
    }

    /// @notice Refunds escrow after the exit delay, or at once when full access leaves nothing to charge.
    function withdrawViewing() external nonReentrant {
        CampaignTypes.ViewingAccount storage account = viewingAccounts[msg.sender];
        if (account.balance == 0) revert CampaignTypes.NothingToClaim();
        if (!hasAccess[msg.sender] && (account.exitAt == 0 || block.timestamp < account.exitAt)) {
            revert CampaignTypes.ViewingExitNotReady(account.exitAt);
        }
        _withdrawViewing(msg.sender);
    }

    /// @notice Digest the meter signs; shared with the backend encoder for parity checks.
    function viewingReceiptDigest(CampaignTypes.ViewingReceipt calldata receipt) public view returns (bytes32) {
        return _hashTypedDataV4(keccak256(abi.encode(VIEWING_RECEIPT_TYPEHASH, receipt)));
    }

    /// @dev Charges are capped by the receipt, the full price and the escrow left; a shortfall stays
    ///      unsettled in the cumulative figure, so a later deposit can still cover usage already delivered.
    function _applyViewingReceipt(CampaignTypes.ViewingReceipt calldata receipt, bytes calldata signature) private {
        if (block.timestamp > receipt.deadline) revert CampaignTypes.ViewingReceiptExpired();
        if (
            receipt.campaign != address(this) || receipt.filmHash != livepeerPlaybackIdHash
                || receipt.cumulativeCharge > receipt.spendCap || receipt.spendCap > _terms.watchPrice
                || meterSigner == address(0) || ECDSA.recover(viewingReceiptDigest(receipt), signature) != meterSigner
        ) revert CampaignTypes.InvalidViewingReceipt();
        CampaignTypes.ViewingAccount storage account = viewingAccounts[receipt.viewer];
        if (receipt.sequence <= account.sequence) revert CampaignTypes.ViewingReceiptReplayed();
        account.sequence = receipt.sequence;
        uint256 charge;
        if (receipt.cumulativeCharge > account.charged) {
            charge = Math.min(receipt.cumulativeCharge - account.charged, account.balance);
        }
        if (charge != 0) {
            account.balance -= charge;
            account.charged += charge;
            viewingEscrow -= charge;
            if (account.charged == _terms.watchPrice) hasAccess[receipt.viewer] = true;
            _creditRevenue(charge);
        }
        emit ViewingSettled(receipt.viewer, receipt.sessionId, receipt.sequence, charge, account.charged);
    }

    function _withdrawViewing(address viewer) private {
        CampaignTypes.ViewingAccount storage account = viewingAccounts[viewer];
        uint256 amount = account.balance;
        account.balance = 0;
        account.exitAt = 0;
        viewingEscrow -= amount;
        SafeERC20.safeTransfer(IERC20(_terms.usdc), viewer, amount);
        emit ViewingWithdrawn(viewer, amount);
    }

    /// @notice Independent reviewer approves an exact sponsor, amount and offchain conditions commitment.
    /// @dev Approval IDs are single-use and can be revoked before a deposit; conditions must be reviewed offchain.
    function approveSponsor(bytes32 approvalId, address sponsor, uint256 amount, bytes32 conditionsHash, bool approved) external {
        if (msg.sender != _terms.reviewer) revert CampaignTypes.ReviewerOnly();
        if (sponsor == address(0) || amount == 0 || conditionsHash == bytes32(0)) revert InvalidExtensionConfiguration();
        bytes32 key = keccak256(abi.encode(approvalId, sponsor, amount, conditionsHash));
        if (consumedSponsorApprovals[key]) revert SponsorApprovalRequired();
        sponsorApprovals[key] = approved;
        emit SponsorApproved(approvalId, sponsor, approved ? amount : 0, conditionsHash);
    }

    /// @notice Pulls real USDC before crediting the same capped waterfall used by paid viewing.
    function depositSponsor(bytes32 approvalId, uint256 amount, bytes32 conditionsHash) external nonReentrant {
        if (_stage != CampaignTypes.Stage.Released) revert CampaignTypes.ReleasedStageRequired();
        bytes32 key = keccak256(abi.encode(approvalId, msg.sender, amount, conditionsHash));
        if (!sponsorApprovals[key]) revert SponsorApprovalRequired();
        sponsorApprovals[key] = false;
        consumedSponsorApprovals[key] = true;
        IERC20 token = IERC20(_terms.usdc);
        uint256 beforeBalance = token.balanceOf(address(this));
        SafeERC20.safeTransferFrom(token, msg.sender, address(this), amount);
        if (token.balanceOf(address(this)) - beforeBalance != amount) revert IncorrectTokenReceipt();
        _creditRevenue(amount);
        emit SponsorDeposited(approvalId, msg.sender, amount);
    }

    /// @dev Both receipt sources share rounding, repayment-cap and rights-expiry accounting.
    function _creditRevenue(uint256 price) private {
        uint256 cap = Math.mulDiv(_raised, _terms.repaymentCapBps, CampaignTypes.BPS);
        uint256 funderAmount;
        if (block.timestamp < releasedAt + _terms.rightsDuration && funderAllocated < cap) {
            funderAmount = Math.min(
                Math.mulDiv(price, _terms.funderBps, CampaignTypes.BPS), cap - funderAllocated
            );
        }
        uint256 creatorAmount = price - funderAmount;
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
        emit PayoutPaid(msg.sender, PayoutKind.FunderRevenue, amount);
    }

    /// @notice Withdraws only credited creator viewing revenue, independently of production escrow.
    function claimCreatorRevenue() external nonReentrant {
        if (msg.sender != _terms.creator) revert CampaignTypes.CreatorOnly();
        uint256 amount = creatorAllocated - creatorClaimed;
        if (amount == 0) revert CampaignTypes.NothingToClaim();
        creatorClaimed += amount;
        SafeERC20.safeTransfer(IERC20(_terms.usdc), msg.sender, amount);
        emit ClaimPaid(msg.sender, amount);
        emit PayoutPaid(msg.sender, PayoutKind.CreatorRevenue, amount);
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
                + (creatorAllocated - creatorClaimed) + viewingEscrow;
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
