import { ArrowLeft, Check, ChefHat, Clock, ExternalLink, Flame, Heart, Pencil, Plus, Share2, ThumbsDown, Timer, Trash2, Users } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Button, cx, EmptyState, IconButton, RecipeCover, Stepper } from '../components/ui';
import { db } from '../db/db';
import { deleteCustomRecipe, mutatePlan, updateRecipeState } from '../db/repo';
import { MAX_SERVINGS, MIN_SERVINGS, setServings } from '../lib/plan';
import { isCustomRecipe } from '../lib/customRecipe';
import { recipeDiet } from '../lib/diet';
import { recipeToText } from '../lib/share';
import { formatQuantity, ingredientLabel, scaleAmount } from '../lib/units';
import { usePlan, usePlanActions, usePreferences, useRecipeStates, useShare, useToast, useWeek } from '../state/hooks';
import type { Recipe } from '../types';
import { useCatalog } from '../state/catalog';

const DIFFICULTY: Record<Recipe['difficulty'], string> = { easy: 'makkelijk', medium: 'gemiddeld', hard: 'uitdagend' };

export function RecipeDetail() {
  const { id } = useParams();
  const { recipeMap, loaded } = useCatalog();
  const recipe = id ? recipeMap.get(id) : undefined;
  if (!recipe && !loaded) return null;
  if (!recipe) {
    return (
      <EmptyState icon={<ChefHat size={28} />} title="Recept niet gevonden">
        Misschien is het uit de collectie gehaald. <Link className="font-semibold text-herb-700" to="/search">Recepten bekijken</Link>
      </EmptyState>
    );
  }
  return <RecipeView recipe={recipe} />;
}

function RecipeView({ recipe }: { recipe: Recipe }) {
  const navigate = useNavigate();
  const toast = useToast();
  const share = useShare();
  const { ingredientMap } = useCatalog();
  const own = isCustomRecipe(recipe);
  const { activeWeek, currentWeek } = useWeek();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const plan = usePlan(activeWeek);
  const prefs = usePreferences();
  const states = useRecipeStates();
  const state = states.get(recipe.id);
  const { toggle } = usePlanActions(activeWeek);
  const meal = plan?.meals.find((m) => m.recipeId === recipe.id);
  const [localServings, setLocalServings] = useState<number | null>(null);
  const servings = meal?.servings ?? localServings ?? prefs.defaultServings;

  const changeServings = async (n: number) => {
    if (meal) await mutatePlan(db, activeWeek, (p) => ({ plan: setServings(p, recipe.id, n) }));
    else setLocalServings(n);
  };

  const pantry = useMemo(() => new Set(prefs.pantryItems), [prefs.pantryItems]);

  return (
    <article className="pb-28">
      <div className="relative">
        <RecipeCover recipe={recipe} size="lg" className="aspect-[4/3] w-full sm:mx-5 sm:mt-5 sm:w-auto sm:aspect-[16/9]" rounded="rounded-b-[32px] sm:rounded-[32px]" />
        <div className="absolute inset-x-0 top-0 flex justify-between p-3 pt-[calc(0.75rem+env(safe-area-inset-top))] sm:px-8 sm:pt-8">
          <IconButton label="Terug" onClick={() => (window.history.length > 1 ? navigate(-1) : navigate('/'))} className="bg-white/90 shadow-card backdrop-blur">
            <ArrowLeft size={20} />
          </IconButton>
          <div className="flex gap-2">
            {own && (
              <IconButton label="Recept bewerken" onClick={() => navigate(`/recipe/${recipe.id}/edit`)} className="bg-white/90 shadow-card backdrop-blur">
                <Pencil size={19} />
              </IconButton>
            )}
            <IconButton
              label="Recept delen, bijvoorbeeld via WhatsApp"
              onClick={() => share(recipe.title, recipeToText(recipe, servings, ingredientMap, window.location.origin), 'Recept gekopieerd')}
              className="bg-white/90 shadow-card backdrop-blur"
            >
              <Share2 size={20} />
            </IconButton>
            <IconButton
              label={state?.favorite ? 'Uit favorieten halen' : 'Aan favorieten toevoegen'}
              aria-pressed={!!state?.favorite}
              onClick={() => updateRecipeState(db, recipe.id, { favorite: !state?.favorite })}
              className="bg-white/90 shadow-card backdrop-blur"
            >
              <Heart size={20} className={cx(state?.favorite && 'fill-tomato-500 text-tomato-500 animate-pop')} />
            </IconButton>
          </div>
        </div>
      </div>

      <div className="px-5 pt-5">
        <div className="text-[13px] font-medium uppercase tracking-wider text-herb-700">
          {recipe.cuisine}
          <DietBadge diet={recipeDiet(recipe, ingredientMap)} />
        </div>
        <h1 className="mt-1 font-display text-[28px] font-semibold leading-tight">{recipe.title}</h1>
        {recipe.subtitle && <p className="mt-0.5 text-ink-500">{recipe.subtitle}</p>}
        {recipe.description && <p className="mt-3 text-[15px] leading-relaxed text-ink-700">{recipe.description}</p>}

        <dl className="mt-5 grid grid-cols-3 divide-x divide-cream-200 rounded-[22px] bg-white py-3 text-center shadow-card">
          {recipe.cookMinutes > 0 ? (
            <>
              <Fact icon={<Clock size={16} />} label="Voorbereiden" value={`${recipe.prepMinutes} min`} />
              <Fact icon={<Flame size={16} />} label="Koken" value={`${recipe.cookMinutes} min`} />
            </>
          ) : (
            <>
              <Fact icon={<Clock size={16} />} label="Tijd" value={`${recipe.prepMinutes} min`} />
              <Fact icon={<Users size={16} />} label="Personen" value={`${recipe.baseServings}`} />
            </>
          )}
          <Fact icon={<ChefHat size={16} />} label="Niveau" value={DIFFICULTY[recipe.difficulty]} />
        </dl>

        <section className="mt-8">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="font-display text-xl font-semibold">Ingrediënten</h2>
            <Stepper label="personen" value={servings} min={MIN_SERVINGS} max={MAX_SERVINGS} onChange={changeServings} suffix={servings === 1 ? 'persoon' : 'personen'} />
          </div>
          <IngredientList recipe={recipe} servings={servings} pantry={pantry} />
        </section>

        <section className="mt-8">
          <h2 className="mb-3 font-display text-xl font-semibold">Bereiding</h2>
          <ol className="flex flex-col gap-4">
            {recipe.steps.map((s, i) => (
              <li key={i} className="flex gap-3.5">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-herb-100 text-sm font-bold text-herb-700">{i + 1}</span>
                <div className="pt-0.5 text-[15px] leading-relaxed text-ink-700">
                  {s.text}
                  {s.timerMinutes && (
                    <span className="ml-2 inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-saffron-100 px-2 py-0.5 text-xs font-semibold text-ink-700">
                      <Timer size={12} /> {s.timerMinutes} min
                    </span>
                  )}
                </div>
              </li>
            ))}
          </ol>
        </section>

        <Notes recipeId={recipe.id} initial={state?.notes ?? ''} />

        <section className="mt-8 rounded-[22px] bg-cream-200/50 p-4 text-sm text-ink-500">
          <h2 className="font-semibold text-ink-700">Bron</h2>
          <p className="mt-1">
            {recipe.source.type === 'inspired' && (
              <>
                Geïnspireerd door een recept van <strong>{recipe.source.name}</strong>. De bereidingswijze is in eigen woorden geschreven; alleen voor persoonlijk gebruik.
                {recipe.source.adaptation && <span className="mt-2 block text-ink-700">{recipe.source.adaptation}</span>}
                {recipe.source.url && (
                  <a
                    className="mt-2 flex items-center gap-1.5 font-semibold text-herb-700 underline-offset-4 hover:underline"
                    href={recipe.source.url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Bekijk het origineel (met foto) op {recipe.source.name} <ExternalLink size={14} />
                  </a>
                )}
              </>
            )}
            {recipe.source.type === 'original' && <>Eigen recept van <strong>{recipe.source.name}</strong>, geschreven voor Weekmenu.</>}
            {recipe.source.type === 'licensed' && (
              <>
                Van{' '}
                {recipe.source.url ? (
                  <a className="font-semibold underline" href={recipe.source.url} target="_blank" rel="noreferrer">
                    {recipe.source.name}
                  </a>
                ) : (
                  <strong>{recipe.source.name}</strong>
                )}
                {recipe.source.license && <> · {recipe.source.license}</>}
              </>
            )}
            {recipe.source.type === 'personal' && <>Je eigen recept. Het staat alleen op dit apparaat (en in je back-up).</>}
          </p>
          {recipe.image && (
            <p className="mt-2">
              {recipe.image.illustrative ? 'Sfeerfoto' : 'Foto'}:{' '}
              {recipe.image.creditUrl ? (
                <a className="underline underline-offset-2" href={recipe.image.creditUrl} target="_blank" rel="noreferrer">
                  {recipe.image.credit}
                </a>
              ) : (
                recipe.image.credit
              )}{' '}
              · {recipe.image.license}
              {recipe.image.illustrative && <span className="block text-xs">Een vergelijkbaar gerecht; het jouwe kan er anders uitzien.</span>}
            </p>
          )}
          <button
            className={cx('mt-3 inline-flex items-center gap-1.5 font-medium', state?.disliked ? 'text-tomato-600' : 'text-ink-500')}
            onClick={async () => {
              await updateRecipeState(db, recipe.id, { disliked: !state?.disliked });
              toast({ message: state?.disliked ? 'We stellen dit weer voor' : 'Begrepen — dit stellen we niet meer voor' });
            }}
          >
            <ThumbsDown size={15} /> {state?.disliked ? '“Niets voor ons” · ongedaan maken' : 'Niets voor ons'}
          </button>
          {own && (
            <div className="mt-3 border-t border-cream-300/60 pt-3">
              {confirmDelete ? (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-ink-700">Recept verwijderen?{meal ? ' Het gaat ook uit je weekmenu.' : ''} Dit kan niet ongedaan worden.</span>
                  <Button
                    size="sm"
                    variant="danger"
                    onClick={async () => {
                      await deleteCustomRecipe(db, recipe.id, currentWeek);
                      toast({ message: 'Recept verwijderd' });
                      navigate('/search', { replace: true });
                    }}
                  >
                    Ja, verwijderen
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(false)}>
                    Nee
                  </Button>
                </div>
              ) : (
                <button className="inline-flex items-center gap-1.5 font-medium text-ink-500 hover:text-tomato-600" onClick={() => setConfirmDelete(true)}>
                  <Trash2 size={15} /> Recept verwijderen
                </button>
              )}
            </div>
          )}
        </section>
      </div>

      <div className="fixed inset-x-0 bottom-[calc(60px+env(safe-area-inset-bottom))] z-30 px-4 pb-3 md:bottom-0 md:left-60">
        <div className="mx-auto flex max-w-3xl gap-2 rounded-full bg-white/95 p-1.5 shadow-lift ring-1 ring-cream-200 backdrop-blur">
          <Button variant={meal ? 'secondary' : 'primary'} className="flex-1" onClick={() => toggle(recipe.id, servings)}>
            {meal ? (
              <>
                <Check size={18} /> In je week
              </>
            ) : (
              <>
                <Plus size={18} /> Aan week toevoegen
              </>
            )}
          </Button>
          <Button variant={meal ? 'primary' : 'secondary'} className="flex-1" onClick={() => navigate(`/recipe/${recipe.id}/cook?servings=${servings}`)}>
            <ChefHat size={18} /> Koken
          </Button>
        </div>
      </div>
    </article>
  );
}

function DietBadge({ diet }: { diet: 'vegan' | 'vegetarian' | 'fish' }) {
  if (diet === 'vegetarian') return null;
  return (
    <span className={cx('ml-2 rounded-full px-2 py-0.5 normal-case tracking-normal', diet === 'vegan' ? 'bg-herb-100' : 'bg-sky-100 text-sky-800')}>
      {diet === 'vegan' ? '🌱 vegan' : '🐟 vis'}
    </span>
  );
}

function Fact({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="px-2">
      <dt className="flex items-center justify-center gap-1 text-xs text-ink-500">
        {icon} {label}
      </dt>
      <dd className="mt-0.5 text-[15px] font-semibold first-letter:uppercase">{value}</dd>
    </div>
  );
}

export function IngredientList({ recipe, servings, pantry, large }: { recipe: Recipe; servings: number; pantry: Set<string>; large?: boolean }) {
  const { ingredientMap } = useCatalog();
  return (
    <ul className={cx('divide-y rounded-[22px]', large ? 'divide-white/10' : 'divide-cream-200 bg-white px-4 shadow-card')}>
      {recipe.ingredients.map((ri) => {
        const ing = ingredientMap.get(ri.ingredientId);
        if (!ing) return null;
        const amount = scaleAmount(ri.amount, recipe.baseServings, servings);
        const qty = amount === null ? '' : formatQuantity(amount, ri.unit);
        return (
          <li key={ri.ingredientId} className={cx('flex items-baseline gap-3', large ? 'py-3 text-lg' : 'py-3 text-[15px]')}>
            <span className={cx('w-20 shrink-0 text-right font-semibold tabular-nums', large ? 'text-saffron-500' : 'text-ink-900')}>{qty}</span>
            <span className="flex-1">
              {ingredientLabel(ing, amount, ri.unit)}
              {ri.note && <span className={large ? 'text-white/60' : 'text-ink-500'}>, {ri.note}</span>}
              {ri.optional && <span className={large ? 'text-white/60' : 'text-ink-500'}> (optioneel)</span>}
              {amount === null && <span className={large ? 'text-white/60' : 'text-ink-500'}> naar smaak</span>}
            </span>
            {pantry.has(ing.id) && !large && <span className="rounded-full bg-cream-100 px-2 py-0.5 text-[11px] font-medium text-ink-500">voorraad</span>}
          </li>
        );
      })}
    </ul>
  );
}

function Notes({ recipeId, initial }: { recipeId: string; initial: string }) {
  const [value, setValue] = useState(initial);
  const [saved, setSaved] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => setValue(initial), [initial]);
  const save = (v: string) => {
    clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      await updateRecipeState(db, recipeId, { notes: v });
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    }, 500);
  };
  return (
    <section className="mt-8">
      <div className="mb-2 flex items-baseline justify-between">
        <h2 className="font-display text-xl font-semibold">Onze notities</h2>
        <span className="text-xs text-herb-600" aria-live="polite">{saved ? 'Opgeslagen' : ''}</span>
      </div>
      <textarea
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          save(e.target.value);
        }}
        placeholder="Bijv. dubbel zoveel knoflook, extra pittig…"
        rows={3}
        className="w-full resize-none rounded-[22px] bg-white p-4 text-[15px] shadow-card outline-none ring-1 ring-cream-200 placeholder:text-ink-300 focus:ring-2 focus:ring-herb-500"
      />
    </section>
  );
}
