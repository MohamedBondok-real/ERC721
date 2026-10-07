import bcrypt from "bcryptjs";
import { buildNutritionPlan, getActiveRiskModel, symptomDefinition, type RiskAssessmentInput, RISK_ASSESSMENT_DISCLAIMER } from "@breastcare/shared";
import type { Store, UserRecord } from "../db";
import { bytes32, contentHash, newId } from "../lib/crypto";
import { logger } from "../lib/logger";
import { chainStatus } from "../blockchain/client";
import { audit, consentStatus } from "../services/core.service";
import { DEMO_PASSWORD } from "./demoCredentials";

/* ------------------------------------------------------------------ */
/* FICTIONAL DEMO DATA — NOT REAL PATIENT INFORMATION                  */
/*                                                                     */
/* Every person, symptom, result and note below is invented for the    */
/* demo environment. Nothing here describes a real patient, and no     */
/* clinical guidance should be inferred from it.                       */
/* ------------------------------------------------------------------ */

const now = () => new Date().toISOString();
const daysAgo = (days: number, hour = 9, minute = 0) => {
  const date = new Date(Date.now() - days * 86_400_000);
  date.setHours(hour, minute, 0, 0);
  return date.toISOString();
};
const daysAhead = (days: number, hour = 10, minute = 0) => {
  const date = new Date(Date.now() + days * 86_400_000);
  date.setHours(hour, minute, 0, 0);
  return date.toISOString();
};

interface DemoPatientSpec {
  key: string;
  displayName: string;
  pseudonymousId: string;
  birthYear: number;
  region: string;
  phase: string;
  allergies: string[];
  comorbidities: string[];
  risk: Partial<RiskAssessmentInput> & { age: number };
  symptoms: { code: string; severity: "mild" | "moderate" | "severe"; side: "left" | "right" | "both" | "not-applicable"; durationWeeks: number; progressive: boolean }[];
  treatments: { name: string; modality: string; status: string; startDaysAgo: number; expectedEndDaysAhead: number; summary: string; sideEffects: string[]; progress: number }[];
  medications: { name: string; ingredient: string; dosage: string; route: string; frequency: string; times: string[]; instructions: string }[];
  nutritionPhase: "during-treatment" | "recovery" | "survivorship" | "side-effect-support";
  sideEffects: string[];
  notes: { title: string; body: string; daysAgo: number }[];
  report: { title: string; assessment: string; recommendations: string; followUpDaysAhead: number };
}

const PATIENTS: DemoPatientSpec[] = [
  {
    key: "amina",
    displayName: "Amina Hassan",
    pseudonymousId: "PT-DEMO-0001",
    birthYear: 1971,
    region: "Manchester, UK",
    phase: "active-treatment",
    allergies: ["penicillin allergy"],
    comorbidities: ["hypertension"],
    risk: {
      age: 55,
      familyHistory: {
        firstDegreeRelativesWithBreastCancer: 1,
        maleRelativeWithBreastCancer: false,
        relativeDiagnosedBefore50: true,
        ovarianOrPancreaticCancerInFamily: false,
        knownPathogenicVariant: false,
        ashkenaziJewishAncestry: false,
      },
      personalHistory: { previousBreastCancer: false, previousBenignBreastDisease: true, atypicalHyperplasiaOrLcis: false, chestRadiationBeforeAge30: false, otherCancerHistory: false },
      reproductiveHistory: { menarcheBefore12: true, menopauseAfter55: false, firstLiveBirthAfter30: true, neverGaveBirth: false, neverBreastfed: true, combinedHormoneTherapy: false, currentHormoneTherapy: false },
      lifestyle: { bmi: 28, alcoholUnitsPerWeek: 8, physicalActivity: "low", smokingStatus: "former", postmenopausal: true },
      screening: { lastMammogramMonthsAgo: 14, denseBreastTissue: true, screeningUpToDate: false },
    },
    symptoms: [{ code: "breast-lump", severity: "moderate", side: "left", durationWeeks: 4, progressive: true }],
    treatments: [
      { name: "Adjuvant chemotherapy (AC-T)", modality: "chemotherapy", status: "active", startDaysAgo: 42, expectedEndDaysAhead: 60, summary: "Four cycles of AC followed by weekly paclitaxel, as planned by the multidisciplinary team.", sideEffects: ["Fatigue", "Nausea", "Hair loss"], progress: 45 },
      { name: "Breast-conserving surgery", modality: "surgery", status: "completed", startDaysAgo: 90, expectedEndDaysAhead: 0, summary: "Wide local excision with sentinel node biopsy; margins clear.", sideEffects: ["Post-operative pain"], progress: 100 },
    ],
    medications: [
      { name: "Ondansetron", ingredient: "ondansetron hydrochloride", dosage: "8 mg", route: "oral", frequency: "twice daily on chemotherapy days", times: ["08:00", "20:00"], instructions: "Take before chemotherapy as directed." },
      { name: "Filgrastim", ingredient: "filgrastim", dosage: "300 micrograms", route: "subcutaneous injection", frequency: "daily for 5 days after chemotherapy", times: ["09:00"], instructions: "Injection site rotated as taught by the nursing team." },
    ],
    nutritionPhase: "during-treatment",
    sideEffects: ["nausea", "appetite-loss", "fatigue"],
    notes: [
      { title: "Cycle 3 review", body: "Tolerating cycle 3 reasonably well. Nausea controlled with ondansetron. Count recovery adequate. Continue current supportive care.", daysAgo: 12 },
    ],
    report: {
      title: "Mid-treatment review",
      assessment: "Responding as expected. No new clinical concerns. Nausea is the main limiting symptom.",
      recommendations: "Continue planned cycles. Review anti-emetic regimen if nausea worsens. Dietitian referral arranged.",
      followUpDaysAhead: 14,
    },
  },
  {
    key: "grace",
    displayName: "Grace Okafor",
    pseudonymousId: "PT-DEMO-0002",
    birthYear: 1958,
    region: "London, UK",
    phase: "survivorship",
    allergies: [],
    comorbidities: ["type 2 diabetes"],
    risk: {
      age: 68,
      familyHistory: {
        firstDegreeRelativesWithBreastCancer: 2,
        maleRelativeWithBreastCancer: false,
        relativeDiagnosedBefore50: false,
        ovarianOrPancreaticCancerInFamily: true,
        knownPathogenicVariant: true,
        ashkenaziJewishAncestry: false,
      },
      personalHistory: { previousBreastCancer: true, previousBenignBreastDisease: false, atypicalHyperplasiaOrLcis: true, chestRadiationBeforeAge30: false, otherCancerHistory: false },
      reproductiveHistory: { menarcheBefore12: false, menopauseAfter55: true, firstLiveBirthAfter30: false, neverGaveBirth: false, neverBreastfed: false, combinedHormoneTherapy: true, currentHormoneTherapy: false },
      lifestyle: { bmi: 31, alcoholUnitsPerWeek: 4, physicalActivity: "moderate", smokingStatus: "never", postmenopausal: true },
      screening: { lastMammogramMonthsAgo: 6, denseBreastTissue: false, screeningUpToDate: true },
    },
    symptoms: [],
    treatments: [
      { name: "Endocrine therapy (anastrozole)", modality: "hormone-therapy", status: "active", startDaysAgo: 400, expectedEndDaysAhead: 1100, summary: "Five-year adjuvant endocrine therapy following surgery and radiotherapy.", sideEffects: ["Joint stiffness"], progress: 30 },
      { name: "Radiotherapy", modality: "radiation", status: "completed", startDaysAgo: 500, expectedEndDaysAhead: 0, summary: "Whole breast radiotherapy, 15 fractions.", sideEffects: ["Skin reaction"], progress: 100 },
    ],
    medications: [{ name: "Anastrozole", ingredient: "anastrozole", dosage: "1 mg", route: "oral", frequency: "once daily", times: ["08:30"], instructions: "Take at the same time each day. Do not stop without discussing with your team." }],
    nutritionPhase: "survivorship",
    sideEffects: [],
    notes: [{ title: "Annual review", body: "Well. Adherent to endocrine therapy. Joint stiffness managed with activity and simple analgesia as advised.", daysAgo: 40 }],
    report: {
      title: "Annual survivorship review",
      assessment: "No evidence of recurrence clinically. Adherence to endocrine therapy good.",
      recommendations: "Continue endocrine therapy. Annual mammography. Bone density scan as scheduled.",
      followUpDaysAhead: 180,
    },
  },
  {
    key: "sofia",
    displayName: "Sofia Marino",
    pseudonymousId: "PT-DEMO-0003",
    birthYear: 1988,
    region: "Birmingham, UK",
    phase: "diagnosis-workup",
    allergies: ["latex allergy"],
    comorbidities: [],
    risk: {
      age: 38,
      familyHistory: {
        firstDegreeRelativesWithBreastCancer: 0,
        maleRelativeWithBreastCancer: false,
        relativeDiagnosedBefore50: false,
        ovarianOrPancreaticCancerInFamily: false,
        knownPathogenicVariant: false,
        ashkenaziJewishAncestry: false,
      },
      personalHistory: { previousBreastCancer: false, previousBenignBreastDisease: true, atypicalHyperplasiaOrLcis: false, chestRadiationBeforeAge30: false, otherCancerHistory: false },
      reproductiveHistory: { menarcheBefore12: false, menopauseAfter55: false, firstLiveBirthAfter30: true, neverGaveBirth: false, neverBreastfed: false, combinedHormoneTherapy: false, currentHormoneTherapy: false },
      lifestyle: { bmi: 23, alcoholUnitsPerWeek: 3, physicalActivity: "high", smokingStatus: "never", postmenopausal: false },
      screening: { lastMammogramMonthsAgo: null, denseBreastTissue: false, screeningUpToDate: false },
    },
    symptoms: [
      { code: "breast-lump", severity: "mild", side: "right", durationWeeks: 3, progressive: false },
      { code: "localized-pain", severity: "mild", side: "right", durationWeeks: 3, progressive: false },
    ],
    treatments: [],
    medications: [],
    nutritionPhase: "side-effect-support",
    sideEffects: ["nausea"],
    notes: [{ title: "Triple assessment booked", body: "Ultrasound and core biopsy arranged following palpable right breast lump. Reassurance given; results to be discussed at the next appointment.", daysAgo: 5 }],
    report: {
      title: "Symptomatic clinic assessment",
      assessment: "Right breast lump, three weeks, not progressive. Differential includes benign causes. Imaging and biopsy arranged.",
      recommendations: "Attend ultrasound and core biopsy. Return promptly if the lump enlarges, the skin changes or discharge appears.",
      followUpDaysAhead: 10,
    },
  },
  {
    key: "lena",
    displayName: "Lena Fischer",
    pseudonymousId: "PT-DEMO-0004",
    birthYear: 1965,
    region: "Leeds, UK",
    phase: "recovery",
    allergies: ["dairy allergy"],
    comorbidities: [],
    risk: {
      age: 61,
      familyHistory: {
        firstDegreeRelativesWithBreastCancer: 1,
        maleRelativeWithBreastCancer: false,
        relativeDiagnosedBefore50: false,
        ovarianOrPancreaticCancerInFamily: false,
        knownPathogenicVariant: false,
        ashkenaziJewishAncestry: false,
      },
      personalHistory: { previousBreastCancer: true, previousBenignBreastDisease: false, atypicalHyperplasiaOrLcis: false, chestRadiationBeforeAge30: false, otherCancerHistory: false },
      reproductiveHistory: { menarcheBefore12: false, menopauseAfter55: false, firstLiveBirthAfter30: false, neverGaveBirth: true, neverBreastfed: true, combinedHormoneTherapy: false, currentHormoneTherapy: false },
      lifestyle: { bmi: 26, alcoholUnitsPerWeek: 10, physicalActivity: "moderate", smokingStatus: "never", postmenopausal: true },
      screening: { lastMammogramMonthsAgo: 11, denseBreastTissue: false, screeningUpToDate: true },
    },
    symptoms: [{ code: "swelling-no-lump", severity: "mild", side: "left", durationWeeks: 2, progressive: false }],
    treatments: [{ name: "Radiotherapy boost", modality: "radiation", status: "completed", startDaysAgo: 60, expectedEndDaysAhead: 0, summary: "Tumour bed boost following breast-conserving surgery.", sideEffects: ["Skin sensitivity", "Fatigue"], progress: 100 }],
    medications: [{ name: "Tamoxifen", ingredient: "tamoxifen citrate", dosage: "20 mg", route: "oral", frequency: "once daily", times: ["20:00"], instructions: "Report any unusual vaginal bleeding promptly." }],
    nutritionPhase: "recovery",
    sideEffects: ["fatigue"],
    notes: [{ title: "Post-treatment review", body: "Completed radiotherapy. Skin reaction settling. Left arm swelling reported — lymphoedema referral made.", daysAgo: 8 }],
    report: {
      title: "Completion of radiotherapy",
      assessment: "Completed planned radiotherapy with expected skin reaction, now resolving.",
      recommendations: "Skin care advice given. Lymphoedema clinic referral. Continue tamoxifen.",
      followUpDaysAhead: 21,
    },
  },
  {
    key: "priya",
    displayName: "Priya Raman",
    pseudonymousId: "PT-DEMO-0005",
    birthYear: 1979,
    region: "Bristol, UK",
    phase: "active-treatment",
    allergies: [],
    comorbidities: ["asthma"],
    risk: {
      age: 47,
      familyHistory: {
        firstDegreeRelativesWithBreastCancer: 0,
        maleRelativeWithBreastCancer: false,
        relativeDiagnosedBefore50: false,
        ovarianOrPancreaticCancerInFamily: false,
        knownPathogenicVariant: false,
        ashkenaziJewishAncestry: false,
      },
      personalHistory: { previousBreastCancer: false, previousBenignBreastDisease: false, atypicalHyperplasiaOrLcis: false, chestRadiationBeforeAge30: false, otherCancerHistory: false },
      reproductiveHistory: { menarcheBefore12: false, menopauseAfter55: false, firstLiveBirthAfter30: true, neverGaveBirth: false, neverBreastfed: true, combinedHormoneTherapy: false, currentHormoneTherapy: false },
      lifestyle: { bmi: 24, alcoholUnitsPerWeek: 2, physicalActivity: "high", smokingStatus: "never", postmenopausal: false },
      screening: { lastMammogramMonthsAgo: 8, denseBreastTissue: true, screeningUpToDate: true },
    },
    symptoms: [{ code: "nipple-discharge", severity: "moderate", side: "left", durationWeeks: 5, progressive: true }],
    treatments: [
      { name: "Neoadjuvant chemotherapy", modality: "chemotherapy", status: "active", startDaysAgo: 20, expectedEndDaysAhead: 90, summary: "Dose-dense regimen planned before surgery, per MDT decision.", sideEffects: ["Nausea", "Mouth soreness", "Taste changes"], progress: 20 },
    ],
    medications: [{ name: "Dexamethasone", ingredient: "dexamethasone", dosage: "8 mg", route: "oral", frequency: "once daily for 3 days after chemotherapy", times: ["09:00"], instructions: "Take with food." }],
    nutritionPhase: "during-treatment",
    sideEffects: ["mouth-discomfort", "taste-changes"],
    notes: [{ title: "Cycle 1 tolerated", body: "Mild mucositis. Soft diet advised. Dental review arranged before cycle 2.", daysAgo: 6 }],
    report: {
      title: "Pre-cycle 2 review",
      assessment: "Mild oral mucositis, otherwise well. Blood counts acceptable to proceed.",
      recommendations: "Proceed with cycle 2. Mouth care regimen reinforced. Dietitian input for soft, high-protein diet.",
      followUpDaysAhead: 12,
    },
  },
  {
    key: "martha",
    displayName: "Martha Adeyemi",
    pseudonymousId: "PT-DEMO-0006",
    birthYear: 1952,
    region: "Cardiff, UK",
    phase: "survivorship",
    allergies: [],
    comorbidities: ["heart disease"],
    risk: {
      age: 74,
      familyHistory: {
        firstDegreeRelativesWithBreastCancer: 0,
        maleRelativeWithBreastCancer: false,
        relativeDiagnosedBefore50: false,
        ovarianOrPancreaticCancerInFamily: false,
        knownPathogenicVariant: false,
        ashkenaziJewishAncestry: false,
      },
      personalHistory: { previousBreastCancer: true, previousBenignBreastDisease: false, atypicalHyperplasiaOrLcis: false, chestRadiationBeforeAge30: false, otherCancerHistory: false },
      reproductiveHistory: { menarcheBefore12: false, menopauseAfter55: false, firstLiveBirthAfter30: false, neverGaveBirth: false, neverBreastfed: false, combinedHormoneTherapy: false, currentHormoneTherapy: false },
      lifestyle: { bmi: 29, alcoholUnitsPerWeek: 0, physicalActivity: "low", smokingStatus: "former", postmenopausal: true },
      screening: { lastMammogramMonthsAgo: 13, denseBreastTissue: false, screeningUpToDate: false },
    },
    symptoms: [],
    treatments: [{ name: "Mastectomy with reconstruction", modality: "surgery", status: "completed", startDaysAgo: 800, expectedEndDaysAhead: 0, summary: "Simple mastectomy with implant reconstruction.", sideEffects: ["Reduced shoulder mobility"], progress: 100 }],
    medications: [{ name: "Letrozole", ingredient: "letrozole", dosage: "2.5 mg", route: "oral", frequency: "once daily", times: ["08:00"], instructions: "Annual bone density monitoring." }],
    nutritionPhase: "survivorship",
    sideEffects: ["constipation"],
    notes: [{ title: "Cardio-oncology review", body: "Cardiac function stable. Continue letrozole with annual echocardiogram as per cardio-oncology advice.", daysAgo: 25 }],
    report: {
      title: "Long-term follow-up",
      assessment: "Stable. No clinical evidence of recurrence. Cardiac function monitored due to prior treatment.",
      recommendations: "Annual mammography of the contralateral breast. Continue letrozole. Physiotherapy for shoulder mobility.",
      followUpDaysAhead: 90,
    },
  },
  {
    key: "yuki",
    displayName: "Yuki Tanaka",
    pseudonymousId: "PT-DEMO-0007",
    birthYear: 1994,
    region: "Edinburgh, UK",
    phase: "not-in-treatment",
    allergies: ["shellfish allergy"],
    comorbidities: [],
    risk: {
      age: 32,
      familyHistory: {
        firstDegreeRelativesWithBreastCancer: 0,
        maleRelativeWithBreastCancer: false,
        relativeDiagnosedBefore50: false,
        ovarianOrPancreaticCancerInFamily: false,
        knownPathogenicVariant: false,
        ashkenaziJewishAncestry: false,
      },
      personalHistory: { previousBreastCancer: false, previousBenignBreastDisease: false, atypicalHyperplasiaOrLcis: false, chestRadiationBeforeAge30: false, otherCancerHistory: false },
      reproductiveHistory: { menarcheBefore12: false, menopauseAfter55: false, firstLiveBirthAfter30: false, neverGaveBirth: true, neverBreastfed: true, combinedHormoneTherapy: false, currentHormoneTherapy: false },
      lifestyle: { bmi: 21, alcoholUnitsPerWeek: 6, physicalActivity: "high", smokingStatus: "never", postmenopausal: false },
      screening: { lastMammogramMonthsAgo: null, denseBreastTissue: false, screeningUpToDate: false },
    },
    symptoms: [],
    treatments: [],
    medications: [],
    nutritionPhase: "survivorship",
    sideEffects: [],
    notes: [{ title: "Risk-reduction consultation", body: "General risk-reduction advice given. No screening indicated at this age in the absence of additional risk factors.", daysAgo: 60 }],
    report: {
      title: "Risk-reduction consultation",
      assessment: "Average population risk for age. No red-flag features.",
      recommendations: "Breast awareness advice. Review if family history changes.",
      followUpDaysAhead: 365,
    },
  },
  {
    key: "clara",
    displayName: "Clara Novak",
    pseudonymousId: "PT-DEMO-0008",
    birthYear: 1961,
    region: "Glasgow, UK",
    phase: "active-treatment",
    allergies: [],
    comorbidities: ["ibs"],
    risk: {
      age: 65,
      familyHistory: {
        firstDegreeRelativesWithBreastCancer: 1,
        maleRelativeWithBreastCancer: true,
        relativeDiagnosedBefore50: true,
        ovarianOrPancreaticCancerInFamily: false,
        knownPathogenicVariant: false,
        ashkenaziJewishAncestry: false,
      },
      personalHistory: { previousBreastCancer: false, previousBenignBreastDisease: true, atypicalHyperplasiaOrLcis: true, chestRadiationBeforeAge30: false, otherCancerHistory: false },
      reproductiveHistory: { menarcheBefore12: true, menopauseAfter55: true, firstLiveBirthAfter30: false, neverGaveBirth: false, neverBreastfed: false, combinedHormoneTherapy: true, currentHormoneTherapy: false },
      lifestyle: { bmi: 33, alcoholUnitsPerWeek: 16, physicalActivity: "low", smokingStatus: "current", postmenopausal: true },
      screening: { lastMammogramMonthsAgo: 26, denseBreastTissue: true, screeningUpToDate: false },
    },
    symptoms: [
      { code: "skin-dimpling", severity: "moderate", side: "right", durationWeeks: 6, progressive: true },
      { code: "axillary-lump", severity: "mild", side: "right", durationWeeks: 4, progressive: false },
    ],
    treatments: [{ name: "Targeted therapy (trastuzumab)", modality: "targeted-therapy", status: "active", startDaysAgo: 15, expectedEndDaysAhead: 350, summary: "HER2-targeted therapy alongside chemotherapy, per MDT plan.", sideEffects: ["Fatigue"], progress: 10 }],
    medications: [{ name: "Trastuzumab", ingredient: "trastuzumab", dosage: "weight-based", route: "intravenous infusion", frequency: "every 3 weeks", times: ["10:00"], instructions: "Cardiac monitoring before each cycle." }],
    nutritionPhase: "during-treatment",
    sideEffects: ["fatigue", "constipation"],
    notes: [{ title: "Genetics referral", body: "Family history includes male breast cancer. Clinical genetics referral made for germline testing.", daysAgo: 18 }],
    report: {
      title: "MDT outcome and treatment start",
      assessment: "HER2-positive disease. Treatment plan agreed at MDT and discussed with the patient.",
      recommendations: "Commence targeted therapy with chemotherapy. Cardiac baseline completed. Genetics referral in progress.",
      followUpDaysAhead: 21,
    },
  },
];

export interface SeedSummary {
  patients: number;
  doctors: number;
  appointments: number;
  treatments: number;
  medications: number;
  nutritionPlans: number;
  reports: number;
  records: number;
  riskAssessments: number;
  consents: number;
  notifications: number;
  auditEntries: number;
  blockchainReachable: boolean;
  demoPassword: string;
}

export async function seedDemoData(store: Store): Promise<SeedSummary> {
  const existing = await store.users.count();
  if (existing > 0) {
    logger.info("Demo seed skipped — the store already contains data");
    return {
      patients: 0, doctors: 0, appointments: 0, treatments: 0, medications: 0, nutritionPlans: 0,
      reports: 0, records: 0, riskAssessments: 0, consents: 0, notifications: 0, auditEntries: 0,
      blockchainReachable: false, demoPassword: DEMO_PASSWORD,
    };
  }

  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 8);
  const chain = await chainStatus();
  const model = getActiveRiskModel();

  const counts = {
    patients: 0, doctors: 0, appointments: 0, treatments: 0, medications: 0, nutritionPlans: 0,
    reports: 0, records: 0, riskAssessments: 0, consents: 0, notifications: 0, auditEntries: 0,
  };

  /* -------- clinicians and admin -------- */

  const doctorSpecs = [
    { name: "Dr Helen Whitfield", specialty: "Breast surgery", license: "GMC-DEMO-4471", institution: "Northbank Breast Centre", email: "doctor@demo.breastcare.ai" },
    { name: "Dr Marcus Reid", specialty: "Medical oncology", license: "GMC-DEMO-8820", institution: "Northbank Breast Centre", email: "oncologist@demo.breastcare.ai" },
    { name: "Dr Amara Singh", specialty: "Radiation oncology", license: "GMC-DEMO-1290", institution: "Riverside Cancer Institute", email: "radiotherapy@demo.breastcare.ai" },
  ];

  const doctors: UserRecord[] = [];
  for (const [index, spec] of doctorSpecs.entries()) {
    const id = newId("USR");
    const user: UserRecord = {
      id, email: spec.email, role: "doctor", displayName: spec.name, walletAddress: null, pseudonymousId: null,
      passwordHash, status: "active", lastLoginAt: null, createdAt: daysAgo(200 + index * 3), updatedAt: now(),
    };
    await store.users.insert(user);
    await store.doctors.insert({
      id, userId: id, displayName: spec.name, specialty: spec.specialty, licenseNumber: spec.license,
      institution: spec.institution, email: spec.email, walletAddress: null, acceptedPatients: 0, createdAt: user.createdAt,
    });
    doctors.push(user);
    counts.doctors += 1;
  }

  const adminId = newId("USR");
  await store.users.insert({
    id: adminId, email: "admin@demo.breastcare.ai", role: "admin", displayName: "Platform Administrator",
    walletAddress: null, pseudonymousId: null, passwordHash, status: "active", lastLoginAt: null, createdAt: daysAgo(240), updatedAt: now(),
  });

  /* -------- patients -------- */

  for (const [index, spec] of PATIENTS.entries()) {
    const userId = newId("USR");
    const createdAt = daysAgo(120 - index * 7);

    await store.users.insert({
      id: userId, email: `${spec.key}@demo.breastcare.ai`, role: "patient", displayName: spec.displayName,
      walletAddress: null, pseudonymousId: spec.pseudonymousId, passwordHash, status: "active",
      lastLoginAt: daysAgo(index + 1, 8, 30), createdAt, updatedAt: now(),
    } satisfies UserRecord);

    const patient = await store.patients.insert({
      id: userId,
      userId, pseudonymousId: spec.pseudonymousId, displayName: spec.displayName,
      birthYear: spec.birthYear, age: spec.risk.age, biologicalSex: "female", region: spec.region,
      primaryDoctorId: doctors[index % doctors.length]!.id, walletAddress: null, onChainRegistered: false,
      onChainPatientId: null,
      bloodType: null, allergies: spec.allergies, comorbidities: spec.comorbidities,
      currentTreatmentPhase: spec.phase as never, createdAt, updatedAt: now(),
    });
    counts.patients += 1;

    /* consent to the assigned clinician (and to a second clinician for half the cohort) */
    const grantees = index % 2 === 0 ? [doctors[index % doctors.length]!] : [doctors[index % doctors.length]!, doctors[(index + 1) % doctors.length]!];
    for (const grantee of grantees) {
      const scopeName = "full-record-access";
      const scopeDescription = "Read access to the complete medical record for continuity of care.";
      const revoked = spec.key === "yuki" && grantee !== doctors[0]; // one revoked example
      await store.consents.insert({
        id: newId("CNS"), patientId: patient.id, granteeId: grantee.id, granteeType: "doctor", granteeName: grantee.displayName,
        scopeName, scopeDescription, scopeHash: contentHash({ scopeName, scopeDescription, patientId: spec.pseudonymousId }),
        status: revoked ? "revoked" : "active", grantedAt: daysAgo(110 - index * 5), expiresAt: null,
        revokedAt: revoked ? daysAgo(20) : null, signature: null, transactionHash: null,
        createdAt: daysAgo(110 - index * 5),
      });
      counts.consents += 1;
    }

    /* risk assessment, run through the real model */
    const input: RiskAssessmentInput = {
      age: spec.risk.age,
      biologicalSex: "female",
      familyHistory: {
        firstDegreeRelativesWithBreastCancer: 0, maleRelativeWithBreastCancer: false, relativeDiagnosedBefore50: false,
        ovarianOrPancreaticCancerInFamily: false, knownPathogenicVariant: false, ashkenaziJewishAncestry: false,
        ...(spec.risk.familyHistory ?? {}),
      },
      personalHistory: {
        previousBreastCancer: false, previousBenignBreastDisease: false, atypicalHyperplasiaOrLcis: false,
        chestRadiationBeforeAge30: false, otherCancerHistory: false, ...(spec.risk.personalHistory ?? {}),
      },
      reproductiveHistory: {
        menarcheBefore12: false, menopauseAfter55: false, firstLiveBirthAfter30: false, neverGaveBirth: false,
        neverBreastfed: false, combinedHormoneTherapy: false, currentHormoneTherapy: false, ...(spec.risk.reproductiveHistory ?? {}),
      },
      lifestyle: { bmi: null, alcoholUnitsPerWeek: 0, physicalActivity: "moderate", smokingStatus: "never", postmenopausal: false, ...(spec.risk.lifestyle ?? {}) },
      screening: { lastMammogramMonthsAgo: null, denseBreastTissue: false, screeningUpToDate: false, ...(spec.risk.screening ?? {}) },
      symptoms: spec.symptoms.map((symptom) => ({
        code: symptom.code,
        label: symptomDefinition(symptom.code)?.label ?? symptom.code,
        durationWeeks: symptom.durationWeeks,
        unilateral: symptom.side === "left" || symptom.side === "right",
        progressive: symptom.progressive,
        severe: symptom.severity === "severe",
      })),
    };

    const result = model.evaluate(input);
    const assessment = await store.riskAssessments.insert({
      id: newId("RSK"), patientId: patient.id, modelId: result.modelId, modelVersion: result.modelVersion,
      level: result.level, score: result.score, maxScore: result.maxScore, normalizedScore: result.normalizedScore,
      urgency: result.urgency, input, factors: result.factors, guidance: result.guidance, redFlags: result.redFlags, disclaimer: RISK_ASSESSMENT_DISCLAIMER,
      contentHash: `0x${contentHash({ model: result.modelId, input })}`, onChainRecordId: null,
      completedAt: daysAgo(100 - index * 6), reviewedByDoctorId: doctors[index % doctors.length]!.id,
      doctorNote: "Reviewed at clinic. Findings discussed with the patient.", createdAt: daysAgo(100 - index * 6),
    });
    counts.riskAssessments += 1;

    /* symptoms */
    for (const symptom of spec.symptoms) {
      const definition = symptomDefinition(symptom.code);
      await store.symptoms.insert({
        id: newId("SYM"), patientId: patient.id, code: symptom.code as never, label: definition?.label ?? symptom.code,
        severity: symptom.severity, side: symptom.side as never, durationWeeks: symptom.durationWeeks, progressive: symptom.progressive,
        notes: null, reportedAt: daysAgo(95 - index * 6), guidance: definition?.guidance ?? "Please discuss with your care team.",
        redFlag: Boolean(definition?.redFlagPattern?.({
          code: symptom.code, label: definition?.label ?? "", durationWeeks: symptom.durationWeeks,
          unilateral: symptom.side === "left" || symptom.side === "right", progressive: symptom.progressive, severe: symptom.severity === "severe",
        })),
        reviewedByDoctorId: doctors[index % doctors.length]!.id, reviewedAt: daysAgo(90 - index * 6), createdAt: daysAgo(95 - index * 6),
      });
    }

    /* treatments */
    for (const treatment of spec.treatments) {
      const hash = `0x${contentHash({ patientId: spec.pseudonymousId, treatment })}`;
      await store.treatments.insert({
        id: newId("TRT"), patientId: patient.id, name: treatment.name, modality: treatment.modality as never,
        status: treatment.status as never, startDate: daysAgo(treatment.startDaysAgo), expectedEndDate: treatment.expectedEndDaysAhead > 0 ? daysAhead(treatment.expectedEndDaysAhead) : daysAgo(1),
        treatingDoctorId: doctors[index % doctors.length]!.id, summary: treatment.summary,
        notes: "Plan agreed with the patient at the multidisciplinary team meeting.", sideEffects: treatment.sideEffects,
        progressPercent: treatment.progress, documents: [], appointments: [], contentHash: hash,
        onChainPlanId: chain.reachable ? bytes32(treatment.name) : null,
        authorizedByDoctorId: doctors[index % doctors.length]!.id, authorizedAt: daysAgo(treatment.startDaysAgo + 2),
        createdAt: daysAgo(treatment.startDaysAgo + 3), updatedAt: daysAgo(Math.max(1, treatment.startDaysAgo - 5)),
      });
      counts.treatments += 1;
    }

    /* medications with a real dose schedule */
    for (const medication of spec.medications) {
      const id = newId("MED");
      const startDate = daysAgo(30);
      const doses = [];
      for (let day = 0; day < 7; day++) {
        const date = new Date(Date.now() - (3 - day) * 86_400_000);
        for (const time of medication.times) {
          const [hours, minutes] = time.split(":").map(Number);
          const scheduledAt = new Date(date);
          scheduledAt.setHours(hours ?? 8, minutes ?? 0, 0, 0);
          const past = scheduledAt.getTime() < Date.now();
          doses.push({
            id: `${id}-d${day}-${time}`, medicationId: id, scheduledAt: scheduledAt.toISOString(),
            status: (past ? (day % 7 === 6 ? "missed" : "taken") : "pending") as "taken" | "missed" | "pending",
            recordedAt: past ? scheduledAt.toISOString() : null, note: null,
          });
        }
      }
      await store.medications.insert({
        id, patientId: patient.id, name: medication.name, activeIngredient: medication.ingredient, dosage: medication.dosage,
        route: medication.route, frequency: medication.frequency, scheduledTimes: medication.times, startDate,
        endDate: null, status: "active", prescriberId: doctors[index % doctors.length]!.id, instructions: medication.instructions,
        cautions: "Do not change the dose without speaking to your care team.", reminderEnabled: true, doses,
        createdAt: startDate, updatedAt: now(),
      });
      counts.medications += 1;
    }

    /* nutrition plan built by the real builder */
    const draft = buildNutritionPlan({
      phase: spec.nutritionPhase,
      treatmentModalities: spec.treatments.filter((t) => t.status === "active").map((t) => t.modality),
      sideEffects: spec.sideEffects,
      dietaryPreferences: [],
      allergies: spec.allergies,
      restrictions: [],
      comorbidities: spec.comorbidities,
      clinicianRecommendations: "Follow the dietitian's advice; report any weight change of more than 2 kg.",
      appetiteScore: spec.sideEffects.includes("appetite-loss") ? 2 : 3,
      weightTrend: spec.phase === "active-treatment" ? "losing" : "stable",
    });
    await store.nutritionPlans.insert({
      id: newId("NUT"), patientId: patient.id, phase: draft.phase, title: draft.title, createdAt: daysAgo(30 - index),
      updatedAt: daysAgo(2), createdBy: doctors[index % doctors.length]!.id, reviewedByProfessional: true,
      calorieTargetKcal: draft.calorieTargetKcal, proteinTargetGrams: draft.proteinTargetGrams,
      hydrationTargetMl: draft.hydrationTargetMl, goals: [...draft.goals, ...draft.cautions], meals: draft.meals,
      foodsToEmphasize: draft.foodsToEmphasize, foodsToDiscussWithClinician: draft.foodsToDiscussWithClinician,
      foodsThatMayWorsenSymptoms: draft.foodsThatMayWorsenSymptoms, sideEffectSupport: draft.sideEffectSupport,
      cautions: draft.cautions, disclaimer: draft.disclaimer,
      contentHash: `0x${contentHash({ patientId: spec.pseudonymousId, phase: draft.phase })}`,
    });
    counts.nutritionPlans += 1;

    /* nutrition logs (adherence tracking) */
    for (let day = 0; day < 14; day++) {
      const adherence = day % 7 === 5 ? "skipped" : day % 3 === 0 ? "partial" : "followed";
      await store.nutritionLogs.insert({
        id: newId("NLOG"), patientId: patient.id, loggedAt: daysAgo(day, 13, 0), slot: "lunch" as never,
        description: adherence === "skipped" ? "Ate very little at lunch" : "Planned lunch followed",
        adherence: adherence as never, appetiteScore: Math.max(1, 4 - (day % 4)), nauseaScore: spec.sideEffects.includes("nausea") ? 3 : 1,
        notes: null, createdAt: daysAgo(day, 13, 0),
      });
    }

    /* appointments: two in the past, one or two upcoming */
    const appointmentPattern = [
      { startsAt: daysAgo(30, 10, 0), status: "completed", reason: "Treatment review" },
      { startsAt: daysAgo(9, 14, 30), status: "completed", reason: "Blood results discussion" },
      { startsAt: daysAhead(3 + index, 9, 30), status: "confirmed", reason: "Scheduled follow-up" },
      { startsAt: daysAhead(17 + index, 11, 0), status: index % 3 === 0 ? "requested" : "confirmed", reason: "Dietitian appointment" },
    ];
    for (const appointment of appointmentPattern) {
      await store.appointments.insert({
        id: newId("APT"), patientId: patient.id, doctorId: doctors[index % doctors.length]!.id,
        startsAt: appointment.startsAt, endsAt: new Date(new Date(appointment.startsAt).getTime() + 30 * 60_000).toISOString(),
        reason: appointment.reason, modality: appointment.reason.includes("Dietitian") ? "telehealth" : "in-person",
        status: appointment.status as never, location: "Northbank Breast Centre, Clinic 3", notes: "",
        reminderSent: appointment.status === "confirmed", createdAt: daysAgo(35), updatedAt: daysAgo(1),
      });
      counts.appointments += 1;
    }

    /* clinician notes */
    for (const note of spec.notes) {
      const id = newId("REC");
      await store.records.insert({
        id, patientId: patient.id, kind: "doctor-note", title: note.title, summary: note.body.slice(0, 160), body: note.body,
        attachments: [], recordedById: doctors[index % doctors.length]!.id,
        contentHash: `0x${contentHash({ patientId: spec.pseudonymousId, note })}`, onChainRecordId: null, verifiedAt: null,
        lastVerification: null, createdAt: daysAgo(note.daysAgo), updatedAt: daysAgo(note.daysAgo),
      });
      counts.records += 1;
    }

    /* medical report */
    const reportId = newId("RPT");
    const reportHash = `0x${contentHash({ patientId: spec.pseudonymousId, report: spec.report })}`;
    await store.reports.insert({
      id: reportId, patientId: patient.id, doctorId: doctors[index % doctors.length]!.id, title: spec.report.title,
      date: daysAgo(14 - index), clinicalNotes: "Reviewed in clinic. Symptoms and treatment tolerance discussed with the patient.",
      assessment: spec.report.assessment, treatmentInformation: spec.treatments.filter((t) => t.status === "active").map((t) => t.name).join(", ") || "No active treatment",
      recommendations: spec.report.recommendations, followUpDate: daysAhead(spec.report.followUpDaysAhead),
      contentHash: reportHash, onChainRecordId: null, lastVerification: null, createdAt: daysAgo(14 - index), updatedAt: daysAgo(14 - index),
    });
    counts.reports += 1;

    /* records for the report, the assessment and the profile */
    for (const record of [
      { kind: "report" as const, title: `Report: ${spec.report.title}`, summary: spec.report.assessment.slice(0, 160), body: spec.report.recommendations, createdAt: daysAgo(14 - index) },
      { kind: "risk-assessment" as const, title: `Risk assessment completed (${result.level})`, summary: `AI-assisted educational assessment — ${result.level} risk indicator.`, body: result.guidance.join("\n"), createdAt: assessment.completedAt },
      { kind: "profile" as const, title: "Patient profile created", summary: "Pseudonymous profile registered on the platform.", body: "Profile created. No clinical content is stored on-chain.", createdAt },
    ]) {
      await store.records.insert({
        id: newId("REC"), patientId: patient.id, kind: record.kind, title: record.title, summary: record.summary, body: record.body,
        attachments: [], recordedById: patient.id, contentHash: `0x${contentHash({ patientId: spec.pseudonymousId, ...record })}`,
        onChainRecordId: null, verifiedAt: null, lastVerification: null, createdAt: record.createdAt, updatedAt: record.createdAt,
      });
      counts.records += 1;
    }

    /* notifications */
    const notificationSpecs = [
      { kind: "appointment-upcoming" as const, title: "Upcoming appointment", body: `Your ${appointmentPattern[2]!.reason} is on ${new Date(appointmentPattern[2]!.startsAt).toDateString()}.`, severity: "info" as const },
      { kind: "medication-reminder" as const, title: "Medication reminder", body: spec.medications[0] ? `${spec.medications[0].name} ${spec.medications[0].dosage} is due today.` : "No medications scheduled.", severity: "info" as const },
      { kind: "nutrition-plan-update" as const, title: "Nutrition plan updated", body: "Your nutrition plan was reviewed by your care team.", severity: "success" as const },
      { kind: "new-report" as const, title: "New medical report", body: `${spec.report.title} is now available in your record.`, severity: "info" as const },
    ];
    for (const [notificationIndex, notification] of notificationSpecs.entries()) {
      await store.notifications.insert({
        id: newId("NTF"), userId: patient.id, kind: notification.kind, title: notification.title, body: notification.body,
        readAt: notificationIndex > 1 ? null : daysAgo(notificationIndex + 1), actionLabel: null, actionHref: null,
        severity: notification.severity, createdAt: daysAgo(notificationIndex),
      });
      counts.notifications += 1;
    }

    /* clinician notifications for high-risk results */
    if (result.level === "high" || result.redFlags.length > 0) {
      await store.notifications.insert({
        id: newId("NTF"), userId: doctors[index % doctors.length]!.id, kind: "new-report",
        title: "Risk assessment needs review",
        body: `${spec.displayName} has a ${result.level} risk indicator${result.redFlags.length ? " with symptoms warranting prompt evaluation" : ""}.`,
        readAt: null, actionLabel: "Review", actionHref: `/doctor/patients/${patient.id}/risk`, severity: "warning", createdAt: daysAgo(3),
      });
      counts.notifications += 1;
    }

    /* blockchain anchor records — honest about whether the chain was reachable */
    await store.blockchainRecords.insert({
      id: newId("BCH"), patientId: patient.id, kind: "record-hash", label: `Report: ${spec.report.title}`,
      dataHash: reportHash, contract: "MedicalRecordRegistry",
      transactionHash: chain.reachable ? `0x${contentHash(`${spec.pseudonymousId}-tx`).padEnd(64, "0").slice(0, 64)}` : null,
      blockNumber: chain.reachable ? 1 + index : null,
      status: chain.reachable ? "confirmed" : "unanchored", verification: "unverified",
      createdAt: daysAgo(14 - index), confirmedAt: chain.reachable ? daysAgo(14 - index) : null,
    });

    /* audit trail */
    for (const [action, resource, at] of [
      ["USER_REGISTERED", "user", createdAt],
      ["CONSENT_GRANTED", "consent", daysAgo(110 - index * 5)],
      ["RISK_ASSESSMENT_COMPLETED", "risk-assessment", assessment.completedAt],
      ["REPORT_CREATED", "report", daysAgo(14 - index)],
      ["NUTRITION_PLAN_CREATED", "nutrition-plan", daysAgo(30 - index)],
    ] as const) {
      await store.auditLogs.insert({
        id: newId("AUD"), actorId: action === "CONSENT_GRANTED" ? patient.id : doctors[index % doctors.length]!.id,
        actorRole: action === "CONSENT_GRANTED" ? "patient" : "doctor", action, patientId: patient.id, resource,
        resourceId: null, dataHash: null, ipAddress: "203.0.113.10", outcome: "success", onChainEntryId: null, createdAt: at,
      });
      counts.auditEntries += 1;
    }

    /* one denied-access example keeps the audit trail realistic */
    await store.auditLogs.insert({
      id: newId("AUD"), actorId: adminId, actorRole: "admin", action: "ACCESS_DENIED", patientId: patient.id,
      resource: "patient", resourceId: null, dataHash: null, ipAddress: "203.0.113.20", outcome: "denied",
      onChainEntryId: null, createdAt: daysAgo(4),
    });
    counts.auditEntries += 1;
  }

  const consentCount = await store.consents.count();
  void consentCount;
  void consentStatus;
  void audit;

  return { ...counts, blockchainReachable: chain.reachable, demoPassword: DEMO_PASSWORD };
}
