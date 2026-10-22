import type { PositionStatus } from '../../shared/types.js';

const LABELS: Record<PositionStatus, string> = {
  open: 'OPEN',
  closed: 'CLOSED',
  pending: 'PENDING',
  notFilled: 'NOT FILLED',
  noOrder: 'NO ORDER',
};

export function StatusBadge({ status, untracked }: { status: PositionStatus; untracked?: boolean }) {
  return (
    <>
      <span className={`badge badge--${status}`}>{LABELS[status]}</span>
      {untracked && <span className="untracked-label">untracked</span>}
    </>
  );
}
