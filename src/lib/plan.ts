import type { WeekKey, WeeklyMealPlan } from '../types';

export const MIN_MEALS = 1;
export const MAX_MEALS = 7;
export const DEFAULT_MEAL_TARGET = 4;
export const DEFAULT_SERVINGS = 2;
export const MIN_SERVINGS = 1;
export const MAX_SERVINGS = 8;

export const clampTarget = (n: number) => Math.min(MAX_MEALS, Math.max(MIN_MEALS, Math.round(n)));
export const clampServings = (n: number) => Math.min(MAX_SERVINGS, Math.max(MIN_SERVINGS, Math.round(n)));

export function emptyPlan(weekKey: WeekKey, mealTarget = DEFAULT_MEAL_TARGET, now = Date.now()): WeeklyMealPlan {
  return { weekKey, mealTarget: clampTarget(mealTarget), meals: [], updatedAt: now };
}

export type TargetChange =
  | { status: 'ok'; plan: WeeklyMealPlan }
  /** The new target is below the number of selected meals: the user must choose what to remove. */
  | { status: 'needs-removal'; removeCount: number; target: number };

/**
 * Changes the number of cooking days. Never discards meals on its own:
 * if meals would no longer fit, the caller has to ask the user.
 */
export function changeMealTarget(plan: WeeklyMealPlan, target: number, now = Date.now()): TargetChange {
  const t = clampTarget(target);
  if (plan.meals.length > t) return { status: 'needs-removal', removeCount: plan.meals.length - t, target: t };
  return { status: 'ok', plan: { ...plan, mealTarget: t, updatedAt: now } };
}

/** Applies a lower target after the user explicitly chose which meals to remove. */
export function changeMealTargetWithRemoval(plan: WeeklyMealPlan, target: number, removeRecipeIds: string[], now = Date.now()): WeeklyMealPlan {
  const t = clampTarget(target);
  const meals = plan.meals.filter((m) => !removeRecipeIds.includes(m.recipeId));
  if (meals.length > t) {
    throw new Error(`Remove ${meals.length - t} more meal(s) to lower the target to ${t}`);
  }
  return { ...plan, mealTarget: t, meals, updatedAt: now };
}

export type AddResult =
  | { status: 'added'; plan: WeeklyMealPlan }
  | { status: 'already-planned'; plan: WeeklyMealPlan }
  /** Plan is full; the caller should offer to raise the target or swap a meal. */
  | { status: 'full'; plan: WeeklyMealPlan };

export function addMeal(plan: WeeklyMealPlan, recipeId: string, servings = DEFAULT_SERVINGS, now = Date.now()): AddResult {
  if (plan.meals.some((m) => m.recipeId === recipeId)) return { status: 'already-planned', plan };
  if (plan.meals.length >= plan.mealTarget) return { status: 'full', plan };
  return {
    status: 'added',
    plan: { ...plan, meals: [...plan.meals, { recipeId, servings: clampServings(servings), addedAt: now }], confirmedAt: undefined, updatedAt: now },
  };
}

/** Adds a meal and raises the target by one when the plan is full (explicit user choice). */
export function addMealRaisingTarget(plan: WeeklyMealPlan, recipeId: string, servings = DEFAULT_SERVINGS, now = Date.now()): AddResult {
  if (plan.meals.length >= plan.mealTarget && plan.mealTarget < MAX_MEALS) {
    return addMeal({ ...plan, mealTarget: plan.mealTarget + 1 }, recipeId, servings, now);
  }
  return addMeal(plan, recipeId, servings, now);
}

export function swapMeal(plan: WeeklyMealPlan, outRecipeId: string, inRecipeId: string, servings = DEFAULT_SERVINGS, now = Date.now()): WeeklyMealPlan {
  if (plan.meals.some((m) => m.recipeId === inRecipeId)) return plan;
  return {
    ...plan,
    meals: plan.meals.map((m) => (m.recipeId === outRecipeId ? { recipeId: inRecipeId, servings: clampServings(servings), addedAt: now } : m)),
    confirmedAt: undefined,
    updatedAt: now,
  };
}

export function removeMeal(plan: WeeklyMealPlan, recipeId: string, now = Date.now()): WeeklyMealPlan {
  return { ...plan, meals: plan.meals.filter((m) => m.recipeId !== recipeId), confirmedAt: undefined, updatedAt: now };
}

export function setServings(plan: WeeklyMealPlan, recipeId: string, servings: number, now = Date.now()): WeeklyMealPlan {
  return {
    ...plan,
    meals: plan.meals.map((m) => (m.recipeId === recipeId ? { ...m, servings: clampServings(servings) } : m)),
    updatedAt: now,
  };
}
