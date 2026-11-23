import { useLiveQuery } from 'dexie-react-hooks';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { RECIPES } from '../data/catalog';
import { db } from '../db/db';
import { defaultPreferences, ensureSelection, getPlan, mutatePlan } from '../db/repo';
import { addMeal, addMealRaisingTarget, MAX_MEALS, removeMeal, swapMeal } from '../lib/plan';
import { currentWeek, isSundayInAmsterdam, planningWeek } from '../lib/week';
import type { RecipeUserState, UserPreferences, WeekKey, WeeklyMealPlan, WeeklySelection } from '../types';

// ---------- Week context ----------

interface WeekCtx {
  activeWeek: WeekKey;
  setActiveWeek: (w: WeekKey) => void;
  planningWeek: WeekKey;
  currentWeek: WeekKey;
  isSunday: boolean;
}

const WeekContext = createContext<WeekCtx | null>(null);

export function WeekProvider({ children }: { children: ReactNode }) {
  const [now, setNow] = useState(() => new Date());
  // Re-evaluate the date every minute so Sunday → Monday rolls over in an open tab.
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);
  const pw = planningWeek(now);
  const cw = currentWeek(now);
  const [activeWeek, setActiveWeek] = useState<WeekKey>(pw);
  const value = useMemo(
    () => ({ activeWeek, setActiveWeek, planningWeek: pw, currentWeek: cw, isSunday: isSundayInAmsterdam(now) }),
    [activeWeek, pw, cw, now],
  );
  return <WeekContext.Provider value={value}>{children}</WeekContext.Provider>;
}

export function useWeek(): WeekCtx {
  const c = useContext(WeekContext);
  if (!c) throw new Error('useWeek outside WeekProvider');
  return c;
}

// ---------- Live data ----------

export function usePreferences(): UserPreferences {
  return useLiveQuery(() => db.preferences.get('me'), []) ?? defaultPreferences(0);
}

export function usePlan(weekKey: WeekKey): WeeklyMealPlan | undefined {
  return useLiveQuery(() => getPlan(db, weekKey), [weekKey]);
}

export function useRecipeStates(): Map<string, RecipeUserState> {
  const list = useLiveQuery(() => db.recipeState.toArray(), []);
  return useMemo(() => new Map((list ?? []).map((s) => [s.recipeId, s])), [list]);
}

export function useCookedIds(): Set<string> {
  const list = useLiveQuery(() => db.history.toArray(), []);
  return useMemo(() => new Set((list ?? []).map((h) => h.recipeId)), [list]);
}

export function useSelection(weekKey: WeekKey): WeeklySelection | undefined {
  const stored = useLiveQuery(() => db.selections.get(weekKey), [weekKey]);
  useEffect(() => {
    // Generate on first visit to a week.
    void ensureSelection(db, weekKey, RECIPES);
  }, [weekKey]);
  return stored;
}

// ---------- Toasts ----------

interface Toast {
  id: number;
  message: string;
  action?: { label: string; onClick: () => void };
}

const ToastContext = createContext<(t: Omit<Toast, 'id'>) => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((t: Omit<Toast, 'id'>) => {
    const id = Date.now() + Math.random();
    setToasts((xs) => [...xs.slice(-1), { ...t, id }]);
    setTimeout(() => setToasts((xs) => xs.filter((x) => x.id !== id)), 3200);
  }, []);
  return (
    <ToastContext.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-50 flex flex-col items-center gap-2 px-4" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className="pointer-events-auto flex max-w-md items-center gap-3 rounded-2xl bg-ink-900 px-4 py-3 text-sm text-cream-50 shadow-lift animate-rise">
            <span>{t.message}</span>
            {t.action && (
              <button className="font-semibold text-saffron-500" onClick={t.action.onClick}>
                {t.action.label}
              </button>
            )}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);

// ---------- Plan actions ----------

export interface FullPlanPrompt {
  recipeId: string;
  servings: number;
  plan: WeeklyMealPlan;
}

const PlanPromptContext = createContext<{ prompt: FullPlanPrompt | null; setPrompt: (p: FullPlanPrompt | null) => void }>({
  prompt: null,
  setPrompt: () => {},
});

export function PlanPromptProvider({ children }: { children: ReactNode }) {
  const [prompt, setPrompt] = useState<FullPlanPrompt | null>(null);
  return <PlanPromptContext.Provider value={{ prompt, setPrompt }}>{children}</PlanPromptContext.Provider>;
}

export const usePlanPrompt = () => useContext(PlanPromptContext);

/** Add/remove recipes from a week's plan, with a prompt instead of silent drops when full. */
export function usePlanActions(weekKey: WeekKey) {
  const toast = useToast();
  const { setPrompt } = usePlanPrompt();
  const prefs = usePreferences();

  const toggle = useCallback(
    async (recipeId: string, servings = prefs.defaultServings) => {
      const { before, after, result } = await mutatePlan<'removed' | 'added' | 'full'>(db, weekKey, (plan) => {
        if (plan.meals.some((m) => m.recipeId === recipeId)) return { plan: removeMeal(plan, recipeId), result: 'removed' };
        const r = addMeal(plan, recipeId, servings);
        if (r.status === 'full') return { result: 'full' };
        return { plan: r.plan, result: 'added' };
      });
      if (result === 'removed') {
        toast({
          message: 'Uit je weekmenu gehaald',
          action: { label: 'Ongedaan maken', onClick: () => void mutatePlan(db, weekKey, (p) => ({ plan: addMeal(p, recipeId, servings).plan })) },
        });
      } else if (result === 'full') {
        setPrompt({ recipeId, servings, plan: before });
      } else {
        const n = after.meals.length;
        toast({ message: n === after.mealTarget ? `Week compleet — ${n} van ${n} maaltijden 🎉` : `Toegevoegd · ${n} van ${after.mealTarget} maaltijden` });
      }
    },
    [weekKey, prefs.defaultServings, toast, setPrompt],
  );

  return { toggle };
}

export async function resolveFullPlan(p: FullPlanPrompt, choice: { type: 'raise' } | { type: 'swap'; outRecipeId: string }) {
  await mutatePlan(db, p.plan.weekKey, (fresh) => {
    if (choice.type === 'raise') {
      if (fresh.mealTarget >= MAX_MEALS) return {};
      return { plan: addMealRaisingTarget(fresh, p.recipeId, p.servings).plan };
    }
    return { plan: swapMeal(fresh, choice.outRecipeId, p.recipeId, p.servings) };
  });
}
