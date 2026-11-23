import Dexie, { type Table } from 'dexie';
import type { CookingHistory, RecipeUserState, ShoppingState, UserPreferences, WeeklyMealPlan, WeeklySelection } from '../types';

/**
 * IndexedDB schema.
 *
 * Migration policy: never edit an existing `version(n)` block once released.
 * Add `this.version(n + 1).stores({...}).upgrade(tx => ...)` instead; Dexie
 * runs the upgrade chain automatically for users on older versions.
 * Keep BACKUP_VERSION (backup.ts) in step when the persisted shape changes.
 */
export const DB_VERSION = 2;

export class WeekmenuDB extends Dexie {
  preferences!: Table<UserPreferences, string>;
  recipeState!: Table<RecipeUserState, string>;
  plans!: Table<WeeklyMealPlan, string>;
  selections!: Table<WeeklySelection, string>;
  history!: Table<CookingHistory, number>;
  shopping!: Table<ShoppingState, string>;

  constructor(name = 'weekmenu') {
    super(name);
    this.version(1).stores({
      preferences: 'id',
      recipeState: 'recipeId',
      plans: 'weekKey',
      selections: 'weekKey',
      history: '++id, recipeId, weekKey, cookedAt, [recipeId+weekKey]',
      shopping: 'weekKey',
    });
    // v2: multi-supermarket support. 'lidl-nl' becomes the store id 'lidl'.
    this.version(2)
      .stores({})
      .upgrade((tx) =>
        tx
          .table('preferences')
          .toCollection()
          .modify((p: { supermarket?: string }) => {
            p.supermarket = migrateSupermarket(p.supermarket);
          }),
      );
  }
}

export function migrateSupermarket(value: unknown): 'lidl' | 'ah' | 'jumbo' {
  return value === 'ah' || value === 'jumbo' ? value : 'lidl';
}

export const db = new WeekmenuDB();
