import { QueryClient } from '@tanstack/react-query';
import { todayStockholm } from '../shared/day.js';

export const POLL_MS = 15_000;

export function pollInterval(date: string, now: Date): number | false {
  return date === todayStockholm(now) ? POLL_MS : false;
}

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, refetchOnWindowFocus: true, refetchIntervalInBackground: false },
    },
  });
}
