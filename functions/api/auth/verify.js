import { hashToken } from '../utils.js';

export async function onRequest(context) {
  const { request, env } = context;

  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json; charset=utf-8'
  };

  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders, status: 204 });
  }

  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      headers: corsHeaders,
      status: 405
    });
  }

  try {
    const body = await request.json();
    const token = body.token ? String(body.token).trim() : '';

    if (!token) {
      return new Response(JSON.stringify({ error: 'Token is required' }), {
        headers: corsHeaders,
        status: 400
      });
    }

    const db = env.DB;
    if (!db) {
      return new Response(JSON.stringify({ error: 'Database binding unconfigured' }), {
        headers: corsHeaders,
        status: 500
      });
    }

    const tokenHash = await hashToken(token);

    const updateResult = await db.prepare(
      'UPDATE auth_tokens SET used = 1 WHERE token_hash = ? AND used = 0 AND expires_at > unixepoch() RETURNING user_id'
    ).bind(tokenHash).all();

    if (!updateResult.results || updateResult.results.length === 0) {
      return new Response(JSON.stringify({ error: 'Invalid or expired token' }), {
        headers: corsHeaders,
        status: 401
      });
    }

    const userId = updateResult.results[0].user_id;

    const sessionBuffer = new Uint8Array(32);
    crypto.getRandomValues(sessionBuffer);
    const rawSessionToken = Array.from(sessionBuffer).map(b => b.toString(16).padStart(2, '0')).join('');
    const sessionHash = await hashToken(rawSessionToken);

    const sessionExpiresAt = Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60;

    await db.prepare(
      'INSERT INTO user_sessions (session_hash, user_id, expires_at) VALUES (?, ?, ?)'
    ).bind(sessionHash, userId, sessionExpiresAt).run();

    const headers = new Headers(corsHeaders);
    headers.set('Set-Cookie', `podcast_session=${rawSessionToken}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=2592000`);

    return new Response(JSON.stringify({ success: true, sessionToken: rawSessionToken }), {
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
