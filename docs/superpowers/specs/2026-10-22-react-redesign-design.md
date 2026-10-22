# bot-front: React frontend with a trading-desk look

Date: 2026-10-22
Status: Draft, awaiting review

## Goal

The current UI works but looks plain. Replace the server-rendered htmx pages with a React app that looks
like a trading desk (dark, monospace, dense) and has a shell that new pages slot into as bot-back exposes
more APIs.

Success looks like:

- The Positions page shows at least what today's day page shows, in the new look, on both phone and
  desktop.
- Adding a page later (for example a Recs page with simulated outcomes) means a bot-back client function,
  a proxy route, a page component and one line in the page registry. The look, navigation and date
  handling come for free.
- The image builds and runs on the Odroid N2 (`docker build` on the box).

This spec replaces sections 2.1 (views and static files), 2.4, 2.5, 2.8 and "Moving to React later" of
`2026-10-22-bot-front-design.md`. Everything else there (TLS, auth, config, the bot-back contract) still
applies.

### Decided

- React SPA, bundled with **esbuild** (no Vite). See "Build on the box" for why.
- Visual style "A, trading desk": dark only, monospace (JetBrains Mono, self-hosted), KPI strip, dense
  table, blue accent, green/red results.
- Navigation: sidebar on desktop, bottom tab bar on phone. Only pages that exist are listed.
- The date is part of the shell and shared between date-based pages, kept in the URL (`?date=`).
- Simulated values have their own look: amber, prefixed with ≈, with a `SIM` badge, and dashed borders
  on simulated cards. It is built into the component kit now, though nothing uses it yet.
- Hono stays as the server: TLS, Let's Encrypt, login, sessions, rate limit, security headers, strict CSP.
- Login stays a server-rendered form.

### Out of scope

- The Recs/simulation page and any other new page. They need bot-back APIs that do not exist yet.
- Light mode. Colour tokens make it possible later.
- Live reload or hot module replacement during development.
- Any change to bot-back or to the `/view/positions` contract.

## Build on the box

The Odroid N2 runs CoreELEC 20.5 with a 64-bit kernel (`aarch64`) but a 32-bit userspace. Docker 19.03.15
reports `linux/arm`, and `node -p process.arch` in a `node:22-alpine` container prints `arm`. Images are
built on the box.

A throwaway build test in `node:22-alpine` on the box (2026-10-22) showed:

| Tool | Result |
|---|---|
| Vite 8.3.5 | Fails. Rolldown only has `binding-linux-arm-gnueabihf` (glibc). Alpine is musl, so the binding does not load |
| esbuild 0.28.2 | Works. React + JSX bundle of 218 KB minified in 243 ms |

esbuild is also what `tsx` already uses in bot-back on the same box. Other tools with native binaries
(Rolldown, Tailwind v4, Lightning CSS) are avoided for the same reason.

`/storage` was 92% full (527 MB free) at the time of the test, with 3.25 GB reclaimable in unused images.

## Architecture

```
browser (React SPA)  ──/api/*──▶  bot-front (Hono, Node)  ──http──▶  bot-back
                     ◀─HTML/JS──   TLS, login, sessions,
                                   JSON proxy routes
```

### Repository layout

One `package.json`.

| Path | Contents |
|---|---|
| `src/` | Server. `server.ts`, `config.ts`, `tls/`, `auth.ts`, `botback.ts` unchanged. `app.tsx` becomes `app.ts` |
| `src/pages/` | `login.ts` and `spa.ts`: the two server-rendered HTML pages, as Hono `html` tagged templates |
| `src/manifest.ts` | Reads `dist/web/manifest.json` at startup |
| `shared/` | Code used by both server and browser: `day.ts`, `format.ts`, `summary.ts`, `types.ts` (the `PositionView` and API error types) |
| `web/` | React app. Own `tsconfig.json` with DOM types |
| `web/fonts/` | JetBrains Mono woff2, regular and bold (OFL) |
| `scripts/build-web.ts` | esbuild build |
| `scripts/dev.ts` | Runs the esbuild watcher and `tsx watch src/server.ts` together |
| `dist/web/` | Build output, not committed |

Removed: `src/views/` (`Layout`, `LoginPage`, `DayPage`, `PositionsPanel`), `static/htmx.min.js`,
`static/style.css`, the `/partials/positions` route.

The server uses no JSX after the change. React is the only JSX in the repository, so the root
`tsconfig.json` sets `jsxImportSource` to `react`, adds `shared` to `include` and `DOM` to `lib` (the
component tests import from `web/`). `web/tsconfig.json` covers `web` and `shared`.

`summary.ts` stops producing text. It keeps `summarize()`, and the browser formats the numbers.

### Server routes

| Route | Auth | Behaviour |
|---|---|---|
| `GET /login`, `POST /login`, `POST /logout` | as today | Unchanged behaviour. The login page uses the bundled CSS |
| `GET /api/positions?date=YYYY-MM-DD` | yes | See below |
| `GET /assets/*` | no | Files from `dist/web/assets/`. `Cache-Control: public, max-age=31536000, immutable`. Unknown file → `404` |
| any other `GET` | yes | The SPA page. `Cache-Control: no-store`. Not logged in → redirect to `/login` |

`/assets/*` is not behind login because the bundle holds no data, and the login page needs the CSS.

The SPA page is a catch-all, so the server does not need to know the list of pages. The browser's router
shows "Page not found" for unknown paths. `/` shows the Positions page, so old `/?date=` bookmarks keep
working.

`GET /api/positions`:

- `200` with bot-back's `PositionsResponse` body as is.
- Invalid or missing `date` → `400 {"error": {"kind": "badRequest", "message": "Invalid date"}}`.
- bot-back unreachable or timed out → `502 {"error": {"kind": "unreachable", "message": "…", "since": "<ISO>"}}`.
- bot-back non-200 or unexpected shape → `502 {"error": {"kind": "error", "message": "…", "since": "<ISO>"}}`.
- `since` is the time of the first failure in the current run of failures, kept in memory as today.
- Not logged in → `401 {"error": {"kind": "unauthorized", "message": "Not logged in"}}`. No redirect, and
  no `HX-Redirect` handling any more.
- `Cache-Control: no-store`.

### Security headers and CSP

Unchanged: `default-src 'self'`, `base-uri 'none'`, `form-action 'self'`, `frame-ancestors 'none'`,
HSTS when `tls` is true, `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy: no-referrer`.

The bundle, CSS and fonts are served by bot-front itself. React's `style` props go through the CSSOM and
are allowed. No CSS-in-JS library that injects `<style>` tags is used.

## Frontend

Runtime dependencies (all plain JS): `react`, `react-dom`, `@tanstack/react-query`. They are bundled,
so they are `devDependencies`.

### Page registry

`web/pages.ts` is the one list of pages:

```ts
export interface PageDef {
  id: string;
  label: string;
  group: 'Trading' | 'System';
  path: string;          // '/positions'
  icon: string;          // a single glyph
  usesDate: boolean;
  component: () => JSX.Element;
}
```

At this stage it holds one entry, Positions (`/positions`, Trading, `usesDate: true`).

- Sidebar and bottom bar render from the registry. A group heading appears only if it has pages.
- Bottom bar: up to 4 pages. With more, it shows the first 3 and a "More" item that opens a list of the rest.

### Routing

About 40 lines in `web/router.ts` on the History API: current path and query, `navigate(href)`, and a
`Link` component that intercepts clicks.

- The date is `?date=YYYY-MM-DD`. Missing means today (Stockholm). An invalid date is replaced by today
  with `history.replaceState`.
- `hrefFor(page, date)` keeps `?date=` when the target page has `usesDate`, and drops it otherwise.
- `/` resolves to the first page in the registry.

### Shell (`web/shell/`)

- `Shell`: sidebar and content area. Below 700 px the sidebar is hidden and a top bar and bottom bar are
  shown, by CSS media query.
- `Sidebar`: "BOT/FRONT", pages by group with the active page marked, logout at the bottom.
- `BottomBar`: icon and label per page.
- `TopBar` (phone): "BOT/FRONT", compact date control, logout.
- `DateBar` (pages with `usesDate`): ◂ previous day, the date (a native date input), ▸ next day (disabled
  on today), "Today", and a live indicator: `● live HH:MM:SS` when polling, `paused` for other days.
- Logout is a form POST to `/logout`, as today.

### Component kit (`web/ui/`)

| Component | Purpose |
|---|---|
| `KpiStrip`, `Kpi` | Row of headline numbers with label and value. `variant="sim"` adds the amber edge and `SIM` badge |
| `DataTable` | Takes column definitions (`header`, `cell`, `align`, `mobileLabel`, `hideOnPhone`). Table on desktop, cards on phone. Each cell carries its mobile label |
| `Money` | `formatKr`, `pos` or `neg` class by sign, none for zero |
| `Percent`, `Price`, `Time` | `shared/format.ts` wrappers |
| `SimValue` | Amber, prefixed with ≈, `SIM` badge. The only component that shows simulated numbers |
| `StatusBadge` | OPEN, CLOSED, PENDING, NOT FILLED, NO ORDER, plus the untracked label |
| `ErrorBanner` | Red banner |
| `Stale` | Wraps content and dims it |
| `PageErrorBoundary` | Catches render errors in a page and shows "Bot error: unexpected data" |

### Styling

- Plain CSS, imported from the components and bundled by esbuild into one CSS file.
- `web/tokens.css`: `--bg`, `--bg-raised`, `--border`, `--fg`, `--muted`, `--accent` (blue), `--pos` (green),
  `--neg` (red), `--sim` (amber), spacing steps, font stack. Colours start from the approved mockup
  (`#0d1117` background, `#58a6ff` accent, `#3fb950` / `#f85149` results, `#d29922` simulated).
- Numbers use `font-variant-numeric: tabular-nums` and are right-aligned.
- JetBrains Mono regular and bold, with `font-display: swap` and a system monospace fallback.

### Positions page (`web/pages/positions/`)

Same content as today's day page:

- KPI strip: Total, Closed (count), Open (count), Taken, from `summarize()`. If any open position is
  unpriced, Open and Total show "(n unpriced)". Attempts (pending, not filled, no order) are shown under
  Taken only when non-zero.
- Table, one row per position in `created` order: stock, status, volume `bought/targetAmount`, average buy,
  sell or last price, result in kr and %. The rules are unchanged:
  - A last price is shown with its time and is dimmed when older than 2 minutes.
  - An open position without a result shows "unpriced". Other null results show "–".
  - Untracked rows are dimmed with an "untracked" label. A negative result stays at full opacity.
  - Swedish number formatting.
- On phone: stock and result in the card header, the other fields as label and value lines.

## Data flow

### Fetching

- `web/api.ts`: `fetchJson<T>(path)` returns the body, or throws an `ApiError` with `status`, `kind`,
  `message` and `since`. A network failure throws `kind: "network"`.
- `usePositions(date)`: TanStack Query with key `['positions', date]`.
- A `401` anywhere sends the browser to `/login` with `location.assign`.

### Polling

- `pollInterval(date, now)` returns 15 000 ms when `date` is today in Stockholm and `false` otherwise.
  It is passed to `refetchInterval` as a function, so it is re-checked on each tick and polling stops after
  midnight.
- `refetchIntervalInBackground: false`: no polling while the tab is hidden.
- `refetchOnWindowFocus: true`: an immediate fetch when returning to the tab or app.
- No retry beyond the poll interval (`retry: false`). Polling continues through errors.

### What is shown

| Situation | Shown |
|---|---|
| Loading, no data yet | KPI strip and table skeleton in the muted colour |
| Data | Page content. The live indicator shows the time of the last successful fetch |
| bot-back failing, no data yet | `ErrorBanner`: "Bot unreachable since HH:MM" or "Bot error: <message>" |
| bot-back failing, data already shown | `ErrorBanner` with "… · showing data from HH:MM:SS" above the last good data wrapped in `Stale` |
| `kind: "network"` | As the two rows above, with "Can't reach bot-front" |
| Render error | `PageErrorBoundary` message. Polling continues and the boundary resets on the next successful fetch |

## Build and development

### `scripts/build-web.ts`

- esbuild API. Entry `web/main.tsx`, `bundle`, `minify`, `sourcemap: 'linked'`, `jsx: 'automatic'`,
  `target: 'es2022'`, loader `file` for `.woff2`.
- Output to `dist/web/assets/` with `entryNames` and `assetNames` set to `[name]-[hash]`.
- Writes `dist/web/manifest.json`: `{ "js": "main-<hash>.js", "css": "main-<hash>.css" }`, taken from the
  metafile.
- `--watch` uses `esbuild.context().watch()` and rewrites the manifest after each rebuild.
- `--outdir <dir>` overrides the output folder (used by the build test).

### Server

- `src/manifest.ts` reads `dist/web/manifest.json` at startup (override with `WEB_DIST`). If it is
  missing or malformed, the server exits with "Web bundle not built: run `npm run build:web`".
- In watch mode the manifest can change. The server re-reads it when the file's modification time
  changes, so a rebuild needs only a browser reload.

### npm scripts

| Script | Does |
|---|---|
| `start` | `tsx src/server.ts` |
| `dev` | `tsx scripts/dev.ts`: esbuild watch and `tsx watch src/server.ts` |
| `build:web` | `tsx scripts/build-web.ts` |
| `test` | `tsx --test "test/**/*.test.ts" "test/**/*.test.tsx"` |
| `typecheck` | `tsc --noEmit && tsc --noEmit -p web` |
| `hash-password` | unchanged |

`tsx` moves to `dependencies` because `start` needs it in the image.

### Dockerfile

Multi-stage, classic syntax only (Docker 19.03 without BuildKit):

```dockerfile
FROM node:22-alpine AS build
WORKDIR /usr/src/app
COPY package*.json ./
RUN npm ci
COPY tsconfig.json ./
COPY scripts ./scripts
COPY shared ./shared
COPY web ./web
RUN npm run build:web

FROM node:22-alpine
WORKDIR /usr/src/app
ENV TZ=Europe/Stockholm
COPY package*.json tsconfig.json ./
RUN npm ci --omit=dev
COPY src ./src
COPY shared ./shared
COPY --from=build /usr/src/app/dist/web ./dist/web
EXPOSE 80 443
CMD ["npm", "start"]
```

- `.dockerignore` adds `dist`, `.superpowers` and `graft`.
- `.gitignore` adds `dist/` and `.superpowers/`.
- README deploy steps add `docker image prune -f` after `docker build`, since the classic builder leaves
  the build stage as an untagged image, and note that `/storage` is nearly full.

## Testing

Node's built-in runner via `tsx --test`, as today. No browser and no jsdom.

Moved with their modules, otherwise unchanged: `day`, `format`, `summary` tests (`summary` loses the
text assertions). Unchanged: auth, rate limit, session, config, TLS, bot-back client tests.

Rewritten, `app.day.test.ts` → `app.api.test.ts`, in-process via `app.request()`:

- `/api/positions` passes bot-back data through with `no-store`.
- `502` with `kind` and `since` when bot-back is unreachable or errors. `since` stays the same across
  consecutive failures and resets after a success.
- `400` on an invalid date. `401` JSON without a session.
- SPA page: with a session, contains the bundle names from the manifest and `no-store`. Without, redirects
  to `/login`.
- `/assets/*`: `immutable` header for a known file, `404` for an unknown one.
- Login and logout tests keep passing against the new login page.
- Startup with no manifest throws the "Web bundle not built" error.

New:

- `pollInterval`: 15 s for today, `false` for another day, `false` once the clock passes midnight.
- `hrefFor`: keeps `?date=` for `usesDate` pages and drops it otherwise. `/` resolves to the first page.
- Bottom bar split: up to 4 pages shown as is, more gives 3 plus "More".
- Components rendered with `react-dom/server` `renderToStaticMarkup`:
  - `Money` sign classes.
  - `SimValue` always renders ≈ and `SIM`.
  - `DataTable` puts the mobile label on every cell.
  - `StatusBadge` untracked label.
  - Positions page with fixture data: KPI values and rows. With an error and no data: the banner. With
    an error and data: banner, "showing data from" and dimmed content.
- Build: `build-web --outdir <temp>` produces a manifest whose files exist.

Manual checks:

1. `npm run dev` on the PC. Desktop width and phone width in DevTools. Today with polling, a past day,
   bot-back stopped and started, logout, an expired session.
2. On the Odroid: `docker build` succeeds, run with `tls: false` on the LAN, check from a real phone,
   then `docker image prune -f`.
3. Then the TLS rollout steps of the original spec (`2026-10-22-bot-front-design.md`), which have not
   been done on the box yet.

## Adding a page later

1. bot-back exposes a read-only endpoint.
2. `src/botback.ts` gets a typed client function, `shared/types.ts` the response type.
3. `src/app.ts` gets a `/api/<name>` proxy route with the same error shape.
4. `web/pages/<name>/` gets a hook and a page built from the component kit. Simulated numbers use
   `SimValue` and `Kpi variant="sim"`.
5. One entry in `web/pages.ts`.
