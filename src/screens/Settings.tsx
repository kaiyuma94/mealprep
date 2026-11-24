import { useLiveQuery } from 'dexie-react-hooks';
import { ArrowLeft, Download, Upload, X } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button, Chip, cx, PageHeader, Stepper, TargetPicker, Switch } from '../components/ui';
import { db } from '../db/db';
import { BackupError, exportBackup, importBackup } from '../db/backup';
import { updatePreferences, updateRecipeState } from '../db/repo';
import { MAX_SERVINGS, MIN_SERVINGS } from '../lib/plan';
import { fold } from '../lib/search';
import { STORES } from '../lib/sections';
import { usePreferences, useRecipeStates, useToast } from '../state/hooks';
import { useCatalog } from '../state/catalog';

export function Settings() {
  const navigate = useNavigate();
  const prefs = usePreferences();
  const states = useRecipeStates();
  const toast = useToast();
  const { ingredients, ingredientMap, recipeMap, builtInCount, custom } = useCatalog();
  const history = useLiveQuery(() => db.history.orderBy('cookedAt').reverse().limit(8).toArray(), []);
  const historyCount = useLiveQuery(() => db.history.count(), []);
  const [q, setQ] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const disliked = [...states.values()].filter((s) => s.disliked);
  const pantry = new Set(prefs.pantryItems);
  const matches = useMemo(() => {
    const t = fold(q.trim());
    if (!t) return [];
    return ingredients.filter((i) => !pantry.has(i.id) && (fold(i.name).includes(t) || i.aliases?.some((a) => fold(a).includes(t)))).slice(0, 8);
  }, [q, prefs.pantryItems, ingredients]);

  const doExport = async () => {
    const data = await exportBackup(db);
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `weekmenu-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const doImport = async (file: File) => {
    try {
      const parsed = JSON.parse(await file.text());
      if (!window.confirm('Deze back-up terugzetten? Alle weekmenu’s, favorieten, notities en boodschappenlijsten op dit apparaat worden vervangen.')) return;
      await importBackup(db, parsed);
      toast({ message: 'Back-up teruggezet' });
    } catch (e) {
      toast({ message: e instanceof BackupError ? e.message : 'Dit bestand kon niet worden gelezen.' });
    }
  };

  const card = 'rounded-[24px] bg-white p-4 shadow-card';
  return (
    <div className="pb-8">
      <div className="px-3 pt-[calc(0.75rem+env(safe-area-inset-top))]">
        <button onClick={() => navigate(-1)} className="flex h-11 items-center gap-1 rounded-full px-2 text-sm font-medium text-ink-500 hover:bg-cream-200" aria-label="Terug">
          <ArrowLeft size={18} /> Terug
        </button>
      </div>
      <PageHeader title="Instellingen" />
      <div className="flex flex-col gap-5 px-5">
        <section className={card}>
          <h2 className="font-display text-lg font-semibold">Supermarkt</h2>
          <p className="mt-1 text-sm text-ink-500">De boodschappenlijst volgt de looproute van deze winkel en waarschuwt voor producten die daar lastig te vinden kunnen zijn.</p>
          <div className="mt-3 grid grid-cols-3 gap-2" role="radiogroup" aria-label="Supermarkt">
            {STORES.map((s) => (
              <button
                key={s.id}
                role="radio"
                aria-checked={prefs.supermarket === s.id}
                onClick={() => updatePreferences(db, { supermarket: s.id })}
                className={cx(
                  'min-h-[44px] rounded-2xl text-sm font-semibold transition',
                  prefs.supermarket === s.id ? 'bg-herb-600 text-white shadow-card' : 'bg-cream-50 text-ink-700 ring-1 ring-cream-200',
                )}
              >
                {s.name}
              </button>
            ))}
          </div>
        </section>

        <section className={card}>
          <h2 className="font-display text-lg font-semibold">Standaard voor nieuwe weken</h2>
          <div className="mt-3 flex items-center justify-between gap-3">
            <span className="text-[15px]">Personen per maaltijd</span>
            <Stepper label="personen" value={prefs.defaultServings} min={MIN_SERVINGS} max={MAX_SERVINGS} onChange={(n) => updatePreferences(db, { defaultServings: n })} />
          </div>
          <div className="mt-4 text-[15px]">Kookavonden per week</div>
          <div className="mt-2">
            <TargetPicker value={prefs.defaultMealTarget} onChange={(n) => updatePreferences(db, { defaultMealTarget: n })} />
          </div>
          <p className="mt-2 text-xs text-ink-500">Weken die je al hebt gepland houden hun eigen aantal.</p>
          <div className="mt-5 border-t border-cream-200 pt-4">
            <Switch
              checked={!!prefs.preferVegan}
              onChange={(v) => updatePreferences(db, { preferVegan: v })}
              label="🌱 Kies de vegan versie als dat kan"
              hint="Recepten die met een paar vervangers vegan worden, toon en kook je dan vegan, ook op de boodschappenlijst. Per recept kun je het altijd nog omzetten."
            />
          </div>
        </section>

        <section className={card}>
          <h2 className="font-display text-lg font-semibold">Altijd in huis</h2>
          <p className="mt-1 text-sm text-ink-500">Deze producten staan op elke boodschappenlijst al als ‘in huis’.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {prefs.pantryItems.map((id) => (
              <Chip
                key={id}
                active
                onClick={() => updatePreferences(db, { pantryItems: prefs.pantryItems.filter((x) => x !== id) })}
                aria-label={`${ingredientMap.get(id)?.name ?? id} verwijderen`}
              >
                {ingredientMap.get(id)?.name ?? id} <X size={14} />
              </Chip>
            ))}
          </div>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Ingrediënt toevoegen…"
            className="mt-3 h-11 w-full rounded-2xl bg-cream-50 px-4 text-[16px] ring-1 ring-cream-200 focus:outline-none focus:ring-2 focus:ring-herb-500 focus-visible:ring-offset-0"
          />
          {matches.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {matches.map((i) => (
                <Chip
                  key={i.id}
                  onClick={() => {
                    void updatePreferences(db, { pantryItems: [...prefs.pantryItems, i.id] });
                    setQ('');
                  }}
                >
                  + {i.name}
                </Chip>
              ))}
            </div>
          )}
        </section>

        <section className={card}>
          <h2 className="font-display text-lg font-semibold">Kookgeschiedenis</h2>
          <p className="mt-1 text-sm text-ink-500">{historyCount ?? 0} maaltijden gekookt.</p>
          {history && history.length > 0 && (
            <ul className="mt-3 divide-y divide-cream-200">
              {history.map((h) => (
                <li key={h.id} className="flex justify-between py-2 text-[15px]">
                  <Link to={`/recipe/${h.recipeId}`} className="truncate">
                    {recipeMap.get(h.recipeId)?.title ?? 'Recept niet meer beschikbaar'}
                  </Link>
                  <span className="ml-3 shrink-0 text-sm text-ink-500">{new Date(h.cookedAt).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' })}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {disliked.length > 0 && (
          <section className={card}>
            <h2 className="font-display text-lg font-semibold">Niets voor ons</h2>
            <p className="mt-1 text-sm text-ink-500">Worden nooit voorgesteld. Tik om er een terug te halen.</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {disliked.map((s) => (
                <Chip key={s.recipeId} onClick={() => updateRecipeState(db, s.recipeId, { disliked: false })}>
                  {recipeMap.get(s.recipeId)?.title ?? s.recipeId} <X size={14} />
                </Chip>
              ))}
            </div>
          </section>
        )}

        <section className={card}>
          <h2 className="font-display text-lg font-semibold">Back-up</h2>
          <p className="mt-1 text-sm text-ink-500">Alles staat alleen op dit apparaat. Exporteer een bestand om het veilig te bewaren of naar een andere telefoon te verhuizen.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button variant="secondary" size="sm" onClick={doExport}>
              <Download size={16} /> Exporteren (JSON)
            </Button>
            <Button variant="secondary" size="sm" onClick={() => fileRef.current?.click()}>
              <Upload size={16} /> Terugzetten uit bestand
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void doImport(f);
                e.target.value = '';
              }}
            />
          </div>
        </section>

        <section className="px-1 text-xs leading-relaxed text-ink-500">
          <p>
            Weekmenu bevat {builtInCount} recepten{custom.size > 0 ? ` (plus ${custom.size} eigen)` : ''}: vegetarisch, waaronder vega-versies van vleesgerechten, plus een aantal met vis en garnalen. Ze zijn geïnspireerd op gerechten van HelloFresh: naam en ingrediënten zijn gebaseerd op het origineel, de
            bereidingswijze is in eigen woorden geschreven. Alleen voor persoonlijk gebruik; niet verbonden aan HelloFresh. Looproutes, verpakkingen en
            ‘mogelijk lastig te vinden’-hints zijn indicatief en geen actuele voorraadinformatie.
          </p>
        </section>
      </div>
    </div>
  );
}
