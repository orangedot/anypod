import { getUserFromRequest, getCorsHeaders } from '../utils.js';
import { enforceStudioRateLimit, checkCreatorBillingQuota } from '../../../workers/studio-private/index.js';

function sanitizeSlug(raw) {
  return String(raw || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

export async function onRequestOptions(context) {
  return new Response(null, {
    status: 204,
    headers: getCorsHeaders(context.request, 'GET, POST, PUT, OPTIONS')
  });
}

export async function onRequest(context) {
  const { request, env } = context;
  const method = request.method.toUpperCase();
  const headers = getCorsHeaders(request, 'GET, POST, PUT, OPTIONS');

  if (method === 'OPTIONS') {
    return new Response(null, { status: 204, headers });
  }

  if (!env || !env.DB) {
    return new Response(JSON.stringify({ error: 'Database unavailable' }), { status: 503, headers });
  }

  const url = new URL(request.url);

  if (method === 'GET') {
    const slug = sanitizeSlug(url.searchParams.get('slug'));
    if (slug) {
      const show = await env.DB.prepare(
        'SELECT id, owner_id, slug, title, description, author, email, cover_image_url, language, category, explicit, website_url, created_at FROM shows WHERE slug = ?'
      ).bind(slug).first();
      if (!show) {
        return new Response(JSON.stringify({ error: 'Show not found' }), { status: 404, headers });
      }
      return new Response(JSON.stringify({ show }), { status: 200, headers });
    }

    const user = await getUserFromRequest(request, env);
    if (!user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers });
    }

    const rows = await env.DB.prepare(
      'SELECT id, owner_id, slug, title, description, author, email, cover_image_url, language, category, explicit, website_url, created_at FROM shows WHERE owner_id = ? ORDER BY created_at DESC'
    ).bind(user.id).all();

    return new Response(JSON.stringify({ shows: rows?.results || [] }), { status: 200, headers });
  }

  if (method === 'POST' || method === 'PUT') {
    const user = await getUserFromRequest(request, env);
    if (!user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers });
    }

    const rateCheck = enforceStudioRateLimit(`shows:${user.id}`, 20);
    if (!rateCheck.allowed) {
      return new Response(JSON.stringify({ error: 'Rate limit exceeded' }), { status: 429, headers });
    }

    let body = {};
    try {
      body = await request.json();
    } catch (_) {
      return new Response(JSON.stringify({ error: 'Invalid JSON body' }), { status: 400, headers });
    }

    const title = String(body.title || '').trim();
    const slug = sanitizeSlug(body.slug || title);
    if (!title || !slug) {
      return new Response(JSON.stringify({ error: 'Title and valid slug are required' }), { status: 400, headers });
    }

    const existing = await env.DB.prepare('SELECT id, owner_id FROM shows WHERE slug = ?').bind(slug).first();
    if (existing && existing.owner_id !== user.id) {
      return new Response(JSON.stringify({ error: 'Slug is already taken by another creator' }), { status: 409, headers });
    }

    const quota = await checkCreatorBillingQuota(user, env, 0, { newShow: !existing });
    if (!quota.allowed) {
      return new Response(JSON.stringify({ error: quota.reason || 'Billing quota exceeded', code: quota.code, plan: quota.plan }), { status: 402, headers });
    }

    const id = existing ? existing.id : (body.id || crypto.randomUUID());
    const description = String(body.description || '').trim();
    const author = String(body.author || user.email).trim();
    const email = String(body.email || user.email).trim();
    const coverImageUrl = String(body.cover_image_url || body.coverImageUrl || '').trim();
    const language = String(body.language || 'en').trim();
    const category = String(body.category || 'Technology').trim();
    const explicit = body.explicit ? 1 : 0;
    const websiteUrl = String(body.website_url || body.websiteUrl || '').trim();
    const now = Math.floor(Date.now() / 1000);

    if (existing) {
      await env.DB.prepare(
        'UPDATE shows SET title = ?, description = ?, author = ?, email = ?, cover_image_url = ?, language = ?, category = ?, explicit = ?, website_url = ? WHERE id = ? AND owner_id = ?'
      ).bind(title, description, author, email, coverImageUrl, language, category, explicit, websiteUrl, id, user.id).run();
    } else {
      await env.DB.prepare(
        'INSERT INTO shows (id, owner_id, slug, title, description, author, email, cover_image_url, language, category, explicit, website_url, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
      ).bind(id, user.id, slug, title, description, author, email, coverImageUrl, language, category, explicit, websiteUrl, now).run();
    }

    const saved = await env.DB.prepare('SELECT * FROM shows WHERE id = ?').bind(id).first();
    return new Response(JSON.stringify({ show: saved }), { status: existing ? 200 : 201, headers });
  }

  return new Response(JSON.stringify({ error: 'Method Not Allowed' }), { status: 405, headers });
}
