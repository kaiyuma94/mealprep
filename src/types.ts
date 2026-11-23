/**
 * Weekmenu domain model.
 *
 * Catalog types (Recipe, Ingredient, …) describe the static, read-only recipe
 * collection that ships with the app (src/data/*.json).
 * User types (WeeklyMealPlan, CookingHistory, …) are persisted in IndexedDB.
 */

// ---------- Units ----------

export type MassUnit = 'g' | 'kg';
export type VolumeUnit = 'ml' | 'l' | 'tsp' | 'tbsp';
export type CountUnit = 'piece' | 'clove' | 'bunch' | 'pinch' | 'can' | 'pack' | 'jar';
export type Unit = MassUnit | VolumeUnit | CountUnit;
export type Dimension = 'mass' | 'volume' | 'count';

export interface Quantity {
  /** null means "to taste" / unquantified. */
  amount: number | null;
  unit: Unit;
}

// ---------- Supermarket ----------

/** Supported Dutch supermarkets. */
export type StoreId = 'lidl' | 'ah' | 'jumbo';

export type SupermarketSection =
  | 'produce'
  | 'herbs'
  | 'bakery'
  | 'dairy-eggs'
  | 'chilled'
  | 'pasta-rice-grains'
  | 'canned-jarred'
  | 'world-foods'
  | 'oils-sauces'
  | 'spices'
  | 'nuts-dried'
  | 'baking'
  | 'frozen'
  | 'other';

export interface PackageSize {
  amount: number;
  unit: Unit;
  /** Human label, e.g. "can", "bag", "jar". */
  label: string;
}

// ---------- Catalog ----------

export interface Ingredient {
  /** Canonical kebab-case ID, e.g. "red-onion". Never changes once published. */
  id: string;
  name: string;
  plural?: string;
  section: SupermarketSection;
  defaultUnit: Unit;
  /** Alternative names (English and Dutch) used when importing recipes. */
  aliases?: string[];
  /** Weight of one count unit (piece/clove) in grams, enables count↔mass conversion. */
  gramsPerCount?: number;
  /** g per ml, enables volume↔mass conversion (spices, oils, …). */
  densityGPerMl?: number;
  /** Typical purchasable packaging at the default supermarket. Indicative only — not live availability. */
  packages?: PackageSize[];
  /** Commonly kept in stock; suggested as a default pantry item. */
  pantry?: boolean;
  /** Stores where this may be hard to find. Editorial hint, not verified stock data. */
  limitedAt?: StoreId[];
  /** Canonical IDs of acceptable substitutes. */
  substitutes?: string[];
  /** Short shopping tip shown on the list. */
  note?: string;
}

export interface RecipeIngredient {
  ingredientId: string;
  /** Amount for `Recipe.baseServings`. null = to taste. */
  amount: number | null;
  unit: Unit;
  /** Preparation hint shown next to the ingredient, e.g. "finely chopped". */
  note?: string;
  optional?: boolean;
}

export interface CookingStep {
  text: string;
  /** Suggested timer for this step, in minutes. */
  timerMinutes?: number;
}

export interface RecipeSource {
  /**
   * inspired  – dish name & ingredients based on a known recipe, method written in our own words
   * original  – written for Weekmenu
   * licensed  – imported with permission / under an open license
   * personal  – the user's own recipe
   */
  type: 'inspired' | 'original' | 'licensed' | 'personal';
  name: string;
  url?: string;
  license?: string;
  note?: string;
}

export interface RecipeImage {
  /** Large image (recipe page). */
  url: string;
  /** Smaller image for cards and lists. Falls back to `url`. */
  thumbUrl?: string;
  alt: string;
  /** Photographer / owner. */
  credit: string;
  /** Link to the photo's source page. */
  creditUrl?: string;
  license: string;
  /** Illustrative photo: shows a similar dish, not exactly this recipe. */
  illustrative?: boolean;
}

export type Difficulty = 'easy' | 'medium' | 'hard';

export interface Recipe {
  id: string;
  schemaVersion: number;
  title: string;
  subtitle?: string;
  description: string;
  cuisine: string;
  tags: string[];
  prepMinutes: number;
  cookMinutes: number;
  difficulty: Difficulty;
  baseServings: number;
  ingredients: RecipeIngredient[];
  steps: CookingStep[];
  source: RecipeSource;
  /** Only set when licensed imagery is available. */
  image?: RecipeImage;
  /** Two hex colours used for the illustrated cover when there is no photo. */
  palette?: [string, string];
}

export const RECIPE_SCHEMA_VERSION = 1;

// ---------- User data (persisted) ----------

/** ISO week key, e.g. "2026-W48". */
export type WeekKey = string;

export interface UserPreferences {
  id: 'me';
  defaultServings: number;
  defaultMealTarget: number;
  supermarket: StoreId;
  /** Canonical ingredient IDs the user always has at home. */
  pantryItems: string[];
  updatedAt: number;
}

export interface RecipeUserState {
  recipeId: string;
  favorite: boolean;
  disliked: boolean;
  notes: string;
  updatedAt: number;
}

export type SuggestionBucket = 'enjoyed' | 'match' | 'variety';

export interface SelectionSlot {
  recipeId: string;
  bucket: SuggestionBucket;
}

export interface WeeklySelection {
  weekKey: WeekKey;
  slots: SelectionSlot[];
  /** Recipe IDs that were replaced this week, never re-suggested in the same week. */
  replaced: string[];
  /** Number of individual replacements made, feeds the deterministic replacement seed. */
  replaceCount: number;
  createdAt: number;
}

export interface PlannedMeal {
  recipeId: string;
  servings: number;
  addedAt: number;
  cookedAt?: number;
}

export interface WeeklyMealPlan {
  weekKey: WeekKey;
  mealTarget: number;
  meals: PlannedMeal[];
  confirmedAt?: number;
  updatedAt: number;
}

export interface CookingHistory {
  id?: number;
  recipeId: string;
  weekKey: WeekKey;
  cookedAt: number;
  servings: number;
}

export interface ShoppingOverride {
  checked?: boolean;
  /** true = already at home, false = force to buy (overrides pantry default). */
  inStock?: boolean;
  substituteId?: string;
  /** Free-text replacement for the quantity line. */
  editedQuantity?: string;
  hidden?: boolean;
}

export interface ManualShoppingItem {
  id: string;
  name: string;
  quantity: string;
  section: SupermarketSection;
  checked: boolean;
  createdAt: number;
}

export interface ShoppingState {
  weekKey: WeekKey;
  overrides: Record<string, ShoppingOverride>;
  manualItems: ManualShoppingItem[];
  updatedAt: number;
}

// ---------- Derived (not persisted) ----------

export interface ShoppingItem {
  /** Stable key: canonical ingredient ID for generated items, "manual:<id>" for manual items. */
  key: string;
  ingredientId?: string;
  name: string;
  section: SupermarketSection;
  /** What the recipes need, already scaled and merged, formatted. */
  required: string;
  /** Suggested purchase (packaging), formatted. Undefined when it equals `required`. */
  purchase?: string;
  /** Recipes that use this item. */
  recipes: { id: string; title: string }[];
  checked: boolean;
  inStock: boolean;
  /** inStock comes from the pantry list rather than an explicit override. */
  fromPantry: boolean;
  manual: boolean;
  /** May be hard to find at the selected store. */
  limitedHere: boolean;
  /** Other supported stores where it is not flagged as hard to find. */
  alsoAt: StoreId[];
  substitutes: { id: string; name: string }[];
  substitutedFrom?: string;
  note?: string;
  edited: boolean;
}
