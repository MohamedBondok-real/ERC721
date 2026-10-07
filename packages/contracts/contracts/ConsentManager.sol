// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable2Step, Ownable} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {PatientRegistry} from "./PatientRegistry.sol";
import {AuditLog} from "./AuditLog.sol";

/// @title ConsentManager
/// @notice Records, renews and revokes a patient's consent for healthcare professionals
///         to access their records. This contract is the **access-control root** for the
///         platform: sibling registries query `hasActiveConsent` before allowing reads or
///         writes on a patient's behalf.
/// @dev    PRIVACY: only the pseudonymous patient id, the grantee address, a scope hash
///         and timestamps are stored. The human-readable consent text lives off-chain and
///         is referenced by `scopeHash`.
contract ConsentManager is Ownable2Step, Pausable {
    // ---------------------------------------------------------------------
    // Types
    // ---------------------------------------------------------------------

    struct Consent {
        bytes32 patientId;
        address patient;
        address grantee;
        bytes32 scopeHash;
        uint64 grantedAt;
        uint64 expiresAt; // 0 == never expires
        bool revoked;
        uint64 revokedAt;
    }

    // ---------------------------------------------------------------------
    // Storage
    // ---------------------------------------------------------------------

    PatientRegistry public immutable patientRegistry;
    AuditLog public immutable auditLog;

    mapping(bytes32 patientId => mapping(address grantee => Consent consent)) public consents;
    mapping(bytes32 patientId => address[] grantees) private _grantees;
    mapping(address grantee => bytes32[] patients) private _patientsOfGrantee;
    mapping(address system => bool authorized) public authorizedSystems;

    // ---------------------------------------------------------------------
    // Events
    // ---------------------------------------------------------------------

    event ConsentGranted(
        bytes32 indexed patientId,
        address indexed patient,
        address indexed grantee,
        bytes32 scopeHash,
        uint64 expiresAt,
        uint256 timestamp
    );
    event ConsentRenewed(bytes32 indexed patientId, address indexed grantee, bytes32 scopeHash, uint64 expiresAt, uint256 timestamp);
    event ConsentRevoked(bytes32 indexed patientId, address indexed patient, address indexed grantee, uint256 timestamp);
    event SystemAuthorizationChanged(address indexed system, bool authorized);

    // ---------------------------------------------------------------------
    // Errors
    // ---------------------------------------------------------------------

    error InvalidGrantee();
    error PatientNotRegistered(address patient);
    error NotPatientWallet();
    error UnauthorizedSystem();
    error ConsentNotFound();

    // ---------------------------------------------------------------------
    // Modifiers
    // ---------------------------------------------------------------------

    modifier onlySystem() {
        if (!authorizedSystems[msg.sender] && msg.sender != owner()) revert UnauthorizedSystem();
        _;
    }

    // ---------------------------------------------------------------------
    // Constructor
    // ---------------------------------------------------------------------

    constructor(
        address initialOwner,
        address patientRegistry_,
        address auditLog_
    ) Ownable(initialOwner) {
        patientRegistry = PatientRegistry(patientRegistry_);
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

    /// @notice Grant (or re-grant) access to `grantee`.
    /// @param scopeHash keccak256 of the canonical scope description shown to the patient.
    /// @param expiresAt Unix timestamp after which the consent lapses, or 0 for no expiry.
    function grantConsent(
        address grantee,
        bytes32 scopeHash,
        uint64 expiresAt
    ) external whenNotPaused {
        if (grantee == address(0) || grantee == msg.sender) revert InvalidGrantee();

        bytes32 patientId = patientRegistry.patientIdByWallet(msg.sender);
        if (patientId == bytes32(0)) revert PatientNotRegistered(msg.sender);

        Consent storage existing = consents[patientId][grantee];
        if (existing.grantedAt == 0) {
            consents[patientId][grantee] = Consent({
                patientId: patientId,
                patient: msg.sender,
                grantee: grantee,
                scopeHash: scopeHash,
                grantedAt: uint64(block.timestamp),
                expiresAt: expiresAt,
                revoked: false,
                revokedAt: 0
            });
            _grantees[patientId].push(grantee);
            _patientsOfGrantee[grantee].push(patientId);
            emit ConsentGranted(patientId, msg.sender, grantee, scopeHash, expiresAt, block.timestamp);
        } else {
            existing.scopeHash = scopeHash;
            existing.expiresAt = expiresAt;
            existing.revoked = false;
            existing.revokedAt = 0;
            emit ConsentRenewed(patientId, grantee, scopeHash, expiresAt, block.timestamp);
        }

        auditLog.logAction(
            msg.sender,
            patientId,
            keccak256("CONSENT_GRANTED"),
            keccak256(abi.encode(patientId, grantee, scopeHash))
        );
    }

    /// @notice Relayer-assisted grant executed by an authorized platform system on behalf
    ///         of a patient who has already signed the consent off-chain.
    function grantConsentFor(
        address patient,
        address grantee,
        bytes32 scopeHash,
        uint64 expiresAt
    ) external onlySystem whenNotPaused {
        if (grantee == address(0) || grantee == patient) revert InvalidGrantee();
        bytes32 patientId = patientRegistry.patientIdByWallet(patient);
        if (patientId == bytes32(0)) revert PatientNotRegistered(patient);

        if (consents[patientId][grantee].grantedAt == 0) {
            consents[patientId][grantee] = Consent({
                patientId: patientId,
                patient: patient,
                grantee: grantee,
                scopeHash: scopeHash,
                grantedAt: uint64(block.timestamp),
                expiresAt: expiresAt,
                revoked: false,
                revokedAt: 0
            });
            _grantees[patientId].push(grantee);
            _patientsOfGrantee[grantee].push(patientId);
            emit ConsentGranted(patientId, patient, grantee, scopeHash, expiresAt, block.timestamp);
        } else {
            Consent storage existing = consents[patientId][grantee];
            existing.scopeHash = scopeHash;
            existing.expiresAt = expiresAt;
            existing.revoked = false;
            emit ConsentRenewed(patientId, grantee, scopeHash, expiresAt, block.timestamp);
        }

        auditLog.logAction(patient, patientId, keccak256("CONSENT_GRANTED"), keccak256(abi.encode(patientId, grantee, scopeHash)));
    }

    /// @notice Revoke a grantee's access. Revocation is immediate and permanent until
    ///         the patient grants consent again.
    function revokeConsent(address grantee) external {
        bytes32 patientId = patientRegistry.patientIdByWallet(msg.sender);
        if (patientId == bytes32(0)) revert PatientNotRegistered(msg.sender);
        _revoke(patientId, msg.sender, grantee);
    }

    /// @notice Owner emergency revocation (e.g. compromised professional account).
    function emergencyRevoke(bytes32 patientId, address grantee) external onlySystem {
        PatientRegistry.Patient memory p = patientRegistry.getPatient(patientId);
        _revoke(patientId, p.wallet, grantee);
    }

    function _revoke(bytes32 patientId, address patient, address grantee) internal {
        Consent storage c = consents[patientId][grantee];
        if (c.grantedAt == 0) revert ConsentNotFound();
        if (c.revoked) return; // idempotent

        c.revoked = true;
        c.revokedAt = uint64(block.timestamp);

        emit ConsentRevoked(patientId, patient, grantee, block.timestamp);
        auditLog.logAction(patient, patientId, keccak256("CONSENT_REVOKED"), keccak256(abi.encode(patientId, grantee)));
    }

    // ---------------------------------------------------------------------
    // Views
    // ---------------------------------------------------------------------

    /// @notice Authoritative access check used by every sibling registry.
    function hasActiveConsent(bytes32 patientId, address grantee) public view returns (bool) {
        Consent storage c = consents[patientId][grantee];
        if (c.grantedAt == 0 || c.revoked) return false;
        if (c.expiresAt != 0 && block.timestamp > c.expiresAt) return false;
        return true;
    }

    function getConsent(bytes32 patientId, address grantee) external view returns (Consent memory) {
        Consent storage c = consents[patientId][grantee];
        if (c.grantedAt == 0) revert ConsentNotFound();
        return c;
    }

    function granteesOf(bytes32 patientId) external view returns (address[] memory) {
        return _grantees[patientId];
    }

    function patientsOf(address grantee) external view returns (bytes32[] memory) {
        return _patientsOfGrantee[grantee];
    }

    /// @notice The set of patients that currently grant `grantee` active access.
    function activePatientsOf(address grantee) external view returns (bytes32[] memory active) {
        bytes32[] storage all = _patientsOfGrantee[grantee];
        uint256 count = 0;
        for (uint256 i = 0; i < all.length; i++) {
            if (hasActiveConsent(all[i], grantee)) count++;
        }
        active = new bytes32[](count);
        uint256 cursor = 0;
        for (uint256 i = 0; i < all.length; i++) {
            if (hasActiveConsent(all[i], grantee)) {
                active[cursor++] = all[i];
            }
        }
    }

    /// @notice Canonical scope hash helper so every client derives scopes identically.
    function scopeHashFor(string calldata scopeName, string calldata description) external pure returns (bytes32) {
        return keccak256(abi.encodePacked("BREASTCARE_CONSENT_V1", scopeName, description));
    }
}
