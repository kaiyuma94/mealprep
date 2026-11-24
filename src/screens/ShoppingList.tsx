import { useLiveQuery } from 'dexie-react-hooks';
import { Check, Home, MoreHorizontal, Plus, Share2, ShoppingBasket, Store } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button, cx, EmptyState, IconButton, PageHeader, ProgressBar, Sheet } from '../components/ui';
import { SundayToggle, weekRelation } from '../components/WeekControls';
import { db } from '../db/db';
import { addManualItem, clearChecks, removeManualItem, setOverride, updateManualItem, updatePreferences } from '../db/repo';
import { SECTION_LABELS, STORE_SECTION_ORDER, STORES, storeName, storeShort } from '../lib/sections';
import { buildShoppingList, groupBySection, shoppingListToText } from '../lib/shopping';
import { weekRangeLabel } from '../lib/week';
import { usePlan, usePreferences, useRecipeStates, useShare, useWeek } from '../state/hooks';
import type { ShoppingItem, StoreId, SupermarketSection } from '../types';
import { useCatalog } from '../state/catalog';
import { veganizeRecipe, wantsVegan } from '../lib/diet';

export function ShoppingList() {
  const { activeWeek, currentWeek, planningWeek } = useWeek();
  const plan = usePlan(activeWeek);
  const prefs = usePreferences();
  const store = prefs.supermarket;
  const state = useLiveQuery(() => db.shopping.get(activeWeek), [activeWeek]);
  const { recipeMap, ingredientMap } = useCatalog();
  const recipeStates = useRecipeStates();
  // Meals cooked as their vegan version put the plant-based alternatives on the list.
  const listRecipes = useMemo(() => {
    const m = new Map(recipeMap);
    for (const meal of plan?.meals ?? []) {
      const r = recipeMap.get(meal.recipeId);
      if (r && wantsVegan(r, ingredientMap, recipeStates.get(r.id), prefs.preferVegan)) m.set(r.id, veganizeRecipe(r, ingredientMap));
    }
    return m;
  }, [recipeMap, ingredientMap, plan, recipeStates, prefs.preferVegan]);
  const [editing, setEditing] = useState<ShoppingItem | null>(null);
  const [adding, setAdding] = useState(false);
  const [showStock, setShowStock] = useState(false);

  const items = useMemo(
    () =>
      plan
        ? buildShoppingList({
            weekKey: activeWeek,
            meals: plan.meals,
            recipes: listRecipes,
            ingredients: ingredientMap,
            pantry: new Set(prefs.pantryItems),
            state,
            store,
          })
        : [],
    [plan, prefs.pantryItems, state, activeWeek, store, listRecipes, ingredientMap],
  );
  const toBuy = items.filter((i) => !i.inStock);
  const inStock = items.filter((i) => i.inStock);
  const checked = toBuy.filter((i) => i.checked).length;
  const hiddenCount = Object.values(state?.overrides ?? {}).filter((o) => o.hidden).length;

  const toggleCheck = (i: ShoppingItem) =>
    i.manual ? updateManualItem(db, activeWeek, i.key.slice(7), { checked: !i.checked }) : setOverride(db, activeWeek, i.key, { checked: !i.checked });

  const share = useShare();
  const shareList = () => share('Boodschappenlijst', shoppingListToText(items, activeWeek, store), 'Boodschappenlijst gekopieerd');

  if (!plan) return null;

  return (
    <div>
      <PageHeader
        eyebrow={`${weekRelation(activeWeek, currentWeek, planningWeek)} · ${weekRangeLabel(activeWeek)}`}
        title="Boodschappen"
        right={
          items.length > 0 && (
            <Button size="sm" variant="secondary" onClick={shareList} aria-label="Boodschappenlijst delen, bijvoorbeeld via WhatsApp">
              <Share2 size={16} /> Delen
            </Button>
          )
        }
      />
      <SundayToggle />

      {plan.meals.length === 0 && (state?.manualItems.length ?? 0) === 0 ? (
        <EmptyState icon={<ShoppingBasket size={28} />} title="Nog geen maaltijden gekozen">
          Kies jullie avondeten en de lijst maakt zichzelf.{' '}
          <Link to="/" className="font-semibold text-herb-700">
            Begin met plannen
          </Link>
        </EmptyState>
      ) : (
        <>
          <div className="mx-5 rounded-[24px] bg-white p-4 shadow-card">
            <StorePicker value={store} onChange={(s) => updatePreferences(db, { supermarket: s })} />
            <div className="mt-4 flex items-baseline justify-between text-sm">
              <span className="font-semibold">
                {checked} van {toBuy.length} in het mandje
              </span>
              <span className="text-ink-500">
                {plan.meals.length} {plan.meals.length === 1 ? 'maaltijd' : 'maaltijden'}
              </span>
            </div>
            <ProgressBar value={checked} max={Math.max(1, toBuy.length)} className="mt-3" />
            <p className="mt-3 flex items-start gap-1.5 text-xs text-ink-500">
              <Store size={14} className="mt-px shrink-0" />
              Gesorteerd op de gebruikelijke looproute van {storeName(store)}. Verpakkingen zijn indicatief, geen actuele voorraad.
            </p>
          </div>

          {groupBySection(toBuy, store).map((g) => (
            <section key={g.section} className="mt-6 px-5">
              <h2 className="mb-2 flex items-center gap-2 text-[13px] font-semibold uppercase tracking-wider text-ink-500">
                <span aria-hidden>{SECTION_LABELS[g.section].icon}</span> {SECTION_LABELS[g.section].label}
              </h2>
              <ul className="divide-y divide-cream-200 overflow-hidden rounded-[22px] bg-white shadow-card">
                {g.items.map((i) => (
                  <ItemRow key={i.key} item={i} store={store} onToggle={() => toggleCheck(i)} onMore={() => setEditing(i)} />
                ))}
              </ul>
            </section>
          ))}

          <div className="mt-6 flex flex-wrap gap-2 px-5">
            <Button variant="secondary" size="sm" onClick={() => setAdding(true)}>
              <Plus size={16} /> Iets toevoegen
            </Button>
            {checked > 0 && (
              <Button variant="ghost" size="sm" onClick={() => clearChecks(db, activeWeek)}>
                Alles weer afvinken
              </Button>
            )}
          </div>

          {inStock.length > 0 && (
            <section className="mt-8 px-5">
              <button
                onClick={() => setShowStock((s) => !s)}
                className="flex w-full items-center justify-between rounded-[22px] bg-cream-200/60 px-4 py-3 text-left"
                aria-expanded={showStock}
              >
                <span className="flex items-center gap-2 text-sm font-semibold text-ink-700">
                  <Home size={16} /> Al in huis ({inStock.length})
                </span>
                <span className="text-sm text-ink-500">{showStock ? 'Verbergen' : 'Tonen'}</span>
              </button>
              {showStock && (
                <ul className="mt-2 divide-y divide-cream-200 overflow-hidden rounded-[22px] bg-white/70">
                  {inStock.map((i) => (
                    <li key={i.key} className="flex items-center gap-3 px-4 py-2.5">
                      <span className="flex-1 text-[15px] text-ink-500">
                        <span className="inline-block first-letter:uppercase">{i.name}</span> <span className="text-xs">· {i.required}</span>
                        {i.fromPantry && <span className="ml-1 text-xs text-ink-300">(voorraad)</span>}
                      </span>
                      <button className="text-sm font-semibold text-herb-700" onClick={() => setOverride(db, activeWeek, i.key, { inStock: false })}>
                        Toch kopen
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}

          {hiddenCount > 0 && (
            <div className="mt-4 px-5 text-center">
              <button
                className="text-sm text-ink-500 underline-offset-4 hover:underline"
                onClick={async () => {
                  for (const [k, o] of Object.entries(state?.overrides ?? {})) if (o.hidden) await setOverride(db, activeWeek, k, { hidden: undefined });
                }}
              >
                {hiddenCount} {hiddenCount === 1 ? 'verwijderd item' : 'verwijderde items'} terugzetten
              </button>
            </div>
          )}
        </>
      )}

      {editing && <ItemSheet item={editing} weekKey={activeWeek} onClose={() => setEditing(null)} />}
      {adding && <AddItemSheet weekKey={activeWeek} store={store} onClose={() => setAdding(false)} />}
    </div>
  );
}

function StorePicker({ value, onChange }: { value: StoreId; onChange: (s: StoreId) => void }) {
  return (
    <div className="grid grid-cols-3 gap-1 rounded-full bg-cream-100 p-1" role="radiogroup" aria-label="Supermarkt">
      {STORES.map((s) => (
        <button
          key={s.id}
          role="radio"
          aria-checked={value === s.id}
          onClick={() => onChange(s.id)}
          className={cx(
            'min-h-[36px] rounded-full text-sm font-semibold transition',
            value === s.id ? 'bg-white text-ink-900 shadow-card' : 'text-ink-500',
          )}
        >
          {s.name}
        </button>
      ))}
    </div>
  );
}

function ItemRow({ item, store, onToggle, onMore }: { item: ShoppingItem; store: StoreId; onToggle: () => void; onMore: () => void }) {
  return (
    <li className={cx('flex items-center gap-1 pl-2 pr-1 transition', item.checked && 'bg-cream-50')}>
      <button onClick={onToggle} className="flex min-h-[60px] flex-1 items-center gap-3 py-2 pl-2 text-left" aria-pressed={item.checked}>
        <span
          className={cx(
            'flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 transition',
            item.checked ? 'border-herb-500 bg-herb-500 text-white animate-pop' : 'border-cream-300',
          )}
          aria-hidden
        >
          {item.checked && <Check size={16} strokeWidth={3} />}
        </span>
        <span className="min-w-0 flex-1">
          <span className={cx('block text-[15px] font-medium leading-snug first-letter:uppercase', item.checked && 'text-ink-300 line-through')}>{item.name}</span>
          <span className={cx('block text-[13px]', item.checked ? 'text-ink-300' : 'text-ink-500')}>
            {item.purchase ? (
              <>
                <strong className="font-semibold text-ink-700">{item.purchase}</strong> · nodig: {item.required}
              </>
            ) : (
              item.required
            )}
          </span>
          {(item.limitedHere || item.substitutedFrom || item.edited || item.manual) && !item.checked && (
            <span className="mt-1 flex flex-wrap gap-1">
              {item.limitedHere && (
                <Badge className="bg-[#e6f0fb] text-[#1f5fa6]">
                  Mogelijk lastig bij {storeShort(store)}
                  {item.alsoAt.length > 0 && ` · probeer ${item.alsoAt.map(storeShort).join(' of ')}`}
                </Badge>
              )}
              {item.substitutedFrom && <Badge className="bg-saffron-100 text-ink-700">in plaats van {item.substitutedFrom}</Badge>}
              {item.edited && <Badge className="bg-cream-100 text-ink-500">aangepast</Badge>}
              {item.manual && <Badge className="bg-cream-100 text-ink-500">zelf toegevoegd</Badge>}
            </span>
          )}
        </span>
      </button>
      <IconButton label={`Opties voor ${item.name}`} onClick={onMore} className="text-ink-300 hover:bg-cream-100 hover:text-ink-700">
        <MoreHorizontal size={20} />
      </IconButton>
    </li>
  );
}

const Badge = ({ className, children }: { className: string; children: React.ReactNode }) => (
  <span className={cx('rounded-full px-2 py-0.5 text-[11px] font-semibold', className)}>{children}</span>
);

const field =
  'mt-1 h-12 w-full rounded-2xl bg-white px-4 text-[16px] font-normal ring-1 ring-cream-200 focus:outline-none focus:ring-2 focus:ring-herb-500 focus-visible:ring-offset-0';

function ItemSheet({ item, weekKey, onClose }: { item: ShoppingItem; weekKey: string; onClose: () => void }) {
  const [qty, setQty] = useState(item.edited || item.manual ? item.required : '');
  const { ingredientMap } = useCatalog();
  const ing = item.ingredientId ? ingredientMap.get(item.ingredientId) : undefined;
  const done = (p: Promise<unknown>) => p.then(onClose);

  if (item.manual) {
    const id = item.key.slice(7);
    return (
      <Sheet open onClose={onClose} title={item.name}>
        <label className="block text-sm font-semibold text-ink-700">
          Hoeveelheid
          <input value={qty} onChange={(e) => setQty(e.target.value)} className={field} />
        </label>
        <div className="mt-5 flex gap-2">
          <Button variant="danger" className="flex-1" onClick={() => done(removeManualItem(db, weekKey, id))}>
            Verwijderen
          </Button>
          <Button className="flex-1" onClick={() => done(updateManualItem(db, weekKey, id, { quantity: qty }))}>
            Opslaan
          </Button>
        </div>
      </Sheet>
    );
  }

  return (
    <Sheet open onClose={onClose} title={item.name.charAt(0).toUpperCase() + item.name.slice(1)}>
      <p className="text-sm text-ink-500">Voor {item.recipes.map((r) => r.title).join(', ')}</p>
      {item.note && <p className="mt-2 rounded-2xl bg-saffron-100 px-3 py-2 text-sm text-ink-700">{item.note}</p>}

      <Button variant="secondary" className="mt-4 w-full" onClick={() => done(setOverride(db, weekKey, item.key, { inStock: true }))}>
        <Home size={18} /> Hebben we al in huis
      </Button>

      {item.substitutes.length > 0 && (
        <div className="mt-5">
          <h3 className="mb-2 text-sm font-semibold text-ink-700">Niet te vinden? Neem in plaats daarvan</h3>
          <div className="flex flex-wrap gap-2">
            {item.substitutedFrom && (
              <button
                className="rounded-full bg-white px-3.5 py-2 text-sm ring-1 ring-cream-200"
                onClick={() => done(setOverride(db, weekKey, item.key, { substituteId: undefined }))}
              >
                ↩ {ing?.name}
              </button>
            )}
            {item.substitutes.map((s) => (
              <button
                key={s.id}
                className="rounded-full bg-white px-3.5 py-2 text-sm ring-1 ring-cream-200 hover:ring-herb-500"
                onClick={() => done(setOverride(db, weekKey, item.key, { substituteId: s.id }))}
              >
                {s.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {item.purchaseAlternatives && item.purchaseAlternatives.length > 0 && (
        <div className="mt-5">
          <h3 className="text-sm font-semibold text-ink-700">Liever een andere verpakking?</h3>
          <p className="mb-2 text-xs text-ink-500">
            Nodig: {item.required}
            {item.purchase ? ` · voorstel: ${item.purchase}` : ''}
          </p>
          <div className="flex flex-wrap gap-2">
            {item.purchaseAlternatives.map((alt) => (
              <button
                key={alt}
                className="rounded-full bg-white px-3.5 py-2 text-sm ring-1 ring-cream-200 hover:ring-herb-500"
                onClick={() => done(setOverride(db, weekKey, item.key, { editedQuantity: alt.replace(/^los: /, '') }))}
              >
                {alt}
              </button>
            ))}
          </div>
        </div>
      )}

      <label className="mt-5 block text-sm font-semibold text-ink-700">
        Hoeveelheid aanpassen
        <input value={qty} onChange={(e) => setQty(e.target.value)} placeholder={item.purchase ?? item.required} className={field} />
      </label>
      <div className="mt-5 flex gap-2">
        <Button variant="ghost" className="flex-1 text-tomato-600" onClick={() => done(setOverride(db, weekKey, item.key, { hidden: true }))}>
          Van de lijst halen
        </Button>
        <Button className="flex-1" onClick={() => done(setOverride(db, weekKey, item.key, { editedQuantity: qty.trim() || undefined }))}>
          Opslaan
        </Button>
      </div>
    </Sheet>
  );
}

function AddItemSheet({ weekKey, store, onClose }: { weekKey: string; store: StoreId; onClose: () => void }) {
  const [name, setName] = useState('');
  const [quantity, setQuantity] = useState('');
  const [section, setSection] = useState<SupermarketSection>('other');
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    await addManualItem(db, weekKey, { name: name.trim(), quantity: quantity.trim(), section });
    onClose();
  };
  return (
    <Sheet open onClose={onClose} title="Toevoegen aan de lijst">
      <form onSubmit={submit} className="flex flex-col gap-4">
        <label className="text-sm font-semibold text-ink-700">
          Product
          <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Bijv. koffiebonen" className={field} />
        </label>
        <label className="text-sm font-semibold text-ink-700">
          Hoeveelheid <span className="font-normal text-ink-500">(optioneel)</span>
          <input value={quantity} onChange={(e) => setQuantity(e.target.value)} placeholder="Bijv. 1 zak" className={field} />
        </label>
        <label className="text-sm font-semibold text-ink-700">
          Afdeling
          <select value={section} onChange={(e) => setSection(e.target.value as SupermarketSection)} className={field}>
            {STORE_SECTION_ORDER[store].map((s) => (
              <option key={s} value={s}>
                {SECTION_LABELS[s].label}
              </option>
            ))}
          </select>
        </label>
        <Button type="submit" disabled={!name.trim()}>
          Toevoegen
        </Button>
      </form>
    </Sheet>
  );
}
