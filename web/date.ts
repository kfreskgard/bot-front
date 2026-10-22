import { isValidDate, todayStockholm } from '../shared/day.js';

export function resolveDate(param: string | null, now: Date): { date: string; replace: boolean } {
  if (param !== null && isValidDate(param)) return { date: param, replace: false };
  return { date: todayStockholm(now), replace: true };
}
