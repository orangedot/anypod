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

const STAGED_HSTS_HEADER = 'max-age=86400; includeSubDomains';

function redirectWithHsts(destinationUrl, status = 301) {
  return new Response(null, {
    status,
    headers: {
      Location: destinationUrl,
      'Strict-Transport-Security': STAGED_HSTS_HEADER
    }
  });
}

function withHsts(response) {
  if (!response || response.headers.has('Strict-Transport-Security')) {
    return response;
  }
  const headers = new Headers(response.headers);
  headers.set('Strict-Transport-Security', STAGED_HSTS_HEADER);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}

export async function onRequest(context) {
  const url = new URL(context.request.url);
  const hostname = url.hostname.toLowerCase();

  // 1. Canonical Redirect www.anypod.org -> anypod.org
  if (hostname === 'www.anypod.org') {
    url.hostname = 'anypod.org';
    return redirectWithHsts(url.toString(), 301);
  }

  // 2. Subdomain Redirects to primary origin (ensures unpartitioned IndexedDB / storage access)
  if (hostname === 'dj.anypod.org') {
    const dest = new URL(url.pathname === '/' || url.pathname === '' ? '/dj' : url.pathname, 'https://anypod.org');
    dest.search = url.search;
    return redirectWithHsts(dest.toString(), 301);
  }

  // 3. sets.anypod.org & pulse.anypod.org -> anypod.org/sets
  if (hostname === 'sets.anypod.org' || hostname === 'pulse.anypod.org') {
    const dest = new URL(url.pathname === '/' || url.pathname === '' ? '/sets' : url.pathname, 'https://anypod.org');
    dest.search = url.search;
    return redirectWithHsts(dest.toString(), 301);
  }

  if (hostname === 'studio.anypod.org') {
    const dest = new URL(url.pathname === '/' || url.pathname === '' ? '/studio' : url.pathname, 'https://anypod.org');
    dest.search = url.search;
    return redirectWithHsts(dest.toString(), 301);
  }

  // 4. /dj, /dj/, and /dj.html rewrite directly to /dj.html
  if (url.pathname === '/dj' || url.pathname === '/dj/' || url.pathname === '/dj.html') {
    const assetUrl = new URL('/dj.html', url.origin);
    return withHsts(await context.env.ASSETS.fetch(assetUrl));
  }

  // 5. /sets, /sets/, and /sets.html rewrite directly to /sets.html
  if (url.pathname === '/sets' || url.pathname === '/sets/' || url.pathname === '/sets.html') {
    const assetUrl = new URL('/sets.html', url.origin);
    return withHsts(await context.env.ASSETS.fetch(assetUrl));
  }

  // 6. /audio and /audio/ rewrite directly to /audio.html
  if (url.pathname === '/audio' || url.pathname === '/audio/') {
    const assetUrl = new URL('/audio.html', url.origin);
    return withHsts(await context.env.ASSETS.fetch(assetUrl));
  }

  if (url.pathname === '/studio' || url.pathname === '/studio/' || url.pathname === '/studio.html') {
    const assetUrl = new URL('/studio.html', url.origin);
    return withHsts(await context.env.ASSETS.fetch(assetUrl));
  }

  const isApi = url.pathname.startsWith('/api/');
  const t0 = isApi ? Date.now() : 0;

  const response = withHsts(await context.next());

  if (isApi && context.env && context.env.DB) {
    const durationMs = Date.now() - t0;
    const shouldLog = response.status >= 400 || durationMs > 1500 || Math.random() < 0.02;
    if (shouldLog) {
      let targetParam = '';
      const rawTarget = url.searchParams.get('url');
      if (rawTarget) {
        try {
          targetParam = new URL(rawTarget).hostname;
        } catch (_) {
          targetParam = '';
        }
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
  }

  return response;
}