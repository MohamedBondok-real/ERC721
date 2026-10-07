import type { MealSuggestion, NutritionPhase, SideEffectGuidance } from "./types";

/* ------------------------------------------------------------------ */
/* Educational nutrition knowledge base                                */
/* ------------------------------------------------------------------ */

export interface NutritionPhaseContent {
  phase: NutritionPhase;
  title: string;
  summary: string;
  priorities: string[];
  cautions: string[];
}

export const NUTRITION_PHASES: NutritionPhaseContent[] = [
  {
    phase: "during-treatment",
    title: "During treatment",
    summary:
      "While you are receiving treatment, the aim of nutrition is usually to maintain weight and strength, support recovery between cycles, and make side effects easier to manage. Needs differ substantially between chemotherapy, radiotherapy, surgery and hormone therapy.",
    priorities: [
      "Keep protein intake adequate — protein supports tissue repair and helps preserve muscle.",
      "Eat regularly, even in small amounts, rather than waiting for a large appetite.",
      "Stay hydrated; treatment and some medicines increase fluid needs.",
      "Prioritise food safety if your blood counts are low: wash produce, cook meat, fish and eggs thoroughly, and avoid unpasteurised products.",
      "Ask your team about a referral to an oncology dietitian — they can personalise targets to your regimen.",
    ],
    cautions: [
      "Do not start a restrictive or 'anti-cancer' diet during treatment without discussing it with your team; unintended weight loss can interrupt treatment.",
      "High-dose antioxidant supplements may interact with some treatments — check before taking them.",
      "Grapefruit and Seville orange can interact with several medicines; ask your pharmacist.",
    ],
  },
  {
    phase: "recovery",
    title: "Recovery",
    summary:
      "After surgery, radiotherapy or a course of systemic therapy, nutrition supports wound healing, rebuilding strength and restoring normal eating patterns. Recovery is gradual and appetite may take time to return.",
    priorities: [
      "Aim for regular meals with a source of protein at each one.",
      "Reintroduce fibre gradually if your digestion has been affected.",
      "Support gentle activity as cleared by your team — it helps appetite, mood and sleep.",
      "Keep a simple food and symptom diary; patterns are useful for your next appointment.",
    ],
    cautions: [
      "Rapid weight change in either direction is worth mentioning to your team.",
      "If swallowing, taste or digestion problems persist, ask for a dietitian review rather than cutting out food groups.",
    ],
  },
  {
    phase: "survivorship",
    title: "Survivorship",
    summary:
      "Long-term eating patterns for breast cancer survivors broadly follow general healthy-eating guidance: varied plant-forward meals, adequate protein, limited alcohol, and a sustainable level of physical activity.",
    priorities: [
      "Build meals around vegetables, fruit, whole grains, legumes, nuts and lean protein.",
      "Limit alcohol — it is a recognised modifiable risk factor, and less is better.",
      "Choose mostly minimally processed foods and limit processed and red meat.",
      "Aim for a level of physical activity that is realistic and enjoyable for you.",
      "Continue any prescribed follow-up screening and endocrine therapy as directed by your team.",
    ],
    cautions: [
      "Weight gain after treatment is common and manageable — discuss a plan with your team rather than self-imposing a strict diet.",
      "Be cautious with supplements marketed as 'oestrogen balancing'; several interact with endocrine therapy.",
    ],
  },
  {
    phase: "side-effect-support",
    title: "Side-effect support",
    summary:
      "Practical eating strategies for common treatment-related side effects. These are general suggestions — your team can tailor them, and persistent or severe symptoms always deserve clinical review.",
    priorities: [
      "Match texture and temperature to what is comfortable on the day.",
      "Eat small amounts frequently rather than three large meals.",
      "Keep easy options available for days when cooking is not possible.",
    ],
    cautions: [
      "Unintentional weight loss, dehydration, or inability to keep fluids down need prompt medical attention.",
    ],
  },
];

/* ------------------------------------------------------------------ */
/* Side-effect guidance                                                */
/* ------------------------------------------------------------------ */

export const SIDE_EFFECT_GUIDANCE: SideEffectGuidance[] = [
  {
    id: "appetite-loss",
    symptom: "Loss of appetite",
    summary: "A reduced appetite is common during treatment. The goal is to get useful nutrition from smaller volumes.",
    suggestions: [
      "Eat small amounts every 2–3 hours rather than waiting for mealtimes.",
      "Make every mouthful count: add olive oil, nut butter, yoghurt, egg or cheese to what you already eat.",
      "Drink calories between meals — smoothies, milk, fortified drinks or soups.",
      "Keep easy food visible and within reach; appetite often follows action rather than the reverse.",
      "Gentle movement before eating can stimulate appetite for some people.",
    ],
    whenToContactCareTeam:
      "If you are losing weight unintentionally, eating very little for several days, or feel weak or dizzy, contact your care team.",
  },
  {
    id: "nausea",
    symptom: "Nausea",
    summary: "Nausea is usually best managed with the anti-sickness medicines your team prescribes, supported by eating patterns.",
    suggestions: [
      "Take prescribed anti-sickness medicine exactly as directed, including preventively if that is the plan.",
      "Try dry, bland foods such as toast, crackers or rice, especially in the morning.",
      "Eat cool or room-temperature foods; strong cooking smells can trigger nausea.",
      "Sip fluids slowly through the day rather than drinking large amounts at once.",
      "Rest upright for 30–60 minutes after eating.",
    ],
    whenToContactCareTeam:
      "Contact your team if you cannot keep fluids down for more than 24 hours, vomit blood, or feel severely dehydrated.",
  },
  {
    id: "taste-changes",
    symptom: "Taste changes",
    summary: "Treatment can make foods taste metallic, bitter or bland. Flavour can often be adjusted rather than avoided.",
    suggestions: [
      "Use plastic utensils and glass cookware if food tastes metallic.",
      "Add acidity where mouth comfort allows — lemon, lime, vinegar or pickles.",
      "Marinate meat, or substitute eggs, dairy, beans or tofu if red meat tastes unpleasant.",
      "Try serving food cooler; heat intensifies flavours and smells.",
      "Experiment with herbs and spices rather than salt.",
    ],
    whenToContactCareTeam: "If taste changes make eating impossible or you are losing weight, ask for a dietitian review.",
  },
  {
    id: "mouth-discomfort",
    symptom: "Mouth discomfort or sores",
    summary: "Mouth soreness (mucositis) makes eating painful. Softer, milder foods are usually easier.",
    suggestions: [
      "Choose soft, moist foods: porridge, scrambled eggs, mashed vegetables, yoghurt, smoothies.",
      "Avoid acidic, spicy, salty, very hot or very crunchy foods while the mouth is sore.",
      "Sip through a straw if that is more comfortable.",
      "Follow the mouth-care routine your team recommends and report new sores early.",
    ],
    whenToContactCareTeam:
      "Report mouth sores promptly — early treatment helps. Seek advice urgently for a fever, bleeding gums or inability to swallow.",
  },
  {
    id: "constipation",
    symptom: "Constipation",
    summary: "Some anti-sickness and pain medicines slow the bowel. Fluid, fibre and movement all help.",
    suggestions: [
      "Increase fluids steadily, aiming for what your team recommends for you.",
      "Add soluble fibre gradually — oats, fruit, vegetables, legumes.",
      "Stay as active as you are able; short walks help.",
      "If you are taking laxatives, follow the prescribed schedule rather than waiting for discomfort.",
    ],
    whenToContactCareTeam: "Contact your team if you have no bowel movement for several days, or if you have severe abdominal pain or vomiting.",
  },
  {
    id: "diarrhoea",
    symptom: "Diarrhoea",
    summary: "Loose stools can cause fluid and salt loss. Replacing both matters more than food variety in the short term.",
    suggestions: [
      "Replace fluids and electrolytes — water, oral rehydration solutions, broths.",
      "Choose low-fibre, bland foods temporarily: rice, bananas, toast, plain pasta.",
      "Eat small, frequent amounts rather than large meals.",
      "Limit caffeine, alcohol, very fatty foods and sugar alcohols while symptoms are active.",
    ],
    whenToContactCareTeam:
      "Contact your team for diarrhoea lasting more than 24–48 hours, more than about six episodes a day, blood in the stool, dizziness or fever.",
  },
  {
    id: "fatigue",
    symptom: "Fatigue",
    summary: "Treatment-related fatigue is common and is not simply a matter of eating more. Nutrition can still support energy.",
    suggestions: [
      "Plan meals around the time of day you feel most energetic.",
      "Keep low-effort options ready: pre-cut vegetables, tinned beans, frozen vegetables, ready-cooked grains.",
      "Include protein and complex carbohydrate together for steadier energy.",
      "Short, regular rests and light activity often help more than long periods in bed.",
    ],
    whenToContactCareTeam:
      "Tell your team about severe fatigue — it can have treatable causes such as anaemia, thyroid change or low mood.",
  },
];

/* ------------------------------------------------------------------ */
/* Food libraries                                                      */
/* ------------------------------------------------------------------ */

export interface FoodGroup {
  id: string;
  name: string;
  examples: string[];
  rationale: string;
}

export const FOODS_TO_EMPHASIZE: FoodGroup[] = [
  {
    id: "protein",
    name: "Adequate protein",
    examples: ["Fish", "Chicken", "Eggs", "Greek yoghurt", "Lentils and beans", "Tofu", "Nuts and nut butters"],
    rationale: "Supports tissue repair, immune function and preservation of muscle during treatment.",
  },
  {
    id: "plants",
    name: "Varied vegetables and fruit",
    examples: ["Leafy greens", "Cruciferous vegetables", "Berries", "Citrus", "Squash", "Tomatoes"],
    rationale: "Provide fibre, vitamins and a range of plant compounds as part of an overall varied diet.",
  },
  {
    id: "wholegrains",
    name: "Whole grains",
    examples: ["Oats", "Brown rice", "Wholegrain bread", "Barley", "Quinoa"],
    rationale: "Steady energy and fibre, which also supports bowel regularity.",
  },
  {
    id: "fats",
    name: "Unsaturated fats",
    examples: ["Olive oil", "Avocado", "Oily fish", "Walnuts", "Flaxseed"],
    rationale: "Concentrated energy when appetite is low, plus essential fatty acids.",
  },
  {
    id: "fluids",
    name: "Fluids",
    examples: ["Water", "Herbal tea", "Broth", "Milk or fortified alternatives"],
    rationale: "Hydration supports circulation, kidney function and management of side effects.",
  },
];

export interface FoodCaution {
  food: string;
  reason: string;
  categories: NutritionPhase[];
}

export const FOODS_TO_DISCUSS_WITH_CLINICIAN: FoodCaution[] = [
  {
    food: "High-dose antioxidant supplements (vitamin C, E, selenium)",
    reason: "May interact with some chemotherapy and radiotherapy regimens. Food sources are generally preferred over supplements.",
    categories: ["during-treatment"],
  },
  {
    food: "Grapefruit and Seville orange",
    reason: "Can affect how several medicines are metabolised, including some targeted and endocrine therapies.",
    categories: ["during-treatment", "survivorship"],
  },
  {
    food: "Soya isoflavone supplements",
    reason: "Concentrated supplements are different from moderate dietary soya; discuss with your team, particularly on endocrine therapy.",
    categories: ["during-treatment", "survivorship"],
  },
  {
    food: "St John's Wort and other herbal remedies",
    reason: "Well-documented interactions with cancer medicines and antidepressants.",
    categories: ["during-treatment", "recovery", "survivorship"],
  },
  {
    food: "Unpasteurised dairy, raw fish and undercooked meat or eggs",
    reason: "Higher infection risk when white cell counts are low during treatment.",
    categories: ["during-treatment"],
  },
  {
    food: "Alcohol",
    reason: "A recognised modifiable risk factor; it can also worsen fatigue, mouth soreness and interaction with medicines.",
    categories: ["during-treatment", "recovery", "survivorship"],
  },
  {
    food: "Very low-calorie or ketogenic diets",
    reason: "Restrictive diets during treatment risk unintended weight loss and treatment interruption; evidence is still being researched.",
    categories: ["during-treatment", "recovery"],
  },
];

export const FOODS_THAT_MAY_WORSEN_SYMPTOMS: { symptomId: string; food: string; reason: string }[] = [
  { symptomId: "nausea", food: "Greasy, fried or very rich foods", reason: "Slow to digest and strong-smelling, which can trigger nausea." },
  { symptomId: "nausea", food: "Very sweet or heavily spiced dishes", reason: "Can intensify nausea for some people." },
  { symptomId: "mouth-discomfort", food: "Citrus, tomato and vinegar-based foods", reason: "Acidity stings sore mouth tissue." },
  { symptomId: "mouth-discomfort", food: "Crusty bread, crisps, crackers", reason: "Sharp edges irritate ulcers." },
  { symptomId: "diarrhoea", food: "High-fibre bran, raw vegetables, caffeine", reason: "Can increase bowel frequency while symptoms are active." },
  { symptomId: "constipation", food: "Large amounts of cheese, white flour and low-fluid meals", reason: "Can worsen constipation, especially with opioid pain relief." },
  { symptomId: "taste-changes", food: "Red meat", reason: "Often tastes metallic during treatment; other proteins are usually better tolerated." },
  { symptomId: "fatigue", food: "Large, heavy meals", reason: "Can increase post-meal sleepiness; smaller frequent meals are usually easier." },
];

/* ------------------------------------------------------------------ */
/* Meal library                                                        */
/* ------------------------------------------------------------------ */

export interface MealTemplate {
  slot: MealSuggestion["slot"];
  name: string;
  description: string;
  rationale: string;
  approximateKcal: number;
  proteinGrams: number;
  tags: string[];
  /** Phases where this suggestion is especially appropriate. */
  phases: NutritionPhase[];
  /** Avoid suggesting this meal when the patient reports one of these side effects. */
  avoidWithSideEffects: string[];
  /** Excluded when any of these preferences/restrictions are declared. */
  excludedBy: string[];
}

export const MEAL_LIBRARY: MealTemplate[] = [
  {
    slot: "breakfast",
    name: "Porridge with yoghurt, berries and ground flaxseed",
    description: "Oats cooked with milk or a fortified alternative, topped with Greek yoghurt, berries and a tablespoon of ground flaxseed.",
    rationale: "Gentle on the stomach, provides protein and fibre, and is easy to eat when appetite is low.",
    approximateKcal: 380,
    proteinGrams: 18,
    tags: ["vegetarian", "soft-texture", "high-protein"],
    phases: ["during-treatment", "recovery", "survivorship", "side-effect-support"],
    avoidWithSideEffects: [],
    excludedBy: ["dairy-free"],
  },
  {
    slot: "breakfast",
    name: "Scrambled eggs on wholegrain toast",
    description: "Two eggs scrambled with a little olive oil, served on wholegrain toast with sliced tomato if tolerated.",
    rationale: "High-quality protein that is quick to prepare on low-energy days.",
    approximateKcal: 420,
    proteinGrams: 24,
    tags: ["vegetarian", "quick", "high-protein"],
    phases: ["during-treatment", "recovery", "survivorship", "side-effect-support"],
    avoidWithSideEffects: [],
    excludedBy: ["vegan", "egg-free"],
  },
  {
    slot: "breakfast",
    name: "Tofu scramble with spinach",
    description: "Firm tofu crumbled and pan-fried with turmeric, spinach and a little olive oil.",
    rationale: "Plant-based protein option for vegan and vegetarian preferences.",
    approximateKcal: 320,
    proteinGrams: 22,
    tags: ["vegan", "vegetarian", "high-protein"],
    phases: ["during-treatment", "recovery", "survivorship"],
    avoidWithSideEffects: [],
    excludedBy: ["soya-free"],
  },
  {
    slot: "mid-morning",
    name: "Greek yoghurt with honey and walnuts",
    description: "A small pot of Greek yoghurt with a teaspoon of honey and a few chopped walnuts.",
    rationale: "Dense in protein and calories for a small volume — useful when appetite is poor.",
    approximateKcal: 260,
    proteinGrams: 16,
    tags: ["vegetarian", "high-protein", "low-effort"],
    phases: ["during-treatment", "recovery", "side-effect-support"],
    avoidWithSideEffects: ["mouth-discomfort"],
    excludedBy: ["dairy-free", "vegan"],
  },
  {
    slot: "mid-morning",
    name: "Banana with peanut butter",
    description: "A banana with a tablespoon of smooth peanut butter.",
    rationale: "Easy to eat with nausea, and provides potassium and energy.",
    approximateKcal: 250,
    proteinGrams: 8,
    tags: ["vegan", "vegetarian", "bland", "low-effort"],
    phases: ["during-treatment", "recovery", "side-effect-support"],
    avoidWithSideEffects: ["mouth-discomfort"],
    excludedBy: ["nut-free"],
  },
  {
    slot: "lunch",
    name: "Lentil and vegetable soup with wholegrain bread",
    description: "Red lentils simmered with carrot, celery and onion, blended smooth if preferred, with a slice of wholegrain bread.",
    rationale: "Soft, warming and nutrient-dense; easy to batch-cook and freeze.",
    approximateKcal: 450,
    proteinGrams: 20,
    tags: ["vegan", "vegetarian", "soft-texture", "batch-cook"],
    phases: ["during-treatment", "recovery", "survivorship", "side-effect-support"],
    avoidWithSideEffects: [],
    excludedBy: [],
  },
  {
    slot: "lunch",
    name: "Grilled chicken, quinoa and roasted vegetables",
    description: "A palm-sized portion of chicken with quinoa and roasted courgette, pepper and red onion.",
    rationale: "Balanced protein and complex carbohydrate for recovery days.",
    approximateKcal: 520,
    proteinGrams: 38,
    tags: ["high-protein", "gluten-free"],
    phases: ["recovery", "survivorship"],
    avoidWithSideEffects: ["mouth-discomfort"],
    excludedBy: ["vegetarian", "vegan", "poultry-free"],
  },
  {
    slot: "lunch",
    name: "Baked salmon with new potatoes and greens",
    description: "A fillet of salmon baked with lemon, served with new potatoes and steamed greens.",
    rationale: "Oily fish provides omega-3 fatty acids alongside high-quality protein.",
    approximateKcal: 560,
    proteinGrams: 34,
    tags: ["high-protein", "pescatarian", "gluten-free"],
    phases: ["recovery", "survivorship"],
    avoidWithSideEffects: ["nausea"],
    excludedBy: ["vegetarian", "vegan", "fish-free"],
  },
  {
    slot: "afternoon",
    name: "Fortified smoothie",
    description: "Milk or fortified alternative blended with banana, oats, nut butter and a little cocoa.",
    rationale: "A drinkable source of calories, protein and fluid when solid food is difficult.",
    approximateKcal: 340,
    proteinGrams: 14,
    tags: ["vegetarian", "drinkable", "low-effort"],
    phases: ["during-treatment", "recovery", "side-effect-support"],
    avoidWithSideEffects: ["diarrhoea"],
    excludedBy: ["dairy-free", "nut-free"],
  },
  {
    slot: "afternoon",
    name: "Crackers with hummus and cucumber",
    description: "Plain crackers with hummus and thin cucumber slices.",
    rationale: "A bland, dry option that many people tolerate during nausea.",
    approximateKcal: 220,
    proteinGrams: 8,
    tags: ["vegan", "vegetarian", "bland"],
    phases: ["during-treatment", "side-effect-support"],
    avoidWithSideEffects: ["mouth-discomfort"],
    excludedBy: ["gluten-free", "sesame-free"],
  },
  {
    slot: "dinner",
    name: "Chicken and ginger rice bowl",
    description: "Shredded chicken with rice, ginger, carrot and a light soy or tamari dressing.",
    rationale: "Ginger is a common household approach to mild nausea; mild seasoning suits taste changes.",
    approximateKcal: 540,
    proteinGrams: 36,
    tags: ["high-protein", "mild-flavour"],
    phases: ["during-treatment", "recovery"],
    avoidWithSideEffects: [],
    excludedBy: ["vegetarian", "vegan", "poultry-free"],
  },
  {
    slot: "dinner",
    name: "Baked cod with sweet potato and green beans",
    description: "A white fish fillet baked with herbs, served with mashed sweet potato and green beans.",
    rationale: "Mild-flavoured white fish is often better tolerated when meat tastes metallic.",
    approximateKcal: 480,
    proteinGrams: 32,
    tags: ["pescatarian", "mild-flavour", "gluten-free"],
    phases: ["during-treatment", "recovery", "survivorship"],
    avoidWithSideEffects: [],
    excludedBy: ["vegetarian", "vegan", "fish-free"],
  },
  {
    slot: "dinner",
    name: "Bean and vegetable chilli with rice",
    description: "Kidney beans, peppers and tomato simmered with mild spices, served over rice.",
    rationale: "Fibre-rich plant protein; leftovers keep well for low-energy days.",
    approximateKcal: 520,
    proteinGrams: 20,
    tags: ["vegan", "vegetarian", "batch-cook"],
    phases: ["recovery", "survivorship"],
    avoidWithSideEffects: ["mouth-discomfort"],
    excludedBy: [],
  },
  {
    slot: "evening",
    name: "Warm milk or fortified alternative with oats",
    description: "A warm drink with a little oat cereal before bed.",
    rationale: "A small protein-containing snack overnight can help when daytime intake is poor.",
    approximateKcal: 180,
    proteinGrams: 9,
    tags: ["vegetarian", "soft-texture", "low-effort"],
    phases: ["during-treatment", "recovery", "side-effect-support"],
    avoidWithSideEffects: [],
    excludedBy: ["dairy-free"],
  },
];
