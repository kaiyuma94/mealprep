import type { Ingredient, Recipe } from '../types';
import { recipeDiet, type Diet } from './diet';

export type DurationFilter = 'any' | 'quick' | 'medium' | 'long';
export type StatusFilter = 'favorites' | 'cooked' | 'new' | 'own';

export interface SearchFilters {
  query: string;
  duration: DurationFilter;
  cuisine: string | null;
  status: StatusFilter | null;
  /** Only vegan, only vegetarian (vegan included) or only fish recipes. Optional so older saved filters still load. */
  diet?: Diet | null;
  /** @deprecated older saved filters; read as diet 'vegan'. */
  vegan?: boolean;
}

export const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Pre-computes a searchable text index per recipe: title, cuisine, tags and ingredient names/aliases. */
export function buildSearchIndex(recipes: Recipe[], ingredients: Map<string, Ingredient>) {
  return new Map(
    recipes.map((r) => {
      const ing = r.ingredients.flatMap((ri) => {
        const i = ingredients.get(ri.ingredientId);
        return i ? [i.name, i.plural ?? '', ...(i.aliases ?? [])] : [];
      });
      const diet = recipeDiet(r, ingredients);
      const words = diet === 'vegan' ? ['vegan', 'vegetarisch'] : diet === 'vegetarian' ? ['vegetarisch'] : ['vis'];
      return [r.id, { title: fold(`${r.title} ${r.subtitle ?? ''}`), rest: fold([r.cuisine, ...r.tags, ...words, ...ing].join(' | ')), diet }];
    }),
  );
}

export function matchesDuration(r: Recipe, d: DurationFilter): boolean {
  const t = r.prepMinutes + r.cookMinutes;
  if (d === 'quick') return t <= 25;
  if (d === 'medium') return t > 25 && t <= 40;
  if (d === 'long') return t > 40;
  return true;
}

export function searchRecipes(
  recipes: Recipe[],
  index: ReturnType<typeof buildSearchIndex>,
  f: SearchFilters,
  user: { favorites: Set<string>; cooked: Set<string>; disliked: Set<string> },
): Recipe[] {
  const tokens = fold(f.query).split(/\s+/).filter(Boolean);
  const scored: { r: Recipe; score: number }[] = [];
  for (const r of recipes) {
    if (!matchesDuration(r, f.duration)) continue;
    if (f.cuisine && r.cuisine !== f.cuisine) continue;
    if (f.status === 'favorites' && !user.favorites.has(r.id)) continue;
    if (f.status === 'cooked' && !user.cooked.has(r.id)) continue;
    if (f.status === 'new' && user.cooked.has(r.id)) continue;
    if (f.status === 'own' && r.source.type !== 'personal') continue;
    const idx = index.get(r.id)!;
    const diet = f.diet ?? (f.vegan ? 'vegan' : null);
    if (diet === 'vegan' && idx.diet !== 'vegan') continue;
    if (diet === 'vegetarian' && idx.diet === 'fish') continue;
    if (diet === 'fish' && idx.diet !== 'fish') continue;
    let score = 0;
    let ok = true;
    for (const t of tokens) {
      if (idx.title.includes(t)) score += 3;
      else if (idx.rest.includes(t)) score += 1;
      else {
        ok = false;
        break;
      }
    }
    if (!ok) continue;
    if (user.disliked.has(r.id)) score -= 10; // still findable, but sinks
    scored.push({ r, score });
  }
  return scored.sort((a, b) => b.score - a.score || a.r.title.localeCompare(b.r.title)).map((x) => x.r);
}
