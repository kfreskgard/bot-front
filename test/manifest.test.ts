import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadWebBundle, WebBundleError } from '../src/manifest';

const dirs: string[] = [];
const tmp = () => {
  const d = mkdtempSync(join(tmpdir(), 'w-'));
  dirs.push(d);
  return d;
};
after(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
});

const MISSING = 'Web bundle not built: run `npm run build:web`';

test('loadWebBundle throws WebBundleError when the manifest is missing', () => {
  assert.throws(
    () => loadWebBundle(tmp()),
    (e) => e instanceof WebBundleError && e.message === MISSING,
  );
});

test('loadWebBundle throws WebBundleError on a malformed manifest', () => {
  const dir = tmp();
  writeFileSync(join(dir, 'manifest.json'), '{"js":1}');
  assert.throws(
    () => loadWebBundle(dir),
    (e) => e instanceof WebBundleError && e.message === MISSING,
  );
});

test('manifest() re-reads the file when its modification time changes', () => {
  const dir = tmp();
  const file = join(dir, 'manifest.json');
  writeFileSync(file, JSON.stringify({ js: 'a.js', css: 'a.css' }));
  const bundle = loadWebBundle(dir);
  assert.equal(bundle.manifest().js, 'a.js');
  writeFileSync(file, JSON.stringify({ js: 'b.js', css: 'b.css' }));
  const later = new Date(Date.now() + 5000);
  utimesSync(file, later, later);
  assert.equal(bundle.manifest().js, 'b.js');
  assert.equal(bundle.manifest().css, 'b.css');
});
