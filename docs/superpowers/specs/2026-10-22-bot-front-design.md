# bot-front: read-only web view of the bot's positions

Date: 2026-10-22
Status: Draft, awaiting review

## Goal

Replace watching console logs with a website that shows what the bot did on a given day: which positions
were taken, which closed and with what result, and which are still open with their current result.

Example of success: open the page and see "4 positions taken · 2 closed +312 kr · 2 open +104 kr", with
one row per position.

### Decided

- Read-only. No orders, deletes or other actions from the site.
- The main view is positions for a day: today by default, other days via a date picker.
- Reachable from the public internet through a port forward on the home router to the domain.
- bot-back is not exposed. A separate service, bot-front, is the only thing reachable from outside and
  calls bot-back on the internal Docker network.
- Login with a single password.
- Server-rendered pages (Hono + JSX + htmx). A move to React may happen later (see "Moving to React later").
- No Caddy or other reverse proxy: bot-front handles HTTPS and Let's Encrypt itself.
- Runs with `tsx`, as bot-back does.

### Out of scope (for now)

- Log viewer, telegram feed, recs and the reasons recs were dropped, multi-day P&L history, health page.
- Any write action, including the existing bot-back write endpoints.
- Reloading positions into bot-back's memory on startup (`loadPositions` stays commented out).
- Any change to trading behaviour. bot-back only gains persistence of what it already holds, a price
  cache, and read endpoints.
- More than one user.

## Repositories and documents

| Repository | Location | Contains |
|---|---|---|
| bot-back (existing) | `C:\Users\Kim\Documents\GitHub\bot-back` | Part 1 changes and the `/view` API |
| bot-front (new) | `C:\Users\Kim\Documents\GitHub\bot-front` | Everything in Part 2 |

- This spec was split from bot-back when bot-front was created. This copy keeps Goal, Environment
  constraints, Architecture, Interface contract, Part 2, and the bot-front rows of Error handling,
  Testing and Rollout.
- The other half (Part 1 and the bot-back rows of Error handling and Testing) lives in the bot-back
  repository, at `docs/superpowers/specs/2026-10-22-bot-front-design.md`.
- The Interface contract section is copied word for word to both. A change to the contract is made in
  both files in the same piece of work.

## Environment constraints

- The host is a CoreELEC box with Docker 19.03.15, 32-bit ARM userspace, and no Docker Compose.
  Containers are started with plain `docker run`.
- Docker 19.03 builds without BuildKit by default, so Dockerfiles use only classic syntax.
- Persistent data lives under `/storage`.
- Docker before 20.10 can fail on newer Alpine images on 32-bit ARM ("Operation not permitted").
  bot-back's `node:22-alpine` image is the reference: bot-front uses the same base image. This is
  verified on the box before TLS work starts.

## Architecture

```
internet ──443/80──▶ [bot-front]  ──http (botnet only)──▶ [bot-back :1234]
                     HTTPS + certs,                       existing bot, plus
                     login, pages                         read-only /view API
```

- Two containers on a user-defined Docker network `botnet`, so they reach each other by name.
- bot-back keeps publishing 1234 on the LAN as today. The router does not forward 1234.
- bot-front publishes 80 and 443. The router forwards both to the box. Port 80 serves only ACME
  challenges and an https redirect.

Deployment:

```
docker network create botnet                 # once
docker network connect botnet bot-back       # once, no recreate needed

docker run -d --name bot-front --network botnet --restart unless-stopped \
  -p 443:443 -p 80:80 -v /storage/bot-front:/config kimf/bot-front
```

## Interface contract: `GET /view/positions`

The only interface between bot-front and bot-back. GET only, served by bot-back on port 1234.

Request: `GET /view/positions?date=YYYY-MM-DD`

- `date` defaults to today. A day is a calendar day in `Europe/Stockholm`, computed explicitly with that
  time zone (not from the process `TZ`), so days with daylight-saving changes are 23 or 25 hours long.
- Invalid `date` → `400 {"error": "invalid date"}`.
- Query failure → `500 {"error": "<message>"}`.

Response `200`:

```jsonc
{
  "date": "2026-10-22",
  "positions": [{
    "id": "…",
    "stockId": "5471",
    "stockName": "Getinge",
    "state": "BoughtAll",          // raw State value
    "status": "open",              // derived, see table
    "untracked": false,            // see below
    "created": "2026-10-22T08:58:03.120Z",
    "lastUpdated": "2026-10-22T09:01:12.004Z",
    "targetAmount": 40,
    "bought": 40,
    "sold": 0,
    "orderCount": 1,
    "avgBuyPrice": 251.5,          // boughtValue / bought, null if bought = 0
    "avgSellPrice": null,          // soldValue / sold, null if sold = 0
    "lastPrice": 254.1,            // null unless status is open, tracked, and the cached quote has lastPrice > 0 and quote time >= created
    "lastPriceTime": "2026-10-22T09:41:57.000Z",  // the quote's own time; null when lastPrice is null
    "result": 104.0,               // kr, null if it can't be computed
    "resultPercent": 1.03          // of boughtValue, null if result is null or boughtValue = 0
  }]
}
```

`status` (from `open = position.open()`, `bought`, `orderCount`):

| status | condition | meaning |
|---|---|---|
| `noOrder` | open, `bought = 0`, `orderCount = 0` | Position created but no order recorded: placement failed, or is in progress for the second it takes |
| `pending` | open, `bought = 0`, `orderCount > 0` | Buy order placed, nothing filled yet |
| `open` | open, `bought > 0` | Holding shares, fully or partly filled, possibly partly sold |
| `closed` | not open, `bought > 0` | All bought shares sold |
| `notFilled` | not open, `bought = 0` | Buy order expired unfilled: `setTargetToBought()` set target to 0, which moves the state to `FullCycleClosed`. `EmptyClosed` is never set in the current code |

`untracked` is true when the position is open (`noOrder`, `pending` or `open`) but is no longer in
`PositionService.positions`. That happens after the 17:36 strategy cleanup (which removes all
positions, open ones included) or after a restart. It means "the bot no longer follows this position",
with no claim about why. Untracked positions have `lastPrice` and `result` null.

Result formula:

```
held   = bought − sold
result = soldValue + held × lastPrice − boughtValue
```

- `closed`: `held = 0`, so this is the realized result, equal to `StrategyPosition.result()`.
- `lastPrice` is null unless the status is `open`, the position is tracked, and the cached quote has
  `lastPrice` > 0 and is not older than the position (quote time >= `created`). `lastPriceTime` is null
  whenever `lastPrice` is null.
- `open` and tracked with such a quote: the result marked to `lastPrice`.
- `open` without such a quote (no quote cached, a quote older than the position, or e.g. partly
  filled: quotes are subscribed only from `BoughtAll`) or untracked: `null`.
- `noOrder`, `pending`, `notFilled`: `null`.
- Values are rounded to 2 decimals.

## Part 2: bot-front

TypeScript, run with `tsx`. Runtime dependencies: `hono`, `@hono/node-server`, `acme-client`. htmx 2
is vendored as a static file. Passwords use Node's `crypto.scrypt`. No native modules.

### 2.1 Modules

| File | Responsibility |
|---|---|
| `src/server.ts` | Startup: load config, make sure a certificate exists, start the port-80 and port-443 servers |
| `src/config.ts` | Read and validate `/config/config.json`. On a missing or invalid field, exit with a message naming it |
| `src/tls/acme.ts` | Request and renew the certificate with acme-client, store it under `/config/certs/`, and expose `shouldRenew(notBefore, notAfter, now)` |
| `src/tls/http.ts` | Port-80 app: `/.well-known/acme-challenge/:token` and a 301 to https for everything else |
| `src/auth.ts` | Password verification, session cookie, login rate limit, `requireLogin` middleware |
| `src/botback.ts` | Typed client for `GET /view/positions`, 3 s timeout, returns data or a typed error |
| `src/summary.ts` | Pure function from the positions list to the summary numbers (2.5) |
| `src/app.ts` | Hono app: routes, security headers, wiring. Exported for in-process tests |
| `src/views/` | `Layout`, `LoginPage`, `DayPage`, `PositionsPanel` (summary + table, or error) as Hono JSX |
| `static/` | `htmx.min.js` (pinned 2.x version), `style.css` |
| `scripts/hash-password.ts` | `npm run hash-password` prompts for a password and prints the hash to paste into config |

### 2.2 Config (`/config/config.json`)

```jsonc
{
  "domain": "bot.example.se",
  "acmeEmail": "you@example.se",
  "acmeStaging": true,                 // Let's Encrypt staging while testing
  "tls": true,                         // false: plain HTTP on httpPort only, for LAN testing
  "httpPort": 80,
  "httpsPort": 443,
  "botBackUrl": "http://bot-back:1234",
  "passwordHash": "scrypt$<salt-b64>$<hash-b64>",
  "sessionSecret": "<at least 32 random bytes, base64>"
}
```

### 2.3 TLS and certificates

- **First startup without a certificate:** if `/config/certs/` lacks a valid certificate for `domain`,
  bot-front requests one using HTTP-01. Until one exists, only the port-80 server runs and nothing
  listens on 443.
- **Storage:** the Let's Encrypt account key, certificate and private key are stored in `/config/certs/`,
  so restarts reuse them.
- **Renewal:** every 12 h, if `shouldRenew` is true (two-thirds of the lifetime has passed, based on the
  certificate's own dates), renew and hot-swap with `server.setSecureContext()`. No restart.
- **Renewal failure:** keep serving the current certificate and retry at the next 12 h check. From 7 days
  before expiry, log an error once a day saying when it expires. If it expires anyway, bot-front keeps
  serving it and keeps retrying. Browsers will refuse the site (HSTS allows no click-through), so the
  daily error log is the warning.
- `acmeStaging: true` uses the staging directory URL.
- `tls: false` skips all of this and serves the app over HTTP on `httpPort`.

### 2.4 Routes

| Route | Auth | Purpose |
|---|---|---|
| `GET /login` | no | Login form |
| `POST /login` | no | Verify the password, set the cookie, redirect to `/` |
| `POST /logout` | yes | Clear the cookie, redirect to `/login` |
| `GET /?date=YYYY-MM-DD` | yes | Full day page, today if no date. Invalid date → redirect to `/` |
| `GET /partials/positions?date=…` | yes | The positions panel only, for htmx |
| `GET /static/*` | no | htmx and CSS |

- An unauthenticated normal request to a protected route gets a redirect to `/login`.
- An unauthenticated htmx request (`HX-Request: true`) gets `200` with an `HX-Redirect: /login` header.
- `/partials/positions` **always answers `200`**, including when bot-back fails. htmx 2 does not swap
  4xx/5xx responses by default, so an error status would leave the old panel and hide the failure.

### 2.5 Day page

Header (rendered once per page load):

- ◀ previous day, a date input, ▶ next day, a "Today" link, a logout button.
- Navigation uses plain links and a GET form, so it works without JS. ▶ is disabled when the date is today.

Positions panel (a single element, replaced as a whole on refresh):

- **Polling:** when the panel's date is today (Stockholm), the panel element carries
  `hx-get="/partials/positions?date=<date>" hx-trigger="every 15s" hx-swap="outerHTML"`. Every panel
  variant, including the error panel, carries these attributes when the date is today, so polling
  continues through errors and recovers by itself. When a poll comes in for a date that is no longer
  today (midnight has passed), the returned panel has no polling attributes, so polling stops and the day
  stays on screen.
- **Summary**, computed by `summary.ts`:
  - "Positions taken" counts positions with `bought > 0` (`open` and `closed`, untracked included).
  - Line 1: `4 positions taken · 2 closed +312 kr · 2 open +104 kr · total +416 kr`.
  - Sums include only known (non-null) results. If any `open` position has a null result, the open part
    and the total say so: `2 open +104 kr (1 unpriced) · total +416 kr (1 unpriced)`.
  - Line 2, shown only when non-zero: `Attempts: 1 pending · 1 not filled · 1 no order`.
  - "Updated HH:MM:SS" (bot-front's render time).
- **Table**, one row per position, in order of `created`: stock, status, volume (`bought/targetAmount`),
  average buy, average sell or last price, result in kr and %.
  - A last price is always shown with its time: `254,10 · 10:41`. If it is older than 2 minutes, it is
    greyed out.
  - Results in green or red. Null results show "–", and an open position without a price shows "unpriced".
  - Untracked rows are greyed out with an "untracked" label.
  - Numbers use Swedish formatting (`1 234,50`).
- **Error panel:** when bot-back is unreachable, times out or returns non-200, the panel shows a red
  banner ("Bot unreachable since HH:MM" or "Bot error: <message>") instead of the summary and table.
  "Since" is the time of the first failure in the current run of failures, kept in bot-front's memory.
- Below ~600 px, rows render as compact cards.

### 2.6 Authentication

- `passwordHash` is `scrypt$salt$hash`. Verification uses `crypto.scrypt` and `timingSafeEqual`.
- Session: a stateless signed cookie (Hono `setSignedCookie`, HMAC with `sessionSecret`) holding only
  an expiry 30 days out. Attributes: `HttpOnly; Secure; SameSite=Strict; Path=/`. `Secure` is
  omitted when `tls: false`.
- Logout clears the cookie. Changing `sessionSecret` logs out every device.
- Rate limit, in memory, per client IP (socket remote address; there is no proxy): after 5 failures in
  15 minutes the IP is locked out for 15 minutes, and each failure is answered after a 1 s delay.
  The clock is injectable for tests.
- Failed logins are logged with IP. The password is never logged.
- No CSRF tokens: the only POST routes are login and logout, both covered by `SameSite=Strict`.

### 2.7 Security headers (all responses on 443)

`Strict-Transport-Security: max-age=31536000`, `Content-Security-Policy: default-src 'self'` (no inline
scripts or styles), `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`.

### 2.8 Container

- `FROM node:22-alpine` (same as bot-back), `npm install`, copy `src`, `static`, `tsconfig.json`,
  `CMD ["npm", "start"]` with `start` = `tsx src/server.ts`.
- `EXPOSE 80 443`. Config and certificates come from the `/config` volume.
- Logs go to stdout (`docker logs bot-front`).

## Error handling

| Where | Situation | Behaviour |
|---|---|---|
| bot-front | Invalid or missing config | Exit at startup with a message naming the field |
| bot-front | Certificate request fails at first startup | Port 80 keeps running. Retry after 1 min, 5 min, 30 min, then every 6 h. Never crash-loop (to avoid Let's Encrypt rate limits) |
| bot-front | Renewal fails | See 2.3: keep serving, retry every 12 h, daily error log from 7 days before expiry |
| bot-front | bot-back unreachable, timeout or non-200 | `200` error panel with polling kept (2.5) |
| bot-front | Bad `date` | Full page: redirect to `/`. Partial: `200` error panel "Invalid date" without polling attributes |

## Testing

Both repositories use Node's built-in test runner through `tsx --test`. No Jest.

bot-front:

- Password hash and verify: correct password, wrong password, malformed hash.
- Session cookie: valid, expired, tampered with.
- Rate limiter: locks after 5 failures, unlocks after 15 minutes (injected clock).
- `shouldRenew` at different points of a certificate's lifetime. The expiry-warning rule (from 7 days left).
- `summary.ts`: positions taken excludes attempts; unpriced open positions are counted and flagged; the
  attempts line appears only when non-zero.
- `botback.ts` against a local fake server: 200, 500, timeout.
- Routes in-process via `app.request()`:
  - Without a session: redirect to `/login`, and `200` + `HX-Redirect` for htmx requests.
  - Login success and failure.
  - The day page renders the summary and rows.
  - `/partials/positions` returns `200` with the error panel when bot-back fails, and that panel keeps
    the polling attributes for today.
  - Polling attributes are present only for today, and absent when the requested date has become
    yesterday (injected clock).

Manual checks:

1. bot-front with `tls: false` on the LAN.
2. On the box: bot-front's image starts on Docker 19.03; ports 80 and 443 are free.
3. `acmeStaging: true` with the router forwarding 80 and 443: a staging certificate is issued.
4. `acmeStaging: false`: a production certificate. Delete the staging certificates first.

## Rollout order

1. bot-back: snapshot persistence, price cache, `/view`. Deploy and check with `curl` on the LAN.
2. Create the bot-front repository and split this spec (see "Repositories and documents").
3. bot-front on the LAN with `tls: false`.
4. Verify the box: image runs on Docker 19.03, ports 80/443 free.
5. TLS against Let's Encrypt staging.
6. Router forwards for 80 and 443, then production certificates.

## Moving to React later

The contract that matters is bot-back's `/view` JSON API. In bot-front, `auth.ts`, `botback.ts`,
`summary.ts`, `config.ts` and `tls/` don't depend on how pages are rendered. Moving to React means
replacing `src/views/` and the page routes with a JSON route (e.g. `/api/positions`) plus serving a built
SPA. Session, TLS, summary and the bot-back client stay as they are.
