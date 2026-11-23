import type { Dimension, Ingredient, Unit } from '../types';

/** Factor to the base unit of each dimension (g for mass, ml for volume). */
const TO_BASE: Partial<Record<Unit, number>> = { g: 1, kg: 1000, ml: 1, l: 1000, tsp: 5, tbsp: 15 };

export function dimensionOf(unit: Unit): Dimension {
  if (unit === 'g' || unit === 'kg') return 'mass';
  if (unit === 'ml' || unit === 'l' || unit === 'tsp' || unit === 'tbsp') return 'volume';
  return 'count';
}

/** A merge bucket: mass and volume share a base unit; each count unit is its own bucket. */
export type BaseUnit = 'g' | 'ml' | Exclude<Unit, 'g' | 'kg' | 'ml' | 'l' | 'tsp' | 'tbsp'>;

export function baseUnitOf(unit: Unit): BaseUnit {
  const d = dimensionOf(unit);
  if (d === 'mass') return 'g';
  if (d === 'volume') return 'ml';
  return unit as BaseUnit;
}

export function toBase(amount: number, unit: Unit): { amount: number; unit: BaseUnit } {
  const f = TO_BASE[unit];
  return { amount: f ? amount * f : amount, unit: baseUnitOf(unit) };
}

/**
 * Converts an amount to the target base unit using the ingredient's physical
 * properties. Returns null when the conversion is not possible.
 */
export function convert(amount: number, from: Unit, to: BaseUnit, ingredient?: Ingredient): number | null {
  const src = toBase(amount, from);
  if (src.unit === to) return src.amount;
  const density = ingredient?.densityGPerMl;
  const gpc = ingredient?.gramsPerCount;
  const countUnit = ingredient ? baseUnitOf(ingredient.defaultUnit) : undefined;
  const isCount = (u: BaseUnit) => u !== 'g' && u !== 'ml';

  // to grams
  let grams: number | null = null;
  if (src.unit === 'g') grams = src.amount;
  else if (src.unit === 'ml' && density) grams = src.amount * density;
  else if (isCount(src.unit) && gpc && (src.unit === countUnit || src.unit === 'piece')) grams = src.amount * gpc;
  if (grams === null) return null;

  if (to === 'g') return grams;
  if (to === 'ml') return density ? grams / density : null;
  if (gpc && (to === countUnit || to === 'piece')) return grams / gpc;
  return null;
}

export function scaleAmount(amount: number | null, fromServings: number, toServings: number): number | null {
  if (amount === null) return null;
  if (fromServings <= 0) return amount;
  return (amount * toServings) / fromServings;
}

// ---------- Formatting ----------

const FRACTIONS: [number, string][] = [
  [0.25, '¼'], [1 / 3, '⅓'], [0.5, '½'], [2 / 3, '⅔'], [0.75, '¾'],
];

/** Formats with unicode fractions for small, human-measured amounts (e.g. "1½"). */
export function formatFraction(n: number): string {
  const whole = Math.floor(n + 1e-9);
  const rest = n - whole;
  if (rest < 0.08) return String(whole || (n > 0 ? '¼' : '0'));
  if (rest > 0.92) return String(whole + 1);
  let best = FRACTIONS[0];
  for (const f of FRACTIONS) if (Math.abs(f[0] - rest) < Math.abs(best[0] - rest)) best = f;
  return whole > 0 ? `${whole}${best[1]}` : best[1];
}

function roundNice(n: number): number {
  if (n >= 1000) return Math.round(n / 10) * 10;
  if (n >= 100) return Math.round(n / 5) * 5;
  if (n >= 10) return Math.round(n);
  return Math.round(n * 10) / 10;
}

/** Dutch number formatting: decimal comma. */
function trimNumber(n: number): string {
  return (Number.isInteger(n) ? String(n) : n.toFixed(1).replace(/\.0$/, '')).replace('.', ',');
}

/** Dutch display names for units (internal codes stay English). */
export const UNIT_LABELS: Record<string, [string, string]> = {
  piece: ['', ''],
  clove: ['teen', 'tenen'],
  bunch: ['bosje', 'bosjes'],
  pinch: ['snufje', 'snufjes'],
  can: ['blik', 'blikken'],
  pack: ['pak', 'pakken'],
  jar: ['pot', 'potten'],
  tsp: ['tl', 'tl'],
  tbsp: ['el', 'el'],
};

/**
 * Formats a quantity for display. Spoon units are kept for small volumes,
 * grams and millilitres switch to kg / l above 1000.
 */
export function formatQuantity(amount: number | null, unit: Unit, opts: { preferSpoons?: boolean } = {}): string {
  if (amount === null) return 'naar smaak';
  const d = dimensionOf(unit);
  if (d === 'mass') {
    const g = toBase(amount, unit).amount;
    return g >= 1000 ? `${trimNumber(Math.round(g / 100) / 10)} kg` : `${trimNumber(roundNice(g))} g`;
  }
  if (d === 'volume') {
    if (unit === 'tsp' || unit === 'tbsp') return `${formatFraction(amount)} ${UNIT_LABELS[unit][0]}`;
    const ml = toBase(amount, unit).amount;
    if (opts.preferSpoons && ml < 60) {
      if (ml >= 15) return `${formatFraction(Math.round((ml / 15) * 2) / 2)} el`;
      return `${formatFraction(Math.max(0.25, Math.round((ml / 5) * 4) / 4))} tl`;
    }
    return ml >= 1000 ? `${trimNumber(Math.round(ml / 100) / 10)} l` : `${trimNumber(roundNice(ml))} ml`;
  }
  const [one, many] = UNIT_LABELS[unit] ?? [unit, unit];
  const n = formatFraction(amount);
  const label = amount > 1 ? many : one;
  return label ? `${n} ${label}` : n;
}

/** Formats ingredient name with quantity, using the plural for count units. */
export function ingredientLabel(ingredient: Ingredient, amount: number | null, unit: Unit): string {
  if (amount !== null && unit === 'piece' && amount > 1 && ingredient.plural) return ingredient.plural;
  return ingredient.name;
}
