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
| `botBackUrl` | bot-back base URL, e.g. `http://bot-back:1234` |
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

## Build and run

```
docker build -t kimf/bot-front .

docker network create botnet                 # once
docker network connect botnet bot-back       # once, no recreate needed

docker run -d --name bot-front --network botnet --restart unless-stopped \
  -p 443:443 -p 80:80 -v /storage/bot-front:/config kimf/bot-front
```

Put `config.json` in `/storage/bot-front/`. The router must forward ports 80 and 443 to the box.

Local run without Docker: `CONFIG_PATH=./config.json npm start` with `tls: false` and e.g.
`httpPort: 8080`.

## Staging to production

1. Start with `acmeStaging: true`, `tls: true`, and the router forwarding 80 and 443. A staging
   certificate is issued (browsers will warn about it).
2. Stop the container and delete `/storage/bot-front/certs/`.
3. Set `acmeStaging: false` and start the container. A production certificate is issued.

## Tests

`npm test` and `npm run typecheck`.

## Vendored dependencies

- htmx 2.0.11, from https://unpkg.com/htmx.org@2.0.11/dist/htmx.min.js (static/htmx.min.js)
