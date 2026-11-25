/**
 * "Wat heb ik nog?": recipe suggestions for what's left in the fridge.
 * The user types free text; lines are matched to catalogue ingredients the
 * same way as in the recipe form. Pure functions, no React or IndexedDB.
 */
import type { Ingredient, IngredientLineDraft, Recipe } from '../types';
import { parseLine, type IngredientLookup, type ParsedLine } from './customRecipe';
import { fold } from './search';

export interface FridgeItem {
  draft: IngredientLineDraft;
  line: ParsedLine;
  /** Catalogue ingredient it was recognised as. */
  ingredient?: Ingredient;
  /** For unrecognised lines: the words used to look through recipe texts. */
  words?: string;
}

export function readFridge(drafts: IngredientLineDraft[], lookup: IngredientLookup): FridgeItem[] {
  return drafts.map((draft) => {
    const line = parseLine(draft, lookup);
    if (line.match) return { draft, line, ingredient: line.match };
    const words = fold(line.name || draft.text).replace(/[^a-z0-9 ]+/g, ' ').trim();
    return { draft, line, words: words || undefined };
  });
}

export interface FridgeSuggestion {
  recipe: Recipe;
  /** Fridge items this recipe uses up. */
  uses: { item: FridgeItem; ingredient?: Ingredient; via?: 'substitute' | 'text' }[];
  /** What you'd still need to buy (not in the fridge, not a pantry staple, not "to taste"). */
  missing: Ingredient[];
  score: number;
}

export interface FridgeOptions {
  /** Ingredients always at home (salt, oil, stock): never counted as missing. */
  pantry: Set<string>;
  /** Recipes the user marked "niets voor ons" sink to the bottom. */
  disliked?: Set<string>;
  /** Show the vegan version of a recipe instead (when chosen for it). */
  version?: (recipe: Recipe) => Recipe;
}

/**
 * Ranks recipes by how much of the fridge they use up and how little you'd
 * still have to buy. A direct match counts fully, a listed substitute (rode ui
 * for ui) for 0.75, and an unrecognised word found in the recipe's title or
 * ingredient names for 0.5.
 */
export function suggestFromFridge(
  items: FridgeItem[],
  recipes: Recipe[],
  ingredients: Map<string, Ingredient>,
  opts: FridgeOptions,
): FridgeSuggestion[] {
  const usable = items.filter((i) => i.ingredient || i.words);
  if (!usable.length) return [];
  const out: FridgeSuggestion[] = [];
  for (const original of recipes) {
    const recipe = opts.version?.(original) ?? original;
    const ids = new Set(recipe.ingredients.map((ri) => ri.ingredientId));
    const text = fold(
      [recipe.title, recipe.subtitle ?? '', ...recipe.ingredients.map((ri) => {
        const ing = ingredients.get(ri.ingredientId);
        return ing ? `${ing.name} ${ing.plural ?? ''}` : '';
      })].join(' '),
    );
    const uses: FridgeSuggestion['uses'] = [];
    const covered = new Set<string>();
    let weight = 0;
    for (const item of usable) {
      const ing = item.ingredient;
      if (ing && ids.has(ing.id)) {
        uses.push({ item, ingredient: ing });
        covered.add(ing.id);
        weight += 1;
        continue;
      }
      // A listed substitute, in either direction (rode ui ↔ ui).
      const sub = ing && recipe.ingredients.find((ri) => {
        const other = ingredients.get(ri.ingredientId);
        return ing.substitutes?.includes(ri.ingredientId) || other?.substitutes?.includes(ing.id);
      });
      if (ing && sub) {
        uses.push({ item, ingredient: ingredients.get(sub.ingredientId), via: 'substitute' });
        covered.add(sub.ingredientId);
        weight += 0.75;
        continue;
      }
      if (!ing && item.words && item.words.length >= 3 && text.includes(item.words)) {
        uses.push({ item, via: 'text' });
        weight += 0.5;
      }
    }
    if (!uses.length) continue;
    const missing: Ingredient[] = [];
    for (const ri of recipe.ingredients) {
      if (ri.optional || ri.amount === null || covered.has(ri.ingredientId) || opts.pantry.has(ri.ingredientId)) continue;
      const ing = ingredients.get(ri.ingredientId);
      if (!ing || ing.pantry || missing.some((m) => m.id === ing.id)) continue;
      missing.push(ing);
    }
    // Using up the fridge matters most; every extra purchase costs a little.
    let score = weight * 3 - missing.length;
    if (opts.disliked?.has(original.id)) score -= 100;
    out.push({ recipe, uses, missing, score });
  }
  return out.sort(
    (a, b) =>
      b.score - a.score ||
      a.missing.length - b.missing.length ||
      a.recipe.prepMinutes + a.recipe.cookMinutes - (b.recipe.prepMinutes + b.recipe.cookMinutes) ||
      a.recipe.title.localeCompare(b.recipe.title, 'nl'),
  );
}
