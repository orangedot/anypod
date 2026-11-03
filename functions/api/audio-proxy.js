import { isValidExternalUrl } from './utils.js';

export async function onRequest(context) {
  const { request } = context;
  const urlParams = new URL(request.url).searchParams;
  const targetUrl = urlParams.get('url');

  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
    'Access-Control-Allow-Headers': 'Range, Content-Type, X-Session-Token',
    'Access-Control-Expose-Headers': 'Content-Range, Content-Length, Accept-Ranges, Content-Type, X-Batch-Lengths, X-Total-Bytes'
  };

  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders, status: 204 });
  }

  if (!targetUrl || !isValidExternalUrl(targetUrl)) {
    return new Response('Invalid or disallowed url parameter', { status: 400, headers: corsHeaders });
  }

  // Batched Multi-Range Probe Mode (?ranges=0-65535,500000-565535,...)
  // Collapses 16 individual AudioClassifier range requests into 1 Worker invocation!
  const rangesParam = urlParams.get('ranges');
  if (request.method === 'GET' && rangesParam) {
    const cache = typeof caches !== 'undefined' && caches.default ? caches.default : null;
    const cacheKey = new Request(new URL(request.url).toString(), { method: 'GET' });
    if (cache) {
      try {
        const cachedBatch = await cache.match(cacheKey);
        if (cachedBatch) return cachedBatch;
      } catch (_) {}
    }

    const rawPairs = rangesParam
      .split(',')
      .map(s => s.trim())
      .filter(s => /^\d+-\d+$/.test(s))
      .slice(0, 16);

    if (rawPairs.length === 0) {
      return new Response('Invalid ranges parameter', { status: 400, headers: corsHeaders });
    }

    try {
      let detectedTotalBytes = 0;
      const sliceBuffers = await Promise.all(
        rawPairs.map(async (pair) => {
          try {
            const res = await fetch(targetUrl, {
              method: 'GET',
              headers: {
                'Range': `bytes=${pair}`,
                'User-Agent': 'Anypod/1.0 (+CloudflarePages)'
              }
            });
            if (!detectedTotalBytes) {
              const cr = res.headers.get('content-range') || '';
              const m = cr.match(/\/(\d+)$/);
              if (m && parseInt(m[1], 10) > 100000) {
                detectedTotalBytes = parseInt(m[1], 10);
              }
            }
            if (res.ok || res.status === 206) {
              const ab = await res.arrayBuffer();
              return new Uint8Array(ab);
            }
          } catch (_) {}
          return new Uint8Array(0);
        })
      );

      const lengths = sliceBuffers.map(b => b.byteLength);
      const totalLength = lengths.reduce((acc, n) => acc + n, 0);
      const packed = new Uint8Array(totalLength);
      let offset = 0;
      for (const buf of sliceBuffers) {
        if (buf.byteLength > 0) {
          packed.set(buf, offset);
          offset += buf.byteLength;
        }
      }

      const batchHeaders = new Headers(corsHeaders);
      batchHeaders.set('Content-Type', 'application/octet-stream');
      batchHeaders.set('X-Batch-Lengths', lengths.join(','));
      if (detectedTotalBytes > 0) {
        batchHeaders.set('X-Total-Bytes', String(detectedTotalBytes));
      }
      batchHeaders.set('Cache-Control', 'public, max-age=86400, s-maxage=604800, stale-while-revalidate=86400');

      const batchRes = new Response(packed.buffer, { status: 200, headers: batchHeaders });
      if (cache && totalLength > 0) {
        try { context.waitUntil(cache.put(cacheKey, batchRes.clone())); } catch (_) {}
      }
      return batchRes;
    } catch (err) {
      return new Response('Batch probe error: ' + err.message, { status: 502, headers: corsHeaders });
    }
  }

  try {
    const upstreamHeaders = new Headers();
    const range = request.headers.get('range');
    if (range) {
      upstreamHeaders.set('Range', range);
    }
    upstreamHeaders.set('User-Agent', 'Anypod/1.0 (+CloudflarePages)');

    const upstreamResponse = await fetch(targetUrl, {
      method: request.method,
      headers: upstreamHeaders
    });

    const responseHeaders = new Headers(corsHeaders);
    const forwardHeaderNames = [
      'content-type',
      'content-length',
      'content-range',
      'accept-ranges',
      'last-modified',
      'etag'
    ];

    forwardHeaderNames.forEach((name) => {
      const val = upstreamResponse.headers.get(name);
      if (val) {
        responseHeaders.set(name, val);
      }
    });

    if (!responseHeaders.has('accept-ranges')) {
      responseHeaders.set('accept-ranges', 'bytes');
    }

    // Cache successful static media segments on Cloudflare CDN edge to prevent CPU exhaustion
    // (RFC 7234: 200 OK and 206 Partial Content are both cacheable when public headers are present)
    if (upstreamResponse.status === 200 || upstreamResponse.status === 206) {
      if (!responseHeaders.has('cache-control')) {
        responseHeaders.set('Cache-Control', 'public, max-age=86400, s-maxage=604800, stale-while-revalidate=86400');
      }
    }

    const responseBody = request.method === 'HEAD' ? null : upstreamResponse.body;

    return new Response(responseBody, {
      status: upstreamResponse.status,
      statusText: upstreamResponse.statusText,
      headers: responseHeaders
    });
  } catch (err) {
    return new Response('Proxy fetch error: ' + err.message, { status: 502, headers: corsHeaders });
  }
}
