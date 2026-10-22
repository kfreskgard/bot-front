import { addDays } from '../../shared/day.js';
import { formatTime } from '../../shared/format.js';
import { Link } from '../router.js';
import { hrefFor, type PageDef } from '../registry.js';
import { DateInput } from './DateInput.js';
import { useLiveStatus } from './live.js';

export function DateBar({ page, date, today }: { page: PageDef; date: string; today: string }) {
  const live = useLiveStatus();
  return (
    <div className="datebar">
      <span className="nav">
        <Link href={hrefFor(page, addDays(date, -1))} aria-label="Previous day">◂</Link>
        <DateInput page={page} date={date} today={today} />
        {date < today ? (
          <Link href={hrefFor(page, addDays(date, 1))} aria-label="Next day">▸</Link>
        ) : (
          <span className="disabled" aria-disabled="true">▸</span>
        )}
      </span>
      <Link href={hrefFor(page, today)}>Today</Link>
      {live && !live.polling && <span className="live paused">paused</span>}
      {live?.polling && live.failing && <span className="live failing">● reconnecting</span>}
      {live?.polling && !live.failing && live.updatedAt !== null && (
        <span className="live">● live {formatTime(new Date(live.updatedAt).toISOString(), true)}</span>
      )}
      {live?.polling && !live.failing && live.updatedAt === null && <span className="live pending">● live</span>}
    </div>
  );
}
