// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import { EIP712 } from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import { ECDSA } from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import { ICampaign } from "./interfaces/ICampaign.sol";
import { CampaignTypes } from "./CampaignTypes.sol";

/// @notice Immutable reviewer committee for campaigns that select this contract as their reviewer.
/// @dev Relayers submit sorted EOA signatures; campaign lifecycle and evidence guards remain authoritative.
contract ThresholdReviewer is EIP712 {
    bytes32 public constant REVIEW_TYPEHASH =
        keccak256("Review(address campaign,bytes32 actionHash,uint256 nonce,uint256 deadline)");
    uint256 public immutable threshold;
    uint256 public immutable signerCount;
    mapping(address signer => bool member) public isSigner;
    mapping(address campaign => uint256 nextNonce) public nonces;

    error InvalidCommittee();
    error InvalidReview();
    error InsufficientSignatures();
    error ReviewExecutionFailed();

    event ReviewExecuted(address indexed campaign, uint256 indexed nonce, bytes32 actionHash);

    constructor(address[] memory signers, uint256 required) EIP712("CinevestThresholdReviewer", "1") {
        if (required < 2 || required > signers.length || signers.length > 32) revert InvalidCommittee();
        for (uint256 i; i < signers.length; ++i) {
            address signer = signers[i];
            if (signer == address(0) || isSigner[signer]) revert InvalidCommittee();
            isSigner[signer] = true;
        }
        threshold = required;
        signerCount = signers.length;
    }

    /// @notice Digest binds the exact calldata, campaign, committee, chain, nonce and expiration.
    function reviewDigest(address campaign, bytes calldata action, uint256 deadline) public view returns (bytes32) {
        return _hashTypedDataV4(keccak256(abi.encode(
            REVIEW_TYPEHASH, campaign, keccak256(action), nonces[campaign], deadline
        )));
    }

    /// @notice Executes only reviewer operations after a distinct-signature threshold is met.
    /// @dev Sorted recovered addresses prevent duplicate votes. Failed campaign calls roll back the nonce.
    function execute(address campaign, bytes calldata action, uint256 deadline, bytes[] calldata signatures) external {
        if (action.length < 4 || block.timestamp > deadline) revert InvalidReview();
        bytes4 selector = bytes4(action[:4]);
        if (selector != ICampaign.approveStage.selector && selector != ICampaign.resolveStage.selector
            && selector != ICampaign.cancelProduction.selector && selector != ICampaign.approveSponsor.selector) {
            revert InvalidReview();
        }
        CampaignTypes.CampaignTerms memory terms = ICampaign(campaign).getTerms();
        if (terms.reviewer != address(this) || isSigner[terms.creator]) revert InvalidReview();
        if (signatures.length < threshold || signatures.length > signerCount) revert InsufficientSignatures();
        bytes32 digest = reviewDigest(campaign, action, deadline);
        address previous;
        for (uint256 i; i < signatures.length; ++i) {
            (address signer, ECDSA.RecoverError failure,) = ECDSA.tryRecover(digest, signatures[i]);
            if (failure != ECDSA.RecoverError.NoError || !isSigner[signer] || signer <= previous) {
                revert InvalidReview();
            }
            previous = signer;
        }
        uint256 nonce = nonces[campaign]++;
        (bool success,) = campaign.call(action);
        if (!success) revert ReviewExecutionFailed();
        emit ReviewExecuted(campaign, nonce, keccak256(action));
    }
}
