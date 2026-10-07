import type { RedFlagCategory } from "./types";
import { EMERGENCY_STATEMENT, RED_FLAG_PREAMBLE } from "./disclaimer";

/**
 * Red-flag / prompt-attention content.
 *
 * This is educational. It never assesses the current user and never claims to know what
 * is causing their symptoms — it describes patterns that generally warrant prompt
 * clinical evaluation and tells the reader what to do.
 */
export const RED_FLAG_CATEGORIES: RedFlagCategory[] = [
  {
    id: "new-breast-changes",
    title: "New or concerning breast changes",
    description: "Changes that are new for you and have not settled.",
    signs: [
      "A new lump or area of thickening in the breast or armpit that persists beyond a couple of weeks",
      "Skin dimpling, puckering or an orange-peel texture",
      "A nipple that has newly turned inward",
      "Nipple discharge that is spontaneous, from one breast only, or blood-stained",
      "A breast that has become red, hot, swollen or rapidly larger",
    ],
    action:
      "Arrange an appointment with your doctor or breast clinic. Do not wait for the next routine screening. If the breast is red, hot and painful, seek same-day medical advice.",
    urgency: "prompt",
  },
  {
    id: "persistent-unexplained-symptoms",
    title: "Persistent unexplained symptoms",
    description: "Symptoms that continue without an obvious cause.",
    signs: [
      "A breast change that has lasted more than a few weeks",
      "Persistent pain in one specific area of the breast",
      "Unexplained weight loss, ongoing fatigue or a persistent cough",
      "Bone pain that does not settle, particularly at night",
    ],
    action:
      "Book a routine appointment and describe how long the symptom has been present and whether it is changing. Persistent symptoms deserve an explanation even when cancer is unlikely.",
    urgency: "prompt",
  },
  {
    id: "screening-findings",
    title: "Concerning changes identified during screening",
    description: "Being called back after a screening appointment.",
    signs: [
      "You have been recalled for additional imaging after a mammogram",
      "A screening report describes an area that needs further assessment",
      "You have been offered a biopsy",
    ],
    action:
      "Attend the follow-up appointment as scheduled. Most people recalled from screening do not have cancer. Bring a list of your questions and, if you wish, someone to accompany you.",
    urgency: "prompt",
  },
  {
    id: "severe-treatment-side-effects",
    title: "Severe treatment side effects",
    description: "Side effects that need urgent clinical attention during treatment.",
    signs: [
      "A temperature of 38°C / 100.4°F or higher, or any fever during chemotherapy",
      "Unable to keep fluids down for more than 24 hours, or vomiting blood",
      "Severe diarrhoea — roughly six or more episodes in a day, or blood in the stool",
      "Shortness of breath, chest pain, or a very fast or irregular heartbeat",
      "Sudden swelling, redness or pain in one leg",
      "A red, hot, painful area around a surgical wound, or a wound that has opened",
      "Confusion, severe headache, or a seizure",
      "Bleeding that will not stop, or unexpected bruising",
    ],
    action:
      "Contact your oncology team's urgent line immediately. Outside clinic hours, use your local emergency service or urgent-care pathway. Fever during chemotherapy is an emergency.",
    urgency: "emergency",
  },
  {
    id: "lymphoedema",
    title: "Arm or hand swelling after surgery or radiotherapy",
    description: "Possible lymphoedema, which responds best to early assessment.",
    signs: [
      "Swelling, heaviness or tightness in the arm, hand or breast on the treated side",
      "Skin that feels thick or tight",
      "Reduced range of movement in the shoulder",
    ],
    action:
      "Tell your breast or oncology team. Early referral to a lymphoedema service improves outcomes.",
    urgency: "prompt",
  },
  {
    id: "mental-health-crisis",
    title: "Emotional distress or crisis",
    description: "When emotional distress becomes overwhelming.",
    signs: [
      "Persistent low mood, panic or hopelessness",
      "Thoughts of harming yourself",
      "Inability to cope with daily tasks for more than a few days",
    ],
    action:
      "Contact your care team, or your local mental-health crisis or emergency service now. You do not need to wait for your next appointment.",
    urgency: "urgent",
  },
];

export const RED_FLAG_CONTENT = {
  preamble: RED_FLAG_PREAMBLE,
  emergency: EMERGENCY_STATEMENT,
  categories: RED_FLAG_CATEGORIES,
};
