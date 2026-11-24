import { describe, expect, it } from 'vitest';
import { INGREDIENT_MAP, RECIPE_MAP } from '../src/data/catalog';
import { aggregateIngredients, buildShoppingList, shoppingListToText, suggestPurchase } from '../src/lib/shopping';
import type { PlannedMeal, ShoppingState, StoreId } from '../src/types';

const meal = (recipeId: string, servings = 2): PlannedMeal => ({ recipeId, servings, addedAt: 0 });
const build = (meals: PlannedMeal[], state?: ShoppingState, store: StoreId = 'lidl', pantry = new Set(['zout', 'peper', 'olijfolie'])) =>
  buildShoppingList({ weekKey: '2026-W48', meals, recipes: RECIPE_MAP, ingredients: INGREDIENT_MAP, pantry, state, store });
const item = (items: ReturnType<typeof build>, key: string) => items.find((i) => i.key === key)!;
const st = (overrides: ShoppingState['overrides'], manualItems: ShoppingState['manualItems'] = []): ShoppingState => ({ weekKey: '2026-W48', overrides, manualItems, updatedAt: 0 });

describe('ingredient aggregation', () => {
  it('merges the same canonical ingredient across recipes', () => {
    const lines = aggregateIngredients([meal('harira-linzen-kikkererwten'), meal('lasagne-gegrilde-groenten')], RECIPE_MAP, INGREDIENT_MAP);
    const t = lines.find((l) => l.ingredientId === 'tomatenblokjes')!;
    expect(t.totals).toEqual([{ unit: 'g', amount: 800, spoons: false }]);
    expect(t.recipes.map((r) => r.id).sort()).toEqual(['harira-linzen-kikkererwten', 'lasagne-gegrilde-groenten']);
  });

  it('scales by servings per meal', () => {
    const lines = aggregateIngredients([meal('shakshuka-falafel-witte-kaas', 4)], RECIPE_MAP, INGREDIENT_MAP);
    expect(lines.find((l) => l.ingredientId === 'ei')!.totals[0].amount).toBe(8);
    expect(lines.find((l) => l.ingredientId === 'passata')!.totals[0].amount).toBe(400);
  });

  it('converts compatible units into the preferred unit (el → g)', () => {
    const lines = aggregateIngredients([meal('crispy-sesam-bloemkool'), meal('surinaamse-roerbak-tempeh')], RECIPE_MAP, INGREDIENT_MAP);
    const mayo = lines.find((l) => l.ingredientId === 'mayonaise')!;
    expect(mayo.totals).toHaveLength(1);
    expect(mayo.totals[0].unit).toBe('g');
    expect(mayo.totals[0].amount).toBeCloseTo(4 * 15 * 0.95);
  });

  it('converts pieces to the package unit (4 wortels → zak van 500 g)', () => {
    const lines = aggregateIngredients([meal('harira-linzen-kikkererwten'), meal('vegan-pasta-e-fagioli')], RECIPE_MAP, INGREDIENT_MAP);
    const wortel = lines.find((l) => l.ingredientId === 'wortel')!;
    expect(wortel.totals).toEqual([{ unit: 'piece', amount: 4, spoons: false }]);
    expect(suggestPurchase(wortel, INGREDIENT_MAP.get('wortel')!)?.label).toBe('1 × zak (500 g)');
  });

  it('tracks naar-smaak ingredients without quantity', () => {
    const lines = aggregateIngredients([meal('lasagne-gegrilde-groenten')], RECIPE_MAP, INGREDIENT_MAP);
    const zout = lines.find((l) => l.ingredientId === 'zout')!;
    expect(zout.toTaste).toBe(true);
    expect(zout.totals).toHaveLength(0);
  });

  it('ignores recipes missing from the catalog', () => {
    expect(aggregateIngredients([meal('bestaat-niet')], RECIPE_MAP, INGREDIENT_MAP)).toEqual([]);
  });
});

describe('package advice', () => {
  const need = (id: string, amount: number, unit: 'g' | 'ml' | 'piece') =>
    suggestPurchase({ ingredientId: id, totals: [{ unit, amount, spoons: false }], toTaste: false, recipes: [] }, INGREDIENT_MAP.get(id)!)!;

  it('picks the smallest package that is enough (300 g aardappelen → geschilde zak van 500 g, not 1,5 kg)', () => {
    expect(need('aardappel', 300, 'g').label).toBe('1 × zak geschild (500 g)');
    expect(need('aardappel', 300, 'g').alternatives).toEqual(['1 × zak (1 kg)', '1 × zak (1,5 kg)', '1 × zak (3 kg)']);
    expect(need('aardappel', 800, 'g').label).toBe('1 × zak (1 kg)');
    expect(need('basmatirijst', 150, 'g').label).toBe('1 × pak (400 g)');
    expect(need('kokosmelk', 180, 'ml').label).toBe('1 × blikje (200 ml)');
  });

  it('combines package sizes when that leaves less over', () => {
    expect(need('champignons', 600, 'g').label).toBe('1 × bakje (250 g) + 1 × bakje (400 g)');
    expect(need('ei', 8, 'piece').label).toBe('1 × doos van 10');
    expect(need('ei', 12, 'piece').label).toBe('2 × doos van 6');
    // Same amount: one big bag beats two smaller ones.
    expect(need('aardappel', 2600, 'g').label).toBe('1 × zak (3 kg)');
  });

  it('buys loose when the ingredient is sold loose and that fits better', () => {
    const p = need('paprika', 2, 'piece');
    expect(p.label).toBeUndefined(); // "2" already says it: two loose ones
    expect(p.alternatives).toEqual(['1 × verpakking van 3']);
    expect(need('paprika', 3, 'piece').label).toBe('1 × verpakking van 3');
    expect(need('zoete-aardappel', 450, 'g').label).toBe('2 zoete aardappels');
    expect(need('bloemkool', 0.4, 'piece').label).toBe('1 × zak roosjes (400 g)');
    expect(need('bloemkool', 0.6, 'piece').label).toBe('1 bloemkool');
  });

  it('shows the advice for the substitute when one is chosen', () => {
    const items = build([meal('harira-linzen-kikkererwten')], st({ tomatenblokjes: { substituteId: 'passata' } }));
    const t = item(items, 'tomatenblokjes');
    expect(t.name).toBe(INGREDIENT_MAP.get('passata')!.name);
    expect(t.purchase).toMatch(/pak \(500 g\)/);
  });
});

describe('shopping list', () => {
  it('distinguishes required amount from packaging', () => {
    const items = build([meal('harira-linzen-kikkererwten'), meal('lasagne-gegrilde-groenten')]);
    const t = item(items, 'tomatenblokjes');
    expect(t.required).toBe('800 g');
    expect(t.purchase).toBe('2 × blik of pak (400 g)');
    const eggs = item(build([meal('shakshuka-falafel-witte-kaas')]), 'ei');
    expect(eggs.required).toBe('4');
    expect(eggs.purchase).toBe('1 × doos van 6');
  });

  it('rounds loose produce up to whole pieces', () => {
    const items = build([meal('flammkuchen-mozzarella-courgette')]); // ½ rode ui
    expect(item(items, 'rode-ui').required).toBe('½');
    expect(item(items, 'rode-ui').purchase).toBe('1 rode ui');
  });

  it('suggests a package for unmeasurable amounts', () => {
    const laurier = item(build([meal('vegan-pasta-e-fagioli')]), 'laurier');
    expect(laurier.required).toBe('1');
    expect(laurier.purchase).toBe('1 × potje');
  });

  it('follows the walking route of the selected supermarket', () => {
    const meals = [meal('quiche-broccoli-oude-kaas'), meal('gebakken-rijst-roerei-paksoi'), meal('lasagne-gegrilde-groenten')];
    const sections = (s: StoreId) => [...new Set(build(meals, undefined, s).map((i) => i.section))];
    expect(sections('lidl').indexOf('produce')).toBe(0);
    // Lidl: bread before chilled; AH: chilled & dairy before bread; Jumbo: frozen before pasta.
    expect(sections('lidl').indexOf('dairy-eggs')).toBeGreaterThan(sections('lidl').indexOf('chilled'));
    expect(sections('ah').indexOf('dairy-eggs')).toBeLessThan(sections('ah').indexOf('pasta-rice-grains'));
    expect(sections('jumbo').indexOf('frozen')).toBeLessThan(sections('jumbo').indexOf('pasta-rice-grains'));
    expect(sections('lidl').indexOf('frozen')).toBeGreaterThan(sections('lidl').indexOf('pasta-rice-grains'));
  });

  it('flags items that may be hard to find at the selected store', () => {
    const atLidl = item(build([meal('surinaamse-roerbak-tempeh')]), 'tempeh');
    expect(atLidl.limitedHere).toBe(true);
    expect(atLidl.alsoAt).toEqual(['ah', 'jumbo']);
    const atAh = item(build([meal('surinaamse-roerbak-tempeh')], undefined, 'ah'), 'tempeh');
    expect(atAh.limitedHere).toBe(false);
    expect(atAh.alsoAt).toEqual([]);
  });

  it('marks pantry items in stock and lets overrides win', () => {
    const items = build([meal('lasagne-gegrilde-groenten')]);
    expect(item(items, 'olijfolie').inStock).toBe(true);
    expect(item(items, 'olijfolie').fromPantry).toBe(true);
    const o = build([meal('lasagne-gegrilde-groenten')], st({ olijfolie: { inStock: false }, knoflook: { inStock: true } }));
    expect(item(o, 'olijfolie').inStock).toBe(false);
    expect(item(o, 'knoflook').inStock).toBe(true);
  });

  it('applies substitutions', () => {
    const sub = item(build([meal('surinaamse-roerbak-tempeh')], st({ tempeh: { substituteId: 'tofu' } })), 'tempeh');
    expect(sub.name).toBe('tofu naturel');
    expect(sub.substitutedFrom).toBe('tempeh');
    expect(sub.limitedHere).toBe(false);
  });

  it('keeps manual items, checks and edits when the plan changes', () => {
    const state = st({ knoflook: { checked: true }, passata: { editedQuantity: '1 pak' } }, [
      { id: 'm1', name: 'Koffie', quantity: '1 zak', section: 'other', checked: true, createdAt: 0 },
    ]);
    const before = build([meal('lasagne-gegrilde-groenten')], state);
    const after = build([meal('lasagne-gegrilde-groenten'), meal('pasta-alla-norma')], state);
    for (const list of [before, after]) {
      expect(item(list, 'knoflook').checked).toBe(true);
      expect(item(list, 'passata').required).toBe('1 pak');
      expect(item(list, 'manual:m1')).toMatchObject({ name: 'Koffie', checked: true, manual: true });
    }
    expect(item(after, 'knoflook').required).not.toBe(item(before, 'knoflook').required);
  });

  it('hides removed items', () => {
    expect(build([meal('lasagne-gegrilde-groenten')], st({ passata: { hidden: true } })).find((i) => i.key === 'passata')).toBeUndefined();
  });

  it('produces readable Dutch plain text without in-stock items', () => {
    const text = shoppingListToText(build([meal('harira-linzen-kikkererwten'), meal('surinaamse-roerbak-tempeh')]), '2026-W48', 'lidl');
    expect(text).toContain('Boodschappenlijst Lidl – Week 48 (23 – 29 nov)');
    expect(text).toContain('GROENTE & FRUIT');
    expect(text).toMatch(/- Linzen in blik: 1 × blik of pot \(400 g\) \(nodig: 400 g\)/);
    expect(text).toMatch(/- Tempeh: .* – mogelijk lastig bij Lidl, anders Albert Heijn of Jumbo/);
    expect(text).not.toMatch(/^- Olijfolie/m);
    expect(text).toContain('Al in huis: ');
  });
});
