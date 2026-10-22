import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { PositionStatus, PositionView } from '../shared/types';

export type FakeMode = 'good' | 'empty' | 'malformed' | 'error';

const MODES: readonly FakeMode[] = ['good', 'empty', 'malformed', 'error'];

const round2 = (n: number) => Math.round(n * 100) / 100;

interface Spec {
  id: string;
  stockName: string;
  status: PositionStatus;
  time: string; // UTC time of day, created on the requested date
  bought: number;
  sold: number;
  avgBuyPrice: number | null;
  avgSellPrice: number | null;
  lastPrice: number | null;
}

function build(spec: Spec, date: string, now: Date): PositionView {
  const { bought, sold, avgBuyPrice, avgSellPrice, lastPrice } = spec;
  const boughtValue = bought * (avgBuyPrice ?? 0);
  const soldValue = sold * (avgSellPrice ?? 0);
  const held = bought - sold;
  const hasResult = bought > 0 && (held === 0 || lastPrice !== null);
  const result = hasResult ? round2(soldValue + held * (lastPrice ?? 0) - boughtValue) : null;
  const created = `${date}T${spec.time}Z`;
  return {
    id: spec.id,
    stockId: `fake-${spec.id}`,
    stockName: spec.stockName,
    state: spec.status,
    status: spec.status,
    untracked: false,
    created,
    lastUpdated: spec.status === 'open' ? now.toISOString() : created,
    targetAmount: 50000,
    bought,
    sold,
    orderCount: bought > 0 ? (sold > 0 ? 2 : 1) : 0,
    avgBuyPrice,
    avgSellPrice,
    lastPrice,
    lastPriceTime: lastPrice === null ? null : now.toISOString(),
    result,
    resultPercent: result === null || boughtValue === 0 ? null : round2((result / boughtValue) * 100),
  };
}

export function fakePositions(date: string, now = new Date()): PositionView[] {
  // Moves every 15 s, matching the UI's poll interval.
  const step = Math.floor(now.getTime() / 15000) % 12;
  const volvo = round2(268.4 + (step - 6) * 0.3);
  const specs: Spec[] = [
    { id: '1', stockName: 'Getinge', status: 'closed', time: '07:02:10', bought: 200, sold: 200, avgBuyPrice: 212.5, avgSellPrice: 215.8, lastPrice: null },
    { id: '2', stockName: 'Volvo B', status: 'open', time: '07:15:40', bought: 180, sold: 0, avgBuyPrice: 266.2, avgSellPrice: null, lastPrice: volvo },
    { id: '3', stockName: 'Ericsson B', status: 'closed', time: '07:31:05', bought: 600, sold: 600, avgBuyPrice: 84.3, avgSellPrice: 83.1, lastPrice: null },
    { id: '4', stockName: 'Sandvik', status: 'open', time: '08:05:22', bought: 250, sold: 100, avgBuyPrice: 198.4, avgSellPrice: 201.2, lastPrice: 199.7 },
    { id: '5', stockName: 'SSAB B', status: 'pending', time: '08:20:00', bought: 0, sold: 0, avgBuyPrice: null, avgSellPrice: null, lastPrice: null },
  ];
  return specs.map((s) => build(s, date, now));
}

export async function startFakeBotBack(port: number): Promise<{ url: string; close(): Promise<void> }> {
  let mode: FakeMode = 'good';

  const server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const json = (status: number, body: unknown) => {
      res.writeHead(status, { 'content-type': 'application/json' });
      res.end(JSON.stringify(body));
    };

    const m = /^\/_mode\/([^/]+)$/.exec(url.pathname);
    if (m) {
      const next = MODES.find((x) => x === m[1]);
      if (next) {
        mode = next;
        res.writeHead(200, { 'content-type': 'text/plain' });
        res.end(`mode=${mode}`);
        return;
      }
    } else if (req.method === 'GET' && url.pathname === '/view/positions') {
      const requested = url.searchParams.get('date') ?? '';
      const date = /^\d{4}-\d{2}-\d{2}$/.test(requested) ? requested : new Date().toISOString().slice(0, 10);
      if (mode === 'error') return json(500, { error: 'fake failure' });
      if (mode === 'empty') return json(200, { date, positions: [] });
      const positions: unknown[] = fakePositions(date);
      if (mode === 'malformed') positions[0] = { ...(positions[0] as object), status: 'sold' };
      return json(200, { date, positions });
    }
    res.writeHead(404, { 'content-type': 'text/plain' });
    res.end('not found');
  });

  await new Promise<void>((ok, fail) => {
    server.once('error', fail);
    server.listen(port, '127.0.0.1', ok);
  });
  const { port: bound } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${bound}`,
    close: () =>
      new Promise<void>((ok, fail) => {
        server.close((err) => (err ? fail(err) : ok()));
        server.closeAllConnections();
      }),
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.argv[2] ?? 1234);
  startFakeBotBack(port).then(({ url }) => {
    console.log(`Fake bot-back listening on ${url}`);
    console.log(`Switch mode: ${url}/_mode/<${MODES.join('|')}>  (e.g. curl ${url}/_mode/error)`);
  });
}
