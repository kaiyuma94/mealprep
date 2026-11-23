import type { CustomRecipeRecord, Ingredient, Recipe } from '../types';
import { validateRecipe } from './validation';

export interface Catalog {
  recipes: Recipe[];
  recipeMap: Map<string, Recipe>;
  ingredients: Ingredient[];
  ingredientMap: Map<string, Ingredient>;
  cuisines: string[];
  /** The user's own recipes by id. */
  custom: Map<string, CustomRecipeRecord>;
  builtInCount: number;
  /** False until the user's own recipes have been read from the device. */
  loaded: boolean;
}

/**
 * Adds the user's own recipes (and the ingredients they introduced) to the
 * built-in catalogue. Built-in entries always win on an id clash, and own
 * recipes that don't validate (e.g. a damaged backup) are left out.
 */
export function mergeCatalog(builtIn: Recipe[], builtInIngredients: Ingredient[], custom: CustomRecipeRecord[] | undefined): Catalog {
  const ingredientMap = new Map(builtInIngredients.map((i) => [i.id, i]));
  for (const rec of custom ?? []) {
    for (const ing of rec.extraIngredients ?? []) if (ing?.id && !ingredientMap.has(ing.id)) ingredientMap.set(ing.id, ing);
  }
  const ids = new Set(ingredientMap.keys());
  const recipeMap = new Map(builtIn.map((r) => [r.id, r]));
  const own = new Map<string, CustomRecipeRecord>();
  const sorted = [...(custom ?? [])].sort((a, b) => b.updatedAt - a.updatedAt);
  for (const rec of sorted) {
    if (!rec?.recipe || recipeMap.has(rec.recipe.id)) continue;
    if (validateRecipe(rec.recipe, ids).some((i) => i.severity === 'error')) continue;
    recipeMap.set(rec.recipe.id, rec.recipe);
    own.set(rec.recipe.id, rec);
  }
  // Own recipes first, newest first, so they're easy to find.
  const recipes = [...own.values()].map((r) => r.recipe).concat(builtIn);
  return {
    recipes,
    recipeMap,
    ingredients: [...ingredientMap.values()],
    ingredientMap,
    cuisines: [...new Set(recipes.map((r) => r.cuisine))].sort((a, b) => a.localeCompare(b, 'nl')),
    custom: own,
    builtInCount: builtIn.length,
    loaded: custom !== undefined,
  };
}
