import { useQuery } from "@tanstack/react-query";
import type {
  Appointment,
  AssessmentUrgency,
  ConsentRecord,
  MedicalRecordEntry,
  MedicalReport,
  Medication,
  NutritionPlan,
  PatientProfile,
  RiskAssessmentRecord,
  RiskLevel,
  SymptomReport,
  TreatmentPlanRecord,
} from "@breastcare/shared";
import { api } from "@/lib/api";
import { queryKeys } from "@/lib/queryClient";
import { useAuth } from "@/context/AuthContext";

/* Shared query hooks so every page reads the same endpoints with the same keys. */

/** Mirrors `patientOverview` in `apps/backend/src/services/platform.service.ts`. */
export interface PatientOverview {
  profile: PatientProfile;
  /** A projection of the newest assessment — the full record comes from `/patients/risk-assessment`. */
  latestAssessment: {
    id: string;
    level: RiskLevel;
    urgency: AssessmentUrgency;
    score: number;
    maxScore: number;
    modelName: string;
    completedAt: string;
    redFlags: string[];
  } | null;
  /** Count of symptoms that matched a red-flag pattern. */
  redFlagSymptoms: number;
  upcomingAppointments: Appointment[];
  activeTreatments: TreatmentPlanRecord[];
  activeMedications: Medication[];
  latestNutritionPlan: NutritionPlan | null;
  recentReports: MedicalReport[];
  counts: {
    records: number;
    symptoms: number;
    assessments: number;
    treatments: number;
    medications: number;
    appointments: number;
    reports: number;
  };
}

export function usePatientOverview() {
  return useQuery({
    queryKey: queryKeys.patient.overview,
    queryFn: ({ signal }) => api.get<PatientOverview>("/patients/overview", undefined, signal),
  });
}

export function useTimeline() {
  return useQuery({
    queryKey: queryKeys.patient.timeline,
    queryFn: ({ signal }) => api.get<{ events: TimelineEvent[] }>("/patients/timeline", undefined, signal),
  });
}

export interface TimelineEvent {
  id: string;
  kind: string;
  title: string;
  summary: string;
  occurredAt: string;
  tone?: "muted" | "accent" | "success" | "warning" | "destructive";
}

export function useRecords() {
  return useQuery({
    queryKey: queryKeys.patient.records,
    queryFn: ({ signal }) => api.get<{ records: MedicalRecordEntry[] }>("/patients/records", undefined, signal),
  });
}

export function useSymptoms() {
  return useQuery({
    queryKey: queryKeys.patient.symptoms,
    queryFn: ({ signal }) => api.get<{ symptoms: SymptomReport[] }>("/patients/symptoms", undefined, signal),
  });
}

export function useSymptomCatalogue() {
  return useQuery({
    queryKey: ["symptom-catalogue"],
    queryFn: ({ signal }) => api.get<{ symptoms: { code: string; label: string; description: string }[] }>("/patients/symptoms/catalogue", undefined, signal),
  });
}

export function useRiskAssessments() {
  return useQuery({
    queryKey: queryKeys.patient.risk,
    queryFn: ({ signal }) => api.get<{ assessments: RiskAssessmentRecord[] }>("/patients/risk-assessment", undefined, signal),
  });
}

export function useRiskModels() {
  return useQuery({
    queryKey: ["risk-models"],
    queryFn: ({ signal }) =>
      api.get<{ models: { id: string; version: string; label: string; description: string; active: boolean }[] }>(
        "/patients/risk-assessment/models",
        undefined,
        signal,
      ),
  });
}

export function useNutrition() {
  return useQuery({
    queryKey: queryKeys.patient.nutrition,
    queryFn: ({ signal }) =>
      api.get<{ plans: NutritionPlan[]; adherence: NutritionAdherence }>("/patients/nutrition", undefined, signal),
  });
}

export function useNutritionAdherence(days = 30) {
  return useQuery({
    queryKey: queryKeys.patient.adherence(days),
    queryFn: ({ signal }) => api.get<NutritionAdherence>(`/patients/nutrition/adherence?days=${days}`, undefined, signal),
  });
}

export interface NutritionAdherence {
  entries: { id: string; loggedAt: string; slot: string; description: string; adherence: string; appetiteScore: number; nauseaScore: number }[];
  adherenceRate: number;
  averageAppetite: number;
  averageNausea: number;
}

export function useReports() {
  return useQuery({
    queryKey: queryKeys.patient.reports,
    queryFn: ({ signal }) => api.get<{ reports: MedicalReport[] }>("/patients/reports", undefined, signal),
  });
}

export function useConsents() {
  return useQuery({
    queryKey: queryKeys.patient.consent,
    queryFn: ({ signal }) => api.get<{ consents: ConsentRow[] }>("/consent", undefined, signal),
  });
}

export interface ConsentRow extends ConsentRecord {
  effectiveStatus: "active" | "expired" | "revoked";
  onChainActive: boolean | null;
}

export function useGrantees() {
  return useQuery({
    queryKey: queryKeys.patient.grantees,
    queryFn: ({ signal }) =>
      api.get<{ grantees: { id: string; name: string; specialty: string; institution: string; walletLinked: boolean }[] }>(
        "/consent/grantees",
        undefined,
        signal,
      ),
  });
}

export function useTreatments(patientId: string | null) {
  return useQuery({
    queryKey: queryKeys.treatments(patientId ?? "me"),
    queryFn: ({ signal }) => api.get<{ treatments: TreatmentPlanRecord[] }>("/treatments", { patientId: patientId ?? undefined }, signal),
    enabled: Boolean(patientId),
  });
}

export function useMedications(patientId: string | null) {
  return useQuery({
    queryKey: queryKeys.medications(patientId ?? "me"),
    queryFn: ({ signal }) =>
      api.get<{ medications: Medication[]; upcomingDoses: { medicationId: string; doseId: string; scheduledAt: string }[] }>(
        "/medications",
        { patientId: patientId ?? undefined },
        signal,
      ),
    enabled: Boolean(patientId),
  });
}

export function useMyAppointments() {
  return useQuery({
    queryKey: queryKeys.appointments("me"),
    queryFn: ({ signal }) => api.get<{ upcoming: Appointment[]; past: Appointment[] }>("/appointments", undefined, signal),
  });
}

export function useAvailability(doctorId: string | null, days = 14) {
  return useQuery({
    queryKey: queryKeys.availability(doctorId ?? "", days),
    queryFn: ({ signal }) =>
      api.get<{ slots: { startsAt: string; endsAt: string; available: boolean }[] }>("/availability", { doctorId: doctorId ?? undefined, days }, signal),
    enabled: Boolean(doctorId),
  });
}

export function useBlockchain() {
  const { patientId } = useAuth();
  return useQuery({
    queryKey: queryKeys.blockchain(patientId),
    queryFn: ({ signal }) => api.get<BlockchainOverview>("/blockchain", undefined, signal),
  });
}

export interface BlockchainOverview {
  status: {
    configured: boolean;
    reachable: boolean;
    chainId: number | null;
    blockNumber: number | null;
    operator: string | null;
    missing: string[];
    addresses?: Record<string, string>;
  };
  auditEntryCount: number | null;
  registration: {
    registered: boolean;
    patientId: string | null;
    wallet: string | null;
    pseudonym: string | null;
    profileHash: string | null;
    registeredAt: number | null;
    status: number | null;
  } | null;
  trail: { entryId: number; actor: string; action: string; actionLabel: string | null; dataHash: string; source: string; timestamp: number }[] | null;
  records: BlockchainRecordRow[];
}

export interface BlockchainRecordRow {
  id: string;
  kind: string;
  label: string;
  dataHash: string;
  contract: string;
  transactionHash: string | null;
  blockNumber: number | null;
  status: "unanchored" | "pending" | "confirmed" | "failed";
  verification: string;
  createdAt: string;
}

export function useBlockchainHealth() {
  return useQuery({
    queryKey: queryKeys.blockchainHealth,
    queryFn: ({ signal }) =>
      api.get<{ configured: boolean; reachable: boolean; chainId: number | null; blockNumber: number | null; missing: string[]; auditEntries: number | null }>(
        "/blockchain/health",
        undefined,
        signal,
      ),
    refetchInterval: 60_000,
  });
}

export function useRedFlags() {
  return useQuery({
    queryKey: queryKeys.redFlags,
    queryFn: ({ signal }) =>
      api.get<{ categories: { id: string; title: string; signs: string[]; action: string }[]; emergency: string; disclaimer: string }>(
        "/red-flags",
        undefined,
        signal,
      ),
  });
}
