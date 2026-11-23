import { useLiveQuery } from 'dexie-react-hooks';
import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { INGREDIENTS, RECIPES } from '../data/catalog';
import { db } from '../db/db';
import { mergeCatalog, type Catalog } from '../lib/catalogMerge';

const CatalogContext = createContext<Catalog | null>(null);

/** Built-in recipes plus the user's own ones, kept live from IndexedDB. */
export function CatalogProvider({ children }: { children: ReactNode }) {
  const custom = useLiveQuery(() => db.customRecipes.toArray(), []);
  const catalog = useMemo(() => mergeCatalog(RECIPES, INGREDIENTS, custom), [custom]);
  return <CatalogContext.Provider value={catalog}>{children}</CatalogContext.Provider>;
}

export function useCatalog(): Catalog {
  const c = useContext(CatalogContext);
  if (!c) throw new Error('useCatalog must be used inside CatalogProvider');
  return c;
}
