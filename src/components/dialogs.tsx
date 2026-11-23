import { useState } from 'react';
import { RECIPE_MAP } from '../data/catalog';
import { MAX_MEALS } from '../lib/plan';
import { resolveFullPlan, usePlanPrompt, useToast } from '../state/hooks';
import type { WeeklyMealPlan } from '../types';
import { Button, cx, RecipeCover, Sheet } from './ui';

/** Shown when adding a recipe to a week that is already full. */
export function FullPlanDialog() {
  const { prompt, setPrompt } = usePlanPrompt();
  const toast = useToast();
  const [swapOut, setSwapOut] = useState<string | null>(null);
  if (!prompt) return null;
  const recipe = RECIPE_MAP.get(prompt.recipeId);
  const close = () => {
    setPrompt(null);
    setSwapOut(null);
  };
  const canRaise = prompt.plan.mealTarget < MAX_MEALS;
  return (
    <Sheet open onClose={close} title="Je week is vol">
      <p className="mb-4 text-[15px] text-ink-700">
        Je hebt {prompt.plan.meals.length} van {prompt.plan.mealTarget} maaltijden gekozen. Voeg <strong>{recipe?.title}</strong> toe als extra avond, of wissel het om voor een van deze:
      </p>
      <MealPicker meals={prompt.plan.meals.map((m) => m.recipeId)} selected={swapOut ? [swapOut] : []} onToggle={(id) => setSwapOut(swapOut === id ? null : id)} />
      <div className="mt-5 flex flex-col gap-2">
        <Button
          disabled={!swapOut}
          onClick={async () => {
            await resolveFullPlan(prompt, { type: 'swap', outRecipeId: swapOut! });
            toast({ message: 'Omgewisseld' });
            close();
          }}
        >
          Omwisselen
        </Button>
        {canRaise && (
          <Button
            variant="secondary"
            onClick={async () => {
              await resolveFullPlan(prompt, { type: 'raise' });
              toast({ message: `Deze week ${prompt.plan.mealTarget + 1} avonden koken` });
              close();
            }}
          >
            Toch {prompt.plan.mealTarget + 1} avonden koken
          </Button>
        )}
      </div>
    </Sheet>
  );
}

export function MealPicker({ meals, selected, onToggle }: { meals: string[]; selected: string[]; onToggle: (id: string) => void }) {
  return (
    <ul className="flex flex-col gap-2">
      {meals.map((id) => {
        const r = RECIPE_MAP.get(id);
        const on = selected.includes(id);
        return (
          <li key={id}>
            <button
              onClick={() => onToggle(id)}
              aria-pressed={on}
              className={cx(
                'flex w-full items-center gap-3 rounded-2xl p-2 text-left transition',
                on ? 'bg-tomato-50 ring-2 ring-tomato-500' : 'bg-white ring-1 ring-cream-200',
              )}
            >
              {r ? <RecipeCover recipe={r} className="h-12 w-12 shrink-0" rounded="rounded-xl" /> : <div className="h-12 w-12 rounded-xl bg-cream-200" />}
              <span className="flex-1 text-sm font-medium">{r?.title ?? 'Recept niet meer beschikbaar'}</span>
              <span
                className={cx('mr-1 flex h-6 w-6 items-center justify-center rounded-full border-2 text-xs font-bold', on ? 'border-tomato-500 bg-tomato-500 text-white' : 'border-cream-300')}
                aria-hidden
              >
                {on ? '✕' : ''}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/** Asks which meals to remove when lowering the number of cooking days. */
export function RemoveMealsDialog({
  plan,
  target,
  removeCount,
  onCancel,
  onConfirm,
}: {
  plan: WeeklyMealPlan;
  target: number;
  removeCount: number;
  onCancel: () => void;
  onConfirm: (ids: string[]) => void;
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const toggle = (id: string) =>
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : s.length < removeCount ? [...s, id] : [...s.slice(1), id]));
  return (
    <Sheet open onClose={onCancel} title={`${target} ${target === 1 ? 'avond' : 'avonden'} koken?`}>
      <p className="mb-4 text-[15px] text-ink-700">
        Je hebt {plan.meals.length} maaltijden gepland. Kies {removeCount === 1 ? 'één maaltijd' : `${removeCount} maaltijden`} om te schrappen.
      </p>
      <MealPicker meals={plan.meals.map((m) => m.recipeId)} selected={selected} onToggle={toggle} />
      <div className="mt-5 flex gap-2">
        <Button variant="secondary" className="flex-1" onClick={onCancel}>
          Alles houden
        </Button>
        <Button variant="danger" className="flex-1" disabled={selected.length !== removeCount} onClick={() => onConfirm(selected)}>
          Schrap {selected.length}/{removeCount}
        </Button>
      </div>
    </Sheet>
  );
}
