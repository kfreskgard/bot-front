import { raw } from 'hono/html';
import type { Child } from 'hono/jsx';

export function Layout(props: { title: string; children?: Child }) {
  return (
    <>
      {raw('<!doctype html>')}
      <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="htmx-config" content='{"includeIndicatorStyles":false}' />
        <title>{props.title}</title>
        <link rel="stylesheet" href="/static/style.css" />
        <script src="/static/htmx.min.js"></script>
      </head>
      <body>{props.children}</body>
    </html>
    </>
  );
}
