import type { ReactNode } from 'react';
import type { PageDef } from '../registry.js';
import { BottomBar } from './BottomBar.js';
import { DateBar } from './DateBar.js';
import { Sidebar } from './Sidebar.js';
import { TopBar } from './TopBar.js';

export function Shell(p: {
  pages: PageDef[];
  page: PageDef | null;
  date: string;
  today: string;
  children: ReactNode;
}) {
  return (
    <div className="shell">
      <Sidebar pages={p.pages} page={p.page} date={p.date} />
      <div className="content">
        <TopBar page={p.page} date={p.date} today={p.today} />
        {p.page?.usesDate && <DateBar page={p.page} date={p.date} today={p.today} />}
        <main>{p.children}</main>
        <BottomBar pages={p.pages} page={p.page} date={p.date} />
      </div>
    </div>
  );
}
