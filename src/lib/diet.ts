import type { Ingredient, Recipe } from '../types';

/** Words that give away an animal product in a name the catalogue doesn't know (the user's own ingredients). */
const ANIMAL_WORDS = /kaas|melk|boter|room|yoghurt|kwark|(^|\s)eieren?(\s|$)|(^|\s)ei(\s|$)|honing|mayo|ghee|parmez|mozzarella|feta|ricotta|mascarpone|halloumi|paneer/;

export function isVeganIngredient(ing: Ingredient | undefined): boolean {
  if (!ing) return false;
  if (ing.vegan !== undefined) return ing.vegan;
  // The user's own ingredients carry no flag: judge them by their name.
  if (ing.id.startsWith('eigen-')) return !ANIMAL_WORDS.test(ing.name.toLowerCase());
  return true;
}

/**
 * Vegan when the recipe says so (its "vegan" tag: it then means the vegan
 * versions of e.g. mayonnaise or naan), or when everything except optional
 * extras (a cheese topping, say) is plant-based.
 */
export function isVeganRecipe(recipe: Recipe, ingredients: Map<string, Ingredient>): boolean {
  if (recipe.tags.includes('vegan')) return true;
  return recipe.ingredients.every((ri) => ri.optional || isVeganIngredient(ingredients.get(ri.ingredientId)));
}
