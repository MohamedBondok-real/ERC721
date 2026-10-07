// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable2Step, Ownable} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {PatientRegistry} from "./PatientRegistry.sol";
import {ConsentManager} from "./ConsentManager.sol";
import {AuditLog} from "./AuditLog.sol";

/// @title TreatmentRegistry
/// @notice Anchors treatment-plan integrity and records clinician authorization plus
///         status transitions.
/// @dev    PRIVACY: plan documents, dosages and clinical notes stay off-chain. Only
///         hashes, modality identifiers, addresses and statuses are stored.
///
///         SAFETY: this contract records what clinicians decided. It never recommends a
///         treatment, and no logic here may be interpreted as medical advice.
contract TreatmentRegistry is Ownable2Step, Pausable {
    // ---------------------------------------------------------------------
    // Types
    // ---------------------------------------------------------------------

    enum TreatmentStatus {
        Proposed, //  0 — drafted by a clinician, awaiting authorization
        Authorized, // 1 — clinician authorization recorded
        Active, //   2 — in progress
        OnHold, //   3 — temporarily paused
        Completed, // 4 — finished
        Cancelled //  5 — abandoned
    }

    struct TreatmentPlan {
        bytes32 planId;
        bytes32 patientId;
        bytes32 modality; // keccak256 of "CHEMOTHERAPY" | "SURGERY" | ...
        bytes32 planHash; // keccak256 of the off-chain plan document
        address proposedBy;
        address authorizedBy;
        uint64 createdAt;
        uint64 updatedAt;
        uint64 authorizedAt;
        uint32 version;
        TreatmentStatus status;
    }

    // ---------------------------------------------------------------------
    // Storage
    // ---------------------------------------------------------------------

    PatientRegistry public immutable patientRegistry;
    ConsentManager public immutable consentManager;
    AuditLog public immutable auditLog;

    mapping(bytes32 planId => TreatmentPlan plan) private _plans;
    mapping(bytes32 patientId => bytes32[] planIds) private _plansByPatient;
    mapping(address system => bool authorized) public authorizedSystems;
    uint256 public planCount;

    // ---------------------------------------------------------------------
    // Events
    // ---------------------------------------------------------------------

    event TreatmentPlanRegistered(
        bytes32 indexed planId,
        bytes32 indexed patientId,
        bytes32 indexed modality,
        bytes32 planHash,
        address proposedBy,
        uint256 timestamp
    );
    event TreatmentAuthorized(bytes32 indexed planId, bytes32 indexed patientId, address indexed doctor, uint256 timestamp);
    event TreatmentStatusUpdated(bytes32 indexed planId, bytes32 indexed patientId, TreatmentStatus indexed status, bytes32 noteHash, address updatedBy, uint256 timestamp);
    event TreatmentPlanAmended(bytes32 indexed planId, bytes32 indexed patientId, bytes32 previousHash, bytes32 newHash, uint32 version, uint256 timestamp);
    event TreatmentAcknowledged(bytes32 indexed planId, bytes32 indexed patientId, bytes32 acknowledgementHash, uint256 timestamp);
    event SystemAuthorizationChanged(address indexed system, bool authorized);

    // ---------------------------------------------------------------------
    // Errors
    // ---------------------------------------------------------------------

    error PlanNotFound(bytes32 planId);
    error PlanAlreadyExists(bytes32 planId);
    error UnauthorizedForPatient(bytes32 patientId, address caller);
    error NotTreatingDoctor(bytes32 planId, address caller);
    error NotPatientWallet(bytes32 patientId, address caller);
    error UnauthorizedSystem();
    error EmptyPlanHash();
    error InvalidTransition(TreatmentStatus current, TreatmentStatus requested);
    error AlreadyAuthorized();

    // ---------------------------------------------------------------------
    // Modifiers
    // ---------------------------------------------------------------------

    modifier onlySystem() {
        if (!authorizedSystems[msg.sender] && msg.sender != owner()) revert UnauthorizedSystem();
        _;
    }

    modifier onlyAuthorizedFor(bytes32 patientId) {
        if (!_isAuthorizedFor(patientId, msg.sender)) revert UnauthorizedForPatient(patientId, msg.sender);
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

    /// @notice Register a clinician-drafted treatment plan.
    function registerTreatmentPlan(
        bytes32 patientId,
        bytes32 planId,
        bytes32 modality,
        bytes32 planHash,
        address proposingDoctor
    ) external onlyAuthorizedFor(patientId) whenNotPaused returns (uint32 version) {
        if (planHash == bytes32(0)) revert EmptyPlanHash();
        if (_plans[planId].createdAt != 0) revert PlanAlreadyExists(planId);

        _plans[planId] = TreatmentPlan({
            planId: planId,
            patientId: patientId,
            modality: modality,
            planHash: planHash,
            proposedBy: proposingDoctor == address(0) ? msg.sender : proposingDoctor,
            authorizedBy: address(0),
            createdAt: uint64(block.timestamp),
            updatedAt: uint64(block.timestamp),
            authorizedAt: 0,
            version: 1,
            status: TreatmentStatus.Proposed
        });
        _plansByPatient[patientId].push(planId);
        planCount++;

        emit TreatmentPlanRegistered(planId, patientId, modality, planHash, _plans[planId].proposedBy, block.timestamp);
        auditLog.logAction(
            msg.sender,
            patientId,
            keccak256("TREATMENT_PROPOSED"),
            keccak256(abi.encode(planId, modality, planHash))
        );
        return 1;
    }

    /// @notice Record a treating doctor's authorization of a proposed plan.
    /// @dev    Only the proposing doctor, a professional holding active consent for the
    ///         patient, or an authorized system may authorize.
    function authorizeTreatmentPlan(bytes32 planId) external {
        TreatmentPlan storage p = _plans[planId];
        if (p.createdAt == 0) revert PlanNotFound(planId);
        if (p.authorizedAt != 0) revert AlreadyAuthorized();
        bool isProposer = msg.sender == p.proposedBy;
        bool hasConsent = consentManager.hasActiveConsent(p.patientId, msg.sender);
        bool isSystem = authorizedSystems[msg.sender] || msg.sender == owner();
        if (!isProposer && !hasConsent && !isSystem) {
            revert UnauthorizedForPatient(p.patientId, msg.sender);
        }

        p.authorizedBy = msg.sender;
        p.authorizedAt = uint64(block.timestamp);
        p.updatedAt = p.authorizedAt;
        p.status = TreatmentStatus.Authorized;

        emit TreatmentAuthorized(planId, p.patientId, msg.sender, block.timestamp);
        auditLog.logAction(
            msg.sender,
            p.patientId,
            keccak256("TREATMENT_AUTHORIZED"),
            keccak256(abi.encode(planId, p.planHash))
        );
    }

    /// @notice Move a plan through its lifecycle.
    function updateTreatmentStatus(
        bytes32 planId,
        TreatmentStatus status,
        bytes32 noteHash
    ) external {
        TreatmentPlan storage p = _plans[planId];
        if (p.createdAt == 0) revert PlanNotFound(planId);
        if (!_isAuthorizedFor(p.patientId, msg.sender)) revert UnauthorizedForPatient(p.patientId, msg.sender);
        if (!_isValidTransition(p.status, status)) revert InvalidTransition(p.status, status);

        TreatmentStatus previous = p.status;
        p.status = status;
        p.updatedAt = uint64(block.timestamp);

        emit TreatmentStatusUpdated(planId, p.patientId, status, noteHash, msg.sender, block.timestamp);
        auditLog.logAction(
            msg.sender,
            p.patientId,
            keccak256("TREATMENT_STATUS_UPDATED"),
            keccak256(abi.encode(planId, uint8(previous), uint8(status), noteHash))
        );
    }

    /// @notice Amend the anchored plan document (version bump, full history in events).
    function amendTreatmentPlan(
        bytes32 planId,
        bytes32 newPlanHash
    ) external returns (uint32 newVersion) {
        TreatmentPlan storage p = _plans[planId];
        if (p.createdAt == 0) revert PlanNotFound(planId);
        if (!_isAuthorizedFor(p.patientId, msg.sender)) revert UnauthorizedForPatient(p.patientId, msg.sender);
        if (newPlanHash == bytes32(0)) revert EmptyPlanHash();

        bytes32 previous = p.planHash;
        p.planHash = newPlanHash;
        p.version += 1;
        p.updatedAt = uint64(block.timestamp);
        newVersion = p.version;

        emit TreatmentPlanAmended(planId, p.patientId, previous, newPlanHash, newVersion, block.timestamp);
        auditLog.logAction(
            msg.sender,
            p.patientId,
            keccak256("TREATMENT_AMENDED"),
            keccak256(abi.encode(planId, previous, newPlanHash, newVersion))
        );
    }

    /// @notice Patient acknowledgement of a plan (informed-consent checkpoint).
    function acknowledgeTreatmentPlan(bytes32 planId, bytes32 acknowledgementHash) external {
        TreatmentPlan storage p = _plans[planId];
        if (p.createdAt == 0) revert PlanNotFound(planId);
        if (!patientRegistry.isPatientWallet(p.patientId, msg.sender)) {
            revert NotPatientWallet(p.patientId, msg.sender);
        }

        emit TreatmentAcknowledged(planId, p.patientId, acknowledgementHash, block.timestamp);
        auditLog.logAction(
            msg.sender,
            p.patientId,
            keccak256("TREATMENT_ACKNOWLEDGED"),
            keccak256(abi.encode(planId, acknowledgementHash))
        );
    }

    // ---------------------------------------------------------------------
    // Views
    // ---------------------------------------------------------------------

    function _isAuthorizedFor(bytes32 patientId, address account) internal view returns (bool) {
        if (authorizedSystems[account] || account == owner()) return true;
        if (patientRegistry.isPatientWallet(patientId, account)) return true;
        return consentManager.hasActiveConsent(patientId, account);
    }

    function isAuthorizedForPatient(bytes32 patientId, address account) external view returns (bool) {
        return _isAuthorizedFor(patientId, account);
    }

    function _isValidTransition(TreatmentStatus from, TreatmentStatus to) internal pure returns (bool) {
        if (from == to) return true;
        if (from == TreatmentStatus.Proposed) {
            return to == TreatmentStatus.Authorized || to == TreatmentStatus.Active || to == TreatmentStatus.Cancelled;
        }
        if (from == TreatmentStatus.Authorized) {
            return to == TreatmentStatus.Active || to == TreatmentStatus.OnHold || to == TreatmentStatus.Cancelled;
        }
        if (from == TreatmentStatus.Active) {
            return to == TreatmentStatus.OnHold || to == TreatmentStatus.Completed || to == TreatmentStatus.Cancelled;
        }
        if (from == TreatmentStatus.OnHold) {
            return to == TreatmentStatus.Active || to == TreatmentStatus.Cancelled;
        }
        // Completed and Cancelled are terminal.
        return false;
    }

    function getTreatmentPlan(bytes32 planId) external view returns (TreatmentPlan memory) {
        TreatmentPlan storage p = _plans[planId];
        if (p.createdAt == 0) revert PlanNotFound(planId);
        return p;
    }

    function planIdsOfPatient(bytes32 patientId) external view returns (bytes32[] memory) {
        return _plansByPatient[patientId];
    }

    function plansOfPatient(bytes32 patientId) external view returns (TreatmentPlan[] memory list) {
        bytes32[] storage ids = _plansByPatient[patientId];
        list = new TreatmentPlan[](ids.length);
        for (uint256 i = 0; i < ids.length; i++) {
            list[i] = _plans[ids[i]];
        }
    }

    function verifyPlan(bytes32 planId, bytes32 candidateHash) external view returns (bool exists, bool matches, uint32 version) {
        TreatmentPlan storage p = _plans[planId];
        exists = p.createdAt != 0;
        version = p.version;
        matches = exists && p.planHash == candidateHash;
    }
}
