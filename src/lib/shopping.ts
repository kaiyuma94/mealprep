import type { Ingredient, PackageSize, PlannedMeal, Recipe, ShoppingItem, ShoppingState, StoreId, WeekKey } from '../types';
import { SECTION_LABELS, STORE_SECTION_ORDER, STORES, storeName } from './sections';
import { baseUnitOf, convert, dimensionOf, formatQuantity, scaleAmount, toBase, type BaseUnit } from './units';
import { weekNumberLabel, weekRangeLabel } from './week';

export interface AggregatedLine {
  ingredientId: string;
  /** Totals per base unit. The first entry is in the ingredient's preferred unit. */
  totals: { unit: BaseUnit; amount: number; spoons: boolean }[];
  /** At least one recipe lists it without quantity ("to taste"). */
  toTaste: boolean;
  recipes: { id: string; title: string }[];
}

/**
 * Merges all ingredients from the planned meals, scaled to each meal's
 * servings, converting compatible units into the ingredient's preferred unit.
 */
export function aggregateIngredients(
  meals: PlannedMeal[],
  recipes: Map<string, Recipe>,
  ingredients: Map<string, Ingredient>,
): AggregatedLine[] {
  const lines = new Map<string, AggregatedLine>();
  for (const meal of meals) {
    const recipe = recipes.get(meal.recipeId);
    if (!recipe) continue; // recipe removed from catalog: skip rather than crash
    for (const ri of recipe.ingredients) {
      const ing = ingredients.get(ri.ingredientId);
      if (!ing) continue;
      let line = lines.get(ing.id);
      if (!line) {
        line = { ingredientId: ing.id, totals: [], toTaste: false, recipes: [] };
        lines.set(ing.id, line);
      }
      if (!line.recipes.some((r) => r.id === recipe.id)) line.recipes.push({ id: recipe.id, title: recipe.title });

      const amount = scaleAmount(ri.amount, recipe.baseServings, meal.servings);
      if (amount === null) {
        line.toTaste = true;
        continue;
      }
      const preferred = baseUnitOf(ing.defaultUnit);
      const converted = convert(amount, ri.unit, preferred, ing);
      const spoons = ri.unit === 'tsp' || ri.unit === 'tbsp';
      const [unit, value] = converted !== null ? [preferred, converted] : [baseUnitOf(ri.unit), toBase(amount, ri.unit).amount];
      const bucket = line.totals.find((t) => t.unit === unit);
      if (bucket) {
        bucket.amount += value;
        bucket.spoons = bucket.spoons && spoons;
      } else {
        line.totals.push({ unit, amount: value, spoons });
      }
    }
  }
  // Preferred unit first.
  for (const line of lines.values()) {
    const pref = baseUnitOf(ingredients.get(line.ingredientId)!.defaultUnit);
    line.totals.sort((a, b) => (a.unit === pref ? -1 : b.unit === pref ? 1 : 0));
  }
  return [...lines.values()];
}

export function formatRequired(line: AggregatedLine): string {
  const parts = line.totals.map((t) => formatQuantity(t.amount, t.unit, { preferSpoons: t.spoons }));
  if (parts.length === 0) return line.toTaste ? 'to taste' : '';
  return parts.join(' + ');
}

export interface PurchaseSuggestion {
  /** Number of packages, or loose pieces. */
  count: number;
  /** Set when a single package size is suggested. */
  pkg?: PackageSize;
  /** What to buy. Undefined when it says the same as the required amount (e.g. "2" onions → 2 onions). */
  label?: string;
  /** Other sensible ways to buy it: other package sizes, or loose. */
  alternatives: string[];
}

const EPS = 1e-6;
/** Upper bound per package size when combining sizes; keeps the search tiny. */
const MAX_PER_SIZE = 12;

interface BuyOption {
  label: string;
  /** Total bought, in the comparison unit. */
  total: number;
  /** Packages or pieces to pick up. */
  units: number;
  pkg?: PackageSize;
  loose?: boolean;
}

const sizeText = (p: PackageSize) => (dimensionOf(p.unit) === 'count' ? '' : ` (${formatQuantity(p.amount, p.unit)})`);
const packText = (p: PackageSize, n: number) => `${n} × ${p.label}${sizeText(p)}`;

/** Everything the recipes need, in one unit; null when the main amount can't be expressed in it. */
function needIn(line: AggregatedLine, unit: BaseUnit, ing: Ingredient): number | null {
  let need = 0;
  for (const t of line.totals) {
    const c = convert(t.amount, t.unit, unit, ing);
    if (c === null) {
      if (t === line.totals[0]) return null;
      continue;
    }
    need += c;
  }
  return need;
}

/** The mix of package sizes that covers `need` with the least left over (then: fewest packages). */
function bestPackages(sizes: { pkg: PackageSize; size: number }[], need: number): BuyOption | undefined {
  let best: { counts: number[]; total: number; units: number } | undefined;
  const counts = sizes.map(() => 0);
  const walk = (i: number, total: number, units: number) => {
    if (i === sizes.length) {
      if (units === 0 || total < need - EPS) return;
      if (!best || total < best.total - EPS || (Math.abs(total - best.total) < EPS && units < best.units)) best = { counts: [...counts], total, units };
      return;
    }
    const max = Math.min(MAX_PER_SIZE, Math.ceil(need / sizes[i].size - EPS));
    for (let n = 0; n <= max; n++) {
      counts[i] = n;
      walk(i + 1, total + n * sizes[i].size, units + n);
      if (total + n * sizes[i].size >= need - EPS) break; // more of this size only adds waste
    }
    counts[i] = 0;
  };
  walk(0, 0, 0);
  if (!best) return undefined;
  const parts = sizes.map((s, i) => [s.pkg, best!.counts[i]] as const).filter(([, n]) => n > 0);
  return {
    label: parts.map(([p, n]) => packText(p, n)).join(' + '),
    total: best.total,
    units: best.units,
    pkg: parts.length === 1 ? parts[0][0] : undefined,
  };
}

const looseName = (ing: Ingredient, n: number) => (n > 1 && ing.plural ? ing.plural : ing.name);

/**
 * Suggests what to buy for the required amount: the mix of package sizes
 * with the least left over (500 g + 1 kg rather than 3 × 500 g), or loose
 * pieces when the ingredient is also sold loose and that wastes less.
 * Other sensible options are returned as alternatives.
 */
export function suggestPurchase(line: AggregatedLine, ing: Ingredient): PurchaseSuggestion | undefined {
  const main = line.totals[0];
  if (!main || main.amount <= 0) return undefined;
  const packages = ing.packages ?? [];
  // Compare everything in the unit of the packages, or in pieces for loose-only produce.
  const unit: BaseUnit = packages.length ? baseUnitOf(packages[0].unit) : 'piece';
  const need = needIn(line, unit, ing);

  const options: BuyOption[] = [];
  let best: BuyOption | undefined;
  if (need !== null && packages.length) {
    const sizes = packages
      .map((pkg) => ({ pkg, size: convert(pkg.amount, pkg.unit, unit, ing) }))
      .filter((x): x is { pkg: PackageSize; size: number } => x.size !== null && x.size > 0);
    best = bestPackages(sizes, need);
    for (const s of sizes) {
      const n = Math.max(1, Math.ceil(need / s.size - EPS));
      options.push({ label: packText(s.pkg, n), total: n * s.size, units: n, pkg: s.pkg });
    }
  }

  // Loose: whole pieces, for produce sold per piece (or with no packages at all).
  if ((ing.soldLoose || !packages.length) && (main.unit === 'piece' || main.unit === 'clove' || ing.gramsPerCount)) {
    const pieceUnit = main.unit === 'clove' ? 'clove' : 'piece';
    const pieces = needIn(line, pieceUnit, ing);
    if (pieces !== null && pieces > 0) {
      const n = Math.ceil(pieces - EPS);
      const total = packages.length ? convert(n, pieceUnit, unit, ing) : n;
      if (total !== null) {
        const label = pieceUnit === 'clove' ? `${n} ${n > 1 ? 'tenen' : 'teen'}` : `${n} ${looseName(ing, n)}`;
        const loose: BuyOption = { label, total, units: n, loose: true };
        options.push({ ...loose, label: packages.length ? `los: ${label}` : label });
        // Loose wins when it leaves less over, or the same with fewer things to pick up.
        if (!best || total < best.total - EPS || (Math.abs(total - best.total) < EPS && n < best.units)) best = loose;
      }
    }
  }

  // Unmeasurable amounts (a pinch of nutmeg): one of the smallest package.
  if (!best && packages.length && (main.unit === 'pinch' || need === null)) {
    return { count: 1, pkg: packages[0], label: packText(packages[0], 1), alternatives: [] };
  }
  if (!best) return undefined;

  const chosen = best;
  const alternatives = options
    .filter((o) => o.label !== chosen.label && o.label !== `los: ${chosen.label}`)
    .sort((a, b) => a.total - b.total || a.units - b.units)
    .map((o) => o.label)
    .filter((l, i, all) => all.indexOf(l) === i)
    .slice(0, 3);
  // "2" uien needed → "2 uien" says nothing new.
  const sameAsRequired = chosen.loose && main.unit === 'piece' && line.totals.length === 1 && Math.abs(chosen.units - main.amount) < EPS;
  return { count: chosen.units, pkg: chosen.pkg, label: sameAsRequired ? undefined : chosen.label, alternatives };
}

export interface BuildListInput {
  weekKey: WeekKey;
  meals: PlannedMeal[];
  recipes: Map<string, Recipe>;
  ingredients: Map<string, Ingredient>;
  pantry: Set<string>;
  state?: ShoppingState;
  /** Selected supermarket; drives aisle order and availability hints. Default: Lidl. */
  store?: StoreId;
}

/**
 * Builds the shopping list. Generated items are keyed by canonical ingredient
 * ID so that overrides (checked, in stock, substitutions, edits) survive
 * regeneration when the plan changes.
 */
export function buildShoppingList(input: BuildListInput): ShoppingItem[] {
  const { meals, recipes, ingredients, pantry, state, store = 'lidl' } = input;
  const limited = (i: Ingredient) => (i.limitedAt ?? []).includes(store);
  const alsoAt = (i: Ingredient) => STORES.map((s) => s.id).filter((s) => s !== store && !(i.limitedAt ?? []).includes(s));
  const overrides = state?.overrides ?? {};
  const items: ShoppingItem[] = [];

  for (const line of aggregateIngredients(meals, recipes, ingredients)) {
    const ing = ingredients.get(line.ingredientId)!;
    const o = overrides[ing.id] ?? {};
    if (o.hidden) continue;
    const sub = o.substituteId ? ingredients.get(o.substituteId) : undefined;
    const shown = sub ?? ing;
    const required = o.editedQuantity?.trim() || formatRequired(line);
    // Package advice follows what you'll actually buy (the substitute, if chosen).
    const suggestion = o.editedQuantity ? undefined : (sub && suggestPurchase(line, sub)) || suggestPurchase(line, ing);
    const purchase = suggestion?.label;
    const fromPantry = o.inStock === undefined && pantry.has(ing.id);
    items.push({
      key: ing.id,
      ingredientId: ing.id,
      name: shown.name,
      section: shown.section,
      required,
      purchase,
      ...(suggestion?.alternatives.length ? { purchaseAlternatives: suggestion.alternatives } : {}),
      recipes: line.recipes,
      checked: !!o.checked,
      inStock: o.inStock ?? pantry.has(ing.id),
      fromPantry,
      manual: false,
      limitedHere: limited(shown),
      alsoAt: limited(shown) ? alsoAt(shown) : [],
      substitutes: (ing.substitutes ?? []).map((id) => ingredients.get(id)).filter((x): x is Ingredient => !!x).map((x) => ({ id: x.id, name: x.name })),
      substitutedFrom: sub ? ing.name : undefined,
      note: shown.note,
      edited: !!o.editedQuantity,
    });
  }

  for (const m of state?.manualItems ?? []) {
    items.push({
      key: `manual:${m.id}`,
      name: m.name,
      section: m.section,
      required: m.quantity,
      recipes: [],
      checked: m.checked,
      inStock: false,
      fromPantry: false,
      manual: true,
      limitedHere: false,
      alsoAt: [],
      substitutes: [],
      edited: false,
    });
  }

  return sortItems(items, store);
}

export function sortItems(items: ShoppingItem[], store: StoreId = 'lidl'): ShoppingItem[] {
  const order = STORE_SECTION_ORDER[store];
  return [...items].sort((a, b) => order.indexOf(a.section) - order.indexOf(b.section) || a.name.localeCompare(b.name, 'nl'));
}

export function groupBySection(items: ShoppingItem[], store: StoreId = 'lidl') {
  const groups: { section: ShoppingItem['section']; items: ShoppingItem[] }[] = [];
  for (const item of sortItems(items, store)) {
    const g = groups.find((x) => x.section === item.section);
    if (g) g.items.push(item);
    else groups.push({ section: item.section, items: [item] });
  }
  return groups;
}

const capitalise = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Plain-text version (Dutch) for pasting into WhatsApp or notes. */
export function shoppingListToText(items: ShoppingItem[], weekKey: WeekKey, store: StoreId = 'lidl'): string {
  const toBuy = items.filter((i) => !i.inStock);
  const out: string[] = [`Boodschappenlijst ${storeName(store)} – ${weekNumberLabel(weekKey)} (${weekRangeLabel(weekKey)})`];
  for (const g of groupBySection(toBuy, store)) {
    out.push('', SECTION_LABELS[g.section].label.toUpperCase());
    for (const i of g.items) {
      const qty = i.purchase ? `${i.purchase} (nodig: ${i.required})` : i.required;
      const extras = [
        i.limitedHere ? `mogelijk lastig bij ${storeName(store)}${i.alsoAt.length ? `, anders ${i.alsoAt.map(storeName).join(' of ')}` : ''}` : '',
        i.substitutedFrom ? `in plaats van ${i.substitutedFrom}` : '',
      ]
        .filter(Boolean)
        .join('; ');
      out.push(`${i.checked ? '✓' : '-'} ${capitalise(i.name)}${qty ? `: ${qty}` : ''}${extras ? ` – ${extras}` : ''}`);
    }
  }
  const stocked = items.filter((i) => i.inStock);
  if (stocked.length) out.push('', `Al in huis: ${stocked.map((i) => i.name).join(', ')}`);
  return out.join('\n');
}
