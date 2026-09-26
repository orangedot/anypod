import { getUserFromRequest, isValidExternalUrl } from '../utils.js';

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

  const user = await getUserFromRequest(request, env);
  if (!user) {
    const isCheck = new URL(request.url).searchParams.has('check');
    if (isCheck) {
      return new Response(JSON.stringify({ authenticated: false, feeds: [] }), { headers: corsHeaders, status: 200 });
    }
    return new Response(JSON.stringify({ error: 'Unauthorized: Session required' }), { headers: corsHeaders, status: 401 });
  }

  const userId = user.id;
  db.prepare('UPDATE users SET last_active_at = unixepoch(), warned_30d_at = NULL, warned_50d_at = NULL WHERE id = ?').bind(userId).run().catch(() => {});

  try {
    if (request.method === 'GET') {
      const rows = await db.prepare('SELECT feed_url, title, artwork FROM subscriptions WHERE user_id = ? ORDER BY created_at ASC').bind(userId).all();
      return new Response(JSON.stringify({ feeds: rows.results || [], userEmail: user.email }), { headers: corsHeaders, status: 200 });
    }

    if (request.method === 'POST') {
      const body = await request.json();
      const { feedUrl, title, artwork } = body;

      if (!feedUrl || !isValidExternalUrl(feedUrl)) {
        return new Response(JSON.stringify({ error: 'Valid external feedUrl required' }), { headers: corsHeaders, status: 400 });
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
