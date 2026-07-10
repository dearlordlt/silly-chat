# Deploying silly-chat on a VPS

Target: a small box (8 GB RAM, no GPU, ~50 GB disk) with a public domain.
Chat/vision/coding run on Ollama Cloud; embeddings run in a tiny local CPU
container (Ollama Cloud serves no embedding models).

## 0. Prerequisites

- Docker + compose plugin installed, and enabled at boot: `systemctl enable docker`
- DNS: an A/AAAA record for your domain pointing at the VPS
- Firewall: allow 22, 80, 443 (e.g. `ufw allow 22,80,443/tcp && ufw enable`).
  Port 8080 stays reachable on the Tailscale interface if you allow it there.

## 1. Get the code

```sh
git clone https://github.com/dearlordlt/silly-chat.git && cd silly-chat
cp .env.example .env
```

## 2. Fill .env

```env
OLLAMA_API_KEY=<your key from ollama.com/settings/keys>
OLLAMA__BASE_URL=https://ollama.com/v1
OLLAMA__EMBED_BASE_URL=http://ollama:11434/v1
DOMAIN=chat.example.com
AUTH__COOKIE_SECURE=true
```

`SESSION_SECRET` is generated automatically on first `./start.sh` if missing.

## 3. Start

```sh
./start.sh
```

That's it. start.sh reads .env, enables the `public` (Caddy/HTTPS) and `embed`
(CPU embeddings) services, builds, starts, and pulls the embedding model into
its volume. First HTTPS certificate takes ~30 s.

Open `https://your-domain` — the **first registered account becomes the admin**,
so register yourself immediately after deploying.

## 4. After deploy

- **Models**: Admin → Models. Cloud names have no `:cloud` suffix here
  (config defaults are already cloud-ready: deepseek-v4-pro / deepseek-v4-flash /
  gemma4:31b vision / glm-5.2 coder / nomic-embed-text:v1.5 embeddings).
- **Updates**: `git pull && ./start.sh`. Accounts/chats/uploads live in the
  `silly-data` volume and survive.
- **Backups**: `./backup.sh` makes a consistent snapshot into `backups/`
  (keeps 14). Cron it: `0 4 * * * cd /path/to/silly-chat && ./backup.sh`
  Restore = untar into the volume (stop the stack first).
- **Logs**: `./logs.sh [service]` — rotation is capped (10 MB × 3 per service).

## Sizing notes (8 GB box)

Steady state ≈ 2 GB: backend + nginx + searxng + Caddy + the embed appliance
(the embedding model is ~300 MB, kept resident, capped at 2 CPUs). Upload
storage is capped at 5 GB globally (`config.toml [limits]`), originals of
documents are purged after a day, images are recompressed on ingest.

## Port 8080 & existing reverse proxies

The frontend binds to **127.0.0.1:8080 only** (docker's iptables bypass ufw, so a
0.0.0.0 bind would expose plain HTTP to the internet regardless of your firewall).

- **Box already runs nginx/apache on 80/443?** Leave `DOMAIN` unset (Caddy stays
  off) and add your own vhost + cert proxying to `127.0.0.1:8080`.
- **Tailscale-only, no domain?** Set `HTTP_BIND=0.0.0.0` in `.env` (and firewall
  8080 on the public interface), don't set `AUTH__COOKIE_SECURE`, and reach the
  app over your tailnet on :8080.
