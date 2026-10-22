import assert from 'node:assert/strict';
import { test } from 'node:test';
import { renderToStaticMarkup as render } from 'react-dom/server';
import { DataTable, type Column } from '../../web/ui/DataTable.js';

interface Row { id: string; name: string; qty: number }
const rows: Row[] = [
  { id: 'a', name: 'Getinge', qty: 40 },
  { id: 'b', name: 'Volvo B', qty: 60 },
];
const base: Column<Row>[] = [
  { key: 'name', header: 'Name', cell: (r) => r.name },
  { key: 'qty', header: 'Qty', cell: (r) => r.qty },
];

test('renders headers and a data-label on every cell', () => {
  const h = render(<DataTable columns={base} rows={rows} rowKey={(r) => r.id} />);
  assert.equal(h.match(/<th[ >]/g)?.length, 2);
  assert.equal(h.match(/data-label=/g)?.length, 4);
  assert.match(h, /<table class="data-table">/);
});

test('mobileLabel overrides the header for data-label', () => {
  const cols: Column<Row>[] = [{ ...base[0]!, mobileLabel: 'Instrument' }, base[1]!];
  const h = render(<DataTable columns={cols} rows={rows} rowKey={(r) => r.id} />);
  assert.match(h, /data-label="Instrument"/);
  assert.match(h, /data-label="Qty"/);
  assert.doesNotMatch(h, /data-label="Name"/);
});

test('applies num, phone-hidden, cell-title, cell-aside, rowClass and className', () => {
  const cols: Column<Row>[] = [
    { key: 'name', header: 'Name', cell: (r) => r.name, role: 'title' },
    { key: 'qty', header: 'Qty', cell: (r) => r.qty, align: 'right', role: 'aside', className: (r) => (r.qty > 50 ? 'big' : undefined) },
    { key: 'x', header: 'X', cell: () => 'x', hideOnPhone: true },
  ];
  const h = render(
    <DataTable columns={cols} rows={rows} rowKey={(r) => r.id} rowClass={(r) => (r.id === 'a' ? 'first' : undefined)} />,
  );
  assert.match(h, /<tr class="first">/);
  assert.match(h, /<td data-label="Name" class="cell-title">Getinge/);
  assert.match(h, /class="num cell-aside"[^>]*>40</);
  assert.match(h, /class="num cell-aside big"[^>]*>60</);
  assert.match(h, /class="phone-hidden"[^>]*>x</);
});

test('renders the empty node and no table when there are no rows', () => {
  const h = render(<DataTable columns={base} rows={[]} rowKey={(r) => r.id} empty={<p>None</p>} />);
  assert.match(h, /<p>None<\/p>/);
  assert.doesNotMatch(h, /<table/);
});
