import type { PositionView } from '../../../shared/types.js';
import { formatPrice, formatTime, isPriceOld } from '../../../shared/format.js';
import type { Column } from '../../ui/DataTable.js';
import { Money, Percent } from '../../ui/Money.js';
import { StatusBadge } from '../../ui/StatusBadge.js';

const DASH = '–';

function hasLivePrice(p: PositionView): p is PositionView & { lastPrice: number; lastPriceTime: string } {
  return p.status === 'open' && p.lastPrice !== null && p.lastPriceTime !== null;
}

function sellCell(p: PositionView) {
  if (hasLivePrice(p)) return `${formatPrice(p.lastPrice)} · ${formatTime(p.lastPriceTime)}`;
  if ((p.status === 'closed' || p.sold > 0) && p.avgSellPrice !== null) return formatPrice(p.avgSellPrice);
  return DASH;
}

function resultCell(p: PositionView) {
  if (p.result === null) return p.status === 'open' ? 'unpriced' : DASH;
  return (
    <>
      <Money value={p.result} />
      {p.resultPercent !== null && (
        <>
          {' '}
          <Percent value={p.resultPercent} />
        </>
      )}
    </>
  );
}

export function positionColumns(now: Date): Column<PositionView>[] {
  return [
    { key: 'stock', header: 'Stock', role: 'title', cell: (p) => p.stockName },
    { key: 'status', header: 'Status', cell: (p) => <StatusBadge status={p.status} untracked={p.untracked} /> },
    { key: 'volume', header: 'Volume', align: 'right', cell: (p) => `${p.bought}/${p.targetAmount}` },
    {
      key: 'avgBuy',
      header: 'Avg buy',
      align: 'right',
      cell: (p) => (p.avgBuyPrice !== null ? formatPrice(p.avgBuyPrice) : DASH),
    },
    {
      key: 'sell',
      header: 'Sell / last',
      align: 'right',
      cell: sellCell,
      className: (p) => (hasLivePrice(p) && isPriceOld(p.lastPriceTime, now) ? 'old-price' : undefined),
    },
    { key: 'result', header: 'Result', align: 'right', role: 'aside', cell: resultCell },
  ];
}
