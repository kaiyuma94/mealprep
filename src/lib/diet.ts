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

export function isVegetarianIngredient(ing: Ingredient | undefined): boolean {
  if (!ing) return false;
  if (ing.vegetarian !== undefined) return ing.vegetarian;
  if (ing.id.startsWith('eigen-')) return !FISH_WORDS.test(ing.name.toLowerCase());
  return true;
}

/** Fish and shellfish in the name of an ingredient the catalogue doesn't know. */
const FISH_WORDS = /vis|zalm|tonijn|kabeljauw|garnal|gamba|scampi|makreel|haring|ansjovis|mosselen|inktvis|pangasius|forel|schol|tilapia|krab|kreeft/;

/** Vegetarian: no fish or shellfish, except as an optional extra. (Meat never appears in the catalogue.) */
export function isVegetarianRecipe(recipe: Recipe, ingredients: Map<string, Ingredient>): boolean {
  return recipe.ingredients.every((ri) => ri.optional || isVegetarianIngredient(ingredients.get(ri.ingredientId)));
}

export type Diet = 'vegan' | 'vegetarian' | 'fish';

export function recipeDiet(recipe: Recipe, ingredients: Map<string, Ingredient>): Diet {
  if (!isVegetarianRecipe(recipe, ingredients)) return 'fish';
  return isVeganRecipe(recipe, ingredients) ? 'vegan' : 'vegetarian';
}
