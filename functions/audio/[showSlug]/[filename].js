const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
  'Access-Control-Allow-Headers': 'Range, If-Range, If-None-Match, Content-Type',
  'Access-Control-Expose-Headers': 'Content-Range, Content-Length, Accept-Ranges, ETag, Content-Type',
  'Access-Control-Max-Age': '86400'
};

function inferContentType(filename, storedType) {
  if (storedType) return storedType;
  const lower = String(filename || '').toLowerCase();
  if (lower.endsWith('.mp3')) return 'audio/mpeg';
  if (lower.endsWith('.m4a') || lower.endsWith('.mp4')) return 'audio/mp4';
  if (lower.endsWith('.ogg') || lower.endsWith('.oga') || lower.endsWith('.opus')) return 'audio/ogg';
  if (lower.endsWith('.wav')) return 'audio/wav';
  if (lower.endsWith('.aac')) return 'audio/aac';
  if (lower.endsWith('.vtt')) return 'text/vtt; charset=utf-8';
  if (lower.endsWith('.json')) return 'application/json+chapters; charset=utf-8';
  return 'application/octet-stream';
}

export function parseByteRangeHeader(rangeHeader, totalSize) {
  if (!rangeHeader || !rangeHeader.startsWith('bytes=')) {
    return null;
  }
  const spec = rangeHeader.slice(6).trim().split(',')[0].trim();
  const dashIdx = spec.indexOf('-');
  if (dashIdx === -1) {
    return { invalid: true };
  }

  const startStr = spec.slice(0, dashIdx).trim();
  const endStr = spec.slice(dashIdx + 1).trim();

  if (startStr === '' && endStr === '') {
    return { invalid: true };
  }

  if (startStr === '') {
    const suffixLength = parseInt(endStr, 10);
    if (isNaN(suffixLength) || suffixLength <= 0 || totalSize === 0) {
      return { invalid: true };
    }
    const length = Math.min(suffixLength, totalSize);
    const start = totalSize - length;
    const end = totalSize - 1;
    return { start, end, length, r2Range: { suffix: length } };
  }

  const start = parseInt(startStr, 10);
  if (isNaN(start) || start < 0 || start >= totalSize) {
    return { invalid: true };
  }

  let end = totalSize - 1;
  if (endStr !== '') {
    const parsedEnd = parseInt(endStr, 10);
    if (isNaN(parsedEnd) || parsedEnd < start) {
      return { invalid: true };
    }
    end = Math.min(parsedEnd, totalSize - 1);
  }

  const length = end - start + 1;
  return { start, end, length, r2Range: { offset: start, length } };
}

async function hashToken(token) {
  const encoder = new TextEncoder();
  const data = encoder.encode(token);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

function parseTokenFromRequest(request) {
  const url = new URL(request.url);
  const queryToken = url.searchParams.get('token');
  if (queryToken && queryToken.trim()) return queryToken.trim();

  const authHeader = request.headers.get('Authorization') || '';
  if (authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7).trim();
  }
  if (authHeader.startsWith('Basic ')) {
    try {
      const b64 = authHeader.slice(6).trim();
      const decoded = atob(b64);
      const colonIdx = decoded.indexOf(':');
      if (colonIdx !== -1) {
        const user = decoded.slice(0, colonIdx).trim();
        const pass = decoded.slice(colonIdx + 1).trim();
        return pass || user;
      }
      return decoded.trim();
    } catch (_) {}
  }
  return null;
}

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: CORS_HEADERS
  });
}

export async function onRequest(context) {
  const { request, env, params } = context;
  const method = request.method.toUpperCase();

  if (method === 'OPTIONS') {
    return onRequestOptions();
  }

  if (method !== 'GET' && method !== 'HEAD') {
    return new Response(JSON.stringify({ error: 'Method Not Allowed' }), {
      status: 405,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json; charset=utf-8' }
    });
  }

  const showSlug = String(params?.showSlug || '').trim();
  const filename = String(params?.filename || '').trim();

  if (!showSlug || !filename || showSlug.includes('..') || filename.includes('..')) {
    return new Response(JSON.stringify({ error: 'Invalid audio path' }), {
      status: 400,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json; charset=utf-8' }
    });
  }

  if (!env || !env.AUDIO_BUCKET) {
    return new Response(JSON.stringify({ error: 'Audio storage bucket is not configured' }), {
      status: 503,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json; charset=utf-8' }
    });
  }

  if (env && env.DB) {
    const show = await env.DB.prepare('SELECT id, is_private FROM shows WHERE slug = ?').bind(showSlug).first();
    if (show && show.is_private) {
      const feedToken = parseTokenFromRequest(request);
      if (!feedToken) {
        return new Response(JSON.stringify({ error: 'Unauthorized: Private show audio requires a valid subscriber token' }), {
          status: 401,
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json; charset=utf-8' }
        });
      }
      const tokenHash = await hashToken(feedToken);
      const validToken = await env.DB.prepare(
        'SELECT id FROM show_feed_tokens WHERE show_id = ? AND token_hash = ? AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at > unixepoch())'
      ).bind(show.id, tokenHash).first();

      if (!validToken) {
        return new Response(JSON.stringify({ error: 'Forbidden: Invalid or revoked subscriber token' }), {
          status: 403,
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json; charset=utf-8' }
        });
      }
    }
  }

  const objectKey = `${showSlug}/${filename}`;
  const headObj = await env.AUDIO_BUCKET.head(objectKey);

  if (!headObj) {
    return new Response(JSON.stringify({ error: 'Audio object not found' }), {
      status: 404,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json; charset=utf-8' }
    });
  }

  const totalSize = Number(headObj.size || 0);
  const contentType = inferContentType(filename, headObj.httpMetadata?.contentType);
  const etag = headObj.httpEtag || `"${headObj.etag || objectKey}"`;
  const rangeHeader = request.headers.get('Range');
  const ifRange = request.headers.get('If-Range');

  const baseHeaders = {
    ...CORS_HEADERS,
    'Content-Type': contentType,
    'Accept-Ranges': 'bytes',
    'ETag': etag,
    'Cache-Control': 'public, max-age=86400'
  };

  const honorRange = rangeHeader && (!ifRange || ifRange === etag || ifRange === headObj.etag);

  if (honorRange) {
    const parsedRange = parseByteRangeHeader(rangeHeader, totalSize);
    if (parsedRange && parsedRange.invalid) {
      return new Response(null, {
        status: 416,
        headers: {
          ...baseHeaders,
          'Content-Range': `bytes */${totalSize}`,
          'Content-Length': '0'
        }
      });
    }

    if (parsedRange) {
      const rangeHeaders = {
        ...baseHeaders,
        'Content-Range': `bytes ${parsedRange.start}-${parsedRange.end}/${totalSize}`,
        'Content-Length': String(parsedRange.length)
      };

      if (method === 'HEAD') {
        return new Response(null, { status: 206, headers: rangeHeaders });
      }

      const rangedObj = await env.AUDIO_BUCKET.get(objectKey, { range: parsedRange.r2Range });
      if (!rangedObj || !rangedObj.body) {
        return new Response(null, { status: 404, headers: baseHeaders });
      }

      return new Response(rangedObj.body, {
        status: 206,
        headers: rangeHeaders
      });
    }
  }

  const fullHeaders = {
    ...baseHeaders,
    'Content-Length': String(totalSize)
  };

  if (method === 'HEAD') {
    return new Response(null, { status: 200, headers: fullHeaders });
  }

  const fullObj = await env.AUDIO_BUCKET.get(objectKey);
  if (!fullObj || !fullObj.body) {
    return new Response(null, { status: 404, headers: baseHeaders });
  }

  return new Response(fullObj.body, {
    status: 200,
    headers: fullHeaders
  });
}
