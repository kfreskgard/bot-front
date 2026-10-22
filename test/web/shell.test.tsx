import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { JSX } from 'react';
import { renderToStaticMarkup as render } from 'react-dom/server';
import { NotFound } from '../../web/NotFound.js';
import { PAGES } from '../../web/pages.js';
import type { PageDef } from '../../web/registry.js';
import { BottomBar } from '../../web/shell/BottomBar.js';
import { DateBar } from '../../web/shell/DateBar.js';
import { commitDate } from '../../web/shell/DateInput.js';
import { TopBar } from '../../web/shell/TopBar.js';
import { LiveProvider, type LiveStatus } from '../../web/shell/live.js';
import { Shell } from '../../web/shell/Shell.js';

const today = '2026-10-22';
const page = PAGES[0];
const wrap = (el: JSX.Element, live: LiveStatus | null = null) =>
  render(<LiveProvider initial={live}>{el}</LiveProvider>);

const fake = (n: number): PageDef[] =>
  Array.from({ length: n }, (_, i) => ({
    id: `p${i}`,
    label: `Page${i}`,
    group: 'Trading' as const,
    path: `/p${i}`,
    icon: 'x',
    usesDate: false,
    component: () => <p />,
  }));

test('sidebar lists only groups that have pages and marks the active one', () => {
  const h = wrap(<Shell pages={PAGES} page={page} date={today} today={today}><p /></Shell>);
  assert.match(h, />Trading</);
  assert.doesNotMatch(h, />System</);
  assert.match(
    h,
    /aria-current="page"[^>]*href="\/positions\?date=2026-10-22"|href="\/positions\?date=2026-10-22"[^>]*aria-current="page"/,
  );
  // React serialises form attributes as action before method, so match each separately.
  assert.match(h, /<form[^>]*action="\/logout"/);
  assert.match(h, /<form[^>]*method="post"/);
  assert.match(h, /BOT\/FRONT/);
});

test('date bar on today disables next and shows live time', () => {
  const h = wrap(<DateBar page={page} date={today} today={today} />, {
    polling: true,
    failing: false,
    updatedAt: Date.parse('2026-10-22T08:41:57Z'),
  });
  assert.match(h, /href="\/positions\?date=2026-10-21"/);
  assert.match(h, /aria-disabled="true"/);
  assert.doesNotMatch(h, /date=2026-10-23/);
  assert.match(h, /max="2026-10-22"/);
  assert.match(h, /live 10:41:57/);
});

test('date bar on a past day links forward and says paused', () => {
  const h = wrap(<DateBar page={page} date="2026-10-20" today={today} />, { polling: false, failing: false, updatedAt: null });
  assert.match(h, /href="\/positions\?date=2026-10-21"/);
  assert.match(h, /paused/);
});

test('bottom bar puts pages beyond 4 under More', () => {
  const h = render(<BottomBar pages={fake(5)} page={null} date={today} />);
  assert.equal((h.match(/<a /g) ?? []).length, 5);
  const [bar, more] = h.split('<details');
  assert.equal((bar.match(/<a /g) ?? []).length, 3);
  assert.equal((more.match(/<a /g) ?? []).length, 2);
  assert.match(more, /<summary>More<\/summary>/);
});

test('bottom bar has no More for 4 pages or fewer', () => {
  assert.doesNotMatch(render(<BottomBar pages={fake(4)} page={null} date={today} />), /<details/);
});

test('unknown page renders NotFound inside the shell without a date bar', () => {
  const h = wrap(<Shell pages={PAGES} page={null} date={today} today={today}><NotFound /></Shell>);
  assert.match(h, /Page not found/);
  assert.doesNotMatch(h, /type="date"/);
});

test('date bar live states: failing, no data yet, no status', () => {
  const failing = wrap(<DateBar page={page} date={today} today={today} />, {
    polling: true, failing: true, updatedAt: Date.parse('2026-10-22T08:41:57Z'),
  });
  assert.match(failing, /reconnecting/);
  assert.doesNotMatch(failing, /live 10:41:57/);
  const first = wrap(<DateBar page={page} date={today} today={today} />, {
    polling: true, failing: false, updatedAt: null,
  });
  assert.match(first, /class="live pending"[^>]*>● live</);
  assert.doesNotMatch(first, /\d\d:\d\d:\d\d/);
  const none = wrap(<DateBar page={page} date={today} today={today} />, null);
  assert.doesNotMatch(none, /class="live/);
  assert.doesNotMatch(none, /paused/);
});

test('top bar on today: prev link, date input, disabled next, logout', () => {
  const h = render(<TopBar page={page} date={today} today={today} />);
  assert.match(h, /href="\/positions\?date=2026-10-21"/);
  assert.match(h, /type="date"/);
  assert.match(h, /max="2026-10-22"/);
  assert.match(h, /value="2026-10-22"/);
  assert.match(h, /aria-disabled="true"/);
  assert.doesNotMatch(h, /date=2026-10-23/);
  assert.match(h, /<form[^>]*action="\/logout"/);
});

test('top bar on a past day links to the next day', () => {
  const h = render(<TopBar page={page} date="2026-10-20" today={today} />);
  assert.match(h, /href="\/positions\?date=2026-10-21"/);
  assert.match(h, /value="2026-10-20"/);
  assert.doesNotMatch(h, /aria-disabled/);
});

test('commitDate accepts only a different valid date not after today', () => {
  assert.equal(commitDate('2026-10-20', today, today), '2026-10-20');
  assert.equal(commitDate(today, today, today), null);
  assert.equal(commitDate('2026-10-23', today, today), null);
  assert.equal(commitDate('', today, today), null);
  assert.equal(commitDate('2026-13-01', today, today), null);
});
