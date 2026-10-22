import { addDays } from '../../shared/day.js';
import { Link } from '../router.js';
import { hrefFor, type PageDef } from '../registry.js';
import { Logout } from './Logout.js';

export function TopBar({ page, date, today }: { page: PageDef | null; date: string; today: string }) {
  return (
    <header className="topbar">
      <span className="brand">BOT/FRONT</span>
      {page?.usesDate && (
        <span className="compact-date">
          <Link href={hrefFor(page, addDays(date, -1))} aria-label="Previous day">◂</Link>
          {date.slice(5)}
          {date < today ? (
            <Link href={hrefFor(page, addDays(date, 1))} aria-label="Next day">▸</Link>
          ) : (
            <span className="disabled" aria-disabled="true">▸</span>
          )}
        </span>
      )}
      <Logout />
    </header>
  );
}
