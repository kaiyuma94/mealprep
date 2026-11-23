import type { Ingredient, Recipe, SupermarketSection, Unit } from '../types';
import { RECIPE_SCHEMA_VERSION } from '../types';

export const UNITS: readonly Unit[] = ['g', 'kg', 'ml', 'l', 'tsp', 'tbsp', 'piece', 'clove', 'bunch', 'pinch', 'can', 'pack', 'jar'];

export const SECTIONS: readonly SupermarketSection[] = [
  'produce', 'herbs', 'bakery', 'dairy-eggs', 'chilled', 'pasta-rice-grains', 'canned-jarred',
  'world-foods', 'oils-sauces', 'spices', 'nuts-dried', 'baking', 'frozen', 'other',
];

export interface ValidationIssue {
  recipeId: string;
  path: string;
  message: string;
  severity: 'error' | 'warning';
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isNonEmptyString = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0;
const isNonNegNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0;
const ID_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function validateIngredientCatalog(raw: unknown): { ingredients: Ingredient[]; issues: ValidationIssue[] } {
  const issues: ValidationIssue[] = [];
  const ingredients: Ingredient[] = [];
  if (!Array.isArray(raw)) {
    return { ingredients, issues: [{ recipeId: '-', path: 'ingredients', message: 'Ingredient catalog must be an array', severity: 'error' }] };
  }
  const seen = new Set<string>();
  raw.forEach((item, i) => {
    const path = `ingredients[${i}]`;
    const err = (message: string) => issues.push({ recipeId: '-', path, message, severity: 'error' });
    if (!isObj(item)) return err('not an object');
    if (!isNonEmptyString(item.id) || !ID_RE.test(item.id)) return err(`invalid id "${String(item.id)}"`);
    if (seen.has(item.id)) return err(`duplicate id "${item.id}"`);
    if (!isNonEmptyString(item.name)) return err(`${item.id}: missing name`);
    if (!SECTIONS.includes(item.section as SupermarketSection)) return err(`${item.id}: unknown section "${String(item.section)}"`);
    if (item.limitedAt !== undefined && !(Array.isArray(item.limitedAt) && item.limitedAt.every((s) => ['lidl', 'ah', 'jumbo'].includes(s as string)))) {
      return err(`${item.id}: limitedAt must list lidl | ah | jumbo`);
    }
    if (!UNITS.includes(item.defaultUnit as Unit)) return err(`${item.id}: unknown defaultUnit "${String(item.defaultUnit)}"`);
    if (item.packages !== undefined) {
      if (!Array.isArray(item.packages)) return err(`${item.id}: packages must be an array`);
      for (const p of item.packages) {
        if (!isObj(p) || !isNonNegNumber(p.amount) || p.amount === 0 || !UNITS.includes(p.unit as Unit) || !isNonEmptyString(p.label)) {
          return err(`${item.id}: invalid package ${JSON.stringify(p)}`);
        }
      }
    }
    seen.add(item.id);
    ingredients.push(item as unknown as Ingredient);
  });
  // substitutes must reference known ingredients
  for (const ing of ingredients) {
    for (const s of ing.substitutes ?? []) {
      if (!seen.has(s)) issues.push({ recipeId: '-', path: `ingredients.${ing.id}.substitutes`, message: `unknown substitute "${s}"`, severity: 'warning' });
    }
  }
  return { ingredients, issues };
}

/**
 * Validates a single recipe. Returns the list of issues; a recipe with any
 * `error` issue must not be shown in the app.
 */
export function validateRecipe(raw: unknown, ingredientIds: Set<string>, index = 0): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const id = isObj(raw) && isNonEmptyString(raw.id) ? raw.id : `#${index}`;
  const err = (path: string, message: string) => issues.push({ recipeId: id, path, message, severity: 'error' });
  const warn = (path: string, message: string) => issues.push({ recipeId: id, path, message, severity: 'warning' });

  if (!isObj(raw)) {
    err('', 'recipe is not an object');
    return issues;
  }
  const r = raw;
  if (!isNonEmptyString(r.id) || !ID_RE.test(r.id)) err('id', 'id must be kebab-case');
  if (r.schemaVersion !== RECIPE_SCHEMA_VERSION) err('schemaVersion', `expected schemaVersion ${RECIPE_SCHEMA_VERSION}, got ${String(r.schemaVersion)}`);
  if (!isNonEmptyString(r.title)) err('title', 'missing title');
  if (!isNonEmptyString(r.description)) warn('description', 'missing description');
  if (!isNonEmptyString(r.cuisine)) err('cuisine', 'missing cuisine');
  if (!Array.isArray(r.tags) || !r.tags.every(isNonEmptyString)) err('tags', 'tags must be an array of strings');
  if (!isNonNegNumber(r.prepMinutes)) err('prepMinutes', 'prepMinutes must be a non-negative number');
  if (!isNonNegNumber(r.cookMinutes)) err('cookMinutes', 'cookMinutes must be a non-negative number');
  if (!['easy', 'medium', 'hard'].includes(r.difficulty as string)) err('difficulty', 'difficulty must be easy | medium | hard');
  if (!isNonNegNumber(r.baseServings) || (r.baseServings as number) < 1) err('baseServings', 'baseServings must be ≥ 1');

  if (!Array.isArray(r.ingredients) || r.ingredients.length === 0) {
    err('ingredients', 'recipe has no ingredients');
  } else {
    r.ingredients.forEach((ri, i) => {
      const p = `ingredients[${i}]`;
      if (!isObj(ri)) return err(p, 'not an object');
      if (!isNonEmptyString(ri.ingredientId)) return err(p, 'missing ingredientId');
      if (!ingredientIds.has(ri.ingredientId)) err(p, `unknown ingredient "${ri.ingredientId}"`);
      if (!(ri.amount === null || (isNonNegNumber(ri.amount) && ri.amount > 0))) err(p, `invalid amount ${JSON.stringify(ri.amount)}`);
      if (!UNITS.includes(ri.unit as Unit)) err(p, `unknown unit "${String(ri.unit)}"`);
    });
  }

  if (!Array.isArray(r.steps) || r.steps.length === 0) {
    err('steps', 'recipe has no cooking steps');
  } else {
    r.steps.forEach((s, i) => {
      if (!isObj(s) || !isNonEmptyString(s.text)) err(`steps[${i}]`, 'step text missing');
      else if (s.timerMinutes !== undefined && !(isNonNegNumber(s.timerMinutes) && s.timerMinutes > 0)) err(`steps[${i}].timerMinutes`, 'invalid timer');
    });
  }

  if (!isObj(r.source) || !isNonEmptyString(r.source.name) || !['inspired', 'original', 'licensed', 'personal'].includes(r.source.type as string)) {
    err('source', 'source must have a type (inspired | original | licensed | personal) and a name');
  } else if (r.source.type === 'licensed' && !isNonEmptyString(r.source.license)) {
    err('source.license', 'licensed recipes must state their license');
  } else if (r.source.type === 'inspired' && !(isNonEmptyString(r.source.url) && /^https:\/\//.test(r.source.url))) {
    err('source.url', 'inspired recipes must link to the recipe that inspired them');
  }

  if (r.image !== undefined) {
    const img = r.image;
    if (!isObj(img) || !isNonEmptyString(img.url) || !isNonEmptyString(img.license) || !isNonEmptyString(img.credit) || !isNonEmptyString(img.alt)) {
      err('image', 'images need url, alt, credit and license');
    }
  }
  return issues;
}

export interface CatalogValidationResult {
  recipes: Recipe[];
  issues: ValidationIssue[];
}

/** Validates the full recipe catalog, dropping invalid or duplicate recipes. */
export function validateRecipeCatalog(raw: unknown, ingredients: Ingredient[]): CatalogValidationResult {
  const ids = new Set(ingredients.map((i) => i.id));
  const list = isObj(raw) && Array.isArray(raw.recipes) ? raw.recipes : Array.isArray(raw) ? raw : null;
  if (!list) {
    return { recipes: [], issues: [{ recipeId: '-', path: 'recipes', message: 'catalog must contain a "recipes" array', severity: 'error' }] };
  }
  const issues: ValidationIssue[] = [];
  const recipes: Recipe[] = [];
  const seen = new Set<string>();
  list.forEach((r, i) => {
    const ri = validateRecipe(r, ids, i);
    issues.push(...ri);
    if (ri.some((x) => x.severity === 'error')) return;
    const recipe = r as Recipe;
    if (seen.has(recipe.id)) {
      issues.push({ recipeId: recipe.id, path: 'id', message: 'duplicate recipe id', severity: 'error' });
      return;
    }
    seen.add(recipe.id);
    recipes.push(recipe);
  });
  return { recipes, issues };
}
