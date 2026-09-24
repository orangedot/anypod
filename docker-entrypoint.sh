#!/bin/sh
set -e

echo "🚀 Starting Anypod Self-Hosted Container..."

# 1. Load config from config.json / config.yaml / environment variables into .env
node /app/scripts/load-config.js

PORT="${PORT:-8788}"

# 2. Ensure /data directory structure for SQLite persistence
DATA_DIR="/data"
D1_DIR="$DATA_DIR/v3/d1/miniflare-D1DatabaseObject"
mkdir -p "$D1_DIR"

DB_FILE="$D1_DIR/1d2c6f471d53ebbab1505a69a966ce3e563bc9428255f6f61ad83474526c0fe6.sqlite"

if [ ! -f "$DB_FILE" ]; then
  echo "📦 Initializing Anypod local SQLite database at $DB_FILE..."
  sqlite3 "$DB_FILE" < /app/schema.sql
  echo "✅ Database initialized successfully."
else
  echo "📦 Existing database found. Verifying schema..."
  sqlite3 "$DB_FILE" < /app/schema.sql 2>/dev/null || true
  echo "✅ Database ready."
fi

# 3. Ensure production bundle exists
if [ ! -f "/app/public/dist/index.html" ]; then
  echo "📦 Building production assets..."
  node /app/scripts/build.js
fi

SERVE_DIR="/app/public/dist"
if [ ! -f "$SERVE_DIR/index.html" ]; then
  SERVE_DIR="/app/public"
fi

echo "✨ Anypod is ready! Serving $SERVE_DIR on 0.0.0.0:${PORT}"
echo "🌐 Open in your browser: ${APP_URL:-http://localhost:${PORT}}"

# 4. Start Wrangler Pages dev with full local persistence in /data
exec npx wrangler pages dev "$SERVE_DIR" --ip 0.0.0.0 --port "$PORT" --persist-to /data
