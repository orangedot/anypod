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
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS'
  };

  if (!term.trim()) {
    return new Response(JSON.stringify({ resultCount: 0, results: [] }), {
      headers: corsHeaders
    });
  }

  // 1. Edge cache lookup (normalized key without client cookies/headers)
  const cache = typeof caches !== 'undefined' && caches.default ? caches.default : null;
  const normUrl = new URL(url.origin + url.pathname);
  normUrl.searchParams.set('term', term.trim().toLowerCase());
  if (country && country !== 'all') normUrl.searchParams.set('country', country.toLowerCase());
  normUrl.searchParams.set('limit', String(limit));
  const cacheKey = new Request(normUrl.toString(), { method: 'GET' });
  if (cache) {
    try {
      const cached = await cache.match(cacheKey);
      if (cached) return cached;
    } catch (_) {}
  }

  const countryParam = (country && country !== 'all') ? `&country=${encodeURIComponent(country)}` : '';
  const itunesUrl = `https://itunes.apple.com/search?term=${encodeURIComponent(term.trim())}&entity=podcast${countryParam}&limit=${encodeURIComponent(limit)}`;

  try {
    const res = await fetch(itunesUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json'
      }
    });

    if (!res.ok) {
      // Graceful fallback on rate limits (429/403) or upstream errors:
      return new Response(JSON.stringify({ resultCount: 0, results: [], rateLimited: true, upstreamStatus: res.status }), {
        status: 200,
        headers: {
          ...corsHeaders,
          'Cache-Control': 'no-store'
        }
      });
    }

    const data = await res.text();
    const parsed = JSON.parse(data);
    const hasResults = parsed.results && parsed.results.length > 0;

    const response = new Response(data, {
      headers: {
        ...corsHeaders,
        'Cache-Control': hasResults ? 'public, max-age=3600, s-maxage=3600' : 'no-store'
      }
    });

    if (cache && hasResults) {
      try {
        context.waitUntil(cache.put(cacheKey, response.clone()));
      } catch (_) {}
    }

    return response;
  } catch (err) {
    return new Response(JSON.stringify({ resultCount: 0, results: [], error: err.message }), {
      status: 200,
      headers: {
        ...corsHeaders,
        'Cache-Control': 'no-store'
      }
    });
  }
}