import { ArrowRight, Refrigerator } from 'lucide-react';
import { Link } from 'react-router-dom';
import { RecipeCard } from '../components/RecipeCard';
import { MealTargetCard, SundayToggle, weekRelation } from '../components/WeekControls';
import { PageHeader } from '../components/ui';
import { db } from '../db/db';
import { replaceSelectionSlot } from '../db/repo';
import { BUCKET_LABELS } from '../lib/selection';
import { weekRangeLabel } from '../lib/week';
import { useCookedIds, usePlan, usePlanActions, useRecipeStates, useSelection, useToast, useWeek } from '../state/hooks';
import type { SuggestionBucket } from '../types';
import { useCatalog } from '../state/catalog';

export function Discover() {
  const { activeWeek, currentWeek, planningWeek } = useWeek();
  const plan = usePlan(activeWeek);
  const selection = useSelection(activeWeek);
  const states = useRecipeStates();
  const cooked = useCookedIds();
  const { toggle } = usePlanActions(activeWeek);
  const toast = useToast();
  const { recipes, recipeMap } = useCatalog();
  const planned = new Set(plan?.meals.map((m) => m.recipeId));

  const groups: { bucket: SuggestionBucket; items: { index: number; recipeId: string }[] }[] = [];
  selection?.slots.forEach((s, index) => {
    const g = groups.find((x) => x.bucket === s.bucket);
    if (g) g.items.push({ index, recipeId: s.recipeId });
    else groups.push({ bucket: s.bucket, items: [{ index, recipeId: s.recipeId }] });
  });
  const coldStart = selection && !selection.slots.some((s) => s.bucket === 'enjoyed');
  const full = plan && plan.meals.length >= plan.mealTarget;

  return (
    <div>
      <PageHeader eyebrow={`${weekRelation(activeWeek, currentWeek, planningWeek)} · ${weekRangeLabel(activeWeek)}`} title="Wat eten we?" />
      <SundayToggle />
      <div className="px-5">{plan && <MealTargetCard plan={plan} />}</div>

      <Link to="/koelkast" className="mx-5 mt-3 flex items-center gap-3 rounded-[22px] bg-white px-4 py-3.5 shadow-card ring-1 ring-cream-200 transition hover:ring-herb-500">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-sky-100 text-sky-700">
          <Refrigerator size={20} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-semibold text-ink-900">Wat heb ik nog?</span>
          <span className="block text-sm text-ink-500">Recepten voor wat er nog in de koelkast ligt</span>
        </span>
        <ArrowRight size={18} className="shrink-0 text-ink-300" />
      </Link>

      {full && (
        <Link to="/week" className="mx-5 mt-3 flex items-center justify-between rounded-[22px] bg-herb-600 px-5 py-4 text-white shadow-card animate-rise">
          <span className="font-semibold">Je week staat — bekijk het menu</span>
          <ArrowRight size={20} />
        </Link>
      )}


      {groups.map((g) => (
        <section key={g.bucket} className="mt-8 px-5">
          <div className="mb-3">
            <h2 className="font-display text-xl font-semibold">{coldStart && g.bucket === 'match' ? 'Mooi om mee te beginnen' : BUCKET_LABELS[g.bucket].title}</h2>
            <p className="text-sm text-ink-500">{coldStart && g.bucket === 'match' ? 'Een mix van snelle en gezellige gerechten' : BUCKET_LABELS[g.bucket].blurb}</p>
          </div>
          <div className="grid grid-cols-2 gap-x-3 gap-y-6 sm:grid-cols-3">
            {g.items.map(({ index, recipeId }) => {
              const r = recipeMap.get(recipeId);
              if (!r) return null;
              return (
                <RecipeCard
                  key={recipeId}
                  recipe={r}
                  planned={planned.has(r.id)}
                  favorite={states.get(r.id)?.favorite}
                  cookedBefore={cooked.has(r.id)}
                  onToggle={() => toggle(r.id)}
                  onReplace={async () => {
                    const before = selection!.slots[index].recipeId;
                    const next = await replaceSelectionSlot(db, activeWeek, index, recipes);
                    if (next.slots[index].recipeId === before) toast({ message: 'Geen andere suggesties meer deze week' });
                  }}
                />
              );
            })}
          </div>
        </section>
      ))}

      <div className="mx-5 mt-10 rounded-[22px] border border-dashed border-cream-300 p-5 text-center">
        <p className="text-sm text-ink-500">Zit er niets tussen?</p>
        <Link to="/search" className="mt-1 inline-flex items-center gap-1 font-semibold text-herb-700">
          Bekijk alle {recipes.length} recepten <ArrowRight size={16} />
        </Link>
      </div>
    </div>
  );
}
