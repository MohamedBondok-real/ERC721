import type { RiskAssessmentInput, RiskFactor } from "./risk";

/**
 * BreastCare AI — shared domain types.
 *
 * These types are the single source of truth for the frontend, the backend and the
 * blockchain adapters. Keep them free of runtime dependencies so they can be imported
 * anywhere (browser, Node, contract scripts).
 */

/* ------------------------------------------------------------------ */
/* Identity & access                                                   */
/* ------------------------------------------------------------------ */

export type Role = "patient" | "doctor" | "admin";

export interface UserAccount {
  id: string;
  email: string;
  role: Role;
  displayName: string;
  walletAddress: string | null;
  pseudonymousId: string | null;
  createdAt: string;
  updatedAt: string;
  lastLoginAt: string | null;
  status: "active" | "invited" | "suspended";
}

export interface PatientProfile {
  id: string;
  userId: string;
  pseudonymousId: string;
  displayName: string;
  birthYear: number;
  age: number;
  biologicalSex: "female" | "male" | "other" | "prefer-not-to-say";
  region: string;
  primaryDoctorId: string | null;
  walletAddress: string | null;
  onChainRegistered: boolean;
  /**
   * Patient identifier used by the contracts. `PatientRegistry` derives it from the linked
   * wallet (`derivePatientId`), so it only exists once a wallet is connected.
   */
  onChainPatientId: string | null;
  bloodType: string | null;
  allergies: string[];
  comorbidities: string[];
  currentTreatmentPhase: TreatmentPhase;
  createdAt: string;
  updatedAt: string;
}

export type TreatmentPhase =
  | "not-in-treatment"
  | "diagnosis-workup"
  | "active-treatment"
  | "recovery"
  | "survivorship"
  | "palliative";

export interface DoctorProfile {
  id: string;
  userId: string;
  displayName: string;
  specialty: string;
  licenseNumber: string;
  institution: string;
  email: string;
  walletAddress: string | null;
  acceptedPatients: number;
  createdAt: string;
}

/* ------------------------------------------------------------------ */
/* Clinical — symptoms                                                 */
/* ------------------------------------------------------------------ */

export type SymptomCode =
  | "breast-lump"
  | "breast-shape-change"
  | "skin-dimpling"
  | "skin-thickening"
  | "nipple-retraction"
  | "nipple-discharge"
  | "nipple-rash"
  | "localized-pain"
  | "swelling-no-lump"
  | "axillary-lump"
  | "redness-warmth"
  | "persistent-change";

export type SymptomSeverity = "mild" | "moderate" | "severe";

export interface SymptomReport {
  id: string;
  patientId: string;
  code: SymptomCode;
  label: string;
  severity: SymptomSeverity;
  side: "left" | "right" | "both" | "not-applicable";
  durationWeeks: number;
  progressive: boolean;
  notes: string | null;
  reportedAt: string;
  /** Educational guidance returned to the patient at report time. */
  guidance: string;
  /** True when the report matches a red-flag pattern requiring prompt evaluation. */
  redFlag: boolean;
  reviewedByDoctorId: string | null;
  reviewedAt: string | null;
  createdAt: string;
}

/* ------------------------------------------------------------------ */
/* Risk assessment                                                     */
/* ------------------------------------------------------------------ */

export type RiskLevel = "low" | "moderate" | "high";
export type AssessmentUrgency = "routine" | "soon" | "prompt";
export type { RiskAssessmentInput, RiskFactor };

export interface RiskAssessmentRecord {
  id: string;
  patientId: string;
  modelId: string;
  modelVersion: string;
  level: RiskLevel;
  score: number;
  maxScore: number;
  normalizedScore: number;
  urgency: AssessmentUrgency;
  input: RiskAssessmentInput;
  factors: RiskFactor[];
  guidance: string[];
  redFlags: string[];
  /** Always present: an educational risk indicator is never a diagnosis. */
  disclaimer: string;
  contentHash: string;
  onChainRecordId: string | null;
  completedAt: string;
  reviewedByDoctorId: string | null;
  doctorNote: string | null;
  createdAt: string;
}

/* ------------------------------------------------------------------ */
/* Nutrition                                                           */
/* ------------------------------------------------------------------ */

export type NutritionPhase = "during-treatment" | "recovery" | "survivorship" | "side-effect-support";

export interface NutritionPlan {
  id: string;
  patientId: string;
  phase: NutritionPhase;
  title: string;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  reviewedByProfessional: boolean;
  calorieTargetKcal: number | null;
  proteinTargetGrams: number | null;
  hydrationTargetMl: number;
  goals: string[];
  meals: MealSuggestion[];
  foodsToEmphasize: string[];
  foodsToDiscussWithClinician: string[];
  foodsThatMayWorsenSymptoms: { food: string; reason: string }[];
  sideEffectSupport: SideEffectGuidance[];
  cautions: string[];
  /** Always present: nutrition guidance is educational and must be reviewed clinically. */
  disclaimer: string;
  contentHash: string;
}

export interface MealSuggestion {
  id: string;
  slot: "breakfast" | "mid-morning" | "lunch" | "afternoon" | "dinner" | "evening";
  name: string;
  description: string;
  rationale: string;
  approximateKcal: number;
  proteinGrams: number;
  tags: string[];
}

export interface SideEffectGuidance {
  id: string;
  symptom: string;
  summary: string;
  suggestions: string[];
  whenToContactCareTeam: string;
}

export interface NutritionLogEntry {
  id: string;
  patientId: string;
  loggedAt: string;
  slot: MealSuggestion["slot"] | "snack";
  description: string;
  adherence: "followed" | "partial" | "skipped";
  appetiteScore: number; // 0-5
  nauseaScore: number; // 0-5
  notes: string | null;
  createdAt: string;
}

/* ------------------------------------------------------------------ */
/* Treatment & medication                                              */
/* ------------------------------------------------------------------ */

export type TreatmentModality =
  | "surgery"
  | "radiation"
  | "chemotherapy"
  | "hormone-therapy"
  | "targeted-therapy"
  | "immunotherapy"
  | "clinical-trial"
  | "supportive-care"
  | "other";

export type TreatmentStatus =
  | "proposed"
  | "authorized"
  | "active"
  | "on-hold"
  | "completed"
  | "cancelled";

export interface TreatmentPlanRecord {
  id: string;
  patientId: string;
  name: string;
  modality: TreatmentModality;
  status: TreatmentStatus;
  startDate: string | null;
  expectedEndDate: string | null;
  treatingDoctorId: string;
  summary: string;
  notes: string;
  sideEffects: string[];
  progressPercent: number;
  documents: TreatmentDocument[];
  appointments: string[];
  contentHash: string;
  onChainPlanId: string | null;
  authorizedByDoctorId: string | null;
  authorizedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TreatmentDocument {
  id: string;
  name: string;
  kind: "plan" | "consent-form" | "summary" | "imaging-report";
  contentHash: string;
  uploadedAt: string;
}

export type MedicationStatus = "active" | "paused" | "completed" | "discontinued";
export type DoseStatus = "pending" | "taken" | "missed" | "skipped";

export interface Medication {
  id: string;
  patientId: string;
  name: string;
  activeIngredient: string;
  dosage: string;
  route: string;
  frequency: string;
  scheduledTimes: string[];
  startDate: string;
  endDate: string | null;
  status: MedicationStatus;
  prescriberId: string;
  instructions: string;
  cautions: string;
  reminderEnabled: boolean;
  doses: DoseRecord[];
  createdAt: string;
  updatedAt: string;
}

export interface DoseRecord {
  id: string;
  medicationId: string;
  scheduledAt: string;
  status: DoseStatus;
  recordedAt: string | null;
  note: string | null;
}

/* ------------------------------------------------------------------ */
/* Records, reports, timeline                                          */
/* ------------------------------------------------------------------ */

export type MedicalRecordKind =
  | "profile"
  | "medical-history"
  | "family-history"
  | "symptom"
  | "lab-result"
  | "imaging"
  | "treatment"
  | "medication"
  | "nutrition"
  | "doctor-note"
  | "appointment"
  | "report"
  | "risk-assessment";

export interface MedicalRecordEntry {
  id: string;
  patientId: string;
  kind: MedicalRecordKind;
  title: string;
  summary: string;
  body: string;
  attachments: { name: string; contentHash: string }[];
  recordedById: string;
  contentHash: string;
  onChainRecordId: string | null;
  verifiedAt: string | null;
  lastVerification: { matches: boolean; checkedAt: string; onChainHash: string } | null;
  createdAt: string;
  updatedAt: string;
}

export interface MedicalReport {
  id: string;
  patientId: string;
  doctorId: string;
  title: string;
  date: string;
  clinicalNotes: string;
  assessment: string;
  treatmentInformation: string;
  recommendations: string;
  followUpDate: string | null;
  contentHash: string;
  onChainRecordId: string | null;
  lastVerification: { matches: boolean; checkedAt: string; onChainHash: string } | null;
  createdAt: string;
  updatedAt: string;
}

export interface TimelineEvent {
  id: string;
  patientId: string;
  occurredAt: string;
  kind: MedicalRecordKind | "consent" | "blockchain";
  title: string;
  description: string;
  actor: string;
  contentHash: string | null;
  recordId: string | null;
}

/* ------------------------------------------------------------------ */
/* Consent, appointments, notifications, audit, blockchain             */
/* ------------------------------------------------------------------ */

export type ConsentStatus = "active" | "expired" | "revoked" | "pending";

export interface ConsentRecord {
  id: string;
  patientId: string;
  granteeId: string;
  granteeType: "doctor" | "researcher" | "institution";
  granteeName: string;
  scopeName: string;
  scopeDescription: string;
  scopeHash: string;
  status: ConsentStatus;
  grantedAt: string;
  expiresAt: string | null;
  revokedAt: string | null;
  signature: string | null;
  transactionHash: string | null;
  createdAt: string;
}

export type AppointmentStatus = "requested" | "confirmed" | "completed" | "cancelled" | "no-show";

export interface Appointment {
  id: string;
  patientId: string;
  doctorId: string;
  startsAt: string;
  endsAt: string;
  reason: string;
  modality: "in-person" | "telehealth";
  status: AppointmentStatus;
  location: string;
  notes: string;
  reminderSent: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface DoctorAvailabilitySlot {
  doctorId: string;
  startsAt: string;
  endsAt: string;
  available: boolean;
}

export type NotificationKind =
  | "appointment-upcoming"
  | "medication-reminder"
  | "nutrition-plan-update"
  | "doctor-message"
  | "new-report"
  | "consent-request"
  | "consent-revoked"
  | "follow-up-reminder"
  | "record-verified"
  | "system";

export interface Notification {
  id: string;
  userId: string;
  kind: NotificationKind;
  title: string;
  body: string;
  readAt: string | null;
  actionLabel: string | null;
  actionHref: string | null;
  severity: "info" | "success" | "warning" | "critical";
  createdAt: string;
}

export interface AuditLogEntry {
  id: string;
  actorId: string;
  actorRole: Role | "system";
  action: string;
  patientId: string | null;
  resource: string;
  resourceId: string | null;
  dataHash: string | null;
  ipAddress: string | null;
  outcome: "success" | "denied" | "failure";
  createdAt: string;
  onChainEntryId: string | null;
}

export interface BlockchainRecord {
  id: string;
  patientId: string | null;
  kind: "patient-registration" | "consent" | "record-hash" | "treatment-plan" | "audit";
  label: string;
  dataHash: string;
  contract: string;
  transactionHash: string | null;
  blockNumber: number | null;
  status: "pending" | "confirmed" | "failed" | "unanchored";
  verification: "unverified" | "match" | "mismatch";
  createdAt: string;
  confirmedAt: string | null;
}

/* ------------------------------------------------------------------ */
/* Knowledge & safety content                                          */
/* ------------------------------------------------------------------ */

export interface KnowledgeArticle {
  slug: string;
  category: string;
  title: string;
  readingTimeMinutes: number;
  summary: string;
  sections: { heading: string; body: string; bullets?: string[] }[];
  references: { organization: string; title: string; url: string }[];
  updatedAt: string;
}

export interface RedFlagCategory {
  id: string;
  title: string;
  description: string;
  signs: string[];
  action: string;
  urgency: "prompt" | "urgent" | "emergency";
}

/* ------------------------------------------------------------------ */
/* Analytics                                                           */
/* ------------------------------------------------------------------ */

export interface DoctorDashboardStats {
  totalPatients: number;
  activePatients: number;
  upcomingAppointments: number;
  patientsRequiringFollowUp: number;
  highRiskPatients: number;
  reportsThisMonth: number;
  pendingConsentRequests: number;
}

export interface PlatformAnalytics {
  patientTrend: { period: string; patients: number; assessments: number }[];
  riskDistribution: { level: RiskLevel; count: number }[];
  treatmentStatus: { status: TreatmentStatus; count: number }[];
  nutritionAdherence: { period: string; adherence: number }[];
  appointmentStats: { period: string; scheduled: number; completed: number; cancelled: number }[];
  followUpRates: { period: string; rate: number }[];
  symptomFrequency: { symptom: string; count: number }[];
}
