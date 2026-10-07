import { isValidExternalUrl } from './utils.js';

export async function onRequest(context) {
  const { request } = context;
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Range',
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'public, max-age=86400, s-maxage=604800'
  };

  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders, status: 204 });
  }

  const url = new URL(request.url);
  const targetUrl = url.searchParams.get('url');

  if (!targetUrl || !isValidExternalUrl(targetUrl)) {
    return new Response(JSON.stringify({ error: 'Invalid or missing chapter url' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400
    });
  }

  try {
    const upstreamRes = await fetch(targetUrl, {
      headers: {
        'User-Agent': 'Anypod/1.0 (+https://anypod.org)',
        'Accept': 'application/json, application/json+chapters, text/plain, */*'
      },
      cf: {
        cacheEverything: true,
        cacheTtl: 604800 // 7 days edge cache
      }
    });

    if (!upstreamRes.ok) {
      return new Response(JSON.stringify({ error: `Upstream chapters error: ${upstreamRes.status}` }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: upstreamRes.status
      });
    }

    const text = await upstreamRes.text();
    // Validate that it's parseable JSON
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch (parseErr) {
      return new Response(JSON.stringify({ error: `Invalid JSON returned by upstream: ${parseErr.message}` }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 502
      });
    }

    return new Response(JSON.stringify(parsed), {
      headers: corsHeaders,
      status: 200
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: `Failed to fetch chapters: ${err.message}` }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 502
    });
  }
}
