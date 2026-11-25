import { describe, expect, it } from 'vitest';
import { INGREDIENTS, INGREDIENT_MAP, RECIPE_MAP, RECIPES } from '../src/data/catalog';
import { ingredientLookup } from '../src/lib/customRecipe';
import { veganizeRecipe } from '../src/lib/diet';
import { readFridge, suggestFromFridge } from '../src/lib/fridge';

const lookup = ingredientLookup(INGREDIENTS);
const fridge = (...lines: string[]) => readFridge(lines.map((text) => ({ text })), lookup);
const pantry = new Set(INGREDIENTS.filter((i) => i.pantry).map((i) => i.id));

describe('wat heb ik nog?', () => {
  it('recognises free text the same way as the recipe form', () => {
    const items = fridge('halve courgette', '200 g verse spinazie', 'restje rijst', 'drakenfruit');
    expect(items.map((i) => i.ingredient?.id)).toEqual(['courgette', 'spinazie', 'basmatirijst', undefined]);
    expect(items[3].words).toBe('drakenfruit');
  });

  it('only suggests recipes that use something from the fridge, best use first', () => {
    const s = suggestFromFridge(fridge('courgette', 'feta'), RECIPES, INGREDIENT_MAP, { pantry });
    expect(s.length).toBeGreaterThan(5);
    for (const x of s) expect(x.uses.length).toBeGreaterThan(0);
    // Recipes using both come before recipes using one.
    const firstSingle = s.findIndex((x) => x.uses.length === 1);
    expect(s.slice(0, firstSingle).every((x) => x.uses.length >= 2)).toBe(true);
    expect(s.every((x, i) => i === 0 || s[i - 1].score >= x.score)).toBe(true);
  });

  it('lists what you still need to buy, without pantry staples, to-taste items or what you have', () => {
    const s = suggestFromFridge(fridge('courgette', 'feta'), RECIPES, INGREDIENT_MAP, { pantry });
    for (const x of s) {
      for (const m of x.missing) {
        expect(pantry.has(m.id)).toBe(false);
        expect(['courgette', 'feta']).not.toContain(m.id);
        expect(x.recipe.ingredients.find((ri) => ri.ingredientId === m.id)!.amount).not.toBeNull();
      }
    }
  });

  it('counts a listed substitute (rode ui for ui) at a lower weight', () => {
    const recipe = RECIPES.find((r) => r.ingredients.some((ri) => ri.ingredientId === 'ui') && !r.ingredients.some((ri) => ri.ingredientId === 'rode-ui'))!;
    const viaSub = suggestFromFridge(fridge('rode ui'), [recipe], INGREDIENT_MAP, { pantry })[0];
    expect(viaSub.uses[0]).toMatchObject({ via: 'substitute', ingredient: { id: 'ui' } });
    const direct = suggestFromFridge(fridge('ui'), [recipe], INGREDIENT_MAP, { pantry })[0];
    expect(direct.score).toBeGreaterThan(viaSub.score);
  });

  it('finds unrecognised words in recipe titles', () => {
    const s = suggestFromFridge(fridge('shakshuka-restje'), RECIPES, INGREDIENT_MAP, { pantry });
    // "shakshuka-restje" isn't an ingredient; the words don't appear verbatim, so nothing matches…
    expect(s).toEqual([]);
    const t = suggestFromFridge(fridge('shakshuka'), RECIPES, INGREDIENT_MAP, { pantry });
    expect(t.length).toBeGreaterThan(0);
    expect(t.every((x) => x.uses[0].via === 'text')).toBe(true);
  });

  it('sinks “niets voor ons” recipes and can use the vegan version', () => {
    const items = fridge('havermelk');
    const bolognese = RECIPE_MAP.get('snelle-vega-bolognese-penne')!;
    expect(suggestFromFridge(items, [bolognese], INGREDIENT_MAP, { pantry })).toEqual([]);
    const vegan = suggestFromFridge(items, [bolognese], INGREDIENT_MAP, { pantry, version: (r) => veganizeRecipe(r, INGREDIENT_MAP) });
    expect(vegan[0].uses[0].ingredient?.id).toBe('havermelk');
    const all = suggestFromFridge(fridge('courgette'), RECIPES, INGREDIENT_MAP, { pantry });
    const sunk = suggestFromFridge(fridge('courgette'), RECIPES, INGREDIENT_MAP, { pantry, disliked: new Set([all[0].recipe.id]) });
    expect(sunk.at(-1)!.recipe.id).toBe(all[0].recipe.id);
  });

  it('returns nothing for an empty fridge', () => {
    expect(suggestFromFridge([], RECIPES, INGREDIENT_MAP, { pantry })).toEqual([]);
  });
});
