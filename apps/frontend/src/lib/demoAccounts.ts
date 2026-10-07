/**
 * FICTIONAL DEMO DATA — NOT REAL PATIENT INFORMATION.
 *
 * Demo credentials for the labelled demo environment. They exist so reviewers can explore the
 * platform without inventing an account, and must never be enabled in production
 * (`DEMO_AUTH_ENABLED=false`).
 */
export const DEMO_PASSWORD = "BreastCare#Demo2026";

export const DEMO_ACCOUNTS = [
  { role: "patient", email: "amina@demo.breastcare.ai", password: DEMO_PASSWORD, label: "Patient in active treatment" },
  { role: "patient", email: "grace@demo.breastcare.ai", password: DEMO_PASSWORD, label: "Survivor on endocrine therapy" },
  { role: "patient", email: "sofia@demo.breastcare.ai", password: DEMO_PASSWORD, label: "Awaiting diagnostic work-up" },
  { role: "patient", email: "clara@demo.breastcare.ai", password: DEMO_PASSWORD, label: "High-risk result, red-flag symptoms" },
  { role: "doctor", email: "doctor@demo.breastcare.ai", password: DEMO_PASSWORD, label: "Breast surgeon" },
  { role: "doctor", email: "oncologist@demo.breastcare.ai", password: DEMO_PASSWORD, label: "Medical oncologist" },
  { role: "admin", email: "admin@demo.breastcare.ai", password: DEMO_PASSWORD, label: "Platform administrator (no implicit record access)" },
] as const;
