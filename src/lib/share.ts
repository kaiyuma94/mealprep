import type { Ingredient, Recipe, WeeklyMealPlan } from '../types';
import { formatQuantity, ingredientLabel, scaleAmount } from './units';
import { weekNumberLabel, weekRangeLabel } from './week';

// ---------- Sharing ----------

export type ShareOutcome = 'shared' | 'copied' | 'cancelled' | 'failed';

type ShareData = { title: string; text: string };

/** The parts of `navigator` used here (kept minimal so tests can pass a fake). */
export interface ShareNavigator {
  share?: (data: ShareData) => Promise<void>;
  canShare?: (data: ShareData) => boolean;
  clipboard?: { writeText: (text: string) => Promise<void> };
}

interface HiddenTextarea {
  value: string;
  setAttribute: (name: string, value: string) => void;
  style: { position: string; opacity: string };
  select: () => void;
  remove: () => void;
}

/** The parts of `document` used for the old-style copy fallback. */
export interface CopyDocument {
  createElement: (tag: 'textarea') => HiddenTextarea;
  body: { appendChild: (node: HiddenTextarea) => unknown };
  execCommand: (command: 'copy') => boolean;
}

const browser = globalThis as unknown as { navigator: ShareNavigator; document: CopyDocument };
const browserNavigator = () => browser.navigator;
const browserDocument = () => browser.document;

/**
 * Opens the phone's own share menu (WhatsApp, Messages, Mail, …) with the
 * text filled in. No service is contacted: the browser hands the text to the
 * app the user picks. Where there is no share menu (some desktop browsers),
 * the text is copied to the clipboard instead.
 *
 * Call it straight from a tap handler without awaiting anything first:
 * browsers only open the share menu in direct response to a tap.
 */
export async function shareText(data: ShareData, nav: ShareNavigator = browserNavigator(), doc: CopyDocument = browserDocument()): Promise<ShareOutcome> {
  // No separate url on purpose: some apps (WhatsApp among them) drop the text
  // when a url is given as well. Links are part of the text instead.
  const payload = { title: data.title, text: data.text };
  if (typeof nav.share === 'function' && (!nav.canShare || nav.canShare(payload))) {
    try {
      await nav.share(payload);
      return 'shared';
    } catch (e) {
      if ((e as Error)?.name === 'AbortError') return 'cancelled';
      // E.g. NotAllowedError: fall back to copying below.
    }
  }
  return copyText(data.text, nav, doc);
}

export async function copyText(text: string, nav: ShareNavigator = browserNavigator(), doc: CopyDocument = browserDocument()): Promise<ShareOutcome> {
  try {
    if (!nav.clipboard) throw new Error('No clipboard');
    await nav.clipboard.writeText(text);
    return 'copied';
  } catch {
    // Older browsers or no clipboard permission.
    const ta = doc.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    doc.body.appendChild(ta);
    ta.select();
    let ok = false;
    try {
      ok = doc.execCommand('copy');
    } catch {
      ok = false;
    }
    ta.remove();
    return ok ? 'copied' : 'failed';
  }
}

/** The address of a recipe page in this app, e.g. https://…/recipe/harira-linzen-kikkererwten. */
export function recipeUrl(recipeId: string, base: string): string {
  return `${base.replace(/\/+$/, '')}/recipe/${recipeId}`;
}

// ---------- Texts ----------

const totalMinutes = (r: Recipe) => r.prepMinutes + r.cookMinutes;
const persons = (n: number) => `${n} ${n === 1 ? 'persoon' : 'personen'}`;

/** One ingredient as plain text, e.g. "400 g linzen in blik, uitgelekt". */
export function ingredientText(ri: Recipe['ingredients'][number], recipe: Recipe, servings: number, ingredients: Map<string, Ingredient>): string | null {
  const ing = ingredients.get(ri.ingredientId);
  if (!ing) return null;
  const amount = scaleAmount(ri.amount, recipe.baseServings, servings);
  const qty = amount === null ? '' : `${formatQuantity(amount, ri.unit)} `;
  const note = ri.note ? `, ${ri.note}` : '';
  const optional = ri.optional ? ' (optioneel)' : '';
  const toTaste = amount === null ? ' naar smaak' : '';
  return `${qty}${ingredientLabel(ing, amount, ri.unit)}${note}${optional}${toTaste}`;
}

/** The week menu, for sending to whoever does the shopping or cooking. */
export function weekMenuToText(plan: WeeklyMealPlan, recipes: Map<string, Recipe>, baseUrl?: string): string {
  const out = [`Weekmenu ${weekNumberLabel(plan.weekKey)} (${weekRangeLabel(plan.weekKey)})`, ''];
  let n = 0;
  for (const m of plan.meals) {
    const r = recipes.get(m.recipeId);
    if (!r) continue;
    n += 1;
    out.push(`${n}. ${r.title} (${totalMinutes(r)} min, ${m.servings} pers.)${m.cookedAt ? ' ✓ gekookt' : ''}`);
    if (baseUrl) out.push(`   ${recipeUrl(r.id, baseUrl)}`);
  }
  if (n === 0) out.push('Nog geen maaltijden gekozen.');
  return out.join('\n');
}

/** A whole recipe: ingredients for the chosen servings, the method and a link back to the app. */
export function recipeToText(recipe: Recipe, servings: number, ingredients: Map<string, Ingredient>, baseUrl?: string): string {
  const out = [recipe.title];
  if (recipe.subtitle) out.push(recipe.subtitle);
  out.push(`${totalMinutes(recipe)} min · ${persons(servings)}`, '', 'Ingrediënten');
  for (const ri of recipe.ingredients) {
    const line = ingredientText(ri, recipe, servings, ingredients);
    if (line) out.push(`- ${line}`);
  }
  out.push('', 'Bereiding');
  recipe.steps.forEach((s, i) => out.push(`${i + 1}. ${s.text}`));
  if (baseUrl) out.push('', recipeUrl(recipe.id, baseUrl));
  return out.join('\n');
}
