import { ArrowLeft, Check, Plus, Refrigerator, Trash2, X } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button, cx, EmptyState, IconButton, RecipeCover } from '../components/ui';
import { db } from '../db/db';
import { updateFridge } from '../db/repo';
import { ingredientLookup } from '../lib/customRecipe';
import { veganizeRecipe, wantsVegan } from '../lib/diet';
import { readFridge, suggestFromFridge, type FridgeItem, type FridgeSuggestion } from '../lib/fridge';
import { useCatalog } from '../state/catalog';
import { usePlan, usePlanActions, usePreferences, useRecipeStates, useWeek } from '../state/hooks';
import type { IngredientLineDraft } from '../types';

const PAGE = 15;

/** "Wat heb ik nog?": type what's left in the fridge, get recipes that use it up. */
export function Fridge() {
  const navigate = useNavigate();
  const prefs = usePreferences();
  const { recipes, ingredients, ingredientMap } = useCatalog();
  const states = useRecipeStates();
  const { activeWeek } = useWeek();
  const plan = usePlan(activeWeek);
  const { toggle } = usePlanActions(activeWeek);
  const lookup = useMemo(() => ingredientLookup(ingredients), [ingredients]);
  const [entry, setEntry] = useState('');
  const [shown, setShown] = useState(PAGE);
  const entryRef = useRef<HTMLInputElement>(null);

  const drafts = prefs.fridge ?? [];
  const save = (change: (items: IngredientLineDraft[]) => IngredientLineDraft[]) => {
    setShown(PAGE);
    return updateFridge(db, change);
  };
  const add = (text = entry) => {
    const parts = text
      .split(/\r?\n|,(?!\d)/)
      .map((t) => t.replace(/^\s*[-•*]\s*/, '').trim())
      .filter(Boolean);
    if (!parts.length) return;
    void save((cur) => [...cur, ...parts.map((t) => ({ text: t }))]);
    setEntry('');
    entryRef.current?.focus();
  };

  const items = useMemo(() => readFridge(drafts, lookup), [drafts, lookup]);
  const disliked = useMemo(() => new Set([...states.values()].filter((s) => s.disliked).map((s) => s.recipeId)), [states]);
  const pantry = useMemo(() => new Set(prefs.pantryItems), [prefs.pantryItems]);
  const suggestions = useMemo(
    () =>
      suggestFromFridge(items, recipes, ingredientMap, {
        pantry,
        disliked,
        version: (r) => (wantsVegan(r, ingredientMap, states.get(r.id), prefs.preferVegan) ? veganizeRecipe(r, ingredientMap) : r),
      }),
    [items, recipes, ingredientMap, pantry, disliked, states, prefs.preferVegan],
  );
  const planned = new Set(plan?.meals.map((m) => m.recipeId));

  return (
    <div className="pb-10">
      <header className="flex items-center gap-2 px-3 pb-2 pt-[calc(0.75rem+env(safe-area-inset-top))]">
        <IconButton label="Terug" onClick={() => (window.history.length > 1 ? navigate(-1) : navigate('/'))} className="hover:bg-cream-200">
          <ArrowLeft size={20} />
        </IconButton>
        <h1 className="font-display text-[22px] font-semibold">Wat heb ik nog?</h1>
      </header>

      <section className="px-5">
        <p className="mb-3 text-sm text-ink-500">Typ wat er nog in de koelkast of voorraadkast ligt, bijvoorbeeld “halve courgette” of “200 g spinazie”. Je ziet welke recepten het opmaken.</p>
        <div className="flex gap-2">
          <input
            ref={entryRef}
            value={entry}
            onChange={(e) => setEntry(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                add();
              }
            }}
            onPaste={(e) => {
              const text = e.clipboardData.getData('text');
              if (/[\n,]/.test(text.trim())) {
                e.preventDefault();
                add(text);
              }
            }}
            placeholder="Bijv. halve courgette"
            aria-label="Wat heb je nog?"
            autoComplete="off"
            enterKeyHint="done"
            className="h-12 w-full flex-1 rounded-2xl bg-white px-4 text-[16px] shadow-card outline-none ring-1 ring-cream-200 placeholder:text-ink-300 focus:ring-2 focus:ring-herb-500"
          />
          <IconButton label="Toevoegen" onClick={() => add()} disabled={!entry.trim()} className="h-12 w-12 bg-herb-600 text-white shadow-card disabled:opacity-40">
            <Plus size={22} />
          </IconButton>
        </div>

        {items.length > 0 && (
          <>
            <ul className="mt-3 flex flex-wrap gap-2">
              {items.map((item, i) => (
                <FridgeChip key={`${i}-${item.draft.text}`} item={item} onRemove={() => void save((cur) => cur.filter((_, j) => j !== i))} />
              ))}
            </ul>
            <button className="mt-2 inline-flex items-center gap-1.5 text-sm font-medium text-ink-500 hover:text-tomato-600" onClick={() => void save(() => [])}>
              <Trash2 size={14} /> Leegmaken
            </button>
          </>
        )}
      </section>

      {items.length === 0 ? (
        <EmptyState icon={<Refrigerator size={28} />} title="Nog niets ingevuld">
          Voeg een paar dingen toe; je lijst blijft bewaard tot je hem leegmaakt.
        </EmptyState>
      ) : suggestions.length === 0 ? (
        <EmptyState icon={<Refrigerator size={28} />} title="Geen recept gevonden">
          Probeer een andere naam, of voeg meer ingrediënten toe.
        </EmptyState>
      ) : (
        <section className="mt-6 px-5">
          <h2 className="mb-3 font-display text-xl font-semibold">
            {suggestions.length} {suggestions.length === 1 ? 'recept maakt' : 'recepten maken'} iets op
          </h2>
          <ul className="flex flex-col gap-3">
            {suggestions.slice(0, shown).map((s) => (
              <SuggestionRow key={s.recipe.id} s={s} planned={planned.has(s.recipe.id)} onToggle={() => toggle(s.recipe.id)} />
            ))}
          </ul>
          {suggestions.length > shown && (
            <Button variant="secondary" className="mt-4 w-full" onClick={() => setShown((n) => n + PAGE)}>
              Meer recepten
            </Button>
          )}
        </section>
      )}
    </div>
  );
}

function FridgeChip({ item, onRemove }: { item: FridgeItem; onRemove: () => void }) {
  const known = !!item.ingredient;
  return (
    <li className={cx('inline-flex max-w-full items-center gap-1.5 rounded-full py-1.5 pl-3 pr-1.5 text-sm ring-1', known ? 'bg-white ring-cream-200' : 'bg-cream-100 text-ink-500 ring-cream-300')}>
      {known && <Check size={14} className="shrink-0 text-herb-600" />}
      <span className="truncate" title={known ? `Herkend als ${item.ingredient!.name}` : 'Niet herkend; we zoeken op de naam in de recepten'}>
        {item.draft.text}
        {known && item.ingredient!.name.toLowerCase() !== item.line.name.toLowerCase() && <span className="text-ink-500"> · {item.ingredient!.name}</span>}
        {!known && <span className="text-xs"> (niet herkend)</span>}
      </span>
      <button aria-label={`${item.draft.text} verwijderen`} onClick={onRemove} className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-ink-300 hover:bg-cream-100 hover:text-tomato-500">
        <X size={15} />
      </button>
    </li>
  );
}

function SuggestionRow({ s, planned, onToggle }: { s: FridgeSuggestion; planned: boolean; onToggle: () => void }) {
  const uses = s.uses.map((u) =>
    u.via === 'substitute' ? `${u.item.ingredient!.name} (voor ${u.ingredient!.name})` : u.ingredient?.name ?? u.item.draft.text,
  );
  return (
    <li className="rounded-3xl bg-white p-2.5 pr-3 shadow-card animate-rise">
      <div className="flex items-center gap-3">
        <Link to={`/recipe/${s.recipe.id}`} className="flex min-w-0 flex-1 items-center gap-3">
          <RecipeCover recipe={s.recipe} className="h-20 w-20 shrink-0" rounded="rounded-2xl" />
          <div className="min-w-0">
            <h3 className="line-clamp-2 font-display text-[15px] font-semibold leading-snug text-ink-900">{s.recipe.title}</h3>
            <p className="mt-1 text-[13px] leading-snug text-herb-700">
              <span className="font-semibold">Gebruikt:</span> {uses.join(', ')}
            </p>
            <p className="mt-0.5 text-[13px] leading-snug text-ink-500">
              {s.missing.length === 0 ? (
                <span className="font-semibold text-herb-700">Je hebt alles in huis</span>
              ) : (
                <>
                  <span className="font-semibold">Nog kopen ({s.missing.length}):</span> {s.missing.map((m) => m.name).join(', ')}
                </>
              )}
            </p>
          </div>
        </Link>
        <IconButton
          label={planned ? `${s.recipe.title} uit mijn week halen` : `${s.recipe.title} aan mijn week toevoegen`}
          aria-pressed={planned}
          onClick={onToggle}
          className={cx('h-10 w-10 shadow-card', planned ? 'bg-herb-600 text-white' : 'bg-cream-100 text-ink-700')}
        >
          {planned ? <Check size={18} /> : <Plus size={18} />}
        </IconButton>
      </div>
    </li>
  );
}
