import { describe, expect, it } from 'vitest';
import { RECIPES } from '../src/data/catalog';
import { addWeeks } from '../src/lib/week';
import { BUCKET_SIZE, generateSelection, replaceSuggestion, SELECTION_SIZE, type SelectionContext } from '../src/lib/selection';
import type { CookingHistory, WeeklyMealPlan, WeeklySelection } from '../src/types';

const base = (weekKey: string, over: Partial<SelectionContext> = {}): SelectionContext => ({
  weekKey,
  recipes: RECIPES,
  favorites: new Set(),
  disliked: new Set(),
  history: [],
  plans: [],
  previousSelections: [],
  ...over,
});

const ids = (s: WeeklySelection) => s.slots.map((x) => x.recipeId);

describe('weekly selection', () => {
  it('is deterministic for the same week and context', () => {
    const a = generateSelection(base('2026-W48'), 0);
    const b = generateSelection(base('2026-W48'), 0);
    expect(ids(a)).toEqual(ids(b));
  });

  it('does not depend on catalog order', () => {
    const a = generateSelection(base('2026-W48'), 0);
    const b = generateSelection(base('2026-W48', { recipes: [...RECIPES].reverse() }), 0);
    expect(ids(a)).toEqual(ids(b));
  });

  it('differs between weeks', () => {
    const a = generateSelection(base('2026-W48'));
    const b = generateSelection(base('2026-W49'));
    expect(ids(a)).not.toEqual(ids(b));
  });

  it('returns 12 unique recipes on a cold start', () => {
    const s = generateSelection(base('2026-W48'));
    expect(s.slots).toHaveLength(SELECTION_SIZE);
    expect(new Set(ids(s)).size).toBe(SELECTION_SIZE);
    // Nothing has been enjoyed yet, so no "enjoyed" slots.
    expect(s.slots.filter((x) => x.bucket === 'enjoyed')).toHaveLength(0);
  });

  it('fills the three buckets when history exists', () => {
    const favs = RECIPES.slice(0, 6).map((r) => r.id);
    const history: CookingHistory[] = favs.map((recipeId, i) => ({ recipeId, weekKey: addWeeks('2026-W48', -(4 + i)), cookedAt: 0, servings: 2 }));
    const s = generateSelection(base('2026-W48', { favorites: new Set(favs), history }));
    const count = (b: string) => s.slots.filter((x) => x.bucket === b).length;
    expect(count('enjoyed')).toBe(BUCKET_SIZE);
    expect(count('match')).toBe(BUCKET_SIZE);
    expect(count('variety')).toBe(BUCKET_SIZE);
    for (const slot of s.slots.filter((x) => x.bucket === 'enjoyed')) expect(favs).toContain(slot.recipeId);
  });

  it('never suggests disliked recipes', () => {
    const disliked = new Set(RECIPES.slice(0, 10).map((r) => r.id));
    const s = generateSelection(base('2026-W48', { disliked }));
    for (const id of ids(s)) expect(disliked.has(id)).toBe(false);
  });

  it('keeps cuisines diverse (max 3 per cuisine)', () => {
    for (let w = 1; w <= 20; w++) {
      const s = generateSelection(base(`2026-W${String(w).padStart(2, '0')}`));
      const counts = new Map<string, number>();
      for (const id of ids(s)) {
        const c = RECIPES.find((r) => r.id === id)!.cuisine;
        counts.set(c, (counts.get(c) ?? 0) + 1);
      }
      expect(Math.max(...counts.values())).toBeLessThanOrEqual(3);
    }
  });

  it('holds back recipes eaten in the last two weeks', () => {
    const recent = RECIPES.slice(0, 4).map((r) => r.id);
    const plans: WeeklyMealPlan[] = [
      { weekKey: '2026-W47', mealTarget: 4, meals: recent.map((recipeId) => ({ recipeId, servings: 2, addedAt: 0 })), updatedAt: 0 },
    ];
    const s = generateSelection(base('2026-W48', { favorites: new Set(recent), plans }));
    for (const id of recent) expect(ids(s)).not.toContain(id);
  });

  it('prevents recently eaten favourites from dominating over many weeks', () => {
    // Simulate a user who always cooks the first 4 suggestions and favourites them all.
    let week = '2026-W10';
    const favorites = new Set<string>();
    const plans: WeeklyMealPlan[] = [];
    const previousSelections: WeeklySelection[] = [];
    const appearances = new Map<string, number>();
    for (let i = 0; i < 12; i++) {
      const s = generateSelection(base(week, { favorites, plans: [...plans], previousSelections: [...previousSelections] }));
      const lastWeekMeals = plans.at(-1)?.meals.map((m) => m.recipeId) ?? [];
      for (const id of lastWeekMeals) expect(ids(s)).not.toContain(id);
      for (const id of ids(s)) appearances.set(id, (appearances.get(id) ?? 0) + 1);
      const cooked = ids(s).slice(0, 4);
      cooked.forEach((id) => favorites.add(id));
      plans.push({ weekKey: week, mealTarget: 4, meals: cooked.map((recipeId) => ({ recipeId, servings: 2, addedAt: 0 })), updatedAt: 0 });
      previousSelections.push(s);
      week = addWeeks(week, 1);
    }
    // Over 12 weeks most of the catalog gets shown, and no recipe appears every week.
    expect(appearances.size).toBeGreaterThanOrEqual(Math.min(RECIPES.length, 24));
    expect(Math.max(...appearances.values())).toBeLessThan(10);
  });

  it('penalises recipes suggested last week', () => {
    const first = generateSelection(base('2026-W48'));
    const second = generateSelection(base('2026-W49', { previousSelections: [first] }));
    const overlap = ids(second).filter((id) => ids(first).includes(id)).length;
    expect(overlap).toBeLessThanOrEqual(4);
  });

  it('replaces a single suggestion and keeps the rest', () => {
    const ctx = base('2026-W48');
    const s = generateSelection(ctx);
    const r = replaceSuggestion(s, 3, ctx);
    expect(ids(r)[3]).not.toBe(ids(s)[3]);
    ids(r).forEach((id, i) => i !== 3 && expect(id).toBe(ids(s)[i]));
    expect(new Set(ids(r)).size).toBe(SELECTION_SIZE);
    // Replacing again never brings back the removed recipe.
    const r2 = replaceSuggestion(r, 3, ctx);
    expect([ids(s)[3], ids(r)[3]]).not.toContain(ids(r2)[3]);
    // Deterministic
    expect(ids(replaceSuggestion(s, 3, ctx))).toEqual(ids(r));
  });

  it('copes with a tiny catalog', () => {
    const s = generateSelection(base('2026-W48', { recipes: RECIPES.slice(0, 5) }));
    expect(s.slots).toHaveLength(5);
  });
});
