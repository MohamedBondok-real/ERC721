import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { deploySuite, grantConsent, registerPatient, ZERO_BYTES32, type Suite } from "./helpers/suite";
import { parseEvents, resetChain, signer, expectRevert} from "./helpers/chain";

const PLAN_ID = "0x" + "5a".repeat(32);
const MODALITY = "0x" + "6b".repeat(32);
const PLAN_HASH = "0x" + "7c".repeat(32);

// TreatmentStatus enum values
const PROPOSED = 0n;
const AUTHORIZED = 1n;
const ACTIVE = 2n;
const ON_HOLD = 3n;
const COMPLETED = 4n;
const CANCELLED = 5n;

describe("TreatmentRegistry", () => {
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
    const registered = await registerPatient(suite, 3, "treatment-patient");
    patientId = registered.patientId;
    patient = registered.signer;
    doctor = await signer(4);
    doctorAddress = await doctor.getAddress();
    await grantConsent(suite, patient, doctorAddress);
  });

  async function createPlan(planId = PLAN_ID, proposer = doctor) {
    return suite.treatmentRegistry
      .connect(proposer)
      .registerTreatmentPlan(patientId, planId, MODALITY, PLAN_HASH, await proposer.getAddress());
  }

  it("registers a clinician-drafted plan in the Proposed state", async () => {
    const tx = await createPlan();
    const events = parseEvents(suite.treatmentRegistry, await tx.wait());
    expect(events.map((e) => e.name)).toContain("TreatmentPlanRegistered");

    const plan = await suite.treatmentRegistry.getTreatmentPlan(PLAN_ID);
    expect(plan.status).toBe(PROPOSED);
    expect(plan.proposedBy).toBe(doctorAddress);
    expect(plan.authorizedBy).toBe("0x" + "00".repeat(20));
    expect(plan.version).toBe(1n);
    expect(plan.planHash).toBe(PLAN_HASH);
    expect(await suite.treatmentRegistry.planCount()).toBe(1n);
  });

  it("records the treating doctor's authorization", async () => {
    await (await createPlan()).wait();
    const tx = await suite.treatmentRegistry.connect(doctor).authorizeTreatmentPlan(PLAN_ID);
    const events = parseEvents(suite.treatmentRegistry, await tx.wait());
    expect(events.map((e) => e.name)).toContain("TreatmentAuthorized");

    const plan = await suite.treatmentRegistry.getTreatmentPlan(PLAN_ID);
    expect(plan.status).toBe(AUTHORIZED);
    expect(plan.authorizedBy).toBe(doctorAddress);
    expect(Number(plan.authorizedAt)).toBeGreaterThan(0);

    await expectRevert(suite.treatmentRegistry.connect(doctor).authorizeTreatmentPlan(PLAN_ID), "AlreadyAuthorized");
  });

  it("refuses authorization from an account with no relationship to the patient", async () => {
    await (await createPlan()).wait();
    const stranger = await signer(9);
    await expectRevert(suite.treatmentRegistry.connect(stranger).authorizeTreatmentPlan(PLAN_ID), "UnauthorizedForPatient");
  });

  it("reserves plan authorization for clinicians and the platform relayer", async () => {
    await (await createPlan()).wait();

    // Least privilege: owning the record does not make the patient the authorizing clinician.
    // Patients express agreement through acknowledgeTreatmentPlan instead.
    await expectRevert(() => suite.treatmentRegistry.connect(patient).authorizeTreatmentPlan(PLAN_ID), "UnauthorizedForPatient");

    // The authorized relayer may record an authorization captured off-chain.
    await (await suite.treatmentRegistry.connect(suite.system).authorizeTreatmentPlan(PLAN_ID)).wait();
    const plan = await suite.treatmentRegistry.getTreatmentPlan(PLAN_ID);
    expect(plan.status).toBe(AUTHORIZED);
    expect(plan.authorizedBy).toBe(await suite.system.getAddress());
  });

  it("walks the plan through a valid lifecycle", async () => {
    await (await createPlan()).wait();
    await (await suite.treatmentRegistry.connect(doctor).authorizeTreatmentPlan(PLAN_ID)).wait();

    const noteHash = "0x" + "ab".repeat(32);
    const tx = await suite.treatmentRegistry.connect(doctor).updateTreatmentStatus(PLAN_ID, ACTIVE, noteHash);
    expect(parseEvents(suite.treatmentRegistry, await tx.wait()).map((e) => e.name)).toContain("TreatmentStatusUpdated");
    expect((await suite.treatmentRegistry.getTreatmentPlan(PLAN_ID)).status).toBe(ACTIVE);

    await (await suite.treatmentRegistry.connect(doctor).updateTreatmentStatus(PLAN_ID, ON_HOLD, noteHash)).wait();
    expect((await suite.treatmentRegistry.getTreatmentPlan(PLAN_ID)).status).toBe(ON_HOLD);

    await (await suite.treatmentRegistry.connect(doctor).updateTreatmentStatus(PLAN_ID, ACTIVE, noteHash)).wait();
    await (await suite.treatmentRegistry.connect(doctor).updateTreatmentStatus(PLAN_ID, COMPLETED, noteHash)).wait();
    expect((await suite.treatmentRegistry.getTreatmentPlan(PLAN_ID)).status).toBe(COMPLETED);
  });

  it("rejects impossible transitions and treats terminal states as final", async () => {
    await (await createPlan()).wait();
    // Proposed -> OnHold is not a valid transition.
    await expectRevert(suite.treatmentRegistry.connect(doctor).updateTreatmentStatus(PLAN_ID, ON_HOLD, ZERO_BYTES32), "InvalidTransition");

    await (await suite.treatmentRegistry.connect(doctor).updateTreatmentStatus(PLAN_ID, CANCELLED, ZERO_BYTES32)).wait();
    await expectRevert(suite.treatmentRegistry.connect(doctor).updateTreatmentStatus(PLAN_ID, ACTIVE, ZERO_BYTES32), "InvalidTransition");
  });

  it("rejects status updates from an account without consent", async () => {
    await (await createPlan()).wait();
    await (await suite.consentManager.connect(patient).revokeConsent(doctorAddress)).wait();
    await expectRevert(suite.treatmentRegistry.connect(doctor).updateTreatmentStatus(PLAN_ID, ACTIVE, ZERO_BYTES32), "UnauthorizedForPatient");
  });

  it("amends the anchored plan document and bumps the version", async () => {
    await (await createPlan()).wait();
    const amended = "0x" + "cd".repeat(32);

    const tx = await suite.treatmentRegistry.connect(doctor).amendTreatmentPlan(PLAN_ID, amended);
    expect(parseEvents(suite.treatmentRegistry, await tx.wait()).map((e) => e.name)).toContain("TreatmentPlanAmended");

    const verification = await suite.treatmentRegistry.verifyPlan(PLAN_ID, amended);
    expect(verification.matches).toBe(true);
    expect(verification.version).toBe(2n);
    expect((await suite.treatmentRegistry.verifyPlan(PLAN_ID, PLAN_HASH)).matches).toBe(false);
  });

  it("records a patient acknowledgement and rejects anyone else", async () => {
    await (await createPlan()).wait();
    const ackHash = "0x" + "ef".repeat(32);
    const tx = await suite.treatmentRegistry.connect(patient).acknowledgeTreatmentPlan(PLAN_ID, ackHash);
    expect(parseEvents(suite.treatmentRegistry, await tx.wait()).map((e) => e.name)).toContain("TreatmentAcknowledged");

    await expectRevert(suite.treatmentRegistry.connect(doctor).acknowledgeTreatmentPlan(PLAN_ID, ackHash), "NotPatientWallet");
  });

  it("rejects duplicate plan ids, empty hashes and unknown plans", async () => {
    await (await createPlan()).wait();
    await expectRevert(createPlan(), "PlanAlreadyExists");
    await expectRevert(suite.treatmentRegistry
        .connect(doctor)
        .registerTreatmentPlan(patientId, "0x" + "01".repeat(32), MODALITY, ZERO_BYTES32, doctorAddress), "EmptyPlanHash");
    await expectRevert(suite.treatmentRegistry.getTreatmentPlan("0x" + "fe".repeat(32)), "PlanNotFound");
  });

  it("lists every plan belonging to a patient", async () => {
    for (let i = 0; i < 3; i++) {
      const id = "0x" + (i + 1).toString(16).padStart(2, "0").repeat(32);
      await (await createPlan(id)).wait();
    }
    const plans = await suite.treatmentRegistry.plansOfPatient(patientId);
    expect(plans.length).toBe(3);
    expect((await suite.treatmentRegistry.planIdsOfPatient(patientId)).length).toBe(3);
  });
});
