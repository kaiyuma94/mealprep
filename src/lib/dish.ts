import type { Recipe } from '../types';

/** The kind of dish, used to draw a recognisable illustrated cover. */
export type DishShape =
  | 'soup'
  | 'noodles'
  | 'pasta'
  | 'grains'
  | 'curry'
  | 'stamppot'
  | 'salad'
  | 'bowl'
  | 'pan'
  | 'ovendish'
  | 'pizza'
  | 'tart'
  | 'wrap'
  | 'burger'
  | 'plate';

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

export function dishShape(recipe: Pick<Recipe, 'id' | 'tags'>): DishShape {
  for (const [shape, pattern, tag] of RULES) {
    if (pattern.test(recipe.id) || (tag && recipe.tags.includes(tag))) return shape;
  }
  return 'plate';
}
