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
  count: number;
  pkg?: PackageSize;
  label: string;
}

/**
 * Suggests what to buy given the required amount: the package size that
 * leaves the least waste, or whole pieces for loose produce.
 */
export function suggestPurchase(line: AggregatedLine, ing: Ingredient): PurchaseSuggestion | undefined {
  const main = line.totals[0];
  if (!main || main.amount <= 0) return undefined;

  if (ing.packages?.length) {
    let best: { n: number; waste: number; pkg: PackageSize } | undefined;
    for (const pkg of ing.packages) {
      const pkgBase = toBase(pkg.amount, pkg.unit);
      // Include all buckets that can be expressed in the package unit.
      let need = 0;
      let ok = true;
      for (const t of line.totals) {
        const c = convert(t.amount, t.unit, pkgBase.unit, ing);
        if (c === null) {
          if (t === main) ok = false;
          continue;
        }
        need += c;
      }
      if (!ok) continue;
      const n = Math.max(1, Math.ceil(need / pkgBase.amount - 1e-6));
      const waste = n * pkgBase.amount - need;
      if (!best || waste < best.waste - 1e-6 || (Math.abs(waste - best.waste) < 1e-6 && n < best.n)) best = { n, waste, pkg };
    }
    // Unmeasurable amounts (a pinch of nutmeg): suggest one of the smallest package.
    if (!best && (main.unit === 'pinch' || line.totals.every((t) => convert(t.amount, t.unit, baseUnitOf(ing.packages![0].unit), ing) === null))) {
      best = { n: 1, waste: 0, pkg: ing.packages[0] };
    }
    if (best) {
      // Count packages ("pack of 8") already describe their size.
      const size = dimensionOf(best.pkg.unit) === 'count' ? '' : ` (${formatQuantity(best.pkg.amount, best.pkg.unit)})`;
      return { count: best.n, pkg: best.pkg, label: `${best.n} × ${best.pkg.label}${size}` };
    }
  }

  // Loose items sold per piece: round up to whole pieces.
  if (main.unit === 'piece' || main.unit === 'clove') {
    const n = Math.ceil(main.amount - 1e-6);
    if (Math.abs(n - main.amount) > 1e-6) {
      const name = n > 1 && ing.plural ? ing.plural : ing.name;
      return { count: n, label: `${n} ${main.unit === 'clove' ? (n > 1 ? 'tenen' : 'teen') : name}`.trim() };
    }
  }
  return undefined;
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
    const purchase = o.editedQuantity ? undefined : suggestPurchase(line, ing)?.label;
    const fromPantry = o.inStock === undefined && pantry.has(ing.id);
    items.push({
      key: ing.id,
      ingredientId: ing.id,
      name: shown.name,
      section: shown.section,
      required,
      purchase,
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
