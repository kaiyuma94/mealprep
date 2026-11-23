/**
 * Turns what the user types in the recipe form into a normal Recipe, so their
 * own recipes work everywhere: suggestions, week, shopping list, cooking mode.
 * Pure functions, no React or IndexedDB.
 */
import type { CustomRecipeRecord, DishShape, Ingredient, IngredientLineDraft, Recipe, RecipeIngredient, Unit } from '../types';
import { RECIPE_SCHEMA_VERSION } from '../types';
import { guessDishShape } from './dish';
import { buildIngredientLookup, normaliseUnit, parseIngredientLine, slugify } from './importer';
import { fold } from './search';

export const CUSTOM_PREFIX = 'eigen-';
export const CUSTOM_SOURCE_NAME = 'Zelf toegevoegd';
export const CUSTOM_TAG = 'eigen recept';
export const DEFAULT_CUISINE = 'Eigen keuken';

/** Cover colours to pick from: [plate/main colour, accent]. */
export const PALETTES: [string, string][] = [
  ['#c8442f', '#f0d9a8'],
  ['#e0a526', '#5b7f4a'],
  ['#6f9a52', '#f1efe6'],
  ['#8a5a2b', '#a9c46c'],
  ['#e8a33d', '#f2e6cf'],
  ['#6b3f6e', '#d9a35a'],
  ['#3f6e8a', '#e9d8a6'],
  ['#9c3d22', '#e0b14a'],
];

export const isCustomRecipe = (r: Pick<Recipe, 'source'>) => r.source.type === 'personal';

/** A stable default colour for a title, so the preview doesn't jump while typing. */
export function paletteFor(title: string): [string, string] {
  let h = 0;
  for (const ch of fold(title.trim())) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return PALETTES[h % PALETTES.length];
}

// ---------- Ingredient lines ----------

export interface ParsedLine {
  text: string;
  amount: number | null;
  unit: Unit;
  /** Name as typed, without amount, unit and note. */
  name: string;
  note?: string;
  optional?: boolean;
  /** Catalogue ingredient it was matched to, if any. */
  match?: Ingredient;
  /** Matched on part of the name (e.g. "verse spinazie" → spinazie), worth showing. */
  partial?: boolean;
  /** The line can't be used (e.g. empty name). */
  error?: string;
}

export type IngredientLookup = { byName: Map<string, string>; byId: Map<string, Ingredient> };

export function ingredientLookup(ingredients: Ingredient[]): IngredientLookup {
  return { byName: buildIngredientLookup(ingredients), byId: new Map(ingredients.map((i) => [i.id, i])) };
}

/**
 * Finds the catalogue ingredient for a typed name: the whole name first, then
 * without leading words ("verse spinazie" → "spinazie"), since Dutch puts
 * adjectives in front.
 */
export function matchIngredient(name: string, lookup: IngredientLookup): { ingredient: Ingredient; partial: boolean } | undefined {
  const words = fold(name).trim().split(/\s+/).filter(Boolean);
  for (let start = 0; start < words.length; start++) {
    const id = lookup.byName.get(words.slice(start).join(' '));
    const ingredient = id ? lookup.byId.get(id) : undefined;
    if (ingredient) return { ingredient, partial: start > 0 };
  }
  return undefined;
}

export function parseLine(draft: IngredientLineDraft, lookup: IngredientLookup): ParsedLine {
  const p = parseIngredientLine(draft.text);
  // "200 g" has no ingredient: the parser would read the unit as the name.
  const name = (p.name ?? '').trim() && !(p.amount !== null && normaliseUnit(p.name ?? '')) ? (p.name ?? '').trim() : '';
  const found = draft.custom ? undefined : matchIngredient(name, lookup);
  const given = p.unitGiven ? normaliseUnit(p.unit) : null;
  const known = found?.ingredient;
  // Same rule as the importer: without a unit use the ingredient's own count unit, else pieces.
  const unit: Unit =
    given ?? (known && (p.amount === null || ['piece', 'clove', 'pinch', 'pack', 'bunch'].includes(known.defaultUnit)) ? known.defaultUnit : 'piece');
  return {
    text: draft.text,
    amount: p.amount && p.amount > 0 ? p.amount : null,
    unit,
    name,
    ...(p.note ? { note: p.note } : {}),
    ...(p.optional ? { optional: true } : {}),
    ...(known ? { match: known, partial: found!.partial } : {}),
    ...(name ? {} : { error: 'Welk ingrediënt? Zet de naam erachter, bijv. “200 g champignons”' }),
  };
}

/** The user's own ingredient for a name the catalogue doesn't know. It lands under "Overig" on the shopping list. */
export function customIngredient(name: string, unit: Unit): Ingredient {
  const clean = name.trim().toLowerCase();
  return { id: `${CUSTOM_PREFIX}${slugify(clean) || 'ingredient'}`, name: clean, section: 'other', defaultUnit: unit };
}

// ---------- The form ----------

export interface RecipeForm {
  /** Set when editing an existing recipe. */
  id?: string;
  title: string;
  ingredients: IngredientLineDraft[];
  steps: string[];
  servings: number;
  minutes: number;
  cuisine: string;
  /** null = choose automatically from the name and ingredients. */
  dish: DishShape | null;
  /** null = colour picked from the name. */
  palette: [string, string] | null;
}

export const emptyForm = (servings = 2): RecipeForm => ({
  title: '',
  ingredients: [],
  steps: [''],
  servings,
  minutes: 30,
  cuisine: DEFAULT_CUISINE,
  dish: null,
  palette: null,
});

export interface FormProblem {
  field: 'title' | 'ingredients' | 'steps';
  message: string;
}

export function formProblems(form: RecipeForm, lookup: IngredientLookup): FormProblem[] {
  const problems: FormProblem[] = [];
  if (!form.title.trim()) problems.push({ field: 'title', message: 'Geef het recept een naam' });
  const lines = form.ingredients.map((d) => parseLine(d, lookup));
  if (lines.filter((l) => !l.error).length === 0) problems.push({ field: 'ingredients', message: 'Voeg minstens één ingrediënt toe' });
  if (!form.steps.some((s) => s.trim())) problems.push({ field: 'steps', message: 'Schrijf minstens één stap' });
  return problems;
}

/** The cover shape the form will use: the user's choice, or a guess from name and ingredients. */
export function formDish(form: RecipeForm, lookup: IngredientLookup): DishShape {
  if (form.dish) return form.dish;
  const ids = form.ingredients.map((d) => parseLine(d, lookup).match?.id).filter((x): x is string => !!x);
  return guessDishShape(form.title, ids);
}

/** A free id like "eigen-pasta-pesto", or "eigen-pasta-pesto-2" when taken. */
export function newRecipeId(title: string, taken: (id: string) => boolean): string {
  const base = `${CUSTOM_PREFIX}${slugify(title) || 'recept'}`;
  let id = base;
  for (let n = 2; taken(id); n++) id = `${base}-${n}`;
  return id;
}

/** Builds the stored record. Throws when the form has problems (check formProblems first). */
export function buildCustomRecipe(
  form: RecipeForm,
  catalog: Ingredient[],
  opts: { taken: (id: string) => boolean; now?: number; createdAt?: number },
): CustomRecipeRecord {
  const lookup = ingredientLookup(catalog);
  const problems = formProblems(form, lookup);
  if (problems.length) throw new Error(problems.map((p) => p.message).join('; '));
  const now = opts.now ?? Date.now();
  const extra = new Map<string, Ingredient>();
  const ingredients: RecipeIngredient[] = [];
  const kept: IngredientLineDraft[] = [];
  for (const draft of form.ingredients) {
    const line = parseLine(draft, lookup);
    if (line.error) continue;
    kept.push(draft.custom ? { text: draft.text.trim(), custom: true } : { text: draft.text.trim() });
    let ingredientId = line.match?.id;
    if (!ingredientId) {
      const own = extra.get(customIngredient(line.name, line.unit).id) ?? customIngredient(line.name, line.unit);
      extra.set(own.id, own);
      ingredientId = own.id;
    }
    ingredients.push({
      ingredientId,
      amount: line.amount,
      unit: line.unit,
      ...(line.note ? { note: line.note } : {}),
      ...(line.optional ? { optional: true } : {}),
    });
  }
  const id = form.id ?? newRecipeId(form.title, opts.taken);
  const minutes = Math.max(1, Math.round(form.minutes || 30));
  const recipe: Recipe = {
    id,
    schemaVersion: RECIPE_SCHEMA_VERSION,
    title: form.title.trim(),
    description: '',
    cuisine: form.cuisine.trim() || DEFAULT_CUISINE,
    tags: [CUSTOM_TAG],
    prepMinutes: minutes,
    cookMinutes: 0,
    difficulty: 'easy',
    baseServings: Math.min(12, Math.max(1, Math.round(form.servings || 2))),
    ingredients,
    steps: form.steps.map((s) => s.trim()).filter(Boolean).map((text) => ({ text })),
    source: { type: 'personal', name: CUSTOM_SOURCE_NAME },
    palette: form.palette ?? paletteFor(form.title),
    dish: formDish(form, lookup),
  };
  return { id, recipe, extraIngredients: [...extra.values()], ingredientLines: kept, createdAt: opts.createdAt ?? now, updatedAt: now };
}

/** Back from a stored record to the form, for editing. */
export function recordToForm(record: CustomRecipeRecord): RecipeForm {
  const r = record.recipe;
  return {
    id: r.id,
    title: r.title,
    ingredients: record.ingredientLines.map((l) => ({ ...l })),
    steps: r.steps.map((s) => s.text),
    servings: r.baseServings,
    minutes: r.prepMinutes + r.cookMinutes,
    cuisine: r.cuisine,
    // A shape or colour that matches the automatic choice stays automatic, so it follows a new name.
    dish: !r.dish || r.dish === guessDishShape(r.title, r.ingredients.map((i) => i.ingredientId)) ? null : r.dish,
    palette: !r.palette || r.palette.join() === paletteFor(r.title).join() ? null : r.palette,
  };
}
