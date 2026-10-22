import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export interface WebManifest {
  js: string;
  css: string;
}

export interface WebBundle {
  dir: string;
  manifest(): WebManifest;
}

export class WebBundleError extends Error {}

const NOT_BUILT = 'Web bundle not built: run `npm run build:web`';

function readManifest(file: string): { manifest: WebManifest; mtimeMs: number } {
  try {
    const mtimeMs = statSync(file).mtimeMs;
    const raw: unknown = JSON.parse(readFileSync(file, 'utf8'));
    const m = raw as Partial<WebManifest> | null;
    if (
      typeof m?.js !== 'string' || m.js === '' ||
      typeof m.css !== 'string' || m.css === ''
    ) {
      throw new Error('invalid manifest');
    }
    return { manifest: { js: m.js, css: m.css }, mtimeMs };
  } catch (cause) {
    throw new WebBundleError(NOT_BUILT, { cause });
  }
}

export function loadWebBundle(
  dir: string = process.env.WEB_DIST ?? fileURLToPath(new URL('../dist/web', import.meta.url)),
): WebBundle {
  const file = join(dir, 'manifest.json');
  let current = readManifest(file);
  return {
    dir,
    manifest() {
      let mtimeMs: number;
      try {
        mtimeMs = statSync(file).mtimeMs;
      } catch (cause) {
        throw new WebBundleError(NOT_BUILT, { cause });
      }
      if (mtimeMs !== current.mtimeMs) current = readManifest(file);
      return current.manifest;
    },
  };
}
