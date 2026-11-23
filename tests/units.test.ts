import { describe, expect, it } from 'vitest';
import { INGREDIENT_MAP } from '../src/data/catalog';
import { convert, formatFraction, formatQuantity, scaleAmount, toBase } from '../src/lib/units';

const ing = (id: string) => INGREDIENT_MAP.get(id)!;

describe('unit conversion', () => {
  it('converts within a dimension', () => {
    expect(toBase(1.5, 'kg')).toEqual({ amount: 1500, unit: 'g' });
    expect(toBase(2, 'tbsp')).toEqual({ amount: 30, unit: 'ml' });
    expect(convert(1, 'l', 'ml')).toBe(1000);
    expect(convert(3, 'tsp', 'ml')).toBe(15);
  });

  it('converts pieces to grams with ingredient weight', () => {
    expect(convert(2, 'piece', 'g', ing('zoete-aardappel'))).toBe(600);
    expect(convert(300, 'g', 'piece', ing('ui'))).toBe(2);
  });

  it('converts volume to mass with density', () => {
    expect(convert(3, 'tbsp', 'g', ing('mayonaise'))).toBeCloseTo(42.75);
    expect(convert(2, 'tsp', 'g', ing('komijn'))).toBeCloseTo(5);
  });

  it('refuses incompatible conversions', () => {
    expect(convert(1, 'pinch', 'g', ing('zout'))).toBeNull();
    expect(convert(100, 'ml', 'g')).toBeNull();
    expect(convert(1, 'pack', 'g', ing('taartdeeg'))).toBeNull();
  });
});

describe('serving-size scaling', () => {
  it('scales linearly', () => {
    expect(scaleAmount(150, 2, 4)).toBe(300);
    expect(scaleAmount(1, 2, 3)).toBe(1.5);
    expect(scaleAmount(0.5, 2, 1)).toBe(0.25);
  });
  it('keeps "naar smaak" unquantified', () => {
    expect(scaleAmount(null, 2, 6)).toBeNull();
  });
});

describe('Dutch formatting', () => {
  it('formats fractions', () => {
    expect(formatFraction(1.5)).toBe('1½');
    expect(formatFraction(0.25)).toBe('¼');
    expect(formatFraction(0.333)).toBe('⅓');
    expect(formatFraction(2)).toBe('2');
  });
  it('uses Dutch units and decimal commas', () => {
    expect(formatQuantity(1500, 'g')).toBe('1,5 kg');
    expect(formatQuantity(1250, 'ml')).toBe('1,3 l');
    expect(formatQuantity(212, 'g')).toBe('210 g');
    expect(formatQuantity(1.5, 'tbsp')).toBe('1½ el');
    expect(formatQuantity(2, 'tsp')).toBe('2 tl');
    expect(formatQuantity(30, 'ml', { preferSpoons: true })).toBe('2 el');
    expect(formatQuantity(10, 'ml', { preferSpoons: true })).toBe('2 tl');
    expect(formatQuantity(3, 'clove')).toBe('3 tenen');
    expect(formatQuantity(1, 'clove')).toBe('1 teen');
    expect(formatQuantity(1, 'pinch')).toBe('1 snufje');
    expect(formatQuantity(null, 'pinch')).toBe('naar smaak');
  });
});
