import { describe, expect, it } from 'vitest';
import { addMeal, addMealRaisingTarget, changeMealTarget, changeMealTargetWithRemoval, emptyPlan, removeMeal, setServings, swapMeal } from '../src/lib/plan';

const withMeals = (n: number, target = 4) => {
  let p = emptyPlan('2026-W48', target);
  for (let i = 0; i < n; i++) {
    const r = addMeal(p, `r${i}`);
    p = r.plan;
  }
  return p;
};

describe('meal target', () => {
  it('defaults to 4 meals for 2 people', () => {
    const p = emptyPlan('2026-W48');
    expect(p.mealTarget).toBe(4);
    const r = addMeal(p, 'x');
    expect(r.status).toBe('added');
    expect(r.plan.meals[0].servings).toBe(2);
  });

  it('clamps targets to 1..7', () => {
    const p = emptyPlan('2026-W48');
    const hi = changeMealTarget(p, 12);
    const lo = changeMealTarget(p, 0);
    expect(hi.status === 'ok' && hi.plan.mealTarget).toBe(7);
    expect(lo.status === 'ok' && lo.plan.mealTarget).toBe(1);
  });

  it('raising the target keeps meals', () => {
    const p = withMeals(4);
    const r = changeMealTarget(p, 6);
    expect(r.status).toBe('ok');
    if (r.status === 'ok') expect(r.plan.meals).toHaveLength(4);
  });

  it('lowering below the selection asks which meals to remove', () => {
    const p = withMeals(4);
    const r = changeMealTarget(p, 2);
    expect(r).toEqual({ status: 'needs-removal', removeCount: 2, target: 2 });
  });

  it('applies removal only for chosen meals and refuses incomplete choices', () => {
    const p = withMeals(4);
    const next = changeMealTargetWithRemoval(p, 2, ['r0', 'r2']);
    expect(next.mealTarget).toBe(2);
    expect(next.meals.map((m) => m.recipeId)).toEqual(['r1', 'r3']);
    expect(() => changeMealTargetWithRemoval(p, 2, ['r0'])).toThrow();
  });

  it('never silently drops meals when the plan is full', () => {
    const p = withMeals(4);
    const r = addMeal(p, 'extra');
    expect(r.status).toBe('full');
    expect(r.plan.meals).toHaveLength(4);
    const raised = addMealRaisingTarget(p, 'extra');
    expect(raised.status).toBe('added');
    expect(raised.plan.mealTarget).toBe(5);
    expect(raised.plan.meals).toHaveLength(5);
  });

  it('does not add duplicates; swap and remove work', () => {
    const p = withMeals(2);
    expect(addMeal(p, 'r0').status).toBe('already-planned');
    const s = swapMeal(p, 'r0', 'new');
    expect(s.meals.map((m) => m.recipeId)).toEqual(['new', 'r1']);
    expect(removeMeal(s, 'new').meals).toHaveLength(1);
    expect(setServings(p, 'r1', 4).meals[1].servings).toBe(4);
  });
});
