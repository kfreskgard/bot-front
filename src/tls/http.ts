import { Hono } from 'hono';

export function createHttpApp(
  challenges: Map<string, string>,
  domain: string,
  httpsPort: number,
): Hono {
  const app = new Hono();
  const origin = `https://${domain}${httpsPort === 443 ? '' : ':' + httpsPort}`;

  app.get('/.well-known/acme-challenge/:token', (c) => {
    const keyAuthorization = challenges.get(c.req.param('token'));
    if (keyAuthorization === undefined) return c.text('Not found', 404);
    return c.text(keyAuthorization, 200);
  });

  app.all('*', (c) => {
    const url = new URL(c.req.url);
    return c.redirect(origin + url.pathname + url.search, 301);
  });

  return app;
}
