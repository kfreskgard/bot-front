import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildWeb } from '../scripts/build-web';

const dirs: string[] = [];
after(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
});

test('buildWeb writes hashed js and css and a manifest pointing at them', async () => {
  const out = mkdtempSync(join(tmpdir(), 'web-'));
  dirs.push(out);
  await buildWeb({ outdir: out });
  const m = JSON.parse(readFileSync(join(out, 'manifest.json'), 'utf8'));
  assert.match(m.js, /^main-[A-Z0-9]+\.js$/);
  assert.match(m.css, /^main-[A-Z0-9]+\.css$/);
  assert.ok(existsSync(join(out, 'assets', m.js)));
  assert.ok(existsSync(join(out, 'assets', m.css)));
});
