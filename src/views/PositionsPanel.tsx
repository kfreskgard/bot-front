import type { PositionStatus, PositionView, PositionsResponse } from '../botback';
import { summarize, summaryText } from '../summary';
import { formatKr, formatPercent, formatPrice, formatTime, isPriceOld } from './format';

export type PositionsPanelProps =
  | { kind: 'data'; date: string; polling: boolean; data: PositionsResponse; now: Date }
  | { kind: 'error'; date: string; polling: boolean; message: string };

const STATUS_LABEL: Record<PositionStatus, string> = {
  open: 'Open',
  closed: 'Closed',
  pending: 'Pending',
  notFilled: 'Not filled',
  noOrder: 'No order',
};

function pollAttrs(date: string, polling: boolean): Record<string, string> {
  return polling
    ? {
        'hx-get': `/partials/positions?date=${date}`,
        'hx-trigger': 'every 15s',
        'hx-swap': 'outerHTML',
      }
    : {};
}

function SellCell(props: { p: PositionView; now: Date }) {
  const { p, now } = props;
  if (p.status === 'open' && p.lastPrice !== null && p.lastPriceTime !== null) {
    const old = isPriceOld(p.lastPriceTime, now);
    return (
      <td class={old ? 'old-price' : undefined} data-label="Sell / last">
        {`${formatPrice(p.lastPrice)} · ${formatTime(p.lastPriceTime)}`}
      </td>
    );
  }
  if ((p.status === 'closed' || p.sold > 0) && p.avgSellPrice !== null) {
    return <td data-label="Sell / last">{formatPrice(p.avgSellPrice)}</td>;
  }
  return <td data-label="Sell / last">–</td>;
}

function ResultCell(props: { p: PositionView }) {
  const { p } = props;
  if (p.result !== null) {
    const cls = p.result > 0 ? 'positive' : p.result < 0 ? 'negative' : undefined;
    const pct = p.resultPercent !== null ? ` ${formatPercent(p.resultPercent)}` : '';
    return (
      <td class={cls} data-label="Result">
        {`${formatKr(p.result)}${pct}`}
      </td>
    );
  }
  if (p.status === 'open') return <td data-label="Result">unpriced</td>;
  return <td data-label="Result">–</td>;
}

function Row(props: { p: PositionView; now: Date }) {
  const { p, now } = props;
  return (
    <tr class={p.untracked ? 'pos untracked' : 'pos'}>
      <td data-label="Stock">{p.stockName}</td>
      <td data-label="Status">
        {STATUS_LABEL[p.status]}
        {p.untracked ? <> <span class="untracked-label">untracked</span></> : null}
      </td>
      <td data-label="Volume">{`${p.bought}/${p.targetAmount}`}</td>
      <td data-label="Avg buy">{p.avgBuyPrice !== null ? formatPrice(p.avgBuyPrice) : '–'}</td>
      <SellCell p={p} now={now} />
      <ResultCell p={p} />
    </tr>
  );
}

export function PositionsPanel(props: PositionsPanelProps) {
  const attrs = pollAttrs(props.date, props.polling);
  if (props.kind === 'error') {
    return (
      <div id="positions-panel" {...attrs}>
        <p class="banner" role="alert">{props.message}</p>
      </div>
    );
  }
  const { data, now } = props;
  const text = summaryText(summarize(data.positions));
  return (
    <div id="positions-panel" {...attrs}>
      <div class="summary">
        <p>{text.taken}</p>
        {text.attempts !== null ? <p>{text.attempts}</p> : null}
        <p class="updated">{`Updated ${formatTime(now.toISOString(), true)}`}</p>
      </div>
      <table class="positions">
        <thead>
          <tr>
            <th>Stock</th>
            <th>Status</th>
            <th>Volume</th>
            <th>Avg buy</th>
            <th>Sell / last</th>
            <th>Result</th>
          </tr>
        </thead>
        <tbody>
          {data.positions.map((p) => (
            <Row p={p} now={now} />
          ))}
        </tbody>
      </table>
    </div>
  );
}
