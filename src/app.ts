import { Hono, type Context } from 'hono';
import { join, relative } from 'node:path';
import { bodyLimit } from 'hono/body-limit';
import { csrf } from 'hono/csrf';
import { secureHeaders } from 'hono/secure-headers';
import { serveStatic } from '@hono/node-server/serve-static';
import type { Config } from './config';
import type { BotBackClient } from './botback';
import {
  clearSession,
  LoginRateLimiter,
  requireLogin,
  setSession,
  verifyPassword,
} from './auth';
import { isValidDate } from '../shared/day';
import type { ApiErrorBody } from '../shared/types';
import type { WebBundle } from './manifest';
import { loginPage } from './pages/login';
import { spaPage } from './pages/spa';

export interface AppDeps {
  config: Config;
  botBack: BotBackClient;
  web: WebBundle;
  limiter: LoginRateLimiter;
  now: () => Date;
  loginDelayMs: number;
  clientIp: (c: Context) => string;
}

const ASSET_CACHE = 'public, max-age=31536000, immutable';
const MAX_BODY_BYTES = 4096;

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export function createApp(deps: AppDeps): Hono {
  const { config, limiter } = deps;
  const app = new Hono();

  app.use(
    '*',
    secureHeaders({
      contentSecurityPolicy: {
        defaultSrc: ["'self'"],
        baseUri: ["'none'"],
        formAction: ["'self'"],
        frameAncestors: ["'none'"],
      },
      strictTransportSecurity: config.tls ? 'max-age=31536000' : false,
      xFrameOptions: 'DENY',
      referrerPolicy: 'no-referrer',
      xContentTypeOptions: 'nosniff',
    }),
  );

  // serveStatic wants a root relative to cwd; this also works for absolute paths on Windows.
  const assetsRoot = relative(process.cwd(), join(deps.web.dir, 'assets')) || '.';
  app.use('/assets/*', async (c, next) => {
    await next();
    if (c.res.status === 200 || c.res.status === 206) c.res.headers.set('Cache-Control', ASSET_CACHE);
  });
  app.use(
    '/assets/*',
    serveStatic({
      root: assetsRoot,
      rewriteRequestPath: (path) => path.replace(/^\/assets/, ''),
    }),
  );
  // An unknown asset must never fall through to the SPA page.
  app.all('/assets/*', (c) => c.text('Not found', 404));

  app.use('/login', bodyLimit({ maxSize: MAX_BODY_BYTES, onError: (c) => c.text('Payload too large', 413) }));
  app.use('/logout', bodyLimit({ maxSize: MAX_BODY_BYTES, onError: (c) => c.text('Payload too large', 413) }));
  app.use('/login', csrf());
  app.use('/logout', csrf());

  app.get('/login', (c) => c.html(loginPage(deps.web.manifest().css)));

  app.post('/login', async (c) => {
    const ip = deps.clientIp(c);
    if (!limiter.beginAttempt(ip)) {
      return c.html(loginPage(deps.web.manifest().css, 'Too many attempts, try again later.'), 429);
    }
    let password = '';
    try {
      const field = (await c.req.parseBody())['password'];
      if (typeof field === 'string') password = field;
    } catch {
      // malformed body counts as a wrong password
    }
    if (await verifyPassword(password, config.passwordHash)) {
      limiter.recordSuccess(ip);
      await setSession(c, config.sessionSecret, config.tls, deps.now());
      return c.redirect('/', 302);
    }
    await sleep(deps.loginDelayMs);
    console.warn(`[bot-front] Failed login from ${ip}`);
    return c.html(loginPage(deps.web.manifest().css, 'Wrong password'), 401);
  });

  const login = requireLogin(config.sessionSecret, deps.now);

  app.post('/logout', login, (c) => {
    clearSession(c);
    return c.redirect('/login', 302);
  });

  const apiLogin = requireLogin(config.sessionSecret, deps.now, 'json');

  let failingSince: Date | null = null;

  /** Start of the current run of bot-back failures; null while it is healthy. */
  function trackFailure(ok: boolean, now: Date): Date | null {
    if (ok) {
      failingSince = null;
      return null;
    }
    failingSince ??= now;
    return failingSince;
  }

  app.get('/api/positions', apiLogin, async (c) => {
    const date = c.req.query('date');
    if (date === undefined || !isValidDate(date)) {
      const body: ApiErrorBody = { error: { kind: 'badRequest', message: 'Invalid date' } };
      return c.json(body, 400);
    }
    const now = deps.now();
    const result = await deps.botBack.getPositions(date);
    const since = trackFailure(result.ok, now);
    if (result.ok) return c.json(result.data);
    const body: ApiErrorBody = {
      error: { kind: result.kind, message: result.message, since: (since ?? now).toISOString() },
    };
    return c.json(body, 502);
  });

  app.all('/api/*', (c) => {
    const body: ApiErrorBody = { error: { kind: 'badRequest', message: 'Not found' } };
    return c.json(body, 404);
  });

  app.get('*', login, (c) => c.html(spaPage(deps.web.manifest())));

  return app;
}
