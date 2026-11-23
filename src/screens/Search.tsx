import { SearchX, Search as SearchIcon, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { RecipeCard } from '../components/RecipeCard';
import { Chip, EmptyState, PageHeader } from '../components/ui';
import { CUISINES, INGREDIENT_MAP, RECIPES } from '../data/catalog';
import { buildSearchIndex, searchRecipes, type DurationFilter, type SearchFilters, type StatusFilter } from '../lib/search';
import { useCookedIds, usePlan, usePlanActions, useRecipeStates, useWeek } from '../state/hooks';

const INDEX = buildSearchIndex(RECIPES, INGREDIENT_MAP);

const DURATIONS: { id: DurationFilter; label: string }[] = [
  { id: 'quick', label: '≤ 25 min' },
  { id: 'medium', label: '25–40 min' },
  { id: 'long', label: '40+ min' },
];
const STATUSES: { id: StatusFilter; label: string }[] = [
  { id: 'favorites', label: '♥ Favorieten' },
  { id: 'cooked', label: 'Eerder gekookt' },
  { id: 'new', label: 'Nog niet gekookt' },
];

export function Search() {
  const { activeWeek } = useWeek();
  const plan = usePlan(activeWeek);
  const states = useRecipeStates();
  const cooked = useCookedIds();
  const { toggle } = usePlanActions(activeWeek);
  const [f, setF] = useState<SearchFilters>(() => {
    try {
      const saved = sessionStorage.getItem('wm-search');
      if (saved) return JSON.parse(saved) as SearchFilters;
    } catch {
      /* ignore */
    }
    return { query: '', duration: 'any', cuisine: null, status: null };
  });
  const update = (patch: Partial<SearchFilters>) =>
    setF((cur) => {
      const next = { ...cur, ...patch };
      try {
        sessionStorage.setItem('wm-search', JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });

  const favorites = useMemo(() => new Set([...states.values()].filter((s) => s.favorite).map((s) => s.recipeId)), [states]);
  const disliked = useMemo(() => new Set([...states.values()].filter((s) => s.disliked).map((s) => s.recipeId)), [states]);
  const results = useMemo(() => searchRecipes(RECIPES, INDEX, f, { favorites, cooked, disliked }), [f, favorites, cooked, disliked]);
  const planned = new Set(plan?.meals.map((m) => m.recipeId));
  const anyFilter = f.query || f.duration !== 'any' || f.cuisine || f.status;

  return (
    <div>
      <PageHeader title="Recept zoeken" />
      <div className="sticky top-0 z-30 bg-cream-100/95 px-5 pb-3 pt-1 backdrop-blur">
        <label className="flex h-12 items-center gap-2 rounded-2xl bg-white px-4 shadow-card ring-1 ring-cream-200 focus-within:ring-2 focus-within:ring-herb-500">
          <SearchIcon size={18} className="text-ink-500" />
          <input
            type="search"
            value={f.query}
            onChange={(e) => update({ query: e.target.value })}
            placeholder="Gerecht, ingrediënt, keuken…"
            className="h-full flex-1 bg-transparent text-[16px] outline-none placeholder:text-ink-300 focus-visible:ring-0 focus-visible:ring-offset-0"
            aria-label="Recepten zoeken"
          />
          {f.query && (
            <button aria-label="Zoekopdracht wissen" onClick={() => update({ query: '' })} className="text-ink-500">
              <X size={18} />
            </button>
          )}
        </label>
        <div className="-mx-5 mt-3 flex gap-2 overflow-x-auto px-5 pb-1 [scrollbar-width:none]">
          {STATUSES.map((s) => (
            <Chip key={s.id} active={f.status === s.id} onClick={() => update({ status: f.status === s.id ? null : s.id })}>
              {s.label}
            </Chip>
          ))}
          <span className="mx-1 w-px shrink-0 bg-cream-300" />
          {DURATIONS.map((d) => (
            <Chip key={d.id} active={f.duration === d.id} onClick={() => update({ duration: f.duration === d.id ? 'any' : d.id })}>
              {d.label}
            </Chip>
          ))}
        </div>
        <div className="-mx-5 mt-2 flex gap-2 overflow-x-auto px-5 pb-1 [scrollbar-width:none]">
          {CUISINES.map((c) => (
            <Chip key={c} active={f.cuisine === c} onClick={() => update({ cuisine: f.cuisine === c ? null : c })}>
              {c}
            </Chip>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between px-5 pb-2 pt-2 text-sm text-ink-500">
        <span>
          {results.length} {results.length === 1 ? 'recept' : 'recepten'}
        </span>
        {anyFilter && (
          <button className="font-medium text-herb-700" onClick={() => update({ query: '', duration: 'any', cuisine: null, status: null })}>
            Alles wissen
          </button>
        )}
      </div>

      {results.length === 0 ? (
        <EmptyState icon={<SearchX size={28} />} title="Niets gevonden">
          Probeer een ander ingrediënt of haal een filter weg.
        </EmptyState>
      ) : (
        <div className="grid gap-3 px-5 sm:grid-cols-2">
          {results.map((r) => (
            <RecipeCard
              key={r.id}
              layout="row"
              recipe={r}
              planned={planned.has(r.id)}
              favorite={favorites.has(r.id)}
              cookedBefore={cooked.has(r.id)}
              onToggle={() => toggle(r.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
