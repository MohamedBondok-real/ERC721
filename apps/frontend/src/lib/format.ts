import type {
  RiskLevel,
  TreatmentStatus,
  Appointment,
  Notification,
  SymptomSeverity,
  MedicationStatus,
  ConsentStatus,
} from "@breastcare/shared";

/* ------------------------------------------------------------------ */
/* Clinical label + tone mapping                                       */
/*                                                                     */
/* The wording here is deliberate: risk is reported as an indicator,    */
/* never as a diagnosis.                                              */
/* ------------------------------------------------------------------ */

export const RISK_COPY: Record<RiskLevel, { label: string; tone: "success" | "warning" | "destructive"; summary: string }> = {
  low: {
    label: "Low risk indicators",
    tone: "success",
    summary: "Your answers contain few of the factors associated with higher risk. Screening and breast awareness still apply.",
  },
  moderate: {
    label: "Moderate risk indicators",
    tone: "warning",
    summary: "Your responses indicate that professional medical evaluation may be appropriate.",
  },
  high: {
    label: "High risk indicators",
    tone: "destructive",
    summary: "Your responses indicate that professional medical evaluation may be appropriate. Please arrange a clinical review.",
  },
};

export const TREATMENT_COPY: Record<TreatmentStatus, { label: string; tone: "muted" | "accent" | "success" | "warning" | "destructive" }> = {
  proposed: { label: "Proposed", tone: "muted" },
  authorized: { label: "Authorized", tone: "accent" },
  active: { label: "Active", tone: "success" },
  "on-hold": { label: "On hold", tone: "warning" },
  completed: { label: "Completed", tone: "accent" },
  cancelled: { label: "Cancelled", tone: "destructive" },
};

export const APPOINTMENT_COPY: Record<Appointment["status"], { label: string; tone: "muted" | "accent" | "success" | "warning" | "destructive" }> = {
  requested: { label: "Requested", tone: "muted" },
  confirmed: { label: "Confirmed", tone: "accent" },
  completed: { label: "Completed", tone: "success" },
  cancelled: { label: "Cancelled", tone: "destructive" },
  "no-show": { label: "No show", tone: "warning" },
};

export const NOTIFICATION_TONE: Record<Notification["severity"], "muted" | "accent" | "success" | "warning" | "destructive"> = {
  info: "muted",
  success: "success",
  warning: "warning",
  critical: "destructive",
};

export const SEVERITY_COPY: Record<SymptomSeverity, { label: string; tone: "muted" | "warning" | "destructive" }> = {
  mild: { label: "Mild", tone: "muted" },
  moderate: { label: "Moderate", tone: "warning" },
  severe: { label: "Severe", tone: "destructive" },
};

export const MEDICATION_COPY: Record<MedicationStatus, { label: string; tone: "muted" | "accent" | "success" | "warning" | "destructive" }> = {
  active: { label: "Active", tone: "success" },
  paused: { label: "Paused", tone: "warning" },
  completed: { label: "Completed", tone: "accent" },
  discontinued: { label: "Discontinued", tone: "muted" },
};

export const CONSENT_COPY: Record<ConsentStatus, { label: string; tone: "muted" | "accent" | "success" | "warning" | "destructive" }> = {
  active: { label: "Active", tone: "success" },
  pending: { label: "Pending", tone: "warning" },
  expired: { label: "Expired", tone: "muted" },
  revoked: { label: "Revoked", tone: "destructive" },
};

export const URGENCY_COPY: Record<string, { label: string; tone: "success" | "warning" | "destructive"; guidance: string }> = {
  routine: { label: "Routine", tone: "success", guidance: "Discuss at your next planned appointment." },
  soon: { label: "Book soon", tone: "warning", guidance: "Arrange an appointment with your care team within the next few weeks." },
  prompt: { label: "Prompt review", tone: "destructive", guidance: "Contact your care team promptly to arrange a clinical review." },
};

export const DOSE_COPY: Record<string, { label: string; tone: "muted" | "success" | "warning" | "destructive" }> = {
  pending: { label: "Due", tone: "muted" },
  taken: { label: "Taken", tone: "success" },
  missed: { label: "Missed", tone: "warning" },
  skipped: { label: "Skipped", tone: "destructive" },
};
