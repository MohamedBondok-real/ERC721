import { z } from "zod";

/* ------------------------------------------------------------------ */
/* Shared validation schemas                                           */
/*                                                                     */
/* The same schemas validate browser forms (react-hook-form) and API   */
/* request bodies, so a rule can never drift between the two.          */
/* ------------------------------------------------------------------ */

export const EMAIL_MAX = 254;
export const HEX32 = /^0x[0-9a-fA-F]{64}$/;
export const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
export const TX_HASH = /^0x[0-9a-fA-F]{64}$/;

export const bytes32Schema = z.string().regex(HEX32, "Expected a 0x-prefixed 32-byte hash");
export const addressSchema = z.string().regex(ADDRESS, "Expected a 0x-prefixed EVM address");

/* ------------------------- auth ------------------------- */

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email address").max(EMAIL_MAX),
  password: z.string().min(8, "Password must be at least 8 characters").max(256),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const registerSchema = z
  .object({
    email: z.string().trim().toLowerCase().email("Enter a valid email address").max(EMAIL_MAX),
    password: z
      .string()
      .min(10, "Use at least 10 characters")
      .max(256)
      .regex(/[a-z]/, "Include a lowercase letter")
      .regex(/[A-Z]/, "Include an uppercase letter")
      .regex(/[0-9]/, "Include a number"),
    confirmPassword: z.string(),
    displayName: z.string().trim().min(2, "Enter your name").max(120),
    role: z.enum(["patient", "doctor"]),
    birthYear: z
      .number({ invalid_type_error: "Enter a year" })
      .int()
      .min(1900, "Enter a valid year")
      .max(new Date().getFullYear(), "Enter a valid year")
      .optional()
      .or(z.literal("")),
    walletAddress: addressSchema.optional().or(z.literal("")),
    acceptedDisclaimer: z.literal(true, {
      errorMap: () => ({ message: "You must acknowledge the medical disclaimer to continue" }),
    }),
  })
  .refine((data) => data.password === data.confirmPassword, {
    path: ["confirmPassword"],
    message: "Passwords do not match",
  });
export type RegisterInput = z.infer<typeof registerSchema>;

export const walletSignatureSchema = z.object({
  address: addressSchema,
  message: z.string().min(1).max(2000),
  signature: z.string().min(130).max(4096),
});
export type WalletSignatureInput = z.infer<typeof walletSignatureSchema>;

/* ------------------------- patients ------------------------- */

export const patientProfileSchema = z.object({
  displayName: z.string().trim().min(2).max(120),
  birthYear: z.number().int().min(1900).max(new Date().getFullYear()),
  biologicalSex: z.enum(["female", "male", "other", "prefer-not-to-say"]),
  region: z.string().trim().min(2).max(80),
  bloodType: z.string().trim().max(8).optional().nullable(),
  allergies: z.array(z.string().trim().min(1).max(80)).max(30).default([]),
  comorbidities: z.array(z.string().trim().min(1).max(120)).max(30).default([]),
  currentTreatmentPhase: z
    .enum(["not-in-treatment", "diagnosis-workup", "active-treatment", "recovery", "survivorship", "palliative"])
    .default("not-in-treatment"),
});
export type PatientProfileInput = z.infer<typeof patientProfileSchema>;

/* ------------------------- symptoms ------------------------- */

export const symptomReportSchema = z.object({
  code: z.string().min(3).max(60),
  severity: z.enum(["mild", "moderate", "severe"]),
  side: z.enum(["left", "right", "both", "not-applicable"]),
  durationWeeks: z.number().int().min(0).max(1200),
  progressive: z.boolean().default(false),
  notes: z.string().trim().max(1000).optional().nullable(),
});
export type SymptomReportInput = z.infer<typeof symptomReportSchema>;

/* ------------------------- risk assessment ------------------------- */

export const riskAssessmentInputSchema = z.object({
  age: z.number().int().min(16, "This questionnaire is for adults aged 16 and over").max(120),
  biologicalSex: z.enum(["female", "male", "other", "prefer-not-to-say"]).optional(),
  familyHistory: z.object({
    firstDegreeRelativesWithBreastCancer: z.number().int().min(0).max(10),
    maleRelativeWithBreastCancer: z.boolean(),
    relativeDiagnosedBefore50: z.boolean(),
    ovarianOrPancreaticCancerInFamily: z.boolean(),
    knownPathogenicVariant: z.boolean(),
    ashkenaziJewishAncestry: z.boolean(),
  }),
  personalHistory: z.object({
    previousBreastCancer: z.boolean(),
    previousBenignBreastDisease: z.boolean(),
    atypicalHyperplasiaOrLcis: z.boolean(),
    chestRadiationBeforeAge30: z.boolean(),
    otherCancerHistory: z.boolean(),
  }),
  reproductiveHistory: z.object({
    menarcheBefore12: z.boolean(),
    menopauseAfter55: z.boolean(),
    firstLiveBirthAfter30: z.boolean(),
    neverGaveBirth: z.boolean(),
    neverBreastfed: z.boolean(),
    combinedHormoneTherapy: z.boolean(),
    currentHormoneTherapy: z.boolean(),
  }),
  lifestyle: z.object({
    bmi: z.number().min(10).max(80).nullable(),
    alcoholUnitsPerWeek: z.number().min(0).max(200),
    physicalActivity: z.enum(["low", "moderate", "high"]),
    smokingStatus: z.enum(["never", "former", "current"]),
    postmenopausal: z.boolean(),
  }),
  screening: z.object({
    lastMammogramMonthsAgo: z.number().min(0).max(600).nullable(),
    denseBreastTissue: z.boolean(),
    screeningUpToDate: z.boolean(),
  }),
  symptoms: z.array(
    z.object({
      code: z.string().min(3).max(60),
      label: z.string().max(200),
      durationWeeks: z.number().int().min(0).max(1200),
      unilateral: z.boolean(),
      progressive: z.boolean(),
      severe: z.boolean(),
    }),
  ).default([]),
});
export type RiskAssessmentInputSchema = z.infer<typeof riskAssessmentInputSchema>;

/* ------------------------- nutrition ------------------------- */

export const nutritionPlanInputSchema = z.object({
  phase: z.enum(["during-treatment", "recovery", "survivorship", "side-effect-support"]),
  treatmentModalities: z.array(z.string().trim().min(1).max(80)).max(10).default([]),
  sideEffects: z.array(z.string().trim().min(1).max(60)).max(20).default([]),
  dietaryPreferences: z.array(z.string().trim().min(1).max(60)).max(10).default([]),
  allergies: z.array(z.string().trim().min(1).max(80)).max(20).default([]),
  restrictions: z.array(z.string().trim().min(1).max(60)).max(20).default([]),
  comorbidities: z.array(z.string().trim().min(1).max(120)).max(20).default([]),
  clinicianRecommendations: z.string().trim().max(2000).default(""),
  appetiteScore: z.number().int().min(0).max(5).default(3),
  weightTrend: z.enum(["losing", "stable", "gaining", "unknown"]).default("unknown"),
});
export type NutritionPlanInputSchema = z.infer<typeof nutritionPlanInputSchema>;

export const nutritionLogSchema = z.object({
  slot: z.enum(["breakfast", "mid-morning", "lunch", "afternoon", "dinner", "evening", "snack"]),
  description: z.string().trim().min(2).max(400),
  adherence: z.enum(["followed", "partial", "skipped"]),
  appetiteScore: z.number().int().min(0).max(5),
  nauseaScore: z.number().int().min(0).max(5),
  notes: z.string().trim().max(600).optional().nullable(),
});
export type NutritionLogInput = z.infer<typeof nutritionLogSchema>;

/* ------------------------- treatment & medication ------------------------- */

export const treatmentPlanSchema = z.object({
  name: z.string().trim().min(3).max(160),
  modality: z.enum([
    "surgery",
    "radiation",
    "chemotherapy",
    "hormone-therapy",
    "targeted-therapy",
    "immunotherapy",
    "clinical-trial",
    "supportive-care",
    "other",
  ]),
  status: z.enum(["proposed", "authorized", "active", "on-hold", "completed", "cancelled"]).default("proposed"),
  startDate: z.string().trim().optional().nullable(),
  expectedEndDate: z.string().trim().optional().nullable(),
  summary: z.string().trim().min(3).max(2000),
  notes: z.string().trim().max(4000).default(""),
  sideEffects: z.array(z.string().trim().min(1).max(120)).max(40).default([]),
  progressPercent: z.number().int().min(0).max(100).default(0),
});
export type TreatmentPlanInput = z.infer<typeof treatmentPlanSchema>;

export const medicationSchema = z.object({
  name: z.string().trim().min(2).max(160),
  activeIngredient: z.string().trim().min(2).max(160),
  dosage: z.string().trim().min(1).max(80),
  route: z.string().trim().min(1).max(60),
  frequency: z.string().trim().min(1).max(80),
  scheduledTimes: z.array(z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:MM")).max(12).default([]),
  startDate: z.string().min(4),
  endDate: z.string().optional().nullable(),
  status: z.enum(["active", "paused", "completed", "discontinued"]).default("active"),
  instructions: z.string().trim().max(1000).default(""),
  cautions: z.string().trim().max(1000).default(""),
  reminderEnabled: z.boolean().default(true),
});
export type MedicationInput = z.infer<typeof medicationSchema>;

export const doseLogSchema = z.object({
  medicationId: z.string().min(1),
  doseId: z.string().min(1),
  status: z.enum(["taken", "missed", "skipped"]),
  note: z.string().trim().max(400).optional().nullable(),
});
export type DoseLogInput = z.infer<typeof doseLogSchema>;

/* ------------------------- records, reports, appointments ------------------------- */

export const medicalRecordSchema = z.object({
  kind: z.enum([
    "profile",
    "medical-history",
    "family-history",
    "symptom",
    "lab-result",
    "imaging",
    "treatment",
    "medication",
    "nutrition",
    "doctor-note",
    "appointment",
    "report",
    "risk-assessment",
  ]),
  title: z.string().trim().min(3).max(200),
  summary: z.string().trim().min(3).max(600),
  body: z.string().trim().min(3).max(20000),
});
export type MedicalRecordInput = z.infer<typeof medicalRecordSchema>;

export const medicalReportSchema = z.object({
  title: z.string().trim().min(3).max(200),
  date: z.string().min(4),
  clinicalNotes: z.string().trim().min(3).max(20000),
  assessment: z.string().trim().min(3).max(10000),
  treatmentInformation: z.string().trim().max(10000).default(""),
  recommendations: z.string().trim().min(3).max(10000),
  followUpDate: z.string().trim().optional().nullable(),
});
export type MedicalReportInput = z.infer<typeof medicalReportSchema>;

export const appointmentSchema = z.object({
  doctorId: z.string().min(1),
  startsAt: z.string().min(1),
  endsAt: z.string().min(1),
  reason: z.string().trim().min(3).max(400),
  modality: z.enum(["in-person", "telehealth"]).default("in-person"),
  location: z.string().trim().max(200).default(""),
  notes: z.string().trim().max(1000).default(""),
});
export type AppointmentInput = z.infer<typeof appointmentSchema>;

export const consentGrantSchema = z.object({
  granteeId: z.string().min(1),
  scopeName: z.string().trim().min(2).max(80),
  scopeDescription: z.string().trim().min(2).max(600),
  expiresAt: z.string().trim().optional().nullable(),
});
export type ConsentGrantInput = z.infer<typeof consentGrantSchema>;

export const doctorProfileSchema = z.object({
  displayName: z.string().trim().min(2).max(120),
  specialty: z.string().trim().min(2).max(120),
  licenseNumber: z.string().trim().min(2).max(80),
  institution: z.string().trim().min(2).max(160),
});
export type DoctorProfileInput = z.infer<typeof doctorProfileSchema>;

export const assistantQuestionSchema = z.object({
  question: z.string().trim().min(4, "Ask a question with at least 4 characters").max(2000),
  context: z.enum(["terminology", "nutrition", "treatment", "appointments", "symptoms", "general"]).default("general"),
});
export type AssistantQuestionInput = z.infer<typeof assistantQuestionSchema>;

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(25),
});
export type PaginationInput = z.infer<typeof paginationSchema>;
