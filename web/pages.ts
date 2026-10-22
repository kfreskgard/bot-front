import { PositionsPage } from './pages/positions/PositionsPage.js';
import type { PageDef } from './registry.js';

export const PAGES: PageDef[] = [
  { id: 'positions', label: 'Positions', group: 'Trading', path: '/positions', icon: '▤', usesDate: true, component: PositionsPage },
];
