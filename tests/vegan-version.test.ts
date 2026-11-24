import { describe, expect, it } from 'vitest';
import { INGREDIENTS, INGREDIENT_MAP, RECIPE_MAP, RECIPES } from '../src/data/catalog';
import { isEasyVegan, isVeganIngredient, isVeganRecipe, veganizeRecipe, veganSwaps, wantsVegan } from '../src/lib/diet';
import { buildSearchIndex, searchRecipes, type SearchFilters } from '../src/lib/search';
import { buildShoppingList } from '../src/lib/shopping';

const r = (id: string) => RECIPE_MAP.get(id)!;
const user = { favorites: new Set<string>(), cooked: new Set<string>(), disliked: new Set<string>() };
const filters = (patch: Partial<SearchFilters>): SearchFilters => ({ query: '', duration: 'any', cuisine: null, status: null, ...patch });

describe('vegan versions', () => {
  it('every vegan alternative exists, is vegan and converts like the original', () => {
    const withSwap = INGREDIENTS.filter((i) => i.veganSwap);
    expect(withSwap.length).toBeGreaterThan(20);
    for (const i of withSwap) {
      const to = INGREDIENT_MAP.get(i.veganSwap!.id);
      expect(to, i.id).toBeDefined();
      expect(isVeganIngredient(to), `${i.id} → ${to!.id}`).toBe(true);
    }
    // Egg, halloumi and paneer have no easy alternative.
    for (const id of ['ei', 'halloumi', 'paneer']) expect(INGREDIENT_MAP.get(id)!.veganSwap).toBeUndefined();
  });

  it('lists the swaps for a recipe, or null when it can’t easily be made vegan', () => {
    const bolognese = veganSwaps(r('snelle-vega-bolognese-penne'), INGREDIENT_MAP)!;
    expect(bolognese.map((s) => `${s.from.id}→${s.to.id}`).sort()).toEqual(['harde-kaas→edelgistvlokken', 'melk→havermelk']);
    expect(veganSwaps(r('shakshuka-falafel-witte-kaas'), INGREDIENT_MAP)).toBeNull(); // eggs
    expect(veganSwaps(r('spaghetti-puttanesca-tonijn'), INGREDIENT_MAP)).toBeNull(); // fish
    const vegan = RECIPES.find((x) => isVeganRecipe(x, INGREDIENT_MAP))!;
    expect(veganSwaps(vegan, INGREDIENT_MAP)).toEqual([]);
    expect(isEasyVegan(vegan, INGREDIENT_MAP)).toBe(false); // already vegan
  });

  it('builds the vegan version: swapped ingredients, adjusted amounts, nothing animal left', () => {
    const original = r('snelle-vega-bolognese-penne');
    const v = veganizeRecipe(original, INGREDIENT_MAP);
    expect(isVeganRecipe(v, INGREDIENT_MAP)).toBe(true);
    expect(v.ingredients.find((i) => i.ingredientId === 'havermelk')?.amount).toBe(original.ingredients.find((i) => i.ingredientId === 'melk')!.amount);
    expect(v.ingredients.find((i) => i.ingredientId === 'edelgistvlokken')?.amount).toBe(12.5); // half of 25 g cheese
    expect(v.steps).toBe(original.steps);
    expect(veganizeRecipe(r('shakshuka-falafel-witte-kaas'), INGREDIENT_MAP)).toBe(r('shakshuka-falafel-witte-kaas'));
  });

  it('makes well over half the vegetarian recipes easy to veganize', () => {
    const easy = RECIPES.filter((x) => isEasyVegan(x, INGREDIENT_MAP));
    expect(easy.length).toBeGreaterThan(120);
    for (const x of easy) expect(isVeganRecipe(veganizeRecipe(x, INGREDIENT_MAP), INGREDIENT_MAP), x.id).toBe(true);
  });

  it('follows the recipe’s own choice first, then the preference', () => {
    const b = r('snelle-vega-bolognese-penne');
    expect(wantsVegan(b, INGREDIENT_MAP, undefined, false)).toBe(false);
    expect(wantsVegan(b, INGREDIENT_MAP, undefined, true)).toBe(true);
    expect(wantsVegan(b, INGREDIENT_MAP, { vegan: false }, true)).toBe(false);
    expect(wantsVegan(b, INGREDIENT_MAP, { vegan: true }, false)).toBe(true);
    expect(wantsVegan(r('shakshuka-falafel-witte-kaas'), INGREDIENT_MAP, { vegan: true }, true)).toBe(false);
  });

  it('puts the plant-based alternatives on the shopping list', () => {
    const b = r('snelle-vega-bolognese-penne');
    const recipes = new Map(RECIPE_MAP).set(b.id, veganizeRecipe(b, INGREDIENT_MAP));
    const items = buildShoppingList({ weekKey: '2026-W48', meals: [{ recipeId: b.id, servings: 2, addedAt: 0 }], recipes, ingredients: INGREDIENT_MAP, pantry: new Set(), store: 'ah' });
    const ids = items.map((i) => i.ingredientId);
    expect(ids).toContain('havermelk');
    expect(ids).toContain('edelgistvlokken');
    expect(ids).not.toContain('melk');
    expect(ids).not.toContain('harde-kaas');
  });

  it('the "makkelijk vegan" filter shows vegan recipes plus the easy ones, never eggs or fish', () => {
    const index = buildSearchIndex(RECIPES, INGREDIENT_MAP);
    const ids = searchRecipes(RECIPES, index, filters({ diet: 'vegan-easy' }), user).map((x) => x.id);
    const vegan = RECIPES.filter((x) => isVeganRecipe(x, INGREDIENT_MAP)).length;
    const easy = RECIPES.filter((x) => isEasyVegan(x, INGREDIENT_MAP)).length;
    expect(ids).toHaveLength(vegan + easy);
    expect(ids).toContain('snelle-vega-bolognese-penne');
    expect(ids).not.toContain('shakshuka-falafel-witte-kaas');
    expect(ids).not.toContain('spaghetti-puttanesca-tonijn');
  });
});
