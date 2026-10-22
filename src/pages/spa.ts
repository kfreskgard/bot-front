import { html } from 'hono/html';
import type { HtmlEscapedString } from 'hono/utils/html';
import type { WebManifest } from '../manifest';

export function spaPage(m: WebManifest): HtmlEscapedString | Promise<HtmlEscapedString> {
  return html`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>BOT/FRONT</title>
<link rel="stylesheet" href="/assets/${m.css}">
</head>
<body>
<div id="root"></div>
<script type="module" src="/assets/${m.js}"></script>
</body>
</html>`;
}
