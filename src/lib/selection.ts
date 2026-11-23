import type { CookingHistory, Recipe, SelectionSlot, SuggestionBucket, WeekKey, WeeklyMealPlan, WeeklySelection } from '../types';
import { addWeeks, compareWeeks } from './week';

export const SELECTION_SIZE = 12;
export const BUCKET_SIZE = 4;
/** Recipes cooked or planned within this many weeks before the target week are held back. */
export const RECENT_EATEN_WEEKS = 2;
/** Selections within this many previous weeks make a recipe less likely to re-appear. */
export const RECENT_SUGGESTED_WEEKS = 2;
const MAX_PER_CUISINE = 3;

// ---------- Seeded randomness ----------

/** FNV-1a 32-bit hash. */
export function hashString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Mulberry32 PRNG — small, fast, deterministic. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------- Context ----------

export interface SelectionContext {
  weekKey: WeekKey;
  recipes: Recipe[];
  favorites: Set<string>;
  disliked: Set<string>;
  history: CookingHistory[];
  /** Plans of other weeks; meals chosen in past weeks count as "eaten" even if not marked cooked. */
  plans: WeeklyMealPlan[];
  /** Selections of other weeks. */
  previousSelections: WeeklySelection[];
}

export type TimeBand = 'quick' | 'medium' | 'long';

export function timeBand(r: Recipe): TimeBand {
  const t = r.prepMinutes + r.cookMinutes;
  if (t <= 25) return 'quick';
  if (t <= 40) return 'medium';
  return 'long';
}

interface Derived {
  /** Recipe was cooked or chosen in any past week. */
  chosenBefore: Map<string, number>;
  /** Most recent week the recipe was cooked or chosen. */
  lastEaten: Map<string, WeekKey>;
  recentlyEaten: Set<string>;
  recentlySuggested: Map<string, number>;
  cuisineAffinity: Map<string, number>;
  tagAffinity: Map<string, number>;
}

function derive(ctx: SelectionContext): Derived {
  const target = ctx.weekKey;
  const byId = new Map(ctx.recipes.map((r) => [r.id, r]));
  const chosenBefore = new Map<string, number>();
  const lastEaten = new Map<string, WeekKey>();

  const markEaten = (recipeId: string, week: WeekKey) => {
    if (compareWeeks(week, target) >= 0) return; // only the past counts
    const prev = lastEaten.get(recipeId);
    if (!prev || compareWeeks(week, prev) > 0) lastEaten.set(recipeId, week);
  };

  // Count cooking events and planned meals once per (recipe, week).
  const seen = new Set<string>();
  const addChoice = (recipeId: string, week: WeekKey) => {
    if (compareWeeks(week, target) >= 0) return;
    const k = `${recipeId}@${week}`;
    if (seen.has(k)) return;
    seen.add(k);
    chosenBefore.set(recipeId, (chosenBefore.get(recipeId) ?? 0) + 1);
    markEaten(recipeId, week);
  };
  for (const h of ctx.history) addChoice(h.recipeId, h.weekKey);
  for (const p of ctx.plans) for (const m of p.meals) addChoice(m.recipeId, p.weekKey);

  const recentStart = addWeeks(target, -RECENT_EATEN_WEEKS);
  const recentlyEaten = new Set<string>();
  for (const [id, wk] of lastEaten) if (compareWeeks(wk, recentStart) >= 0) recentlyEaten.add(id);

  const suggestStart = addWeeks(target, -RECENT_SUGGESTED_WEEKS);
  const recentlySuggested = new Map<string, number>();
  for (const s of ctx.previousSelections) {
    if (compareWeeks(s.weekKey, target) >= 0 || compareWeeks(s.weekKey, suggestStart) < 0) continue;
    for (const slot of s.slots) recentlySuggested.set(slot.recipeId, (recentlySuggested.get(slot.recipeId) ?? 0) + 1);
  }

  const cuisineAffinity = new Map<string, number>();
  const tagAffinity = new Map<string, number>();
  const bump = (r: Recipe | undefined, w: number) => {
    if (!r) return;
    cuisineAffinity.set(r.cuisine, (cuisineAffinity.get(r.cuisine) ?? 0) + w);
    for (const t of r.tags) tagAffinity.set(t, (tagAffinity.get(t) ?? 0) + w);
  };
  for (const id of ctx.favorites) bump(byId.get(id), 3);
  for (const [id, n] of chosenBefore) bump(byId.get(id), Math.min(n, 3));
  for (const id of ctx.disliked) bump(byId.get(id), -2);

  return { chosenBefore, lastEaten, recentlyEaten, recentlySuggested, cuisineAffinity, tagAffinity };
}

function normalise(map: Map<string, number>): Map<string, number> {
  const max = Math.max(1, ...[...map.values()].map(Math.abs));
  return new Map([...map].map(([k, v]) => [k, v / max]));
}

// ---------- Scoring ----------

interface Candidate {
  recipe: Recipe;
  jitter: number;
}

function preferenceScore(r: Recipe, d: Derived): number {
  const c = normalise(d.cuisineAffinity).get(r.cuisine) ?? 0;
  const tags = normalise(d.tagAffinity);
  const t = r.tags.reduce((s, tag) => s + (tags.get(tag) ?? 0), 0) / Math.max(1, r.tags.length);
  return c * 2 + t;
}

function bucketScore(bucket: SuggestionBucket, r: Recipe, ctx: SelectionContext, d: Derived): number {
  const suggestedPenalty = (d.recentlySuggested.get(r.id) ?? 0) * 1.2;
  switch (bucket) {
    case 'enjoyed': {
      const fav = ctx.favorites.has(r.id) ? 2 : 0;
      const times = Math.min(d.chosenBefore.get(r.id) ?? 0, 4) * 0.4;
      return fav + times - suggestedPenalty;
    }
    case 'match':
      return preferenceScore(r, d) - suggestedPenalty;
    case 'variety': {
      // Reward cuisines the user rarely eats.
      const aff = normalise(d.cuisineAffinity).get(r.cuisine) ?? 0;
      return 1 - aff - suggestedPenalty;
    }
  }
}

function eligible(bucket: SuggestionBucket, r: Recipe, ctx: SelectionContext, d: Derived): boolean {
  if (ctx.disliked.has(r.id)) return false;
  const enjoyed = ctx.favorites.has(r.id) || d.chosenBefore.has(r.id);
  if (bucket === 'enjoyed') return enjoyed && !d.recentlyEaten.has(r.id);
  return !enjoyed;
}

/**
 * Greedy pick with diversity: each candidate's bucket score is reduced for
 * cuisines and time bands already present in the selection.
 */
function pickGreedy(
  candidates: Candidate[],
  count: number,
  score: (r: Recipe) => number,
  already: Recipe[],
): Recipe[] {
  const picked: Recipe[] = [];
  const pool = [...candidates];
  while (picked.length < count && pool.length > 0) {
    const all = [...already, ...picked];
    let bestIdx = -1;
    let best = -Infinity;
    pool.forEach((c, i) => {
      const sameCuisine = all.filter((r) => r.cuisine === c.recipe.cuisine).length;
      if (sameCuisine >= MAX_PER_CUISINE) return;
      const sameBand = all.filter((r) => timeBand(r) === timeBand(c.recipe)).length;
      const s = score(c.recipe) - sameCuisine * 1.1 - sameBand * 0.15 + c.jitter * 1.5;
      if (s > best) {
        best = s;
        bestIdx = i;
      }
    });
    if (bestIdx === -1) break;
    picked.push(pool[bestIdx].recipe);
    pool.splice(bestIdx, 1);
  }
  return picked;
}

function candidatesFor(ctx: SelectionContext, salt: string): Candidate[] {
  const rng = mulberry32(hashString(`${ctx.weekKey}|${salt}`));
  // Sort by id so input order never changes the outcome.
  return [...ctx.recipes].sort((a, b) => a.id.localeCompare(b.id)).map((recipe) => ({ recipe, jitter: rng() }));
}

/**
 * Builds the 12-recipe weekly discovery selection. Deterministic for a given
 * week and context.
 */
export function generateSelection(ctx: SelectionContext, now = Date.now()): WeeklySelection {
  const d = derive(ctx);
  const cands = candidatesFor(ctx, 'base');
  const slots: SelectionSlot[] = [];
  const chosen: Recipe[] = [];
  const take = (bucket: SuggestionBucket, count: number, filter: (r: Recipe) => boolean, score: (r: Recipe) => number) => {
    const pool = cands.filter((c) => !chosen.some((x) => x.id === c.recipe.id) && filter(c.recipe));
    for (const r of pickGreedy(pool, count, score, chosen)) {
      chosen.push(r);
      slots.push({ recipeId: r.id, bucket });
    }
  };

  const notRecent = (r: Recipe) => !d.recentlyEaten.has(r.id);
  for (const bucket of ['enjoyed', 'match', 'variety'] as const) {
    take(bucket, BUCKET_SIZE, (r) => eligible(bucket, r, ctx, d) && notRecent(r), (r) => bucketScore(bucket, r, ctx, d));
  }

  // Cold start or small catalog: fill remaining slots with anything that isn't recent or disliked.
  const fallbackBucket = (r: Recipe): SuggestionBucket =>
    ctx.favorites.has(r.id) || d.chosenBefore.has(r.id) ? 'enjoyed' : 'match';
  const fill = (filter: (r: Recipe) => boolean) => {
    const missing = SELECTION_SIZE - slots.length;
    if (missing <= 0) return;
    const pool = cands.filter((c) => !chosen.some((x) => x.id === c.recipe.id) && !ctx.disliked.has(c.recipe.id) && filter(c.recipe));
    for (const r of pickGreedy(pool, missing, (r) => preferenceScore(r, d) - (d.recentlySuggested.get(r.id) ?? 0), chosen)) {
      chosen.push(r);
      slots.push({ recipeId: r.id, bucket: fallbackBucket(r) });
    }
  };
  fill(notRecent);
  // Last resort: allow recently eaten recipes rather than showing an empty page.
  fill(() => true);

  // Keep buckets grouped in display order.
  const order: SuggestionBucket[] = ['enjoyed', 'match', 'variety'];
  slots.sort((a, b) => order.indexOf(a.bucket) - order.indexOf(b.bucket));

  return { weekKey: ctx.weekKey, slots, replaced: [], replaceCount: 0, createdAt: now };
}

/**
 * Replaces one suggestion without touching the others. Returns the updated
 * selection, or the same selection if no alternative exists.
 */
export function replaceSuggestion(selection: WeeklySelection, index: number, ctx: SelectionContext): WeeklySelection {
  const slot = selection.slots[index];
  if (!slot) return selection;
  const d = derive(ctx);
  const replaced = [...selection.replaced, slot.recipeId];
  const inUse = new Set(selection.slots.map((s) => s.recipeId));
  const excluded = (r: Recipe) => inUse.has(r.id) || replaced.includes(r.id) || ctx.disliked.has(r.id);
  const cands = candidatesFor(ctx, `replace-${selection.replaceCount + 1}`);
  const others = selection.slots
    .filter((_, i) => i !== index)
    .map((s) => ctx.recipes.find((r) => r.id === s.recipeId))
    .filter((r): r is Recipe => !!r);

  const tryPick = (filter: (r: Recipe) => boolean, bucket: SuggestionBucket) => {
    const pool = cands.filter((c) => !excluded(c.recipe) && filter(c.recipe));
    return pickGreedy(pool, 1, (r) => bucketScore(bucket, r, ctx, d), others)[0];
  };

  let bucket = slot.bucket;
  let next = tryPick((r) => eligible(bucket, r, ctx, d) && !d.recentlyEaten.has(r.id), bucket);
  if (!next) {
    next = tryPick((r) => !d.recentlyEaten.has(r.id), bucket);
    if (next) bucket = ctx.favorites.has(next.id) || d.chosenBefore.has(next.id) ? 'enjoyed' : 'match';
  }
  if (!next) return selection;

  const slots = selection.slots.map((s, i) => (i === index ? { recipeId: next!.id, bucket } : s));
  return { ...selection, slots, replaced, replaceCount: selection.replaceCount + 1 };
}

export const BUCKET_LABELS: Record<SuggestionBucket, { title: string; blurb: string }> = {
  enjoyed: { title: 'Weer eens lekker', blurb: 'Gerechten die jullie eerder goed vonden' },
  match: { title: 'Voor jullie gekozen', blurb: 'Nieuwe recepten in jullie smaak' },
  variety: { title: 'Eens wat anders', blurb: 'Nieuwe smaken voor wat variatie' },
};
