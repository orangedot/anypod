import { isValidExternalUrl } from './utils.js';

export async function onRequest(context) {
  const { request } = context;
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Range',
    'Content-Type': 'text/vtt; charset=utf-8',
    'Cache-Control': 'public, max-age=86400, s-maxage=604800'
  };

  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders, status: 204 });
  }

  const url = new URL(request.url);
  const targetUrl = url.searchParams.get('url');

  if (!targetUrl || !isValidExternalUrl(targetUrl)) {
    return new Response('Invalid or missing transcript url', {
      headers: { ...corsHeaders, 'Content-Type': 'text/plain' },
      status: 400
    });
  }

  try {
    const upstreamRes = await fetch(targetUrl, {
      headers: {
        'User-Agent': 'Anypod/1.0 (+https://anypod.org)',
        'Accept': 'text/vtt, text/plain, application/x-subrip, */*'
      },
      cf: {
        cacheEverything: true,
        cacheTtl: 604800 // 7 days edge cache
      }
    });

    if (!upstreamRes.ok) {
      return new Response(`Upstream transcript error: ${upstreamRes.status}`, {
        headers: { ...corsHeaders, 'Content-Type': 'text/plain' },
        status: upstreamRes.status
      });
    }

    const text = await upstreamRes.text();
    // Limit transcript size to 2MB to prevent memory abuse
    const trimmed = text.length > 2000000 ? text.substring(0, 2000000) : text;

    return new Response(trimmed, {
      headers: corsHeaders,
      status: 200
    });
  } catch (err) {
    return new Response(`Failed to fetch transcript: ${err.message}`, {
      headers: { ...corsHeaders, 'Content-Type': 'text/plain' },
      status: 502
    });
  }
}
