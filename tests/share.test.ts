import { describe, expect, it, vi } from 'vitest';
import { INGREDIENT_MAP, RECIPE_MAP } from '../src/data/catalog';
import { recipeToText, recipeUrl, shareText, weekMenuToText, type CopyDocument, type ShareNavigator } from '../src/lib/share';
import type { WeeklyMealPlan } from '../src/types';

const data = { title: 'Weekmenu', text: 'Hallo' };
const clipboard = () => ({ writeText: vi.fn().mockResolvedValue(undefined) });
const named = (name: string) => Object.assign(new Error(name), { name });

describe('shareText', () => {
  it("opens the phone's share menu with the text and no separate url", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    const nav = { share, canShare: () => true, clipboard: clipboard() } as ShareNavigator;
    expect(await shareText(data, nav)).toBe('shared');
    expect(share).toHaveBeenCalledWith({ title: 'Weekmenu', text: 'Hallo' });
    expect(nav.clipboard!.writeText).not.toHaveBeenCalled();
  });

  it('does nothing else when the user closes the share menu', async () => {
    const nav = { share: vi.fn().mockRejectedValue(named('AbortError')), clipboard: clipboard() } as ShareNavigator;
    expect(await shareText(data, nav)).toBe('cancelled');
    expect(nav.clipboard!.writeText).not.toHaveBeenCalled();
  });

  it('copies the text when sharing is refused', async () => {
    const nav = { share: vi.fn().mockRejectedValue(named('NotAllowedError')), clipboard: clipboard() } as ShareNavigator;
    expect(await shareText(data, nav)).toBe('copied');
    expect(nav.clipboard!.writeText).toHaveBeenCalledWith('Hallo');
  });

  it('copies the text when there is no share menu (desktop)', async () => {
    const nav = { clipboard: clipboard() } as ShareNavigator;
    expect(await shareText(data, nav)).toBe('copied');
    expect(nav.clipboard!.writeText).toHaveBeenCalledWith('Hallo');
  });

  it('reports a failure when copying is impossible too, and cleans up', async () => {
    const nav: ShareNavigator = { clipboard: { writeText: vi.fn().mockRejectedValue(new Error('no')) } };
    const remove = vi.fn();
    const ta = { value: '', setAttribute: vi.fn(), style: { position: '', opacity: '' }, select: vi.fn(), remove };
    const doc: CopyDocument = { createElement: () => ta, body: { appendChild: vi.fn() }, execCommand: () => false };
    expect(await shareText(data, nav, doc)).toBe('failed');
    expect(ta.value).toBe('Hallo');
    expect(remove).toHaveBeenCalled();
  });
});

describe('share texts', () => {
  const plan: WeeklyMealPlan = {
    weekKey: '2026-W48',
    mealTarget: 4,
    meals: [
      { recipeId: 'harira-linzen-kikkererwten', servings: 2, addedAt: 0, cookedAt: 1 },
      { recipeId: 'shakshuka-falafel-witte-kaas', servings: 3, addedAt: 0 },
      { recipeId: 'bestaat-niet-meer', servings: 2, addedAt: 0 },
    ],
    updatedAt: 0,
  };

  it('lists the week menu with links to the recipes', () => {
    const text = weekMenuToText(plan, RECIPE_MAP, 'https://weekmenu.example/');
    const harira = RECIPE_MAP.get('harira-linzen-kikkererwten')!;
    const lines = text.split('\n');
    expect(lines[0]).toBe('Weekmenu Week 48 (23 – 29 nov)');
    expect(lines[2]).toBe(`1. ${harira.title} (${harira.prepMinutes + harira.cookMinutes} min, 2 pers.) ✓ gekookt`);
    expect(lines[3]).toBe('   https://weekmenu.example/recipe/harira-linzen-kikkererwten');
    expect(lines[4]).toMatch(/^2\. .*\(\d+ min, 3 pers\.\)$/);
    expect(text).not.toContain('bestaat-niet-meer');
  });

  it('says so when the week is empty', () => {
    expect(weekMenuToText({ ...plan, meals: [] }, RECIPE_MAP)).toContain('Nog geen maaltijden gekozen.');
  });

  it('writes out a recipe scaled to the chosen servings, with method and link', () => {
    const r = RECIPE_MAP.get('shakshuka-falafel-witte-kaas')!;
    const text = recipeToText(r, 4, INGREDIENT_MAP, 'https://weekmenu.example');
    expect(text.startsWith(`${r.title}\n`)).toBe(true);
    expect(text).toContain('4 personen');
    expect(text).toMatch(/^- 8 eieren/m); // 4 eggs for 2, doubled
    expect(text).toContain('\nBereiding\n1. ');
    expect(text.split('\n').filter((l) => /^\d+\. /.test(l))).toHaveLength(r.steps.length);
    expect(text.endsWith('\nhttps://weekmenu.example/recipe/shakshuka-falafel-witte-kaas')).toBe(true);
  });

  it('builds recipe links without double slashes', () => {
    expect(recipeUrl('a', 'https://x.nl//')).toBe('https://x.nl/recipe/a');
  });
});
