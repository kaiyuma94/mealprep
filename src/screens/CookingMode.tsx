import { ChevronLeft, ChevronRight, Heart, ListChecks, PartyPopper, Timer, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { cx } from '../components/ui';
import { db } from '../db/db';
import { markCooked, updateRecipeState } from '../db/repo';
import { clampServings } from '../lib/plan';
import { usePreferences, useRecipeStates, useWeek } from '../state/hooks';
import { IngredientList } from './RecipeDetail';
import { useCatalog } from '../state/catalog';
import { veganizeRecipe, wantsVegan } from '../lib/diet';

function useWakeLock() {
  useEffect(() => {
    let lock: { release: () => Promise<void> } | null = null;
    const nav = navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<{ release: () => Promise<void> }> } };
    const request = async () => {
      try {
        lock = (await nav.wakeLock?.request('screen')) ?? null;
      } catch {
        /* not supported or denied */
      }
    };
    void request();
    const onVis = () => document.visibilityState === 'visible' && void request();
    document.addEventListener('visibilitychange', onVis);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      void lock?.release();
    };
  }, []);
}

function beep() {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    [0, 0.35, 0.7].forEach((t) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.value = 880;
      g.gain.setValueAtTime(0.2, ctx.currentTime + t);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + t + 0.3);
      o.connect(g).connect(ctx.destination);
      o.start(ctx.currentTime + t);
      o.stop(ctx.currentTime + t + 0.3);
    });
    navigator.vibrate?.([200, 100, 200]);
  } catch {
    /* ignore */
  }
}

function fmt(sec: number) {
  return `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`;
}

/** Timers keyed by step index; they keep running while you move between steps. */
function useStepTimers() {
  const [timers, setTimers] = useState<Record<number, number>>({});
  const [now, setNow] = useState(Date.now());
  const fired = useRef(new Set<number>());
  const running = Object.keys(timers).length > 0;
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, [running]);
  useEffect(() => {
    for (const [k, endsAt] of Object.entries(timers)) {
      const i = Number(k);
      if (endsAt <= now && !fired.current.has(i)) {
        fired.current.add(i);
        beep();
      }
    }
  }, [now, timers]);
  const left = (i: number) => (timers[i] ? Math.max(0, Math.ceil((timers[i] - now) / 1000)) : null);
  const start = (i: number, minutes: number) => {
    fired.current.delete(i);
    setNow(Date.now());
    setTimers((t) => ({ ...t, [i]: Date.now() + minutes * 60_000 }));
  };
  const stop = (i: number) =>
    setTimers((t) => {
      const n = { ...t };
      delete n[i];
      return n;
    });
  return { timers, left, start, stop };
}

function StepTimer({ minutes, left, onStart, onStop }: { minutes: number; left: number | null; onStart: () => void; onStop: () => void }) {
  const done = left === 0;
  return (
    <button
      onClick={() => (left === null || done ? onStart() : onStop())}
      className={cx(
        'mt-8 inline-flex min-h-[56px] items-center gap-3 rounded-full px-6 text-lg font-semibold transition active:scale-95',
        done ? 'animate-pulse bg-tomato-500 text-white' : left !== null ? 'bg-saffron-500 text-ink-900' : 'bg-white/10 text-white',
      )}
      aria-live="polite"
    >
      <Timer size={22} />
      {done ? 'Tijd is om! Tik om opnieuw te starten' : left !== null ? `${fmt(left)} · tik om te stoppen` : `Start timer (${minutes} min)`}
    </button>
  );
}

export function CookingMode() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { recipeMap } = useCatalog();
  const original = id ? recipeMap.get(id) : undefined;
  const prefs = usePreferences();
  const states = useRecipeStates();
  const { ingredientMap } = useCatalog();
  // Cook the vegan version when that's chosen for this recipe (or by default).
  const recipe = useMemo(
    () => (original && wantsVegan(original, ingredientMap, states.get(original.id), prefs.preferVegan) ? veganizeRecipe(original, ingredientMap) : original),
    [original, ingredientMap, states, prefs.preferVegan],
  );
  const { activeWeek, currentWeek } = useWeek();
  const servings = clampServings(Number(params.get('servings')) || prefs.defaultServings);
  const [step, setStep] = useState(0);
  const [showIngredients, setShowIngredients] = useState(false);
  const [finished, setFinished] = useState(false);
  const [cookedSaved, setCookedSaved] = useState(false);
  const touch = useRef<number | null>(null);
  const pantry = useMemo(() => new Set(prefs.pantryItems), [prefs.pantryItems]);
  const timers = useStepTimers();
  useWakeLock();

  const total = recipe?.steps.length ?? 0;
  const go = useCallback(
    (d: number) => {
      if (!recipe) return;
      if (step + d >= total) setFinished(true);
      else setStep((s) => Math.max(0, Math.min(total - 1, s + d)));
    },
    [recipe, step, total],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') go(1);
      if (e.key === 'ArrowLeft') go(-1);
      if (e.key === 'Escape') navigate(-1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [go, navigate]);

  if (!recipe) return null;
  const s = recipe.steps[step];
  const fav = !!states.get(recipe.id)?.favorite;

  const saveCooked = async () => {
    // Record in the week where the recipe is planned, falling back to the current week.
    const plans = await db.plans.bulkGet([activeWeek, currentWeek]);
    const wk = plans.find((p) => p?.meals.some((m) => m.recipeId === recipe.id))?.weekKey ?? currentWeek;
    await markCooked(db, wk, recipe.id, servings);
    setCookedSaved(true);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-[#211c19] text-white"
      onTouchStart={(e) => (touch.current = e.touches[0].clientX)}
      onTouchEnd={(e) => {
        if (touch.current === null || finished || showIngredients) return;
        const dx = e.changedTouches[0].clientX - touch.current;
        if (Math.abs(dx) > 60) go(dx < 0 ? 1 : -1);
        touch.current = null;
      }}
    >
      <header className="flex items-center gap-2 px-3 pt-[calc(0.75rem+env(safe-area-inset-top))]">
        <button aria-label="Kookmodus sluiten" onClick={() => navigate(-1)} className="flex h-12 w-12 items-center justify-center rounded-full hover:bg-white/10">
          <X size={24} />
        </button>
        <div className="min-w-0 flex-1 truncate text-center text-sm text-white/70">{recipe.title}</div>
        <button
          aria-label="Ingrediënten tonen"
          onClick={() => setShowIngredients(true)}
          className="flex h-12 items-center gap-2 rounded-full bg-white/10 px-4 text-sm font-semibold"
        >
          <ListChecks size={18} /> Ingrediënten
        </button>
      </header>

      {Object.keys(timers.timers).map(Number).filter((i) => i !== step || finished).length > 0 && (
        <div className="mx-5 mt-3 flex flex-wrap gap-2">
          {Object.keys(timers.timers)
            .map(Number)
            .filter((i) => i !== step || finished)
            .map((i) => (
              <button
                key={i}
                onClick={() => {
                  setFinished(false);
                  setStep(i);
                }}
                className={cx('inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold', timers.left(i) === 0 ? 'animate-pulse bg-tomato-500' : 'bg-white/10')}
              >
                <Timer size={14} /> Stap {i + 1} · {timers.left(i) === 0 ? 'klaar!' : fmt(timers.left(i) ?? 0)}
              </button>
            ))}
        </div>
      )}

      <div className="mx-5 mt-4 flex gap-1.5" aria-hidden>
        {recipe.steps.map((_, i) => (
          <div key={i} className={cx('h-1.5 flex-1 rounded-full transition-colors', finished || i <= step ? 'bg-saffron-500' : 'bg-white/15')} />
        ))}
      </div>

      {!finished ? (
        <main className="flex flex-1 flex-col justify-center overflow-y-auto px-6 py-8 sm:px-12" key={step}>
          <div className="animate-rise">
            <div className="text-sm font-semibold uppercase tracking-widest text-saffron-500">
              Stap {step + 1} van {total}
            </div>
            <p className="mt-4 font-display text-[26px] leading-snug sm:text-4xl">{s.text}</p>
            {s.timerMinutes && (
              <StepTimer minutes={s.timerMinutes} left={timers.left(step)} onStart={() => timers.start(step, s.timerMinutes!)} onStop={() => timers.stop(step)} />
            )}
          </div>
        </main>
      ) : (
        <main className="flex flex-1 flex-col items-center justify-center px-6 text-center animate-rise">
          <PartyPopper size={56} className="text-saffron-500" />
          <h1 className="mt-4 font-display text-3xl">Eet smakelijk!</h1>
          <p className="mt-2 text-white/70">{recipe.title}</p>
          <div className="mt-8 flex w-full max-w-sm flex-col gap-3">
            <button
              onClick={saveCooked}
              disabled={cookedSaved}
              className="min-h-[56px] rounded-full bg-herb-500 text-lg font-semibold transition active:scale-95 disabled:bg-white/10"
            >
              {cookedSaved ? '✓ Opgeslagen in de geschiedenis' : 'Markeer als gekookt'}
            </button>
            <button
              onClick={() => updateRecipeState(db, recipe.id, { favorite: !fav })}
              className="flex min-h-[56px] items-center justify-center gap-2 rounded-full bg-white/10 text-lg font-semibold transition active:scale-95"
              aria-pressed={fav}
            >
              <Heart size={22} className={cx(fav && 'fill-tomato-500 text-tomato-500 animate-pop')} />
              {fav ? 'Een favoriet!' : 'Dit was heerlijk'}
            </button>
            <button onClick={() => navigate(`/recipe/${recipe.id}`, { replace: true })} className="mt-2 text-white/60 underline-offset-4 hover:underline">
              Terug naar recept & notities
            </button>
          </div>
        </main>
      )}

      {!finished && (
        <footer className="flex gap-3 px-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
          <button
            onClick={() => go(-1)}
            disabled={step === 0}
            className="flex min-h-[64px] w-24 items-center justify-center rounded-3xl bg-white/10 transition active:scale-95 disabled:opacity-30"
            aria-label="Vorige stap"
          >
            <ChevronLeft size={30} />
          </button>
          <button
            onClick={() => go(1)}
            className="flex min-h-[64px] flex-1 items-center justify-center gap-2 rounded-3xl bg-saffron-500 text-lg font-semibold text-ink-900 transition active:scale-[0.98]"
          >
            {step === total - 1 ? 'Klaar' : 'Volgende stap'} <ChevronRight size={26} />
          </button>
        </footer>
      )}

      {showIngredients && (
        <div className="fixed inset-0 z-10 flex flex-col bg-[#211c19]/98 animate-rise" role="dialog" aria-label="Ingrediënten">
          <header className="flex items-center justify-between px-5 pt-[calc(1rem+env(safe-area-inset-top))]">
            <h2 className="font-display text-2xl">Ingrediënten · {servings} {servings === 1 ? 'persoon' : 'personen'}</h2>
            <button aria-label="Ingrediënten sluiten" onClick={() => setShowIngredients(false)} className="flex h-12 w-12 items-center justify-center rounded-full bg-white/10">
              <X size={24} />
            </button>
          </header>
          <div className="flex-1 overflow-y-auto px-3 py-4">
            <IngredientList recipe={recipe} servings={servings} pantry={pantry} large />
          </div>
        </div>
      )}
    </div>
  );
}
