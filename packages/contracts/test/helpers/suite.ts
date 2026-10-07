/**
 * Deploys the full BreastCare contract suite in dependency order and wires up the
 * cross-contract authorizations exactly as `scripts/deploy.ts` does on a live network.
 */
import { deploy, signer, type Artifact, artifact } from "./chain";
import { ethers, type Contract, type Signer } from "ethers";

export interface Suite {
  auditLog: Contract;
  patientRegistry: Contract;
  consentManager: Contract;
  medicalRecordRegistry: Contract;
  treatmentRegistry: Contract;
  owner: Signer;
  system: Signer;
  addresses: Record<string, string>;
  artifacts: Record<string, Artifact>;
}

export async function deploySuite(ownerIndex = 0, systemIndex = 1): Promise<Suite> {
  const owner = await signer(ownerIndex);
  const system = await signer(systemIndex);
  const ownerAddress = await owner.getAddress();
  const systemAddress = await system.getAddress();

  const auditLog = await deploy("AuditLog", [ownerAddress], owner);
  const patientRegistry = await deploy("PatientRegistry", [ownerAddress, await auditLog.getAddress()], owner);
  const consentManager = await deploy(
    "ConsentManager",
    [ownerAddress, await patientRegistry.getAddress(), await auditLog.getAddress()],
    owner,
  );
  const medicalRecordRegistry = await deploy(
    "MedicalRecordRegistry",
    [ownerAddress, await patientRegistry.getAddress(), await consentManager.getAddress(), await auditLog.getAddress()],
    owner,
  );
  const treatmentRegistry = await deploy(
    "TreatmentRegistry",
    [ownerAddress, await patientRegistry.getAddress(), await consentManager.getAddress(), await auditLog.getAddress()],
    owner,
  );

  // The audit log must accept entries from every sibling registry and from the relayer.
  for (const contract of [patientRegistry, consentManager, medicalRecordRegistry, treatmentRegistry]) {
    await (await contract.setAuthorizedSystem(await auditLog.getAddress(), true)).wait();
  }
  await (await auditLog.setAuthorizedSystem(await patientRegistry.getAddress(), true)).wait();
  await (await auditLog.setAuthorizedSystem(await consentManager.getAddress(), true)).wait();
  await (await auditLog.setAuthorizedSystem(await medicalRecordRegistry.getAddress(), true)).wait();
  await (await auditLog.setAuthorizedSystem(await treatmentRegistry.getAddress(), true)).wait();
  await (await auditLog.setAuthorizedSystem(systemAddress, true)).wait();
  await (await medicalRecordRegistry.setAuthorizedSystem(systemAddress, true)).wait();
  await (await treatmentRegistry.setAuthorizedSystem(systemAddress, true)).wait();
  await (await patientRegistry.setAuthorizedSystem(systemAddress, true)).wait();
  await (await consentManager.setAuthorizedSystem(systemAddress, true)).wait();

  return {
    auditLog,
    patientRegistry,
    consentManager,
    medicalRecordRegistry,
    treatmentRegistry,
    owner,
    system,
    addresses: {
      AuditLog: await auditLog.getAddress(),
      PatientRegistry: await patientRegistry.getAddress(),
      ConsentManager: await consentManager.getAddress(),
      MedicalRecordRegistry: await medicalRecordRegistry.getAddress(),
      TreatmentRegistry: await treatmentRegistry.getAddress(),
    },
    artifacts: {
      AuditLog: artifact("AuditLog"),
      PatientRegistry: artifact("PatientRegistry"),
      ConsentManager: artifact("ConsentManager"),
      MedicalRecordRegistry: artifact("MedicalRecordRegistry"),
      TreatmentRegistry: artifact("TreatmentRegistry"),
    },
  };
}

/** Register a patient from their own wallet and return the derived pseudonymous id. */
export const ZERO_BYTES32 = "0x" + "00".repeat(32);

export async function registerPatient(
  suite: Suite,
  patientIndex: number,
  pseudonym = "patient-pseudonym",
  profileHash: string = ZERO_BYTES32,
): Promise<{ patientId: string; wallet: string; signer: Signer }> {
  const patient = await signer(patientIndex);
  const wallet = await patient.getAddress();
  const bound = suite.patientRegistry.connect(patient) as Contract;
  await (await bound.registerPatient(pseudonym, profileHash)).wait();
  const patientId: string = await suite.patientRegistry.derivePatientId(wallet);
  return { patientId, wallet, signer: patient };
}

/** Grant `grantee` access to `patientId` from the patient's own wallet. */
export async function grantConsent(
  suite: Suite,
  patient: Signer,
  granteeAddress: string,
  expiresAt = 0,
): Promise<string> {
  const scopeHash = scopeHashFor("full-record-access", "Read access to the complete medical record");
  const bound = suite.consentManager.connect(patient) as Contract;
  const tx = await bound.grantConsent(granteeAddress, scopeHash, expiresAt);
  const receipt = await tx.wait();
  return receipt.hash as string;
}

/** Deterministic scope hash mirroring `ConsentManager.scopeHashFor`. */
export function scopeHashFor(name: string, description: string): string {
  return ethers.solidityPackedKeccak256(
    ["string", "string", "string"],
    ["BREASTCARE_CONSENT_V1", name, description],
  );
}
