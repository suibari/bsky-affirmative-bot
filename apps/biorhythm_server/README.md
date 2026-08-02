# Biorhythm server

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
