import { pollInterval } from '../../query.js';
import { useReportLive } from '../../shell/live.js';
import { PositionsView } from './PositionsView.js';
import { usePositions } from './usePositions.js';

export function PositionsPage({ date }: { date: string }) {
  const q = usePositions(date);
  useReportLive({
    polling: pollInterval(date, new Date()) !== false,
    failing: !!q.error,
    updatedAt: q.dataUpdatedAt || null,
  });
  return (
    <PositionsView
      date={date}
      now={new Date()}
      data={q.data}
      error={q.error}
      dataUpdatedAt={q.dataUpdatedAt}
      isPending={q.isPending}
    />
  );
}
