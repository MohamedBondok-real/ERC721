import { beforeAll, describe, expect, it } from "vitest";
import { ethers } from "ethers";
import { deploySuite, grantConsent, registerPatient, scopeHashFor, ZERO_BYTES32, type Suite } from "./helpers/suite";
import { balanceOf, parseEvents, resetChain, signer, expectRevert} from "./helpers/chain";

const hash = (byte: string) => "0x" + byte.repeat(32);

describe("end-to-end: consent + integrity + auditability + access control", () => {
  let suite: Suite;

  beforeAll(async () => {
    await resetChain();
    suite = await deploySuite();
  });

  it("runs a full patient journey on-chain without ever storing clinical data", async () => {
    /* 1. The patient registers a pseudonymous identity from their own wallet. */
    const { patientId, wallet, signer: patient } = await registerPatient(
      suite,
      3,
      "demo-patient-01",
      hash("a1"), // digest of the off-chain profile — not the profile
    );

    /* 2. A clinician cannot see anything before consent exists. */
    const doctor = await signer(5);
    const doctorAddress = await doctor.getAddress();
    expect(await suite.medicalRecordRegistry.isAuthorizedForPatient(patientId, doctorAddress)).toBe(false);
    expect(await suite.consentManager.hasActiveConsent(patientId, doctorAddress)).toBe(false);

    /* 3. The patient grants scoped, expiring consent. */
    const consentTxHash = await grantConsent(suite, patient, doctorAddress);
    expect(consentTxHash).toMatch(/^0x[0-9a-fA-F]{64}$/);
    expect(await suite.consentManager.hasActiveConsent(patientId, doctorAddress)).toBe(true);

    /* 4. The clinician anchors a medical report hash (report content stays off-chain). */
    const reportRecordId = hash("b1");
    const reportHash = hash("c1");
    const recordTx = await suite.medicalRecordRegistry
      .connect(doctor)
      .registerRecord(patientId, reportRecordId, hash("d1"), reportHash, hash("e1"));
    expect(parseEvents(suite.medicalRecordRegistry, await recordTx.wait()).map((e) => e.name)).toContain(
      "RecordRegistered",
    );

    /* 5. Anyone can later verify integrity against the anchored hash. */
    expect((await suite.medicalRecordRegistry.verifyRecord(reportRecordId, reportHash)).matches).toBe(true);
    expect((await suite.medicalRecordRegistry.verifyRecord(reportRecordId, hash("ff"))).matches).toBe(false);

    /* 6. The clinician drafts and authorizes a treatment plan. */
    const planId = hash("f1");
    await (
      await suite.treatmentRegistry
        .connect(doctor)
        .registerTreatmentPlan(patientId, planId, hash("11"), hash("22"), doctorAddress)
    ).wait();
    await (await suite.treatmentRegistry.connect(doctor).authorizeTreatmentPlan(planId)).wait();
    expect((await suite.treatmentRegistry.getTreatmentPlan(planId)).authorizedBy).toBe(doctorAddress);

    /* 7. Revoking consent immediately removes the clinician's write access. */
    await (await suite.consentManager.connect(patient).revokeConsent(doctorAddress)).wait();
    await expectRevert(suite.treatmentRegistry.connect(doctor).updateTreatmentStatus(planId, 2, ZERO_BYTES32), "UnauthorizedForPatient");

    /* 8. The patient keeps full access to their own data throughout. */
    await (
      await suite.medicalRecordRegistry
        .connect(patient)
        .registerRecord(patientId, hash("b2"), hash("d2"), hash("c2"), hash("e2"))
    ).wait();

    /* 9. The audit trail is complete, ordered and attributable. */
    const entries = await suite.auditLog.entriesForPatient(patientId, 0, 100);
    const actions = entries.map((entry: { action: string }) => entry.action);
    expect(actions).toEqual([
      ethers.keccak256(ethers.toUtf8Bytes("PATIENT_REGISTERED")),
      ethers.keccak256(ethers.toUtf8Bytes("CONSENT_GRANTED")),
      ethers.keccak256(ethers.toUtf8Bytes("RECORD_REGISTERED")),
      ethers.keccak256(ethers.toUtf8Bytes("TREATMENT_PROPOSED")),
      ethers.keccak256(ethers.toUtf8Bytes("TREATMENT_AUTHORIZED")),
      ethers.keccak256(ethers.toUtf8Bytes("CONSENT_REVOKED")),
      ethers.keccak256(ethers.toUtf8Bytes("RECORD_REGISTERED")),
    ]);
    expect(entries.every((entry: { patientId: string }) => entry.patientId === patientId)).toBe(true);

    /* 10. Nothing identifying is stored: only 32-byte digests and addresses. */
    const stored = await suite.patientRegistry.getPatient(patientId);
    expect(stored.wallet).toBe(wallet);
    expect(stored.pseudonym).toBe("demo-patient-01");
    expect(stored.profileHash).toBe(hash("a1"));
    expect(stored.profileHash.length).toBe(66);
  });

  it("keeps gas costs sane for the hot paths", async () => {
    const { patientId, signer: patient } = await registerPatient(suite, 12, "gas-patient");
    const doctor = await signer(13);
    await grantConsent(suite, patient, await doctor.getAddress());

    const recordTx = await suite.medicalRecordRegistry
      .connect(doctor)
      .registerRecord(patientId, hash("aa"), hash("bb"), hash("cc"), hash("dd"));
    // Regression guard: registering a record writes the record itself *and* an immutable
    // audit entry across two contracts. Budgeted generously, but a jump beyond this means
    // the hot path grew unexpectedly.
    const recordReceipt = await recordTx.wait();
    expect(Number(recordReceipt.gasUsed)).toBeLessThan(600_000);

    const consentTx = await suite.consentManager
      .connect(patient)
      .grantConsent(await (await signer(14)).getAddress(), scopeHashFor("x", "y"), 0);
    expect(Number((await consentTx.wait()).gasUsed)).toBeLessThan(600_000);
  });

  it("funds are untouched by the contract suite", async () => {
    expect(await balanceOf(suite.addresses.PatientRegistry)).toBe(0n);
    expect(await balanceOf(suite.addresses.AuditLog)).toBe(0n);
  });
});
