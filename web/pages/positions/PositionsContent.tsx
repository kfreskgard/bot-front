import type { PositionsResponse } from '../../../shared/types.js';
import { summarize } from '../../../shared/summary.js';
import { DataTable } from '../../ui/DataTable.js';
import { Kpi, KpiStrip } from '../../ui/Kpi.js';
import { Money } from '../../ui/Money.js';
import { positionColumns } from './columns.js';

function attemptsText(a: { pending: number; notFilled: number; noOrder: number }): string | undefined {
  const parts = [
    a.pending > 0 && `${a.pending} pending`,
    a.notFilled > 0 && `${a.notFilled} not filled`,
    a.noOrder > 0 && `${a.noOrder} no order`,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(' · ') : undefined;
}

const unpriced = (n: number) => (n > 0 ? ` (${n} unpriced)` : null);

export function PositionsContent({ data, now }: { data: PositionsResponse; now: Date }) {
  const s = summarize(data.positions);
  const rows = [...data.positions].sort((a, b) => Date.parse(a.created) - Date.parse(b.created));
  return (
    <>
      <KpiStrip>
        <Kpi label="Total">
          <Money value={s.total.result} />
          {unpriced(s.total.unpriced)}
        </Kpi>
        <Kpi label={`Closed (${s.closed.count})`}>
          <Money value={s.closed.result} />
        </Kpi>
        <Kpi label={`Open (${s.open.count})`}>
          <Money value={s.open.result} />
          {unpriced(s.open.unpriced)}
        </Kpi>
        <Kpi label="Taken" sub={attemptsText(s.attempts)}>
          {s.taken}
        </Kpi>
      </KpiStrip>
      <DataTable
        columns={positionColumns(now)}
        rows={rows}
        rowKey={(p) => p.id}
        rowClass={(p) => (p.untracked ? 'untracked' : undefined)}
        empty={<p className="empty">No positions on this day</p>}
      />
    </>
  );
}
