# 🐳 Anypod Self-Hosting Guide

Willkommen beim Self-Hosting von **Anypod**! 😊

Dieser Guide ist für alle gedacht, die Anypod komplett unabhängig und privat auf dem eigenen Heimserver, NAS (z. B. Synology, Unraid, TrueNAS) oder Raspberry Pi betreiben möchten.

Alles läuft zu 100 % lokal in Docker mit lokaler SQLite-Datenbank – ohne Zwang zu externen Cloud-Diensten.

---

## ⚡ Schnellstart in 60 Sekunden

### 1. Repository klonen
```bash
git clone https://github.com/orangedot/anypod.git
cd anypod
```

### 2. Container starten
```bash
docker compose up -d
```

### 3. Loslegen!
Öffne einfach **http://localhost:8788** (oder die IP deines Servers, z. B. `http://192.168.1.100:8788`) im Browser! 🎉

---

## 💾 Lokaler Speicher & Datenpersistenz

Alle Daten von Anypod werden im gemounteten Verzeichnis `./data` gespeichert:

```
./data/
└── v3/
    └── d1/
        └── miniflare-D1DatabaseObject/
            └── 1d2c6f471d53ebbab1505a69a966ce3e563bc9428255f6f61ad83474526c0fe6.sqlite
```

- **SQLite Datenbank**: Speichert alle Accounts, Feeds, Playback-Positionen, Sitzungen und Sync-Daten.
- **Automatische Initialisierung**: Beim ersten Start wird das Datenbankschema (`schema.sql`) vollautomatisch aufgesetzt.
- **Backups**: Für ein komplettes Backup musst du einfach nur den Ordner `./data` sichern:
  ```bash
  tar -czvf anypod-backup-$(date +%F).tar.gz ./data
  ```

---

## ⚙️ Konfiguration

Anypod unterstützt Konfiguration sowohl über **Environment-Variablen** (in `docker-compose.yml` oder `.env`) als auch über eine **Konfigurationsdatei** (`config.yaml` oder `config.json`).

### Konfigurations-Variablen

| Variable | Standardwert | Beschreibung |
| :--- | :--- | :--- |
| `PORT` | `8788` | Port, auf dem Anypod im Container lauscht |
| `APP_URL` | `http://localhost:8788` | Externe URL deiner Instanz (z. B. `http://192.168.1.50:8788` oder deine Domain) |
| `FROM_EMAIL` | `Anypod <login@anypod.local>` | Absenderadresse für E-Mails |
| `RESEND_API_KEY` | *(leer)* | Optionaler API-Key für [Resend](https://resend.com) zum E-Mail-Versand |
| `CRON_SECRET` | *(leer)* | Optionaler Token zum Absichern des Cleanup-Endpunkts (`/api/cron/cleanup`) |

---

### Methode A: Über Environment-Variablen (`docker-compose.yml` oder `.env`)

Kopiere `.env.example` nach `.env` und passe die Werte nach deinen Wünschen an:

```bash
cp .env.example .env
```

Beispiel `.env`:
```env
PORT=8788
APP_URL=http://192.168.1.50:8788
FROM_EMAIL="Mein Podcast Player <anypod@home.arpa>"
RESEND_API_KEY=
CRON_SECRET=super_geheimer_cron_schluessel_123
```

---

### Methode B: Über Konfigurationsdatei (`config.yaml` oder `config.json`)

Wenn du lieber eine zentrale Konfigurationsdatei nutzt: Anypod liest automatisch eine `config.yaml` oder `config.json` ein!

Lege sie einfach direkt in deinen `./data`-Ordner (`./data/config.yaml`):

```yaml
# ./data/config.yaml
PORT: 8788
APP_URL: "http://192.168.1.50:8788"
FROM_EMAIL: "Anypod <login@anypod.local>"
RESEND_API_KEY: ""
CRON_SECRET: "super_geheimer_cron_schluessel_123"
```

Alternativ als JSON (`./data/config.json`):
```json
{
  "PORT": 8788,
  "APP_URL": "http://192.168.1.50:8788",
  "FROM_EMAIL": "Anypod <login@anypod.local>",
  "RESEND_API_KEY": "",
  "CRON_SECRET": "super_geheimer_cron_schluessel_123"
}
```

---

## 🔑 Offline-Login & Magic Links

Anypod nutzt passwortloses Magic-Link-Login. Du musst dafür **keinen E-Mail-Dienst einrichten**:

1. Wenn **`RESEND_API_KEY` leer** ist, läuft Anypod im **Offline-Modus**.
2. Gib deine E-Mail im Login-Dialog ein.
3. Der Magic-Login-Link wird:
   - **Direkt im Browser-Dialog als klickbarer Button angezeigt** 🪄
   - **In den Docker-Logs ausgegeben** (`docker compose logs -f anypod`)
4. Ein Klick genügt, und du bist eingeloggt und deine Feeds & Hörstände synchronisieren sich lokal auf deinem Server!

*Tipp für echte E-Mails:* Falls du echte E-Mails an dich selbst senden willst, hole dir einfach einen kostenlosen API-Key bei [resend.com](https://resend.com) (3.000 Mails/Monat gratis) und trage ihn bei `RESEND_API_KEY` ein.

---

## 📦 Production Bundler

Anypod enthält einen integrierten Bundler mit `esbuild`, der HTML, CSS und modernstes JavaScript für maximale Performance minifiziert:

- **JS**: 190 KB → 102 KB (`public/dist/app.min.js`)
- **CSS**: 64 KB → 51 KB (`public/dist/style.min.css`)

Beim Bauen des Docker-Images wird der Production-Build automatisch ausgeführt (`npm run build`) und direkt aus `public/dist/` ausgeliefert.

Möchtest du lokal außerhalb von Docker den Bundler manuell ausführen:
```bash
npm run build
```

---

## 🔒 Reverse Proxy (Nginx / Caddy / Traefik)

Wenn du Anypod hinter einem Reverse Proxy mit SSL (HTTPS) betreibst:

### Caddy
```caddy
anypod.deinedomain.de {
    reverse_proxy localhost:8788
}
```

### Nginx
```nginx
server {
    listen 443 ssl http2;
    server_name anypod.deinedomain.de;

    ssl_certificate /pfad/zu/cert.pem;
    ssl_certificate_key /pfad/zu/key.pem;

    location / {
        proxy_pass http://127.0.0.1:8788;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

### jwilder/nginx-proxy & acme-companion (Automatisches Let's Encrypt SSL)
Für Setups mit `jwilder/nginx-proxy` liegt direkt eine fertige Compose-Erweiterung (`docker-compose.jwilder.yml`) bei:

```bash
# Start mit automatischem SSL-Zertifikat via jwilder:
VIRTUAL_HOST=podcasts.deinedomain.de \
LETSENCRYPT_HOST=podcasts.deinedomain.de \
LETSENCRYPT_EMAIL=deine@email.de \
docker compose -f docker-compose.yml -f docker-compose.jwilder.yml up -d
```
*(Das setzt voraus, dass dein `jwilder/nginx-proxy` im Netzwerk `nginx-proxy` läuft).*

---

## 🏛️ Architektur: Warum SQLite statt MariaDB?

Eine häufige Frage von Sysadmins: *„Warum kein MariaDB / MySQL im separaten Container?“*

1. **Cloudflare D1 Kompatibilität**: Anypod nutzt die Cloudflare D1 API (`db.prepare(...)`). D1 *ist* SQLite am Edge. Durch SQLite im Container läuft exakt dieselbe Codebasis lokal wie in der Cloud – ohne Abstraktions-Overhead.
2. **0 MB Leerlauf-RAM**: MariaDB benötigt im Leerlauf 150–300 MB RAM und eigene Netzwerk-Sockets. SQLite läuft in-process, verbraucht 0 MB zusätzlichen RAM und hat keine Latenz.
3. **Ausfallsicherheit**: Kein separater Datenbank-Container, der crashen oder Verbindungs-Timeouts werfen kann.
4. **1-Klick Backup**: Die gesamte Datenbank ist eine einzige Datei in `./data/`. Kein `mysqldump` oder Stop-Container nötig.

---

## 💾 Storage Management & Caching

### 1. Offline-Audio & Cover-Cache (Client PWA)
Anypod verfügt über einen integrierten Service Worker mit **HTTP 206 Range-Request Support**:
- Klicke bei einer Episode auf **„Download“**, um Audio und Cover auf dein Handy oder den Laptop herunterzuladen.
- Im Tab **„Downloads“** kannst du Folgen ohne Internetverbindung offline hören.
- Über den Button **„Clear Download“** oder in den Einstellungen lässt sich belegter Speicher jederzeit mit einem Klick freigeben.

### 2. Geplantes Server-seitiges Episoden-Archivieren & Auto-Pruning
Für Self-Hosters, die Feeds serverseitig spiegeln möchten:
- Viele Podcast-Feeds haben über 500 Folgen (50+ GB pro Podcast!). Ein ungefilterter Download aller Dateien würde jeden Server sprengen.
- **Geplantes Storage-Management**: Automatisches tägliches Abrufen neuer Episoden per Cron, Caching der neuesten *N* Folgen (z. B. letzte 3 Episoden oder Folgen der letzten 14 Tage) und automatisches Löschen alter MP3s nach Ablauf der Frist, während Hörstände in der SQLite-Datenbank erhalten bleiben.

---

## 🧹 Automatischer Inaktivitäts-Cleanup ("Cleaner Monday")

Anypod schützt die Privatsphäre und hält die lokale Datenbank sauber:
- Accounts, die 30 Tage inaktiv sind, erhalten einen Hinweis.
- Nach 50 Tagen folgt die letzte Erinnerung.
- Nach 60 Tagen werden inaktive Accounts und alle zugehörigen Daten DSGVO-konform restlos gelöscht.
- In den Einstellungen gibt es zudem einen **"Delete Account & Wipe Cloud Sync"**-Button.

Du kannst den Cleanup wöchentlich per System-Cronjob auf deinem Host anstoßen:

```bash
# Jeden Montag um 04:00 Uhr morgens ausführen:
0 4 * * 1 curl -s "http://localhost:8788/api/cron/cleanup?run=true&secret=DEIN_CRON_SECRET" > /dev/null
```

---

## 🔄 Updates

Um deine lokale Anypod-Instanz auf den neuesten Stand zu bringen:

```bash
git pull
docker compose build --no-cache
docker compose up -d
```
Deine SQLite-Datenbank und Konfiguration in `./data` bleiben dabei 100 % erhalten!

Viel Spaß beim Hören! 🎧😊
