// Cloudflare Pages Function: /api/search-directory
// Proxies iTunes Search API so client ad-blockers and privacy extensions don't block directory search.
// Caches responses at the Cloudflare edge for 1 hour.
// Handles iTunes 429 rate-limiting gracefully without throwing client-facing network errors.

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

  // Edge cache lookup
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
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'application/json'
      }
    });

    if (!res.ok) {
      if (res.status === 429) {
        // iTunes rate-limited: return empty results instead of crashing client with 429 status
        return new Response(JSON.stringify({ resultCount: 0, results: [], rateLimited: true }), {
          status: 200,
          headers: {
            ...corsHeaders,
            'Cache-Control': 'public, max-age=60'
          }
        });
      }
      return new Response(JSON.stringify({ error: `Directory upstream status ${res.status}` }), {
        status: res.status,
        headers: corsHeaders
      });
    }

    const data = await res.text();
    const response = new Response(data, {
      headers: {
        ...corsHeaders,
        'Cache-Control': 'public, max-age=3600, s-maxage=3600'
      }
    });

    try {
      context.waitUntil(cache.put(cacheKey, response.clone()));
    } catch (_) {}

    return response;
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: corsHeaders
    });
  }
}
