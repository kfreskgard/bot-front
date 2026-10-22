// A page's CSS is imported from web/main.tsx (CSS is not imported from the page module, tests cannot load it).
import { PositionsPage } from './pages/positions/PositionsPage.js';
import type { PageDef } from './registry.js';

export const PAGES: PageDef[] = [
  { id: 'positions', label: 'Positions', group: 'Trading', path: '/positions', icon: '▤', usesDate: true, component: PositionsPage },
];
