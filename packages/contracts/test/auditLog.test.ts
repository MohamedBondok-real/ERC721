import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { artifact, parseEvents, resetChain, signer, expectRevert} from "./helpers/chain";
import { deploySuite, registerPatient, ZERO_BYTES32, type Suite } from "./helpers/suite";
import { ethers } from "ethers";

const action = (name: string) => ethers.keccak256(ethers.toUtf8Bytes(name));

describe("AuditLog", () => {
  let suite: Suite;

  beforeAll(async () => {
    await resetChain();
    suite = await deploySuite();
  });

  beforeEach(async () => {
    await resetChain();
    suite = await deploySuite();
  });

  it("records entries emitted by sibling registries", async () => {
    const { patientId, wallet } = await registerPatient(suite, 3, "audit-patient");
    expect(Number(await suite.auditLog.countForPatient(patientId))).toBe(1);

    const entry = (await suite.auditLog.recentEntries(1))[0];
    expect(entry.actor).toBe(wallet);
    expect(entry.patientId).toBe(patientId);
    expect(entry.action).toBe(action("PATIENT_REGISTERED"));
    expect(entry.source).toBe(suite.addresses.PatientRegistry);
    expect(Number(entry.timestamp)).toBeGreaterThan(0);
  });

  it("rejects writes from accounts that are not authorized systems", async () => {
    const stranger = await signer(7);
    await expectRevert(suite.auditLog.connect(stranger).logAction(await stranger.getAddress(), ZERO_BYTES32, action("SOMETHING"), ZERO_BYTES32), "UnauthorizedWriter");
  });

  it("lets any account attribute an action to itself", async () => {
    const stranger = await signer(7);
    const tx = await suite.auditLog.connect(stranger).logSelfAction(ZERO_BYTES32, action("USER_EXPORTED_RECORD"), ZERO_BYTES32);
    const events = parseEvents(suite.auditLog, await tx.wait());
    expect(events.map((e) => e.name)).toContain("AuditRecorded");
    expect(events[0]?.args.actor).toBe(await stranger.getAddress());
  });

  it("rejects an entry with no action identifier", async () => {
    await expectRevert(suite.auditLog.connect(suite.system).logAction(await suite.system.getAddress(), ZERO_BYTES32, ZERO_BYTES32, ZERO_BYTES32), "ZeroAction");
  });

  it("indexes entries by patient, actor and data hash and paginates them", async () => {
    const { patientId, wallet } = await registerPatient(suite, 3, "indexed-patient");
    const dataHash = "0x" + "42".repeat(32);

    for (let i = 0; i < 4; i++) {
      await (
        await suite.auditLog
          .connect(suite.system)
          .logAction(wallet, patientId, action(`ACTION_${i}`), dataHash)
      ).wait();
    }

    expect(Number(await suite.auditLog.countForPatient(patientId))).toBe(5); // registration + 4
    expect((await suite.auditLog.entriesForPatient(patientId, 0, 2)).length).toBe(2);
    expect((await suite.auditLog.entriesForPatient(patientId, 3, 10)).length).toBe(2);
    expect((await suite.auditLog.entriesByActor(wallet, 0, 10)).length).toBe(5);
    expect((await suite.auditLog.entriesByDataHash(dataHash)).length).toBe(4);
    expect((await suite.auditLog.recentEntries(3)).length).toBe(3);

    const first = (await suite.auditLog.entriesForPatient(patientId, 0, 1))[0];
    expect(first.action).toBe(action("PATIENT_REGISTERED"));
  });

  it("blocks writes while paused but keeps reads available", async () => {
    const { patientId, wallet } = await registerPatient(suite, 3, "pause-patient");
    await (await suite.auditLog.connect(suite.owner).pause()).wait();

    await expectRevert(suite.auditLog.connect(suite.system).logAction(wallet, patientId, action("BLOCKED"), ZERO_BYTES32), "EnforcedPause");

    expect(Number(await suite.auditLog.countForPatient(patientId))).toBe(1);

    await (await suite.auditLog.connect(suite.owner).unpause()).wait();
    await (await suite.auditLog.connect(suite.system).logAction(wallet, patientId, action("ALLOWED"), ZERO_BYTES32)).wait();
    expect(Number(await suite.auditLog.countForPatient(patientId))).toBe(2);
  });

  it("only lets the owner change the authorized-system set", async () => {
    const stranger = await signer(8);
    await expectRevert(suite.auditLog.connect(stranger).setAuthorizedSystem(await stranger.getAddress(), true), "OwnableUnauthorizedAccount");
    expect(await suite.auditLog.authorizedSystems(await stranger.getAddress())).toBe(false);

    await (await suite.auditLog.connect(suite.owner).setAuthorizedSystem(await stranger.getAddress(), true)).wait();
    expect(await suite.auditLog.authorizedSystems(await stranger.getAddress())).toBe(true);
  });

  it("exposes no function that can modify or delete an existing entry", () => {
    const abi = artifact("AuditLog").abi as { type: string; name?: string }[];
    const mutators = abi
      .filter((item) => item.type === "function" && item.name)
      .map((item) => item.name as string)
      .filter((name) => /^(update|edit|delete|remove|purge|set(Entry|Record))/i.test(name));

    expect(mutators).toEqual([]);
  });

  it("keeps the trail append-only across a full consent lifecycle", async () => {
    const { patientId, signer: patient } = await registerPatient(suite, 3, "lifecycle-patient");
    const doctor = await signer(5);
    const scopeHash = ethers.solidityPackedKeccak256(["string", "string", "string"], ["BREASTCARE_CONSENT_V1", "full", "all records"]);

    await (await suite.consentManager.connect(patient).grantConsent(await doctor.getAddress(), scopeHash, 0)).wait();
    await (
      await suite.medicalRecordRegistry
        .connect(patient)
        .registerRecord(patientId, "0x" + "a1".repeat(32), "0x" + "b2".repeat(32), "0x" + "c3".repeat(32), ZERO_BYTES32)
    ).wait();
    await (await suite.consentManager.connect(patient).revokeConsent(await doctor.getAddress())).wait();

    const entries = await suite.auditLog.entriesForPatient(patientId, 0, 50);
    const actions = entries.map((entry: { action: string }) => entry.action);
    expect(actions).toEqual([
      action("PATIENT_REGISTERED"),
      action("CONSENT_GRANTED"),
      action("RECORD_REGISTERED"),
      action("CONSENT_REVOKED"),
    ]);
  });
});
