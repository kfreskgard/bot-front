import * as esbuild from 'esbuild';
import { mkdirSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const ENTRY = 'web/main.tsx';

export interface BuildWebOptions {
  outdir: string;
  watch?: boolean;
}

function writeManifest(outdir: string, metafile: esbuild.Metafile): void {
  let js: string | undefined;
  let css: string | undefined;
  for (const [file, output] of Object.entries(metafile.outputs)) {
    if (output.entryPoint !== ENTRY) continue;
    js = basename(file);
    if (output.cssBundle) css = basename(output.cssBundle);
  }
  if (!js || !css) throw new Error(`esbuild produced no js/css output for ${ENTRY}`);
  writeFileSync(join(outdir, 'manifest.json'), JSON.stringify({ js, css }));
}

export async function buildWeb({ outdir, watch = false }: BuildWebOptions): Promise<() => Promise<void>> {
  outdir = resolve(outdir);
  mkdirSync(outdir, { recursive: true });
  const options = {
    absWorkingDir: ROOT,
    entryPoints: [ENTRY],
    bundle: true,
    minify: true,
    sourcemap: 'linked',
    format: 'esm',
    target: 'es2022',
    jsx: 'automatic',
    jsxImportSource: 'react',
    loader: { '.woff2': 'file', '.woff': 'file' },
    outdir: join(outdir, 'assets'),
    entryNames: '[name]-[hash]',
    assetNames: '[name]-[hash]',
    metafile: true,
    define: { 'process.env.NODE_ENV': '"production"' },
    logLevel: 'warning',
  } satisfies esbuild.BuildOptions;

  if (!watch) {
    const result = await esbuild.build(options);
    writeManifest(outdir, result.metafile);
    return async () => {};
  }

  const ctx = await esbuild.context({
    ...options,
    plugins: [
      {
        name: 'write-manifest',
        setup(build) {
          build.onEnd((result) => {
            if (result.errors.length === 0 && result.metafile) writeManifest(outdir, result.metafile);
          });
        },
      },
    ],
  });
  await ctx.watch();
  return () => ctx.dispose();
}

function parseArgs(argv: string[]): BuildWebOptions {
  const watch = argv.includes('--watch');
  const i = argv.indexOf('--outdir');
  const outdir = i >= 0 && argv[i + 1] ? argv[i + 1] : join(ROOT, 'dist', 'web');
  return { outdir, watch };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  buildWeb(parseArgs(process.argv.slice(2))).catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
