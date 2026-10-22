import assert from 'node:assert/strict';
import { test } from 'node:test';
import { renderToStaticMarkup as render } from 'react-dom/server';
import { Money, Percent, Price, Time } from '../../web/ui/Money.js';
import { SimValue } from '../../web/ui/SimValue.js';
import { StatusBadge } from '../../web/ui/StatusBadge.js';
import { Kpi, KpiStrip } from '../../web/ui/Kpi.js';
import { ErrorBanner } from '../../web/ui/ErrorBanner.js';
import { Stale } from '../../web/ui/Stale.js';
import { PageErrorBoundary } from '../../web/ui/PageErrorBoundary.js';

test('Money marks sign', () => {
  assert.match(render(<Money value={1234} />), /class="money pos"[^>]*>\+1\s234\skr</);
  assert.match(render(<Money value={-50} />), /class="money neg"[^>]*>−50\skr</);
  assert.match(render(<Money value={0} />), /class="money">0\skr</);
});

test('Percent, Price and Time render formatted values', () => {
  assert.match(render(<Percent value={1.5} />), /class="money pos"[^>]*>\+1,50\s%</);
  assert.match(render(<Price value={12.3} />), />12,30</);
  assert.match(render(<Time iso="2026-01-15T10:30:45Z" seconds />), /<time[^>]*>11:30:45</);
});

test('SimValue always shows ≈ and SIM', () => {
  const h = render(<SimValue value={540} />);
  assert.match(h, /class="sim"/);
  assert.match(h, /≈\s\+540\skr/);
  assert.match(h, />SIM</);
});

test('StatusBadge labels and untracked', () => {
  assert.match(render(<StatusBadge status="notFilled" />), /badge--notFilled[^>]*>NOT FILLED</);
  assert.match(render(<StatusBadge status="noOrder" />), />NO ORDER</);
  assert.match(
    render(<StatusBadge status="open" untracked />),
    /<span class="untracked-label">untracked<\/span>/,
  );
});

test('Kpi sim variant', () => {
  const h = render(<Kpi label="Est." variant="sim">x</Kpi>);
  assert.match(h, /class="kpi kpi--sim"/);
  assert.match(h, />SIM</);
  assert.match(render(<Kpi label="Total">x</Kpi>), /class="kpi"/);
  assert.match(render(<KpiStrip>y</KpiStrip>), /class="kpis"/);
});

test('ErrorBanner is an alert; Stale dims', () => {
  assert.match(render(<ErrorBanner>boom</ErrorBanner>), /class="banner" role="alert">boom</);
  assert.match(render(<Stale>x</Stale>), /<div class="stale">x<\/div>/);
});

test('PageErrorBoundary resets only when resetKey changes', () => {
  const err = new Error('x');
  assert.deepEqual(
    PageErrorBoundary.getDerivedStateFromProps({ resetKey: 2, children: null }, { error: err, resetKey: 1 }),
    { error: null, resetKey: 2 },
  );
  assert.equal(
    PageErrorBoundary.getDerivedStateFromProps({ resetKey: 1, children: null }, { error: err, resetKey: 1 }),
    null,
  );
  assert.deepEqual(PageErrorBoundary.getDerivedStateFromError(err), { error: err });
});
