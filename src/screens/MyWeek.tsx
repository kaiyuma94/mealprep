import { CalendarPlus, Check, ChefHat, CircleCheck, Plus, Settings, Share2, ShoppingBasket, Trash2 } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { MealTargetCard, SundayToggle, WeekNavigator } from '../components/WeekControls';
import { Button, cx, IconButton, PageHeader, RecipeCover, Stepper } from '../components/ui';
import { RECIPE_MAP } from '../data/catalog';
import { db } from '../db/db';
import { markCooked, mutatePlan, savePlan, unmarkCooked } from '../db/repo';
import { MAX_SERVINGS, MIN_SERVINGS, removeMeal, setServings } from '../lib/plan';
import { weekMenuToText } from '../lib/share';
import { usePlan, useShare, useToast, useWeek } from '../state/hooks';

export function MyWeek() {
  const { activeWeek } = useWeek();
  const plan = usePlan(activeWeek);
  const navigate = useNavigate();
  const toast = useToast();
  const share = useShare();
  if (!plan) return null;
  const empty = Math.max(0, plan.mealTarget - plan.meals.length);
  const cookedCount = plan.meals.filter((m) => m.cookedAt).length;

  return (
    <div>
      <PageHeader
        title="Mijn week"
        right={
          <div className="flex items-center">
            {plan.meals.length > 0 && (
              <IconButton
                label="Weekmenu delen, bijvoorbeeld via WhatsApp"
                className="text-ink-500 hover:bg-cream-200"
                onClick={() => share('Weekmenu', weekMenuToText(plan, RECIPE_MAP, window.location.origin), 'Weekmenu gekopieerd')}
              >
                <Share2 size={21} />
              </IconButton>
            )}
            <Link to="/settings" aria-label="Instellingen & back-up" className="flex h-11 w-11 items-center justify-center rounded-full text-ink-500 hover:bg-cream-200">
              <Settings size={22} />
            </Link>
          </div>
        }
      />
      <SundayToggle />
      <div className="mb-4 flex justify-center px-5">
        <WeekNavigator />
      </div>
      <div className="px-5">
        <MealTargetCard plan={plan} compact />
      </div>

      <section className="mt-6 px-5">
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="font-display text-xl font-semibold">Op het menu</h2>
          {plan.meals.length > 0 && (
            <span className="text-sm text-ink-500">
              {cookedCount} van {plan.meals.length} gekookt
            </span>
          )}
        </div>
        <ul className="flex flex-col gap-3">
          {plan.meals.map((m) => {
            const r = RECIPE_MAP.get(m.recipeId);
            return (
              <li key={m.recipeId} className={cx('rounded-[26px] bg-white p-3 shadow-card animate-rise', m.cookedAt && 'opacity-80')}>
                <div className="flex gap-3">
                  {r ? (
                    <Link to={`/recipe/${r.id}`} className="shrink-0">
                      <RecipeCover recipe={r} className="h-[84px] w-[84px]" rounded="rounded-2xl" />
                    </Link>
                  ) : (
                    <div className="h-[84px] w-[84px] rounded-2xl bg-cream-200" />
                  )}
                  <div className="min-w-0 flex-1">
                    <Link to={r ? `/recipe/${r.id}` : '#'} className="line-clamp-2 font-display text-[15px] font-semibold leading-snug">
                      {r?.title ?? 'Dit recept is niet meer beschikbaar'}
                    </Link>
                    <div className="mt-0.5 text-[13px] text-ink-500">
                      {r ? `${r.prepMinutes + r.cookMinutes} min · ${r.cuisine}` : ''}
                      {m.cookedAt && <span className="ml-1 font-medium text-herb-600">· Gekookt ✓</span>}
                    </div>
                    <div className="mt-2 flex items-center justify-between gap-2">
                      <Stepper
                        label="personen"
                        value={m.servings}
                        min={MIN_SERVINGS}
                        max={MAX_SERVINGS}
                        suffix="pers."
                        onChange={(n) => mutatePlan(db, activeWeek, (p) => ({ plan: setServings(p, m.recipeId, n) }))}
                      />
                      <IconButton
                        label={`${r?.title ?? 'Maaltijd'} schrappen`}
                        className="text-ink-300 hover:bg-cream-100 hover:text-tomato-500"
                        onClick={async () => {
                          const { before } = await mutatePlan(db, activeWeek, (p) => ({ plan: removeMeal(p, m.recipeId) }));
                          toast({ message: 'Maaltijd geschrapt', action: { label: 'Ongedaan maken', onClick: () => void savePlan(db, before) } });
                        }}
                      >
                        <Trash2 size={18} />
                      </IconButton>
                    </div>
                  </div>
                </div>
                {r && (
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <Button size="sm" variant="secondary" onClick={() => navigate(`/recipe/${r.id}/cook?servings=${m.servings}`)}>
                      <ChefHat size={16} /> Koken
                    </Button>
                    <Button
                      size="sm"
                      variant={m.cookedAt ? 'ghost' : 'secondary'}
                      onClick={() => (m.cookedAt ? unmarkCooked(db, activeWeek, r.id) : markCooked(db, activeWeek, r.id, m.servings))}
                    >
                      <CircleCheck size={16} className={cx(m.cookedAt && 'text-herb-600')} /> {m.cookedAt ? 'Toch niet gekookt' : 'Gekookt'}
                    </Button>
                  </div>
                )}
              </li>
            );
          })}
          {Array.from({ length: empty }, (_, i) => (
            <li key={`empty-${i}`}>
              <Link
                to="/"
                className="flex h-[76px] items-center justify-center gap-2 rounded-[26px] border-2 border-dashed border-cream-300 text-[15px] font-medium text-ink-500 transition hover:border-herb-500 hover:text-herb-700"
              >
                <Plus size={18} /> Kies maaltijd {plan.meals.length + i + 1}
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <div className="mt-6 flex flex-col gap-2 px-5">
        {plan.meals.length === 0 ? (
          <Link to="/" className="flex items-center justify-center gap-2 rounded-full bg-herb-600 py-3.5 font-semibold text-white shadow-card">
            <CalendarPlus size={18} /> Bekijk de recepten van deze week
          </Link>
        ) : plan.confirmedAt ? (
          <>
            <div className="flex items-center justify-center gap-2 text-sm font-medium text-herb-700">
              <Check size={16} /> Menu bevestigd
            </div>
            <Link to="/shopping" className="flex items-center justify-center gap-2 rounded-full bg-herb-600 py-3.5 font-semibold text-white shadow-card">
              <ShoppingBasket size={18} /> Naar de boodschappenlijst
            </Link>
          </>
        ) : (
          <Button
            size="lg"
            onClick={async () => {
              await mutatePlan(db, activeWeek, (p) => ({ plan: { ...p, confirmedAt: Date.now(), updatedAt: Date.now() } }));
              navigate('/shopping');
            }}
          >
            <ShoppingBasket size={20} /> Menu bevestigen & boodschappenlijst maken
          </Button>
        )}
        {plan.meals.length > 0 && plan.meals.length < plan.mealTarget && !plan.confirmedAt && (
          <p className="text-center text-xs text-ink-500">Je kunt ook met minder maaltijden bevestigen — er wordt niets geschrapt.</p>
        )}
      </div>
    </div>
  );
}
