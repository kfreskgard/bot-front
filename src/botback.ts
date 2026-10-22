import type { PositionsResponse } from '../shared/types';

export type BotBackResult =
  | { ok: true; data: PositionsResponse }
  | { ok: false; kind: 'unreachable' | 'error'; message: string };

export interface BotBackClient {
  getPositions(date: string): Promise<BotBackResult>;
}

const STATUSES: readonly string[] = ['noOrder', 'pending', 'open', 'closed', 'notFilled'];
const STRING_FIELDS = ['id', 'stockId', 'stockName', 'state'] as const;
const DATE_FIELDS = ['created', 'lastUpdated'] as const;
const NUMBER_FIELDS = ['targetAmount', 'bought', 'sold', 'orderCount'] as const;
const NULLABLE_NUMBER_FIELDS = ['avgBuyPrice', 'avgSellPrice', 'lastPrice', 'result', 'resultPercent'] as const;

const isDateString = (v: unknown): boolean => typeof v === 'string' && !Number.isNaN(Date.parse(v));
const isFiniteNumber = (v: unknown): boolean => typeof v === 'number' && Number.isFinite(v);

export function validatePositionsResponse(
  body: unknown,
): { ok: true; data: PositionsResponse } | { ok: false; path: string } {
  const fail = (path: string) => ({ ok: false as const, path });
  if (typeof body !== 'object' || body === null) return fail('body');
  const obj = body as Record<string, unknown>;
  if (typeof obj.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(obj.date)) return fail('date');
  if (!Array.isArray(obj.positions)) return fail('positions');

  for (let i = 0; i < obj.positions.length; i++) {
    const row: unknown = obj.positions[i];
    const at = `positions[${i}]`;
    if (typeof row !== 'object' || row === null || Array.isArray(row)) return fail(at);
    const p = row as Record<string, unknown>;
    for (const f of STRING_FIELDS) if (typeof p[f] !== 'string') return fail(`${at}.${f}`);
    if (typeof p.status !== 'string' || !STATUSES.includes(p.status)) return fail(`${at}.status`);
    if (typeof p.untracked !== 'boolean') return fail(`${at}.untracked`);
    for (const f of DATE_FIELDS) if (!isDateString(p[f])) return fail(`${at}.${f}`);
    for (const f of NUMBER_FIELDS) if (!isFiniteNumber(p[f])) return fail(`${at}.${f}`);
    for (const f of NULLABLE_NUMBER_FIELDS) if (p[f] !== null && !isFiniteNumber(p[f])) return fail(`${at}.${f}`);
    if (p.lastPriceTime !== null && !isDateString(p.lastPriceTime)) return fail(`${at}.lastPriceTime`);
  }
  return { ok: true, data: obj as unknown as PositionsResponse };
}

function errorMessage(e: unknown): string {
  return e instanceof Error && e.message ? e.message : String(e);
}

export function createBotBackClient(baseUrl: string, timeoutMs = 3000): BotBackClient {
  return {
    async getPositions(date: string): Promise<BotBackResult> {
      try {
        const url = new URL('/view/positions', baseUrl);
        url.searchParams.set('date', date);

        let response: Response;
        let text: string;
        try {
          response = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
          text = await response.text();
        } catch (e) {
          return { ok: false, kind: 'unreachable', message: errorMessage(e) };
        }

        let body: unknown;
        try {
          body = JSON.parse(text);
        } catch {
          body = undefined;
        }
        const obj = typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : undefined;

        if (response.status !== 200) {
          const message = typeof obj?.error === 'string' ? obj.error : `HTTP ${response.status}`;
          return { ok: false, kind: 'error', message };
        }
        const checked = validatePositionsResponse(body);
        if (!checked.ok) {
          console.warn(`[bot-front] Unexpected bot data: ${checked.path}`);
          return { ok: false, kind: 'error', message: 'Unexpected response from bot' };
        }
        return { ok: true, data: checked.data };
      } catch (e) {
        return { ok: false, kind: 'error', message: errorMessage(e) };
      }
    },
  };
}
