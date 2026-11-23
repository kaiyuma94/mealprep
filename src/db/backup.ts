import type { CookingHistory, CustomRecipeRecord, RecipeUserState, ShoppingState, UserPreferences, WeeklyMealPlan, WeeklySelection } from '../types';
import { migrateSupermarket, type WeekmenuDB } from './db';

export const BACKUP_FORMAT = 'weekmenu-backup';
export const BACKUP_VERSION = 3;

export interface BackupData {
  preferences: UserPreferences[];
  recipeState: RecipeUserState[];
  plans: WeeklyMealPlan[];
  selections: WeeklySelection[];
  history: CookingHistory[];
  shopping: ShoppingState[];
  /** The user's own recipes (since backup version 3). */
  customRecipes: CustomRecipeRecord[];
}

export interface BackupFile {
  format: typeof BACKUP_FORMAT;
  version: number;
  exportedAt: string;
  data: BackupData;
}

export async function exportBackup(db: WeekmenuDB): Promise<BackupFile> {
  const [preferences, recipeState, plans, selections, history, shopping, customRecipes] = await Promise.all([
    db.preferences.toArray(),
    db.recipeState.toArray(),
    db.plans.toArray(),
    db.selections.toArray(),
    db.history.toArray(),
    db.shopping.toArray(),
    db.customRecipes.toArray(),
  ]);
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    data: { preferences, recipeState, plans, selections, history, shopping, customRecipes },
  };
}

export class BackupError extends Error {}

type Migration = (data: Record<string, unknown>) => Record<string, unknown>;

/**
 * Backup migrations, keyed by the version they upgrade *from*.
 * Example for a future v2: `1: (d) => ({ ...d, plans: d.plans.map(addField) })`.
 */
const MIGRATIONS: Record<number, Migration> = {
  // v1 → v2: preferences.supermarket 'lidl-nl' → 'lidl' | 'ah' | 'jumbo'
  1: (d) => ({
    ...d,
    preferences: Array.isArray(d.preferences)
      ? d.preferences.map((p: Record<string, unknown>) => ({ ...p, supermarket: migrateSupermarket(p.supermarket) }))
      : d.preferences,
  }),
  // v2 → v3: own recipes arrived; older backups simply have none.
  2: (d) => ({ ...d, customRecipes: [] }),
};

/** Validates and upgrades a parsed backup file to the current version. */
export function migrateBackup(raw: unknown): BackupFile {
  if (typeof raw !== 'object' || raw === null) throw new BackupError('Dit is geen Weekmenu-back-up.');
  const file = raw as Record<string, unknown>;
  if (file.format !== BACKUP_FORMAT) throw new BackupError('Dit is geen Weekmenu-back-up.');
  let version = Number(file.version);
  if (!Number.isInteger(version) || version < 1) throw new BackupError('De versie van de back-up ontbreekt of is ongeldig.');
  if (version > BACKUP_VERSION) throw new BackupError('Deze back-up is gemaakt met een nieuwere versie van Weekmenu. Werk de app eerst bij.');
  let data = (file.data ?? {}) as Record<string, unknown>;
  while (version < BACKUP_VERSION) {
    const m = MIGRATIONS[version];
    if (!m) throw new BackupError(`Geen migratie beschikbaar vanaf back-upversie ${version}.`);
    data = m(data);
    version++;
  }
  const arr = <T,>(k: keyof BackupData): T[] => {
    const v = data[k];
    if (v === undefined) return [];
    if (!Array.isArray(v)) throw new BackupError(`Back-upveld "${k}" is beschadigd.`);
    return v as T[];
  };
  const result: BackupData = {
    preferences: arr('preferences'),
    recipeState: arr('recipeState'),
    plans: arr('plans'),
    selections: arr('selections'),
    history: arr('history'),
    shopping: arr('shopping'),
    customRecipes: arr('customRecipes'),
  };
  for (const p of result.plans) {
    if (typeof p?.weekKey !== 'string' || !Array.isArray(p.meals)) throw new BackupError('De back-up bevat een ongeldig weekmenu.');
  }
  for (const h of result.history) {
    if (typeof h?.recipeId !== 'string' || typeof h.weekKey !== 'string') throw new BackupError('De back-up bevat een ongeldige kookgeschiedenis.');
  }
  for (const c of result.customRecipes) {
    const ok =
      typeof c?.id === 'string' &&
      c.recipe?.id === c.id &&
      typeof c.recipe.title === 'string' &&
      Array.isArray(c.recipe.ingredients) &&
      Array.isArray(c.recipe.steps) &&
      Array.isArray(c.extraIngredients) &&
      Array.isArray(c.ingredientLines);
    if (!ok) throw new BackupError('De back-up bevat een ongeldig eigen recept.');
  }
  return { format: BACKUP_FORMAT, version: BACKUP_VERSION, exportedAt: String(file.exportedAt ?? ''), data: result };
}

/** Replaces all local data with the backup contents (atomically). */
export async function importBackup(db: WeekmenuDB, raw: unknown): Promise<BackupFile> {
  const backup = migrateBackup(raw);
  const d = backup.data;
  await db.transaction('rw', [db.preferences, db.recipeState, db.plans, db.selections, db.history, db.shopping, db.customRecipes], async () => {
    await Promise.all([
      db.preferences.clear(), db.recipeState.clear(), db.plans.clear(),
      db.selections.clear(), db.history.clear(), db.shopping.clear(), db.customRecipes.clear(),
    ]);
    await db.preferences.bulkPut(d.preferences);
    await db.recipeState.bulkPut(d.recipeState);
    await db.plans.bulkPut(d.plans);
    await db.selections.bulkPut(d.selections);
    await db.history.bulkPut(d.history);
    await db.shopping.bulkPut(d.shopping);
    await db.customRecipes.bulkPut(d.customRecipes);
  });
  return backup;
}
