import { Hono, type Context } from 'hono';
import { relative } from 'node:path';
import { fileURLToPath } from 'node:url';
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
import { isValidDate, todayStockholm } from '../shared/day';
import type { ApiErrorBody } from '../shared/types';
import { formatTime } from '../shared/format';
import { DayPage } from './views/DayPage';
import { PositionsPanel, type PositionsPanelProps } from './views/PositionsPanel';
import { LoginPage } from './views/LoginPage';

export interface AppDeps {
  config: Config;
  botBack: BotBackClient;
  limiter: LoginRateLimiter;
  now: () => Date;
  loginDelayMs: number;
  clientIp: (c: Context) => string;
}

const STATIC_ROOT = relative(process.cwd(), fileURLToPath(new URL('../static', import.meta.url))) || '.';
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

  app.use(
    '/static/*',
    serveStatic({
      root: STATIC_ROOT,
      rewriteRequestPath: (path) => path.replace(/^\/static/, ''),
    }),
  );

  app.use('/login', bodyLimit({ maxSize: MAX_BODY_BYTES, onError: (c) => c.text('Payload too large', 413) }));
  app.use('/logout', bodyLimit({ maxSize: MAX_BODY_BYTES, onError: (c) => c.text('Payload too large', 413) }));
  app.use('/login', csrf());
  app.use('/logout', csrf());

  app.get('/login', (c) => c.html(<LoginPage />));

  app.post('/login', async (c) => {
    const ip = deps.clientIp(c);
    if (!limiter.beginAttempt(ip)) {
      return c.html(<LoginPage error="Too many attempts, try again later." />, 429);
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
    return c.html(<LoginPage error="Wrong password" />, 401);
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

  async function buildPanel(date: string): Promise<PositionsPanelProps> {
    const now = deps.now();
    const polling = date === todayStockholm(now);
    const result = await deps.botBack.getPositions(date);
    const since = trackFailure(result.ok, now);
    if (result.ok) {
      const panel: PositionsPanelProps = { kind: 'data', date, polling, data: result.data, now };
      try {
        // JSX renders lazily; render now so malformed data surfaces here, not as a 500 later.
        String(<PositionsPanel {...panel} />);
      } catch (err) {
        console.error('[bot-front] Could not render bot-back data:', err);
        return { kind: 'error', date, polling, message: 'Bot error: unexpected data' };
      }
      return panel;
    }
    const message =
      result.kind === 'unreachable'
        ? `Bot unreachable since ${formatTime((since ?? now).toISOString())}`
        : `Bot error: ${result.message}`;
    return { kind: 'error', date, polling, message };
  }

  app.get('/', login, async (c) => {
    const today = todayStockholm(deps.now());
    const requested = c.req.query('date');
    if (requested !== undefined && !isValidDate(requested)) return c.redirect('/', 302);
    const date = requested ?? today;
    return c.html(<DayPage date={date} today={today} panel={await buildPanel(date)} />);
  });

  app.get('/partials/positions', login, async (c) => {
    const date = c.req.query('date');
    if (date === undefined || !isValidDate(date)) {
      return c.html(<PositionsPanel kind="error" date="" polling={false} message="Invalid date" />);
    }
    return c.html(<PositionsPanel {...await buildPanel(date)} />);
  });

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

  return app;
}
