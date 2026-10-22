export type PositionStatus = 'noOrder' | 'pending' | 'open' | 'closed' | 'notFilled';

export interface PositionView {
  id: string;
  stockId: string;
  stockName: string;
  state: string;
  status: PositionStatus;
  untracked: boolean;
  created: string;
  lastUpdated: string;
  targetAmount: number;
  bought: number;
  sold: number;
  orderCount: number;
  avgBuyPrice: number | null;
  avgSellPrice: number | null;
  lastPrice: number | null;
  lastPriceTime: string | null;
  result: number | null;
  resultPercent: number | null;
}

export interface PositionsResponse {
  date: string;
  positions: PositionView[];
}

export type BotBackResult =
  | { ok: true; data: PositionsResponse }
  | { ok: false; kind: 'unreachable' | 'error'; message: string };

export interface BotBackClient {
  getPositions(date: string): Promise<BotBackResult>;
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
        if (!obj || typeof obj.date !== 'string' || !Array.isArray(obj.positions)) {
          return { ok: false, kind: 'error', message: 'Unexpected response from bot' };
        }
        return { ok: true, data: obj as unknown as PositionsResponse };
      } catch (e) {
        return { ok: false, kind: 'error', message: errorMessage(e) };
      }
    },
  };
}
