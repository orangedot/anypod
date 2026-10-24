import { getUserFromRequest, isValidExternalUrl } from './utils.js';

export async function onRequest(context) {
  const { request, env } = context;
  const reqUrl = new URL(request.url);
  const urlParams = reqUrl.searchParams;
  let targetUrl = urlParams.get('url');

  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Session-Token',
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'public, max-age=900, s-maxage=900, stale-while-revalidate=1800'
  };

  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders, status: 204 });
  }

  const cache = typeof caches !== 'undefined' && caches.default ? caches.default : null;
  const cacheKeyUrl = new URL(reqUrl.toString());
  const cacheKey = new Request(cacheKeyUrl.toString(), { method: 'GET' });

  // 0. Check Cloudflare Edge Cache for GET requests (0.1ms CPU hit)
  if (request.method === 'GET' && cache) {
    try {
      const cachedRes = await cache.match(cacheKey);
      if (cachedRes) {
        return cachedRes;
      }
    } catch (_) {}
  }

  // 1. YouTube continuation pagination requests
  const isBatch = urlParams.get('batch');
  const playlistId = urlParams.get('playlistId');
  const continuation = urlParams.get('continuation');

  if (isBatch && playlistId) {
    try {
      let batchData = await fetchYouTubePlaylistBatch(playlistId, continuation);
      if ((!batchData || batchData.episodes.length === 0) && !continuation) {
        const meta = await fetchYouTubePlaylistMetadata(playlistId);
        if (meta?.initialBatch && meta.initialBatch.episodes.length > 0) {
          batchData = meta.initialBatch;
        }
      }
      const res = new Response(JSON.stringify(batchData || { episodes: [], nextToken: null }), {
        headers: corsHeaders,
        status: 200
      });
      if (cache && batchData?.episodes?.length > 0) {
        try { context.waitUntil(cache.put(cacheKey, res.clone())); } catch (_) {}
      }
      return res;
    } catch (err) {
      return new Response(JSON.stringify({ error: err.message, episodes: [], nextToken: null }), {
        headers: corsHeaders,
        status: 500
      });
    }
  }

  // 2. Batch feed requests from subscriptions (POST /api/feed)
  if (request.method === 'POST') {
    try {
      const body = await request.json();
      if (body.urls && Array.isArray(body.urls)) {
        const validUrls = body.urls.filter(u => typeof u === 'string' && isValidExternalUrl(u)).slice(0, 25);
        const results = await Promise.allSettled(
          validUrls.map(async (u) => {
            if (cache) {
              try {
                const subKey = new Request(`${reqUrl.origin}/api/feed?url=${encodeURIComponent(u)}`, { method: 'GET' });
                const hit = await cache.match(subKey);
                if (hit) return await hit.json();
              } catch (_) {}
            }
            const parsed = await fetchAndParseFeed(u);
            if (cache && parsed && !parsed.error) {
              try {
                const subKey = new Request(`${reqUrl.origin}/api/feed?url=${encodeURIComponent(u)}`, { method: 'GET' });
                const subRes = new Response(JSON.stringify(parsed), { headers: corsHeaders, status: 200 });
                context.waitUntil(cache.put(subKey, subRes));
              } catch (_) {}
            }
            return parsed;
          })
        );
        const feeds = results
          .filter(r => r.status === 'fulfilled' && r.value)
          .map(r => r.value);
        
        return new Response(JSON.stringify({ success: true, feeds }), {
          headers: corsHeaders,
          status: 200
        });
      }
    } catch (err) {
      return new Response(JSON.stringify({ error: 'Invalid JSON body: ' + err.message }), {
        headers: corsHeaders,
        status: 400
      });
    }
  }

  // 3. Single feed validation
  if (!targetUrl || !isValidExternalUrl(targetUrl)) {
    return new Response(JSON.stringify({ 
      error: 'Invalid or disallowed feed URL parameter.' 
    }), {
      headers: corsHeaders,
      status: 400
    });
  }

  // 4. Raw XML Stream Pass-Through Mode (?raw=1) — 0ms Cloudflare XML parsing CPU!
  if (urlParams.get('raw') === '1') {
    try {
      const upstreamRes = await fetch(targetUrl, {
        headers: {
          'User-Agent': 'Anypod/1.0 (+CloudflarePages)',
          'Accept': 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*'
        },
        cf: { cacheTtl: 900, cacheEverything: true },
        signal: (typeof AbortSignal !== 'undefined' && AbortSignal.timeout) ? AbortSignal.timeout(8500) : undefined
      });
      if (!upstreamRes.ok) {
        return new Response(`Upstream HTTP ${upstreamRes.status}`, { status: upstreamRes.status, headers: corsHeaders });
      }
      const rawHeaders = {
        ...corsHeaders,
        'Content-Type': upstreamRes.headers.get('content-type') || 'application/xml; charset=utf-8'
      };
      const streamRes = new Response(upstreamRes.body, { status: 200, headers: rawHeaders });
      if (cache) {
        try { context.waitUntil(cache.put(cacheKey, streamRes.clone())); } catch (_) {}
      }
      return streamRes;
    } catch (err) {
      return new Response(JSON.stringify({ error: err.message }), { status: 502, headers: corsHeaders });
    }
  }

  // 5. Lazy On-Demand Single-Episode Full Show Notes (?guid=...&fullContent=1)
  const targetGuid = urlParams.get('guid');
  if (targetGuid && urlParams.get('fullContent') === '1') {
    try {
      const noteData = await fetchSingleEpisodeContent(targetUrl, targetGuid);
      const res = new Response(JSON.stringify(noteData), { headers: corsHeaders, status: 200 });
      if (cache && noteData.content) {
        try { context.waitUntil(cache.put(cacheKey, res.clone())); } catch (_) {}
      }
      return res;
    } catch (err) {
      return new Response(JSON.stringify({ guid: targetGuid, content: '', error: err.message }), {
        headers: corsHeaders,
        status: 200
      });
    }
  }

  try {
    const feedData = await fetchAndParseFeed(targetUrl);
    const res = new Response(JSON.stringify(feedData), {
      headers: corsHeaders,
      status: 200
    });
    if (cache && feedData && !feedData.error) {
      try { context.waitUntil(cache.put(cacheKey, res.clone())); } catch (_) {}
    }
    return res;
  } catch (error) {
    return new Response(JSON.stringify({ 
      error: error.message || 'Failed to process feed',
      title: 'Unavailable Feed',
      episodesCount: 0,
      episodes: []
    }), {
      headers: { ...corsHeaders, 'Cache-Control': 'no-store' },
      status: 200
    });
  }
}

/**
 * Safely extracts ytInitialData JSON object from YouTube HTML without regex catastrophic backtracking.
 */
function extractYtInitialData(html) {
  if (!html) return null;
  const marker = 'ytInitialData';
  const markerIdx = html.indexOf(marker);
  if (markerIdx === -1) return null;

  const equalIdx = html.indexOf('=', markerIdx + marker.length);
  if (equalIdx === -1 || equalIdx - markerIdx > 20) return null;

  const jsonStart = html.indexOf('{', equalIdx);
  if (jsonStart === -1 || jsonStart - equalIdx > 10) return null;

  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = jsonStart; i < html.length; i++) {
    const char = html[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (char === '\\') {
      escape = true;
      continue;
    }
    if (char === '"') {
      inString = !inString;
      continue;
    }
    if (!inString) {
      if (char === '{') depth++;
      else if (char === '}') {
        depth--;
        if (depth === 0) {
          try {
            return JSON.parse(html.slice(jsonStart, i + 1));
          } catch (_) {
            return null;
          }
        }
      }
    }
  }
  return null;
}

function parseRelativeDate(str) {
  if (!str || typeof str !== 'string') return 0;
  const now = Date.now();
  const lower = str.toLowerCase().trim();

  const m = lower.match(/(\d+)\s*(y|yr|year|jahre?|mo|month|monate?|w|wk|week|woche?n?|d|day|tage?n?|h|hr|hour|stunde?n?|min|minute|minuten?)/);
  if (!m) return 0;

  const count = parseInt(m[1], 10);
  const unit = m[2];

  if (unit.startsWith('y') || unit.startsWith('j')) {
    return Math.round(now - count * 365.25 * 24 * 3600 * 1000);
  }
  if (unit === 'mo' || unit.startsWith('month') || unit.startsWith('monat')) {
    return Math.round(now - count * 30.4 * 24 * 3600 * 1000);
  }
  if (unit.startsWith('w')) {
    return Math.round(now - count * 7 * 24 * 3600 * 1000);
  }
  if (unit.startsWith('d') || unit.startsWith('t')) {
    return Math.round(now - count * 24 * 3600 * 1000);
  }
  if (unit.startsWith('h') || unit.startsWith('s')) {
    return Math.round(now - count * 3600 * 1000);
  }
  if (unit.startsWith('min')) {
    return Math.round(now - count * 60 * 1000);
  }
  return 0;
}

function isValidYouTubeVideoId(id) {
  return typeof id === 'string' && /^[a-zA-Z0-9_-]{11}$/.test(id) && !id.startsWith('PL');
}

// Recommendation shelves, carousels, and sidebars that must NOT be traversed for playlist items
const IGNORED_CONTAINER_KEYS = new Set([
  'shelfRenderer',
  'richShelfRenderer',
  'horizontalCardListRenderer',
  'relatedChipCloudRenderer',
  'secondaryContents',
  'richSectionRenderer',
  'reelShelfRenderer',
  'commentsEntryPointRenderer',
  'playlistSidebarRenderer',
  'compactPlaylistRenderer',
  'gridPlaylistRenderer',
  'playlistRenderer',
  'radioRenderer',
  'channelRenderer'
]);

/**
 * Parses videos and continuation tokens from any InnerTube/ytInitialData structure.
 */
function parseVideosFromInnerTube(data) {
  const episodes = [];
  const seenIds = new Set();
  let nextToken = null;
  const now = Date.now();
  let lastKnownTimestamp = null;

  function extractVideos(obj) {
    if (!obj || typeof obj !== 'object') return;

    // 1. Support modern YouTube lockupViewModel (2024-2026 UI)
    if (obj.lockupViewModel) {
      const l = obj.lockupViewModel;

      // Reject non-video content types (playlists, albums, mixes, channels)
      const cType = l.contentType || '';
      if (cType && cType !== 'LOCKUP_CONTENT_TYPE_VIDEO' && cType !== 'CONTENT_TYPE_VIDEO') {
        return;
      }

      // If contentId indicates a playlist, mix, or channel, reject
      const rawContentId = l.contentId || '';
      if (rawContentId.startsWith('PL') || rawContentId.startsWith('VL') || rawContentId.startsWith('RD') || rawContentId.startsWith('UC')) {
        return;
      }

      const endpointVId = l.rendererContext?.commandContext?.onTap?.innertubeCommand?.watchEndpoint?.videoId;
      const endpointPId = l.rendererContext?.commandContext?.onTap?.innertubeCommand?.watchEndpoint?.playlistId;

      // If watchEndpoint points to a playlist while contentId is not this video, it's a playlist card
      if (endpointPId && rawContentId && rawContentId !== endpointVId && !isValidYouTubeVideoId(rawContentId)) {
        return;
      }

      // Check if metadata parts indicate a playlist (e.g. "Playlist • 15 videos")
      let isPlaylistIndicator = false;
      const rows = l.metadata?.lockupMetadataViewModel?.metadata?.contentMetadataViewModel?.metadataRows;
      if (Array.isArray(rows)) {
        for (const row of rows) {
          const parts = row.metadataParts || row.parts;
          if (Array.isArray(parts)) {
            for (const p of parts) {
              const text = p.text?.content || p.text?.simpleText || '';
              if (/playlist|titel|videos|tracks/i.test(text)) {
                isPlaylistIndicator = true;
                break;
              }
            }
          }
          if (isPlaylistIndicator) break;
        }
      }
      if (isPlaylistIndicator) return;

      const vId = isValidYouTubeVideoId(rawContentId) ? rawContentId : (isValidYouTubeVideoId(endpointVId) ? endpointVId : null);

      if (vId && !seenIds.has(vId)) {
        seenIds.add(vId);
        const titleText = l.metadata?.lockupMetadataViewModel?.title?.content 
          || l.rendererContext?.accessibilityContext?.label 
          || 'Untitled Video';
        const authorText = l.metadata?.lockupMetadataViewModel?.metadata?.contentMetadataViewModel?.metadataRows?.[0]?.parts?.[0]?.text?.content || '';
        const thumb = l.contentImage?.thumbnailViewModel?.image?.sources?.slice(-1)[0]?.url 
          || (vId ? `https://i.ytimg.com/vi/${vId}/hqdefault.jpg` : '');

        let durText = '';
        let durSec = 0;
        const overlays = l.contentImage?.thumbnailViewModel?.overlays;
        if (Array.isArray(overlays)) {
          for (const ov of overlays) {
            const badges = ov.thumbnailBottomOverlayViewModel?.badges || (ov.thumbnailOverlayTimeStatusRenderer ? [ov.thumbnailOverlayTimeStatusRenderer] : []);
            for (const b of badges) {
              const text = b.thumbnailBadgeViewModel?.text || b.text?.simpleText || (b.text?.runs ? b.text.runs.map(r => r.text).join('') : '');
              if (text && /^\d{1,2}(?::\d{2}){1,2}$/.test(text.trim())) {
                durText = text.trim();
                break;
              }
            }
            if (durText) break;
          }
        }

        if (durText) {
          const parts = durText.split(':').map(p => parseInt(p, 10));
          if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) durSec = parts[0] * 60 + parts[1];
          else if (parts.length === 3 && !isNaN(parts[0]) && !isNaN(parts[1]) && !isNaN(parts[2])) durSec = parts[0] * 3600 + parts[1] * 60 + parts[2];
        }

        let dateText = '';
        if (Array.isArray(rows)) {
          for (const row of rows) {
            const parts = row.metadataParts || row.parts;
            if (Array.isArray(parts)) {
              for (const part of parts) {
                const candidate = part.accessibilityLabel || part.text?.content || part.text?.simpleText || '';
                if (/ago|vor|year|month|week|day|hour|min/i.test(candidate)) {
                  dateText = candidate;
                  break;
                }
              }
            }
            if (dateText) break;
          }
        }

        const parsedTimestamp = parseRelativeDate(dateText);
        let approxTimestamp;
        if (parsedTimestamp) {
          approxTimestamp = parsedTimestamp - episodes.length * 1000;
          lastKnownTimestamp = approxTimestamp;
        } else if (lastKnownTimestamp) {
          approxTimestamp = lastKnownTimestamp - 60000;
          lastKnownTimestamp = approxTimestamp;
        } else {
          approxTimestamp = now - (30 * 86400 * 1000) - episodes.length * 60000;
        }

        episodes.push({
          guid: `yt:${vId}`,
          videoId: vId,
          title: titleText.trim(),
          podcastTitle: authorText.trim(),
          artwork: thumb,
          audioUrl: `https://www.youtube.com/watch?v=${vId}`,
          duration: durSec ? String(durSec) : '',
          pubDate: new Date(approxTimestamp).toUTCString(),
          timestamp: approxTimestamp,
          isYouTube: true
        });
      }
    }

    // 2. Support classic YouTube playlistVideoRenderer / videoRenderer
    const v = obj.playlistVideoRenderer 
      || obj.playlistPanelVideoRenderer 
      || obj.videoRenderer 
      || obj.compactVideoRenderer;

    if (v && v.videoId && isValidYouTubeVideoId(v.videoId) && !seenIds.has(v.videoId)) {
      seenIds.add(v.videoId);
      const titleText = v.title?.runs
        ? v.title.runs.map(r => r.text).join('')
        : (v.title?.simpleText || 'Untitled Video');
      const authorText = v.shortBylineText?.runs
        ? v.shortBylineText.runs.map(r => r.text).join('')
        : (v.shortBylineText?.simpleText || v.longBylineText?.runs?.map(r => r.text).join('') || '');
      const thumb = v.thumbnail?.thumbnails?.slice(-1)[0]?.url || `https://i.ytimg.com/vi/${v.videoId}/hqdefault.jpg`;
      
      let durSec = 0;
      if (v.lengthSeconds) {
        durSec = parseInt(v.lengthSeconds, 10);
      } else if (v.lengthText) {
        const text = v.lengthText.simpleText || (v.lengthText.runs ? v.lengthText.runs.map(r => r.text).join('') : '');
        const parts = text.split(':').map(p => parseInt(p, 10));
        if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
          durSec = parts[0] * 60 + parts[1];
        } else if (parts.length === 3 && !isNaN(parts[0]) && !isNaN(parts[1]) && !isNaN(parts[2])) {
          durSec = parts[0] * 3600 + parts[1] * 60 + parts[2];
        }
      }

      let dateText = v.videoInfo?.runs?.map(r => r.text).join(' ') 
        || v.publishedTimeText?.simpleText 
        || '';
      const parsedTimestamp = parseRelativeDate(dateText);
      let approxTimestamp;
      if (parsedTimestamp) {
        approxTimestamp = parsedTimestamp - episodes.length * 1000;
        lastKnownTimestamp = approxTimestamp;
      } else if (lastKnownTimestamp) {
        approxTimestamp = lastKnownTimestamp - 60000;
        lastKnownTimestamp = approxTimestamp;
      } else {
        approxTimestamp = now - (30 * 86400 * 1000) - episodes.length * 60000;
      }

      episodes.push({
        guid: `yt:${v.videoId}`,
        videoId: v.videoId,
        title: titleText.trim(),
        podcastTitle: authorText.trim(),
        artwork: thumb,
        audioUrl: `https://www.youtube.com/watch?v=${v.videoId}`,
        duration: durSec ? String(durSec) : '',
        pubDate: new Date(approxTimestamp).toUTCString(),
        timestamp: approxTimestamp,
        isYouTube: true
      });
    }

    if (!nextToken) {
      if (obj.continuationCommand?.token) {
        nextToken = obj.continuationCommand.token;
      } else if (obj.continuationEndpoint?.continuationCommand?.token) {
        nextToken = obj.continuationEndpoint.continuationCommand.token;
      } else if (obj.continuationItemRenderer?.continuationEndpoint?.continuationCommand?.token) {
        nextToken = obj.continuationItemRenderer.continuationEndpoint.continuationCommand.token;
      } else if (obj.nextContinuationData?.continuation) {
        nextToken = obj.nextContinuationData.continuation;
      }
    }

    for (const key of Object.keys(obj)) {
      if (IGNORED_CONTAINER_KEYS.has(key)) continue;
      extractVideos(obj[key]);
    }
  }

  extractVideos(data);
  return { episodes, nextToken };
}

/**
 * Scrapes public playlist page for title, true total video count, and ytInitialData.
 */
async function fetchYouTubePlaylistMetadata(playlistId) {
  try {
    const res = await fetch(`https://www.youtube.com/playlist?list=${playlistId}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9'
      }
    });
    if (!res.ok) return null;
    const html = await res.text();

    let countMatch = html.match(/"videoCountText":\s*\{\s*"runs":\s*\[\s*\{\s*"text":\s*"([\d,.]+)"/i) 
                  || html.match(/"itemCount":\s*"([\d,.]+)"/i)
                  || html.match(/(\d[\d,.]*)\s+(?:videos|Videos|Titel)/i);
    
    let count = countMatch ? parseInt(countMatch[1].replace(/[,.]/g, ''), 10) : null;
    const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
    let title = titleMatch ? titleMatch[1].replace(/ - YouTube$/i, '').trim() : '';

    let initialBatch = null;
    try {
      const initialData = extractYtInitialData(html);
      if (initialData) {
        const parsed = parseVideosFromInnerTube(initialData);
        if (parsed.episodes && parsed.episodes.length > 0) {
          initialBatch = parsed;
        }
        if (!count && initialBatch?.episodes?.length) {
          count = initialBatch.episodes.length;
        }
        if (!title && initialData.header?.pageHeaderRenderer?.pageTitle) {
          title = initialData.header.pageHeaderRenderer.pageTitle;
        }
      }
    } catch (_) {}

    return { totalCount: count, title, initialBatch, nextToken: initialBatch?.nextToken || null };
  } catch (_) {
    return null;
  }
}

/**
 * Fetches batches of items using YouTube's InnerTube API.
 */
async function fetchYouTubePlaylistBatch(playlistId, continuationToken = null) {
  const url = 'https://www.youtube.com/youtubei/v1/browse?prettyPrint=false';

  const clients = [
    {
      clientName: 'ANDROID',
      clientVersion: '19.29.35',
      androidSdkVersion: 30
    },
    {
      clientName: 'WEB',
      clientVersion: '2.20240101.00.00'
    }
  ];

  for (const client of clients) {
    try {
      const body = continuationToken
        ? {
            context: { client },
            continuation: continuationToken
          }
        : {
            context: { client },
            browseId: playlistId.startsWith('VL') ? playlistId : `VL${playlistId}`
          };

      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': client.clientName === 'ANDROID'
            ? 'com.google.android.youtube/19.29.35 (Linux; U; Android 11; en_US)'
            : 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          'X-YouTube-Client-Name': client.clientName === 'ANDROID' ? '3' : '1',
          'X-YouTube-Client-Version': client.clientVersion
        },
        body: JSON.stringify(body)
      });

      if (!res.ok) continue;
      const data = await res.json();
      const parsed = parseVideosFromInnerTube(data);
      if (parsed.episodes.length > 0 || parsed.nextToken) {
        return parsed;
      }
    } catch (_) {}
  }

  return { episodes: [], nextToken: null };
}

async function fetchAndParseFeed(inputUrl) {
  let isYouTubeUrl = false;
  let playlistId = null;

  try {
    const parsed = new URL(inputUrl);
    if (parsed.hostname.includes('youtube.com') || parsed.hostname.includes('youtu.be')) {
      isYouTubeUrl = true;
      playlistId = parsed.searchParams.get('list');
    }
  } catch (e) {}

  if (isYouTubeUrl && playlistId) {
    // 1. Get true playlist count, title, and initial page data
    const meta = await fetchYouTubePlaylistMetadata(playlistId);

    // 2. Try initialBatch from scraped page first, or fetchYouTubePlaylistBatch
    let batchData = meta?.initialBatch;
    if (!batchData || !batchData.episodes || batchData.episodes.length === 0) {
      try {
        batchData = await fetchYouTubePlaylistBatch(playlistId);
      } catch (_) {}
    }

    if (batchData && batchData.episodes && batchData.episodes.length > 0) {
      const firstEp = batchData.episodes[0];
      const playlistTitle = meta?.title || 'YouTube Playlist';
      const artwork = firstEp.artwork || 'https://i.ytimg.com/vi/default.jpg';
      const totalCount = meta?.totalCount || batchData.episodes.length;

      batchData.episodes.forEach(ep => {
        // Retain original video author/artist (channel name) as ep.author or ep.channel
        const channelName = ep.podcastTitle || '';
        ep.playlistTitle = playlistTitle;
        // ep.podcastTitle represents the artist/channel for cards, or playlist if channel unavailable
        ep.podcastTitle = channelName || playlistTitle;
        ep.author = channelName || playlistTitle;
        ep.feedUrl = inputUrl;
      });

      return {
        title: playlistTitle,
        description: `YouTube Playlist (${playlistId})`,
        author: firstEp.author || firstEp.podcastTitle || playlistTitle,
        artwork,
        link: inputUrl,
        feedUrl: inputUrl,
        playlistId,
        isYouTube: true,
        isYouTubePlaylist: true,
        episodesCount: totalCount,
        expectedTotalCount: totalCount,
        nextToken: batchData.nextToken,
        updatedAt: new Date().toISOString(),
        episodes: batchData.episodes
      };
    }

    // 3. Fallback: YouTube Atom RSS Feed (15 items)
    const rssUrl = `https://www.youtube.com/feeds/videos.xml?playlist_id=${playlistId}`;
    try {
      const res = await fetch(rssUrl, {
        headers: {
          'User-Agent': 'Anypod/1.0 (+CloudflarePages)',
          'Accept': 'application/atom+xml, application/xml, text/xml, */*'
        }
      });

      if (res.ok) {
        const xmlText = await res.text();
        const feedData = parsePodcastXml(xmlText, rssUrl, inputUrl);
        if (feedData.episodes && feedData.episodes.length > 0) {
          feedData.playlistId = playlistId;
          feedData.isYouTube = true;
          feedData.isYouTubePlaylist = true;
          feedData.expectedTotalCount = meta?.totalCount || feedData.episodes.length;
          feedData.episodesCount = feedData.expectedTotalCount;
          feedData.nextToken = meta?.nextToken || null;
          return feedData;
        }
      }
    } catch (err) {}

    return fetchYouTubeOEmbedFallback(playlistId, inputUrl);
  }

  const fetchOptions = {
    headers: {
      'User-Agent': 'Anypod/1.0 (+CloudflarePages)',
      'Accept': 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*'
    }
  };

  try {
    fetchOptions.cf = {
      cacheTtl: 300,
      cacheEverything: true
    };
  } catch (_) {}

  if (typeof AbortSignal !== 'undefined' && AbortSignal.timeout) {
    fetchOptions.signal = AbortSignal.timeout(8500);
  }

  const response = await fetch(inputUrl, fetchOptions);

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: Unable to fetch feed`);
  }

  const xmlText = await response.text();
  return parsePodcastXml(xmlText, inputUrl, inputUrl);
}

async function fetchYouTubeOEmbedFallback(playlistId, originalUrl) {
  const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(`https://www.youtube.com/playlist?list=${playlistId}`)}&format=json`;
  
  const res = await fetch(oembedUrl);
  if (!res.ok) {
    throw new Error(`YouTube Playlist (ID: ${playlistId}) not found or is set to Private.`);
  }

  const data = await res.json();
  const title = data.title || 'YouTube Music Podcast Playlist';
  const author = data.author_name || 'YouTube Creator';
  const artwork = data.thumbnail_url || 'https://i.ytimg.com/vi/default.jpg';

  const singleEpisode = {
    guid: `yt-playlist-${playlistId}`,
    title: `${title} (Full Playlist)`,
    description: `YouTube Music Podcast Playlist by ${author}. Click play to stream all episodes in sequence.`,
    pubDate: new Date().toUTCString(),
    timestamp: Date.now(),
    audioUrl: `https://www.youtube.com/playlist?list=${playlistId}`,
    duration: '',
    artwork: artwork,
    podcastTitle: title,
    feedUrl: originalUrl,
    isYouTube: true,
    isYouTubePlaylist: true,
    playlistId: playlistId
  };

  return {
    title: title,
    description: `YouTube Music Podcast Playlist (${author})`,
    author: author,
    artwork: artwork,
    feedUrl: originalUrl,
    episodesCount: 1,
    updatedAt: new Date().toISOString(),
    episodes: [singleEpisode]
  };
}

// Pre-compiled regex caches at module scope so Worker invocations never allocate RegExp inside loops
const _tagRegexCache = new Map();
const _rawTagRegexCache = new Map();
const _attrRegexCache = new Map();
const _cdataRegex = /<!\[CDATA\[([\s\S]*?)\]\]>/gi;
const _htmlTagRegex = /<[^>]+>/g;
const _itemImageTagRegex = /<image[^>]*>([\s\S]*?)<\/image>/i;
const _mediaImgRegex1 = /<media:content[^>]*\burl=["']([^"']+)["'][^>]*(medium=["']image["']|type=["']image\/[^"']+["'])[^>]*>/i;
const _mediaImgRegex2 = /<media:content[^>]*(medium=["']image["']|type=["']image\/[^"']+["'])[^>]*\burl=["']([^"']+)["'][^>]*>/i;

const _entityMap = {
  '&ndash;': '–', '&mdash;': '—', '&hellip;': '…', '&bull;': '•',
  '&rsquo;': '’', '&lsquo;': '‘', '&rdquo;': '”', '&ldquo;': '“',
  '&lt;': '<', '&gt;': '>', '&amp;': '&', '&quot;': '"', '&#39;': "'", '&nbsp;': ' '
};
const _entityRegex = /&(?:ndash|mdash|hellip|bull|rsquo|lsquo|rdquo|ldquo|lt|gt|amp|quot|#39|nbsp|#\d+|#x[0-9a-f]+);/gi;

function decodeEntitiesFast(str) {
  if (!str || !str.includes('&')) return str;
  return str.replace(_entityRegex, (m) => {
    const lower = m.toLowerCase();
    if (_entityMap[lower]) return _entityMap[lower];
    if (lower.startsWith('&#x')) {
      const code = parseInt(lower.slice(3, -1), 16);
      return !isNaN(code) ? String.fromCharCode(code) : m;
    }
    if (lower.startsWith('&#')) {
      const code = parseInt(lower.slice(2, -1), 10);
      return !isNaN(code) ? String.fromCharCode(code) : m;
    }
    return m;
  });
}

function cleanText(str, maxLen = 0) {
  if (!str) return '';
  let s = str;
  // Fast unwrap CDATA without regex
  if (s.includes('<![CDATA[')) {
    const cdataStart = s.indexOf('<![CDATA[');
    const cdataEnd = s.lastIndexOf(']]>');
    if (cdataStart !== -1 && cdataEnd > cdataStart) {
      s = s.slice(0, cdataStart) + s.slice(cdataStart + 9, cdataEnd) + s.slice(cdataEnd + 3);
    }
    if (s.includes('<![CDATA[')) {
      s = s.replace(_cdataRegex, '$1');
    }
  }
  // Slice before running regexes if maxLen is requested to save CPU on 50KB show-notes
  if (maxLen > 0 && s.length > maxLen * 3) {
    s = s.slice(0, maxLen * 3);
  }
  if (s.includes('<')) {
    s = s.replace(_htmlTagRegex, ' ');
  }
  if (s.includes('&')) {
    s = decodeEntitiesFast(s);
  }
  if (s.includes('\n') || s.includes('\r') || s.includes('\t') || s.includes('  ')) {
    s = s.replace(/\s+/g, ' ');
  }
  s = s.trim();
  if (maxLen > 0 && s.length > maxLen) {
    return s.slice(0, maxLen) + '...';
  }
  return s;
}

function extractTagRawFast(xmlSegment, tagName) {
  let openIdx = xmlSegment.indexOf(`<${tagName}>`);
  let openEnd = openIdx !== -1 ? openIdx + tagName.length + 2 : -1;
  if (openIdx === -1) {
    openIdx = xmlSegment.indexOf(`<${tagName} `);
    if (openIdx !== -1) {
      openEnd = xmlSegment.indexOf('>', openIdx + tagName.length + 2);
      if (openEnd !== -1) openEnd += 1;
    }
  }
  if (openEnd === -1) return '';
  const closeIdx = xmlSegment.indexOf(`</${tagName}>`, openEnd);
  if (closeIdx === -1) return '';
  return xmlSegment.slice(openEnd, closeIdx);
}

function getTagContentFast(xmlSegment, tagName, maxLen = 0) {
  const raw = extractTagRawFast(xmlSegment, tagName)
    || extractTagRawFast(xmlSegment, `itunes:${tagName}`)
    || extractTagRawFast(xmlSegment, `media:${tagName}`)
    || extractTagRawFast(xmlSegment, `yt:${tagName}`);
  return raw ? cleanText(raw, maxLen) : '';
}

function getAttributeFast(xmlSegment, tagName, attrName) {
  let tagStart = xmlSegment.indexOf(`<${tagName} `);
  if (tagStart === -1 && !tagName.includes(':')) {
    tagStart = xmlSegment.indexOf(`<itunes:${tagName} `);
    if (tagStart === -1) tagStart = xmlSegment.indexOf(`<media:${tagName} `);
  }
  if (tagStart === -1) return '';
  const tagEnd = xmlSegment.indexOf('>', tagStart + 2);
  if (tagEnd === -1) return '';
  const tagSlice = xmlSegment.slice(tagStart, tagEnd);
  let attrIdx = tagSlice.indexOf(`${attrName}="`);
  let quote = '"';
  if (attrIdx === -1) {
    attrIdx = tagSlice.indexOf(`${attrName}='`);
    quote = "'";
  }
  if (attrIdx === -1) return '';
  const valStart = attrIdx + attrName.length + 2;
  const valEnd = tagSlice.indexOf(quote, valStart);
  return valEnd !== -1 ? tagSlice.slice(valStart, valEnd) : '';
}

function getTagContent(xmlSegment, tagName, maxLen = 0) {
  const fast = getTagContentFast(xmlSegment, tagName, maxLen);
  if (fast) return fast;
  let regex = _tagRegexCache.get(tagName);
  if (!regex) {
    regex = new RegExp(`<(${tagName}|itunes:${tagName}|yt:${tagName}|media:${tagName})[^>]*>([\\s\\S]*?)<\\/\\1\\b[^>]*>`, 'i');
    _tagRegexCache.set(tagName, regex);
  }
  const match = xmlSegment.match(regex);
  return match && match[2] ? cleanText(match[2], maxLen) : '';
}

function getAttribute(xmlSegment, tagName, attrName) {
  const fast = getAttributeFast(xmlSegment, tagName, attrName);
  if (fast) return fast;
  const key = `${tagName}:${attrName}`;
  let regex = _attrRegexCache.get(key);
  if (!regex) {
    regex = new RegExp(`<(${tagName}|itunes:${tagName}|yt:${tagName}|media:${tagName})[^>]*\\b${attrName}=["']([^"']+)["'][^>]*>`, 'i');
    _attrRegexCache.set(key, regex);
  }
  const match = xmlSegment.match(regex);
  return match ? match[2] : '';
}

function getRawTagContent(xmlSegment, tagName) {
  let regex = _rawTagRegexCache.get(tagName);
  if (!regex) {
    regex = new RegExp(`<(${tagName}|content:${tagName}|itunes:${tagName}|yt:${tagName}|media:${tagName})[^>]*>([\\s\\S]*?)<\\/\\1\\b[^>]*>`, 'i');
    _rawTagRegexCache.set(tagName, regex);
  }
  const match = xmlSegment.match(regex);
  if (!match || !match[2]) return '';
  let val = match[2];
  if (val.includes('<![CDATA[')) {
    val = val.replace(_cdataRegex, '$1');
  }
  return val.trim();
}

/**
 * Lazy on-demand fetcher for full HTML show notes of a single episode (avoids sending MBs of HTML during feed sync).
 */
async function fetchSingleEpisodeContent(inputUrl, targetGuid) {
  const response = await fetch(inputUrl, {
    headers: {
      'User-Agent': 'Anypod/1.0 (+CloudflarePages)',
      'Accept': 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*'
    },
    cf: { cacheTtl: 900, cacheEverything: true },
    signal: (typeof AbortSignal !== 'undefined' && AbortSignal.timeout) ? AbortSignal.timeout(8500) : undefined
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const xml = await response.text();

  const itemRegex = /<(?:item|entry)[^>]*>([\s\S]*?)<\/(?:item|entry)>/gi;
  let m;
  while ((m = itemRegex.exec(xml)) !== null) {
    const itemXml = m[1];
    if (!itemXml.includes(targetGuid)) continue;
    const epGuid = getTagContent(itemXml, 'guid') || getTagContent(itemXml, 'id') || getTagContent(itemXml, 'link') || getTagContent(itemXml, 'title');
    if (epGuid === targetGuid || itemXml.includes(targetGuid)) {
      const content = getRawTagContent(itemXml, 'encoded')
        || getRawTagContent(itemXml, 'content')
        || getRawTagContent(itemXml, 'description')
        || getRawTagContent(itemXml, 'summary');
      return { guid: targetGuid, content };
    }
  }
  return { guid: targetGuid, content: '' };
}

function parsePodcastXml(xml, feedUrl, originalUrl) {
  const isAtom = xml.includes('<feed') && xml.includes('<entry');

  let title = '';
  let description = '';
  let author = '';
  let artwork = '';
  let link = '';

  if (isAtom) {
    const headerSlice = xml.slice(0, Math.min(xml.length, 8000));
    title = getTagContent(headerSlice, 'title') || 'YouTube Podcast Feed';
    author = getTagContent(headerSlice, 'name') || 'YouTube Creator';
    description = `YouTube Playlist Feed (${originalUrl})`;
    link = getAttribute(headerSlice, 'link', 'href') || originalUrl;
  } else {
    // Only extract channel header before the first <item> so we don't regex-scan a 10MB string for channel metadata
    const firstItemIdx = xml.search(/<item[\s>]/i);
    const channelHeaderXml = firstItemIdx !== -1 ? xml.slice(0, firstItemIdx) : xml.slice(0, 16000);

    title = getTagContent(channelHeaderXml, 'title') || 'Untitled Podcast';
    description = getTagContent(channelHeaderXml, 'description', 500) || getTagContent(channelHeaderXml, 'summary', 500);
    author = getTagContent(channelHeaderXml, 'author') || getTagContent(channelHeaderXml, 'owner');
    link = getTagContent(channelHeaderXml, 'link') || getAttribute(channelHeaderXml, 'link', 'href') || '';
    
    artwork = getAttribute(channelHeaderXml, 'image', 'href') || getAttribute(channelHeaderXml, 'itunes:image', 'href');
    if (!artwork) {
      const imageTag = channelHeaderXml.match(_itemImageTagRegex);
      if (imageTag) artwork = getTagContent(imageTag[1], 'url');
    }
    if (artwork && artwork.startsWith('http://')) {
      artwork = 'https://' + artwork.slice(7);
    }
  }

  const items = [];
  const MAX_PARSED_EPISODES = 550;

  if (isAtom) {
    const entryRegex = /<entry[^>]*>([\s\S]*?)<\/entry>/gi;
    let entryMatch;

    while ((entryMatch = entryRegex.exec(xml)) !== null) {
      if (items.length >= MAX_PARSED_EPISODES) break;
      const entryXml = entryMatch[1];
      const epTitle = getTagContent(entryXml, 'title') || 'Untitled Video';
      const epVideoId = getTagContent(entryXml, 'videoId');
      const epGuid = getTagContent(entryXml, 'id') || epVideoId;
      const epPubDate = getTagContent(entryXml, 'published') || getTagContent(entryXml, 'updated');
      const epDesc = getTagContent(entryXml, 'description', 240) || getTagContent(entryXml, 'summary', 240);
      const epThumb = getAttribute(entryXml, 'media:thumbnail', 'url');

      let audioUrl = getAttribute(entryXml, 'media:content', 'url');
      const alternateLink = getAttribute(entryXml, 'link', 'href');

      if (!audioUrl && epVideoId) {
        audioUrl = `https://www.youtube.com/watch?v=${epVideoId}`;
      } else if (!audioUrl && alternateLink) {
        audioUrl = alternateLink;
      }

      let timestamp = 0;
      if (epPubDate) {
        const parsed = Date.parse(epPubDate);
        if (!isNaN(parsed)) timestamp = parsed;
      }

      const entryAuthor = getTagContent(entryXml, 'name') || author;

      if (audioUrl) {
        items.push({
          guid: epGuid,
          title: epTitle,
          description: epDesc,
          pubDate: epPubDate,
          timestamp: timestamp,
          audioUrl: audioUrl,
          duration: '',
          artwork: epThumb || artwork,
          podcastTitle: entryAuthor || title,
          author: entryAuthor || author,
          feedUrl: originalUrl,
          isYouTube: true,
          videoId: epVideoId
        });
      }
    }
  } else {
    let searchPos = 0;
    while (items.length < MAX_PARSED_EPISODES) {
      const itemStart = xml.indexOf('<item', searchPos);
      if (itemStart === -1) break;
      const itemOpenEnd = xml.indexOf('>', itemStart + 5);
      if (itemOpenEnd === -1) break;
      const itemEnd = xml.indexOf('</item>', itemOpenEnd + 1);
      if (itemEnd === -1) break;
      searchPos = itemEnd + 7;

      const ceStart = xml.indexOf('<content:encoded', itemOpenEnd + 1);
      let itemXml;
      if (ceStart !== -1 && ceStart < itemEnd) {
        const ceEnd = xml.indexOf('</content:encoded>', ceStart + 16);
        itemXml = (ceEnd !== -1 && ceEnd < itemEnd)
          ? xml.slice(itemOpenEnd + 1, ceStart) + xml.slice(ceEnd + 18, itemEnd)
          : xml.slice(itemOpenEnd + 1, ceStart);
      } else {
        itemXml = xml.slice(itemOpenEnd + 1, itemEnd);
      }

      let audioUrl = getAttributeFast(itemXml, 'enclosure', 'url') || getAttributeFast(itemXml, 'media:content', 'url');
      if (!audioUrl) continue;

      const epTitle = getTagContentFast(itemXml, 'title') || 'Untitled Episode';
      const epGuid = getTagContentFast(itemXml, 'guid') || getTagContentFast(itemXml, 'link') || epTitle;
      const epPubDate = getTagContentFast(itemXml, 'pubDate') || getTagContentFast(itemXml, 'published');
      // Extract only short 240-char plain summary during feed sync; full HTML show-notes are lazy-loaded on demand
      const epDescription = getTagContentFast(itemXml, 'description', 240) || getTagContentFast(itemXml, 'summary', 240);
      let epDuration = getTagContentFast(itemXml, 'duration');
      if (epDuration === '0:00' || epDuration === '0' || epDuration === '00:00' || epDuration === '00:00:00') {
        epDuration = '';
      }

      let epArtwork = getAttributeFast(itemXml, 'itunes:image', 'href') ||
                      getAttributeFast(itemXml, 'image', 'href') ||
                      getAttributeFast(itemXml, 'media:thumbnail', 'url') ||
                      getAttributeFast(itemXml, 'thumbnail', 'url');
      if (!epArtwork && itemXml.includes('<media:content')) {
        const mediaImgMatch = itemXml.match(_mediaImgRegex1) || itemXml.match(_mediaImgRegex2);
        if (mediaImgMatch) epArtwork = mediaImgMatch[1] || mediaImgMatch[2] || '';
      }
      if (!epArtwork) {
        epArtwork = artwork;
      }
      if (epArtwork && epArtwork.startsWith('http://')) {
        epArtwork = 'https://' + epArtwork.slice(7);
      }

      const hasTranscript = itemXml.includes('transcript');
      const transcriptUrl = hasTranscript ? (getAttribute(itemXml, 'podcast:transcript', 'url') || getAttribute(itemXml, 'transcript', 'url')) : '';
      const transcriptType = transcriptUrl ? (getAttribute(itemXml, 'podcast:transcript', 'type') || getAttribute(itemXml, 'transcript', 'type') || 'text/vtt') : '';

      const hasChapters = itemXml.includes('chapters');
      const chaptersUrl = hasChapters ? (getAttribute(itemXml, 'podcast:chapters', 'url') || getAttribute(itemXml, 'chapters', 'url')) : '';
      const chaptersType = chaptersUrl ? (getAttribute(itemXml, 'podcast:chapters', 'type') || getAttribute(itemXml, 'chapters', 'type') || 'application/json+chapters') : '';

      let timestamp = 0;
      if (epPubDate) {
        const parsed = Date.parse(epPubDate);
        if (!isNaN(parsed)) timestamp = parsed;
      }

      items.push({
        guid: epGuid,
        title: epTitle,
        description: epDescription,
        pubDate: epPubDate,
        timestamp: timestamp,
        audioUrl: audioUrl,
        duration: epDuration || '',
        artwork: epArtwork,
        podcastTitle: title,
        feedUrl: originalUrl,
        transcriptUrl: transcriptUrl || '',
        transcriptType: transcriptType || '',
        chaptersUrl: chaptersUrl || '',
        chaptersType: chaptersType || ''
      });
    }
  }

  items.sort((a, b) => b.timestamp - a.timestamp);

  return {
    title,
    description: description.substring(0, 500),
    author,
    artwork: artwork || (items.length > 0 ? items[0].artwork : ''),
    link: link || originalUrl,
    feedUrl: originalUrl,
    episodesCount: items.length,
    updatedAt: new Date().toISOString(),
    episodes: items
  };
}