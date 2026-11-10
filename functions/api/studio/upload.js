import { getUserFromRequest, getCorsHeaders, canUserManageShow } from '../utils.js';
import {
  enforceStudioRateLimit,
  checkCreatorBillingQuota,
  createSignedUploadTicket,
  verifySignedUploadTicket
} from '../../../workers/studio-private/index.js';

const ALLOWED_EXTENSIONS = new Set(['.mp3', '.m4a', '.mp4', '.wav', '.ogg', '.aac', '.vtt', '.json', '.jpg', '.jpeg', '.png', '.webp']);

function sanitizeFilename(name) {
  const cleaned = String(name || 'asset.bin')
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return cleaned || 'asset.bin';
}

function getExtension(filename) {
  const idx = filename.lastIndexOf('.');
  return idx === -1 ? '' : filename.slice(idx).toLowerCase();
}

function resolveContentType(ext, providedType) {
  if (ext === '.mp3') return 'audio/mpeg';
  if (ext === '.m4a' || ext === '.mp4') return 'audio/mp4';
  if (ext === '.wav') return 'audio/wav';
  if (ext === '.ogg') return 'audio/ogg';
  if (ext === '.aac') return 'audio/aac';
  if (ext === '.vtt') return 'text/vtt; charset=utf-8';
  if (ext === '.json') return 'application/json+chapters; charset=utf-8';
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  if (ext === '.png') return 'image/png';
  if (ext === '.webp') return 'image/webp';
  return providedType || 'application/octet-stream';
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
  const sig = url.searchParams.get('sig');

  if ((method === 'PUT' || method === 'POST') && sig) {
    const objectKey = url.searchParams.get('key') || '';
    const showSlug = url.searchParams.get('slug') || '';
    const contentType = url.searchParams.get('type') || request.headers.get('Content-Type') || 'application/octet-stream';
    const byteSize = Number(url.searchParams.get('size') || 0);
    const userId = url.searchParams.get('uid') || '';
    const expiresAt = Number(url.searchParams.get('exp') || 0);

    const validTicket = await verifySignedUploadTicket({
      showSlug,
      objectKey,
      contentType,
      byteSize,
      userId,
      expiresAt,
      signature: sig
    }, env);

    if (!validTicket) {
      return new Response(JSON.stringify({ error: 'Invalid or expired upload signature' }), { status: 403, headers });
    }

    if (!env.AUDIO_BUCKET) {
      return new Response(JSON.stringify({ error: 'R2 AUDIO_BUCKET binding not configured' }), { status: 503, headers });
    }

    const arrayBuf = await request.arrayBuffer();
    const actualSize = arrayBuf.byteLength;

    await env.AUDIO_BUCKET.put(objectKey, arrayBuf, {
      httpMetadata: { contentType }
    });

    const baseUrl = (env && env.APP_URL) || url.origin;
    const relativeName = objectKey.startsWith(`${showSlug}/`) ? objectKey.slice(showSlug.length + 1) : objectKey;
    const publicUrl = `${baseUrl}/audio/${encodeURIComponent(showSlug)}/${encodeURIComponent(relativeName)}`;

    return new Response(JSON.stringify({
      uploaded: true,
      objectKey,
      byteSize: actualSize,
      contentType,
      url: publicUrl
    }), { status: 200, headers });
  }

  const user = await getUserFromRequest(request, env);
  if (!user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers });
  }

  const rateCheck = enforceStudioRateLimit(`upload:${user.id}`, 30);
  if (!rateCheck.allowed) {
    return new Response(JSON.stringify({ error: 'Upload rate limit exceeded' }), { status: 429, headers });
  }

  const reqContentType = (request.headers.get('Content-Type') || '').toLowerCase();

  if (method === 'POST' && reqContentType.includes('application/json')) {
    let body = {};
    try {
      body = await request.json();
    } catch (_) {
      return new Response(JSON.stringify({ error: 'Invalid JSON body' }), { status: 400, headers });
    }

    const showSlug = String(body.showSlug || body.slug || '').trim().toLowerCase();
    const filename = sanitizeFilename(body.filename);
    const ext = getExtension(filename);

    if (!showSlug || !ALLOWED_EXTENSIONS.has(ext)) {
      return new Response(JSON.stringify({ error: 'Valid showSlug and supported file extension (.mp3, .m4a, .vtt, .json) required' }), { status: 400, headers });
    }

    const show = await env.DB.prepare('SELECT id, owner_id, slug FROM shows WHERE slug = ?').bind(showSlug).first();
    if (!show) {
      return new Response(JSON.stringify({ error: `Show "${showSlug}" does not exist. Please create your show first.`, code: 'SHOW_NOT_FOUND' }), { status: 404, headers });
    }
    const isOwner = await canUserManageShow(env, user, show);
    if (!isOwner) {
      return new Response(JSON.stringify({ error: 'You are not authorized to publish to this show', code: 'FORBIDDEN' }), { status: 403, headers });
    }

    const byteSize = Math.max(0, Number(body.byteSize || 0));
    const quota = await checkCreatorBillingQuota(user, env, byteSize);
    if (!quota.allowed) {
      return new Response(JSON.stringify({ error: quota.reason || 'Quota exceeded' }), { status: 402, headers });
    }

    const contentType = resolveContentType(ext, body.contentType);
    const prefix = body.episodeId ? `${ sanitizeFilename(body.episodeId) }-` : `${Date.now()}-`;
    const objectKey = `${show.slug}/${prefix}${filename}`;

    const ticket = await createSignedUploadTicket({
      showSlug: show.slug,
      objectKey,
      contentType,
      byteSize,
      userId: user.id
    }, env);

    return new Response(JSON.stringify({ ticket }), { status: 200, headers });
  }

  if (method === 'POST' && reqContentType.includes('multipart/form-data')) {
    if (!env.AUDIO_BUCKET) {
      return new Response(JSON.stringify({ error: 'R2 AUDIO_BUCKET binding not configured' }), { status: 503, headers });
    }

    const formData = await request.formData();
    const showSlug = String(formData.get('showSlug') || '').trim().toLowerCase();
    const file = formData.get('file');

    if (!showSlug || !file || typeof file === 'string') {
      return new Response(JSON.stringify({ error: 'showSlug and file field are required' }), { status: 400, headers });
    }

    const show = await env.DB.prepare('SELECT id, owner_id, slug FROM shows WHERE slug = ?').bind(showSlug).first();
    if (!show) {
      return new Response(JSON.stringify({ error: `Show "${showSlug}" does not exist. Please create your show first.`, code: 'SHOW_NOT_FOUND' }), { status: 404, headers });
    }
    const isOwner = await canUserManageShow(env, user, show);
    if (!isOwner) {
      return new Response(JSON.stringify({ error: 'You are not authorized to publish to this show', code: 'FORBIDDEN' }), { status: 403, headers });
    }

    const filename = sanitizeFilename(file.name);
    const ext = getExtension(filename);
    if (!ALLOWED_EXTENSIONS.has(ext)) {
      return new Response(JSON.stringify({ error: 'Unsupported file extension' }), { status: 400, headers });
    }

    const arrayBuf = await file.arrayBuffer();
    const byteSize = arrayBuf.byteLength;
    const quota = await checkCreatorBillingQuota(user, env, byteSize);
    if (!quota.allowed) {
      return new Response(JSON.stringify({ error: quota.reason || 'Quota exceeded' }), { status: 402, headers });
    }

    const contentType = resolveContentType(ext, file.type);
    const objectKey = `${show.slug}/${Date.now()}-${filename}`;

    await env.AUDIO_BUCKET.put(objectKey, arrayBuf, {
      httpMetadata: { contentType }
    });

    const baseUrl = (env && env.APP_URL) || url.origin;
    const relativeName = objectKey.slice(show.slug.length + 1);
    const publicUrl = `${baseUrl}/audio/${encodeURIComponent(show.slug)}/${encodeURIComponent(relativeName)}`;

    return new Response(JSON.stringify({
      uploaded: true,
      objectKey,
      byteSize,
      contentType,
      url: publicUrl
    }), { status: 201, headers });
  }

  return new Response(JSON.stringify({ error: 'Unsupported request format' }), { status: 400, headers });
}
