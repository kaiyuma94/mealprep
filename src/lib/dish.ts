import type { DishShape, Recipe } from '../types';

export type { DishShape };

/**
 * First match wins, so the order matters: e.g. a noodle soup is "noodles",
 * a pasta bake is "ovendish" before it is "pasta", and a tart served with a
 * salad is still a "tart". Matched against the recipe id, plus an optional tag.
 */
const RULES: Array<[DishShape, RegExp, string?]> = [
  ['noodles', /ramen|(^|-)pho(-|$)|laksa|noedel|bami|(^|-)mie(-|$)/],
  ['soup', /soep|harira/, 'soep'],
  ['stamppot', /stamppot|puree/, 'stamppot'],
  ['pizza', /pizza|flammkuchen|lahmacun/],
  ['tart', /quiche|taart|galette|bladerdeeg|filodeeg|empanada/],
  [
    'ovendish',
    /lasagne|moussaka|melanzane|schotel|gratin|al-forno|enchilada|kaaslaag|nachos|kapsalon|(orzo|tortelloni|fusilli)-oven|-oven-(orzo|fusilli)/,
  ],
  ['burger', /burger|broodje|(^|-)bao(-|$)|sabich/],
  ['wrap', /wrap|taco|quesadilla|burrito(?!bowl)/],
  ['bowl', /bowl|bibimbap|gado-gado/, 'bowl'],
  ['pan', /shakshuka|frittata|omelet|paella|huevos|roerbak|stirfry|nasi-goreng|gebakken-rijst/, 'wok'],
  ['salad', /^$/, 'salade'],
  ['pasta', /spaghetti|penne|farfalle|fusilli|conchiglie|linguine|tagliatelle|rigatoni|orecchiette|ravioli|tortelloni|gnocchi/, 'pasta'],
  ['grains', /risotto|orzo|parelgerst|couscous|bulgur|quinoa|mujaddara/],
  ['curry', /curry|dahl|stoof|stroganoff|tikka|korma|massaman|chili|rijst/, 'curry'],
];

export function dishShape(recipe: Pick<Recipe, 'id' | 'tags' | 'dish'>): DishShape {
  if (recipe.dish && DISH_SHAPES.includes(recipe.dish)) return recipe.dish;
  for (const [shape, pattern, tag] of RULES) {
    if (pattern.test(recipe.id) || (tag && recipe.tags.includes(tag))) return shape;
  }
  return 'plate';
}

export const DISH_SHAPES: DishShape[] = ['plate', 'pasta', 'curry', 'soup', 'noodles', 'grains', 'salad', 'bowl', 'pan', 'ovendish', 'pizza', 'tart', 'wrap', 'burger', 'stamppot'];

export const DISH_LABELS: Record<DishShape, string> = {
  plate: 'Bord',
  pasta: 'Pasta',
  curry: 'Curry met rijst',
  soup: 'Soep',
  noodles: 'Noedels',
  grains: 'Risotto & granen',
  salad: 'Salade',
  bowl: 'Bowl',
  pan: 'Uit de pan',
  ovendish: 'Ovenschotel',
  pizza: 'Pizza',
  tart: 'Taart & quiche',
  wrap: 'Wrap & taco',
  burger: 'Burger & broodje',
  stamppot: 'Stamppot',
};

const slug = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

/**
 * Best guess for a recipe the user is typing: first the dish name, then the
 * main ingredients (spaghetti → pasta, rijst → curry with rice, …).
 */
export function guessDishShape(title: string, ingredientIds: string[] = []): DishShape {
  const t = slug(title);
  // An empty id would match the salad rule (which only matches by tag).
  const byName = t ? dishShape({ id: t, tags: [] }) : 'plate';
  if (byName !== 'plate') return byName;
  if (/(^|-)(pasta|macaroni|tortellini|lasagnette)(-|$)/.test(t)) return 'pasta';
  if (/(^|-)(salade|salad)(-|$)/.test(t)) return 'salad';
  const has = (re: RegExp) => ingredientIds.some((id) => re.test(id) && !/curry|masala/.test(id));
  if (has(/(^|-)(spaghetti|penne|fusilli|tagliatelle|linguine|macaroni|rigatoni|farfalle|conchiglie|orecchiette|tortellini|tortelloni|ravioli|gnocchi|pasta)$/)) return 'pasta';
  if (has(/(^|-)(mie|udon|ramen|rijstnoedels|noedels)$/)) return 'noodles';
  if (has(/(^|-)(couscous|parelcouscous|bulgur|quinoa|parelgerst|orzo|risottorijst)$/)) return 'grains';
  if (has(/rijst$/)) return 'curry';
  if (has(/^(tortilla-wrap|mini-tortilla|tacoschelpen)$/)) return 'wrap';
  if (has(/^(hamburgerbol|afbakbroodje|bao-buns)$/)) return 'burger';
  if (has(/^(taartdeeg|bladerdeeg|filodeeg)$/)) return 'tart';
  return 'plate';
}
