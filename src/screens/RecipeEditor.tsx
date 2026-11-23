import { ArrowLeft, Check, ChefHat, Palette, Plus, Sparkles, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { DishCover } from '../components/DishCover';
import { Button, cx, EmptyState, IconButton, Stepper } from '../components/ui';
import { db } from '../db/db';
import { saveCustomRecipe } from '../db/repo';
import {
  buildCustomRecipe,
  DEFAULT_CUISINE,
  emptyForm,
  formDish,
  formProblems,
  ingredientLookup,
  newRecipeId,
  PALETTES,
  paletteFor,
  parseLine,
  recordToForm,
  type ParsedLine,
  type RecipeForm,
} from '../lib/customRecipe';
import { DISH_LABELS, DISH_SHAPES } from '../lib/dish';
import { formatQuantity } from '../lib/units';
import { useCatalog } from '../state/catalog';
import { usePreferences, useToast } from '../state/hooks';
import type { DishShape, Recipe } from '../types';

const DRAFT_KEY = 'wm-recipe-draft';

function loadDraft(): RecipeForm | null {
  try {
    const raw = sessionStorage.getItem(DRAFT_KEY);
    return raw ? (JSON.parse(raw) as RecipeForm) : null;
  } catch {
    return null;
  }
}

function saveDraft(form: RecipeForm | null) {
  try {
    if (form) sessionStorage.setItem(DRAFT_KEY, JSON.stringify(form));
    else sessionStorage.removeItem(DRAFT_KEY);
  } catch {
    /* private mode: the draft just isn't kept */
  }
}

/** Add a new recipe (/recipe/new) or edit one of your own (/recipe/:id/edit). */
export function RecipeEditor() {
  const { id } = useParams();
  const { custom, loaded } = useCatalog();
  const prefs = usePreferences();
  if (!id) return <EditorForm key="new" initial={loadDraft() ?? emptyForm(prefs.defaultServings)} isNew />;
  if (!loaded) return null;
  const record = custom.get(id);
  if (!record) {
    return (
      <EmptyState icon={<ChefHat size={28} />} title="Dit recept kun je niet bewerken">
        Alleen recepten die je zelf hebt toegevoegd zijn aan te passen.{' '}
        <Link className="font-semibold text-herb-700" to={`/recipe/${id}`}>
          Terug naar het recept
        </Link>
      </EmptyState>
    );
  }
  return <EditorForm key={id} initial={recordToForm(record)} createdAt={record.createdAt} />;
}

function EditorForm({ initial, isNew, createdAt }: { initial: RecipeForm; isNew?: boolean; createdAt?: number }) {
  const navigate = useNavigate();
  const toast = useToast();
  const { ingredients, recipeMap, cuisines } = useCatalog();
  const lookup = useMemo(() => ingredientLookup(ingredients), [ingredients]);
  const [form, setForm] = useState<RecipeForm>(initial);
  const [entry, setEntry] = useState('');
  const [showCover, setShowCover] = useState(false);
  const [tried, setTried] = useState(false);
  const entryRef = useRef<HTMLInputElement>(null);
  const stepRefs = useRef<(HTMLTextAreaElement | null)[]>([]);
  const focusStep = useRef<number | null>(null);

  const update = (patch: Partial<RecipeForm>) => setForm((f) => ({ ...f, ...patch }));
  useEffect(() => {
    if (isNew) saveDraft(form);
  }, [form, isNew]);
  useEffect(() => {
    if (focusStep.current !== null) {
      stepRefs.current[focusStep.current]?.focus();
      focusStep.current = null;
    }
  }, [form.steps.length]);

  const lines = useMemo(() => form.ingredients.map((d) => parseLine(d, lookup)), [form.ingredients, lookup]);
  const entryPreview = entry.trim() ? parseLine({ text: entry }, lookup) : null;
  const problems = formProblems(form, lookup);
  const problem = (field: 'title' | 'ingredients' | 'steps') => (tried ? problems.find((p) => p.field === field)?.message : undefined);

  const futureId = form.id ?? newRecipeId(form.title, (x) => recipeMap.has(x));
  const dish = formDish(form, lookup);
  const palette = form.palette ?? paletteFor(form.title);
  const cover = (shape: DishShape | null, pal = palette) => ({ id: futureId, tags: [], palette: pal, dish: shape ?? dish }) as unknown as Recipe;

  const addEntry = (text = entry) => {
    const parts = text
      .split(/\r?\n/)
      .map((t) => t.replace(/^\s*[-•*]\s*/, '').trim())
      .filter(Boolean);
    if (!parts.length) return;
    update({ ingredients: [...form.ingredients, ...parts.map((t) => ({ text: t }))] });
    setEntry('');
    entryRef.current?.focus();
  };
  const removeIngredient = (i: number) => update({ ingredients: form.ingredients.filter((_, j) => j !== i) });
  const editIngredient = (i: number) => {
    setEntry(form.ingredients[i].text);
    removeIngredient(i);
    entryRef.current?.focus();
  };
  const keepAsOwn = (i: number) => update({ ingredients: form.ingredients.map((d, j) => (j === i ? { ...d, custom: true } : d)) });

  const setStep = (i: number, text: string) => update({ steps: form.steps.map((s, j) => (j === i ? text : s)) });
  const addStep = () => {
    focusStep.current = form.steps.length;
    update({ steps: [...form.steps, ''] });
  };
  const removeStep = (i: number) => update({ steps: form.steps.length > 1 ? form.steps.filter((_, j) => j !== i) : [''] });

  const save = async () => {
    // A line still in the input box counts as added.
    const withEntry = entry.trim() ? { ...form, ingredients: [...form.ingredients, { text: entry.trim() }] } : form;
    if (formProblems(withEntry, lookup).length) {
      setTried(true);
      if (withEntry !== form) {
        setForm(withEntry);
        setEntry('');
      }
      return;
    }
    const record = buildCustomRecipe(withEntry, ingredients, { taken: (x) => recipeMap.has(x), createdAt });
    await saveCustomRecipe(db, record);
    if (isNew) saveDraft(null);
    toast({ message: isNew ? 'Recept toegevoegd' : 'Wijzigingen opgeslagen' });
    navigate(`/recipe/${record.id}`, { replace: true });
  };

  const cancel = () => {
    if (isNew) saveDraft(null);
    if (window.history.length > 1) navigate(-1);
    else navigate('/search');
  };

  const allCuisines = cuisines.includes(form.cuisine) ? cuisines : [...cuisines, form.cuisine].sort((a, b) => a.localeCompare(b, 'nl'));
  if (!allCuisines.includes(DEFAULT_CUISINE)) allCuisines.unshift(DEFAULT_CUISINE);

  return (
    <div className="mx-auto max-w-2xl pb-32">
      <header className="flex items-center gap-2 px-3 pb-2 pt-[calc(0.75rem+env(safe-area-inset-top))]">
        <IconButton label="Annuleren" onClick={cancel} className="hover:bg-cream-200">
          <ArrowLeft size={20} />
        </IconButton>
        <h1 className="font-display text-[22px] font-semibold">{isNew ? 'Eigen recept' : 'Recept bewerken'}</h1>
      </header>

      <div className="px-5">
        {/* Cover: automatic, or pick a shape and colour */}
        <section className="overflow-hidden rounded-[26px] bg-white shadow-card">
          <DishCover recipe={cover(null)} className="aspect-[16/9] w-full" />
          <div className="flex items-center justify-between gap-2 px-4 py-3">
            <p className="text-sm text-ink-700">
              {form.dish ? (
                <>Plaatje: {DISH_LABELS[dish]}</>
              ) : (
                <>
                  <Sparkles size={14} className="mr-1 inline text-saffron-500" />
                  {form.title.trim() ? `Automatisch: ${DISH_LABELS[dish]}` : 'Het plaatje past zich aan je recept aan'}
                </>
              )}
            </p>
            <Button size="sm" variant="secondary" onClick={() => setShowCover((v) => !v)} aria-expanded={showCover}>
              <Palette size={15} /> {showCover ? 'Klaar' : 'Kies zelf'}
            </Button>
          </div>
          {showCover && (
            <div className="border-t border-cream-200 px-4 pb-4 pt-3">
              <h2 className="mb-2 text-[13px] font-semibold uppercase tracking-wider text-ink-500">Soort gerecht</h2>
              <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
                <ShapeTile active={!form.dish} label="Automatisch" onClick={() => update({ dish: null })}>
                  <div className="flex aspect-square items-center justify-center rounded-xl bg-cream-100 text-saffron-500">
                    <Sparkles size={22} />
                  </div>
                </ShapeTile>
                {DISH_SHAPES.map((s) => (
                  <ShapeTile key={s} active={form.dish === s} label={DISH_LABELS[s]} onClick={() => update({ dish: s })}>
                    <DishCover recipe={cover(s)} className="aspect-square w-full" rounded="rounded-xl" />
                  </ShapeTile>
                ))}
              </div>
              <h2 className="mb-2 mt-4 text-[13px] font-semibold uppercase tracking-wider text-ink-500">Kleur</h2>
              <div className="flex flex-wrap gap-2.5">
                {PALETTES.map((p) => {
                  const on = palette.join() === p.join() && (form.palette !== null || p.join() === paletteFor(form.title).join());
                  return (
                    <button
                      key={p.join()}
                      onClick={() => update({ palette: p })}
                      aria-label={`Kleur ${p[0]}`}
                      aria-pressed={on}
                      className={cx('h-10 w-10 rounded-full ring-offset-2 transition active:scale-90', on ? 'ring-2 ring-ink-900' : 'ring-1 ring-cream-300')}
                      style={{ background: `linear-gradient(135deg, ${p[0]} 50%, ${p[1]} 50%)` }}
                    />
                  );
                })}
              </div>
            </div>
          )}
        </section>

        {/* Name */}
        <section className="mt-6">
          <label htmlFor="recipe-title" className="mb-2 block font-display text-xl font-semibold">
            Naam
          </label>
          <input
            id="recipe-title"
            value={form.title}
            onChange={(e) => update({ title: e.target.value })}
            placeholder="Bijv. Pasta pesto met courgette"
            autoComplete="off"
            enterKeyHint="next"
            className={inputClass(!!problem('title'))}
          />
          <FieldError message={problem('title')} />
        </section>

        {/* Ingredients */}
        <section className="mt-7">
          <h2 className="font-display text-xl font-semibold">Ingrediënten</h2>
          <p className="mb-3 mt-0.5 text-sm text-ink-500">Eén per keer: hoeveelheid en naam, bijvoorbeeld “200 g champignons” of “naar smaak zout”.</p>
          {lines.length > 0 && (
            <ul className="mb-3 divide-y divide-cream-200 rounded-[22px] bg-white px-4 shadow-card">
              {lines.map((l, i) => (
                <IngredientRow key={`${i}-${l.text}`} line={l} onEdit={() => editIngredient(i)} onRemove={() => removeIngredient(i)} onKeepOwn={() => keepAsOwn(i)} />
              ))}
            </ul>
          )}
          <div className="flex gap-2">
            <input
              ref={entryRef}
              value={entry}
              onChange={(e) => setEntry(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addEntry();
                }
              }}
              onPaste={(e) => {
                const text = e.clipboardData.getData('text');
                if (/\n/.test(text.trim())) {
                  e.preventDefault();
                  addEntry(text);
                }
              }}
              placeholder="Bijv. 200 g champignons"
              aria-label="Ingrediënt"
              autoComplete="off"
              enterKeyHint="done"
              className={cx(inputClass(!!problem('ingredients')), 'flex-1')}
            />
            <IconButton label="Ingrediënt toevoegen" onClick={() => addEntry()} disabled={!entry.trim()} className="h-12 w-12 bg-herb-600 text-white shadow-card disabled:opacity-40">
              <Plus size={22} />
            </IconButton>
          </div>
          {entryPreview && !entryPreview.error && (
            <p className="mt-2 px-1 text-sm text-ink-500" aria-live="polite">
              → <LineSummary line={entryPreview} />
            </p>
          )}
          <FieldError message={problem('ingredients')} />
        </section>

        {/* Steps */}
        <section className="mt-7">
          <h2 className="mb-3 font-display text-xl font-semibold">Bereiding</h2>
          <ol className="flex flex-col gap-3">
            {form.steps.map((s, i) => (
              <li key={i} className="flex gap-2.5">
                <span className="mt-3 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-herb-100 text-sm font-bold text-herb-700">{i + 1}</span>
                <textarea
                  ref={(el) => {
                    stepRefs.current[i] = el;
                    grow(el);
                  }}
                  value={s}
                  onChange={(e) => {
                    setStep(i, e.target.value);
                    grow(e.target);
                  }}
                  placeholder={i === 0 ? 'Bijv. Kook de pasta volgens de verpakking.' : 'Volgende stap…'}
                  aria-label={`Stap ${i + 1}`}
                  rows={2}
                  className={cx(inputClass(i === 0 && !!problem('steps')), 'h-auto min-h-[76px] flex-1 resize-none overflow-hidden py-3 leading-relaxed')}
                />
                {(form.steps.length > 1 || s) && (
                  <IconButton label={`Stap ${i + 1} verwijderen`} onClick={() => removeStep(i)} className="mt-2 text-ink-300 hover:bg-cream-200 hover:text-tomato-500">
                    <X size={18} />
                  </IconButton>
                )}
              </li>
            ))}
          </ol>
          <FieldError message={problem('steps')} />
          <Button variant="secondary" className="mt-3 w-full" onClick={addStep}>
            <Plus size={18} /> Stap toevoegen
          </Button>
        </section>

        {/* Details with sensible defaults */}
        <section className="mt-7 rounded-[22px] bg-white p-4 shadow-card">
          <h2 className="mb-3 font-display text-lg font-semibold">Details</h2>
          <div className="flex items-center justify-between gap-3 py-1.5">
            <span className="text-[15px]">Voor</span>
            <Stepper label="personen" value={form.servings} min={1} max={12} suffix={form.servings === 1 ? 'persoon' : 'personen'} onChange={(n) => update({ servings: n })} />
          </div>
          <label className="flex items-center justify-between gap-3 py-1.5">
            <span className="text-[15px]">Tijd in minuten</span>
            <input
              type="number"
              inputMode="numeric"
              min={1}
              max={600}
              value={form.minutes || ''}
              onChange={(e) => update({ minutes: Number(e.target.value) })}
              className="h-11 w-24 rounded-xl bg-cream-100 px-3 text-right text-[16px] font-semibold outline-none ring-1 ring-cream-200 focus:ring-2 focus:ring-herb-500"
            />
          </label>
          <label className="flex items-center justify-between gap-3 py-1.5">
            <span className="text-[15px]">Keuken</span>
            <select
              value={form.cuisine}
              onChange={(e) => update({ cuisine: e.target.value })}
              className="h-11 max-w-[60%] rounded-xl bg-cream-100 px-3 text-[16px] outline-none ring-1 ring-cream-200 focus:ring-2 focus:ring-herb-500"
            >
              {allCuisines.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </label>
        </section>
      </div>

      <div className="fixed inset-x-0 bottom-[calc(60px+env(safe-area-inset-bottom))] z-30 px-4 pb-3 md:bottom-0 md:left-60">
        <div className="mx-auto flex max-w-3xl gap-2 rounded-full bg-white/95 p-1.5 shadow-lift ring-1 ring-cream-200 backdrop-blur">
          <Button variant="ghost" onClick={cancel}>
            Annuleren
          </Button>
          <Button className="flex-1" onClick={save}>
            <Check size={18} /> {isNew ? 'Recept opslaan' : 'Wijzigingen opslaan'}
          </Button>
        </div>
      </div>
    </div>
  );
}

/** Lets a step field grow with its text instead of scrolling inside a small box. */
function grow(el: HTMLTextAreaElement | null) {
  if (!el) return;
  el.style.height = 'auto';
  el.style.height = `${el.scrollHeight + 2}px`;
}

const inputClass = (invalid: boolean) =>
  cx(
    'h-12 w-full rounded-2xl bg-white px-4 text-[16px] shadow-card outline-none ring-1 placeholder:text-ink-300 focus:ring-2 focus:ring-herb-500',
    invalid ? 'ring-tomato-500' : 'ring-cream-200',
  );

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p className="mt-2 px-1 text-sm font-medium text-tomato-600" role="alert">
      {message}
    </p>
  );
}

function ShapeTile({ active, label, onClick, children }: { active: boolean; label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} aria-pressed={active} className="flex flex-col items-center gap-1 text-center active:scale-95">
      <span className={cx('block w-full overflow-hidden rounded-xl ring-offset-2 transition', active ? 'ring-2 ring-ink-900' : 'ring-1 ring-cream-200')}>{children}</span>
      <span className={cx('text-[11px] leading-tight', active ? 'font-semibold text-ink-900' : 'text-ink-500')}>{label}</span>
    </button>
  );
}

function LineSummary({ line }: { line: ParsedLine }) {
  const qty = line.amount === null ? 'naar smaak' : formatQuantity(line.amount, line.unit);
  return (
    <>
      <span className="font-semibold text-ink-700">{qty}</span> · {line.match ? line.match.name : line.name}
      {line.match ? <span className="text-herb-600"> ✓</span> : <span> (nieuw)</span>}
    </>
  );
}

function IngredientRow({ line, onEdit, onRemove, onKeepOwn }: { line: ParsedLine; onEdit: () => void; onRemove: () => void; onKeepOwn: () => void }) {
  const qty = line.amount === null ? '' : formatQuantity(line.amount, line.unit);
  return (
    <li className="flex items-center gap-2 py-2.5">
      <button onClick={onEdit} className="min-w-0 flex-1 text-left" aria-label={`${line.text} aanpassen`}>
        <span className="flex items-baseline gap-2 text-[15px]">
          <span className="w-16 shrink-0 text-right font-semibold tabular-nums">{qty}</span>
          <span className="min-w-0">
            {line.match ? line.match.name : line.name || line.text}
            {line.note && <span className="text-ink-500">, {line.note}</span>}
            {line.optional && <span className="text-ink-500"> (optioneel)</span>}
            {line.amount === null && <span className="text-ink-500"> naar smaak</span>}
          </span>
        </span>
        <span className="mt-0.5 block pl-[4.5rem] text-xs text-ink-500">
          {line.error ? (
            <span className="text-tomato-600">{line.error}</span>
          ) : line.match ? (
            line.partial ? (
              <>Herkend als “{line.match.name}”</>
            ) : (
              <span className="text-herb-600">✓ Herkend</span>
            )
          ) : (
            <>Nieuw ingrediënt, komt onder “Overig” op je lijst</>
          )}
        </span>
      </button>
      {line.partial && (
        <button onClick={onKeepOwn} className="shrink-0 rounded-full px-2 py-1 text-xs font-medium text-herb-700 hover:bg-cream-100">
          Klopt niet
        </button>
      )}
      <IconButton label={`${line.text} verwijderen`} onClick={onRemove} className="h-9 w-9 shrink-0 text-ink-300 hover:bg-cream-100 hover:text-tomato-500">
        <X size={17} />
      </IconButton>
    </li>
  );
}
