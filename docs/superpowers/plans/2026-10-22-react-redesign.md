# React Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace bot-front's Hono-JSX/htmx pages with a React SPA in a dark "trading desk" style, served by the existing Hono server through thin `/api/*` proxy routes, with a shell new pages slot into.

**Architecture:** Hono keeps TLS, login, sessions and security headers, gains `/api/positions` (validated proxy to bot-back), `/assets/*` (hashed bundle) and a logged-in SPA catch-all. The React app in `web/` is bundled by esbuild into `dist/web/`, with a manifest the server reads. Code used by both sides lives in `shared/`.

**Tech Stack:** TypeScript, Node 22, `tsx`, Hono 4, React 19, `@tanstack/react-query` 5, esbuild, `@fontsource/jetbrains-mono`, Node's built-in test runner, `react-dom/server` for component tests.

**Spec:** `docs/superpowers/specs/2026-10-22-react-redesign-design.md`. Read it before starting any task.

## Global Constraints

- No Vite, Rolldown, Tailwind, Lightning CSS or any other tool with a native binary besides esbuild. It must build on 32-bit ARM musl (`node:22-alpine` on the Odroid).
- CSP stays `default-src 'self'`: no inline `<script>`/`<style>`, no `style=` attributes in server HTML, no CSS-in-JS, no CDN.
- Base image `node:22-alpine@sha256:ce8d97f7cfc7c5386421eb932df20a29df99b1a7f469f6157d5c9956702ffadc` in both Dockerfile stages, through one `ARG NODE_IMAGE`.
- Dockerfile uses classic syntax only (Docker 19.03, no BuildKit).
- Dark only. Colour tokens: background `#0d1117`, raised `#010409`/`#161b22`, border `#21262d`, text `#c9d1d9`/`#e6edf3`, muted `#8b949e`, accent `#58a6ff`, pos `#3fb950`, neg `#f85149`, sim `#d29922`.
- Simulated numbers are shown only through `SimValue` (amber, `≈` prefix, `SIM` badge) or `Kpi variant="sim"`.
- Swedish number formatting through `shared/format.ts`. Days are Europe/Stockholm calendar days through `shared/day.ts`.
- Polling: 15 000 ms, only while the date is today in Stockholm, not while the tab is hidden, `retry: false`.
- Every page follows Page (hook + banner + `Stale`) → `PageErrorBoundary` (reset by `dataUpdatedAt`) → Content (pure).
- `/api/*` error body: `{ "error": { "kind": "badRequest" | "unauthorized" | "unreachable" | "error", "message": string, "since"?: ISO string } }`.
- Tests: `tsx --test`, no Jest/Vitest/jsdom/Playwright. Baseline before Task 1: 113 tests pass.
- Commit after each task. Commits go on the current branch.

## Review Focus

1. **A page left open across midnight with no `?date=`** must keep showing the day it showed and stop polling, not jump to an empty new day. Covered by `resolveDate` writing the date into the URL (Task 8) and `pollInterval` (Task 9).
2. **A day with no positions** (weekends, holidays, any past day before the bot ran) must show zero KPIs and "No positions on this day", not an empty table frame. Test in Task 10.
3. **Path traversal or unknown names under `/assets/`** (`/assets/../manifest.json`, `/assets/%2e%2e%2fmanifest.json`, `/assets/nope.js`) must give `404` and never serve files outside `dist/web/assets`. Test in Task 5.
4. **A `200` that is not JSON on `/api/*`** (a proxy page, a captive portal, an HTML fallback) must become an error banner ("Bot error: Unexpected response from bot-front"), not a crash or a blank page. Test in Task 9.
5. **An unknown `/api/...` path** must answer `404` JSON, not the SPA's HTML (which would then hit item 4). Test in Task 5.

---

## File map

| Path | Task | Responsibility |
|---|---|---|
| `shared/types.ts` | 1 | `PositionStatus`, `PositionView`, `PositionsResponse`, `ApiErrorKind`, `ApiErrorBody` |
| `shared/day.ts`, `shared/format.ts`, `shared/summary.ts` | 1 | Moved from `src/`, unchanged except `summaryText` removed in Task 5 |
| `src/botback.ts` | 2 | Adds `validatePositionsResponse` |
| `src/manifest.ts` | 3 | `loadWebBundle`, `WebBundle`, `WebManifest`, `WebBundleError` |
| `scripts/build-web.ts` | 3 | `buildWeb` + CLI |
| `src/auth.ts` | 4 | `requireLogin(..., onFail)` |
| `src/app.ts` (was `app.tsx`) | 4–5 | Routes |
| `src/pages/login.ts`, `src/pages/spa.ts` | 5 | Server HTML as `hono/html` templates |
| `web/tokens.css`, `web/base.css` | 3, 6 | Tokens; base element styles and font |
| `web/ui/*` | 6–7 | Component kit |
| `web/router.tsx`, `web/registry.ts`, `web/date.ts` | 8 | Routing, page registry helpers, date resolution |
| `web/api.ts`, `web/query.ts` | 9 | `fetchJson`, `ApiError`, `pollInterval`, `createQueryClient` |
| `web/pages/positions/*` | 10 | Positions page |
| `web/shell/*`, `web/App.tsx`, `web/pages.ts`, `web/main.tsx` | 11 | Shell, app root, registry list, entry |
| `scripts/dev.ts`, `scripts/fake-botback.ts` | 12 | Development tooling |
| `Dockerfile`, `.dockerignore`, `README.md` | 13 | Deployment |
| `test/helpers/positions.ts`, `test/helpers/web.ts` | 4, 5 | Shared fixtures (not matched by the test glob) |

---

### Task 1: Move shared code to `shared/`

**Files:**
- Move: `src/day.ts` → `shared/day.ts`, `src/views/format.ts` → `shared/format.ts`, `src/summary.ts` → `shared/summary.ts` (use `git mv`)
- Create: `shared/types.ts` (the `PositionStatus`, `PositionView`, `PositionsResponse` declarations cut from `src/botback.ts`)
- Modify: imports in `src/app.tsx`, `src/botback.ts`, `src/views/*.tsx`, `test/*.test.ts`; `tsconfig.json` `include` adds `"shared"`

**Interfaces:**
- Produces: `shared/types.ts` exports `PositionStatus`, `PositionView`, `PositionsResponse` (unchanged shapes), plus:
  ```ts
  export type ApiErrorKind = 'badRequest' | 'unauthorized' | 'unreachable' | 'error';
  export interface ApiErrorBody { error: { kind: ApiErrorKind; message: string; since?: string } }
  ```
- `src/botback.ts` keeps `BotBackResult`, `BotBackClient`, `createBotBackClient` and imports the types from `shared/types.ts`. Do not re-export them from `botback.ts`; update every importer.

- [ ] **Step 1:** Do the moves and import updates.
- [ ] **Step 2:** Run `npm test`. Expected: 113 pass, 0 fail. Run `npm run typecheck`. Expected: no output, exit 0.
- [ ] **Step 3:** Commit: `git commit -m "Move day, format, summary and position types to shared/"`

---

### Task 2: Validate bot-back's response

**Files:**
- Modify: `src/botback.ts`
- Test: `test/botback.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export function validatePositionsResponse(body: unknown):
    | { ok: true; data: PositionsResponse }
    | { ok: false; path: string };   // e.g. 'positions[3].status', 'date', 'positions'
  ```
- `getPositions` calls it on a `200` body. On `{ ok: false, path }` it logs `console.warn(\`[bot-front] Unexpected bot data: ${path}\`)` and returns `{ ok: false, kind: 'error', message: 'Unexpected response from bot' }`.

- [ ] **Step 1: Write the failing tests** in `test/botback.test.ts`:

```ts
const VALID = { /* one full PositionView, as in test/summary.test.ts's pos() */ };

test('validatePositionsResponse accepts a valid response and keeps unknown fields', () => {
  const r = validatePositionsResponse({ date: '2026-10-22', positions: [{ ...VALID, extra: 1 }], more: true });
  assert.equal(r.ok, true);
  assert.equal((r as any).data.positions[0].extra, 1);
});

for (const [name, mutate, path] of [
  ['date format', (b) => { b.date = '22/10/2026'; }, 'date'],
  ['positions not array', (b) => { b.positions = {}; }, 'positions'],
  ['null row', (b) => { b.positions[0] = null; }, 'positions[0]'],
  ['status', (b) => { b.positions[0].status = 'sold'; }, 'positions[0].status'],
  ['missing stockName', (b) => { delete b.positions[0].stockName; }, 'positions[0].stockName'],
  ['untracked string', (b) => { b.positions[0].untracked = 'false'; }, 'positions[0].untracked'],
  ['created not a date', (b) => { b.positions[0].created = 'yesterday'; }, 'positions[0].created'],
  ['bought string', (b) => { b.positions[0].bought = '10'; }, 'positions[0].bought'],
  ['result NaN', (b) => { b.positions[0].result = NaN; }, 'positions[0].result'],
  ['lastPrice Infinity', (b) => { b.positions[0].lastPrice = Infinity; }, 'positions[0].lastPrice'],
  ['lastPriceTime garbage', (b) => { b.positions[0].lastPriceTime = 'garbage'; }, 'positions[0].lastPriceTime'],
] as const) {
  test(`validatePositionsResponse rejects ${name}`, () => {
    const body = structuredClone({ date: '2026-10-22', positions: [VALID] }) as any;
    mutate(body);
    assert.deepEqual(validatePositionsResponse(body), { ok: false, path });
  });
}

test('a 200 with malformed positions is an error result', async (t) => {
  t.mock.method(console, 'warn', () => {});
  reply(200, 'application/json', JSON.stringify({ date: '2026-10-22', positions: [{ ...VALID, status: 'sold' }] }));
  const r = await createBotBackClient(baseUrl).getPositions('2026-10-22');
  assert.deepEqual(r, { ok: false, kind: 'error', message: 'Unexpected response from bot' });
});
```

- [ ] **Step 2:** Run `npx tsx --test test/botback.test.ts`. Expected: FAIL, `validatePositionsResponse` is not exported.
- [ ] **Step 3:** Implement `validatePositionsResponse` in `src/botback.ts`, hand-written with the field rules in the spec section "Validating bot-back's response". "Parses as a date" means `!Number.isNaN(Date.parse(s))`. Report the first failing path.
- [ ] **Step 4:** Run `npm test`. Expected: all pass.
- [ ] **Step 5:** Commit: `git commit -m "Validate bot-back position data before accepting it"`

---

### Task 3: esbuild pipeline and web bundle loader

**Files:**
- Modify: `package.json` (deps, scripts), `tsconfig.json` (`exclude: ["web"]` for now, so the root config, still on `hono/jsx`, skips React files), `.gitignore`
- Create: `web/tsconfig.json`, `web/main.tsx` (placeholder), `web/tokens.css`, `scripts/build-web.ts`, `src/manifest.ts`
- Test: `test/build-web.test.ts`, `test/manifest.test.ts`

**Interfaces:**
- Produces:
  ```ts
  // scripts/build-web.ts
  export async function buildWeb(opts: { outdir: string; watch?: boolean }): Promise<void>;
  // writes <outdir>/assets/main-<HASH>.js, main-<HASH>.css, fonts; <outdir>/manifest.json
  // CLI: tsx scripts/build-web.ts [--watch] [--outdir <dir>]   (default outdir: dist/web)

  // src/manifest.ts
  export interface WebManifest { js: string; css: string }   // file names inside <dir>/assets
  export interface WebBundle { dir: string; manifest(): WebManifest }
  export class WebBundleError extends Error {}
  export function loadWebBundle(dir?: string): WebBundle;
  // default dir: process.env.WEB_DIST ?? <repo root>/dist/web
  ```

- [ ] **Step 1: Dependencies.**
  `npm install tsx` (moves it to `dependencies`) and
  `npm install -D react react-dom @tanstack/react-query @types/react @types/react-dom esbuild @fontsource/jetbrains-mono`.
  Scripts: `"build:web": "tsx scripts/build-web.ts"`, `"typecheck": "tsc --noEmit && tsc --noEmit -p web"`.
- [ ] **Step 2: Config.**
  - `web/tsconfig.json`: extends `../tsconfig.json`, `jsxImportSource: "react"`, `lib: ["ES2022", "DOM", "DOM.Iterable"]`, `types: []`, `include: [".", "../shared"]`, `exclude: []`.
  - `.gitignore` appends `dist/` and `.superpowers/`. The working tree's `.gitignore` already has an uncommitted `/graft/` block added by the user. Keep it and commit it with these lines.
  - `web/tokens.css`: the `:root` custom properties from Global Constraints (`--bg`, `--bg-raised`, `--bg-hover`, `--border`, `--fg`, `--fg-strong`, `--muted`, `--accent`, `--pos`, `--neg`, `--sim`), spacing `--space-1..4` (4/8/12/16 px), `--font-mono: "JetBrains Mono", ui-monospace, Consolas, monospace`.
  - `web/main.tsx`: `import './tokens.css';` and render `<p>bot-front</p>` into `#root`. Task 11 replaces it.
- [ ] **Step 3: Write the failing tests.**

```ts
// test/build-web.test.ts
test('buildWeb writes hashed js and css and a manifest pointing at them', async () => {
  const out = mkdtempSync(join(tmpdir(), 'web-'));
  await buildWeb({ outdir: out });
  const m = JSON.parse(readFileSync(join(out, 'manifest.json'), 'utf8'));
  assert.match(m.js, /^main-[A-Z0-9]+\.js$/);
  assert.match(m.css, /^main-[A-Z0-9]+\.css$/);
  assert.ok(existsSync(join(out, 'assets', m.js)));
  assert.ok(existsSync(join(out, 'assets', m.css)));
});

// test/manifest.test.ts
test('loadWebBundle throws WebBundleError when the manifest is missing', () => {
  assert.throws(() => loadWebBundle(mkdtempSync(join(tmpdir(), 'w-'))),
    (e) => e instanceof WebBundleError && e.message === 'Web bundle not built: run `npm run build:web`');
});
test('loadWebBundle throws WebBundleError on a malformed manifest', () => { /* manifest.json = {"js":1} → same error class */ });
test('manifest() re-reads the file when its modification time changes', () => {
  // write {js:'a.js',css:'a.css'}, load, read → a.js; rewrite {js:'b.js',css:'b.css'},
  // utimesSync(file, now+5s, now+5s); manifest().js → 'b.js'
});
```

- [ ] **Step 4:** Run `npx tsx --test test/build-web.test.ts test/manifest.test.ts`. Expected: FAIL, modules not found.
- [ ] **Step 5:** Implement `scripts/build-web.ts`. esbuild options: `entryPoints: ['web/main.tsx']`, `bundle`, `minify`, `sourcemap: 'linked'`, `format: 'esm'`, `target: 'es2022'`, `jsx: 'automatic'`, `jsxImportSource: 'react'`, `loader: { '.woff2': 'file', '.woff': 'file' }`, `outdir: <outdir>/assets`, `entryNames: '[name]-[hash]'`, `assetNames: '[name]-[hash]'`, `metafile: true`, `define: { 'process.env.NODE_ENV': '"production"' }`. The manifest comes from the metafile output whose `entryPoint` is `web/main.tsx` (`js` = its basename, `css` = basename of its `cssBundle`). Watch mode: `esbuild.context(...)` with a plugin whose `onEnd` rewrites the manifest when there are no errors, then `.watch()`. Run the CLI only when `import.meta.url` is the entry script.
- [ ] **Step 6:** Implement `src/manifest.ts`. `manifest()` checks `statSync(file).mtimeMs` on each call and re-parses only when it changed. Both `js` and `css` must be non-empty strings, otherwise `WebBundleError`.
- [ ] **Step 7:** Run `npm test` and `npm run typecheck`. Expected: all pass, no type errors. Run `npm run build:web`. Expected: `dist/web/manifest.json` exists.
- [ ] **Step 8:** Commit: `git commit -m "Add esbuild web build and bundle manifest loader"`

---

### Task 4: `/api/positions` and JSON login failures

**Files:**
- Modify: `src/auth.ts`, `src/app.tsx`
- Create: `test/helpers/positions.ts` (move `pos()`, `NOT_BOUGHT`, `POSITIONS` from `test/app.day.test.ts`, exported), `test/app.api.test.ts`
- Modify: `test/app.day.test.ts` (import the helpers), `test/auth.session.test.ts`

**Interfaces:**
- Consumes: `ApiErrorBody` from `shared/types.ts`; `BotBackClient` (Task 2).
- Produces:
  ```ts
  export function requireLogin(secret: string, now: () => Date, onFail: 'redirect' | 'json' = 'redirect'): MiddlewareHandler;
  // 'json' → 401 {"error":{"kind":"unauthorized","message":"Not logged in"}}; both set Cache-Control: no-store
  ```
  The `HX-Request` branch is removed.
- Route `GET /api/positions?date=` as in the spec's "Server routes". `failingSince` logic moves unchanged from `buildPanel`.

- [ ] **Step 1: Write the failing tests** in `test/app.api.test.ts`, with the `setup()`/`cookieFor()` helpers as in `test/app.day.test.ts`:

```ts
it('passes bot-back data through with no-store', async () => {
  // 200, cache-control no-store, json deepEqual { date: '2026-10-22', positions: POSITIONS }, calls ['2026-10-22']
});
it('unreachable gives 502 with since; since holds across failures and resets after success', async () => {
  // results: [unreachable, unreachable, ok, unreachable]; now() returns T0, T0+15s, T0+30s, T0+45s per request
  // 1st: 502, error.kind 'unreachable', error.since === T0.toISOString()
  // 2nd: since === T0 again; 3rd: 200; 4th: since === (T0+45s).toISOString()
});
it('bot error gives 502 with kind error and the message', async () => {
  // result { ok:false, kind:'error', message:'HTTP 500' } → 502 { error: { kind:'error', message:'HTTP 500', since: NOW iso } }
});
it('invalid or missing date gives 400 without calling bot-back', async () => {
  for (const q of ['', '?date=x', '?date=2026-02-30']) {
    // 400, body { error: { kind:'badRequest', message:'Invalid date' } }, calls stays []
  }
});
it('without a session gives 401 JSON', async () => {
  // 401, body { error: { kind:'unauthorized', message:'Not logged in' } }, no location header
});
```

In `test/auth.session.test.ts`, replace `'no cookie with HX-Request gets HX-Redirect'` with:
`'json mode answers 401 JSON without a cookie'` and `'redirect mode redirects even with HX-Request'` (302 to `/login`).

- [ ] **Step 2:** Run `npx tsx --test test/app.api.test.ts test/auth.session.test.ts`. Expected: FAIL (404 for `/api/positions`, HX test expectations).
- [ ] **Step 3:** Implement `requireLogin`'s `onFail` and the route in `src/app.tsx`. Delete the `/partials/positions` tests that check `HX-Redirect` from `test/app.day.test.ts`.
- [ ] **Step 4:** Run `npm test`. Expected: all pass.
- [ ] **Step 5:** Commit: `git commit -m "Add /api/positions with JSON errors"`

---

### Task 5: Serve the SPA, drop the server-rendered views

**Files:**
- Rename: `src/app.tsx` → `src/app.ts`
- Create: `src/pages/login.ts`, `src/pages/spa.ts`, `test/helpers/web.ts`
- Modify: `src/server.ts`, `tsconfig.json` (`jsxImportSource: "react"`, `lib: ["ES2022", "DOM", "DOM.Iterable"]`, `include: ["src", "shared", "web", "test", "scripts"]`, remove the Task 3 `exclude`), `shared/summary.ts` (delete `summaryText`), `test/summary.test.ts` (delete the three `summaryText` tests), `test/app.auth.test.ts`, `test/app.api.test.ts`
- Delete: `src/views/`, `static/`, `test/app.day.test.ts`

**Interfaces:**
- Consumes: `WebBundle`, `loadWebBundle`, `WebBundleError` (Task 3).
- Produces:
  ```ts
  // AppDeps gains:  web: WebBundle
  // src/pages/login.ts
  export function loginPage(cssFile: string, error?: string): HtmlEscapedString | Promise<HtmlEscapedString>;
  // src/pages/spa.ts
  export function spaPage(m: WebManifest): HtmlEscapedString | Promise<HtmlEscapedString>;
  // test/helpers/web.ts
  export function fakeWebBundle(): WebBundle;  // temp dir with manifest {js:'main-TEST.js',css:'main-TEST.css'}
                                               // and assets/main-TEST.js, assets/main-TEST.css; also writes <dir>/manifest.json
  ```
- Both pages start with `<!doctype html>`, have `lang="en"`, the viewport meta, `<link rel="stylesheet" href="/assets/<css>">`. `spaPage` adds `<div id="root"></div>` and `<script type="module" src="/assets/<js>"></script>`. `loginPage` keeps today's form markup (`id="password"`, `autocomplete="current-password"`, `role="alert"` error) inside `<main class="login">`, with a "BOT/FRONT" heading.
- Routes, in this order: security headers, `/assets/*` (serveStatic with root `<web.dir>/assets`, `Cache-Control: public, max-age=31536000, immutable` on hits, `404` otherwise), login/logout, `/api/positions`, `app.all('/api/*')` → `404 {"error":{"kind":"badRequest","message":"Not found"}}`, then `app.get('*', requireLogin(...,'redirect'), spa)`.
- `src/server.ts`: `loadWebBundle()` next to `loadConfig()`. On `WebBundleError`, print the message and `process.exit(1)`.

- [ ] **Step 1: Write the failing tests.** In `test/app.api.test.ts`:

```ts
it('serves the SPA page for any path with a session', async () => {
  for (const url of ['/', '/positions', '/whatever?date=2026-10-22']) {
    // 200, no-store, text starts with '<!doctype html>', contains '/assets/main-TEST.js' and '/assets/main-TEST.css',
    // contains '<div id="root"></div>', doesNotMatch /style=|<script>/ (only <script type="module" src=…>)
  }
});
it('redirects to /login without a session', async () => { /* GET /positions → 302, location '/login' */ });
it('serves known assets immutable without a session', async () => {
  // GET /assets/main-TEST.css → 200, cache-control 'public, max-age=31536000, immutable'
});
it('404s unknown and traversing asset paths', async () => {
  for (const url of ['/assets/nope.js', '/assets/../manifest.json', '/assets/%2e%2e%2fmanifest.json', '/assets/..%2Fmanifest.json'])
    // status 404, body does not contain '"js"'
});
it('404s unknown /api paths with JSON, not the SPA', async () => {
  // with a session: GET /api/nope → 404, content-type application/json, body.error.kind 'badRequest'
});
```

In `test/app.auth.test.ts`: pass `web: fakeWebBundle()` in `setup()`. Change `'serves static files without a session'` to fetch `/assets/main-TEST.css`. The security-header loop uses `['/login', '/assets/main-TEST.css', '/']`. Replace `'login page loads htmx config meta and no inline script or style'` with `'login page links the bundle CSS and has no script or inline style'`: contains `/assets/main-TEST.css`, doesNotMatch `/<script|style=/`. `'POST /login … redirects to /'` stays.

- [ ] **Step 2:** Run `npx tsx --test test/app.api.test.ts test/app.auth.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement the pages, the routes, the `server.ts` change, the tsconfig change and the deletions listed under Files.
- [ ] **Step 4:** Run `npm test` and `npm run typecheck`. Expected: all pass.
- [ ] **Step 5:** Commit: `git commit -m "Serve the React bundle and drop the server-rendered views"`

---

### Task 6: Base styles and component primitives

**Files:**
- Create: `web/base.css`, `web/ui/ui.css`, `web/ui/Money.tsx` (`Money`, `Percent`, `Price`, `Time`), `web/ui/SimValue.tsx`, `web/ui/StatusBadge.tsx`, `web/ui/Kpi.tsx` (`Kpi`, `KpiStrip`), `web/ui/ErrorBanner.tsx`, `web/ui/Stale.tsx`, `web/ui/PageErrorBoundary.tsx`
- Modify: `web/main.tsx` (import `@fontsource/jetbrains-mono/400.css`, `@fontsource/jetbrains-mono/700.css`, `./base.css`); `package.json` `test` script becomes `tsx --test "test/**/*.test.ts" "test/**/*.test.tsx"`
- Test: `test/web/ui.test.tsx`

The spec puts the font in `web/fonts/`. This plan takes it from the `@fontsource/jetbrains-mono` package instead: same files and licence, nothing binary committed. esbuild copies the woff2 files into `assets/`.

**Interfaces:**
- Produces (all named exports):
  ```ts
  Money(p: { value: number }): JSX.Element            // <span class="money pos|neg">formatKr</span>; no pos/neg for 0
  Percent(p: { value: number }), Price(p: { value: number }), Time(p: { iso: string; seconds?: boolean })
  SimValue(p: { value: number }): JSX.Element         // <span class="sim">≈ {formatKr}<span class="sim-badge">SIM</span></span>
  StatusBadge(p: { status: PositionStatus; untracked?: boolean })
     // <span class="badge badge--{status}">OPEN|CLOSED|PENDING|NOT FILLED|NO ORDER</span>
     // + <span class="untracked-label">untracked</span> when untracked
  Kpi(p: { label: string; children: ReactNode; sub?: ReactNode; variant?: 'sim' })  // class "kpi" / "kpi kpi--sim" + SIM badge in label
  KpiStrip(p: { children: ReactNode })
  ErrorBanner(p: { children: ReactNode })            // <p class="banner" role="alert">
  Stale(p: { children: ReactNode })                  // <div class="stale">
  class PageErrorBoundary extends Component<{ resetKey: unknown; children: ReactNode }, { error: Error | null; resetKey: unknown }>
     // static getDerivedStateFromError(error) → { error }
     // static getDerivedStateFromProps(props, state) → props.resetKey !== state.resetKey ? { error: null, resetKey: props.resetKey } : null
     // render: error ? <ErrorBanner>Bot error: unexpected data</ErrorBanner> : children
     // componentDidCatch logs console.error
  ```

- [ ] **Step 1: Write the failing tests** (`render = renderToStaticMarkup`):

```ts
test('Money marks sign', () => {
  assert.match(render(<Money value={1234} />), /class="money pos"[^>]*>\+1 234 kr</);
  assert.match(render(<Money value={-50} />), /class="money neg"[^>]*>−50 kr</);
  assert.match(render(<Money value={0} />), /class="money">0 kr</);
});
test('SimValue always shows ≈ and SIM', () => {
  const h = render(<SimValue value={540} />);
  assert.match(h, /class="sim"/); assert.match(h, /≈ \+540 kr/); assert.match(h, />SIM</);
});
test('StatusBadge labels and untracked', () => {
  assert.match(render(<StatusBadge status="notFilled" />), /badge--notFilled[^>]*>NOT FILLED</);
  assert.match(render(<StatusBadge status="open" untracked />), /<span class="untracked-label">untracked<\/span>/);
});
test('Kpi sim variant', () => {
  const h = render(<Kpi label="Est." variant="sim">x</Kpi>);
  assert.match(h, /class="kpi kpi--sim"/); assert.match(h, />SIM</);
});
test('ErrorBanner is an alert; Stale dims', () => { /* role="alert" class="banner"; class="stale" */ });
test('PageErrorBoundary resets only when resetKey changes', () => {
  const err = new Error('x');
  assert.deepEqual(PageErrorBoundary.getDerivedStateFromProps({ resetKey: 2, children: null }, { error: err, resetKey: 1 }), { error: null, resetKey: 2 });
  assert.equal(PageErrorBoundary.getDerivedStateFromProps({ resetKey: 1, children: null }, { error: err, resetKey: 1 }), null);
});
```

- [ ] **Step 2:** Run `npx tsx --test test/web/ui.test.tsx`. Expected: FAIL, modules not found.
- [ ] **Step 3:** Implement the components and CSS. `base.css`: `body` background `--bg`, colour `--fg`, `font-family: var(--font-mono)`, 13 px base, `font-variant-numeric: tabular-nums`. `ui.css`: `.pos`/`.neg` colours; `.sim` amber with `.sim-badge` (dashed amber border, 9–10 px uppercase); `.kpi--sim` has a 3 px amber left border; `.stale` opacity .5; `.banner` red border and background tint; `.badge` small bordered uppercase with `.badge--open` in accent. Match the approved mockup `.superpowers/brainstorm/*/content/navigation.html` option B.
- [ ] **Step 4:** Run `npm test`, `npm run typecheck`, `npm run build:web`. Expected: all pass, build writes woff2 files into `dist/web/assets/`.
- [ ] **Step 5:** Commit: `git commit -m "Add styles, font and UI primitives"`

---

### Task 7: `DataTable`

**Files:**
- Create: `web/ui/DataTable.tsx`, `web/ui/table.css`
- Test: `test/web/datatable.test.tsx`

**Interfaces:**
- Produces:
  ```ts
  export interface Column<T> {
    key: string; header: string; cell: (row: T) => ReactNode;
    align?: 'left' | 'right'; mobileLabel?: string;       // default: header
    hideOnPhone?: boolean; role?: 'title' | 'aside';      // phone card header: title left, aside right
    className?: (row: T) => string | undefined;
  }
  export function DataTable<T>(p: { columns: Column<T>[]; rows: T[]; rowKey: (r: T) => string;
    rowClass?: (r: T) => string | undefined; empty?: ReactNode }): JSX.Element;
  ```
  One `<table class="data-table">`. Each `<td>` has `data-label`, plus class `num` for `align: 'right'`, `phone-hidden`, `cell-title`/`cell-aside`, and the column's `className`. With no rows it renders `empty` instead of the table. Phone layout is pure CSS (below 700 px rows become bordered cards, `td::before { content: attr(data-label) }`, title/aside cells laid out in the card header without a label).

- [ ] **Step 1: Write the failing tests:**
  - `'renders headers and a data-label on every cell'`: 2 columns × 2 rows → 2 `<th>`, 4 `data-label=` matches.
  - `'mobileLabel overrides the header for data-label'`
  - `'applies num, phone-hidden, cell-title, cell-aside, rowClass and className'`
  - `'renders the empty node and no table when there are no rows'`: `empty={<p>None</p>}` → contains `<p>None</p>`, not `<table`.
- [ ] **Step 2:** Run `npx tsx --test test/web/datatable.test.tsx`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run `npm test`. Expected: all pass.
- [ ] **Step 5:** Commit: `git commit -m "Add DataTable with phone card layout"`

---

### Task 8: Router, page registry helpers, date resolution

**Files:**
- Create: `web/router.tsx`, `web/registry.ts`, `web/date.ts`
- Test: `test/web/router.test.ts`

**Interfaces:**
- Produces:
  ```ts
  // web/registry.ts
  export interface PageDef { id: string; label: string; group: 'Trading' | 'System'; path: string;
    icon: string; usesDate: boolean; component: (p: { date: string }) => JSX.Element }
  export function hrefFor(page: PageDef, date: string): string;          // '/positions?date=2026-10-22' or '/logs'
  export function resolvePage(pages: PageDef[], path: string): PageDef | null;   // '/' → pages[0]
  export function groupPages(pages: PageDef[]): { group: PageDef['group']; pages: PageDef[] }[]; // registry order, no empty groups
  export function splitForBottomBar(pages: PageDef[]): { shown: PageDef[]; more: PageDef[] };   // ≤4: all shown; >4: 3 + rest

  // web/date.ts
  export function resolveDate(param: string | null, now: Date): { date: string; replace: boolean };
  // valid → { date: param, replace: false }; null or invalid → { date: todayStockholm(now), replace: true }

  // web/router.tsx
  export interface RouterLocation { path: string; query: URLSearchParams }
  export function useLocation(): RouterLocation;   // useSyncExternalStore on popstate + an internal 'bf:navigate' event
  export function navigate(href: string, opts?: { replace?: boolean }): void;  // pushState/replaceState + dispatch
  export function shouldIntercept(
    e: { button: number; ctrlKey: boolean; metaKey: boolean; shiftKey: boolean; altKey: boolean; defaultPrevented: boolean },
    link: { target: string; origin: string }, pageOrigin: string): boolean;
  export function Link(p: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }): JSX.Element;
  ```
  `replace: true` from `resolveDate` means the app calls `navigate(hrefFor(page, date), { replace: true })`, so the URL always carries an explicit date (Review Focus 1).

- [ ] **Step 1: Write the failing tests:**

```ts
const P = (id: string, group: 'Trading' | 'System', usesDate = true) =>
  ({ id, label: id, group, path: `/${id}`, icon: '·', usesDate, component: () => null as any });

test('hrefFor keeps the date only for date pages', () => {
  assert.equal(hrefFor(P('positions', 'Trading'), '2026-10-22'), '/positions?date=2026-10-22');
  assert.equal(hrefFor(P('logs', 'System', false), '2026-10-22'), '/logs');
});
test('resolvePage maps / to the first page and unknown paths to null', () => { /* '/', '/b', '/nope' */ });
test('groupPages keeps order and skips empty groups', () => {
  assert.deepEqual(groupPages([P('a', 'Trading')]).map((g) => g.group), ['Trading']);
});
test('splitForBottomBar', () => {
  // 4 pages → shown 4, more 0; 5 pages → shown 3, more 2
});
test('resolveDate', () => {
  const now = new Date('2026-10-22T08:00:00Z');
  assert.deepEqual(resolveDate('2026-10-20', now), { date: '2026-10-20', replace: false });
  assert.deepEqual(resolveDate(null, now), { date: '2026-10-22', replace: true });
  assert.deepEqual(resolveDate('2026-02-30', now), { date: '2026-10-22', replace: true });
});
test('shouldIntercept only plain same-origin left clicks without target', () => {
  const plain = { button: 0, ctrlKey: false, metaKey: false, shiftKey: false, altKey: false, defaultPrevented: false };
  const link = { target: '', origin: 'https://b' };
  assert.equal(shouldIntercept(plain, link, 'https://b'), true);
  for (const mod of [{ ctrlKey: true }, { metaKey: true }, { shiftKey: true }, { altKey: true }, { button: 1 }, { defaultPrevented: true }])
    assert.equal(shouldIntercept({ ...plain, ...mod }, link, 'https://b'), false);
  assert.equal(shouldIntercept(plain, { ...link, target: '_blank' }, 'https://b'), false);
  assert.equal(shouldIntercept(plain, { ...link, origin: 'https://x' }, 'https://b'), false);
});
```

- [ ] **Step 2:** Run `npx tsx --test test/web/router.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement. `useLocation`'s `getServerSnapshot` returns `{ path: '/', query: new URLSearchParams() }`. Cache the snapshot object per `location.href` so `useSyncExternalStore` sees a stable value.
- [ ] **Step 4:** Run `npm test` and `npm run typecheck`. Expected: all pass.
- [ ] **Step 5:** Commit: `git commit -m "Add router, page registry helpers and date resolution"`

---

### Task 9: API client and polling

**Files:**
- Create: `web/api.ts`, `web/query.ts`
- Test: `test/web/api.test.ts`

**Interfaces:**
- Consumes: `ApiErrorKind`, `ApiErrorBody` (`shared/types.ts`), `todayStockholm` (`shared/day.ts`).
- Produces:
  ```ts
  // web/api.ts
  export type ClientErrorKind = ApiErrorKind | 'network';
  export class ApiError extends Error {
    constructor(public status: number, public kind: ClientErrorKind, message: string, public since: string | null = null);
  }
  export async function fetchJson<T>(path: string,
    deps?: { fetch?: typeof fetch; onUnauthorized?: () => void }): Promise<T>;
  // fetch rejects             → ApiError(0, 'network', "Can't reach bot-front")
  // 401                       → onUnauthorized() (default: location.assign('/login')), then ApiError(401, 'unauthorized', 'Not logged in')
  // non-2xx with ApiErrorBody → ApiError(status, body.error.kind, body.error.message, body.error.since ?? null)
  // non-2xx otherwise         → ApiError(status, 'error', `HTTP ${status}`)
  // 2xx that is not JSON      → ApiError(status, 'error', 'Unexpected response from bot-front')
  // fetch is called with { credentials: 'same-origin', headers: { accept: 'application/json' } }

  // web/query.ts
  export const POLL_MS = 15_000;
  export function pollInterval(date: string, now: Date): number | false;
  export function createQueryClient(): QueryClient;
  // defaults.queries: { retry: false, refetchOnWindowFocus: true, refetchIntervalInBackground: false }
  ```

- [ ] **Step 1: Write the failing tests** (stub `fetch` returns `new Response(...)`):

```ts
test('fetchJson returns the parsed body on 200', ...);
test('fetchJson maps a 502 ApiErrorBody', async () => {
  // body { error: { kind: 'unreachable', message: 'ECONNREFUSED', since: '2026-10-22T08:42:00.000Z' } }
  // rejects with ApiError status 502, kind 'unreachable', message 'ECONNREFUSED', since '2026-10-22T08:42:00.000Z'
});
test('fetchJson calls onUnauthorized on 401', ...);      // called once, rejects kind 'unauthorized'
test('fetchJson maps a network failure', ...);           // stub rejects TypeError → kind 'network', status 0
test('fetchJson treats a non-JSON 200 as an error', ...); // body '<html>', content-type text/html → kind 'error', message 'Unexpected response from bot-front'
test('fetchJson maps a non-JSON 500', ...);              // → kind 'error', message 'HTTP 500'
test('pollInterval polls only today in Stockholm', () => {
  assert.equal(pollInterval('2026-10-22', new Date('2026-10-22T08:00:00Z')), 15000);
  assert.equal(pollInterval('2026-10-21', new Date('2026-10-22T08:00:00Z')), false);
  assert.equal(pollInterval('2026-10-22', new Date('2026-10-22T22:00:01Z')), false); // 00:00:01 on the 23rd in Stockholm (CEST)
});
```

- [ ] **Step 2:** Run `npx tsx --test test/web/api.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run `npm test`. Expected: all pass.
- [ ] **Step 5:** Commit: `git commit -m "Add API client and polling rules"`

---

### Task 10: Positions page

**Files:**
- Create: `web/pages/positions/usePositions.ts`, `PositionsPage.tsx`, `PositionsView.tsx`, `PositionsContent.tsx`, `columns.tsx`, `positions.css`
- Test: `test/web/positions.test.tsx` (uses `test/helpers/positions.ts`)

**Interfaces:**
- Consumes: Tasks 6, 7, 9; `summarize` (`shared/summary.ts`); `isPriceOld`, `formatTime` (`shared/format.ts`).
- Produces:
  ```ts
  export function usePositions(date: string): UseQueryResult<PositionsResponse, ApiError>;
  // queryKey ['positions', date]; queryFn fetchJson(`/api/positions?date=${date}`); refetchInterval: () => pollInterval(date, new Date())

  export function errorText(e: ApiError): string;
  // unreachable → `Bot unreachable since ${formatTime(e.since)}` (or 'Bot unreachable' without since)
  // error       → `Bot error: ${e.message}`
  // network     → "Can't reach bot-front"
  // other       → e.message

  export function PositionsView(p: { date: string; now: Date; data: PositionsResponse | undefined;
    error: ApiError | null; dataUpdatedAt: number; isPending: boolean }): JSX.Element;
  export function PositionsContent(p: { data: PositionsResponse; now: Date }): JSX.Element;
  export function PositionsPage(p: { date: string }): JSX.Element;
  // = usePositions + useReportLive({ polling: pollInterval(date, now) !== false, updatedAt: dataUpdatedAt || null }) + PositionsView
  ```
  `useReportLive` comes from Task 11. Until then `PositionsPage` omits that call, and Task 11 adds it.
- `PositionsView` structure: error and no data → `ErrorBanner` only. Error and data → `ErrorBanner` with `${errorText} · showing data from ${formatTime(new Date(dataUpdatedAt).toISOString(), true)}`, then `Stale` › `PageErrorBoundary resetKey={dataUpdatedAt}` › `PositionsContent`. Data, no error → boundary › content. Pending → `<div class="skeleton">` KPI and table placeholders.
- KPIs: Total `Money(total.result)` + `(n unpriced)`; `Closed (n)`; `Open (n)` + `(n unpriced)`; `Taken` = count, `sub` = attempts text `1 pending · 1 not filled · 1 no order` (only non-zero parts, omitted when all zero).
- Columns (spec "Positions page"): Stock (`role: 'title'`), Status (`StatusBadge`), Volume `bought/targetAmount`, Avg buy, Sell / last, Result (`role: 'aside'`, `Money` + `Percent`). Sell / last and Result follow the rules in today's `SellCell`/`ResultCell` (see `git show 5762a84:src/views/PositionsPanel.tsx`, the version before this plan started). Sell / last cell gets class `old-price` when `isPriceOld`. Rows get class `untracked` when untracked.

- [ ] **Step 1: Write the failing tests** with `NOW = new Date('2026-10-22T08:42:15Z')` and `POSITIONS` from the helper:

```ts
test('content shows KPIs and rows in created order', () => {
  const h = render(<PositionsContent data={{ date: '2026-10-22', positions: POSITIONS }} now={NOW} />);
  assert.match(h, /Taken[\s\S]*>5</);
  assert.match(h, /1 pending · 1 not filled/);
  const order = ['Alpha', 'Beta', 'Gamma', 'Delta', 'Eps', 'Zeta'].map((n) => h.indexOf(n));
  assert.deepEqual([...order].sort((a, b) => a - b), order);
});
test('row cells follow the display rules', () => {
  // '254,10 · 10:41' present; exactly one 'old-price', and it contains '254,10 · 10:39';
  // 'unpriced' present; /<tr class="[^"]*untracked/; 'untracked-label';
  // 'H&amp;M &lt;b&gt;' present and 'H&M <b>' absent; 'NOT FILLED'; /money pos[^>]*>\+410 kr/; 'money neg'; '100/100'
});
test('partly sold open position shows the live price', () => {
  // pos({ bought: 40, sold: 20, avgSellPrice: 255 }) → '254,10 · 10:41' present, '255,00' absent
});
test('pending and notFilled rows show a dash as result', () => { /* POSITIONS[4], [5] → two Result cells with '–' */ });
test('an empty day shows zero KPIs and a message', () => {
  const h = render(<PositionsContent data={{ date: '2026-10-20', positions: [] }} now={NOW} />);
  assert.match(h, /No positions on this day/); assert.doesNotMatch(h, /<table/); assert.match(h, /0 kr/);
});
test('view: error without data shows only the banner', () => {
  // error = new ApiError(502, 'unreachable', 'x', '2026-10-22T08:40:00.000Z') → 'Bot unreachable since 10:40', no '<table', no 'stale'
});
test('view: error with data shows banner, time of data and dimmed content', () => {
  // dataUpdatedAt = Date.parse('2026-10-22T08:41:57Z') → 'showing data from 10:41:57', class="stale", 'Alpha'
});
test('view: network error text', () => { /* kind 'network' → "Can&#x27;t reach bot-front" or "Can't reach bot-front" */ });
```

- [ ] **Step 2:** Run `npx tsx --test test/web/positions.test.tsx`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run `npm test` and `npm run typecheck`. Expected: all pass.
- [ ] **Step 5:** Commit: `git commit -m "Add the Positions page"`

---

### Task 11: Shell, app root and entry point

**Files:**
- Create: `web/shell/live.tsx`, `web/shell/Shell.tsx`, `web/shell/Sidebar.tsx`, `web/shell/BottomBar.tsx`, `web/shell/TopBar.tsx`, `web/shell/DateBar.tsx`, `web/shell/shell.css`, `web/App.tsx`, `web/pages.ts`, `web/NotFound.tsx`
- Modify: `web/main.tsx` (final), `web/pages/positions/PositionsPage.tsx` (add `useReportLive`)
- Test: `test/web/shell.test.tsx`

**Interfaces:**
- Produces:
  ```ts
  // web/shell/live.tsx
  export interface LiveStatus { polling: boolean; updatedAt: number | null }
  export function LiveProvider(p: { children: ReactNode; initial?: LiveStatus | null }): JSX.Element;
  export function useLiveStatus(): LiveStatus | null;
  export function useReportLive(s: LiveStatus | null): void;   // sets on change, null on unmount

  // web/shell/Shell.tsx
  export function Shell(p: { pages: PageDef[]; page: PageDef | null; date: string; today: string; children: ReactNode }): JSX.Element;
  // Sidebar + TopBar + DateBar (when page?.usesDate) + <main> + BottomBar

  // web/shell/DateBar.tsx
  export function DateBar(p: { page: PageDef; date: string; today: string }): JSX.Element;
  // ◂ Link to hrefFor(page, addDays(date,-1)); <input type="date" max={today}> → navigate(hrefFor(page, value));
  // ▸ Link to next day, or <span class="disabled" aria-disabled="true">▸</span> when date >= today;
  // 'Today' Link to hrefFor(page, today); live: polling ? `● live ${formatTime(updatedAt, true)}` : 'paused'

  // web/pages.ts
  export const PAGES: PageDef[];  // [{ id: 'positions', label: 'Positions', group: 'Trading', path: '/positions', icon: '▤', usesDate: true, component: PositionsPage }]

  // web/App.tsx
  export function App(): JSX.Element;
  // useLocation → resolvePage; resolveDate(query.get('date'), new Date()); if replace and page?.usesDate → navigate(hrefFor(page,date),{replace:true}) in an effect;
  // today from a useToday() hook re-checked every 60 s; QueryClientProvider(createQueryClient()) › LiveProvider › Shell › page.component({date}) or NotFound
  ```
- Logout: `<form method="post" action="/logout"><button type="submit">Log out</button></form>` at the sidebar bottom and in the top bar.
- Active nav link has `aria-current="page"`. The bottom bar's "More" is a `<details>` listing `splitForBottomBar(...).more`.
- `shell.css`: sidebar 128 px, `.grp` uppercase muted headings, active item with a 2 px accent inset left border. Below 700 px the sidebar is hidden and the top bar and bottom bar are shown. Match option B of the approved mockup.

- [ ] **Step 1: Write the failing tests:**

```ts
const today = '2026-10-22';
const page = PAGES[0];
const wrap = (el: JSX.Element, live: LiveStatus | null = null) => render(<LiveProvider initial={live}>{el}</LiveProvider>);

test('sidebar lists only groups that have pages and marks the active one', () => {
  const h = wrap(<Shell pages={PAGES} page={page} date={today} today={today}><p /></Shell>);
  assert.match(h, />Trading</); assert.doesNotMatch(h, />System</);
  assert.match(h, /aria-current="page"[^>]*href="\/positions\?date=2026-10-22"|href="\/positions\?date=2026-10-22"[^>]*aria-current="page"/);
  assert.match(h, /<form method="post" action="\/logout"/);
});
test('date bar on today disables next and shows live time', () => {
  const h = wrap(<DateBar page={page} date={today} today={today} />, { polling: true, updatedAt: Date.parse('2026-10-22T08:41:57Z') });
  assert.match(h, /href="\/positions\?date=2026-10-21"/);
  assert.match(h, /aria-disabled="true"/); assert.doesNotMatch(h, /date=2026-10-23/);
  assert.match(h, /max="2026-10-22"/); assert.match(h, /live 10:41:57/);
});
test('date bar on a past day links forward and says paused', () => {
  const h = wrap(<DateBar page={page} date="2026-10-20" today={today} />, { polling: false, updatedAt: null });
  assert.match(h, /href="\/positions\?date=2026-10-21"/); assert.match(h, /paused/);
});
test('bottom bar puts pages beyond 4 under More', () => {
  // 5 fake PageDefs → 3 links in the bar, a <details> with 2 links
});
test('unknown page renders NotFound inside the shell', () => { /* page={null} → 'Page not found', no DateBar */ });
```

- [ ] **Step 2:** Run `npx tsx --test test/web/shell.test.tsx`. Expected: FAIL.
- [ ] **Step 3:** Implement. `web/main.tsx`: imports the fonts, `./tokens.css`, `./base.css`, then `createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>)`.
- [ ] **Step 4:** Run `npm test`, `npm run typecheck`, `npm run build:web`. Expected: all pass, build succeeds.
- [ ] **Step 5:** Commit: `git commit -m "Add the shell, app root and entry point"`

---

### Task 12: Development tooling

**Files:**
- Create: `scripts/fake-botback.ts`, `scripts/dev.ts`
- Modify: `package.json` (`"dev": "tsx scripts/dev.ts"`, `"fake-botback": "tsx scripts/fake-botback.ts"`), `tsconfig.json` unchanged
- Test: `test/fake-botback.test.ts`

**Interfaces:**
- Produces:
  ```ts
  // scripts/fake-botback.ts
  export type FakeMode = 'good' | 'empty' | 'malformed' | 'error';
  export async function startFakeBotBack(port: number): Promise<{ url: string; close(): Promise<void> }>;
  // GET /view/positions?date=D → by mode:
  //   good: 200 { date: D, positions: [3–5 positions incl. one open with lastPrice that changes every 15 s, lastPriceTime = now] }
  //   empty: 200 { date: D, positions: [] }; malformed: 200 with one row's status 'sold'; error: 500 { error: 'fake failure' }
  // GET /_mode/<mode> → 200 'mode=<mode>' and switches; anything else 404
  // CLI: tsx scripts/fake-botback.ts [port=1234], logs the URL and how to switch modes
  // scripts/dev.ts: buildWeb({ outdir: 'dist/web', watch: true }), then spawn `npx tsx watch src/server.ts`
  //   with inherited stdio and env; forwards SIGINT/SIGTERM to the child and exits with it
  ```

- [ ] **Step 1: Write the failing test:** `'fake bot-back serves valid data and can switch modes'`. Start on port 0. `good` → body passes `validatePositionsResponse`. `GET /_mode/malformed` → next body fails it. `/_mode/error` → status 500. Close.
- [ ] **Step 2:** Run `npx tsx --test test/fake-botback.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement both scripts.
- [ ] **Step 4:** Run `npm test`. Expected: all pass. Then smoke-run: a `config.json` with `"tls": false, "httpPort": 8080, "botBackUrl": "http://localhost:1234"`, `npm run fake-botback` in one terminal, `CONFIG_PATH=./config.json npm run dev` in another. Expected: `http://localhost:8080` shows the login page in the new style, and after login Positions shows the fake data.
- [ ] **Step 5:** Commit: `git commit -m "Add dev script and fake bot-back"`

---

### Task 13: Docker, README and manual checks

**Files:**
- Modify: `Dockerfile` (exactly as in the spec's "Dockerfile" section), `.dockerignore` (add `dist`, `.superpowers`, `graft`; keep the rest), `README.md`

- [ ] **Step 1:** Write the Dockerfile and `.dockerignore`.
- [ ] **Step 2:** README:
  - "Local run" becomes "Development": `npm run fake-botback`, `npm run dev`, F5 after edits, mode switching with `curl localhost:1234/_mode/<mode>`.
  - "Build and run" gains the four steps of the spec's "Deploying on the box" (disk check, prune, freeing space deliberately, bumping the pinned digest).
  - Note that the image now builds the web bundle.
- [ ] **Step 3:** Run `npm test` and `npm run typecheck`. Expected: all pass. Commit: `git commit -m "Multi-stage Dockerfile and README for the React build"`
- [ ] **Step 4: Manual checks on the PC.** Run every item of the spec's "Manual checks" step 1 against `npm run dev` + `npm run fake-botback`, at desktop width and at 375 px wide in DevTools. Record pass/fail for each item in the task report. Fix failures before continuing.
- [ ] **Step 5: Manual checks on the Odroid.** Ask the user before running anything on the box. With their go-ahead: `df -h /storage` (≥ 1 GB free), copy the repo, `docker build -t kimf/bot-front .`, run with `tls: false` on `-p 8081:80` as in the README's LAN check, open from a phone, then `docker image prune -f`. Report the build time, the final image size and the free space after pruning.

---

## Self-review notes

- Spec coverage: architecture/routes (4, 5), validation (2), CSP (5: no-inline assertions), registry/routing (8, 11), shell (11), component kit (6, 7), styling/tokens/font (3, 6), Positions page and three-level structure (10), fetching/polling/error states (9, 10), build and manifest re-read (3), dev scripts (12), Dockerfile/pinning/deploy docs (13), tests (each task), manual checks (13).
- Deliberate deviations from the spec, both small: the font comes from `@fontsource/jetbrains-mono` instead of files committed under `web/fonts/` (Task 6). `PageDef.component` receives `{ date }` instead of no props (Task 8), so pages don't each re-read the URL.
