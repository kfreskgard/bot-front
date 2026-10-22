import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildWeb } from './build-web';

const ROOT = resolve(fileURLToPath(import.meta.url), '..', '..');

async function main(): Promise<void> {
  const stopBuild = await buildWeb({ outdir: resolve(ROOT, 'dist/web'), watch: true });

  const tsxCli = createRequire(import.meta.url).resolve('tsx/cli');
  const child = spawn(process.execPath, [tsxCli, 'watch', 'src/server.ts'], {
    cwd: ROOT,
    stdio: 'inherit',
    env: process.env,
  });

  for (const sig of ['SIGINT', 'SIGTERM'] as const) {
    process.on(sig, () => child.kill(sig));
  }
  child.on('exit', async (code, signal) => {
    await stopBuild();
    process.exit(code ?? (signal ? 1 : 0));
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
