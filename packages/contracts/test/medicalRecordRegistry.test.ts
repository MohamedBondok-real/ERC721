import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { deploySuite, grantConsent, registerPatient, ZERO_BYTES32, type Suite } from "./helpers/suite";
import { parseEvents, resetChain, signer, expectRevert} from "./helpers/chain";

const RECORD_ID = "0x" + "aa".repeat(32);
const RECORD_TYPE = "0x" + "bb".repeat(32);
const CONTENT_HASH = "0x" + "cc".repeat(32);
const LOCATOR_HASH = "0x" + "dd".repeat(32);

describe("MedicalRecordRegistry", () => {
  let suite: Suite;
  let patientId: string;
  let patient: Awaited<ReturnType<typeof signer>>;
  let doctor: Awaited<ReturnType<typeof signer>>;
  let doctorAddress: string;

  beforeAll(async () => {
    await resetChain();
    suite = await deploySuite();
  });

  beforeEach(async () => {
    await resetChain();
    suite = await deploySuite();
    const registered = await registerPatient(suite, 3, "record-patient");
    patientId = registered.patientId;
    patient = registered.signer;
    doctor = await signer(4);
    doctorAddress = await doctor.getAddress();
  });

  async function register(recordId = RECORD_ID) {
    return suite.medicalRecordRegistry
      .connect(patient)
      .registerRecord(patientId, recordId, RECORD_TYPE, CONTENT_HASH, LOCATOR_HASH);
  }

  it("anchors a record hash and verifies it byte-for-byte", async () => {
    const tx = await register();
    const events = parseEvents(suite.medicalRecordRegistry, await tx.wait());
    expect(events.map((e) => e.name)).toContain("RecordRegistered");

    const verification = await suite.medicalRecordRegistry.verifyRecord(RECORD_ID, CONTENT_HASH);
    expect(verification.exists).toBe(true);
    expect(verification.matches).toBe(true);
    expect(verification.version).toBe(1n);
    expect(verification.onChainHash).toBe(CONTENT_HASH);

    const record = await suite.medicalRecordRegistry.getRecord(RECORD_ID);
    expect(record.patientId).toBe(patientId);
    expect(record.storageLocatorHash).toBe(LOCATOR_HASH);
    expect(record.recordedBy).toBe(await patient.getAddress());
    expect(await suite.medicalRecordRegistry.recordCount()).toBe(1n);
  });

  it("reports a mismatch when the record has been altered off-chain", async () => {
    await (await register()).wait();
    const tampered = "0x" + "99".repeat(32);
    const verification = await suite.medicalRecordRegistry.verifyRecord(RECORD_ID, tampered);
    expect(verification.exists).toBe(true);
    expect(verification.matches).toBe(false);
  });

  it("logs a verification event and an audit entry for both outcomes", async () => {
    await (await register()).wait();

    const okTx = await suite.medicalRecordRegistry.connect(patient).verifyAndLog(RECORD_ID, CONTENT_HASH);
    const okEvents = parseEvents(suite.medicalRecordRegistry, await okTx.wait());
    expect(okEvents[0]?.name).toBe("RecordVerified");
    expect(okEvents[0]?.args.matches).toBe(true);

    const badTx = await suite.medicalRecordRegistry.connect(patient).verifyAndLog(RECORD_ID, "0x" + "99".repeat(32));
    const badEvents = parseEvents(suite.medicalRecordRegistry, await badTx.wait());
    expect(badEvents[0]?.args.matches).toBe(false);

    const actions = (await suite.auditLog.recentEntries(10)).map((entry: { action: string }) => entry.action);
    const { ethers } = await import("ethers");
    expect(actions).toContain(ethers.keccak256(ethers.toUtf8Bytes("RECORD_VERIFIED_OK")));
    expect(actions).toContain(ethers.keccak256(ethers.toUtf8Bytes("RECORD_VERIFIED_MISMATCH")));
  });

  it("lets a doctor with active consent register a record for the patient", async () => {
    await grantConsent(suite, patient, doctorAddress);
    expect(await suite.medicalRecordRegistry.isAuthorizedForPatient(patientId, doctorAddress)).toBe(true);

    const tx = await suite.medicalRecordRegistry
      .connect(doctor)
      .registerRecord(patientId, "0x" + "12".repeat(32), RECORD_TYPE, CONTENT_HASH, LOCATOR_HASH);
    expect(parseEvents(suite.medicalRecordRegistry, await tx.wait()).map((e) => e.name)).toContain("RecordRegistered");
  });

  it("rejects a doctor who has never been granted consent", async () => {
    expect(await suite.medicalRecordRegistry.isAuthorizedForPatient(patientId, doctorAddress)).toBe(false);
    await expectRevert(suite.medicalRecordRegistry
        .connect(doctor)
        .registerRecord(patientId, "0x" + "13".repeat(32), RECORD_TYPE, CONTENT_HASH, LOCATOR_HASH), "UnauthorizedForPatient");
  });

  it("rejects the same doctor the moment consent is revoked", async () => {
    await grantConsent(suite, patient, doctorAddress);
    await (await suite.consentManager.connect(patient).revokeConsent(doctorAddress)).wait();

    await expectRevert(suite.medicalRecordRegistry
        .connect(doctor)
        .registerRecord(patientId, "0x" + "14".repeat(32), RECORD_TYPE, CONTENT_HASH, LOCATOR_HASH), "UnauthorizedForPatient");
  });

  it("rejects an unrelated third party entirely", async () => {
    const stranger = await signer(9);
    await expectRevert(suite.medicalRecordRegistry
        .connect(stranger)
        .registerRecord(patientId, "0x" + "15".repeat(32), RECORD_TYPE, CONTENT_HASH, LOCATOR_HASH), "UnauthorizedForPatient");
  });

  it("rejects duplicate record ids and empty content hashes", async () => {
    await (await register()).wait();
    await expectRevert(register(), "RecordAlreadyExists");
    await expectRevert(suite.medicalRecordRegistry.connect(patient).registerRecord(patientId, "0x" + "16".repeat(32), RECORD_TYPE, ZERO_BYTES32, LOCATOR_HASH), "EmptyContentHash");
  });

  it("supersedes a record with a version bump and invalidates the old hash", async () => {
    await (await register()).wait();
    const newHash = "0x" + "77".repeat(32);

    const tx = await suite.medicalRecordRegistry.connect(patient).supersedeRecord(RECORD_ID, newHash, LOCATOR_HASH);
    const events = parseEvents(suite.medicalRecordRegistry, await tx.wait());
    expect(events.map((e) => e.name)).toContain("RecordSuperseded");

    expect((await suite.medicalRecordRegistry.verifyRecord(RECORD_ID, newHash)).matches).toBe(true);
    expect((await suite.medicalRecordRegistry.verifyRecord(RECORD_ID, CONTENT_HASH)).matches).toBe(false);
    expect((await suite.medicalRecordRegistry.getRecord(RECORD_ID)).version).toBe(2n);

    // A second amendment bumps again — history is preserved in events, not overwritten silently.
    await (await suite.medicalRecordRegistry.connect(patient).supersedeRecord(RECORD_ID, "0x" + "78".repeat(32), LOCATOR_HASH)).wait();
    expect((await suite.medicalRecordRegistry.getRecord(RECORD_ID)).version).toBe(3n);
  });

  it("blocks supersession by an account without consent", async () => {
    await (await register()).wait();
    await expectRevert(suite.medicalRecordRegistry.connect(doctor).supersedeRecord(RECORD_ID, "0x" + "88".repeat(32), ZERO_BYTES32), "UnauthorizedForPatient");
  });

  it("paginates a patient's records", async () => {
    for (let i = 0; i < 5; i++) {
      const id = "0x" + i.toString(16).padStart(2, "0").repeat(32);
      await (
        await suite.medicalRecordRegistry
          .connect(patient)
          .registerRecord(patientId, id, RECORD_TYPE, CONTENT_HASH, LOCATOR_HASH)
      ).wait();
    }
    expect((await suite.medicalRecordRegistry.recordIdsOfPatient(patientId)).length).toBe(5);
    expect((await suite.medicalRecordRegistry.recordsOfPatient(patientId, 0, 2)).length).toBe(2);
    expect((await suite.medicalRecordRegistry.recordsOfPatient(patientId, 3, 10)).length).toBe(2);
    expect((await suite.medicalRecordRegistry.recordsOfPatient(patientId, 99, 10)).length).toBe(0);
  });

  it("reverts when verifying or reading an unknown record", async () => {
    await expectRevert(suite.medicalRecordRegistry.verifyAndLog("0x" + "ff".repeat(32), CONTENT_HASH), "RecordNotFound");
    await expectRevert(suite.medicalRecordRegistry.getRecord("0x" + "ff".repeat(32)), "RecordNotFound");
  });
});
