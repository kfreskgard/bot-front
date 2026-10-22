import type { PositionsResponse } from '../../../shared/types.js';
import { formatTime } from '../../../shared/format.js';
import type { ApiError } from '../../api.js';
import { ErrorBanner } from '../../ui/ErrorBanner.js';
import { PageErrorBoundary } from '../../ui/PageErrorBoundary.js';
import { Stale } from '../../ui/Stale.js';
import { PositionsContent } from './PositionsContent.js';

export function errorText(e: ApiError): string {
  switch (e.kind) {
    case 'unreachable':
      return e.since ? `Bot unreachable since ${formatTime(e.since)}` : 'Bot unreachable';
    case 'error':
      return `Bot error: ${e.message}`;
    case 'network':
      return "Can't reach bot-front";
    default:
      return e.message;
  }
}

export function PositionsView(p: {
  date: string;
  now: Date;
  data: PositionsResponse | undefined;
  error: ApiError | null;
  dataUpdatedAt: number;
  isPending: boolean;
}) {
  if (p.error && !p.data) return <ErrorBanner>{errorText(p.error)}</ErrorBanner>;
  if (!p.data) {
    return p.isPending ? (
      <div className="skeleton">
        <div className="skeleton-kpis" />
        <div className="skeleton-table" />
      </div>
    ) : (
      <></>
    );
  }
  const content = (
    <PageErrorBoundary resetKey={p.dataUpdatedAt}>
      <PositionsContent data={p.data} now={p.now} />
    </PageErrorBoundary>
  );
  if (!p.error) return content;
  const at = formatTime(new Date(p.dataUpdatedAt).toISOString(), true);
  return (
    <>
      <ErrorBanner>{`${errorText(p.error)} · showing data from ${at}`}</ErrorBanner>
      <Stale>{content}</Stale>
    </>
  );
}
