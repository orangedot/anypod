/**
 * Cloudflare Pages Middleware
 * 
 * 1. Canonical Domain Redirection:
 *    Leitet 'www.anypod.org' -> 'anypod.org' weiter (HTTP 301).
 * 
 * 2. Subdomain Routing:
 *    dj.anypod.org liefert an der Root '/' direkt /dj.html aus.
 */

let _logTableInitialized = false;

async function ensureLogTable(db) {
  if (_logTableInitialized) return;
  try {
    await db.prepare(`
      CREATE TABLE IF NOT EXISTS api_request_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        created_at INTEGER NOT NULL,
        endpoint TEXT NOT NULL,
        target_param TEXT,
        status_code INTEGER NOT NULL,
        duration_ms INTEGER NOT NULL,
        cache_status TEXT
      )
    `).run();
    _logTableInitialized = true;
  } catch (_) {}
}

async function logRequestToD1(db, entry) {
  try {
    await ensureLogTable(db);
    await db.prepare(`
      INSERT INTO api_request_logs (created_at, endpoint, target_param, status_code, duration_ms, cache_status)
      VALUES (?, ?, ?, ?, ?, ?)
    `).bind(
      entry.createdAt,
      entry.endpoint,
      entry.targetParam || null,
      entry.statusCode,
      entry.durationMs,
      entry.cacheStatus || 'NONE'
    ).run();

    // 1-in-50 chance auto-prune logs older than 48 hours
    if (Math.random() < 0.02) {
      const cutoff = Math.floor(Date.now() / 1000) - 48 * 3600;
      await db.prepare('DELETE FROM api_request_logs WHERE created_at < ?').bind(cutoff).run();
    }
  } catch (_) {}
}

export async function onRequest(context) {
  const url = new URL(context.request.url);
  const hostname = url.hostname.toLowerCase();

  // 1. Canonical Redirect www.anypod.org -> anypod.org
  if (hostname === 'www.anypod.org') {
    url.hostname = 'anypod.org';
    return Response.redirect(url.toString(), 301);
  }

  // 2. Subdomain Redirects to primary origin (ensures unpartitioned IndexedDB / storage access)
  if (hostname === 'dj.anypod.org') {
    const dest = new URL('/dj', 'https://anypod.org');
    dest.search = url.search;
    return Response.redirect(dest.toString(), 301);
  }

  // 3. sets.anypod.org & pulse.anypod.org -> anypod.org/sets
  if (hostname === 'sets.anypod.org' || hostname === 'pulse.anypod.org') {
    const dest = new URL('/sets', 'https://anypod.org');
    dest.search = url.search;
    return Response.redirect(dest.toString(), 301);
  }

  // 4. /dj, /dj/, and /dj.html rewrite directly to /dj.html
  if (url.pathname === '/dj' || url.pathname === '/dj/' || url.pathname === '/dj.html') {
    const assetUrl = new URL('/dj.html', url.origin);
    return context.env.ASSETS.fetch(assetUrl);
  }

  // 5. /audio and /audio/ rewrite directly to /audio.html
  if (url.pathname === '/audio' || url.pathname === '/audio/') {
    const assetUrl = new URL('/audio.html', url.origin);
    return context.env.ASSETS.fetch(assetUrl);
  }

  const isApi = url.pathname.startsWith('/api/');
  const t0 = isApi ? Date.now() : 0;

  const response = await context.next();

  if (isApi && context.env && context.env.DB) {
    const durationMs = Date.now() - t0;
    let targetParam = '';
    const rawTarget = url.searchParams.get('url');
    if (rawTarget) {
      try {
        targetParam = new URL(rawTarget).hostname;
      } catch (_) {
        targetParam = rawTarget.slice(0, 80);
      }
    } else if (url.searchParams.get('term')) {
      targetParam = url.searchParams.get('term').slice(0, 50);
    } else if (url.searchParams.get('guid')) {
      targetParam = url.searchParams.get('guid').slice(0, 60);
    }

    const cacheStatus = response.headers.get('cf-cache-status') || response.headers.get('x-cache') || 'NONE';

    const logEntry = {
      createdAt: Math.floor(Date.now() / 1000),
      endpoint: url.pathname,
      targetParam,
      statusCode: response.status,
      durationMs,
      cacheStatus
    };

    if (context.waitUntil) {
      context.waitUntil(logRequestToD1(context.env.DB, logEntry));
    } else {
      logRequestToD1(context.env.DB, logEntry).catch(() => {});
    }
  }

  return response;
}