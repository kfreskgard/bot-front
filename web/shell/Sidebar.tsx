import { Link } from '../router.js';
import { groupPages, hrefFor, type PageDef } from '../registry.js';
import { Logout } from './Logout.js';

export function Sidebar({ pages, page, date }: { pages: PageDef[]; page: PageDef | null; date: string }) {
  return (
    <nav className="sidebar" aria-label="Pages">
      <div className="brand">BOT/FRONT</div>
      {groupPages(pages).map((g) => (
        <div key={g.group}>
          <div className="grp">{g.group}</div>
          {g.pages.map((p) => (
            <Link
              key={p.id}
              href={hrefFor(p, date)}
              className={p.id === page?.id ? 's on' : 's'}
              aria-current={p.id === page?.id ? 'page' : undefined}
            >
              {p.label}
            </Link>
          ))}
        </div>
      ))}
      <Logout />
    </nav>
  );
}
