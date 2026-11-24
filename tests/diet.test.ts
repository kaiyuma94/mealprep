import { describe, expect, it } from 'vitest';
import { INGREDIENT_MAP, RECIPE_MAP, RECIPES } from '../src/data/catalog';
import { isVeganIngredient, isVeganRecipe, isVegetarianIngredient, isVegetarianRecipe, recipeDiet } from '../src/lib/diet';
import { buildShoppingList } from '../src/lib/shopping';
import { STORE_SECTION_ORDER } from '../src/lib/sections';
import { buildSearchIndex, searchRecipes, type SearchFilters } from '../src/lib/search';
import type { Ingredient, Recipe } from '../src/types';

const ing = (id: string) => INGREDIENT_MAP.get(id)!;
const user = { favorites: new Set<string>(), cooked: new Set<string>(), disliked: new Set<string>() };
const filters = (patch: Partial<SearchFilters>): SearchFilters => ({ query: '', duration: 'any', cuisine: null, status: null, ...patch });

describe('vegan', () => {
  it('knows which catalogue ingredients are animal products', () => {
    for (const id of ['ei', 'roomboter', 'feta', 'kookroom', 'honing', 'mayonaise', 'pesto', 'griekse-yoghurt']) expect(isVeganIngredient(ing(id)), id).toBe(false);
    for (const id of ['tofu', 'kokosmelk', 'kikkererwten', 'spaghetti', 'olijfolie', 'tahin']) expect(isVeganIngredient(ing(id)), id).toBe(true);
  });

  it('judges the user’s own ingredients by their name', () => {
    const own = (name: string): Ingredient => ({ id: `eigen-${name.replace(/\s+/g, '-')}`, name, section: 'other', defaultUnit: 'g' });
    expect(isVeganIngredient(own('drakenfruit'))).toBe(true);
    expect(isVeganIngredient(own('oude kaas van de markt'))).toBe(false);
    expect(isVeganIngredient(own('scharreleieren'))).toBe(true); // a compound word; the name check is deliberately simple
    expect(isVeganIngredient(own('2 eieren'))).toBe(false);
    expect(isVeganIngredient(undefined)).toBe(false);
  });

  it('every recipe tagged vegan counts as vegan, and cheese recipes do not', () => {
    for (const r of RECIPES.filter((x) => x.tags.includes('vegan'))) expect(isVeganRecipe(r, INGREDIENT_MAP), r.id).toBe(true);
    expect(isVeganRecipe(RECIPE_MAP.get('shakshuka-falafel-witte-kaas')!, INGREDIENT_MAP)).toBe(false);
  });

  it('optional animal extras don’t make a recipe non-vegan', () => {
    const base = RECIPES.find((r) => !r.tags.includes('vegan') && isVeganRecipe(r, INGREDIENT_MAP))!;
    const withCheese: Recipe = { ...base, ingredients: [...base.ingredients, { ingredientId: 'feta', amount: 50, unit: 'g', optional: true }] };
    expect(isVeganRecipe(withCheese, INGREDIENT_MAP)).toBe(true);
    expect(isVeganRecipe({ ...withCheese, ingredients: [...base.ingredients, { ingredientId: 'feta', amount: 50, unit: 'g' }] }, INGREDIENT_MAP)).toBe(false);
  });

  it('the vegan filter in search shows only vegan recipes, combined with other filters', () => {
    const index = buildSearchIndex(RECIPES, INGREDIENT_MAP);
    const vegan = searchRecipes(RECIPES, index, filters({ vegan: true }), user);
    expect(vegan.length).toBeGreaterThan(10);
    expect(vegan.every((r) => isVeganRecipe(r, INGREDIENT_MAP))).toBe(true);
    expect(vegan.length).toBe(RECIPES.filter((r) => isVeganRecipe(r, INGREDIENT_MAP)).length);
    const quickVegan = searchRecipes(RECIPES, index, filters({ vegan: true, duration: 'quick' }), user);
    expect(quickVegan.every((r) => r.prepMinutes + r.cookMinutes <= 25 && isVeganRecipe(r, INGREDIENT_MAP))).toBe(true);
    // Typing "vegan" finds them too (plus e.g. "Lahmacun met vegan gehakt", whose mayonnaise sauce isn't vegan).
    const typed = searchRecipes(RECIPES, index, filters({ query: 'vegan' }), user).map((r) => r.id);
    expect(vegan.every((r) => typed.includes(r.id))).toBe(true);
    expect(vegan.map((r) => r.id)).not.toContain('lahmacun-vega-gehakt-knoflooksaus');
  });
});

describe('vegetarian, fish and vega versions', () => {
  const index = buildSearchIndex(RECIPES, INGREDIENT_MAP);
  const fish = RECIPES.filter((r) => !isVegetarianRecipe(r, INGREDIENT_MAP));
  const vegaVersions = RECIPES.filter((r) => r.source.adaptation?.startsWith('Vega-versie'));

  it('fish and shellfish (and fish sauce) are not vegetarian', () => {
    for (const id of ['garnalen', 'zalmfilet', 'kabeljauwfilet', 'pangasiusfilet', 'tonijn', 'vissaus']) {
      expect(isVegetarianIngredient(ing(id)), id).toBe(false);
      expect(isVeganIngredient(ing(id)), id).toBe(false);
    }
    expect(isVegetarianIngredient(ing('vega-spekjes'))).toBe(true);
    const own = (name: string): Ingredient => ({ id: `eigen-${name.replace(/\s+/g, '-')}`, name, section: 'other', defaultUnit: 'g' });
    expect(isVegetarianIngredient(own('gerookte makreel'))).toBe(false);
    expect(isVegetarianIngredient(own('drakenfruit'))).toBe(true);
  });

  it('has 20 fish recipes, all tagged "vis", and 30 vega versions without fish', () => {
    expect(fish).toHaveLength(20);
    expect(fish.every((r) => r.tags.includes('vis'))).toBe(true);
    expect(vegaVersions).toHaveLength(30);
    expect(vegaVersions.every((r) => isVegetarianRecipe(r, INGREDIENT_MAP) && r.source.url?.startsWith('https://www.hellofresh.nl/'))).toBe(true);
    expect(recipeDiet(RECIPE_MAP.get('spaghetti-puttanesca-tonijn')!, INGREDIENT_MAP)).toBe('fish');
  });

  it('diet filters: vegetarian leaves out fish, fish shows only fish, vegan is a subset of vegetarian', () => {
    const veg = searchRecipes(RECIPES, index, filters({ diet: 'vegetarian' }), user).map((r) => r.id);
    const onlyFish = searchRecipes(RECIPES, index, filters({ diet: 'fish' }), user).map((r) => r.id);
    const vegan = searchRecipes(RECIPES, index, filters({ diet: 'vegan' }), user).map((r) => r.id);
    expect(veg.length + onlyFish.length).toBe(RECIPES.length);
    expect(onlyFish.sort()).toEqual(fish.map((r) => r.id).sort());
    expect(vegan.every((id) => veg.includes(id))).toBe(true);
    // Older saved filters ({ vegan: true }) still work.
    expect(searchRecipes(RECIPES, index, filters({ vegan: true }), user).length).toBe(vegan.length);
  });

  it('fish lands in its own aisle, right after the chilled section', () => {
    for (const store of ['lidl', 'ah', 'jumbo'] as const) {
      const order = STORE_SECTION_ORDER[store];
      expect(order.indexOf('fish')).toBe(order.indexOf('chilled') + 1);
    }
    const items = buildShoppingList({ weekKey: '2026-W48', meals: [{ recipeId: 'kabeljauw-thaise-groene-curry', servings: 2, addedAt: 0 }], recipes: RECIPE_MAP, ingredients: INGREDIENT_MAP, pantry: new Set(), store: 'ah' });
    const cod = items.find((i) => i.ingredientId === 'kabeljauwfilet')!;
    expect(cod.section).toBe('fish');
    expect(cod.purchase ?? cod.required).toMatch(/2/);
  });
});
