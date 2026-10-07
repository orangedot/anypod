import { getUserFromRequest, isValidExternalUrl } from './utils.js';

export async function onRequest(context) {
  const { request, env } = context;
  const urlParams = new URL(request.url).searchParams;
  let targetUrl = urlParams.get('url');

  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Session-Token',
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'public, max-age=180, stale-while-revalidate=300'
  };

  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders, status: 204 });
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
      return new Response(JSON.stringify(batchData || { episodes: [], nextToken: null }), {
        headers: corsHeaders,
        status: 200
      });
    } catch (err) {
      return new Response(JSON.stringify({ error: err.message, episodes: [], nextToken: null }), {
        headers: corsHeaders,
        status: 500
      });
    }
  }

  // 2. Batch feed requests from subscriptions
  if (request.method === 'POST') {
    try {
      const body = await request.json();
      if (body.urls && Array.isArray(body.urls)) {
        const validUrls = body.urls.filter(u => typeof u === 'string' && isValidExternalUrl(u));
        const results = await Promise.allSettled(
          validUrls.map(u => fetchAndParseFeed(u))
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

  try {
    const feedData = await fetchAndParseFeed(targetUrl);
    return new Response(JSON.stringify(feedData), {
      headers: corsHeaders,
      status: 200
    });
  } catch (error) {
    return new Response(JSON.stringify({ 
      error: error.message || 'Failed to process feed',
      title: 'Unavailable Feed',
      episodesCount: 0,
      episodes: []
    }), {
      headers: corsHeaders,
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

/**
 * Parses videos and continuation tokens from any InnerTube/ytInitialData structure.
 */
function parseVideosFromInnerTube(data) {
  const episodes = [];
  const seenIds = new Set();
  let nextToken = null;
  const now = Date.now();

  function extractVideos(obj) {
    if (!obj || typeof obj !== 'object') return;

    // 1. Support modern YouTube lockupViewModel (2024-2026 UI)
    if (obj.lockupViewModel && (obj.lockupViewModel.contentType === 'LOCKUP_CONTENT_TYPE_VIDEO' || obj.lockupViewModel.contentId)) {
      const l = obj.lockupViewModel;
      const vId = l.contentId || l.rendererContext?.commandContext?.onTap?.innertubeCommand?.watchEndpoint?.videoId;
      if (vId && !seenIds.has(vId)) {
        seenIds.add(vId);
        const titleText = l.metadata?.lockupMetadataViewModel?.title?.content 
          || l.rendererContext?.accessibilityContext?.label 
          || 'Untitled Video';
        const authorText = l.metadata?.lockupMetadataViewModel?.metadata?.contentMetadataViewModel?.metadataRows?.[0]?.parts?.[0]?.text?.content || '';
        const thumb = l.contentImage?.thumbnailViewModel?.image?.sources?.slice(-1)[0]?.url 
          || `https://i.ytimg.com/vi/${vId}/hqdefault.jpg`;
        const durText = l.contentImage?.thumbnailViewModel?.overlays?.[0]?.thumbnailBottomOverlayViewModel?.badges?.[0]?.thumbnailBadgeViewModel?.text || '';
        let durSec = 0;
        if (durText) {
          const parts = durText.split(':').map(p => parseInt(p, 10));
          if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) durSec = parts[0] * 60 + parts[1];
          else if (parts.length === 3 && !isNaN(parts[0]) && !isNaN(parts[1]) && !isNaN(parts[2])) durSec = parts[0] * 3600 + parts[1] * 60 + parts[2];
        }

        let dateText = '';
        const rows = l.metadata?.lockupMetadataViewModel?.metadata?.contentMetadataViewModel?.metadataRows;
        if (Array.isArray(rows)) {
          for (const row of rows) {
            if (Array.isArray(row.metadataParts)) {
              for (const part of row.metadataParts) {
                const candidate = part.accessibilityLabel || part.text?.content || '';
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
        const approxTimestamp = parsedTimestamp 
          ? (parsedTimestamp - episodes.length * 1000) 
          : (now - episodes.length * 60000);

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

    if (v && v.videoId && !seenIds.has(v.videoId)) {
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
      const approxTimestamp = parsedTimestamp 
        ? (parsedTimestamp - episodes.length * 1000) 
        : (now - episodes.length * 60000);

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
        if (!count) {
          const matchFromData = JSON.stringify(initialData).match(/(\d[\d,.]*)\s*(?:Videos|videos|Titel|tracks|episodes)/i);
          if (matchFromData) {
            count = parseInt(matchFromData[1].replace(/[,.]/g, ''), 10);
          } else if (initialBatch?.episodes?.length) {
            count = initialBatch.episodes.length;
          }
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

function parsePodcastXml(xml, feedUrl, originalUrl) {
  const getTagContent = (xmlSegment, tagName) => {
    const regex = new RegExp(`<(${tagName}|itunes:${tagName}|yt:${tagName}|media:${tagName})[^>]*>([\\s\\S]*?)<\\/\\1\\b[^>]*>`, 'i');
    const match = xmlSegment.match(regex);
    return match && match[2] ? cleanText(match[2]) : '';
  };

  const getAttribute = (xmlSegment, tagName, attrName) => {
    const regex = new RegExp(`<(${tagName}|itunes:${tagName}|yt:${tagName}|media:${tagName})[^>]*\\b${attrName}=["']([^"']+)["'][^>]*>`, 'i');
    const match = xmlSegment.match(regex);
    return match ? match[2] : '';
  };

  const getRawTagContent = (xmlSegment, tagName) => {
    const regex = new RegExp(`<(${tagName}|content:${tagName}|itunes:${tagName}|yt:${tagName}|media:${tagName})[^>]*>([\\s\\S]*?)<\\/\\1\\b[^>]*>`, 'i');
    const match = xmlSegment.match(regex);
    if (!match || !match[2]) return '';
    let val = match[2];
    val = val.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/gi, '$1').trim();
    return val;
  };

  const cleanText = (str) => {
    if (!str) return '';
    return str
      .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/gi, '$1')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(Number(dec)))
      .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
      .replace(/&ndash;/g, '–')
      .replace(/&mdash;/g, '—')
      .replace(/&hellip;/g, '…')
      .replace(/&bull;/g, '•')
      .replace(/&rsquo;/g, '’')
      .replace(/&lsquo;/g, '‘')
      .replace(/&rdquo;/g, '”')
      .replace(/&ldquo;/g, '“')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&nbsp;/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  };

  const isAtom = xml.includes('<feed') && xml.includes('xmlns="http://www.w3.org/2005/Atom"');

  let title = '';
  let description = '';
  let author = '';
  let artwork = '';
  let link = '';

  if (isAtom) {
    title = getTagContent(xml, 'title') || 'YouTube Podcast Feed';
    author = getTagContent(xml, 'name') || 'YouTube Creator';
    description = `YouTube Playlist Feed (${originalUrl})`;
    link = getAttribute(xml, 'link', 'href') || originalUrl;
  } else {
    const channelMatch = xml.match(/<channel[^>]*>([\s\S]*?)<\/channel>/i);
    const channelXml = channelMatch ? channelMatch[1] : xml;

    title = getTagContent(channelXml, 'title') || 'Untitled Podcast';
    description = getTagContent(channelXml, 'description') || getTagContent(channelXml, 'summary');
    author = getTagContent(channelXml, 'author') || getTagContent(channelXml, 'owner');
    link = getTagContent(channelXml, 'link') || getAttribute(channelXml, 'link', 'href') || '';
    
    artwork = getAttribute(channelXml, 'image', 'href') || getAttribute(channelXml, 'itunes:image', 'href');
    if (!artwork) {
      const imageTag = channelXml.match(/<image[^>]*>([\s\S]*?)<\/image>/i);
      if (imageTag) artwork = getTagContent(imageTag[1], 'url');
    }
    if (artwork && artwork.startsWith('http://')) {
      artwork = artwork.replace(/^http:\/\//i, 'https://');
    }
  }

  const items = [];

  if (isAtom) {
    const entryRegex = /<entry[^>]*>([\s\S]*?)<\/entry>/gi;
    let entryMatch;

    while ((entryMatch = entryRegex.exec(xml)) !== null) {
      const entryXml = entryMatch[1];
      const epTitle = getTagContent(entryXml, 'title') || 'Untitled Video';
      const epVideoId = getTagContent(entryXml, 'videoId');
      const epGuid = getTagContent(entryXml, 'id') || epVideoId;
      const epPubDate = getTagContent(entryXml, 'published') || getTagContent(entryXml, 'updated');
      const rawEntryContent = getRawTagContent(entryXml, 'content') || getRawTagContent(entryXml, 'summary') || getRawTagContent(entryXml, 'description');
      const epDesc = getTagContent(entryXml, 'description') || getTagContent(entryXml, 'summary') || cleanText(rawEntryContent);
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

      if (audioUrl) {
        items.push({
          guid: epGuid,
          title: epTitle,
          description: epDesc ? (epDesc.substring(0, 240) + (epDesc.length > 240 ? '...' : '')) : '',
          content: rawEntryContent || epDesc,
          pubDate: epPubDate,
          timestamp: timestamp,
          audioUrl: audioUrl,
          duration: '',
          artwork: epThumb || artwork,
          podcastTitle: title,
          feedUrl: originalUrl,
          isYouTube: true,
          videoId: epVideoId
        });
      }
    }
  } else {
    const itemRegex = /<item[^>]*>([\s\S]*?)<\/item>/gi;
    let itemMatch;

    while ((itemMatch = itemRegex.exec(xml)) !== null) {
      const itemXml = itemMatch[1];
      const epTitle = getTagContent(itemXml, 'title') || 'Untitled Episode';
      const epGuid = getTagContent(itemXml, 'guid') || getTagContent(itemXml, 'link') || epTitle;
      const epPubDate = getTagContent(itemXml, 'pubDate') || getTagContent(itemXml, 'published');
      const rawContent = getRawTagContent(itemXml, 'encoded') || getRawTagContent(itemXml, 'description') || getRawTagContent(itemXml, 'summary');
      const epDescription = getTagContent(itemXml, 'description') || getTagContent(itemXml, 'summary') || cleanText(rawContent);
      let epDuration = getTagContent(itemXml, 'duration');
      if (epDuration === '0:00' || epDuration === '0' || epDuration === '00:00' || epDuration === '00:00:00') {
        epDuration = '';
      }

      let audioUrl = getAttribute(itemXml, 'enclosure', 'url') || getAttribute(itemXml, 'media:content', 'url');
      let epArtwork = getAttribute(itemXml, 'image', 'href') || getAttribute(itemXml, 'itunes:image', 'href') || artwork;
      if (epArtwork && epArtwork.startsWith('http://')) {
        epArtwork = epArtwork.replace(/^http:\/\//i, 'https://');
      }

      const transcriptUrl = getAttribute(itemXml, 'podcast:transcript', 'url') || getAttribute(itemXml, 'transcript', 'url');
      const transcriptType = getAttribute(itemXml, 'podcast:transcript', 'type') || getAttribute(itemXml, 'transcript', 'type') || 'text/vtt';

      const chaptersUrl = getAttribute(itemXml, 'podcast:chapters', 'url') || getAttribute(itemXml, 'chapters', 'url');
      const chaptersType = getAttribute(itemXml, 'podcast:chapters', 'type') || getAttribute(itemXml, 'chapters', 'type') || 'application/json+chapters';

      let timestamp = 0;
      if (epPubDate) {
        const parsed = Date.parse(epPubDate);
        if (!isNaN(parsed)) timestamp = parsed;
      }

      if (audioUrl) {
        items.push({
          guid: epGuid,
          title: epTitle,
          description: epDescription ? (epDescription.substring(0, 240) + (epDescription.length > 240 ? '...' : '')) : '',
          content: rawContent || epDescription,
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
    episodes: items.slice(0, 2000)
  };
}