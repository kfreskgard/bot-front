import { PositionsView } from './PositionsView.js';
import { usePositions } from './usePositions.js';

export function PositionsPage({ date }: { date: string }) {
  const q = usePositions(date);
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
