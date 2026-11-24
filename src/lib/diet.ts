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
/** Search filter: a diet, or 'vegan-easy' for vegan recipes plus those that are easy to make vegan. */
export type DietFilter = Diet | 'vegan-easy';

export function recipeDiet(recipe: Recipe, ingredients: Map<string, Ingredient>): Diet {
  if (!isVegetarianRecipe(recipe, ingredients)) return 'fish';
  return isVeganRecipe(recipe, ingredients) ? 'vegan' : 'vegetarian';
}

// ---------- Vegan versions ----------

export interface VeganSwap {
  from: Ingredient;
  to: Ingredient;
  factor: number;
  note?: string;
}

/**
 * The swaps that make a vegetarian recipe vegan, or null when that isn't
 * easy (an animal product without a plant-based alternative, such as egg,
 * halloumi or paneer, or fish). An already vegan recipe needs no swaps: [].
 */
export function veganSwaps(recipe: Recipe, ingredients: Map<string, Ingredient>): VeganSwap[] | null {
  if (isVeganRecipe(recipe, ingredients)) return [];
  const swaps = new Map<string, VeganSwap>();
  for (const ri of recipe.ingredients) {
    const ing = ingredients.get(ri.ingredientId);
    if (ri.optional || isVeganIngredient(ing)) continue;
    const to = ing?.veganSwap ? ingredients.get(ing.veganSwap.id) : undefined;
    if (!ing || !to || !isVeganIngredient(to)) return null;
    swaps.set(ing.id, { from: ing, to, factor: ing.veganSwap!.factor ?? 1, note: ing.veganSwap!.note });
  }
  return [...swaps.values()];
}

/** Not vegan as written, but vegan with a few one-to-one swaps. */
export function isEasyVegan(recipe: Recipe, ingredients: Map<string, Ingredient>): boolean {
  const s = veganSwaps(recipe, ingredients);
  return s !== null && s.length > 0;
}

/**
 * The vegan version of a recipe: animal products replaced by their
 * plant-based alternative (optional ones are left out). Returns the recipe
 * unchanged when it is already vegan or can't easily be made vegan.
 */
export function veganizeRecipe(recipe: Recipe, ingredients: Map<string, Ingredient>): Recipe {
  const swaps = veganSwaps(recipe, ingredients);
  if (!swaps?.length) return recipe;
  const byId = new Map(swaps.map((s) => [s.from.id, s]));
  return {
    ...recipe,
    ingredients: recipe.ingredients.flatMap((ri) => {
      const s = byId.get(ri.ingredientId);
      if (s) return [{ ...ri, ingredientId: s.to.id, amount: ri.amount === null ? null : Math.round(ri.amount * s.factor * 100) / 100 }];
      if (ri.optional && !isVeganIngredient(ingredients.get(ri.ingredientId))) return [];
      return [ri];
    }),
  };
}

/** Whether to show and shop the vegan version: the recipe's own choice, else the general preference. */
export function wantsVegan(recipe: Recipe, ingredients: Map<string, Ingredient>, state: { vegan?: boolean } | undefined, preferVegan: boolean | undefined): boolean {
  const choice = state?.vegan ?? preferVegan ?? false;
  return choice && isEasyVegan(recipe, ingredients);
}
