// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable2Step, Ownable} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";

/// @title AuditLog
/// @notice Append-only, immutable audit trail for the BreastCare AI platform.
/// @dev    Only authorized platform systems and the other BreastCare registries may
///         append entries. There are deliberately **no** update or delete functions:
///         the trail is immutable once written.
///
///         PRIVACY: entries store only 32-byte hashes and addresses. Human-readable
///         medical data must never be passed to this contract.
contract AuditLog is Ownable2Step, Pausable {
    // ---------------------------------------------------------------------
    // Types
    // ---------------------------------------------------------------------

    /// @param entryId    Sequential id of the entry.
    /// @param actor      Account that performed the action (user or system).
    /// @param patientId  Pseudonymous patient identifier (bytes32), zero if not patient-scoped.
    /// @param action     keccak256 of a canonical action name, e.g. keccak256("RECORD_CREATED").
    /// @param dataHash   keccak256 of the canonical payload that was acted upon.
    /// @param source     Address of the contract/system that emitted the entry.
    /// @param timestamp  Block timestamp of the entry.
    struct AuditEntry {
        uint256 entryId;
        address actor;
        bytes32 patientId;
        bytes32 action;
        bytes32 dataHash;
        address source;
        uint64 timestamp;
    }

    // ---------------------------------------------------------------------
    // Storage
    // ---------------------------------------------------------------------

    AuditEntry[] private _entries;
    mapping(bytes32 patientId => uint256[] entryIds) private _entriesByPatient;
    mapping(address actor => uint256[] entryIds) private _entriesByActor;
    mapping(address system => bool authorized) public authorizedSystems;
    mapping(bytes32 dataHash => uint256[] entryIds) private _entriesByDataHash;

    // ---------------------------------------------------------------------
    // Events
    // ---------------------------------------------------------------------

    event AuditRecorded(
        uint256 indexed entryId,
        address indexed actor,
        bytes32 indexed patientId,
        bytes32 action,
        bytes32 dataHash,
        address source,
        uint256 timestamp
    );
    event SystemAuthorizationChanged(address indexed system, bool authorized);

    // ---------------------------------------------------------------------
    // Errors
    // ---------------------------------------------------------------------

    error UnauthorizedWriter();
    error ZeroAction();

    // ---------------------------------------------------------------------
    // Modifiers
    // ---------------------------------------------------------------------

    modifier onlyAuthorizedWriter() {
        if (!authorizedSystems[msg.sender] && msg.sender != owner()) {
            revert UnauthorizedWriter();
        }
        _;
    }

    // ---------------------------------------------------------------------
    // Constructor
    // ---------------------------------------------------------------------

    constructor(address initialOwner) Ownable(initialOwner) {}

    // ---------------------------------------------------------------------
    // Admin
    // ---------------------------------------------------------------------

    /// @notice Authorize (or de-authorize) a platform system that may append entries.
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

    /// @notice Append an entry on behalf of `actor`.
    /// @dev    Callable by authorized systems (the backend relayer) and sibling registries.
    function logAction(
        address actor,
        bytes32 patientId,
        bytes32 action,
        bytes32 dataHash
    ) external onlyAuthorizedWriter whenNotPaused returns (uint256 entryId) {
        return _append(actor, patientId, action, dataHash, msg.sender);
    }

    /// @notice Append a self-attributed entry. Any account may record an entry about
    ///         an action it performed itself; this keeps the trail permissionless for
    ///         direct user actions while remaining attributable.
    function logSelfAction(
        bytes32 patientId,
        bytes32 action,
        bytes32 dataHash
    ) external whenNotPaused returns (uint256 entryId) {
        return _append(msg.sender, patientId, action, dataHash, msg.sender);
    }

    function _append(
        address actor,
        bytes32 patientId,
        bytes32 action,
        bytes32 dataHash,
        address source
    ) internal returns (uint256 entryId) {
        if (action == bytes32(0)) revert ZeroAction();

        entryId = _entries.length;
        _entries.push(
            AuditEntry({
                entryId: entryId,
                actor: actor,
                patientId: patientId,
                action: action,
                dataHash: dataHash,
                source: source,
                timestamp: uint64(block.timestamp)
            })
        );
        if (patientId != bytes32(0)) {
            _entriesByPatient[patientId].push(entryId);
        }
        _entriesByActor[actor].push(entryId);
        if (dataHash != bytes32(0)) {
            _entriesByDataHash[dataHash].push(entryId);
        }

        emit AuditRecorded(entryId, actor, patientId, action, dataHash, source, block.timestamp);
    }

    // ---------------------------------------------------------------------
    // Views
    // ---------------------------------------------------------------------

    function entryCount() external view returns (uint256) {
        return _entries.length;
    }

    function getEntry(uint256 entryId) external view returns (AuditEntry memory) {
        if (entryId >= _entries.length) revert UnauthorizedWriter();
        return _entries[entryId];
    }

    function entriesForPatient(
        bytes32 patientId,
        uint256 offset,
        uint256 limit
    ) external view returns (AuditEntry[] memory page) {
        return _paginate(_entriesByPatient[patientId], offset, limit);
    }

    function countForPatient(bytes32 patientId) external view returns (uint256) {
        return _entriesByPatient[patientId].length;
    }

    function entriesByActor(
        address actor,
        uint256 offset,
        uint256 limit
    ) external view returns (AuditEntry[] memory page) {
        return _paginate(_entriesByActor[actor], offset, limit);
    }

    function entriesByDataHash(bytes32 dataHash) external view returns (uint256[] memory) {
        return _entriesByDataHash[dataHash];
    }

    function recentEntries(uint256 limit) external view returns (AuditEntry[] memory page) {
        uint256 total = _entries.length;
        uint256 size = limit > total ? total : limit;
        page = new AuditEntry[](size);
        for (uint256 i = 0; i < size; i++) {
            page[i] = _entries[total - size + i];
        }
    }

    function _paginate(
        uint256[] storage ids,
        uint256 offset,
        uint256 limit
    ) private view returns (AuditEntry[] memory page) {
        uint256 total = ids.length;
        if (offset >= total) return new AuditEntry[](0);
        uint256 available = total - offset;
        uint256 size = limit > available ? available : limit;
        page = new AuditEntry[](size);
        for (uint256 i = 0; i < size; i++) {
            page[i] = _entries[ids[offset + i]];
        }
    }
}
