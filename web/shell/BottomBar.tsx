import { Link } from '../router.js';
import { hrefFor, splitForBottomBar, type PageDef } from '../registry.js';

export function BottomBar({ pages, page, date }: { pages: PageDef[]; page: PageDef | null; date: string }) {
  const { shown, more } = splitForBottomBar(pages);
  const item = (p: PageDef) => (
    <Link
      key={p.id}
      href={hrefFor(p, date)}
      className={p.id === page?.id ? 'on' : undefined}
      aria-current={p.id === page?.id ? 'page' : undefined}
    >
      <i>{p.icon}</i>
      {p.label}
    </Link>
  );
  return (
    <nav className="bottombar" aria-label="Pages">
      {shown.map(item)}
      {more.length > 0 && (
        <details>
          <summary>More</summary>
          <div className="more">{more.map(item)}</div>
        </details>
      )}
    </nav>
  );
}
