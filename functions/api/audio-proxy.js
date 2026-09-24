import { isValidExternalUrl } from './utils.js';

export async function onRequest(context) {
  const { request } = context;
  const urlParams = new URL(request.url).searchParams;
  const targetUrl = urlParams.get('url');

  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
    'Access-Control-Allow-Headers': 'Range, Content-Type, X-Session-Token',
    'Access-Control-Expose-Headers': 'Content-Range, Content-Length, Accept-Ranges, Content-Type'
  };

  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders, status: 204 });
  }

  if (!targetUrl || !isValidExternalUrl(targetUrl)) {
    return new Response('Invalid or disallowed url parameter', { status: 400, headers: corsHeaders });
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

    return new Response(upstreamResponse.body, {
      status: upstreamResponse.status,
      statusText: upstreamResponse.statusText,
      headers: responseHeaders
    });
  } catch (err) {
    return new Response('Proxy fetch error: ' + err.message, { status: 502, headers: corsHeaders });
  }
}
