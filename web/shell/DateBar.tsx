import { addDays, isValidDate } from '../../shared/day.js';
import { formatTime } from '../../shared/format.js';
import { Link, navigate } from '../router.js';
import { hrefFor, type PageDef } from '../registry.js';
import { useLiveStatus } from './live.js';

export function DateBar({ page, date, today }: { page: PageDef; date: string; today: string }) {
  const live = useLiveStatus();
  return (
    <div className="datebar">
      <span className="nav">
        <Link href={hrefFor(page, addDays(date, -1))} aria-label="Previous day">◂</Link>
        <input
          type="date"
          value={date}
          max={today}
          onChange={(e) => {
            if (isValidDate(e.target.value)) navigate(hrefFor(page, e.target.value));
          }}
        />
        {date < today ? (
          <Link href={hrefFor(page, addDays(date, 1))} aria-label="Next day">▸</Link>
        ) : (
          <span className="disabled" aria-disabled="true">▸</span>
        )}
      </span>
      <Link href={hrefFor(page, today)}>Today</Link>
      {live?.polling ? (
        <span className="live">
          ● live {live.updatedAt !== null ? formatTime(new Date(live.updatedAt).toISOString(), true) : ''}
        </span>
      ) : (
        <span className="live paused">paused</span>
      )}
    </div>
  );
}
