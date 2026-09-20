import { getUserFromRequest } from './utils.js';

export async function onRequest(context) {
  const { request, env } = context;
  const urlParams = new URL(request.url).searchParams;
  let targetUrl = urlParams.get('url');

  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Session-Token',
    'Content-Type': 'application/json; charset=utf-8'
  };

  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders, status: 204 });
  }

  const user = await getUserFromRequest(request, env);
  if (!user) {
    return new Response(JSON.stringify({ 
      error: 'Unauthorized: Magic session token required.' 
    }), {
      headers: corsHeaders,
      status: 401
    });
  }

  if (request.method === 'POST') {
    try {
      const body = await request.json();
      if (body.urls && Array.isArray(body.urls)) {
        const results = await Promise.allSettled(
          body.urls.map(u => fetchAndParseFeed(u))
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

  if (!targetUrl) {
    return new Response(JSON.stringify({ 
      error: 'Missing feed URL parameter.' 
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
    const rssUrl = `https://www.youtube.com/feeds/videos.xml?playlist_id=${playlistId}`;
    try {
      const res = await fetch(rssUrl, {
        headers: {
          'User-Agent': 'Podany/1.0 (+CloudflarePages)',
          'Accept': 'application/atom+xml, application/xml, text/xml, */*'
        }
      });

      if (res.ok) {
        const xmlText = await res.text();
        const feedData = parsePodcastXml(xmlText, rssUrl, inputUrl);
        if (feedData.episodes && feedData.episodes.length > 0) {
          return feedData;
        }
      }
    } catch (err) {}

    return fetchYouTubeOEmbedFallback(playlistId, inputUrl);
  }

  const response = await fetch(inputUrl, {
    headers: {
      'User-Agent': 'Podany/1.0 (+CloudflarePages)',
      'Accept': 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*'
    }
  });

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

  const cleanText = (str) => {
    if (!str) return '';
    return str
      .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/gi, '$1')
      .replace(/<[^>]+>/g, ' ')
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
      const epDesc = getTagContent(entryXml, 'description');
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
          description: epDesc ? epDesc.substring(0, 300) : '',
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
      const epDescription = getTagContent(itemXml, 'description') || getTagContent(itemXml, 'summary');
      const epDuration = getTagContent(itemXml, 'duration');

      let audioUrl = getAttribute(itemXml, 'enclosure', 'url') || getAttribute(itemXml, 'media:content', 'url');
      let epArtwork = getAttribute(itemXml, 'image', 'href') || getAttribute(itemXml, 'itunes:image', 'href') || artwork;

      let timestamp = 0;
      if (epPubDate) {
        const parsed = Date.parse(epPubDate);
        if (!isNaN(parsed)) timestamp = parsed;
      }

      if (audioUrl) {
        items.push({
          guid: epGuid,
          title: epTitle,
          description: epDescription.substring(0, 300) + (epDescription.length > 300 ? '...' : ''),
          pubDate: epPubDate,
          timestamp: timestamp,
          audioUrl: audioUrl,
          duration: epDuration || '',
          artwork: epArtwork,
          podcastTitle: title,
          feedUrl: originalUrl
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
    episodes: items.slice(0, 50)
  };
}
