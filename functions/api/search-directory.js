// Cloudflare Pages Function: /api/search-directory
// Proxies iTunes Search API so client ad-blockers and privacy extensions don't block directory search.
// Caches successful responses at the Cloudflare edge for 1 hour.

export async function onRequestGet(context) {
  const { request } = context;
  const url = new URL(request.url);
  const term = url.searchParams.get('term') || url.searchParams.get('q') || '';
  const country = url.searchParams.get('country') || '';
  const limit = url.searchParams.get('limit') || '50';

  const corsHeaders = {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*'
  };

  if (!term.trim()) {
    return new Response(JSON.stringify({ resultCount: 0, results: [] }), {
      headers: corsHeaders
    });
  }

  // 1. Edge cache lookup
  const cache = caches.default;
  const cacheKey = new Request(url.toString(), request);
  try {
    const cached = await cache.match(cacheKey);
    if (cached) return cached;
  } catch (_) {}

  const countryParam = (country && country !== 'all') ? `&country=${encodeURIComponent(country)}` : '';
  const itunesUrl = `https://itunes.apple.com/search?term=${encodeURIComponent(term.trim())}&entity=podcast${countryParam}&limit=${encodeURIComponent(limit)}`;

  try {
    const res = await fetch(itunesUrl, {
      headers: {
        'User-Agent': 'Anypod/1.0 (+https://anypod.org)',
        'Accept': 'application/json'
      }
    });

    if (!res.ok) {
      // Return upstream status (e.g., 429) so app.js knows to fall back to direct browser fetch
      return new Response(JSON.stringify({ error: `Directory upstream status ${res.status}`, rateLimited: res.status === 429 }), {
        status: res.status,
        headers: {
          ...corsHeaders,
          'Cache-Control': 'no-store'
        }
      });
    }

    const data = await res.text();
    const parsed = JSON.parse(data);

    // Only cache if iTunes actually returned results
    const hasResults = parsed.results && parsed.results.length > 0;
    const response = new Response(data, {
      headers: {
        ...corsHeaders,
        'Cache-Control': hasResults ? 'public, max-age=3600, s-maxage=3600' : 'no-store'
      }
    });

    if (hasResults) {
      try {
        context.waitUntil(cache.put(cacheKey, response.clone()));
      } catch (_) {}
    }

    return response;
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: corsHeaders
    });
  }
}