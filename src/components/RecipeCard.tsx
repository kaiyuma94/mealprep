import { Check, Clock, Heart, Plus, RefreshCw } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { Recipe } from '../types';
import { cx, minutesLabel, RecipeCover } from './ui';

interface Props {
  recipe: Recipe;
  planned: boolean;
  favorite?: boolean;
  cookedBefore?: boolean;
  onToggle: () => void;
  onReplace?: () => void;
  layout?: 'grid' | 'row';
}

export function RecipeCard({ recipe, planned, favorite, cookedBefore, onToggle, onReplace, layout = 'grid' }: Props) {
  if (layout === 'row') {
    return (
      <div className="flex items-center gap-3 rounded-3xl bg-white p-2.5 pr-3 shadow-card animate-rise">
        <Link to={`/recipe/${recipe.id}`} className="flex min-w-0 flex-1 items-center gap-3">
          <RecipeCover recipe={recipe} className="h-20 w-20 shrink-0" rounded="rounded-2xl" />
          <div className="min-w-0">
            <h3 className="line-clamp-2 font-display text-[15px] font-semibold leading-snug text-ink-900">{recipe.title}</h3>
            <Meta recipe={recipe} favorite={favorite} cookedBefore={cookedBefore} />
          </div>
        </Link>
        <AddButton planned={planned} onToggle={onToggle} title={recipe.title} />
      </div>
    );
  }
  return (
    <article className="group relative flex flex-col animate-rise">
      <Link to={`/recipe/${recipe.id}`} className="block">
        <RecipeCover recipe={recipe} className="aspect-[4/3] w-full transition duration-300 group-hover:shadow-lift" />
        <h3 className="mt-2.5 line-clamp-2 font-display text-[15px] font-semibold leading-snug text-ink-900 sm:text-base">{recipe.title}</h3>
      </Link>
      <Meta recipe={recipe} favorite={favorite} cookedBefore={cookedBefore} />
      <div className="absolute right-2 top-2 flex gap-1.5">
        {onReplace && !planned && (
          <button
            onClick={onReplace}
            aria-label={`Iets anders in plaats van ${recipe.title}`}
            title="Iets anders"
            className="flex h-10 w-10 items-center justify-center rounded-full bg-white/85 text-ink-700 shadow-card backdrop-blur transition active:rotate-90"
          >
            <RefreshCw size={16} />
          </button>
        )}
        <AddButton planned={planned} onToggle={onToggle} title={recipe.title} floating />
      </div>
    </article>
  );
}

function Meta({ recipe, favorite, cookedBefore }: { recipe: Recipe; favorite?: boolean; cookedBefore?: boolean }) {
  return (
    <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[13px] text-ink-500">
      <span className="inline-flex items-center gap-1">
        <Clock size={13} /> {minutesLabel(recipe)}
      </span>
      <span aria-hidden>·</span>
      <span>{recipe.cuisine}</span>
      {favorite && <Heart size={13} className="fill-tomato-500 text-tomato-500" aria-label="Favoriet" />}
      {cookedBefore && !favorite && <span className="text-herb-600">Eerder gekookt</span>}
    </div>
  );
}

function AddButton({ planned, onToggle, title, floating }: { planned: boolean; onToggle: () => void; title: string; floating?: boolean }) {
  return (
    <button
      onClick={onToggle}
      aria-pressed={planned}
      aria-label={planned ? `${title} uit mijn week halen` : `${title} aan mijn week toevoegen`}
      className={cx(
        'flex h-10 w-10 shrink-0 items-center justify-center rounded-full shadow-card transition active:scale-90',
        planned ? 'bg-herb-600 text-white animate-pop' : floating ? 'bg-white/90 text-ink-900 backdrop-blur' : 'bg-cream-100 text-ink-900',
      )}
    >
      {planned ? <Check size={18} strokeWidth={3} /> : <Plus size={18} strokeWidth={2.5} />}
    </button>
  );
}
