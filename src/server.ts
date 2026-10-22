import https from 'node:https';
import { serve } from '@hono/node-server';
import { getConnInfo } from '@hono/node-server/conninfo';
import { createApp } from './app';
import { LoginRateLimiter } from './auth';
import { createBotBackClient } from './botback';
import { loadWebBundle, WebBundleError, type WebBundle } from './manifest';
import { ConfigError, loadConfig, type Config } from './config';
import {
  CertificateManager,
  expiryWarning,
  retryDelay,
  shouldRenew,
  type Certificate,
} from './tls/acme';
import { createHttpApp } from './tls/http';

const TAG = '[bot-front]';
const RENEW_CHECK_MS = 12 * 3_600_000;
const WARNING_CHECK_MS = 24 * 3_600_000;
const LOGIN_DELAY_MS = 1000;

const log = (msg: string) => console.log(`${TAG} ${msg}`);
const warn = (msg: string) => console.warn(`${TAG} ${msg}`);
const error = (msg: string) => console.error(`${TAG} ${msg}`);
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
const fatalOnError = (server: { on(ev: 'error', cb: (e: NodeJS.ErrnoException) => void): unknown }, port: number) => {
  server.on('error', (e) => {
    error(`cannot listen on port ${port}: ${e.code ?? ''} ${e.message}`);
    process.exit(1);
  });
};
const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

let config: Config;
try {
  config = loadConfig();
} catch (e) {
  if (e instanceof ConfigError) {
    console.error(e.message);
    process.exit(1);
  }
  throw e;
}

let web: WebBundle;
try {
  web = loadWebBundle();
} catch (e) {
  if (e instanceof WebBundleError) {
    console.error(e.message);
    process.exit(1);
  }
  throw e;
}

const app = createApp({
  config,
  web,
  botBack: createBotBackClient(config.botBackUrl),
  limiter: new LoginRateLimiter(),
  now: () => new Date(),
  loginDelayMs: LOGIN_DELAY_MS,
  clientIp: (c) => {
    try {
      return getConnInfo(c).remote.address ?? 'unknown';
    } catch {
      return 'unknown';
    }
  },
});

if (!config.tls) {
  const plain = serve({ fetch: app.fetch, port: config.httpPort }, () => {
    log(`listening on http://0.0.0.0:${config.httpPort} (tls disabled)`);
  });
  fatalOnError(plain, config.httpPort);
} else {
  startWithTls(config).catch((e) => {
    console.error(`${TAG} fatal:`, e);
    process.exit(1);
  });
}

async function startWithTls(cfg: Config): Promise<void> {
  const challenges = new Map<string, string>();
  const manager = new CertificateManager({
    domain: cfg.domain,
    email: cfg.acmeEmail,
    staging: cfg.acmeStaging,
    certDir: process.env.CERT_DIR ?? '/config/certs',
    challenges,
  });

  const httpServer = serve({ fetch: createHttpApp(challenges, cfg.domain, cfg.httpsPort).fetch, port: cfg.httpPort }, () => {
    log(`port ${cfg.httpPort}: ACME challenges and https redirect`);
  });
  fatalOnError(httpServer, cfg.httpPort);
  log(`domain ${cfg.domain}, Let's Encrypt ${cfg.acmeStaging ? 'STAGING' : 'production'}`);

  // One obtain() at a time, shared by the startup loop and the renewal timer.
  let inFlight: Promise<Certificate> | null = null;
  const obtainOnce = (): Promise<Certificate> => {
    if (!inFlight) {
      inFlight = manager.obtain().finally(() => {
        inFlight = null;
      });
    }
    return inFlight;
  };

  let loaded = await manager.load(new Date());
  for (let attempt = 0; loaded === null; attempt++) {
    try {
      log('requesting a certificate');
      loaded = await obtainOnce();
    } catch (e) {
      const delay = retryDelay(attempt);
      error(`certificate request failed: ${message(e)}; retrying in ${Math.round(delay / 1000)} s`);
      await sleep(delay);
    }
  }
  const holder: { current: Certificate } = { current: loaded };
  log(`certificate valid until ${loaded.notAfter.toISOString()}`);

  const server = serve(
    {
      fetch: app.fetch,
      port: cfg.httpsPort,
      createServer: https.createServer,
      serverOptions: { key: loaded.key, cert: loaded.cert },
    },
    () => log(`listening on https port ${cfg.httpsPort}`),
  ) as unknown as https.Server;

  fatalOnError(server, cfg.httpsPort);

  const checkRenewal = async () => {
    try {
      const { notBefore, notAfter } = holder.current;
      if (!shouldRenew(notBefore, notAfter, new Date())) return;
      log('renewing certificate');
      const fresh = await obtainOnce();
      server.setSecureContext({ key: fresh.key, cert: fresh.cert });
      holder.current = fresh;
      log(`certificate renewed, valid until ${fresh.notAfter.toISOString()}`);
    } catch (e) {
      warn(`certificate renewal failed, keeping the current one: ${message(e)}`);
    }
  };
  void checkRenewal();
  setInterval(() => void checkRenewal(), RENEW_CHECK_MS);

  const checkExpiry = () => {
    const w = expiryWarning(holder.current.notAfter, new Date());
    if (w !== null) error(w);
  };
  checkExpiry();
  setInterval(checkExpiry, WARNING_CHECK_MS);
}
