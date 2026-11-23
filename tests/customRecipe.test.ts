import { describe, expect, it } from 'vitest';
import { INGREDIENTS, RECIPES } from '../src/data/catalog';
import { mergeCatalog } from '../src/lib/catalogMerge';
import {
  buildCustomRecipe,
  emptyForm,
  formProblems,
  ingredientLookup,
  matchIngredient,
  newRecipeId,
  paletteFor,
  parseLine,
  recordToForm,
  type RecipeForm,
} from '../src/lib/customRecipe';
import { dishShape, guessDishShape } from '../src/lib/dish';
import { searchRecipes, buildSearchIndex } from '../src/lib/search';
import { buildShoppingList } from '../src/lib/shopping';

const lookup = ingredientLookup(INGREDIENTS);
const form = (patch: Partial<RecipeForm>): RecipeForm => ({ ...emptyForm(), ...patch });
const pesto = form({
  title: 'Pasta pesto met courgette',
  ingredients: [
    { text: '250 g spaghetti' },
    { text: '1 courgette, in plakjes' },
    { text: '2 tenen knoflook' },
    { text: '90 g pesto' },
    { text: '50 g geroosterde pijnboompitjes van de markt' },
    { text: 'naar smaak zout' },
  ],
  steps: ['Kook de pasta.', '', 'Bak de courgette en meng alles.'],
});
const build = (f: RecipeForm, taken: (id: string) => boolean = () => false) => buildCustomRecipe(f, INGREDIENTS, { taken, now: 100 });

describe('ingredient lines', () => {
  it('recognises known ingredients, with and without unit', () => {
    expect(parseLine({ text: '200 g champignons' }, lookup)).toMatchObject({ amount: 200, unit: 'g', match: { id: 'champignons' }, partial: false });
    expect(parseLine({ text: '2 uien' }, lookup)).toMatchObject({ amount: 2, unit: 'piece', match: { id: 'ui' } });
    expect(parseLine({ text: '2 tenen knoflook, fijngehakt' }, lookup)).toMatchObject({ unit: 'clove', note: 'fijngehakt', match: { id: 'knoflook' } });
    expect(parseLine({ text: 'naar smaak zout' }, lookup)).toMatchObject({ amount: null, unit: 'pinch', match: { id: 'zout' } });
    expect(parseLine({ text: '1,5 el olijfolie' }, lookup)).toMatchObject({ amount: 1.5, unit: 'tbsp', match: { id: 'olijfolie' } });
  });

  it('matches on the last words when the start is an adjective', () => {
    expect(matchIngredient('lekkere rode linzen', lookup)).toMatchObject({ ingredient: { id: 'rode-linzen' }, partial: true });
    expect(matchIngredient('rode linzen', lookup)).toMatchObject({ ingredient: { id: 'rode-linzen' }, partial: false });
    expect(matchIngredient('drakenfruit', lookup)).toBeUndefined();
  });

  it('keeps a line as the own ingredient when the user says the match is wrong', () => {
    expect(parseLine({ text: '100 g lekkere rode linzen', custom: true }, lookup).match).toBeUndefined();
  });

  it('flags a line without an ingredient name', () => {
    expect(parseLine({ text: '200 g' }, lookup).error).toBeTruthy();
  });
});

describe('building an own recipe', () => {
  it('turns the form into a valid recipe with the shopping-list ingredients', () => {
    const rec = build(pesto);
    const r = rec.recipe;
    expect(r.id).toBe('eigen-pasta-pesto-met-courgette');
    expect(r.source).toEqual({ type: 'personal', name: 'Zelf toegevoegd' });
    expect(r.baseServings).toBe(2);
    expect(r.prepMinutes + r.cookMinutes).toBe(30);
    expect(r.steps).toEqual([{ text: 'Kook de pasta.' }, { text: 'Bak de courgette en meng alles.' }]);
    expect(r.ingredients.map((i) => i.ingredientId)).toEqual(['spaghetti', 'courgette', 'knoflook', 'pesto', 'eigen-geroosterde-pijnboompitjes-van-de-markt', 'zout']);
    expect(r.ingredients[1]).toEqual({ ingredientId: 'courgette', amount: 1, unit: 'piece', note: 'in plakjes' });
    expect(rec.extraIngredients).toEqual([{ id: 'eigen-geroosterde-pijnboompitjes-van-de-markt', name: 'geroosterde pijnboompitjes van de markt', section: 'other', defaultUnit: 'g' }]);
    expect(r.dish).toBe('pasta');
    expect(r.palette).toEqual(paletteFor('Pasta pesto met courgette'));
    expect(rec.ingredientLines).toHaveLength(6);
  });

  it('uses the same own ingredient once when it appears twice', () => {
    const rec = build(form({ title: 'Test', ingredients: [{ text: '1 drakenfruit' }, { text: '2 drakenfruit' }], steps: ['Eten.'] }));
    expect(rec.extraIngredients).toHaveLength(1);
  });

  it('needs a name, an ingredient and a step', () => {
    expect(formProblems(emptyForm(), lookup).map((p) => p.field)).toEqual(['title', 'ingredients', 'steps']);
    expect(formProblems(pesto, lookup)).toEqual([]);
    expect(() => build(emptyForm())).toThrow();
  });

  it('picks a free id', () => {
    const taken = new Set(['eigen-soep', 'eigen-soep-2']);
    expect(newRecipeId('Soep', (id) => taken.has(id))).toBe('eigen-soep-3');
    expect(newRecipeId('!!!', () => false)).toBe('eigen-recept');
  });

  it('keeps the id and creation date when edited', () => {
    const first = build(pesto);
    const again = buildCustomRecipe({ ...recordToForm(first), title: 'Andere naam' }, INGREDIENTS, { taken: () => true, now: 200, createdAt: first.createdAt });
    expect(again.id).toBe(first.id);
    expect(again.createdAt).toBe(100);
    expect(again.updatedAt).toBe(200);
  });

  it('round-trips through the form, keeping automatic choices automatic', () => {
    const rec = build(pesto);
    const back = recordToForm(rec);
    expect(back).toMatchObject({ id: rec.id, title: pesto.title, servings: 2, minutes: 30, dish: null, palette: null });
    expect(back.ingredients.map((l) => l.text)).toEqual(pesto.ingredients.map((l) => l.text));
    const chosen = build({ ...pesto, dish: 'bowl', palette: ['#3f6e8a', '#e9d8a6'] });
    expect(recordToForm(chosen)).toMatchObject({ dish: 'bowl', palette: ['#3f6e8a', '#e9d8a6'] });
  });
});

describe('cover for own recipes', () => {
  it('guesses the dish from the name first, then the ingredients', () => {
    expect(guessDishShape('Tomatensoep van oma')).toBe('soup');
    expect(guessDishShape('Pizza margherita')).toBe('pizza');
    expect(guessDishShape('Pasta pesto')).toBe('pasta');
    expect(guessDishShape('Griekse salade')).toBe('salad');
    expect(guessDishShape('Iets lekkers', ['ui', 'spaghetti'])).toBe('pasta');
    expect(guessDishShape('Iets lekkers', ['basmatirijst'])).toBe('curry');
    expect(guessDishShape('Iets lekkers', ['groene-currypasta'])).toBe('plate');
    expect(guessDishShape('Iets lekkers', ['ui'])).toBe('plate');
    expect(guessDishShape('')).toBe('plate');
  });

  it('a chosen shape wins over the automatic one', () => {
    expect(dishShape({ id: 'eigen-tomatensoep', tags: [], dish: 'pizza' })).toBe('pizza');
    expect(dishShape({ id: 'eigen-tomatensoep', tags: [] })).toBe('soup');
  });
});

describe('own recipes in the app', () => {
  const rec = build(pesto);

  it('are added to the catalogue, first in the list, with their own ingredients', () => {
    const c = mergeCatalog(RECIPES, INGREDIENTS, [rec]);
    expect(c.recipes[0].id).toBe(rec.id);
    expect(c.recipes).toHaveLength(RECIPES.length + 1);
    expect(c.ingredientMap.get('eigen-geroosterde-pijnboompitjes-van-de-markt')?.section).toBe('other');
    expect(c.custom.has(rec.id)).toBe(true);
    expect(c.builtInCount).toBe(RECIPES.length);
    expect(c.cuisines).toContain('Eigen keuken');
    expect(c.loaded).toBe(true);
    expect(mergeCatalog(RECIPES, INGREDIENTS, undefined).loaded).toBe(false);
  });

  it('skips damaged ones and never replaces a built-in recipe', () => {
    const broken = { ...rec, id: 'eigen-kapot', recipe: { ...rec.recipe, id: 'eigen-kapot', steps: [] } };
    const clash = { ...rec, id: RECIPES[0].id, recipe: { ...rec.recipe, id: RECIPES[0].id } };
    const c = mergeCatalog(RECIPES, INGREDIENTS, [broken, clash]);
    expect(c.recipeMap.has('eigen-kapot')).toBe(false);
    expect(c.recipeMap.get(RECIPES[0].id)).toBe(RECIPES[0]);
    expect(c.custom.size).toBe(0);
  });

  it('end up on the shopping list, unknown items under Overig', () => {
    const c = mergeCatalog(RECIPES, INGREDIENTS, [rec]);
    const items = buildShoppingList({ weekKey: '2026-W48', meals: [{ recipeId: rec.id, servings: 4, addedAt: 0 }], recipes: c.recipeMap, ingredients: c.ingredientMap, pantry: new Set(), store: 'ah' });
    const own = items.find((i) => i.ingredientId === 'eigen-geroosterde-pijnboompitjes-van-de-markt')!;
    expect(own.section).toBe('other');
    expect(own.required).toBe('100 g');
    expect(items.find((i) => i.ingredientId === 'spaghetti')?.required).toBe('500 g');
  });

  it('can be found, and filtered on, in search', () => {
    const c = mergeCatalog(RECIPES, INGREDIENTS, [rec]);
    const index = buildSearchIndex(c.recipes, c.ingredientMap);
    const user = { favorites: new Set<string>(), cooked: new Set<string>(), disliked: new Set<string>() };
    expect(searchRecipes(c.recipes, index, { query: 'pijnboompitjes van de markt', duration: 'any', cuisine: null, status: null }, user).map((r) => r.id)).toEqual([rec.id]);
    expect(searchRecipes(c.recipes, index, { query: '', duration: 'any', cuisine: null, status: 'own' }, user).map((r) => r.id)).toEqual([rec.id]);
  });
});
