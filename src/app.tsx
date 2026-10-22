import { Hono, type Context } from 'hono';
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

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export function createApp(deps: AppDeps): Hono {
  const { config, limiter } = deps;
  const app = new Hono();

  app.use(
    '*',
    secureHeaders({
      contentSecurityPolicy: { defaultSrc: ["'self'"] },
      strictTransportSecurity: config.tls ? 'max-age=31536000' : false,
      xFrameOptions: 'DENY',
      referrerPolicy: 'no-referrer',
      xContentTypeOptions: 'nosniff',
    }),
  );

  app.use(
    '/static/*',
    serveStatic({
      root: './static',
      rewriteRequestPath: (path) => path.replace(/^\/static/, ''),
    }),
  );

  app.get('/login', (c) => c.html(<LoginPage />));

  app.post('/login', async (c) => {
    const ip = deps.clientIp(c);
    if (limiter.isLocked(ip)) {
      return c.html(<LoginPage error="Too many attempts, try again later." />, 429);
    }
    const body = await c.req.parseBody();
    const field = body['password'];
    const password = typeof field === 'string' ? field : '';
    if (await verifyPassword(password, config.passwordHash)) {
      limiter.recordSuccess(ip);
      await setSession(c, config.sessionSecret, config.tls, deps.now());
      return c.redirect('/', 302);
    }
    await sleep(deps.loginDelayMs);
    limiter.recordFailure(ip);
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
