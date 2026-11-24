/**
 * Converts recipes in the human-friendly import format (ingredient names,
 * free-form units) into catalog recipes with canonical ingredient IDs.
 * Pure functions, used by scripts/import-recipes.ts and, for the line parser,
 * by the in-app recipe form (src/lib/customRecipe.ts).
 */
import type { CookingStep, Difficulty, Ingredient, Recipe, RecipeIngredient, RecipeSource, Unit } from '../types';
import { RECIPE_SCHEMA_VERSION } from '../types';
import { fold } from './search';
import { UNITS, validateRecipe, type ValidationIssue } from './validation';

export interface ImportIngredient {
  /** Either a canonical ID… */
  ingredientId?: string;
  /** …or a name/alias in English or Dutch. */
  name?: string;
  amount: number | null;
  unit: string;
  note?: string;
  optional?: boolean;
}

export interface ImportRecipe {
  id?: string;
  title: string;
  subtitle?: string;
  description?: string;
  cuisine: string;
  tags?: string[];
  prepMinutes: number;
  cookMinutes: number;
  difficulty?: Difficulty;
  servings?: number;
  /** Objects, or plain lines such as "2 tenen knoflook, fijngehakt" or "naar smaak zout". */
  ingredients: (ImportIngredient | string)[];
  steps: (string | CookingStep)[];
  source?: RecipeSource;
  /** Shortcut: link to the recipe this one is based on; merged into the file-level source. */
  sourceUrl?: string;
  /** Shortcut: how this version differs from the original (e.g. "Vega-versie: … vervangen door …"); merged into the source. */
  adaptation?: string;
  image?: Recipe['image'];
  palette?: [string, string];
  /** Cover shape, when the one worked out from the name doesn't fit. */
  dish?: Recipe['dish'];
}

export interface ImportFile {
  format: 'weekmenu-recipe-import';
  /** Default source applied to recipes that don't specify one. */
  source?: RecipeSource;
  recipes: ImportRecipe[];
}

const UNIT_ALIASES: Record<string, Unit> = {
  g: 'g', gr: 'g', gram: 'g', grams: 'g', gramm: 'g',
  kg: 'kg', kilo: 'kg', kilogram: 'kg',
  ml: 'ml', milliliter: 'ml', millilitre: 'ml',
  l: 'l', liter: 'l', litre: 'l',
  tsp: 'tsp', teaspoon: 'tsp', teaspoons: 'tsp', tl: 'tsp', theelepel: 'tsp', theelepels: 'tsp',
  tbsp: 'tbsp', tablespoon: 'tbsp', tablespoons: 'tbsp', el: 'tbsp', eetlepel: 'tbsp', eetlepels: 'tbsp',
  piece: 'piece', pieces: 'piece', pc: 'piece', pcs: 'piece', stuk: 'piece', stuks: 'piece', 'stuk(s)': 'piece', '': 'piece',
  clove: 'clove', cloves: 'clove', teen: 'clove', tenen: 'clove', teentje: 'clove', teentjes: 'clove',
  bunch: 'bunch', bos: 'bunch', bosje: 'bunch', bosjes: 'bunch',
  pinch: 'pinch', snufje: 'pinch', snufjes: 'pinch', snuf: 'pinch', mespunt: 'pinch',
  can: 'can', tin: 'can', blik: 'can', blikken: 'can', blikje: 'can',
  pack: 'pack', pak: 'pack', pakken: 'pack', pakje: 'pack', zakje: 'pack', zakjes: 'pack', rol: 'pack',
  jar: 'jar', pot: 'jar', potten: 'jar', potje: 'jar',
};

export function normaliseUnit(u: string): Unit | null {
  const k = fold(u.trim()).replace(/\.$/, '');
  if ((UNITS as readonly string[]).includes(k)) return k as Unit;
  return UNIT_ALIASES[k] ?? null;
}

const FRACTION_CHARS: Record<string, number> = { '½': 0.5, '¼': 0.25, '¾': 0.75, '⅓': 1 / 3, '⅔': 2 / 3 };

function parseAmount(s: string): number | null {
  const t = s.replace(',', '.');
  const m = /^(\d*)([½¼¾⅓⅔])$/.exec(t);
  if (m) return (m[1] ? Number(m[1]) : 0) + FRACTION_CHARS[m[2]];
  const f = /^(\d+)\/(\d+)$/.exec(t);
  if (f) return Number(f[1]) / Number(f[2]);
  const n = Number(t);
  return Number.isFinite(n) && t !== '' ? n : null;
}

/**
 * Parses a plain ingredient line (Dutch or English), e.g.
 * "300 g bloemkool, in roosjes", "2 tenen knoflook", "½ limoen", "naar smaak zout",
 * "1 rode peper (optioneel)". The unit is optional; the ingredient's own unit is used then.
 */
export function parseIngredientLine(line: string): ImportIngredient & { unitGiven: boolean } {
  let rest = line.trim();
  const optional = /\((optioneel|optional)\)/i.test(rest);
  rest = rest.replace(/\s*\((optioneel|optional)\)\s*/i, ' ').trim();
  let note: string | undefined;
  // A note follows ", " — a comma without a space is a decimal separator ("1,5 el").
  const comma = rest.search(/,\s/);
  if (comma > -1) {
    note = rest.slice(comma + 1).trim() || undefined;
    rest = rest.slice(0, comma).trim();
  }
  const toTaste = /^(naar smaak|to taste)\s+/i;
  if (toTaste.test(rest)) {
    return { name: rest.replace(toTaste, ''), amount: null, unit: '', note, optional, unitGiven: false };
  }
  const [first, ...tokens] = rest.split(/\s+/);
  const amount = parseAmount(first);
  if (amount === null) return { name: rest, amount: null, unit: '', note, optional, unitGiven: false };
  if (tokens.length > 1 && normaliseUnit(tokens[0]) && tokens[0] !== '') {
    return { name: tokens.slice(1).join(' '), amount, unit: tokens[0], note, optional, unitGiven: true };
  }
  return { name: tokens.join(' '), amount, unit: '', note, optional, unitGiven: false };
}

export function buildIngredientLookup(ingredients: Ingredient[]): Map<string, string> {
  const m = new Map<string, string>();
  for (const i of ingredients) {
    for (const n of [i.id, i.name, i.plural, ...(i.aliases ?? [])]) if (n) m.set(fold(n), i.id);
  }
  return m;
}

export const slugify = (s: string) =>
  fold(s)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);

export interface ImportResult {
  recipes: Recipe[];
  issues: ValidationIssue[];
  unknownIngredients: string[];
}

export function convertImport(file: unknown, ingredients: Ingredient[]): ImportResult {
  const issues: ValidationIssue[] = [];
  const unknown = new Set<string>();
  const f = file as Partial<ImportFile>;
  if (!f || f.format !== 'weekmenu-recipe-import' || !Array.isArray(f.recipes)) {
    return { recipes: [], issues: [{ recipeId: '-', path: '', message: 'file must have format "weekmenu-recipe-import" and a recipes array', severity: 'error' }], unknownIngredients: [] };
  }
  const lookup = buildIngredientLookup(ingredients);
  const ids = new Set(ingredients.map((i) => i.id));
  const recipes: Recipe[] = [];

  f.recipes.forEach((r, idx) => {
    const id = r?.id || (r?.title ? slugify(r.title) : `import-${idx}`);
    const ings: RecipeIngredient[] = [];
    for (const [i, raw] of (r?.ingredients ?? []).entries()) {
      const ri = typeof raw === 'string' ? parseIngredientLine(raw) : raw;
      const key = ri.ingredientId ?? ri.name ?? '';
      const canonical = ri.ingredientId && ids.has(ri.ingredientId) ? ri.ingredientId : lookup.get(fold(key));
      const known = canonical ? ingredients.find((x) => x.id === canonical) : undefined;
      // No unit given: use the ingredient's own count unit (e.g. "2 knoflook" → cloves), else pieces.
      const unitText = String(ri.unit ?? '');
      const unit =
        unitText === '' && known
          ? ri.amount === null || ['piece', 'clove', 'pinch', 'pack', 'bunch'].includes(known.defaultUnit)
            ? known.defaultUnit
            : 'piece'
          : normaliseUnit(unitText);
      if (!canonical) {
        unknown.add(key);
        issues.push({ recipeId: id, path: `ingredients[${i}]`, message: `no canonical ingredient for "${key}" — add it (or an alias) to src/data/ingredients.json`, severity: 'error' });
        continue;
      }
      if (!unit) {
        issues.push({ recipeId: id, path: `ingredients[${i}]`, message: `unknown unit "${ri.unit}"`, severity: 'error' });
        continue;
      }
      ings.push({ ingredientId: canonical, amount: ri.amount ?? null, unit, ...(ri.note ? { note: ri.note } : {}), ...(ri.optional ? { optional: true } : {}) });
    }
    const recipe: Recipe = {
      id,
      schemaVersion: RECIPE_SCHEMA_VERSION,
      title: r?.title,
      subtitle: r?.subtitle,
      description: r?.description ?? '',
      cuisine: r?.cuisine,
      tags: r?.tags ?? [],
      prepMinutes: r?.prepMinutes,
      cookMinutes: r?.cookMinutes,
      difficulty: r?.difficulty ?? 'easy',
      baseServings: r?.servings ?? 2,
      ingredients: ings,
      steps: (r?.steps ?? []).map((s) => (typeof s === 'string' ? { text: s } : s)),
      source: r?.source ?? { ...f.source!, ...(r?.sourceUrl ? { url: r.sourceUrl } : {}), ...(r?.adaptation ? { adaptation: r.adaptation } : {}) },
      ...(r?.image ? { image: r.image } : {}),
      ...(r?.palette ? { palette: r.palette } : {}),
      ...(r?.dish ? { dish: r.dish } : {}),
    } as Recipe;
    const v = validateRecipe(recipe, ids, idx);
    issues.push(...v);
    const hasError = v.some((x) => x.severity === 'error') || issues.some((x) => x.recipeId === id && x.severity === 'error');
    if (!hasError) recipes.push(recipe);
  });

  return { recipes, issues, unknownIngredients: [...unknown] };
}
