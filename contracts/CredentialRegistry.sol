// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {MerkleProof} from "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";
import {UniversityRegistry} from "./UniversityRegistry.sol";

/// @title CredentialRegistry
/// @notice Anchors Merkle roots of credential batches issued by registered universities.
/// @dev Each leaf is the EIP-712 commitment of a single degree credential; the root
///      commits to every credential in the cohort, so one transaction authenticates
///      thousands of degrees.
contract CredentialRegistry {
    struct Batch {
        address issuer;
        bytes32 merkleRoot;
        uint32 credentialCount;
        uint64 issuedAt;
        uint16 graduationYear;
        string degreeType;
    }

    UniversityRegistry public immutable universityRegistry;
    uint256 public batchCount;

    mapping(uint256 => Batch) private _batches;

    event BatchIssued(
        uint256 indexed batchId,
        address indexed issuer,
        bytes32 merkleRoot,
        uint32 credentialCount,
        uint16 graduationYear,
        string degreeType
    );

    constructor(UniversityRegistry registry_) {
        universityRegistry = registry_;
    }

    /// @notice Anchor a Merkle root for a cohort of credentials.
    /// @param merkleRoot Root of the sorted-pair keccak256 Merkle tree.
    /// @param credentialCount Number of credentials committed to by the root.
    /// @param graduationYear Graduation cohort year.
    /// @param degreeType Degree awarded to the cohort (e.g. "B.Sc.").
    function issueBatch(
        bytes32 merkleRoot,
        uint32 credentialCount,
        uint16 graduationYear,
        string calldata degreeType
    ) external returns (uint256 batchId) {
        require(universityRegistry.isUniversity(msg.sender), "CredentialRegistry: issuer not registered");
        require(merkleRoot != bytes32(0), "CredentialRegistry: empty root");
        require(credentialCount > 0, "CredentialRegistry: empty batch");
        require(bytes(degreeType).length > 0, "CredentialRegistry: empty degree type");

        batchId = ++batchCount;
        _batches[batchId] = Batch({
            issuer: msg.sender,
            merkleRoot: merkleRoot,
            credentialCount: credentialCount,
            issuedAt: uint64(block.timestamp),
            graduationYear: graduationYear,
            degreeType: degreeType
        });

        emit BatchIssued(batchId, msg.sender, merkleRoot, credentialCount, graduationYear, degreeType);
    }

    /// @notice Verify that a credential commitment is part of an anchored batch.
    function verifyCredential(
        uint256 batchId,
        bytes32 leaf,
        bytes32[] calldata proof
    ) external view returns (bool) {
        bytes32 root = _batches[batchId].merkleRoot;
        if (root == bytes32(0)) return false;
        return MerkleProof.verify(proof, root, leaf);
    }

    function batch(uint256 batchId) external view returns (Batch memory) {
        return _batches[batchId];
    }
}
