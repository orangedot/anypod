# Anypod Self-Hosting Guide

Welcome to self-hosting **anypod.org** (Anypod — AGPLv3 open-source PWA podcast player)!

This guide is for anyone who wants to run Anypod completely independently and privately on their own home server, NAS (e.g. Synology, Unraid, TrueNAS), VPS, or Raspberry Pi.

Everything runs 100% locally in Docker with a local SQLite database — no external cloud services required.

---

## 60-Second Quickstart

### 1. Clone the repository
```bash
git clone https://github.com/orangedot/anypod.git
cd anypod
```

### 2. Start the container
```bash
docker compose up -d
```

### 3. Open the app
Open **http://localhost:8788** (or your server's IP, e.g. `http://192.168.1.100:8788`) in your browser.

---

## Local Storage & Data Persistence

All Anypod data is stored in the mounted `./data` directory:

```
./data/
└── v3/
    └── d1/
        └── miniflare-D1DatabaseObject/
            └── 1d2c6f471d53ebbab1505a69a966ce3e563bc9428255f6f61ad83474526c0fe6.sqlite
```

- **SQLite database:** Stores all accounts, feeds, playback positions, sessions, and sync data.
- **Automatic initialization:** On first start, the database schema (`schema.sql`) is applied automatically.
- **Backups:** To back up everything, archive the `./data` folder:
  ```bash
  tar -czvf anypod-backup-$(date +%F).tar.gz ./data
  ```

---

## Configuration

Anypod supports configuration via **environment variables** (in `docker-compose.yml` or `.env`) as well as a **configuration file** (`config.yaml` or `config.json`).

### Configuration Variables

| Variable | Default | Description |
| :--- | :--- | :--- |
| `PORT` | `8788` | Port Anypod listens on inside the container |
| `APP_URL` | `http://localhost:8788` | External URL of your instance (e.g. `http://192.168.1.50:8788` or your domain) |
| `FROM_EMAIL` | `Anypod <login@anypod.local>` | Sender address for outgoing emails |
| `RESEND_API_KEY` | *(empty)* | Optional API key for [Resend](https://resend.com) to send real emails |
| `CRON_SECRET` | *(empty)* | Optional token to protect the cleanup endpoint (`/api/cron/cleanup`) |

---

### Option A: Environment Variables (`docker-compose.yml` or `.env`)

Copy `.env.example` to `.env` and adjust the values:

```bash
cp .env.example .env
```

Example `.env`:
```env
PORT=8788
APP_URL=http://192.168.1.50:8788
FROM_EMAIL="My Podcast Player <anypod@home.arpa>"
RESEND_API_KEY=
CRON_SECRET=super_secret_cron_key_123
```

---

### Option B: Configuration File (`config.yaml` or `config.json`)

If you prefer a central config file, Anypod automatically reads `config.yaml` or `config.json` from your `./data` directory (`./data/config.yaml`):

```yaml
# ./data/config.yaml
PORT: 8788
APP_URL: "http://192.168.1.50:8788"
FROM_EMAIL: "Anypod <login@anypod.local>"
RESEND_API_KEY: ""
CRON_SECRET: "super_secret_cron_key_123"
```

Or as JSON (`./data/config.json`):
```json
{
  "PORT": 8788,
  "APP_URL": "http://192.168.1.50:8788",
  "FROM_EMAIL": "Anypod <login@anypod.local>",
  "RESEND_API_KEY": "",
  "CRON_SECRET": "super_secret_cron_key_123"
}
```

---

## Offline Login & Magic Links

Anypod uses passwordless magic-link authentication. You do **not** need to configure an email provider to use it locally:

1. When **`RESEND_API_KEY` is empty**, Anypod runs in **offline auth mode**.
2. Enter your email in the sign-in dialog.
3. The magic login link is:
   - **Displayed directly in the browser dialog as a clickable button**
   - **Printed to the Docker logs** (`docker compose logs -f anypod`)
4. One click signs you in and syncs your feeds and playback state to your local server.

*Tip for real emails:* If you want actual emails delivered, add a free API key from [resend.com](https://resend.com) (3,000 emails/month free) to `RESEND_API_KEY`.

---

## Production Bundler

Anypod includes a built-in bundler using `scripts/build.js` that minifies and bundles HTML, CSS, and JavaScript into `public/dist/`.

When building the Docker image, the production build runs automatically (`npm run build`) and serves directly from `public/dist/`.

To run the bundler manually outside Docker:
```bash
npm run build
```

---

## Reverse Proxy (Nginx / Caddy / Traefik)

When running Anypod behind a reverse proxy with TLS (HTTPS):

### Caddy
```caddy
anypod.yourdomain.com {
    reverse_proxy localhost:8788
}
```

### Nginx
```nginx
server {
    listen 443 ssl http2;
    server_name anypod.yourdomain.com;

    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    location / {
        proxy_pass http://127.0.0.1:8788;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

### jwilder/nginx-proxy & acme-companion (Automatic Let's Encrypt SSL)
For setups using `jwilder/nginx-proxy`, a compose override (`docker-compose.jwilder.yml`) is included:

```bash
# Start with automatic SSL certificate via jwilder:
VIRTUAL_HOST=podcasts.yourdomain.com \
LETSENCRYPT_HOST=podcasts.yourdomain.com \
LETSENCRYPT_EMAIL=you@yourdomain.com \
docker compose -f docker-compose.yml -f docker-compose.jwilder.yml up -d
```
*(Assumes `jwilder/nginx-proxy` is running on the `nginx-proxy` Docker network.)*

---

## Architecture: Why SQLite instead of MariaDB?

A common sysadmin question: *"Why not a separate MariaDB / MySQL container?"*

1. **Cloudflare D1 compatibility:** Anypod uses the Cloudflare D1 API (`db.prepare(...)`). D1 *is* SQLite at the edge. Using SQLite in Docker lets the exact same codebase run locally and in the cloud with zero ORM/abstraction overhead.
2. **0 MB idle RAM:** MariaDB uses 150–300 MB RAM idle and requires a separate network socket. SQLite runs in-process with zero extra RAM overhead and no network latency.
3. **Resilience:** No separate database container to crash or time out.
4. **One-file backup:** The entire database lives in `./data/`. No `mysqldump` or container stop required.

---

## Storage Management & Caching

### 1. Offline Audio & Cover Cache (Client PWA)
Anypod includes a Service Worker with **HTTP `206` Range-request support**:
- Click **Download** on an episode to cache the audio and cover art locally on your phone or laptop.
- Listen offline from the **Downloads** tab.
- Free up space anytime via **Clear Download** or in Settings.

### 2. Server-Side Episode Archiving & Auto-Pruning (Planned)
For self-hosters who want to mirror feeds server-side:
- Many podcast feeds have 500+ episodes (50+ GB per show). Unbounded mirroring would fill most disks.
- **Planned storage management:** Daily cron fetch of new episodes, caching only the latest *N* episodes (e.g. last 3 episodes or last 14 days), and auto-pruning older MP3s while preserving playback state in SQLite.

---

## Automatic Inactivity Cleanup ("Cleaner Monday")

Anypod minimizes stored data and keeps your local database clean:
- Accounts inactive for **60 days** receive a first warning email with a one-click keep/export link.
- After **80 days**, a final reminder is sent.
- After **90 days**, inactive accounts and all associated sync data are permanently deleted.
- Settings also includes a **"delete account & wipe cloud data"** button for immediate removal.

You can trigger the cleanup weekly via a host cron job:

```bash
# Run every Monday at 04:00 AM:
0 4 * * 1 curl -s "http://localhost:8788/api/cron/cleanup?run=true&secret=YOUR_CRON_SECRET" > /dev/null
```

---

## Updating

To update your local Anypod instance:

```bash
git pull
docker compose build --no-cache
docker compose up -d
```
Your SQLite database and configuration in `./data` are preserved across updates.
