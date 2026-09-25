import { getUserFromRequest, hashToken } from '../utils.js';

export async function onRequest(context) {
  const { request, env } = context;

  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Session-Token',
    'Content-Type': 'application/json; charset=utf-8'
  };

  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders, status: 204 });
  }

  if (request.method !== 'POST' && request.method !== 'DELETE') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      headers: corsHeaders,
      status: 405
    });
  }

  const db = env.DB;
  if (!db) {
    return new Response(JSON.stringify({ error: 'Database binding unconfigured' }), {
      headers: corsHeaders,
      status: 500
    });
  }

  try {
    const user = await getUserFromRequest(request, env);
    if (!user) {
      return new Response(JSON.stringify({ error: 'Unauthorized: Valid session required to delete account' }), {
        headers: corsHeaders,
        status: 401
      });
    }

    const userId = user.id;

    // Permanently wipe all user data in foreign-key cascade order
    await db.batch([
      db.prepare('DELETE FROM subscriptions WHERE user_id = ?').bind(userId),
      db.prepare('DELETE FROM playback_state WHERE user_id = ?').bind(userId),
      db.prepare('DELETE FROM user_sessions WHERE user_id = ?').bind(userId),
      db.prepare('DELETE FROM auth_tokens WHERE user_id = ?').bind(userId),
      db.prepare('DELETE FROM users WHERE id = ?').bind(userId)
    ]);

    const url = new URL(request.url);
    const domainAttr = url.hostname.endsWith('anypod.org') ? '; Domain=.anypod.org' : '';

    // Clear session cookie
    const headers = new Headers(corsHeaders);
    headers.set('Set-Cookie', `podcast_session=; HttpOnly; Secure; SameSite=Lax; Path=/${domainAttr}; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT`);

    return new Response(JSON.stringify({ 
      success: true, 
      message: 'Account and all synced cloud data permanently wiped.' 
    }), {
      headers,
      status: 200
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      headers: corsHeaders,
      status: 500
    });
  }
}
