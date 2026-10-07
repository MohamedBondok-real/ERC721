import { beforeAll, describe, expect, it } from "vitest";
import { deploySuite, registerPatient, type Suite } from "./helpers/suite";
import { parseEvents, resetChain, signer, expectRevert} from "./helpers/chain";

describe("PatientRegistry", () => {
  let suite: Suite;

  beforeAll(async () => {
    await resetChain();
    suite = await deploySuite();
  });

  it("registers a patient against a pseudonymous id derived from their wallet", async () => {
    const patient = await signer(2);
    const wallet = await patient.getAddress();
    const expectedId = await suite.patientRegistry.derivePatientId(wallet);

    const tx = await suite.patientRegistry.connect(patient).registerPatient("rose-quartz", "0x" + "11".repeat(32));
    const receipt = await tx.wait();

    const events = parseEvents(suite.patientRegistry, receipt);
    expect(events.map((e) => e.name)).toContain("PatientRegistered");

    const record = await suite.patientRegistry.getPatient(expectedId);
    expect(record.wallet).toBe(wallet);
    expect(record.pseudonym).toBe("rose-quartz");
    expect(record.status).toBe(1n); // Active
    expect(Number(record.registeredAt)).toBeGreaterThan(0);
    // The stored profile hash is the digest, never the profile itself.
    expect(record.profileHash).toBe("0x" + "11".repeat(32));
    expect(await suite.patientRegistry.isRegistered(expectedId)).toBe(true);
    expect(await suite.patientRegistry.isActive(expectedId)).toBe(true);
    expect(await suite.patientRegistry.patientCount()).toBe(1n);
  });

  it("rejects a second registration from the same wallet", async () => {
    const patient = await signer(2);
    await expectRevert(suite.patientRegistry.connect(patient).registerPatient("second-identity", "0x" + "22".repeat(32)), "AlreadyRegistered");
  });

  it("rejects an empty pseudonym", async () => {
    const patient = await signer(3);
    await expectRevert(suite.patientRegistry.connect(patient).registerPatient("", "0x" + "22".repeat(32)), "EmptyPseudonym");
  });

  it("lets the patient update their pseudonym and profile hash, and nobody else", async () => {
    const { patientId, signer: patient } = await registerPatient(suite, 4, "initial-name");
    const bound = suite.patientRegistry.connect(patient);

    await (await bound.updatePseudonym("updated-name")).wait();
    expect((await suite.patientRegistry.getPatient(patientId)).pseudonym).toBe("updated-name");

    const newHash = "0x" + "33".repeat(32);
    const tx = await bound.updateProfileHash(newHash);
    expect(parseEvents(suite.patientRegistry, await tx.wait()).map((e) => e.name)).toContain(
      "PatientProfileHashUpdated",
    );
    expect((await suite.patientRegistry.getPatient(patientId)).profileHash).toBe(newHash);

    const stranger = await signer(9);
    await expectRevert(suite.patientRegistry.connect(stranger).updatePseudonym("hijacked"), "NotPatientWallet", "NotRegistered");
  });

  it("moves a pseudonymous identity to a new wallet", async () => {
    const { patientId, wallet, signer: patient } = await registerPatient(suite, 5);
    const newWallet = await (await signer(6)).getAddress();

    const tx = await suite.patientRegistry.connect(patient).transferWallet(newWallet);
    expect(parseEvents(suite.patientRegistry, await tx.wait()).map((e) => e.name)).toContain("PatientWalletUpdated");

    expect((await suite.patientRegistry.getPatient(patientId)).wallet).toBe(newWallet);
    expect(await suite.patientRegistry.patientIdByWallet(wallet)).toBe("0x" + "00".repeat(32));
    expect(await suite.patientRegistry.isPatientWallet(patientId, newWallet)).toBe(true);
  });

  it("only lets an authorized system change patient status", async () => {
    const { patientId } = await registerPatient(suite, 7);
    const stranger = await signer(8);

    await expectRevert(suite.patientRegistry.connect(stranger).setStatus(patientId, 2), "UnauthorizedSystem", "OwnableUnauthorizedAccount");

    await (await suite.patientRegistry.connect(suite.system).setStatus(patientId, 2)).wait(); // Paused
    expect((await suite.patientRegistry.getPatient(patientId)).status).toBe(2n);
    expect(await suite.patientRegistry.isActive(patientId)).toBe(false);

    await (await suite.patientRegistry.connect(suite.system).setStatus(patientId, 1)).wait(); // Active
    expect(await suite.patientRegistry.isActive(patientId)).toBe(true);
  });

  it("reverts when reading an unknown patient", async () => {
    await expectRevert(suite.patientRegistry.getPatient("0x" + "ee".repeat(32)), "NotRegistered");
  });

  it("blocks registration while paused and resumes after unpause", async () => {
    const patient = await signer(10);
    await (await suite.patientRegistry.connect(suite.owner).pause()).wait();
    await expectRevert(suite.patientRegistry.connect(patient).registerPatient("blocked", "0x" + "44".repeat(32)), "EnforcedPause");
    await (await suite.patientRegistry.connect(suite.owner).unpause()).wait();
    await (await suite.patientRegistry.connect(patient).registerPatient("allowed", "0x" + "44".repeat(32))).wait();
    expect(await suite.patientRegistry.isRegistered(await suite.patientRegistry.derivePatientId(await patient.getAddress()))).toBe(true);
  });

  it("registers a patient through an authorized relayer", async () => {
    const wallet = await (await signer(11)).getAddress();
    const tx = await suite.patientRegistry.connect(suite.system).registerPatientFor(wallet, "relayed", "0x" + "55".repeat(32));
    expect(parseEvents(suite.patientRegistry, await tx.wait()).map((e) => e.name)).toContain("PatientRegistered");
    expect((await suite.patientRegistry.getPatientByWallet(wallet)).pseudonym).toBe("relayed");
  });

  it("records an immutable audit entry on registration", async () => {
    const before = Number(await suite.auditLog.entryCount());
    await registerPatient(suite, 12, "audited-patient");
    const after = Number(await suite.auditLog.entryCount());
    expect(after).toBeGreaterThan(before);

    const recent = await suite.auditLog.recentEntries(5);
    const actions = recent.map((entry: { action: string }) => entry.action);
    expect(actions).toContain(await actionHash("PATIENT_REGISTERED"));
  });
});

async function actionHash(name: string): Promise<string> {
  const { ethers } = await import("ethers");
  return ethers.keccak256(ethers.toUtf8Bytes(name));
}
