// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable2Step, Ownable} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {PatientRegistry} from "./PatientRegistry.sol";
import {ConsentManager} from "./ConsentManager.sol";
import {AuditLog} from "./AuditLog.sol";

/// @title MedicalRecordRegistry
/// @notice Anchors the integrity of off-chain medical records on-chain and provides
///         tamper-evident verification.
/// @dev    PRIVACY: `contentHash` is keccak256 of the canonical record JSON;
///         `storageLocatorHash` is keccak256 of the off-chain locator (bucket/object key).
///         **No clinical content is ever written to this contract.**
contract MedicalRecordRegistry is Ownable2Step, Pausable {
    // ---------------------------------------------------------------------
    // Types
    // ---------------------------------------------------------------------

    struct MedicalRecord {
        bytes32 recordId;
        bytes32 patientId;
        bytes32 recordType; // keccak256 of "LAB_RESULT" | "IMAGING" | "REPORT" | ...
        bytes32 contentHash;
        bytes32 storageLocatorHash;
        address recordedBy;
        uint64 createdAt;
        uint64 updatedAt;
        uint32 version;
        bool superseded;
    }

    struct VerificationResult {
        bool exists;
        bool matches;
        uint32 version;
        bytes32 onChainHash;
        uint64 createdAt;
        uint64 updatedAt;
    }

    // ---------------------------------------------------------------------
    // Constants
    // ---------------------------------------------------------------------

    /// @dev Pre-computed action identifiers for the audit trail.
    bytes32 public constant ACTION_VERIFIED_OK = keccak256("RECORD_VERIFIED_OK");
    bytes32 public constant ACTION_VERIFIED_MISMATCH = keccak256("RECORD_VERIFIED_MISMATCH");

    // ---------------------------------------------------------------------
    // Storage
    // ---------------------------------------------------------------------

    PatientRegistry public immutable patientRegistry;
    ConsentManager public immutable consentManager;
    AuditLog public immutable auditLog;

    mapping(bytes32 recordId => MedicalRecord record) private _records;
    mapping(bytes32 patientId => bytes32[] recordIds) private _recordsByPatient;
    mapping(address system => bool authorized) public authorizedSystems;
    uint256 public recordCount;

    // ---------------------------------------------------------------------
    // Events
    // ---------------------------------------------------------------------

    event RecordRegistered(
        bytes32 indexed recordId,
        bytes32 indexed patientId,
        bytes32 indexed recordType,
        bytes32 contentHash,
        address recordedBy,
        uint32 version,
        uint256 timestamp
    );
    event RecordSuperseded(bytes32 indexed recordId, bytes32 indexed patientId, bytes32 previousHash, bytes32 newHash, uint32 version, uint256 timestamp);
    event RecordVerified(bytes32 indexed recordId, bytes32 indexed patientId, bool matches, address indexed verifier, uint256 timestamp);
    event SystemAuthorizationChanged(address indexed system, bool authorized);

    // ---------------------------------------------------------------------
    // Errors
    // ---------------------------------------------------------------------

    error RecordNotFound(bytes32 recordId);
    error RecordAlreadyExists(bytes32 recordId);
    error UnauthorizedForPatient(bytes32 patientId, address caller);
    error PatientNotRegistered(bytes32 patientId);
    error UnauthorizedSystem();
    error EmptyContentHash();

    // ---------------------------------------------------------------------
    // Modifiers
    // ---------------------------------------------------------------------

    modifier onlySystem() {
        if (!authorizedSystems[msg.sender] && msg.sender != owner()) revert UnauthorizedSystem();
        _;
    }

    /// @dev Access rule (least privilege):
    ///      1. the patient's own wallet, or
    ///      2. an authorized platform system (relayer), or
    ///      3. a healthcare professional holding **active, non-expired consent**.
    modifier onlyAuthorizedFor(bytes32 patientId) {
        if (!_isAuthorizedFor(patientId, msg.sender)) {
            revert UnauthorizedForPatient(patientId, msg.sender);
        }
        _;
    }

    // ---------------------------------------------------------------------
    // Constructor
    // ---------------------------------------------------------------------

    constructor(
        address initialOwner,
        address patientRegistry_,
        address consentManager_,
        address auditLog_
    ) Ownable(initialOwner) {
        patientRegistry = PatientRegistry(patientRegistry_);
        consentManager = ConsentManager(consentManager_);
        auditLog = AuditLog(auditLog_);
    }

    // ---------------------------------------------------------------------
    // Admin
    // ---------------------------------------------------------------------

    function setAuthorizedSystem(address system, bool authorized) external onlyOwner {
        authorizedSystems[system] = authorized;
        emit SystemAuthorizationChanged(system, authorized);
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    // ---------------------------------------------------------------------
    // Writes
    // ---------------------------------------------------------------------

    /// @notice Anchor a record hash on-chain.
    function registerRecord(
        bytes32 patientId,
        bytes32 recordId,
        bytes32 recordType,
        bytes32 contentHash,
        bytes32 storageLocatorHash
    ) external onlyAuthorizedFor(patientId) whenNotPaused returns (uint32 version) {
        if (contentHash == bytes32(0)) revert EmptyContentHash();
        if (_records[recordId].createdAt != 0) revert RecordAlreadyExists(recordId);

        _records[recordId] = MedicalRecord({
            recordId: recordId,
            patientId: patientId,
            recordType: recordType,
            contentHash: contentHash,
            storageLocatorHash: storageLocatorHash,
            recordedBy: msg.sender,
            createdAt: uint64(block.timestamp),
            updatedAt: uint64(block.timestamp),
            version: 1,
            superseded: false
        });
        _recordsByPatient[patientId].push(recordId);
        recordCount++;

        emit RecordRegistered(recordId, patientId, recordType, contentHash, msg.sender, 1, block.timestamp);
        auditLog.logAction(
            msg.sender,
            patientId,
            keccak256("RECORD_REGISTERED"),
            keccak256(abi.encode(recordId, recordType, contentHash))
        );
        return 1;
    }

    /// @notice Replace a record's content hash, preserving an auditable version bump.
    function supersedeRecord(
        bytes32 recordId,
        bytes32 newContentHash,
        bytes32 newStorageLocatorHash
    ) external returns (uint32 newVersion) {
        MedicalRecord storage r = _records[recordId];
        if (r.createdAt == 0) revert RecordNotFound(recordId);
        if (newContentHash == bytes32(0)) revert EmptyContentHash();
        if (!_isAuthorizedFor(r.patientId, msg.sender)) {
            revert UnauthorizedForPatient(r.patientId, msg.sender);
        }

        bytes32 previous = r.contentHash;
        r.contentHash = newContentHash;
        if (newStorageLocatorHash != bytes32(0)) r.storageLocatorHash = newStorageLocatorHash;
        r.version += 1;
        r.updatedAt = uint64(block.timestamp);
        newVersion = r.version;

        emit RecordSuperseded(recordId, r.patientId, previous, newContentHash, newVersion, block.timestamp);
        auditLog.logAction(
            msg.sender,
            r.patientId,
            keccak256("RECORD_SUPERSEDED"),
            keccak256(abi.encode(recordId, previous, newContentHash, newVersion))
        );
    }

    // ---------------------------------------------------------------------
    // Views / verification
    // ---------------------------------------------------------------------

    function _isAuthorizedFor(bytes32 patientId, address account) internal view returns (bool) {
        if (authorizedSystems[account] || account == owner()) return true;
        if (patientRegistry.isPatientWallet(patientId, account)) return true;
        return consentManager.hasActiveConsent(patientId, account);
    }

    /// @notice Public authorization probe (does not revert).
    function isAuthorizedForPatient(bytes32 patientId, address account) external view returns (bool) {
        return _isAuthorizedFor(patientId, account);
    }

    /// @notice Compare a candidate hash against the anchored hash.
    function verifyRecord(
        bytes32 recordId,
        bytes32 candidateHash
    ) external view returns (VerificationResult memory result) {
        MedicalRecord storage r = _records[recordId];
        result.exists = r.createdAt != 0;
        result.onChainHash = r.contentHash;
        result.version = r.version;
        result.createdAt = r.createdAt;
        result.updatedAt = r.updatedAt;
        result.matches = result.exists && r.contentHash == candidateHash;
    }

    /// @notice Log an explicit verification event for the audit trail.
    function verifyAndLog(bytes32 recordId, bytes32 candidateHash) external returns (bool matches) {
        MedicalRecord storage r = _records[recordId];
        if (r.createdAt == 0) revert RecordNotFound(recordId);
        matches = r.contentHash == candidateHash;
        emit RecordVerified(recordId, r.patientId, matches, msg.sender, block.timestamp);
        auditLog.logAction(
            msg.sender,
            r.patientId,
            matches ? ACTION_VERIFIED_OK : ACTION_VERIFIED_MISMATCH,
            keccak256(abi.encode(recordId, candidateHash))
        );
    }

    function getRecord(bytes32 recordId) external view returns (MedicalRecord memory) {
        MedicalRecord storage r = _records[recordId];
        if (r.createdAt == 0) revert RecordNotFound(recordId);
        return r;
    }

    function recordIdsOfPatient(bytes32 patientId) external view returns (bytes32[] memory) {
        return _recordsByPatient[patientId];
    }

    function recordsOfPatient(
        bytes32 patientId,
        uint256 offset,
        uint256 limit
    ) external view returns (MedicalRecord[] memory page) {
        bytes32[] storage ids = _recordsByPatient[patientId];
        uint256 total = ids.length;
        if (offset >= total) return new MedicalRecord[](0);
        uint256 available = total - offset;
        uint256 size = limit > available ? available : limit;
        page = new MedicalRecord[](size);
        for (uint256 i = 0; i < size; i++) {
            page[i] = _records[ids[offset + i]];
        }
    }

    function contentHashOf(bytes32 recordId) external view returns (bytes32) {
        return _records[recordId].contentHash;
    }
}
