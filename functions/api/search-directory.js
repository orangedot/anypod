// Cloudflare Pages Function: /api/search-directory
// Proxies iTunes Search API so client ad-blockers and privacy extensions don't block directory search.
// Caches responses at the Cloudflare edge for 1 hour.

export async function onRequestGet({ request }) {
  const url = new URL(request.url);
  const term = url.searchParams.get('term') || url.searchParams.get('q') || '';
  const country = url.searchParams.get('country') || '';
  const limit = url.searchParams.get('limit') || '100';

  if (!term.trim()) {
    return new Response(JSON.stringify({ resultCount: 0, results: [] }), {
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });
  }

  const countryParam = (country && country !== 'all') ? `&country=${encodeURIComponent(country)}` : '';
  const itunesUrl = `https://itunes.apple.com/search?term=${encodeURIComponent(term.trim())}&entity=podcast${countryParam}&limit=${encodeURIComponent(limit)}`;

  try {
    const res = await fetch(itunesUrl, {
      headers: {
        'User-Agent': 'Anypod/1.0 (+https://anypod.org)'
      }
    });

    if (!res.ok) {
      return new Response(JSON.stringify({ error: `iTunes API returned status ${res.status}` }), {
        status: res.status,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      });
    }

    const data = await res.text();
    return new Response(data, {
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=3600, s-maxage=3600'
      }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });
  }
}
