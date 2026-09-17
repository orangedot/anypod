/**
 * Cloudflare Pages Function: /api/sync/feeds
 * Syncs user podcast subscriptions with D1 SQLite Database
 */

export async function onRequest(context) {
  const { request, env } = context;
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Session-Token',
    'Content-Type': 'application/json; charset=utf-8'
  };

  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders, status: 204 });
  }

  const db = env.DB;
  if (!db) {
    return new Response(JSON.stringify({ error: 'DB not bound' }), { headers: corsHeaders, status: 500 });
  }

  // Validate Session Token
  const sessionToken = request.headers.get('X-Session-Token') || request.headers.get('Authorization')?.replace('Bearer ', '');
  if (!sessionToken) {
    return new Response(JSON.stringify({ error: 'Unauthorized: Session required' }), { headers: corsHeaders, status: 401 });
  }

  const session = await db.prepare('SELECT user_id, email FROM user_sessions WHERE session_token = ? AND expires_at > CURRENT_TIMESTAMP').bind(sessionToken).first();
  if (!session) {
    return new Response(JSON.stringify({ error: 'Unauthorized: Invalid or expired session' }), { headers: corsHeaders, status: 401 });
  }

  const userId = session.user_id;

  try {
    if (request.method === 'GET') {
      const rows = await db.prepare('SELECT feed_url, title, artwork FROM subscriptions WHERE user_id = ? ORDER BY created_at ASC').bind(userId).all();
      return new Response(JSON.stringify({ feeds: rows.results || [] }), { headers: corsHeaders, status: 200 });
    }

    if (request.method === 'POST') {
      const body = await request.json();
      const { feedUrl, title, artwork } = body;

      if (!feedUrl) {
        return new Response(JSON.stringify({ error: 'feedUrl required' }), { headers: corsHeaders, status: 400 });
      }

      const id = 'sub_' + crypto.randomUUID();
      await db.prepare(
        'INSERT INTO subscriptions (id, user_id, feed_url, title, artwork) VALUES (?, ?, ?, ?, ?) ON CONFLICT(user_id, feed_url) DO UPDATE SET title=excluded.title, artwork=excluded.artwork'
      ).bind(id, userId, feedUrl, title || '', artwork || '').run();

      return new Response(JSON.stringify({ success: true, feedUrl }), { headers: corsHeaders, status: 200 });
    }

    if (request.method === 'DELETE') {
      const body = await request.json();
      const { feedUrl } = body;

      if (!feedUrl) {
        return new Response(JSON.stringify({ error: 'feedUrl required' }), { headers: corsHeaders, status: 400 });
      }

      await db.prepare('DELETE FROM subscriptions WHERE user_id = ? AND feed_url = ?').bind(userId, feedUrl).run();
      return new Response(JSON.stringify({ success: true, removed: feedUrl }), { headers: corsHeaders, status: 200 });
    }

    return new Response(JSON.stringify({ error: 'Method not allowed' }), { headers: corsHeaders, status: 405 });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { headers: corsHeaders, status: 500 });
  }
}
