import { html } from 'hono/html';
import type { HtmlEscapedString } from 'hono/utils/html';

export function loginPage(
  cssFile: string,
  error?: string,
): HtmlEscapedString | Promise<HtmlEscapedString> {
  const errorBlock = error ? html`<p class="error" role="alert">${error}</p>` : '';
  return html`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Log in</title>
<link rel="stylesheet" href="/assets/${cssFile}">
</head>
<body>
<main class="login">
<h1>BOT/FRONT</h1>
<form method="post" action="/login">
<label for="password">Password</label>
<input id="password" name="password" type="password" autocomplete="current-password" autofocus required>
${errorBlock}
<button type="submit">Log in</button>
</form>
</main>
</body>
</html>`;
}
