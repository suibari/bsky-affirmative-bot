# Biorhythm server

## Daily top post

The good-night post and the bot-tan.com dashboard use the same daily top-post provider for date boundaries, candidate retrieval, and score comparison. The dashboard always compares both Bluesky and Nagi. Configure only the good-night post's candidate networks with:

```dotenv
GOOD_NIGHT_TOP_POST_SOURCE=combined
```

Accepted values are `bsky`, `nagi`, and `combined`. Missing or invalid values default to `combined`. `SCHEDULED_POST_TARGETS` controls where scheduled posts are published; it does not affect recommendation selection.

## Public WebSocket configuration

`/ws` is a public, read-only WebSocket endpoint. In production, configure its browser Origin allowlist explicitly:

```dotenv
BIORHYTHM_WS_ALLOWED_ORIGINS=https://suibari.com,https://bot-tan.com
```

If the site actually runs on `https://www.bot-tan.com`, add that Origin separately. Values must be exact Origins without a trailing slash or path.

Optional resource limits:

```dotenv
BIORHYTHM_WS_MAX_CONNECTIONS=500
BIORHYTHM_WS_MAX_CONNECTIONS_PER_IP=10
BIORHYTHM_WS_MAX_BUFFERED_BYTES=1048576
BIORHYTHM_WS_HEARTBEAT_INTERVAL_MS=30000
BIORHYTHM_WS_SNAPSHOT_TTL_MS=5000
```

`Origin` prevents ordinary cross-site browser embedding, but it is not authentication: non-browser clients can forge it. Put the hostname behind the Cloudflare proxy, add WAF and rate-limit rules for `/ws`, and prevent direct access to the origin server.

Only after direct origin access is blocked, enable Cloudflare's client IP header for per-IP limits:

```dotenv
BIORHYTHM_TRUST_CF_CONNECTING_IP=true
```

When a reverse proxy runs on the same machine, bind this process to loopback:

```dotenv
BIORHYTHM_SERVER_HOST=127.0.0.1
```

## Bot memory internal API

The RAG endpoints (`/memory/search` and `/memory/usages`) do not share the
public HTTP/WebSocket listener. They use a dedicated listener so the public
server can remain on loopback for Cloudflare Tunnel while only the memory API
is exposed to the private LAN.

Local development defaults:

```dotenv
BIORHYTHM_MEMORY_API_HOST=127.0.0.1
BIORHYTHM_MEMORY_API_PORT=3003
BIORHYTHM_INTERNAL_SECRET=replace-with-a-long-random-secret
```

For the production layout where the public listener is port `3200`, keep the
Cloudflare Tunnel target at `http://localhost:3200` and use a separate LAN-only
port, for example:

```dotenv
BIORHYTHM_SERVER_HOST=127.0.0.1
BIORHYTHM_SERVER_PORT=3200
BIORHYTHM_MEMORY_API_HOST=192.168.1.200
BIORHYTHM_MEMORY_API_PORT=3201
```

Allow TCP port `3201` only from the YouTube machine's fixed LAN address. The
Bearer secret remains required even on the private network. Do not add port
`3201` to Cloudflare Tunnel.
