import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadWebBundle, type WebBundle } from '../../src/manifest';

/** A built-looking bundle in a fresh temp dir. The OS cleans the temp dir; nothing global is registered. */
export function fakeWebBundle(): WebBundle {
  const dir = mkdtempSync(join(tmpdir(), 'bot-front-web-'));
  mkdirSync(join(dir, 'assets'));
  writeFileSync(join(dir, 'manifest.json'), JSON.stringify({ js: 'main-TEST.js', css: 'main-TEST.css' }));
  writeFileSync(join(dir, 'assets', 'main-TEST.js'), 'console.log("test");\n');
  writeFileSync(join(dir, 'assets', 'main-TEST.css'), 'body{margin:0}\n');
  return loadWebBundle(dir);
}
