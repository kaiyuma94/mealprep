import Dexie from 'dexie';
import { beforeEach, describe, expect, it } from 'vitest';
import { RECIPES } from '../src/data/catalog';
import { WeekmenuDB } from '../src/db/db';
import { BackupError, exportBackup, importBackup, migrateBackup } from '../src/db/backup';
import { addManualItem, ensureSelection, getPlan, getPreferences, markCooked, mutatePlan, replaceSelectionSlot, savePlan, setOverride, unmarkCooked, updateRecipeState } from '../src/db/repo';
import { addMeal } from '../src/lib/plan';

let db: WeekmenuDB;
let n = 0;
beforeEach(async () => {
  db = new WeekmenuDB(`test-${n++}`);
  await db.open();
});

describe('persistence', () => {
  it('provides defaults for a new user', async () => {
    const prefs = await getPreferences(db);
    expect(prefs.defaultServings).toBe(2);
    expect(prefs.defaultMealTarget).toBe(4);
    expect(prefs.pantryItems).toContain('zout');
    expect(prefs.supermarket).toBe('lidl');
    const plan = await getPlan(db, '2026-W48');
    expect(plan.mealTarget).toBe(4);
    expect(plan.meals).toEqual([]);
  });

  it('stores meal targets independently per week', async () => {
    await savePlan(db, { ...(await getPlan(db, '2026-W48')), mealTarget: 3 });
    await savePlan(db, { ...(await getPlan(db, '2026-W49')), mealTarget: 6 });
    expect((await getPlan(db, '2026-W48')).mealTarget).toBe(3);
    expect((await getPlan(db, '2026-W49')).mealTarget).toBe(6);
    expect((await getPlan(db, '2026-W50')).mealTarget).toBe(4);
  });

  it('does not lose meals when several are added at the same moment', async () => {
    const ids = RECIPES.slice(0, 4).map((r) => r.id);
    await Promise.all(ids.map((id) => mutatePlan(db, '2026-W48', (p) => ({ plan: addMeal(p, id).plan }))));
    expect((await getPlan(db, '2026-W48')).meals.map((m) => m.recipeId).sort()).toEqual([...ids].sort());
  });

  it('keeps the weekly selection stable once created', async () => {
    const a = await ensureSelection(db, '2026-W48', RECIPES);
    await updateRecipeState(db, RECIPES[0].id, { favorite: true });
    await markCooked(db, '2026-W47', RECIPES[1].id, 2);
    const b = await ensureSelection(db, '2026-W48', RECIPES);
    expect(b.slots).toEqual(a.slots);
    const c = await replaceSelectionSlot(db, '2026-W48', 0, RECIPES);
    expect(c.slots[0].recipeId).not.toBe(a.slots[0].recipeId);
    expect(c.slots.slice(1)).toEqual(a.slots.slice(1));
    expect((await ensureSelection(db, '2026-W48', RECIPES)).slots).toEqual(c.slots);
  });

  it('records and undoes cooking history', async () => {
    const id = RECIPES[2].id;
    await savePlan(db, addMeal(await getPlan(db, '2026-W48'), id).plan);
    await markCooked(db, '2026-W48', id, 2);
    await markCooked(db, '2026-W48', id, 2); // idempotent
    expect(await db.history.count()).toBe(1);
    expect((await getPlan(db, '2026-W48')).meals[0].cookedAt).toBeTypeOf('number');
    await unmarkCooked(db, '2026-W48', id);
    expect(await db.history.count()).toBe(0);
    expect((await getPlan(db, '2026-W48')).meals[0].cookedAt).toBeUndefined();
  });

  it('favourite and disliked are mutually exclusive; notes persist', async () => {
    const id = RECIPES[3].id;
    await updateRecipeState(db, id, { favorite: true, notes: 'Extra chilli next time' });
    await updateRecipeState(db, id, { disliked: true });
    const s = await db.recipeState.get(id);
    expect(s).toMatchObject({ favorite: false, disliked: true, notes: 'Extra chilli next time' });
  });

  it('exports and restores a full backup', async () => {
    const id = RECIPES[4].id;
    await savePlan(db, addMeal(await getPlan(db, '2026-W48'), id).plan);
    await updateRecipeState(db, id, { favorite: true, notes: 'lovely' });
    await markCooked(db, '2026-W48', id, 2);
    await setOverride(db, '2026-W48', 'onion', { checked: true, inStock: true });
    await addManualItem(db, '2026-W48', { name: 'Coffee', quantity: '1 bag', section: 'other' });
    await ensureSelection(db, '2026-W48', RECIPES);

    const backup = JSON.parse(JSON.stringify(await exportBackup(db)));
    const fresh = new WeekmenuDB(`restore-${n++}`);
    await importBackup(fresh, backup);
    expect(await fresh.plans.toArray()).toEqual(await db.plans.toArray());
    expect(await fresh.recipeState.toArray()).toEqual(await db.recipeState.toArray());
    expect(await fresh.history.toArray()).toEqual(await db.history.toArray());
    expect(await fresh.shopping.toArray()).toEqual(await db.shopping.toArray());
    expect(await fresh.selections.toArray()).toEqual(await db.selections.toArray());
  });

  it('rejects invalid or future backups without touching data', async () => {
    await savePlan(db, { ...(await getPlan(db, '2026-W48')), mealTarget: 5 });
    expect(() => migrateBackup({ hello: 'world' })).toThrow(BackupError);
    expect(() => migrateBackup({ format: 'weekmenu-backup', version: 99, data: {} })).toThrow(/nieuwere versie/);
    await expect(importBackup(db, { format: 'weekmenu-backup', version: 1, data: { plans: [{ nope: true }] } })).rejects.toThrow(BackupError);
    expect((await getPlan(db, '2026-W48')).mealTarget).toBe(5);
  });

  it('migrates a v1 backup (supermarket "lidl-nl") to v2', async () => {
    const v1 = { format: 'weekmenu-backup', version: 1, exportedAt: '', data: { preferences: [{ id: 'me', defaultServings: 2, defaultMealTarget: 4, supermarket: 'lidl-nl', pantryItems: [], updatedAt: 0 }] } };
    const b = migrateBackup(v1);
    expect(b.version).toBe(2);
    expect(b.data.preferences[0].supermarket).toBe('lidl');
    await importBackup(db, v1);
    expect((await getPreferences(db)).supermarket).toBe('lidl');
  });

  it('upgrades an existing v1 IndexedDB to v2', async () => {
    const name = `upgrade-${n++}`;
    const old = new Dexie(name);
    old.version(1).stores({ preferences: 'id', recipeState: 'recipeId', plans: 'weekKey', selections: 'weekKey', history: '++id, recipeId, weekKey, cookedAt', shopping: 'weekKey' });
    await old.table('preferences').put({ id: 'me', defaultServings: 3, defaultMealTarget: 5, supermarket: 'lidl-nl', pantryItems: ['zout'], updatedAt: 0 });
    await old.table('plans').put({ weekKey: '2026-W48', mealTarget: 5, meals: [], updatedAt: 0 });
    old.close();
    const upgraded = new WeekmenuDB(name);
    const prefs = await getPreferences(upgraded);
    expect(prefs).toMatchObject({ supermarket: 'lidl', defaultServings: 3, defaultMealTarget: 5 });
    expect((await getPlan(upgraded, '2026-W48')).mealTarget).toBe(5);
    expect(upgraded.verno).toBe(2);
  });

  it('accepts partial backups (missing tables become empty)', () => {
    const b = migrateBackup({ format: 'weekmenu-backup', version: 1, data: { plans: [] } });
    expect(b.data.history).toEqual([]);
  });
});
