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
import { Layout } from './views/Layout';
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
    console.warn(`Failed login from ${ip}`);
    return c.html(<LoginPage error="Wrong password" />, 401);
  });

  const login = requireLogin(config.sessionSecret, deps.now);

  app.post('/logout', login, (c) => {
    clearSession(c);
    return c.redirect('/login', 302);
  });

  // Placeholder until the day page replaces it.
  app.get('/', login, (c) =>
    c.html(
      <Layout title="bot-front">
        <main>
          <h1>bot-front</h1>
        </main>
      </Layout>,
    ),
  );

  return app;
}
