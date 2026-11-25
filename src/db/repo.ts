import type {
  CustomRecipeRecord,
  IngredientLineDraft,
  ManualShoppingItem,
  Recipe,
  RecipeUserState,
  ShoppingOverride,
  ShoppingState,
  UserPreferences,
  WeekKey,
  WeeklyMealPlan,
  WeeklySelection,
} from '../types';
import { INGREDIENTS } from '../data/catalog';
import { DEFAULT_MEAL_TARGET, DEFAULT_SERVINGS, emptyPlan } from '../lib/plan';
import { generateSelection, replaceSuggestion, type SelectionContext } from '../lib/selection';
import type { WeekmenuDB } from './db';

export function defaultPreferences(now = Date.now()): UserPreferences {
  return {
    id: 'me',
    defaultServings: DEFAULT_SERVINGS,
    defaultMealTarget: DEFAULT_MEAL_TARGET,
    supermarket: 'lidl',
    pantryItems: INGREDIENTS.filter((i) => i.pantry).map((i) => i.id),
    updatedAt: now,
  };
}

export async function getPreferences(db: WeekmenuDB): Promise<UserPreferences> {
  return (await db.preferences.get('me')) ?? defaultPreferences();
}

export async function updatePreferences(db: WeekmenuDB, patch: Partial<Omit<UserPreferences, 'id'>>): Promise<void> {
  const current = await getPreferences(db);
  await db.preferences.put({ ...current, ...patch, id: 'me', updatedAt: Date.now() });
}

/**
 * Changes the fridge list in one read-modify-write transaction, so quick
 * successive additions can't overwrite each other.
 */
export async function updateFridge(db: WeekmenuDB, change: (items: IngredientLineDraft[]) => IngredientLineDraft[]): Promise<void> {
  await db.transaction('rw', db.preferences, async () => {
    const current = await getPreferences(db);
    await db.preferences.put({ ...current, fridge: change(current.fridge ?? []), id: 'me', updatedAt: Date.now() });
  });
}

// ---------- Plans ----------

export async function getPlan(db: WeekmenuDB, weekKey: WeekKey): Promise<WeeklyMealPlan> {
  const existing = await db.plans.get(weekKey);
  if (existing) return existing;
  const prefs = await getPreferences(db);
  return emptyPlan(weekKey, prefs.defaultMealTarget);
}

export async function savePlan(db: WeekmenuDB, plan: WeeklyMealPlan): Promise<void> {
  await db.plans.put(plan);
}

/**
 * Atomic read-modify-write of a week's plan. All UI changes go through this so
 * rapid taps can't overwrite each other (which would silently drop a meal).
 */
export async function mutatePlan<T = void>(
  db: WeekmenuDB,
  weekKey: WeekKey,
  fn: (plan: WeeklyMealPlan) => { plan?: WeeklyMealPlan; result?: T },
): Promise<{ before: WeeklyMealPlan; after: WeeklyMealPlan; result: T | undefined }> {
  return db.transaction('rw', db.plans, db.preferences, async () => {
    const before = await getPlan(db, weekKey);
    const { plan, result } = fn(before);
    if (plan) await db.plans.put(plan);
    return { before, after: plan ?? before, result };
  });
}

// ---------- Recipe state ----------

function blankState(recipeId: string): RecipeUserState {
  return { recipeId, favorite: false, disliked: false, notes: '', updatedAt: Date.now() };
}

export async function updateRecipeState(db: WeekmenuDB, recipeId: string, patch: Partial<Omit<RecipeUserState, 'recipeId'>>): Promise<void> {
  await db.transaction('rw', db.recipeState, async () => {
    const cur = (await db.recipeState.get(recipeId)) ?? blankState(recipeId);
    const next = { ...cur, ...patch, recipeId, updatedAt: Date.now() };
    // Favourite and disliked are mutually exclusive.
    if (patch.favorite) next.disliked = false;
    if (patch.disliked) next.favorite = false;
    await db.recipeState.put(next);
  });
}

// ---------- Weekly selection ----------

async function selectionContext(db: WeekmenuDB, weekKey: WeekKey, recipes: Recipe[]): Promise<SelectionContext> {
  const [states, history, plans, selections] = await Promise.all([
    db.recipeState.toArray(),
    db.history.toArray(),
    db.plans.toArray(),
    db.selections.toArray(),
  ]);
  return {
    weekKey,
    recipes,
    favorites: new Set(states.filter((s) => s.favorite).map((s) => s.recipeId)),
    disliked: new Set(states.filter((s) => s.disliked).map((s) => s.recipeId)),
    history,
    plans: plans.filter((p) => p.weekKey !== weekKey),
    previousSelections: selections.filter((s) => s.weekKey !== weekKey),
  };
}

/**
 * Returns the stored selection for the week, creating it on first visit.
 * Once stored it stays stable for the whole week, even if history changes.
 */
export async function ensureSelection(db: WeekmenuDB, weekKey: WeekKey, recipes: Recipe[]): Promise<WeeklySelection> {
  const existing = await db.selections.get(weekKey);
  const valid = existing && existing.slots.every((s) => recipes.some((r) => r.id === s.recipeId));
  if (existing && valid) return existing;
  const ctx = await selectionContext(db, weekKey, recipes);
  const selection = generateSelection(ctx);
  await db.selections.put(selection);
  return selection;
}

export async function replaceSelectionSlot(db: WeekmenuDB, weekKey: WeekKey, index: number, recipes: Recipe[]): Promise<WeeklySelection> {
  const current = await ensureSelection(db, weekKey, recipes);
  const ctx = await selectionContext(db, weekKey, recipes);
  const next = replaceSuggestion(current, index, ctx);
  await db.selections.put(next);
  return next;
}

// ---------- Cooking history ----------

export async function markCooked(db: WeekmenuDB, weekKey: WeekKey, recipeId: string, servings: number, now = Date.now()): Promise<void> {
  await db.transaction('rw', db.history, db.plans, async () => {
    const already = await db.history.where({ recipeId, weekKey }).count();
    if (!already) await db.history.add({ recipeId, weekKey, servings, cookedAt: now });
    const plan = await db.plans.get(weekKey);
    if (plan) {
      await db.plans.put({
        ...plan,
        meals: plan.meals.map((m) => (m.recipeId === recipeId ? { ...m, cookedAt: now } : m)),
        updatedAt: now,
      });
    }
  });
}

export async function unmarkCooked(db: WeekmenuDB, weekKey: WeekKey, recipeId: string): Promise<void> {
  await db.transaction('rw', db.history, db.plans, async () => {
    await db.history.where({ recipeId, weekKey }).delete();
    const plan = await db.plans.get(weekKey);
    if (plan) {
      await db.plans.put({
        ...plan,
        meals: plan.meals.map((m) => (m.recipeId === recipeId ? { ...m, cookedAt: undefined } : m)),
        updatedAt: Date.now(),
      });
    }
  });
}

// ---------- Shopping ----------

function blankShopping(weekKey: WeekKey): ShoppingState {
  return { weekKey, overrides: {}, manualItems: [], updatedAt: Date.now() };
}

async function mutateShopping(db: WeekmenuDB, weekKey: WeekKey, fn: (s: ShoppingState) => ShoppingState): Promise<void> {
  await db.transaction('rw', db.shopping, async () => {
    const cur = (await db.shopping.get(weekKey)) ?? blankShopping(weekKey);
    await db.shopping.put({ ...fn(cur), weekKey, updatedAt: Date.now() });
  });
}

export function setOverride(db: WeekmenuDB, weekKey: WeekKey, key: string, patch: ShoppingOverride) {
  return mutateShopping(db, weekKey, (s) => {
    const merged: ShoppingOverride = { ...s.overrides[key], ...patch };
    // Drop keys explicitly reset to undefined so pantry defaults apply again.
    for (const k of Object.keys(merged) as (keyof ShoppingOverride)[]) if (merged[k] === undefined) delete merged[k];
    return { ...s, overrides: { ...s.overrides, [key]: merged } };
  });
}

export function addManualItem(db: WeekmenuDB, weekKey: WeekKey, item: Omit<ManualShoppingItem, 'id' | 'createdAt' | 'checked'>) {
  const id = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : String(Date.now() + Math.random());
  return mutateShopping(db, weekKey, (s) => ({
    ...s,
    manualItems: [...s.manualItems, { ...item, id, checked: false, createdAt: Date.now() }],
  }));
}

export function updateManualItem(db: WeekmenuDB, weekKey: WeekKey, id: string, patch: Partial<ManualShoppingItem>) {
  return mutateShopping(db, weekKey, (s) => ({
    ...s,
    manualItems: s.manualItems.map((m) => (m.id === id ? { ...m, ...patch, id } : m)),
  }));
}

export function removeManualItem(db: WeekmenuDB, weekKey: WeekKey, id: string) {
  return mutateShopping(db, weekKey, (s) => ({ ...s, manualItems: s.manualItems.filter((m) => m.id !== id) }));
}

/** Unchecks everything but keeps stock overrides, edits and manual items. */
export function clearChecks(db: WeekmenuDB, weekKey: WeekKey) {
  return mutateShopping(db, weekKey, (s) => ({
    ...s,
    overrides: Object.fromEntries(Object.entries(s.overrides).map(([k, o]) => [k, { ...o, checked: false }])),
    manualItems: s.manualItems.map((m) => ({ ...m, checked: false })),
  }));
}

// ---------- Own recipes ----------

export async function saveCustomRecipe(db: WeekmenuDB, record: CustomRecipeRecord): Promise<void> {
  await db.customRecipes.put(record);
}

/**
 * Deletes one of the user's own recipes. It's also taken out of the menus of
 * `fromWeek` and later, so no planned meal points to it; past weeks and the
 * cooking history are left as they were.
 */
export async function deleteCustomRecipe(db: WeekmenuDB, recipeId: string, fromWeek: WeekKey): Promise<void> {
  await db.transaction('rw', db.customRecipes, db.plans, async () => {
    await db.customRecipes.delete(recipeId);
    const plans = await db.plans.where('weekKey').aboveOrEqual(fromWeek).toArray();
    for (const p of plans) {
      if (!p.meals.some((m) => m.recipeId === recipeId)) continue;
      await db.plans.put({ ...p, meals: p.meals.filter((m) => m.recipeId !== recipeId), updatedAt: Date.now() });
    }
  });
}
