import { describe, expect, it } from 'vitest';
import { RECIPES } from '../src/data/catalog';
import { dishShape, type DishShape } from '../src/lib/dish';

const shapeOf = (id: string) => dishShape(RECIPES.find((r) => r.id === id)!);

describe('dish shapes for covers', () => {
  it.each<[string, DishShape]>([
    ['drie-tomatensoep-kaascroutons', 'soup'],
    ['miso-ramen-peultjes-gekookt-ei', 'noodles'],
    ['curry-noedelsoep-kokosmelk', 'noodles'],
    ['pasta-alla-norma', 'pasta'],
    ['goedgevulde-minestrone-farfalle', 'soup'],
    ['rigatoni-al-forno-drie-kazen', 'ovendish'],
    ['lasagne-gegrilde-groenten', 'ovendish'],
    ['risotto-caprese', 'grains'],
    ['vegan-massaman-curry', 'curry'],
    ['stamppot-zoete-aardappel-boerenkool', 'stamppot'],
    ['caesar-salade-geroosterde-kikkererwten', 'salad'],
    ['indiase-linzenstoof-spinaziesalade', 'curry'],
    ['pokebowl-gemarineerde-tofu', 'bowl'],
    ['burritobowl-tomatenrijst-tortillachips', 'bowl'],
    ['shakshuka-falafel-witte-kaas', 'pan'],
    ['platbroodpizza-funghi-mozzarella', 'pizza'],
    ['flammkuchen-mozzarella-courgette', 'pizza'],
    ['quiche-broccoli-oude-kaas', 'tart'],
    ['brie-bladerdeeg-appel-krieltjessalade', 'tart'],
    ['zwartebonentacos-avocadosalsa', 'wrap'],
    ['vegaburger-truffelmayonaise', 'burger'],
    ['crispy-sesam-bloemkool', 'plate'],
  ])('%s → %s', (id, shape) => {
    expect(shapeOf(id)).toBe(shape);
  });

  it('gives every recipe a shape and uses every shape', () => {
    const used = new Set(RECIPES.map(dishShape));
    expect(used.size).toBe(15);
  });
});
