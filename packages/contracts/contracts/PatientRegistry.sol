// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable2Step, Ownable} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {AuditLog} from "./AuditLog.sol";

/// @title PatientRegistry
/// @notice Registers patients against **pseudonymous** identifiers and links each
///         identifier to the patient's wallet address.
/// @dev    PRIVACY: no names, dates of birth, addresses or any other identifying
///         information is stored. `profileHash` is the keccak256 of a canonical JSON
///         document kept off-chain; only the hash lives on-chain.
contract PatientRegistry is Ownable2Step, Pausable {
    // ---------------------------------------------------------------------
    // Types
    // ---------------------------------------------------------------------

    enum PatientStatus {
        Unregistered, // 0 — never seen on-chain
        Active, //  1 — enrolled and in good standing
        Paused, //  2 — temporarily frozen (owner action)
        Closed //   3 — withdrawn / archived
    }

    struct Patient {
        bytes32 patientId;
        address wallet;
        string pseudonym;
        bytes32 profileHash;
        uint64 registeredAt;
        uint64 updatedAt;
        PatientStatus status;
    }

    /// @dev Domain separator used when deriving the pseudonymous patient id.
    bytes32 public constant PATIENT_ID_SALT = keccak256("BREASTCARE_AI.PATIENT_V1");

    // ---------------------------------------------------------------------
    // Storage
    // ---------------------------------------------------------------------

    AuditLog public immutable auditLog;

    mapping(bytes32 patientId => Patient patient) private _patients;
    mapping(address wallet => bytes32 patientId) public patientIdByWallet;
    bytes32[] private _patientIds;
    mapping(address system => bool authorized) public authorizedSystems;

    // ---------------------------------------------------------------------
    // Events
    // ---------------------------------------------------------------------

    event PatientRegistered(
        bytes32 indexed patientId,
        address indexed wallet,
        string pseudonym,
        bytes32 profileHash,
        uint256 timestamp
    );
    event PatientWalletUpdated(bytes32 indexed patientId, address indexed previousWallet, address indexed newWallet, uint256 timestamp);
    event PatientPseudonymUpdated(bytes32 indexed patientId, string pseudonym);
    event PatientProfileHashUpdated(bytes32 indexed patientId, bytes32 profileHash, uint256 timestamp);
    event PatientStatusChanged(bytes32 indexed patientId, PatientStatus indexed status, address indexed changedBy, uint256 timestamp);
    event SystemAuthorizationChanged(address indexed system, bool authorized);

    // ---------------------------------------------------------------------
    // Errors
    // ---------------------------------------------------------------------

    error NotRegistered(bytes32 patientId);
    error AlreadyRegistered(address wallet);
    error NotPatientWallet(bytes32 patientId, address caller);
    error UnauthorizedSystem();
    error EmptyPseudonym();
    error InvalidWallet();
    error SameWallet();
    error UnknownPatientStatus();

    // ---------------------------------------------------------------------
    // Modifiers
    // ---------------------------------------------------------------------

    modifier onlySystem() {
        if (!authorizedSystems[msg.sender] && msg.sender != owner()) revert UnauthorizedSystem();
        _;
    }

    modifier onlyPatient(bytes32 patientId) {
        Patient storage p = _patients[patientId];
        if (p.registeredAt == 0) revert NotRegistered(patientId);
        if (p.wallet != msg.sender) revert NotPatientWallet(patientId, msg.sender);
        _;
    }

    // ---------------------------------------------------------------------
    // Constructor
    // ---------------------------------------------------------------------

    constructor(address initialOwner, address auditLog_) Ownable(initialOwner) {
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

    /// @notice Administrative status change (e.g. withdrawal, data-freeze).
    function setStatus(bytes32 patientId, PatientStatus status) external onlySystem {
        Patient storage p = _patients[patientId];
        if (p.registeredAt == 0) revert NotRegistered(patientId);
        if (uint8(status) > uint8(PatientStatus.Closed)) revert UnknownPatientStatus();
        p.status = status;
        p.updatedAt = uint64(block.timestamp);
        emit PatientStatusChanged(patientId, status, msg.sender, block.timestamp);
    }

    // ---------------------------------------------------------------------
    // Writes
    // ---------------------------------------------------------------------

    /// @notice Self-registration. The patient id is derived from the caller's address,
    ///         so an address can only ever register one pseudonymous identity.
    function registerPatient(
        string calldata pseudonym,
        bytes32 profileHash
    ) external whenNotPaused returns (bytes32 patientId) {
        if (bytes(pseudonym).length == 0) revert EmptyPseudonym();
        if (patientIdByWallet[msg.sender] != bytes32(0)) revert AlreadyRegistered(msg.sender);

        patientId = derivePatientId(msg.sender);
        _patients[patientId] = Patient({
            patientId: patientId,
            wallet: msg.sender,
            pseudonym: pseudonym,
            profileHash: profileHash,
            registeredAt: uint64(block.timestamp),
            updatedAt: uint64(block.timestamp),
            status: PatientStatus.Active
        });
        patientIdByWallet[msg.sender] = patientId;
        _patientIds.push(patientId);

        emit PatientRegistered(patientId, msg.sender, pseudonym, profileHash, block.timestamp);

        auditLog.logAction(
            msg.sender,
            patientId,
            keccak256("PATIENT_REGISTERED"),
            keccak256(abi.encode(patientId, profileHash))
        );
    }

    /// @notice Relayer-assisted registration performed by an authorized platform system.
    function registerPatientFor(
        address wallet,
        string calldata pseudonym,
        bytes32 profileHash
    ) external onlySystem whenNotPaused returns (bytes32 patientId) {
        if (wallet == address(0)) revert InvalidWallet();
        if (bytes(pseudonym).length == 0) revert EmptyPseudonym();
        if (patientIdByWallet[wallet] != bytes32(0)) revert AlreadyRegistered(wallet);

        patientId = derivePatientId(wallet);
        _patients[patientId] = Patient({
            patientId: patientId,
            wallet: wallet,
            pseudonym: pseudonym,
            profileHash: profileHash,
            registeredAt: uint64(block.timestamp),
            updatedAt: uint64(block.timestamp),
            status: PatientStatus.Active
        });
        patientIdByWallet[wallet] = patientId;
        _patientIds.push(patientId);

        emit PatientRegistered(patientId, wallet, pseudonym, profileHash, block.timestamp);
        auditLog.logAction(wallet, patientId, keccak256("PATIENT_REGISTERED"), keccak256(abi.encode(patientId, profileHash)));
    }

    function updatePseudonym(string calldata pseudonym) external onlyPatient(_patientIdOfCaller()) {
        if (bytes(pseudonym).length == 0) revert EmptyPseudonym();
        bytes32 patientId = _patientIdOfCaller();
        _patients[patientId].pseudonym = pseudonym;
        _patients[patientId].updatedAt = uint64(block.timestamp);
        emit PatientPseudonymUpdated(patientId, pseudonym);
    }

    /// @notice Update the off-chain profile's integrity hash.
    function updateProfileHash(bytes32 profileHash) external onlyPatient(_patientIdOfCaller()) {
        bytes32 patientId = _patientIdOfCaller();
        _patients[patientId].profileHash = profileHash;
        _patients[patientId].updatedAt = uint64(block.timestamp);
        emit PatientProfileHashUpdated(patientId, profileHash, block.timestamp);
    }

    /// @notice Move the pseudonymous identity to a new wallet.
    function transferWallet(address newWallet) external onlyPatient(_patientIdOfCaller()) {
        if (newWallet == address(0)) revert InvalidWallet();
        if (newWallet == msg.sender) revert SameWallet();
        if (patientIdByWallet[newWallet] != bytes32(0)) revert AlreadyRegistered(newWallet);

        bytes32 patientId = _patientIdOfCaller();
        delete patientIdByWallet[msg.sender];
        patientIdByWallet[newWallet] = patientId;
        _patients[patientId].wallet = newWallet;
        _patients[patientId].updatedAt = uint64(block.timestamp);

        emit PatientWalletUpdated(patientId, msg.sender, newWallet, block.timestamp);
    }

    // ---------------------------------------------------------------------
    // Views
    // ---------------------------------------------------------------------

    function derivePatientId(address wallet) public pure returns (bytes32) {
        return keccak256(abi.encode(PATIENT_ID_SALT, wallet));
    }

    function isRegistered(bytes32 patientId) public view returns (bool) {
        return _patients[patientId].registeredAt != 0;
    }

    function isActive(bytes32 patientId) public view returns (bool) {
        Patient storage p = _patients[patientId];
        return p.registeredAt != 0 && p.status == PatientStatus.Active;
    }

    function getPatient(bytes32 patientId) external view returns (Patient memory) {
        if (!isRegistered(patientId)) revert NotRegistered(patientId);
        return _patients[patientId];
    }

    function getPatientByWallet(address wallet) external view returns (Patient memory) {
        bytes32 patientId = patientIdByWallet[wallet];
        if (patientId == bytes32(0)) revert NotRegistered(bytes32(0));
        return _patients[patientId];
    }

    /// @notice True when `account` is the wallet bound to `patientId`.
    function isPatientWallet(bytes32 patientId, address account) public view returns (bool) {
        return _patients[patientId].wallet == account && isRegistered(patientId);
    }

    function patientCount() external view returns (uint256) {
        return _patientIds.length;
    }

    function patientIdAt(uint256 index) external view returns (bytes32) {
        return _patientIds[index];
    }

    function _patientIdOfCaller() private view returns (bytes32) {
        bytes32 patientId = patientIdByWallet[msg.sender];
        if (patientId == bytes32(0)) revert NotRegistered(bytes32(0));
        return patientId;
    }
}
