import type { KnowledgeArticle } from "./types";

/**
 * Educational content library.
 *
 * Content is written to be accurate at a general level, to avoid diagnostic language, and
 * to point readers towards a qualified professional. Every article lists the type of
 * trusted source it reflects; populate `references` with the exact links your
 * organisation has approved before publishing.
 */
export const KNOWLEDGE_CATEGORIES = [
  "Breast cancer basics",
  "Risk factors",
  "Symptoms",
  "Screening",
  "Diagnosis process",
  "Treatment types",
  "Nutrition",
  "Exercise and general wellness",
  "Survivorship",
  "Emotional support",
  "Frequently asked questions",
] as const;

export const KNOWLEDGE_ARTICLES: KnowledgeArticle[] = [
  {
    slug: "breast-cancer-basics",
    category: "Breast cancer basics",
    title: "Breast cancer: a plain-language overview",
    readingTimeMinutes: 6,
    summary:
      "What breast cancer is, how it develops, the main subtypes, and why treatment differs so much between people.",
    sections: [
      {
        heading: "What breast cancer is",
        body: "Breast cancer begins when cells in the breast start to grow abnormally and form a tumour. Most breast cancers start in the milk ducts (ductal carcinoma) or the lobules that produce milk (lobular carcinoma). Not every breast lump is cancer — many are cysts, fibroadenomas or normal tissue changes.",
        bullets: [
          "Carcinoma in situ means abnormal cells that have not spread beyond where they started.",
          "Invasive carcinoma means cells have moved into surrounding breast tissue.",
          "Breast cancer can occur in anyone with breast tissue, including men.",
        ],
      },
      {
        heading: "Why subtypes matter",
        body: "Treatment is guided by the biology of the tumour, not only its size. Pathology reports describe hormone receptor status (oestrogen and progesterone receptors), HER2 status, grade and stage. Together these determine whether hormone therapy, targeted therapy, chemotherapy, radiotherapy or surgery is appropriate.",
      },
      {
        heading: "What stage means",
        body: "Stage combines tumour size, lymph-node involvement and whether the cancer has spread elsewhere. Stage is used to plan treatment and estimate outlook — it is not a prediction about any individual.",
      },
    ],
    references: [
      { organization: "World Health Organization", title: "Breast cancer fact sheet", url: "https://www.who.int/news-room/fact-sheets/detail/breast-cancer" },
      { organization: "American Cancer Society", title: "What is breast cancer?", url: "https://www.cancer.org/cancer/types/breast-cancer/about/what-is-breast-cancer.html" },
    ],
    updatedAt: "2026-01-15",
  },
  {
    slug: "risk-factors",
    category: "Risk factors",
    title: "Understanding breast cancer risk factors",
    readingTimeMinutes: 7,
    summary: "Which factors raise risk, which are modifiable, and why a high-risk result is not a diagnosis.",
    sections: [
      {
        heading: "Factors you cannot change",
        body: "Age, sex, family history, inherited gene changes, breast density, earlier chest radiotherapy and some benign breast conditions all influence risk. Having one or more of these does not mean you will develop breast cancer.",
        bullets: [
          "Age is the single strongest overall risk factor.",
          "About 5–10% of breast cancers are linked to an inherited gene change.",
          "Dense breast tissue is common and also makes mammograms harder to interpret.",
        ],
      },
      {
        heading: "Factors you can influence",
        body: "Physical activity, maintaining a healthy weight (particularly after menopause), limiting alcohol, and not smoking are all associated with lower risk. These are population-level associations, not guarantees.",
      },
      {
        heading: "How to read a risk assessment",
        body: "A risk score describes the combination of factors in your answers. It is not a probability of having cancer today and it is not a diagnosis. Use it as a starting point for a conversation with your clinician, especially about screening timing.",
      },
    ],
    references: [
      { organization: "Centers for Disease Control and Prevention", title: "Breast cancer risk factors", url: "https://www.cdc.gov/breast-cancer/risk-factors/" },
      { organization: "National Cancer Institute", title: "Breast cancer risk", url: "https://www.cancer.gov/types/breast/risk" },
    ],
    updatedAt: "2026-02-01",
  },
  {
    slug: "symptoms-and-breast-awareness",
    category: "Symptoms",
    title: "Symptoms and breast awareness",
    readingTimeMinutes: 5,
    summary: "What changes to look for, what is usually not cancer, and when to book an appointment.",
    sections: [
      {
        heading: "Changes worth reporting",
        body: "Any new, persistent change in your breasts is worth a clinical examination. Common examples include a new lump or thickening, a change in size or shape, skin dimpling or thickening, nipple inversion, nipple discharge that is not breast milk, and a lump in the armpit.",
      },
      {
        heading: "What is often not cancer",
        body: "Most breast lumps are benign — cysts, fibroadenomas and fibrocystic changes are common, particularly before menopause. Cyclical breast pain is very common and is rarely a sign of cancer.",
      },
      {
        heading: "Breast awareness",
        body: "There is no single correct technique for checking your breasts. What matters is knowing what is normal for you so you notice a change, and reporting anything new or persistent rather than waiting for it to go away.",
      },
    ],
    references: [
      { organization: "NHS", title: "Breast cancer symptoms", url: "https://www.nhs.uk/conditions/breast-cancer/symptoms/" },
      { organization: "Macmillan Cancer Support", title: "Signs and symptoms of breast cancer", url: "https://www.macmillan.org.uk/cancer-information-and-support/breast-cancer/symptoms-diagnosis" },
    ],
    updatedAt: "2026-02-10",
  },
  {
    slug: "screening-explained",
    category: "Screening",
    title: "Screening explained: mammography and beyond",
    readingTimeMinutes: 6,
    summary: "What screening can and cannot do, what happens at an appointment, and who may need extra imaging.",
    sections: [
      {
        heading: "What screening is for",
        body: "Screening looks for breast cancer in people with no symptoms, with the aim of finding it earlier when treatment is often simpler and more effective. Screening reduces deaths from breast cancer at a population level.",
      },
      {
        heading: "Limits of screening",
        body: "Mammography can miss some cancers, particularly in dense breast tissue, and it can find changes that would never have caused harm. These trade-offs are why screening intervals and starting ages differ between countries and why higher-risk people may be offered additional imaging such as ultrasound or MRI.",
      },
      {
        heading: "What to expect",
        body: "A screening mammogram takes only a few minutes and involves brief compression of each breast. If something needs a closer look, you may be invited for additional imaging or a biopsy — most people recalled from screening do not have cancer.",
      },
    ],
    references: [
      { organization: "World Health Organization", title: "Breast cancer screening", url: "https://www.who.int/publications/i/item/9789240014428" },
      { organization: "U.S. Preventive Services Task Force", title: "Breast cancer screening", url: "https://www.uspreventiveservicestaskforce.org/uspstf/recommendation/breast-cancer-screening" },
    ],
    updatedAt: "2026-03-05",
  },
  {
    slug: "diagnosis-process",
    category: "Diagnosis process",
    title: "How breast cancer is diagnosed",
    readingTimeMinutes: 7,
    summary: "The triple-assessment pathway: clinical examination, imaging and biopsy.",
    sections: [
      {
        heading: "Triple assessment",
        body: "Most breast clinics use a three-part assessment: a clinical examination, imaging (mammography and/or ultrasound, and MRI in selected cases), and a tissue sample (biopsy) when imaging shows something that needs explanation.",
      },
      {
        heading: "Understanding the pathology report",
        body: "The biopsy result describes the tumour type, grade, hormone receptor status, HER2 status and whether the edges of the sample are clear. These details drive treatment choices.",
      },
      {
        heading: "Questions worth asking",
        body: "Useful questions include: What type and stage is it? What are the receptor results? What treatment options do I have, and what happens if I wait? Who do I contact between appointments?",
      },
    ],
    references: [
      { organization: "American Cancer Society", title: "How is breast cancer diagnosed?", url: "https://www.cancer.org/cancer/types/breast-cancer/detection-diagnosis-staging/how-is-breast-cancer-diagnosed.html" },
    ],
    updatedAt: "2026-03-20",
  },
  {
    slug: "treatment-types",
    category: "Treatment types",
    title: "Treatment types and what they aim to do",
    readingTimeMinutes: 9,
    summary: "Surgery, radiotherapy, chemotherapy, hormone therapy, targeted therapy and immunotherapy explained.",
    sections: [
      {
        heading: "Local treatments",
        body: "Surgery (breast-conserving surgery or mastectomy) and radiotherapy treat the breast and nearby area. Reconstruction may be offered at the same time or later.",
      },
      {
        heading: "Systemic treatments",
        body: "Chemotherapy, hormone (endocrine) therapy, targeted therapy and immunotherapy act throughout the body. Which are used depends on tumour biology, stage, other health conditions and your preferences.",
        bullets: [
          "Hormone therapy is used for hormone-receptor-positive cancers, usually for several years.",
          "Targeted therapy is used when a specific target such as HER2 is present.",
          "Immunotherapy is used in selected situations, for example some triple-negative cancers.",
        ],
      },
      {
        heading: "Decisions are shared",
        body: "Treatment plans are made with you by a multidisciplinary team. BreastCare AI records and tracks the plan your clinicians agree with you — it does not choose or recommend a treatment.",
      },
    ],
    references: [
      { organization: "National Comprehensive Cancer Network", title: "Breast cancer guidelines (patient version)", url: "https://www.nccn.org/patientguidelines" },
      { organization: "National Cancer Institute", title: "Types of cancer treatment", url: "https://www.cancer.gov/about-cancer/treatment/types" },
    ],
    updatedAt: "2026-04-02",
  },
  {
    slug: "nutrition-during-treatment",
    category: "Nutrition",
    title: "Eating well during and after treatment",
    readingTimeMinutes: 8,
    summary: "General nutrition principles, managing side effects, and why no diet cures cancer.",
    sections: [
      {
        heading: "The goals of eating during treatment",
        body: "Maintaining weight and muscle, supporting recovery between cycles, and keeping eating manageable when side effects interfere. Needs vary with the type of treatment, side effects, other conditions and how your appetite and weight are changing.",
      },
      {
        heading: "Managing common side effects",
        body: "Small frequent meals, adapting texture and temperature, and using anti-sickness medicine as prescribed all help. The side-effect section of this platform has specific suggestions for nausea, taste change, mouth discomfort, constipation, diarrhoea, appetite loss and fatigue.",
      },
      {
        heading: "About 'anti-cancer' diets",
        body: "No diet has been shown to cure cancer. Restrictive diets during treatment can cause unintended weight loss and may interrupt treatment. Discuss any significant dietary change — and any supplement — with your oncology team or dietitian first.",
      },
    ],
    references: [
      { organization: "American Cancer Society", title: "Nutrition for the person with cancer", url: "https://www.cancer.org/treatment/treatments-and-side-effects/physical-side-effects/eating-problems/nutrition-for-the-person-with-cancer.html" },
      { organization: "Macmillan Cancer Support", title: "Eating well during treatment", url: "https://www.macmillan.org.uk/cancer-information-and-support/living-with-and-after-cancer/eating-well" },
    ],
    updatedAt: "2026-04-18",
  },
  {
    slug: "exercise-and-wellness",
    category: "Exercise and general wellness",
    title: "Activity, sleep and everyday wellbeing",
    readingTimeMinutes: 5,
    summary: "How gentle activity supports recovery, and how to pace yourself safely.",
    sections: [
      {
        heading: "Activity during treatment",
        body: "Light, regular activity — such as short walks — is generally associated with better energy, mood and sleep during treatment. Always follow the guidance of your clinical team, particularly around surgery sites, low blood counts and bone health.",
      },
      {
        heading: "Rest and recovery",
        body: "Sleep, rest and pacing are part of recovery, not a failure to try hard enough. Building short rests into the day often improves what you can do overall.",
      },
    ],
    references: [
      { organization: "American Cancer Society", title: "Physical activity and the cancer patient", url: "https://www.cancer.org/treatment/treatments-and-side-effects/physical-side-effects/fatigue/physical-activity-and-the-cancer-patient.html" },
    ],
    updatedAt: "2026-05-01",
  },
  {
    slug: "survivorship",
    category: "Survivorship",
    title: "Life after treatment: survivorship",
    readingTimeMinutes: 6,
    summary: "Follow-up care, late effects, and building a sustainable routine.",
    sections: [
      {
        heading: "Follow-up care",
        body: "Follow-up usually includes regular clinic reviews, imaging of the treated breast, and monitoring of any long-term medicines such as endocrine therapy. Keep attending follow-up even when you feel well.",
      },
      {
        heading: "Late and long-term effects",
        body: "Some effects appear months or years later — fatigue, joint stiffness from endocrine therapy, lymphoedema, bone density changes, heart effects from some treatments. Report new symptoms; most can be managed.",
      },
      {
        heading: "Building a routine",
        body: "Return to activity, work and social life at your own pace. Many survivors find a structured plan for eating, activity and sleep helps rebuild a sense of control.",
      },
    ],
    references: [
      { organization: "National Cancer Institute", title: "Cancer survivorship", url: "https://www.cancer.gov/about-cancer/advanced-cancer/living/survivorship" },
    ],
    updatedAt: "2026-05-22",
  },
  {
    slug: "emotional-support",
    category: "Emotional support",
    title: "Emotional support for patients and families",
    readingTimeMinutes: 5,
    summary: "Fear, uncertainty and change are normal — and support is available.",
    sections: [
      {
        heading: "What many people feel",
        body: "Anxiety around scans, fear of recurrence, changes to body image, and strain on family and work life are all common. These feelings are a normal response to a difficult situation, not a sign of weakness.",
      },
      {
        heading: "Where support comes from",
        body: "Your clinical team can refer you to psycho-oncology, counselling, social work and peer-support services. Many people also benefit from structured support groups and reputable online communities.",
      },
      {
        heading: "If you feel overwhelmed",
        body: "If you are struggling with persistent low mood, panic, or thoughts of harming yourself, please contact your care team or local mental-health crisis service without delay.",
      },
    ],
    references: [
      { organization: "American Cancer Society", title: "Emotional support", url: "https://www.cancer.org/treatment/understanding-your-diagnosis/coping/emotional-support.html" },
    ],
    updatedAt: "2026-06-04",
  },
  {
    slug: "faq",
    category: "Frequently asked questions",
    title: "Frequently asked questions",
    readingTimeMinutes: 7,
    summary: "Short answers to the questions patients ask most often.",
    sections: [
      {
        heading: "Does a lump mean I have cancer?",
        body: "No. Most breast lumps are benign. Because it is impossible to tell from feeling alone, any new lump should be examined by a clinician.",
      },
      {
        heading: "Can BreastCare AI diagnose me?",
        body: "No. This platform provides educational information and an AI-assisted risk assessment to support a conversation with a clinician. It cannot examine you, order tests or make a diagnosis.",
      },
      {
        heading: "Is my data on the blockchain?",
        body: "Your medical information is stored in the platform's secure database. Only pseudonymous identifiers, consent records, record hashes and audit events are written to the blockchain — never names, symptoms, images or clinical notes.",
      },
      {
        heading: "Can a doctor see my record without my permission?",
        body: "No. Access requires your explicit consent, which you can revoke at any time. Revocation is immediate and is recorded on-chain.",
      },
      {
        heading: "Can I change my medication here?",
        body: "No. The platform tracks what your prescriber has instructed. Never change a dose without speaking to your care team.",
      },
    ],
    references: [
      { organization: "World Health Organization", title: "Breast cancer fact sheet", url: "https://www.who.int/news-room/fact-sheets/detail/breast-cancer" },
    ],
    updatedAt: "2026-06-20",
  },
];

export function articleBySlug(slug: string): KnowledgeArticle | undefined {
  return KNOWLEDGE_ARTICLES.find((article) => article.slug === slug);
}

export function articlesByCategory(category: string): KnowledgeArticle[] {
  return KNOWLEDGE_ARTICLES.filter((article) => article.category === category);
}
