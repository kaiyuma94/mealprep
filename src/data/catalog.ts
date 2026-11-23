import type { Ingredient, Recipe } from '../types';
import { validateIngredientCatalog, validateRecipeCatalog } from '../lib/validation';
import rawIngredients from './ingredients.json';
import rawRecipes from './recipes.json';

const ing = validateIngredientCatalog(rawIngredients);
const rec = validateRecipeCatalog(rawRecipes, ing.ingredients);

const errors = [...ing.issues, ...rec.issues].filter((i) => i.severity === 'error');
if (errors.length && import.meta.env?.DEV) {
  console.warn(`[weekmenu] ${errors.length} catalog problem(s); invalid recipes were skipped`, errors);
}

export const INGREDIENTS: Ingredient[] = ing.ingredients;
export const INGREDIENT_MAP = new Map(INGREDIENTS.map((i) => [i.id, i]));
export const RECIPES: Recipe[] = rec.recipes;
export const RECIPE_MAP = new Map(RECIPES.map((r) => [r.id, r]));
export const CUISINES = [...new Set(RECIPES.map((r) => r.cuisine))].sort();
