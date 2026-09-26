import { getUserFromRequest, hashToken } from '../utils.js';

export async function onRequest(context) {
  const { request, env, params } = context;
  const url = new URL(request.url);
  const routeSegments = Array.isArray(params.route) ? params.route : (params.route ? [params.route] : []);

  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Session-Token, Cookie',
    'Content-Type': 'application/json; charset=utf-8'
  };

  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders, status: 204 });
  }

  const db = env.DB;
  if (!db) {
    return new Response(JSON.stringify({ error: 'Database unconfigured' }), {
      status: 500,
      headers: corsHeaders
    });
  }

  // 1. Authentication Check: POST /api/2/auth/{username}/login.json
  if (routeSegments[0] === 'auth' && routeSegments[2] && routeSegments[2].startsWith('login')) {
    const username = decodeURIComponent(routeSegments[1] || '').trim().toLowerCase();
    let authenticatedUser = await getUserFromRequest(request, env);

    if (!authenticatedUser) {
      const authHeader = request.headers.get('Authorization') || '';
      if (authHeader.startsWith('Basic ')) {
        try {
          const decoded = atob(authHeader.slice(6).trim());
          const colonIdx = decoded.indexOf(':');
          if (colonIdx !== -1) {
            const rawUser = decoded.slice(0, colonIdx).trim().toLowerCase();
            const rawPass = decoded.slice(colonIdx + 1).trim();
            const passHash = await hashToken(rawPass);
            const userRow = await db.prepare('SELECT id, email FROM users WHERE LOWER(email) = ?').bind(rawUser || username).first();
            if (userRow) {
              const sessionRow = await db.prepare(
                'SELECT session_hash FROM user_sessions WHERE user_id = ? AND (session_hash = ? OR session_hash = ?) AND expires_at > unixepoch()'
              ).bind(userRow.id, passHash, rawPass).first();
              if (sessionRow) {
                authenticatedUser = userRow;
              }
            }
          }
        } catch (_) {}
      }
    }

    if (!authenticatedUser) {
      return new Response(JSON.stringify({ error: 'Unauthorized. Use your Anypod account email and session token.' }), {
        status: 401,
        headers: {
          ...corsHeaders,
          'WWW-Authenticate': 'Basic realm="Anypod gPodder Sync"'
        }
      });
    }

    // Generate or refresh gPodder sessionid
    const sessionBuffer = new Uint8Array(32);
    crypto.getRandomValues(sessionBuffer);
    const sessionToken = Array.from(sessionBuffer).map(b => b.toString(16).padStart(2, '0')).join('');
    const sessionHash = await hashToken(sessionToken);
    const expiresAt = Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60;

    await db.prepare(
      'INSERT INTO user_sessions (session_hash, user_id, expires_at) VALUES (?, ?, ?)'
    ).bind(sessionHash, authenticatedUser.id, expiresAt).run();

    const responseHeaders = new Headers(corsHeaders);
    responseHeaders.set('Set-Cookie', `sessionid=${sessionToken}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000`);

    return new Response(JSON.stringify({ success: true, email: authenticatedUser.email }), {
      status: 200,
      headers: responseHeaders
    });
  }

  // Require active user authentication for all remaining gPodder sync operations
  const user = await getUserFromRequest(request, env);
  if (!user) {
    return new Response(JSON.stringify({ error: 'Authentication required' }), {
      status: 401,
      headers: {
        ...corsHeaders,
        'WWW-Authenticate': 'Basic realm="Anypod gPodder Sync"'
      }
    });
  }

  // 2. Devices: GET /api/2/devices/{username}.json
  if (routeSegments[0] === 'devices' && routeSegments.length === 2) {
    const subCount = await db.prepare('SELECT COUNT(*) as count FROM subscriptions WHERE user_id = ?').bind(user.id).first();
    return new Response(JSON.stringify([
      {
        id: 'phone',
        caption: 'AntennaPod Sync Device',
        type: 'phone',
        subscriptions: subCount ? subCount.count : 0
      }
    ]), {
      status: 200,
      headers: corsHeaders
    });
  }

  // 3. Device Registration: POST /api/2/devices/{username}/{deviceid}.json
  if (routeSegments[0] === 'devices' && routeSegments.length >= 3) {
    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: corsHeaders
    });
  }

  // 4. Subscriptions: /api/2/subscriptions/{username}/{deviceid}.json
  if (routeSegments[0] === 'subscriptions' && routeSegments.length >= 3) {
    if (request.method === 'GET') {
      const since = parseInt(url.searchParams.get('since') || '0', 10);
      const rows = await db.prepare('SELECT feed_url, created_at FROM subscriptions WHERE user_id = ?').bind(user.id).all();
      const urls = (rows.results || []).map(r => r.feed_url);

      if (since > 0) {
        return new Response(JSON.stringify({
          add: urls,
          remove: [],
          timestamp: Math.floor(Date.now() / 1000)
        }), {
          status: 200,
          headers: corsHeaders
        });
      }

      return new Response(JSON.stringify(urls), {
        status: 200,
        headers: corsHeaders
      });
    }

    if (request.method === 'POST') {
      try {
        const body = await request.json();
        const addUrls = Array.isArray(body.add) ? body.add : [];
        const removeUrls = Array.isArray(body.remove) ? body.remove : [];

        for (const feedUrl of addUrls) {
          if (typeof feedUrl === 'string' && feedUrl.trim()) {
            const id = 'sub_' + Math.random().toString(36).substring(2, 10);
            await db.prepare(
              'INSERT INTO subscriptions (id, user_id, feed_url) VALUES (?, ?, ?) ON CONFLICT(user_id, feed_url) DO NOTHING'
            ).bind(id, user.id, feedUrl.trim()).run();
          }
        }

        for (const feedUrl of removeUrls) {
          if (typeof feedUrl === 'string' && feedUrl.trim()) {
            await db.prepare(
              'DELETE FROM subscriptions WHERE user_id = ? AND feed_url = ?'
            ).bind(user.id, feedUrl.trim()).run();
          }
        }

        return new Response(JSON.stringify({
          timestamp: Math.floor(Date.now() / 1000),
          update_urls: []
        }), {
          status: 200,
          headers: corsHeaders
        });
      } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), {
          status: 400,
          headers: corsHeaders
        });
      }
    }
  }

  // 5. Episode Actions: /api/2/episode-actions/{username}.json OR /api/2/episodes/{username}.json
  if (routeSegments[0] === 'episode-actions' || routeSegments[0] === 'episodes') {
    if (request.method === 'GET') {
      const since = parseInt(url.searchParams.get('since') || '0', 10);
      let query = 'SELECT episode_guid, position_seconds, completed, last_listened_at FROM playback_state WHERE user_id = ?';
      const params = [user.id];
      if (since > 0) {
        query += ' AND last_listened_at > ?';
        params.push(since);
      }
      query += ' ORDER BY last_listened_at DESC LIMIT 500';

      const rows = await db.prepare(query).bind(...params).all();
      const actions = (rows.results || []).map(r => ({
        podcast: '',
        episode: r.episode_guid,
        action: 'play',
        position: Math.round(r.position_seconds || 0),
        started: 0,
        total: 0,
        timestamp: new Date((r.last_listened_at || Math.floor(Date.now() / 1000)) * 1000).toISOString()
      }));

      return new Response(JSON.stringify({
        actions,
        timestamp: Math.floor(Date.now() / 1000)
      }), {
        status: 200,
        headers: corsHeaders
      });
    }

    if (request.method === 'POST') {
      try {
        const body = await request.json();
        const actions = Array.isArray(body) ? body : (Array.isArray(body.actions) ? body.actions : []);

        for (const act of actions) {
          const epGuid = act.episode || act.guid;
          if (epGuid && act.action === 'play') {
            const pos = typeof act.position === 'number' ? act.position : 0;
            const completed = (act.total && pos >= act.total * 0.95) ? 1 : 0;
            const id = 'pos_' + Math.random().toString(36).substring(2, 10);
            await db.prepare(
              `INSERT INTO playback_state (id, user_id, episode_guid, position_seconds, completed, last_listened_at)
               VALUES (?, ?, ?, ?, ?, unixepoch())
               ON CONFLICT(user_id, episode_guid) DO UPDATE SET
                 position_seconds = excluded.position_seconds,
                 completed = excluded.completed,
                 last_listened_at = unixepoch()`
            ).bind(id, user.id, epGuid, pos, completed).run();
          }
        }

        return new Response(JSON.stringify({
          update_urls: [],
          timestamp: Math.floor(Date.now() / 1000)
        }), {
          status: 200,
          headers: corsHeaders
        });
      } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), {
          status: 400,
          headers: corsHeaders
        });
      }
    }
  }

  return new Response(JSON.stringify({ error: 'Endpoint not found' }), {
    status: 404,
    headers: corsHeaders
  });
}
