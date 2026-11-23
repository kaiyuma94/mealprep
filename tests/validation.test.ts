import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import rawRecipes from '../src/data/recipes.json';
import rawIngredients from '../src/data/ingredients.json';
import { INGREDIENTS, RECIPES } from '../src/data/catalog';
import { validateIngredientCatalog, validateRecipe, validateRecipeCatalog } from '../src/lib/validation';

const ids = new Set(INGREDIENTS.map((i) => i.id));
const good = structuredClone(RECIPES[0]);

describe('recipe data validation', () => {
  it('the bundled catalog is fully valid', () => {
    const ing = validateIngredientCatalog(rawIngredients);
    expect(ing.issues.filter((i) => i.severity === 'error')).toEqual([]);
    const rec = validateRecipeCatalog(rawRecipes, ing.ingredients);
    expect(rec.issues.filter((i) => i.severity === 'error')).toEqual([]);
    expect(rec.recipes.length).toBe((rawRecipes as { recipes: unknown[] }).recipes.length);
    expect(RECIPES.length).toBeGreaterThanOrEqual(40);
  });

  it('every recipe links to the HelloFresh recipe that inspired it', () => {
    for (const r of RECIPES) {
      expect(r.source).toMatchObject({ type: 'inspired', name: 'HelloFresh' });
      expect(r.source.url).toMatch(/^https:\/\/www\.hellofresh\.nl\/recipes\/.+-[0-9a-f]{24}$/);
    }
    expect(new Set(RECIPES.map((r) => r.source.url)).size).toBe(RECIPES.length);
  });

  it('uses illustrated covers, no bundled photos', () => {
    for (const r of RECIPES) {
      expect(r.image, r.id).toBeUndefined();
      expect(r.palette, r.id).toHaveLength(2);
    }
    expect(existsSync(resolve(__dirname, '../public/recipe-images'))).toBe(false);
  });

  it('accepts a valid recipe', () => {
    expect(validateRecipe(good, ids).filter((i) => i.severity === 'error')).toEqual([]);
  });

  it.each([
    ['missing title', { title: '' }, 'title'],
    ['no ingredients', { ingredients: [] }, 'ingredients'],
    ['no steps', { steps: [] }, 'steps'],
    ['unknown ingredient', { ingredients: [{ ingredientId: 'eenhoorn', amount: 1, unit: 'g' }] }, 'ingredients[0]'],
    ['unknown unit', { ingredients: [{ ingredientId: 'ui', amount: 1, unit: 'handful' }] }, 'ingredients[0]'],
    ['negative amount', { ingredients: [{ ingredientId: 'ui', amount: -1, unit: 'piece' }] }, 'ingredients[0]'],
    ['missing source', { source: undefined }, 'source'],
    ['licensed without license', { source: { type: 'licensed', name: 'X' } }, 'source.license'],
    ['inspired without link', { source: { type: 'inspired', name: 'HelloFresh' } }, 'source.url'],
    ['image without license', { image: { url: 'a.jpg', alt: 'x', credit: 'y' } }, 'image'],
    ['wrong schema version', { schemaVersion: 7 }, 'schemaVersion'],
    ['bad servings', { baseServings: 0 }, 'baseServings'],
  ])('rejects %s', (_, patch, path) => {
    const issues = validateRecipe({ ...good, ...patch }, ids);
    expect(issues.some((i) => i.severity === 'error' && i.path === path)).toBe(true);
  });

  it('drops invalid and duplicate recipes but keeps the rest', () => {
    const res = validateRecipeCatalog({ recipes: [good, { ...good }, { id: 'broken' }, null, RECIPES[1]] }, INGREDIENTS);
    expect(res.recipes.map((r) => r.id)).toEqual([good.id, RECIPES[1].id]);
    expect(res.issues.some((i) => i.message === 'duplicate recipe id')).toBe(true);
  });

  it('handles a catalog that is not shaped correctly', () => {
    expect(validateRecipeCatalog('nonsense', INGREDIENTS).recipes).toEqual([]);
    expect(validateIngredientCatalog({}).ingredients).toEqual([]);
  });

  it('allows "to taste" ingredients with null amounts', () => {
    const r = { ...good, ingredients: [{ ingredientId: 'zout', amount: null, unit: 'pinch' }] };
    expect(validateRecipe(r, ids).filter((i) => i.severity === 'error')).toEqual([]);
  });
});
