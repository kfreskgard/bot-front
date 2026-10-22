import { QueryClientProvider } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { todayStockholm } from '../shared/day.js';
import { NotFound } from './NotFound.js';
import { PAGES } from './pages.js';
import { createQueryClient } from './query.js';
import { resolveDate } from './date.js';
import { hrefFor, resolvePage } from './registry.js';
import { navigate, useLocation } from './router.js';
import { LiveProvider } from './shell/live.js';
import { Shell } from './shell/Shell.js';

function useToday(): string {
  const [today, setToday] = useState(() => todayStockholm(new Date()));
  useEffect(() => {
    const id = setInterval(() => setToday(todayStockholm(new Date())), 60_000);
    return () => clearInterval(id);
  }, []);
  return today;
}

export function App() {
  const [client] = useState(() => createQueryClient());
  const { path, query } = useLocation();
  const today = useToday();
  const page = resolvePage(PAGES, path);
  const { date, replace } = resolveDate(query.get('date'), new Date());
  const needsReplace = replace && !!page?.usesDate;

  useEffect(() => {
    if (page && needsReplace) navigate(hrefFor(page, date), { replace: true });
  }, [page, needsReplace, date]);

  return (
    <QueryClientProvider client={client}>
      <LiveProvider>
        <Shell pages={PAGES} page={page} date={date} today={today}>
          {page ? <page.component key={page.id} date={date} /> : <NotFound />}
        </Shell>
      </LiveProvider>
    </QueryClientProvider>
  );
}
