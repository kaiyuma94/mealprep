import { describe, expect, it } from 'vitest';
import example from '../docs/example-import.json';
import { INGREDIENT_MAP, INGREDIENTS, RECIPES } from '../src/data/catalog';
import { convertImport, normaliseUnit, parseIngredientLine } from '../src/lib/importer';
import { buildSearchIndex, searchRecipes, type SearchFilters } from '../src/lib/search';

const index = buildSearchIndex(RECIPES, INGREDIENT_MAP);
const user = { favorites: new Set<string>(), cooked: new Set<string>(), disliked: new Set<string>() };
const f = (p: Partial<SearchFilters>): SearchFilters => ({ query: '', duration: 'any', cuisine: null, status: null, ...p });
const ids = (p: Partial<SearchFilters>, u = user) => searchRecipes(RECIPES, index, f(p), u).map((r) => r.id);

describe('search', () => {
  it('finds by name, ingredient (incl. aliases), cuisine and tag', () => {
    expect(ids({ query: 'risotto' })).toContain('risotto-caprese');
    expect(ids({ query: 'halloumi' })).toContain('wraps-halloumi-gekaramelliseerde-ui');
    expect(ids({ query: 'chickpeas' })).toContain('harira-linzen-kikkererwten'); // English alias
    expect(ids({ query: 'koreaans' })).toContain('stamppot-koreaanse-kruiden-sticky-champignons');
    for (const id of ids({ query: 'koreaans' })) {
      const r = RECIPES.find((x) => x.id === id)!;
      // Matches on name or cuisine, or on an ingredient alias (gochujang = "koreaanse pepperpasta").
      const names = r.ingredients.flatMap((ri) => { const i = INGREDIENT_MAP.get(ri.ingredientId); return i ? [i.name, ...(i.aliases ?? [])] : []; });
      expect(`${r.title} ${r.subtitle ?? ''} ${r.cuisine} ${names.join(' ')}`.toLowerCase()).toContain('korea');
    }
    const stamppot = ids({ query: 'stamppot' });
    expect(stamppot).toEqual(expect.arrayContaining(['stamppot-zoete-aardappel-boerenkool', 'broccoli-spitskool-stamppot-jus', 'stamppot-koreaanse-kruiden-sticky-champignons']));
    expect(ids({ query: 'creme fraiche' })).toContain('vegetarische-stroganoff-rijst'); // accents folded
  });

  it('requires every word to match', () => {
    const both = ids({ query: 'paneer curry' });
    expect(both).toContain('indiase-curry-bloemkool-paneer');
    for (const id of both) expect(RECIPES.find((x) => x.id === id)!.ingredients.some((i) => i.ingredientId === 'paneer')).toBe(true);
    expect(both.length).toBeLessThan(ids({ query: 'curry' }).length);
    expect(ids({ query: 'paneer bloemkool' })).toContain('indiase-curry-bloemkool-paneer');
  });

  it('filters by duration, cuisine and status', () => {
    for (const id of ids({ duration: 'quick' })) {
      const r = RECIPES.find((x) => x.id === id)!;
      expect(r.prepMinutes + r.cookMinutes).toBeLessThanOrEqual(25);
    }
    const dutch = ids({ cuisine: 'Nederlands' });
    expect(dutch).toEqual(expect.arrayContaining(['broccoli-spitskool-stamppot-jus', 'stamppot-zoete-aardappel-boerenkool']));
    for (const id of dutch) expect(RECIPES.find((x) => x.id === id)!.cuisine).toBe('Nederlands');
    const u = { ...user, favorites: new Set(['risotto-caprese']), cooked: new Set(['pasta-alla-norma']) };
    expect(ids({ status: 'favorites' }, u)).toEqual(['risotto-caprese']);
    expect(ids({ status: 'cooked' }, u)).toEqual(['pasta-alla-norma']);
    expect(ids({ status: 'new' }, u)).not.toContain('pasta-alla-norma');
  });
});

describe('ingredient line parser', () => {
  it.each([
    ['300 g bloemkool, in roosjes', { amount: 300, unit: 'g', name: 'bloemkool', note: 'in roosjes' }],
    ['2 tenen knoflook', { amount: 2, unit: 'tenen', name: 'knoflook' }],
    ['1,5 el olijfolie', { amount: 1.5, unit: 'el', name: 'olijfolie' }],
    ['½ rode peper', { amount: 0.5, unit: '', name: 'rode peper' }],
    ['1½ tl komijn', { amount: 1.5, unit: 'tl', name: 'komijn' }],
    ['naar smaak zout', { amount: null, name: 'zout' }],
    ['5 g sambal (optioneel)', { amount: 5, unit: 'g', name: 'sambal', optional: true }],
    ['1 rode ui', { amount: 1, unit: '', name: 'rode ui' }],
  ])('%s', (line, expected) => {
    expect(parseIngredientLine(line)).toMatchObject(expected);
  });
});

describe('recipe import', () => {
  it('maps Dutch names and units to canonical IDs', () => {
    const res = convertImport(example, INGREDIENTS);
    expect(res.issues.filter((i) => i.severity === 'error')).toEqual([]);
    const r = res.recipes[0];
    expect(r.id).toBe('snelle-pasta-pesto-met-doperwten');
    expect(r.ingredients.map((i) => [i.ingredientId, i.amount, i.unit])).toEqual([
      ['spaghetti', 180, 'g'], ['doperwten', 150, 'g'], ['pesto', 4, 'tbsp'], ['knoflook', 1, 'clove'],
      ['citroen', 0.5, 'piece'], ['harde-kaas', 30, 'g'], ['peper', null, 'pinch'],
    ]);
    expect(r.source.type).toBe('personal');
  });

  it('normalises Dutch units', () => {
    expect(normaliseUnit('EL')).toBe('tbsp');
    expect(normaliseUnit('theelepel')).toBe('tsp');
    expect(normaliseUnit('stuk(s)')).toBe('piece');
    expect(normaliseUnit('handvol')).toBeNull();
  });

  it('reports unknown ingredients and incomplete recipes', () => {
    const res = convertImport(
      {
        format: 'weekmenu-recipe-import',
        source: { type: 'personal', name: 'Wij' },
        recipes: [
          { title: 'Drakenstoof', cuisine: 'Fantasie', prepMinutes: 1, cookMinutes: 1, ingredients: ['1 g drakenpoeder'], steps: ['Roeren.'] },
          { title: 'Geen stappen', cuisine: 'X', prepMinutes: 1, cookMinutes: 1, ingredients: ['1 ui'], steps: [] },
        ],
      },
      INGREDIENTS,
    );
    expect(res.recipes).toEqual([]);
    expect(res.unknownIngredients).toEqual(['drakenpoeder']);
    expect(res.issues.some((i) => i.recipeId === 'geen-stappen' && i.path === 'steps')).toBe(true);
  });

  it('rejects inspired imports without a source link, and licensed ones without a license', () => {
    expect(convertImport({ ...example, source: { type: 'inspired', name: 'HelloFresh' } }, INGREDIENTS).recipes).toEqual([]);
    expect(convertImport({ ...example, source: { type: 'licensed', name: 'Site' } }, INGREDIENTS).recipes).toEqual([]);
  });

  it('rejects files in the wrong format', () => {
    expect(convertImport({ recipes: [] }, INGREDIENTS).issues[0].severity).toBe('error');
  });
});
