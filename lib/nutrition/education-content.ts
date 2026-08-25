// Coach-curated macro education content — structured, data-driven so a
// future coach dashboard can own this content (source name, category,
// coach-preferred flag, rationale, best-use context, ordering, an optional
// note) instead of components hard-wiring one fixed list. See the Visual
// Constitution §16 and the product requirement to keep coach-curated
// content, OPTIM's own output, and the client's own data clearly distinct.
//
// Nothing here is attributed to Teague by name/quote — see
// components/nutrition/coach-source-list.tsx and macro-detail-sheet.tsx,
// which present this as neutral "Coach's picks" content rather than words
// put in a specific coach's mouth. Content stays factual, avoids moral
// framing ("good"/"bad"/"clean"/"cheat"), and explains tradeoffs and context
// instead of issuing verdicts.

import type { MacroKey } from "./view-model";

export type { MacroKey };

export interface CoachSource {
  id: string;
  name: string;
  category: string;
  coachPreferred: boolean;
  rationale: string;
  bestUseContext: string;
  order: number;
  /** Optional short coach note — rendered as a distinct, attributed line
   * only when present; never fabricated. */
  note?: string;
}

export interface MacroEducationSection {
  heading: string;
  body: string;
}

export interface MacroEducationContent {
  macro: MacroKey;
  displayName: string;
  whatItDoes: string;
  whyItMatters: string;
  howToUseToday: string;
  fullSections: MacroEducationSection[];
  sources: CoachSource[];
}

export const MACRO_EDUCATION: Record<MacroKey, MacroEducationContent> = {
  protein: {
    macro: "protein",
    displayName: "Protein",
    whatItDoes: "Supplies the amino acids your body uses to repair and rebuild muscle tissue after training.",
    whyItMatters:
      "Consistent protein intake is one of the strongest levers for retaining and building muscle while supporting recovery between sessions.",
    howToUseToday: "Aim to include a protein source at every meal rather than loading it all into one sitting.",
    fullSections: [
      {
        heading: "Muscle repair and retention",
        body: "Training creates small amounts of muscle-fiber damage that protein's amino acids help repair and rebuild — the same repair process is also what preserves existing muscle during a calorie deficit.",
      },
      {
        heading: "Protein quality",
        body: "Not all protein sources supply the same mix of essential amino acids. Animal sources (meat, dairy, eggs) are typically \"complete,\" containing all essential amino acids in one food; many plant sources are lower in one or more, which is where complementary pairing (e.g. rice and beans) helps round things out over a day.",
      },
      {
        heading: "Complete and complementary sources",
        body: "A complete source alone covers your amino acid needs in one food. Combining complementary plant sources across a day (grains with legumes, for example) achieves a similar effect without requiring every meal to be complete on its own.",
      },
      {
        heading: "Distribution across meals",
        body: "Spreading protein across 3-5 meals, rather than one large serving, gives your body a steadier supply of amino acids to work with throughout the day — generally a more effective pattern than the same total protein eaten in a single sitting.",
      },
    ],
    sources: [
      {
        id: "protein-chicken-breast",
        name: "Chicken breast",
        category: "Lean animal protein",
        coachPreferred: true,
        rationale: "High protein density with minimal fat — easy to portion precisely.",
        bestUseContext: "Any meal, especially post-training.",
        order: 1,
      },
      {
        id: "protein-greek-yogurt",
        name: "Greek yogurt",
        category: "Dairy protein",
        coachPreferred: true,
        rationale: "Slower-digesting protein with a favorable protein-to-calorie ratio.",
        bestUseContext: "Breakfast, snacks, or later in the evening.",
        order: 2,
      },
      {
        id: "protein-whey",
        name: "Whey protein",
        category: "Supplement",
        coachPreferred: true,
        rationale: "Fast-digesting and convenient when a whole-food option isn't practical.",
        bestUseContext: "Around training or when short on time.",
        order: 3,
      },
      {
        id: "protein-eggs",
        name: "Eggs",
        category: "Complete animal protein",
        coachPreferred: true,
        rationale: "Complete amino acid profile plus useful micronutrients.",
        bestUseContext: "Breakfast or any meal.",
        order: 4,
      },
      {
        id: "protein-salmon",
        name: "Salmon",
        category: "Complete protein + omega-3 fats",
        coachPreferred: false,
        rationale: "Strong protein source that also contributes beneficial fats — see the Fat guide.",
        bestUseContext: "Dinner, a few times a week.",
        order: 5,
      },
      {
        id: "protein-legumes",
        name: "Lentils and beans",
        category: "Plant protein",
        coachPreferred: false,
        rationale: "Useful plant protein source with fiber; pair with a grain for a more complete amino acid profile.",
        bestUseContext: "Lunch or dinner, alongside rice or another grain.",
        order: 6,
      },
    ],
  },
  carbs: {
    macro: "carbs",
    displayName: "Carbohydrates",
    whatItDoes: "Your body's primary and most readily available fuel source for training and daily activity.",
    whyItMatters:
      "Adequate carbohydrate intake supports training intensity and the muscle-glycogen replenishment that drives recovery between sessions.",
    howToUseToday: "Weight carbs toward the meals closest to training, when your body can put them to use fastest.",
    fullSections: [
      {
        heading: "Training fuel and recovery",
        body: "Muscles store carbohydrate as glycogen, the primary fuel for moderate-to-high intensity training. Replenishing glycogen after a session is a meaningful part of recovering for the next one.",
      },
      {
        heading: "Faster- and slower-digesting sources",
        body: "Sources like white rice or fruit digest quickly, making them useful close to training. Sources like oats or whole grains digest more slowly, providing steadier energy over a longer stretch — useful earlier in the day or further from training.",
      },
      {
        heading: "Fiber and food context",
        body: "Fiber-rich carbohydrate sources (vegetables, whole grains, fruit) slow digestion and support fullness and digestive health — a real tradeoff against the faster-digesting sources that suit a pre- or post-training window.",
      },
      {
        heading: "Timing around training",
        body: "A carbohydrate-containing meal in the hours before training, and another after, is a common and effective pattern — but total daily carbohydrate intake matters more than any single meal's exact timing.",
      },
    ],
    sources: [
      {
        id: "carbs-rice",
        name: "White rice",
        category: "Fast-digesting starch",
        coachPreferred: true,
        rationale: "Easy to digest and simple to portion — a reliable base for most meals.",
        bestUseContext: "Any meal, especially around training.",
        order: 1,
      },
      {
        id: "carbs-oats",
        name: "Oats",
        category: "Slower-digesting starch",
        coachPreferred: true,
        rationale: "Steadier energy release and useful fiber content.",
        bestUseContext: "Breakfast or well before training.",
        order: 2,
      },
      {
        id: "carbs-potatoes",
        name: "Potatoes",
        category: "Starch",
        coachPreferred: true,
        rationale: "Nutrient-dense and versatile, with a moderate digestion speed.",
        bestUseContext: "Lunch or dinner.",
        order: 3,
      },
      {
        id: "carbs-fruit",
        name: "Fruit",
        category: "Fast-digesting carbohydrate",
        coachPreferred: false,
        rationale: "Quick source of carbohydrate plus micronutrients and fiber.",
        bestUseContext: "Around training or as part of a snack.",
        order: 4,
      },
      {
        id: "carbs-whole-grain-bread",
        name: "Whole grain bread",
        category: "Slower-digesting starch",
        coachPreferred: false,
        rationale: "More fiber than refined bread, for steadier energy over the morning.",
        bestUseContext: "Breakfast.",
        order: 5,
      },
    ],
  },
  fat: {
    macro: "fat",
    displayName: "Fat",
    whatItDoes: "Supports hormone production, cell function, and the absorption of fat-soluble vitamins.",
    whyItMatters:
      "Adequate dietary fat is necessary for normal hormonal function, which underpins training performance and recovery over time.",
    howToUseToday: "Spread fat across the day, and keep pre-training meals lighter on fat since it digests more slowly.",
    fullSections: [
      {
        heading: "Hormonal and general health roles",
        body: "Dietary fat is a building block for several hormones and supports the absorption of vitamins A, D, E, and K. Going too low for too long can work against training goals rather than support them.",
      },
      {
        heading: "Unsaturated and saturated fats",
        body: "Unsaturated fats (olive oil, avocado, nuts, fatty fish) are generally favored for daily intake; saturated fats (found in fattier cuts of meat and dairy) aren't inherently problematic in moderate amounts, but a diet built mostly around unsaturated sources is the more evidence-supported default.",
      },
      {
        heading: "Essential fats",
        body: "Omega-3 and omega-6 fatty acids can't be produced by the body and must come from food — fatty fish, walnuts, and certain oils are useful sources of omega-3s in particular.",
      },
      {
        heading: "Digestion and pre-training timing",
        body: "Fat slows gastric emptying more than protein or carbohydrate. A large, high-fat meal shortly before training can feel heavy or uncomfortable — a lighter, lower-fat option closer to training and the fattier meals earlier or later in the day is a common and comfortable pattern.",
      },
    ],
    sources: [
      {
        id: "fat-olive-oil",
        name: "Olive oil",
        category: "Unsaturated fat",
        coachPreferred: true,
        rationale: "Versatile, calorie-dense way to hit fat targets with a favorable fat profile.",
        bestUseContext: "Cooking or dressing meals earlier in the day.",
        order: 1,
      },
      {
        id: "fat-avocado",
        name: "Avocado",
        category: "Unsaturated fat",
        coachPreferred: true,
        rationale: "Nutrient-dense whole-food fat source with fiber included.",
        bestUseContext: "Meals away from training.",
        order: 2,
      },
      {
        id: "fat-nuts",
        name: "Nuts and nut butter",
        category: "Unsaturated fat",
        coachPreferred: true,
        rationale: "Convenient, calorie-dense, and a useful source of essential fats.",
        bestUseContext: "Snacks or meals well before training.",
        order: 3,
      },
      {
        id: "fat-fatty-fish",
        name: "Salmon and other fatty fish",
        category: "Unsaturated fat (omega-3)",
        coachPreferred: true,
        rationale: "One of the best sources of essential omega-3 fats alongside quality protein.",
        bestUseContext: "Dinner, a few times a week.",
        order: 4,
      },
      {
        id: "fat-eggs",
        name: "Whole eggs",
        category: "Mixed fat",
        coachPreferred: false,
        rationale: "Useful fat and protein together, best kept to lighter portions right before training.",
        bestUseContext: "Meals away from training.",
        order: 5,
      },
    ],
  },
};
