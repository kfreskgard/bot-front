# bot-front

Read-only web view of the trading bot's positions. It logs you in with a single password, then shows
a day's positions and a summary, refreshed every 15 s for today. It talks only to bot-back's
read-only `GET /view/positions`, and handles HTTPS and Let's Encrypt certificates itself (no reverse
proxy).

## Config

bot-front reads `/config/config.json` (override the path with the `CONFIG_PATH` environment variable).
See `config.example.json`.

| Field | Meaning |
|---|---|
| `domain` | Public host name the certificate is issued for |
| `acmeEmail` | Contact e-mail for Let's Encrypt |
| `acmeStaging` | `true` uses the Let's Encrypt staging directory |
| `tls` | `false` serves plain HTTP on `httpPort` only, for LAN testing |
| `httpPort` | HTTP port. With TLS it serves ACME challenges and the https redirect |
| `httpsPort` | HTTPS port |
| `botBackUrl` | bot-back base URL, e.g. `http://192.168.68.67:1234` (the box's LAN address and bot-back's published port) |
| `passwordHash` | `scrypt$<salt>$<hash>`, from `npm run hash-password` |
| `sessionSecret` | Base64, at least 32 random bytes |

With `tls: true`, certificates are kept in `/config/certs/` (override with `CERT_DIR`).

### Password hash

```
npm run hash-password
```

Run this from a checkout of the repository (the Docker image does not contain `scripts/`). Type the password at the prompt and paste the printed line into `passwordHash`.

### Session secret

```
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

## Development

The server is Hono; the pages are a React single-page app built with esbuild into `dist/web/`.

```
npm run fake-botback        # fake bot-back on :1234
CONFIG_PATH=./config.json npm run dev
```

Use a `config.json` with `tls: false`, `httpPort: 8080` and `botBackUrl: http://localhost:1234`.
`npm run dev` rebuilds the bundle and restarts the server on every edit; reload the page (F5) to pick
it up. Switch the fake's response with `curl localhost:1234/_mode/<mode>`, where mode is `good`,
`empty`, `malformed` or `error`. Stop the fake to see bot-back unreachable.

Without watching: `npm run build:web`, then `CONFIG_PATH=./config.json npm start`.

## Build and run

The image builds the web bundle in a first stage and copies only `dist/web` into the final image.

1. Before building, check `df -h /storage`. Build only with at least 1 GB free: the build stage needs
   the full `node_modules` (React, esbuild, TypeScript) and the new image is built next to the
   previous one.
2. After building, run `docker image prune -f`. It removes only dangling images (the previous
   `kimf/bot-front` after re-tagging, and the build stage), not other unused images.
3. If space is short, `docker images` and `docker ps -a` show what exists. Remove unused images by name
   with `docker rmi <image>`. `docker image prune -a` also removes base images other projects build
   from, so it is not part of the routine.
4. To update Node, the base image is pinned by digest in the Dockerfile's `ARG NODE_IMAGE`. Pull the
   newer `node:22-alpine` on the box, check that it starts (`docker run --rm <new digest> node -v`),
   and replace the digest.

The clone lives in `/storage/bot-front`. Config and certificates live outside it, in
`/storage/bot-front-config/` (mounted as `/config`), so `git pull` or a fresh clone never touches them.
bot-front reaches bot-back through bot-back's published port on the box's LAN address, so the two
containers need no shared Docker network.

`./run` starts the container (`./run lan` for the LAN check below). To redeploy, `/storage/front.sh`
(next to bot-back's `clear.sh`) does the whole cycle:

```
#!/bin/bash
# Redeploys bot-front. `./front.sh lan` runs it on 8081 for the LAN check.
set -e
cd /storage
free_kb=$(df -k /storage | awk 'NR==2 {print $4}')
if [ "$free_kb" -lt 1048576 ]; then
  echo "Less than 1 GB free on /storage, not building. See bot-front's README." >&2
  exit 1
fi
docker stop bot-front 2>/dev/null || true
docker rm bot-front 2>/dev/null || true
cd bot-front
git pull
docker build -t kimf/bot-front .
docker image prune -f
./run "$@"
docker logs -f bot-front
```

The router must forward ports 80 and 443 to the box.

The domain must not have an AAAA record unless IPv6 is also forwarded to the box; Let's Encrypt
prefers IPv6 when it exists and the challenge would fail.

### Checking the LAN on the box first

Before opening the router, try it on the LAN: set `"tls": false` in `config.json` and run
`./front.sh lan`, then browse to `http://<box>:8081`. Set `tls` to `true`, add `domain` and
`acmeEmail`, and run `./front.sh` afterwards.

### Rollout check: client IPs

The login rate limit is per client IP. After rollout, fail a login from outside the LAN and check
that the container log shows `[bot-front] Failed login from <ip>` with the real external address. If
docker-proxy hides the source address (every line shows the same internal IP), all clients share a
single limiter bucket and five failed logins from anyone lock everyone out.

## Staging to production

1. Start with `acmeStaging: true`, `tls: true`, and the router forwarding 80 and 443. A staging
   certificate is issued (browsers will warn about it).
2. Stop the container and delete `/storage/bot-front-config/certs/`.
3. Set `acmeStaging: false` and start the container. A production certificate is issued.

## Tests

`npm test` and `npm run typecheck`.
