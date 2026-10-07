import type {
  Appointment,
  AuditLogEntry,
  BlockchainRecord,
  ConsentRecord,
  DoctorProfile,
  MedicalRecordEntry,
  MedicalReport,
  Medication,
  Notification,
  NutritionLogEntry,
  NutritionPlan,
  PatientProfile,
  RiskAssessmentRecord,
  SymptomReport,
  TreatmentPlanRecord,
  UserAccount,
} from "@breastcare/shared";

/* ------------------------------------------------------------------ */
/* Persistence contracts                                               */
/*                                                                     */
/* Every module depends on this interface only, so the same API runs   */
/* against the in-memory demo store or PostgreSQL.                     */
/* ------------------------------------------------------------------ */

export type UserRecord = UserAccount & { passwordHash: string };

export interface Entity {
  id: string;
  createdAt: string;
}

export type Predicate<T> = (item: T) => boolean;

export interface FindOptions<T> {
  where?: Partial<Record<keyof T, unknown>> | Predicate<T>;
  orderBy?: keyof T | ((a: T, b: T) => number);
  order?: "asc" | "desc";
  limit?: number;
  offset?: number;
}

export interface Collection<T extends Entity> {
  list(options?: FindOptions<T>): Promise<T[]>;
  get(id: string): Promise<T | undefined>;
  /** Equality lookup helper — `findFirst({ patientId, kind })`. */
  findFirst(where: Partial<Record<keyof T, unknown>> | Predicate<T>): Promise<T | undefined>;
  insert(item: T): Promise<T>;
  update(id: string, patch: Partial<T>): Promise<T>;
  delete(id: string): Promise<boolean>;
  count(options?: FindOptions<T>): Promise<number>;
}

export interface Store {
  readonly users: Collection<UserRecord>;
  readonly patients: Collection<PatientProfile>;
  readonly doctors: Collection<DoctorProfile>;
  readonly records: Collection<MedicalRecordEntry>;
  readonly symptoms: Collection<SymptomReport>;
  readonly riskAssessments: Collection<RiskAssessmentRecord>;
  readonly nutritionPlans: Collection<NutritionPlan>;
  readonly nutritionLogs: Collection<NutritionLogEntry>;
  readonly treatments: Collection<TreatmentPlanRecord>;
  readonly medications: Collection<Medication>;
  readonly appointments: Collection<Appointment>;
  readonly reports: Collection<MedicalReport>;
  readonly consents: Collection<ConsentRecord>;
  readonly notifications: Collection<Notification>;
  readonly auditLogs: Collection<AuditLogEntry>;
  readonly blockchainRecords: Collection<BlockchainRecord>;
  close(): Promise<void>;
}

/** Collections keyed by name — used by the PostgreSQL driver's column maps. */
export const COLLECTION_NAMES = [
  "users",
  "patients",
  "doctors",
  "records",
  "symptoms",
  "riskAssessments",
  "nutritionPlans",
  "nutritionLogs",
  "treatments",
  "medications",
  "appointments",
  "reports",
  "consents",
  "notifications",
  "auditLogs",
  "blockchainRecords",
] as const;

export type CollectionName = (typeof COLLECTION_NAMES)[number];

/** Maps a collection to its relational table. */
export const TABLE_FOR: Record<CollectionName, string> = {
  users: "users",
  patients: "patients",
  doctors: "doctors",
  records: "medical_records",
  symptoms: "symptom_reports",
  riskAssessments: "risk_assessments",
  nutritionPlans: "nutrition_plans",
  nutritionLogs: "nutrition_logs",
  treatments: "treatments",
  medications: "medications",
  appointments: "appointments",
  reports: "medical_reports",
  consents: "consents",
  notifications: "notifications",
  auditLogs: "audit_logs",
  blockchainRecords: "blockchain_records",
};
