import { hashToken } from '../utils.js';

export async function onRequest(context) {
  const { request, env } = context;

  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Session-Token',
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
    let rawSessionToken = null;
    const cookieHeader = request.headers.get('Cookie') || '';
    const cookiePairs = cookieHeader.split(';');
    for (const pair of cookiePairs) {
      const [k, ...v] = pair.trim().split('=');
      if (k === 'podcast_session') {
        rawSessionToken = v.join('=');
        break;
      }
    }

    if (!rawSessionToken) {
      rawSessionToken = request.headers.get('X-Session-Token');
    }

    if (!rawSessionToken) {
      try {
        const body = await request.json();
        if (body && body.sessionToken) {
          rawSessionToken = String(body.sessionToken).trim();
        }
      } catch (e) {}
    }

    if (rawSessionToken && env.DB) {
      const sessionHash = await hashToken(rawSessionToken);
      await env.DB.prepare('DELETE FROM user_sessions WHERE session_hash = ?').bind(sessionHash).run();
    }

    const headers = new Headers(corsHeaders);
    headers.set('Set-Cookie', 'podcast_session=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT');

    return new Response(JSON.stringify({ success: true }), {
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
