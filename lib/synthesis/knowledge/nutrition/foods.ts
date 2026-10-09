// Nutrition Knowledge V1 — the practical food catalog (internal curation, pending qualified review).
//
// Foods are described by ROLE (what a food mainly contributes), dietary tags (what restrictions exclude it), prep
// effort and a household portion — never by exact nutrient values. OPTIM has no verified food-composition source in
// V1 (a USDA FoodData Central integration is the named dependency), so the Nutrition Reasoner may choose and
// substitute foods but can never attach invented per-food grams or calories to them. Portions are coaching
// starting points stated in household measures; the coach adjusts them.

export const FOOD_ROLES = ["protein", "carbohydrate", "fat", "produce", "dairy_or_alternative", "convenience_protein"] as const;
export type FoodRole = (typeof FOOD_ROLES)[number];

/** What a dietary restriction excludes. A food carries every tag that applies to it. */
export const DIETARY_TAGS = ["meat", "poultry", "pork", "fish", "shellfish", "egg", "dairy", "lactose", "gluten", "wheat", "soy", "peanut", "tree_nut", "sesame", "legume"] as const;
export type DietaryTag = (typeof DIETARY_TAGS)[number];

export interface FoodItem {
  id: string;
  name: string;
  roles: FoodRole[];
  tags: DietaryTag[];
  /** none = ready to eat; minimal = assemble/heat (≤10 min); cook = needs cooking. */
  prep: "none" | "minimal" | "cook";
  /** A household starting portion — coaching guidance, not a nutrient claim. */
  portion: string;
}

const f = (id: string, name: string, roles: FoodRole[], tags: DietaryTag[], prep: FoodItem["prep"], portion: string): FoodItem => ({ id: `food.${id}`, name, roles, tags, prep, portion });

export const FOODS: FoodItem[] = [
  // Protein
  f("chicken_breast", "Chicken breast", ["protein"], ["meat", "poultry"], "cook", "a palm-sized portion"),
  f("rotisserie_chicken", "Rotisserie chicken", ["protein", "convenience_protein"], ["meat", "poultry"], "none", "a palm-sized portion"),
  f("lean_ground_beef", "Lean ground beef", ["protein"], ["meat"], "cook", "a palm-sized portion"),
  f("pork_tenderloin", "Pork tenderloin", ["protein"], ["meat", "pork"], "cook", "a palm-sized portion"),
  f("salmon", "Salmon", ["protein", "fat"], ["fish"], "cook", "a palm-sized fillet"),
  f("canned_tuna", "Canned tuna", ["protein", "convenience_protein"], ["fish"], "none", "one can"),
  f("shrimp", "Shrimp", ["protein"], ["shellfish"], "cook", "a palm-sized portion"),
  f("eggs", "Eggs", ["protein", "fat"], ["egg"], "minimal", "2–3 eggs"),
  f("greek_yogurt", "Greek yogurt", ["protein", "dairy_or_alternative"], ["dairy", "lactose"], "none", "one cup"),
  f("cottage_cheese", "Cottage cheese", ["protein", "dairy_or_alternative"], ["dairy", "lactose"], "none", "one cup"),
  f("milk", "Milk", ["dairy_or_alternative", "protein"], ["dairy", "lactose"], "none", "one glass"),
  f("lactose_free_milk", "Lactose-free milk", ["dairy_or_alternative", "protein"], ["dairy"], "none", "one glass"),
  f("soy_milk", "Soy milk", ["dairy_or_alternative", "protein"], ["soy"], "none", "one glass"),
  f("tofu", "Firm tofu", ["protein"], ["soy"], "minimal", "a palm-sized block"),
  f("tempeh", "Tempeh", ["protein"], ["soy"], "minimal", "a palm-sized portion"),
  f("lentils", "Lentils", ["protein", "carbohydrate"], ["legume"], "minimal", "one cupped hand cooked"),
  f("chickpeas", "Chickpeas", ["protein", "carbohydrate"], ["legume"], "none", "one cupped hand"),
  f("black_beans", "Black beans", ["protein", "carbohydrate"], ["legume"], "none", "one cupped hand"),
  f("seitan", "Seitan", ["protein"], ["gluten", "wheat"], "minimal", "a palm-sized portion"),
  f("whey_protein", "Whey protein powder", ["protein", "convenience_protein"], ["dairy"], "none", "one scoop"),
  f("pea_protein", "Pea protein powder", ["protein", "convenience_protein"], [], "none", "one scoop"),
  // Carbohydrate
  f("oats", "Oats", ["carbohydrate"], [], "minimal", "one cupped hand dry"),
  f("rice", "Rice", ["carbohydrate"], [], "cook", "one cupped hand cooked"),
  f("microwave_rice", "Microwave rice pouch", ["carbohydrate"], [], "minimal", "half a pouch"),
  f("potatoes", "Potatoes", ["carbohydrate", "produce"], [], "cook", "a fist-sized potato"),
  f("whole_grain_bread", "Whole-grain bread", ["carbohydrate"], ["gluten", "wheat"], "none", "two slices"),
  f("gluten_free_bread", "Gluten-free bread", ["carbohydrate"], [], "none", "two slices"),
  f("pasta", "Pasta", ["carbohydrate"], ["gluten", "wheat"], "cook", "one cupped hand cooked"),
  f("quinoa", "Quinoa", ["carbohydrate", "protein"], [], "cook", "one cupped hand cooked"),
  f("fruit", "Fruit (banana, apple, berries)", ["carbohydrate", "produce"], [], "none", "one piece or one cup"),
  f("tortillas", "Tortillas (corn)", ["carbohydrate"], [], "none", "two tortillas"),
  // Fat
  f("olive_oil", "Olive oil", ["fat"], [], "none", "a thumb-sized amount"),
  f("avocado", "Avocado", ["fat", "produce"], [], "none", "half an avocado"),
  f("nuts", "Mixed nuts", ["fat"], ["tree_nut"], "none", "a small handful"),
  f("peanut_butter", "Peanut butter", ["fat", "protein"], ["peanut", "legume"], "none", "a thumb-sized amount"),
  f("seeds", "Seeds (pumpkin, chia)", ["fat"], [], "none", "a small handful"),
  f("cheese", "Cheese", ["fat", "dairy_or_alternative", "protein"], ["dairy"], "none", "a thumb-sized piece"),
  // Produce
  f("vegetables", "Vegetables (any)", ["produce"], [], "minimal", "a fist-sized portion or more"),
  f("frozen_vegetables", "Frozen vegetables", ["produce"], [], "minimal", "a fist-sized portion or more"),
  f("salad_greens", "Salad greens", ["produce"], [], "none", "two fists"),
];

const BY_ID = new Map(FOODS.map((x) => [x.id, x]));
export const food = (id: string): FoodItem | undefined => BY_ID.get(id);

/** Restriction wording → excluded tags. Conservative: only clear words map; anything unrecognized becomes a coach
 * question, never a guess. */
const RESTRICTION_TERMS: Array<[RegExp, DietaryTag[]]> = [
  [/\bvegan\b|plant[- ]based/i, ["meat", "poultry", "pork", "fish", "shellfish", "egg", "dairy", "lactose"]],
  [/\bvegetarian\b/i, ["meat", "poultry", "pork", "fish", "shellfish"]],
  [/\bpescatarian\b/i, ["meat", "poultry", "pork"]],
  [/\b(halal|kosher|no pork|pork)\b/i, ["pork"]],
  [/\b(no (red )?meat|don'?t eat meat)\b/i, ["meat", "pork"]],
  [/\blactose\b/i, ["lactose"]],
  [/\b(dairy|milk allerg|casein|whey)\b/i, ["dairy", "lactose"]],
  [/\b(gluten|celiac|coeliac)\b/i, ["gluten", "wheat"]],
  [/\bwheat\b/i, ["wheat", "gluten"]],
  [/\bpeanut/i, ["peanut"]],
  [/\b(tree nut|nut allerg|nuts?\b)/i, ["tree_nut"]],
  [/\bshellfish|shrimp|crustacean/i, ["shellfish"]],
  [/\b(fish|seafood)\b/i, ["fish", "shellfish"]],
  [/\beggs?\b/i, ["egg"]],
  [/\bsoy\b/i, ["soy"]],
  [/\bsesame\b/i, ["sesame"]],
];

/** The tags a client's stated restriction excludes, and whether any wording was left uninterpreted. */
export function restrictionTags(detail: string | null): { tags: DietaryTag[]; understood: boolean } {
  if (!detail?.trim()) return { tags: [], understood: false };
  const tags = new Set<DietaryTag>();
  for (const [re, t] of RESTRICTION_TERMS) if (re.test(detail)) t.forEach((x) => tags.add(x));
  return { tags: [...tags], understood: tags.size > 0 };
}
