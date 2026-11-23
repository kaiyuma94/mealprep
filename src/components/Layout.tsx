import { CalendarHeart, Compass, Search, ShoppingBasket } from 'lucide-react';
import { useEffect } from 'react';
import { NavLink, Outlet, useLocation, useNavigationType } from 'react-router-dom';
import { usePlan, useWeek } from '../state/hooks';
import { FullPlanDialog } from './dialogs';
import { cx } from './ui';

const tabs = [
  { to: '/', label: 'Ontdekken', icon: Compass, end: true },
  { to: '/search', label: 'Zoeken', icon: Search },
  { to: '/week', label: 'Mijn week', icon: CalendarHeart },
  { to: '/shopping', label: 'Boodschappen', icon: ShoppingBasket },
];

export function Layout() {
  const { activeWeek } = useWeek();
  const plan = usePlan(activeWeek);
  const { pathname } = useLocation();
  const navType = useNavigationType();
  useEffect(() => {
    // A new page starts at the top; going back keeps where you were.
    if (navType !== 'POP') window.scrollTo(0, 0);
  }, [pathname, navType]);
  return (
    <div className="min-h-screen bg-cream-100 text-ink-900 md:flex">
      {/* Desktop side rail */}
      <nav className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col gap-1 border-r border-cream-200 px-4 py-8 md:flex" aria-label="Hoofdmenu">
        <div className="mb-8 px-3 font-display text-2xl font-semibold text-herb-700">Weekmenu</div>
        {tabs.map((t) => (
          <NavLink
            key={t.to}
            to={t.to}
            end={t.end}
            className={({ isActive }) =>
              cx('flex items-center gap-3 rounded-2xl px-3 py-2.5 font-medium transition', isActive ? 'bg-white text-ink-900 shadow-card' : 'text-ink-500 hover:bg-cream-200/60')
            }
          >
            <t.icon size={20} />
            {t.label}
            {t.to === '/week' && plan && <span className="ml-auto text-xs tabular-nums text-ink-500">{plan.meals.length}/{plan.mealTarget}</span>}
          </NavLink>
        ))}
      </nav>

      <main className="mx-auto w-full max-w-3xl pb-[calc(6rem+env(safe-area-inset-bottom))] md:pb-12">
        <Outlet />
      </main>

      {/* Mobile bottom bar */}
      <nav
        className="fixed inset-x-0 bottom-0 z-40 border-t border-cream-200/80 bg-cream-50/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-lg md:hidden"
        aria-label="Hoofdmenu"
      >
        <div className="mx-auto grid max-w-lg grid-cols-4">
          {tabs.map((t) => (
            <NavLink
              key={t.to}
              to={t.to}
              end={t.end}
              className={({ isActive }) =>
                cx('relative flex min-h-[60px] flex-col items-center justify-center gap-0.5 text-[11px] font-medium transition', isActive ? 'text-herb-700' : 'text-ink-500')
              }
            >
              {({ isActive }) => (
                <>
                  <span className={cx('flex h-8 w-14 items-center justify-center rounded-full transition', isActive && 'bg-herb-100')}>
                    <t.icon size={21} strokeWidth={isActive ? 2.4 : 2} />
                  </span>
                  {t.label}
                  {t.to === '/week' && plan && plan.meals.length > 0 && (
                    <span className="absolute right-[18%] top-1.5 min-w-[18px] rounded-full bg-tomato-500 px-1 text-center text-[10px] font-bold leading-[18px] text-white">
                      {plan.meals.length}
                    </span>
                  )}
                </>
              )}
            </NavLink>
          ))}
        </div>
      </nav>
      <FullPlanDialog />
    </div>
  );
}

/** Full-screen layout without navigation (cooking mode). */
export function BareLayout() {
  return <Outlet />;
}
