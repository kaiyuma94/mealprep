import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useState } from 'react';
import { db } from '../db/db';
import { mutatePlan, savePlan } from '../db/repo';
import { changeMealTarget, changeMealTargetWithRemoval } from '../lib/plan';
import { addWeeks, weekNumberLabel, weekRangeLabel } from '../lib/week';
import { useToast, useWeek } from '../state/hooks';
import type { WeeklyMealPlan } from '../types';
import { RemoveMealsDialog } from './dialogs';
import { cx, IconButton, ProgressBar, TargetPicker } from './ui';

export function weekRelation(week: string, current: string, planning: string): string {
  if (week === current) return 'Deze week';
  if (week === addWeeks(current, 1)) return 'Volgende week';
  if (week === addWeeks(current, -1)) return 'Vorige week';
  return week === planning ? 'Planning' : weekNumberLabel(week);
}

/** On Sunday: segmented toggle between next week (default) and the current week. */
export function SundayToggle() {
  const { isSunday, activeWeek, setActiveWeek, currentWeek, planningWeek } = useWeek();
  if (!isSunday) return null;
  return (
    <div className="mx-5 mb-4 inline-flex rounded-full bg-cream-200/70 p-1 text-sm font-medium">
      {[
        { w: planningWeek, label: 'Volgende week' },
        { w: currentWeek, label: 'Deze week' },
      ].map(({ w, label }) => (
        <button
          key={w}
          onClick={() => setActiveWeek(w)}
          aria-pressed={activeWeek === w}
          className={cx('rounded-full px-4 py-1.5 transition', activeWeek === w ? 'bg-white text-ink-900 shadow-card' : 'text-ink-500')}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

export function WeekNavigator() {
  const { activeWeek, setActiveWeek, currentWeek, planningWeek } = useWeek();
  return (
    <div className="flex items-center gap-1">
      <IconButton label="Vorige week" className="hover:bg-cream-200" onClick={() => setActiveWeek(addWeeks(activeWeek, -1))}>
        <ChevronLeft size={22} />
      </IconButton>
      <button className="min-w-[7.5rem] text-center" onClick={() => setActiveWeek(planningWeek)} title="Terug naar de week die je plant">
        <div className="text-sm font-semibold text-ink-900">{weekRelation(activeWeek, currentWeek, planningWeek)}</div>
        <div className="text-xs text-ink-500">{weekRangeLabel(activeWeek)}</div>
      </button>
      <IconButton label="Volgende week" className="hover:bg-cream-200" onClick={() => setActiveWeek(addWeeks(activeWeek, 1))}>
        <ChevronRight size={22} />
      </IconButton>
    </div>
  );
}

/** Cooking-days picker with progress. Lowering below the selection asks which meals to drop. */
export function MealTargetCard({ plan, compact }: { plan: WeeklyMealPlan; compact?: boolean }) {
  const toast = useToast();
  const [pending, setPending] = useState<{ target: number; removeCount: number } | null>(null);
  const chosen = plan.meals.length;
  const done = chosen >= plan.mealTarget;

  const onChange = async (n: number) => {
    const { result } = await mutatePlan(db, plan.weekKey, (p) => {
      const r = changeMealTarget(p, n);
      return r.status === 'ok' ? { plan: r.plan } : { result: r };
    });
    if (result?.status === 'needs-removal') setPending({ target: result.target, removeCount: result.removeCount });
  };

  return (
    <section className="rounded-[28px] bg-white p-4 shadow-card sm:p-5">
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <h2 className="font-display text-[17px] font-semibold">{compact ? 'Kookavonden' : 'Hoeveel avonden koken jullie?'}</h2>
        <span className={cx('text-sm font-semibold tabular-nums', done ? 'text-herb-600' : 'text-ink-500')}>
          {chosen} van {plan.mealTarget} gekozen
        </span>
      </div>
      <TargetPicker value={plan.mealTarget} onChange={onChange} />
      <ProgressBar value={chosen} max={plan.mealTarget} className="mt-4" />
      {pending && (
        <RemoveMealsDialog
          plan={plan}
          target={pending.target}
          removeCount={pending.removeCount}
          onCancel={() => setPending(null)}
          onConfirm={async (ids) => {
            try {
              const { before } = await mutatePlan(db, plan.weekKey, (p) => ({ plan: changeMealTargetWithRemoval(p, pending.target, ids) }));
              toast({ message: `${ids.length} ${ids.length > 1 ? 'maaltijden' : 'maaltijd'} geschrapt`, action: { label: 'Ongedaan maken', onClick: () => void savePlan(db, before) } });
            } catch {
              toast({ message: 'Je week is intussen gewijzigd — probeer het opnieuw' });
            }
            setPending(null);
          }}
        />
      )}
    </section>
  );
}
