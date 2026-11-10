import { getUserFromRequest, getCorsHeaders, canUserManageShow } from '../utils.js';
import { enforceStudioRateLimit } from '../../../workers/studio-private/index.js';

function toHex(bytes) {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function hashToken(token) {
  const encoder = new TextEncoder();
  const data = encoder.encode(token);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

function generateSecureToken() {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return toHex(bytes);
}

export async function onRequestOptions(context) {
  return new Response(null, {
    status: 204,
    headers: getCorsHeaders(context.request, 'GET, POST, DELETE, OPTIONS')
  });
}

export async function onRequest(context) {
  const { request, env } = context;
  const method = request.method.toUpperCase();
  const headers = getCorsHeaders(request, 'GET, POST, DELETE, OPTIONS');

  if (method === 'OPTIONS') {
    return new Response(null, { status: 204, headers });
  }

  if (!env || !env.DB) {
    return new Response(JSON.stringify({ error: 'Database unavailable' }), { status: 503, headers });
  }

  const user = await getUserFromRequest(request, env);
  if (!user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers });
  }

  const rateCheck = enforceStudioRateLimit(`tokens:${user.id}`, 30);
  if (!rateCheck.allowed) {
    return new Response(JSON.stringify({ error: 'Rate limit exceeded' }), { status: 429, headers });
  }

  const url = new URL(request.url);

  // --- GET: List tokens for a show ---
  if (method === 'GET') {
    const showId = url.searchParams.get('showId');
    const showSlug = url.searchParams.get('showSlug') || url.searchParams.get('slug');

    let show = null;
    if (showId) {
      show = await env.DB.prepare('SELECT id, owner_id, slug, title, is_private FROM shows WHERE id = ?').bind(showId).first();
    } else if (showSlug) {
      show = await env.DB.prepare('SELECT id, owner_id, slug, title, is_private FROM shows WHERE slug = ?').bind(showSlug.trim().toLowerCase()).first();
    }

    if (!show) {
      return new Response(JSON.stringify({ error: 'Show not found' }), { status: 404, headers });
    }

    const isOwner = await canUserManageShow(env, user, show);
    if (!isOwner) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers });
    }

    const rows = await env.DB.prepare(
      `SELECT id, show_id, subscriber_label, token_preview, created_at, expires_at, revoked_at
       FROM show_feed_tokens
       WHERE show_id = ?
       ORDER BY created_at DESC`
    ).bind(show.id).all();

    const baseUrl = (env && env.APP_URL) || url.origin;
    const tokens = (rows?.results || []).map(r => ({
      ...r,
      feed_url_preview: `${baseUrl}/feeds/${encodeURIComponent(show.slug)}.xml?token=${r.token_preview}`
    }));

    return new Response(JSON.stringify({ tokens, is_private: Boolean(show.is_private) }), { status: 200, headers });
  }

  // --- POST: Issue a new subscriber feed token ---
  if (method === 'POST') {
    let body = {};
    try {
      body = await request.json();
    } catch (_) {
      return new Response(JSON.stringify({ error: 'Invalid JSON body' }), { status: 400, headers });
    }

    const showId = body.show_id || body.showId;
    const showSlug = body.show_slug || body.showSlug;

    let show = null;
    if (showId) {
      show = await env.DB.prepare('SELECT id, owner_id, slug, title, is_private FROM shows WHERE id = ?').bind(showId).first();
    } else if (showSlug) {
      show = await env.DB.prepare('SELECT id, owner_id, slug, title, is_private FROM shows WHERE slug = ?').bind(showSlug.trim().toLowerCase()).first();
    }

    if (!show) {
      return new Response(JSON.stringify({ error: 'Show not found' }), { status: 404, headers });
    }

    const isOwner = await canUserManageShow(env, user, show);
    if (!isOwner) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers });
    }

    const label = String(body.subscriber_label || body.label || '').trim();
    if (!label) {
      return new Response(JSON.stringify({ error: 'subscriber_label is required (e.g. employee name or subscriber email)' }), { status: 400, headers });
    }

    const rawToken = generateSecureToken();
    const tokenHash = await hashToken(rawToken);
    const tokenPreview = `${rawToken.slice(0, 8)}...`;
    const tokenId = crypto.randomUUID();
    const now = Math.floor(Date.now() / 1000);

    const expiresInDays = body.expires_in_days ? parseInt(body.expires_in_days, 10) : null;
    const expiresAt = expiresInDays && expiresInDays > 0 ? now + (expiresInDays * 86400) : null;

    await env.DB.prepare(
      `INSERT INTO show_feed_tokens (id, show_id, subscriber_label, token_hash, token_preview, created_at, expires_at, revoked_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, NULL)`
    ).bind(tokenId, show.id, label, tokenHash, tokenPreview, now, expiresAt).run();

    // Automatically mark the show as private if not already marked
    if (!show.is_private) {
      await env.DB.prepare('UPDATE shows SET is_private = 1 WHERE id = ?').bind(show.id).run();
    }

    const baseUrl = (env && env.APP_URL) || url.origin;
    const feedUrl = `${baseUrl}/feeds/${encodeURIComponent(show.slug)}.xml?token=${rawToken}`;

    return new Response(JSON.stringify({
      token: {
        id: tokenId,
        show_id: show.id,
        subscriber_label: label,
        token_preview: tokenPreview,
        raw_token: rawToken,
        feed_url: feedUrl,
        created_at: now,
        expires_at: expiresAt
      }
    }), { status: 201, headers });
  }

  // --- DELETE: Revoke a subscriber feed token ---
  if (method === 'DELETE') {
    const tokenId = url.searchParams.get('id') || url.searchParams.get('tokenId');
    if (!tokenId) {
      return new Response(JSON.stringify({ error: 'Token id is required' }), { status: 400, headers });
    }

    const tokenRow = await env.DB.prepare(
      `SELECT t.id, t.show_id, s.owner_id
       FROM show_feed_tokens t
       JOIN shows s ON t.show_id = s.id
       WHERE t.id = ?`
    ).bind(tokenId).first();

    if (!tokenRow) {
      return new Response(JSON.stringify({ error: 'Token not found' }), { status: 404, headers });
    }

    const show = await env.DB.prepare('SELECT id, owner_id FROM shows WHERE id = ?').bind(tokenRow.show_id).first();
    const isOwner = await canUserManageShow(env, user, show);
    if (!isOwner) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers });
    }

    const now = Math.floor(Date.now() / 1000);
    await env.DB.prepare('UPDATE show_feed_tokens SET revoked_at = ? WHERE id = ?').bind(now, tokenId).run();

    return new Response(JSON.stringify({ success: true, revoked_id: tokenId, revoked_at: now }), { status: 200, headers });
  }

  return new Response(JSON.stringify({ error: 'Method Not Allowed' }), { status: 405, headers });
}
