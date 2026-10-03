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
      const batchData = await fetchYouTubePlaylistBatch(playlistId, continuation);
      return new Response(JSON.stringify(batchData), {
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
 * Scrapes public playlist page for title and true total video count.
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

    const countMatch = html.match(/"videoCountText":\s*\{\s*"runs":\s*\[\s*\{\s*"text":\s*"([\d,.]+)"/i) 
                    || html.match(/"itemCount":\s*"([\d,.]+)"/i)
                    || html.match(/(\d[\d,.]*)\s+videos/i);
    
    const count = countMatch ? parseInt(countMatch[1].replace(/[,.]/g, ''), 10) : null;
    const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
    const title = titleMatch ? titleMatch[1].replace(/ - YouTube$/i, '').trim() : '';

    return { totalCount: count, title };
  } catch (_) {
    return null;
  }
}

/**
 * Fetches batches of items using YouTube's InnerTube API.
 */
async function fetchYouTubePlaylistBatch(playlistId, continuationToken = null) {
  const url = 'https://www.youtube.com/youtubei/v1/browse?prettyPrint=false';

  const body = continuationToken
    ? {
        context: {
          client: { clientName: 'WEB', clientVersion: '2.20240101.00.00' }
        },
        continuation: continuationToken
      }
    : {
        context: {
          client: { clientName: 'WEB', clientVersion: '2.20240101.00.00' }
        },
        browseId: playlistId.startsWith('VL') ? playlistId : `VL${playlistId}`
      };

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'X-YouTube-Client-Name': '1',
      'X-YouTube-Client-Version': '2.20240101.00.00'
    },
    body: JSON.stringify(body)
  });

  if (!res.ok) return { episodes: [], nextToken: null };
  const data = await res.json();

  const episodes = [];
  const seenIds = new Set();
  let nextToken = null;
  const now = Date.now();

  function extractVideos(obj) {
    if (!obj || typeof obj !== 'object') return;

    if (obj.playlistVideoRenderer) {
      const v = obj.playlistVideoRenderer;
      if (v.videoId && !seenIds.has(v.videoId)) {
        seenIds.add(v.videoId);
        const titleText = v.title?.runs
          ? v.title.runs.map(r => r.text).join('')
          : (v.title?.simpleText || 'Untitled Video');
        const authorText = v.shortBylineText?.runs
          ? v.shortBylineText.runs.map(r => r.text).join('')
          : (v.shortBylineText?.simpleText || '');
        const thumb = v.thumbnail?.thumbnails?.slice(-1)[0]?.url || '';
        const durSec = v.lengthSeconds ? parseInt(v.lengthSeconds, 10) : 0;

        const epOrderOffset = episodes.length * 60000; // 1 min apart to maintain playlist order
        const approxTimestamp = now - epOrderOffset;

        episodes.push({
          guid: `yt:${v.videoId}`,
          videoId: v.videoId,
          title: titleText,
          podcastTitle: authorText,
          artwork: thumb,
          audioUrl: `https://www.youtube.com/watch?v=${v.videoId}`,
          duration: durSec ? String(durSec) : '',
          pubDate: new Date(approxTimestamp).toUTCString(),
          timestamp: approxTimestamp,
          isYouTube: true
        });
      }
    }

    if (!nextToken) {
      if (obj.continuationCommand?.token) {
        nextToken = obj.continuationCommand.token;
      } else if (obj.continuationEndpoint?.continuationCommand?.token) {
        nextToken = obj.continuationEndpoint.continuationCommand.token;
      }
    }

    for (const key of Object.keys(obj)) {
      extractVideos(obj[key]);
    }
  }

  extractVideos(data);
  return { episodes, nextToken };
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
    // 1. Get true playlist count and title
    const meta = await fetchYouTubePlaylistMetadata(playlistId);

    // 2. Try fetching the first batch via InnerTube (returns continuation token)
    let batchData = null;
    try {
      batchData = await fetchYouTubePlaylistBatch(playlistId);
    } catch (_) {}

    if (batchData && batchData.episodes && batchData.episodes.length > 0) {
      const firstEp = batchData.episodes[0];
      const title = meta?.title || firstEp.podcastTitle || 'YouTube Playlist';
      const artwork = firstEp.artwork || 'https://i.ytimg.com/vi/default.jpg';
      const totalCount = meta?.totalCount || batchData.episodes.length;

      batchData.episodes.forEach(ep => {
        ep.podcastTitle = title;
        ep.feedUrl = inputUrl;
      });

      return {
        title,
        description: `YouTube Playlist (${playlistId})`,
        author: firstEp.podcastTitle || 'YouTube Creator',
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
          transcriptType: transcriptType || ''
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