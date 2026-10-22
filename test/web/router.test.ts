import assert from 'node:assert/strict';
import { test } from 'node:test';
import { resolveDate } from '../../web/date.js';
import { groupPages, hrefFor, resolvePage, splitForBottomBar, type PageDef } from '../../web/registry.js';
import { shouldIntercept } from '../../web/router.js';

const P = (id: string, group: 'Trading' | 'System', usesDate = true): PageDef => ({
  id, label: id, group, path: `/${id}`, icon: '·', usesDate, component: () => null as never,
});

test('hrefFor keeps the date only for date pages', () => {
  assert.equal(hrefFor(P('positions', 'Trading'), '2026-10-22'), '/positions?date=2026-10-22');
  assert.equal(hrefFor(P('logs', 'System', false), '2026-10-22'), '/logs');
});

test('resolvePage maps / to the first page and unknown paths to null', () => {
  const pages = [P('a', 'Trading'), P('b', 'System')];
  assert.equal(resolvePage(pages, '/'), pages[0]);
  assert.equal(resolvePage(pages, '/b'), pages[1]);
  assert.equal(resolvePage(pages, '/nope'), null);
  assert.equal(resolvePage([], '/'), null);
});

test('groupPages keeps order and skips empty groups', () => {
  assert.deepEqual(groupPages([P('a', 'Trading')]).map((g) => g.group), ['Trading']);
  const g = groupPages([P('a', 'Trading'), P('b', 'System'), P('c', 'Trading')]);
  assert.deepEqual(g.map((x) => [x.group, x.pages.map((p) => p.id)]), [['Trading', ['a', 'c']], ['System', ['b']]]);
});

test('splitForBottomBar', () => {
  const pages = ['a', 'b', 'c', 'd', 'e'].map((id) => P(id, 'Trading'));
  const four = splitForBottomBar(pages.slice(0, 4));
  assert.equal(four.shown.length, 4);
  assert.equal(four.more.length, 0);
  const five = splitForBottomBar(pages);
  assert.deepEqual(five.shown.map((p) => p.id), ['a', 'b', 'c']);
  assert.deepEqual(five.more.map((p) => p.id), ['d', 'e']);
});

test('resolveDate', () => {
  const now = new Date('2026-10-22T08:00:00Z');
  assert.deepEqual(resolveDate('2026-10-20', now), { date: '2026-10-20', replace: false });
  assert.deepEqual(resolveDate(null, now), { date: '2026-10-22', replace: true });
  assert.deepEqual(resolveDate('2026-02-30', now), { date: '2026-10-22', replace: true });
});

test('shouldIntercept only plain same-origin left clicks without target', () => {
  const plain = { button: 0, ctrlKey: false, metaKey: false, shiftKey: false, altKey: false, defaultPrevented: false };
  const link = { target: '', origin: 'https://b' };
  assert.equal(shouldIntercept(plain, link, 'https://b'), true);
  for (const mod of [{ ctrlKey: true }, { metaKey: true }, { shiftKey: true }, { altKey: true }, { button: 1 }, { defaultPrevented: true }])
    assert.equal(shouldIntercept({ ...plain, ...mod }, link, 'https://b'), false);
  assert.equal(shouldIntercept(plain, { ...link, target: '_blank' }, 'https://b'), false);
  assert.equal(shouldIntercept(plain, { ...link, origin: 'https://x' }, 'https://b'), false);
});
