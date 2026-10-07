import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { deploySuite, grantConsent, registerPatient, scopeHashFor, type Suite } from "./helpers/suite";
import { increaseTime, latestBlockTimestamp, parseEvents, resetChain, signer, expectRevert} from "./helpers/chain";

describe("ConsentManager", () => {
  let suite: Suite;
  let patientId: string;
  let patient: Awaited<ReturnType<typeof signer>>;
  let doctorAddress: string;

  beforeAll(async () => {
    await resetChain();
    suite = await deploySuite();
  });

  beforeEach(async () => {
    await resetChain();
    suite = await deploySuite();
    const registered = await registerPatient(suite, 3, "consent-patient");
    patientId = registered.patientId;
    patient = registered.signer;
    doctorAddress = await (await signer(4)).getAddress();
  });

  it("grants consent and reports active access", async () => {
    expect(await suite.consentManager.hasActiveConsent(patientId, doctorAddress)).toBe(false);

    const tx = await suite.consentManager
      .connect(patient)
      .grantConsent(doctorAddress, scopeHashFor("full-record-access", "Read access to the complete medical record"), 0);
    const events = parseEvents(suite.consentManager, await tx.wait());
    expect(events.map((e) => e.name)).toContain("ConsentGranted");

    expect(await suite.consentManager.hasActiveConsent(patientId, doctorAddress)).toBe(true);
    const consent = await suite.consentManager.getConsent(patientId, doctorAddress);
    expect(consent.grantee).toBe(doctorAddress);
    expect(consent.revoked).toBe(false);
    expect(Number(consent.grantedAt)).toBeGreaterThan(0);
    expect((await suite.consentManager.granteesOf(patientId)).length).toBe(1);
  });

  it("refuses a grant from a wallet that has not registered a patient identity", async () => {
    const stranger = await signer(6);
    await expectRevert(suite.consentManager.connect(stranger).grantConsent(doctorAddress, scopeHashFor("x", "y"), 0), "PatientNotRegistered");
  });

  it("refuses to grant consent to the zero address or to the patient themselves", async () => {
    await expectRevert(suite.consentManager.connect(patient).grantConsent("0x" + "00".repeat(20), scopeHashFor("x", "y"), 0), "InvalidGrantee");
    await expectRevert(suite.consentManager.connect(patient).grantConsent(await patient.getAddress(), scopeHashFor("x", "y"), 0), "InvalidGrantee");
  });

  it("revokes consent immediately and permanently", async () => {
    await grantConsent(suite, patient, doctorAddress);
    expect(await suite.consentManager.hasActiveConsent(patientId, doctorAddress)).toBe(true);

    const tx = await suite.consentManager.connect(patient).revokeConsent(doctorAddress);
    const events = parseEvents(suite.consentManager, await tx.wait());
    expect(events.map((e) => e.name)).toContain("ConsentRevoked");

    expect(await suite.consentManager.hasActiveConsent(patientId, doctorAddress)).toBe(false);
    const consent = await suite.consentManager.getConsent(patientId, doctorAddress);
    expect(consent.revoked).toBe(true);
    expect(Number(consent.revokedAt)).toBeGreaterThan(0);
    // The grantee is still listed historically, but access is gone.
    expect((await suite.consentManager.granteesOf(patientId)).length).toBe(1);
    expect((await suite.consentManager.activePatientsOf(doctorAddress)).length).toBe(0);
  });

  it("is idempotent when revoking twice and reverts for a consent that never existed", async () => {
    await grantConsent(suite, patient, doctorAddress);
    await (await suite.consentManager.connect(patient).revokeConsent(doctorAddress)).wait();
    await (await suite.consentManager.connect(patient).revokeConsent(doctorAddress)).wait();
    expect(await suite.consentManager.hasActiveConsent(patientId, doctorAddress)).toBe(false);

    const otherDoctor = await (await signer(7)).getAddress();
    await expectRevert(suite.consentManager.connect(patient).revokeConsent(otherDoctor), "ConsentNotFound");
  });

  it("expires consent once the expiry timestamp passes", async () => {
    const now = await latestBlockTimestamp();
    await grantConsent(suite, patient, doctorAddress, now + 100);
    expect(await suite.consentManager.hasActiveConsent(patientId, doctorAddress)).toBe(true);

    await increaseTime(200);
    expect(await suite.consentManager.hasActiveConsent(patientId, doctorAddress)).toBe(false);
  });

  it("renews a previously revoked consent", async () => {
    await grantConsent(suite, patient, doctorAddress);
    await (await suite.consentManager.connect(patient).revokeConsent(doctorAddress)).wait();
    expect(await suite.consentManager.hasActiveConsent(patientId, doctorAddress)).toBe(false);

    const tx = await suite.consentManager
      .connect(patient)
      .grantConsent(doctorAddress, scopeHashFor("limited", "Symptoms only"), 0);
    expect(parseEvents(suite.consentManager, await tx.wait()).map((e) => e.name)).toContain("ConsentRenewed");
    expect(await suite.consentManager.hasActiveConsent(patientId, doctorAddress)).toBe(true);
  });

  it("only allows an authorized system to perform an emergency revocation", async () => {
    await grantConsent(suite, patient, doctorAddress);
    const stranger = await signer(8);
    await expectRevert(suite.consentManager.connect(stranger).emergencyRevoke(patientId, doctorAddress), "UnauthorizedSystem", "OwnableUnauthorizedAccount");

    await (await suite.consentManager.connect(suite.system).emergencyRevoke(patientId, doctorAddress)).wait();
    expect(await suite.consentManager.hasActiveConsent(patientId, doctorAddress)).toBe(false);
  });

  it("lets an authorized relayer record a consent signed off-chain", async () => {
    const wallet = await patient.getAddress();
    await (
      await suite.consentManager
        .connect(suite.system)
        .grantConsentFor(wallet, doctorAddress, scopeHashFor("relayed", "relayed scope"), 0)
    ).wait();
    expect(await suite.consentManager.hasActiveConsent(patientId, doctorAddress)).toBe(true);
  });

  it("derives a stable scope hash", async () => {
    const onChain = await suite.consentManager.scopeHashFor("full-record-access", "Read access");
    expect(onChain).toBe(scopeHashFor("full-record-access", "Read access"));
    expect(onChain).not.toBe(scopeHashFor("full-record-access", "Different description"));
  });
});
