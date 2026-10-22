import type { JSX } from 'react';

export interface PageDef {
  id: string;
  label: string;
  group: 'Trading' | 'System';
  path: string;
  icon: string;
  usesDate: boolean;
  component: (p: { date: string }) => JSX.Element;
}

export function hrefFor(page: PageDef, date: string): string {
  return page.usesDate ? `${page.path}?date=${date}` : page.path;
}

export function resolvePage(pages: PageDef[], path: string): PageDef | null {
  if (path === '/') return pages[0] ?? null;
  return pages.find((p) => p.path === path) ?? null;
}

export function groupPages(pages: PageDef[]): { group: PageDef['group']; pages: PageDef[] }[] {
  const out: { group: PageDef['group']; pages: PageDef[] }[] = [];
  for (const page of pages) {
    const existing = out.find((g) => g.group === page.group);
    if (existing) existing.pages.push(page);
    else out.push({ group: page.group, pages: [page] });
  }
  return out;
}

export function splitForBottomBar(pages: PageDef[]): { shown: PageDef[]; more: PageDef[] } {
  if (pages.length <= 4) return { shown: pages, more: [] };
  return { shown: pages.slice(0, 3), more: pages.slice(3) };
}
