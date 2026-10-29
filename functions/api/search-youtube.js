// Cloudflare Pages Function: /api/search-youtube
// Searches YouTube and YouTube Music without requiring API keys.
// Returns normalized video and music objects compatible with Anypod's player engine.
// Caches results at the Cloudflare edge for 30 minutes.

export async function onRequestGet(context) {
  const { request } = context;
  const url = new URL(request.url);
  const q = url.searchParams.get('q') || url.searchParams.get('query') || url.searchParams.get('term') || '';
  const type = url.searchParams.get('type') || 'all'; // 'all' | 'video' | 'music'
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '30', 10), 50);

  const corsHeaders = {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Session-Token'
  };

  if (!q.trim()) {
    return new Response(JSON.stringify({ query: '', results: [] }), {
      headers: corsHeaders
    });
  }

  // 1. Edge cache lookup
  const cache = typeof caches !== 'undefined' && caches.default ? caches.default : null;
  const cacheKey = new Request(url.toString(), request);
  if (cache) {
    try {
      const cached = await cache.match(cacheKey);
      if (cached) return cached;
    } catch (_) {}
  }

  try {
    const results = [];
    const searchTasks = [];

    if (type === 'all' || type === 'video') {
      searchTasks.push(fetchYtSearchResults(q, 'youtube', Math.ceil(limit / (type === 'all' ? 2 : 1))));
    }
    if (type === 'all' || type === 'music') {
      searchTasks.push(fetchYtSearchResults(q, 'youtube_music', Math.ceil(limit / (type === 'all' ? 2 : 1))));
    }

    const settled = await Promise.allSettled(searchTasks);
    for (const res of settled) {
      if (res.status === 'fulfilled' && Array.isArray(res.value)) {
        results.push(...res.value);
      }
    }

    // Deduplicate by video ID
    const seen = new Set();
    const unique = [];
    for (const item of results) {
      if (item && item.id && !seen.has(item.id)) {
        seen.add(item.id);
        unique.push(item);
      }
    }

    const responseData = {
      query: q,
      count: unique.length,
      results: unique.slice(0, limit)
    };

    const hasResults = unique.length > 0;
    const response = new Response(JSON.stringify(responseData), {
      headers: {
        ...corsHeaders,
        'Cache-Control': hasResults ? 'public, max-age=1800, s-maxage=1800' : 'no-store'
      }
    });

    if (cache && hasResults) {
      try {
        context.waitUntil(cache.put(cacheKey, response.clone()));
      } catch (_) {}
    }

    return response;
  } catch (err) {
    return new Response(JSON.stringify({ query: q, results: [], error: err.message }), {
      status: 200,
      headers: {
        ...corsHeaders,
        'Cache-Control': 'no-store'
      }
    });
  }
}

async function fetchYtSearchResults(query, type = 'youtube', maxCount = 20) {
  const isMusic = type === 'youtube_music';
  // For music, append audio keywords to favor official tracks & audio streams
  const searchQuery = isMusic ? `${query} audio official` : query;
  const ytUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(searchQuery)}&hl=en`;

  const headers = {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9'
  };

  const res = await fetch(ytUrl, {
    headers,
    signal: (typeof AbortSignal !== 'undefined' && AbortSignal.timeout) ? AbortSignal.timeout(7500) : undefined
  });

  if (!res.ok) return [];

  const html = await res.text();
  const match = html.match(/var ytInitialData\s*=\s*({.+?});<\/script>/s) || html.match(/ytInitialData\s*=\s*({.+?});/s);
  if (!match) return [];

  let data;
  try {
    data = JSON.parse(match[1]);
  } catch (_) {
    return [];
  }

  const items = [];
  try {
    const contents = data?.contents?.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer?.contents || [];
    for (const section of contents) {
      const sectionContents = section?.itemSectionRenderer?.contents || [];
      for (const item of sectionContents) {
        const vr = item?.videoRenderer || item?.compactVideoRenderer;
        if (!vr || !vr.videoId) continue;

        const videoId = vr.videoId;
        const title = vr.title?.runs?.map(r => r.text).join('') || vr.title?.simpleText || 'Untitled';
        const author = vr.ownerText?.runs?.map(r => r.text).join('') || vr.longBylineText?.runs?.map(r => r.text).join('') || vr.shortBylineText?.runs?.map(r => r.text).join('') || (isMusic ? 'YouTube Music' : 'YouTube');
        const durationStr = vr.lengthText?.simpleText || vr.lengthText?.runs?.map(r => r.text).join('') || '';
        const thumbnails = vr.thumbnail?.thumbnails || [];
        const thumbnail = thumbnails[thumbnails.length - 1]?.url || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
        const viewCount = vr.viewCountText?.simpleText || vr.shortViewCountText?.simpleText || '';

        // Calculate approximate duration in seconds
        let durationSec = 0;
        if (durationStr) {
          const parts = durationStr.split(':').map(p => parseInt(p, 10));
          if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
            durationSec = parts[0] * 60 + parts[1];
          } else if (parts.length === 3 && !isNaN(parts[0]) && !isNaN(parts[1]) && !isNaN(parts[2])) {
            durationSec = parts[0] * 3600 + parts[1] * 60 + parts[2];
          }
        }

        items.push({
          id: videoId,
          guid: `yt:${videoId}`,
          title,
          author,
          podcastTitle: author,
          duration: durationStr,
          durationSec,
          artwork: thumbnail,
          audioUrl: `https://www.youtube.com/watch?v=${videoId}`,
          type, // 'youtube' | 'youtube_music'
          isYouTube: true,
          viewCount,
          pubDate: vr.publishedTimeText?.simpleText || ''
        });

        if (items.length >= maxCount) break;
      }
      if (items.length >= maxCount) break;
    }
  } catch (_) {}

  return items;
}
