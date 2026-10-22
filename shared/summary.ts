import type { PositionView } from './types';

export interface DaySummary {
  taken: number;
  closed: { count: number; result: number };
  open: { count: number; result: number; unpriced: number };
  total: { result: number; unpriced: number };
  attempts: { pending: number; notFilled: number; noOrder: number };
}

export function summarize(positions: PositionView[]): DaySummary {
  const s: DaySummary = {
    taken: 0,
    closed: { count: 0, result: 0 },
    open: { count: 0, result: 0, unpriced: 0 },
    total: { result: 0, unpriced: 0 },
    attempts: { pending: 0, notFilled: 0, noOrder: 0 },
  };
  for (const p of positions) {
    if (p.bought > 0) s.taken += 1;
    if (p.status === 'closed') {
      s.closed.count += 1;
      s.closed.result += p.result ?? 0;
    } else if (p.status === 'open') {
      s.open.count += 1;
      if (p.result === null) s.open.unpriced += 1;
      else s.open.result += p.result;
    } else if (p.status === 'pending') s.attempts.pending += 1;
    else if (p.status === 'notFilled') s.attempts.notFilled += 1;
    else if (p.status === 'noOrder') s.attempts.noOrder += 1;
  }
  s.total = { result: s.closed.result + s.open.result, unpriced: s.open.unpriced };
  return s;
}
