import { lazy, Suspense } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { Discover } from './screens/Discover';
import { MyWeek } from './screens/MyWeek';
import { RecipeDetail } from './screens/RecipeDetail';
import { Search } from './screens/Search';
import { ShoppingList } from './screens/ShoppingList';
import { PlanPromptProvider, ToastProvider, WeekProvider } from './state/hooks';

const CookingMode = lazy(() => import('./screens/CookingMode').then((m) => ({ default: m.CookingMode })));
const Settings = lazy(() => import('./screens/Settings').then((m) => ({ default: m.Settings })));

export function App() {
  return (
    <BrowserRouter>
      <WeekProvider>
        <ToastProvider>
          <PlanPromptProvider>
            <Suspense fallback={null}>
              <Routes>
                <Route element={<Layout />}>
                  <Route index element={<Discover />} />
                  <Route path="search" element={<Search />} />
                  <Route path="week" element={<MyWeek />} />
                  <Route path="shopping" element={<ShoppingList />} />
                  <Route path="recipe/:id" element={<RecipeDetail />} />
                  <Route path="settings" element={<Settings />} />
                  <Route path="*" element={<Discover />} />
                </Route>
                <Route path="recipe/:id/cook" element={<CookingMode />} />
              </Routes>
            </Suspense>
          </PlanPromptProvider>
        </ToastProvider>
      </WeekProvider>
    </BrowserRouter>
  );
}
