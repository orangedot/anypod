# Podany 🎙️

> **Private, edge-native podcast RSS aggregator & modern web player.**  
> Built for Cloudflare Pages, Cloudflare D1, and modern web browsers. Zero tracking, zero bloat, pure listening peace.

---

## 📖 Table of Contents

1. [Overview & Philosophy](#-overview--philosophy)
2. [Key Features](#-key-features)
3. [Architecture & Technology Stack](#-architecture--technology-stack)
4. [Project Structure](#-project-structure)
5. [Database Schema (Cloudflare D1)](#-database-schema-cloudflare-d1)
6. [API Reference](#-api-reference)
7. [Getting Started & Local Development](#-getting-started--local-development)
8. [Cloudflare Deployment Guide](#-cloudflare-deployment-guide)
9. [Git Setup & Remote Push Guide](#-git-setup--remote-push-guide)
10. [Configuration & Environment Variables](#-configuration--environment-variables)
11. [Design System & UI Guidelines](#-design-system--ui-guidelines)
12. [Roadmap](#-roadmap)
13. [License](#-license)

---

## 🌟 Overview & Philosophy

**Podany** is an open-source, private podcast player and RSS feed manager built to run at the edge on Cloudflare's serverless infrastructure. 

Unlike commercial podcast apps that enforce algorithmic feeds, dynamic ad insertion, proprietary silos, and user tracking, Podany gives you complete ownership of your podcast listening experience:

- **Edge-Native Performance**: The entire backend runs on Cloudflare Pages Functions and Cloudflare D1 (SQLite at the edge), providing sub-50ms cold starts and low latency worldwide.
- **Privacy & Isolation**: Every user account operates in complete isolation. Subscriptions, playback positions, and listening histories are never shared or indexed.
- **Open Standards**: Direct RSS/Atom XML parsing supporting standard audio enclosures (MP3, M4A, AAC, OGG) as well as YouTube audio/video feeds.
- **Calm, Distraction-Free UI**: Minimalist pastel beige accents (`#d8cdbe`), ultra-light modern typography (`Outfit` 200–600), borderless bottom action dock, and quiet interactions without alarmist badges or aggressive delete buttons.

---

## ✨ Key Features

### 🎧 Audio & YouTube Hybrid Engine
- **Universal Audio Player**: Native HTML5 audio playback supporting custom seek increments (±15s), playback speeds (`0.8x`, `1.0x`, `1.25x`, `1.5x`, `2.0x`), and full duration calculation.
- **YouTube Feed Integration**: Directly subscribe to YouTube channels (`youtube.com/@handle`, `youtube.com/channel/...`) or playlists (`youtube.com/playlist?list=...`). Audio streams via the YouTube IFrame API seamlessly inside the unified player.
- **MediaSession API**: Full OS-level lock screen integration, media key controls, background playback, and dynamic artwork updates on macOS, iOS, Android, and Windows.

### 🗄️ Multi-User Magic Link Auth & Edge D1 Sync
- **Passwordless Authentication**: Secure one-click magic link delivery powered by the Resend API with custom verified domain support (`login@podany.poizoom.com`).
- **Cryptographic Token Verification**: SHA-256 hashed one-time tokens with expiration and automatic session rotation.
- **Secure Cookie & Session Token Fallback**: Uses `HttpOnly`, `SameSite=Lax`, and `Secure` session cookies, with automatic `?session=` URL parameter fallback for standalone web app installations.
- **Instant Cloud Sync**: Subscriptions and playback positions continuously synchronize with Cloudflare D1 across all your devices.

### ⏱️ Cross-Device Progress & Smart Shelf
- **Millisecond-Accurate Resume**: Automatically captures audio playback position and syncs to D1 every few seconds and on pause/tab blur.
- **Continue Listening Shelf**: Collapsible top shelf displaying active in-progress episodes with an orange progress bar and exact resume time badge (`Resumes at MM:SS`).
- **Smart Completion**: Automatically marks episodes as played upon reaching the end, saving your progress state.

### 📚 Feeds Library with Quick-Jump Widgets
- **Interactive Podcast Cards**: Displays cover artwork, episode count, and a 2-line clamped podcast description blurb.
- **"Last Three" Direct Play Widgets**: Each podcast card features a mini-widget listing its 3 latest releases with direct 1-click play buttons. Jump directly into new episodes without opening the show details.
- **Quiet Management**: Unobtrusive ghost trash icon that only hints in soft red on hover, eliminating visual clutter.
- **Deep Podcast Detail View**: Dedicated view with complete show notes, website links, one-click RSS feed URL copying, and full episode history.

### 🔍 Real-Time Directory Search & Instant RSS Paste
- **Apple Podcasts Directory Search**: Live search querying iTunes with rich metadata depth (primary genre pill, episode count, and relative release date).
- **Direct Feed Paste**: Auto-detects `http://` or `https://` URLs to subscribe immediately without modal overhead.
- **Quick Onboarding**: Empty timeline provides integrated search and quick starter feed presets (*ZEIT Geschichte*, *ZEIT WISSEN*, *Weltspiegel*, *Syntax*).

### 📦 Universal OPML Migration
- **One-Click Import**: Seamlessly import existing subscriptions from Apple Podcasts, Spotify, Pocket Casts, Overcast, or AntennaPod.
- **Instant Export**: Export your complete library to standard `.opml` format anytime.

### 🌙 Modern Design & Sleep Timer
- **Light Typography System**: Loaded with Google Fonts `Outfit` weights `200`, `300`, `400`, `500`, and `600` for an airy, elegant reading experience.
- **Soothing Color Palette**: Warm, calm beige primary (`#d8cdbe`) on deep black `#000000`, with soft 7% border opacity and an 8px uniform radius.
- **Sleep Timer**: Configurable countdown (15m, 30m, 45m, 60m, or "End of Episode") with optional gradual audio fadeout.

---

## 🏗️ Architecture & Technology Stack

```
                                      +------------------------------------+
                                      |            Web Browser             |
                                      |  Vanilla JS + HTML5 + CSS + PWA    |
                                      +-----------------+------------------+
                                                        |
                                          HTTPS Requests| (REST + Cookies)
                                                        v
+-------------------------------------------------------------------------------------------------------+
|                                    Cloudflare Pages & Functions                                       |
|                                                                                                       |
|   +-----------------------+   +-----------------------+   +-------------------+   +---------------+   |
|   |   /api/auth/send-link |   |   /api/auth/verify    |   |   /api/sync/feeds |   |   /api/feed   |   |
|   |   /api/auth/logout    |   |                       |   |   /api/sync/pos   |   | (RSS/YouTube) |   |
|   +-----------+-----------+   +-----------+-----------+   +---------+---------+   +-------+-------+   |
|               |                           |                         |                     |           |
|               |                           v                         v                     v           |
|               |                 +--------------------------------------+    +---------------------+   |
|               |                 |        Cloudflare D1 Database        |    |   External Origin   |   |
|               |                 |       (SQLite Edge Database)         |    |   RSS Feeds / XML   |   |
|               |                 +--------------------------------------+    +---------------------+   |
|               v                                                                                       |
|   +-----------------------+                                                 +---------------------+   |
|   |      Resend API       |                                                 | Apple Podcasts / YT |   |
|   | (Magic Link Delivery) |                                                 |  Directory Search   |   |
|   +-----------------------+                                                 +---------------------+   |
+-------------------------------------------------------------------------------------------------------+
```

### Technology Breakdown

| Component | Technology | Rationale |
| :--- | :--- | :--- |
| **Hosting & CDN** | Cloudflare Pages | Global edge delivery, zero cold starts, custom domain with automatic SSL |
| **Serverless Functions** | Cloudflare Pages Functions | Native edge runtime (`workerd`), no containers, minimal memory overhead |
| **Database** | Cloudflare D1 (SQLite) | ACID-compliant relational storage replicated at the edge |
| **Email Delivery** | Resend REST API | Fast, reliable transactional email delivery for magic links |
| **Frontend Framework** | Vanilla ES6+ JavaScript | Zero bundle size, instant DOM rendering, maximum browser compatibility |
| **Styles & Theming** | Modern CSS3 (Variables, Grid) | Native dark/light theme switching, backdrop blur, responsive layouts |
| **Typography** | Google Fonts `Outfit` | Modern geometric sans-serif loaded with light weights (200, 300, 400) |
| **Directory Search** | Apple iTunes Search API | Free, rate-limit friendly global podcast directory lookup |
| **Video Engine** | YouTube IFrame Player API | Embeds video and audio playback for YouTube podcast channels |

---

## 📁 Project Structure

```
podany/
├── functions/                    # Cloudflare Pages Functions (Serverless Backend)
│   └── api/
│       ├── auth/
│       │   ├── send-link.js      # Issues magic token & dispatches email via Resend
│       │   ├── verify.js         # Validates token & sets session cookie / token
│       │   └── logout.js         # Invalidates session in D1 & clears cookies
│       │
│       ├── sync/
│       │   ├── feeds.js          # GET / POST / DELETE user subscriptions
│       │   └── position.js       # GET / POST playback positions & progress
│       │
│       ├── feed.js               # RSS, Atom & YouTube XML fetcher and parser
│       └── utils.js              # Authentication helpers & SHA-256 hashing
│
├── public/                       # Static Web Assets (Frontend)
│   ├── index.html                # App shell, modals, dock, and player markup
│   ├── style.css                 # Complete responsive design system & themes
│   └── app.js                    # State management, audio playback, and UI controller
│
├── schema.sql                    # Cloudflare D1 SQL schema definition
├── wrangler.json                 # Cloudflare Pages & D1 configuration
├── package.json                  # Project manifest and scripts
└── README.md                     # Documentation
```

---

## 🗃️ Database Schema (Cloudflare D1)

The database schema (`schema.sql`) provides isolated storage for users, authentication tokens, user sessions, subscriptions, and playback state:

```sql
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  created_at INTEGER DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS auth_tokens (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  used INTEGER DEFAULT 0,
  created_at INTEGER DEFAULT (unixepoch()),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS user_sessions (
  session_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  created_at INTEGER DEFAULT (unixepoch()),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS subscriptions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  feed_url TEXT NOT NULL,
  title TEXT,
  artwork TEXT,
  created_at INTEGER DEFAULT (unixepoch()),
  UNIQUE(user_id, feed_url),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS playback_state (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  episode_guid TEXT NOT NULL,
  position_seconds REAL DEFAULT 0,
  completed INTEGER DEFAULT 0,
  last_listened_at INTEGER DEFAULT (unixepoch()),
  UNIQUE(user_id, episode_guid),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
```

---

## 🔌 API Reference

All protected endpoints require either an active `podany_session` cookie or an `X-Session-Token` request header.

### 1. Authentication

#### `POST /api/auth/send-link`
Generates a 15-minute single-use magic login token and sends an email via Resend.
- **Request Body**:
  ```json
  { "email": "user@example.com" }
  ```
- **Response** (HTTP 200):
  ```json
  { "success": true, "message": "Sign-in link sent" }
  ```

#### `GET /api/auth/verify?token=<token_hex>`
Validates the token, creates a persistent session in `user_sessions`, sets the `podany_session` HTTP-only cookie, and redirects to the application with `?session=<session_token>`.

#### `POST /api/auth/logout`
Deletes the active session from D1 and clears the `podany_session` cookie.

---

### 2. Subscriptions Sync

#### `GET /api/sync/feeds`
Retrieves all feeds subscribed to by the authenticated user.
- **Response** (HTTP 200):
  ```json
  {
    "userEmail": "user@example.com",
    "feeds": [
      {
        "feed_url": "https://example.com/feed.xml",
        "title": "Podcast Title",
        "artwork": "https://example.com/art.jpg"
      }
    ]
  }
  ```

#### `POST /api/sync/feeds`
Adds a new subscription for the user.
- **Request Body**:
  ```json
  {
    "feedUrl": "https://example.com/feed.xml",
    "title": "Podcast Title",
    "artwork": "https://example.com/art.jpg"
  }
  ```

#### `DELETE /api/sync/feeds`
Unsubscribes the user from a feed and cascades deletion of associated playback state.
- **Request Body**:
  ```json
  { "feedUrl": "https://example.com/feed.xml" }
  ```

---

### 3. Playback State Sync

#### `GET /api/sync/position`
Fetches all stored playback positions and completion states for the user.
- **Response** (HTTP 200):
  ```json
  {
    "positions": {
      "episode-guid-123": {
        "position": 542.5,
        "completed": 0,
        "lastListenedAt": 1727045000
      }
    }
  }
  ```

#### `POST /api/sync/position`
Saves or updates the playback position of an episode.
- **Request Body**:
  ```json
  {
    "episodeGuid": "episode-guid-123",
    "positionSeconds": 542.5,
    "completed": 0
  }
  ```

---

### 4. Feed Parser & Proxy

#### `GET /api/feed?url=<encoded_feed_url>`
Parses any RSS, Atom, or YouTube URL, normalizes enclosures and episode metadata, and caches results.
- **Response** (HTTP 200):
  ```json
  {
    "title": "Example Show",
    "description": "Show description...",
    "artwork": "https://example.com/cover.jpg",
    "episodesCount": 42,
    "episodes": [
      {
        "guid": "ep-1",
        "title": "Episode 1",
        "audioUrl": "https://example.com/audio.mp3",
        "duration": "45:12",
        "pubDate": "Mon, 22 Sep 2026 12:00:00 GMT",
        "timestamp": 1727006400000,
        "isYouTube": false
      }
    ]
  }
  ```

---

## 🚀 Getting Started & Local Development

### Prerequisites
- [Node.js](https://nodejs.org/) v18.0.0 or higher
- [npm](https://www.npmjs.com/) v9.0.0 or higher
- [Cloudflare Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/) (`npm install -g wrangler`)

### Installation

1. Clone or navigate to the repository directory:
   ```bash
   git clone https://github.com/orangedot/podany.git
   cd podany
   ```

2. Install development dependencies:
   ```bash
   npm install
   ```

3. Start the local development server with Wrangler:
   ```bash
   npm run dev
   ```
   The local application will be accessible at:
   ```
   http://localhost:8788
   ```

4. *(Optional)* Initialize local SQLite database for local offline testing:
   ```bash
   npm run dev:init-db
   ```

---

## ☁️ Cloudflare Deployment Guide

### 1. Cloudflare D1 Setup

Create a new Cloudflare D1 database:
```bash
npx wrangler d1 create podany-db
```
Wrangler will output the database ID:
```json
{
  "binding": "DB",
  "database_name": "podany-db",
  "database_id": "your-database-id-here"
}
```
Update `wrangler.json` with your database ID under `d1_databases`.

Apply the database schema to remote production D1:
```bash
npx wrangler d1 execute podany-db --file=schema.sql --remote
```

### 2. Configure Environment Variables & Secrets

Set your **Resend API Key** as a secret on Cloudflare Pages:
```bash
npx wrangler pages secret put RESEND_API_KEY --project-name podany
```
*(Enter your Resend API Key when prompted).*

In `wrangler.json`, configure your application URL and sender email:
```json
{
  "vars": {
    "APP_URL": "https://podany.poizoom.com",
    "FROM_EMAIL": "Podany <login@podany.poizoom.com>"
  }
}
```

### 3. Deploy to Cloudflare Pages

Deploy the project directly to production:
```bash
npx wrangler pages deploy public --project-name podany --branch main
```

Your app will be live at `https://podany.pages.dev` or your connected custom domain.

---

## 🔐 Git Setup & Remote Push Guide

To create a new private Git repository (e.g. on GitHub, GitLab, or Gitea) and push your codebase:

### 1. Initialize & Verify Repository
Ensure you are inside the project repository directory:
```bash
git status
```

### 2. Create a New Private Repository on GitHub
Using the GitHub CLI (`gh`):
```bash
gh repo create podany --private --source=. --remote=origin --push
```

Or manually via the GitHub Web UI:
1. Go to [github.com/new](https://github.com/new).
2. Set the repository name to `podany` (or your preferred name).
3. Select **Private**.
4. Leave "Add a README file" **unchecked** (we already have this comprehensive README).
5. Click **Create repository**.

### 3. Link Remote & Push
Copy the remote URL and run:
```bash
git remote add origin git@github.com:<your-username>/podany.git
git branch -M main
git push -u origin main
```

### 4. Subsequent Updates
For future updates, push directly:
```bash
git add .
git commit -m "feat: Your update description"
git push
```

---

## ⚙️ Configuration & Environment Variables

| Variable | Type | Where Configured | Description |
| :--- | :--- | :--- | :--- |
| `DB` | D1 Binding | `wrangler.json` | Cloudflare D1 database binding (`podany-db`) |
| `RESEND_API_KEY` | Secret | Cloudflare Pages Secrets | API key from [Resend](https://resend.com) for sending login emails |
| `APP_URL` | Plaintext Var | `wrangler.json` | Canonical base URL used in magic links (fallback to request origin) |
| `FROM_EMAIL` | Plaintext Var | `wrangler.json` | Verified sender address (e.g. `Podany <login@podany.poizoom.com>`) |

---

## 🎨 Design System & UI Guidelines

Podany adheres to strict visual design principles:

- **Palette**:
  - Dark Background: `#000000` (pure OLED black)
  - Card Background: `#111111`
  - Primary Accent: Soft pastel beige `#d8cdbe`
  - Primary Foreground: Dark charcoal `#141414`
  - Playback Accent: Orange `#f97316`
  - Soft Borders: 7% opacity (`rgba(255, 255, 255, 0.07)` in dark, `rgba(0, 0, 0, 0.07)` in light)
- **Typography**:
  - Font Family: `'Outfit', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`
  - Body Weight: `300` (ultra-light, airy reading feel with `-0.01em` letter spacing)
  - Headings: `400` to `450` (softened, calm hierarchy without aggressive bolding)
- **Component Geometry**:
  - Uniform Corner Radius: `8px` (`--radius-sm`), `10px` (`--radius-md`)
  - Bottom Action Dock: Borderless, anchored to the bottom-right for thumb ergonomics
  - Unsubscribe Actions: Subtle ghost buttons with muted trash icons that only highlight softly on hover

---

## 🗺️ Roadmap

- [x] Cloudflare D1 multi-user subscription and playback synchronization.
- [x] Passwordless Magic Link email authentication with Resend.
- [x] Integrated Apple Podcasts directory search with genre, episode count, and freshness metadata.
- [x] Inline RSS/YouTube quick subscription input on empty timeline.
- [x] "Last Three" quick-jump interactive widgets in feeds grid.
- [x] Collapsible Continue Listening shelf with progress indicators.
- [x] OPML export and import.
- [x] Sleep timer with optional gradual audio fadeout.
- [ ] Offline audio caching via Service Worker / CacheStorage (PWA).
- [ ] Chapter markers support (ID3 and Podlove simple chapters).
- [ ] Audio waveform visualization and silence skipper.
- [ ] Full-text episode transcript reader with synchronized audio seeking.

---

## 📄 License

This project is licensed under the **MIT License**. Feel free to use, fork, and self-host for personal or commercial use.

```
Copyright (c) 2026 Steffen Klaue

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.
```
