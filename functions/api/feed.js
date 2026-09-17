/**
 * Cloudflare Pages Function: /api/feed
 * Accepts ?url=<rss_feed_url> or POST with { urls: [...] }
 * Fetches RSS XML, bypasses CORS, parses XML into structured JSON.
 */

export async function onRequest(context) {
  const { request } = context;
  const urlParams = new URL(request.url).searchParams;
  const targetUrl = urlParams.get('url');

  // Set up CORS headers
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json; charset=utf-8'
  };

  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders, status: 204 });
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
      error: 'Missing feed URL parameter. Usage: /api/feed?url=https://example.com/feed.xml' 
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
      error: `Failed to fetch or parse feed: ${error.message}`,
      url: targetUrl
    }), {
      headers: corsHeaders,
      status: 500
    });
  }
}

async function fetchAndParseFeed(feedUrl) {
  const response = await fetch(feedUrl, {
    headers: {
      'User-Agent': 'PrivatePodcastPlayer/1.0 (+CloudflarePages)',
      'Accept': 'application/rss+xml, application/xml, text/xml, */*'
    }
  });

  if (!response.ok) {
    throw new Error(`HTTP Error ${response.status}: ${response.statusText}`);
  }

  const xmlText = await response.text();
  return parsePodcastRss(xmlText, feedUrl);
}

/**
 * Robust lightweight XML parser for RSS 2.0 / iTunes / Atom podcasts
 */
function parsePodcastRss(xml, feedUrl) {
  // Utility to extract tag content (supports self-closing or innerText)
  const getTagContent = (xmlSegment, tagName) => {
    // Handle namespace variants e.g. <itunes:image href="..." /> or <image><url>...</url></image>
    const regex = new RegExp(`<(${tagName}|itunes:${tagName})[^>]*>([\\s\\S]*?)<\\/\\1\\b[^>]*>`, 'i');
    const match = xmlSegment.match(regex);
    if (match && match[2]) {
      return cleanText(match[2]);
    }
    return '';
  };

  const getAttribute = (xmlSegment, tagName, attrName) => {
    const regex = new RegExp(`<(${tagName}|itunes:${tagName})[^>]*\\b${attrName}=["']([^"']+)["'][^>]*>`, 'i');
    const match = xmlSegment.match(regex);
    return match ? match[2] : '';
  };

  const cleanText = (str) => {
    if (!str) return '';
    return str
      .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/gi, '$1')
      .replace(/<[^>]+>/g, ' ') // Strip HTML tags
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&nbsp;/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  };

  // Parse Channel Metadata
  const channelMatch = xml.match(/<channel[^>]*>([\s\S]*?)<\/channel>/i);
  const channelXml = channelMatch ? channelMatch[1] : xml;

  const title = getTagContent(channelXml, 'title') || 'Untitled Podcast';
  const description = getTagContent(channelXml, 'description') || getTagContent(channelXml, 'summary');
  const link = getTagContent(channelXml, 'link') || feedUrl;
  const author = getTagContent(channelXml, 'author') || getTagContent(channelXml, 'owner');
  
  // Channel Image
  let artwork = getAttribute(channelXml, 'image', 'href') || 
                getAttribute(channelXml, 'itunes:image', 'href');
  if (!artwork) {
    const imageTag = channelXml.match(/<image[^>]*>([\s\S]*?)<\/image>/i);
    if (imageTag) {
      artwork = getTagContent(imageTag[1], 'url');
    }
  }

  // Parse Items / Episodes
  const items = [];
  const itemRegex = /<item[^>]*>([\s\S]*?)<\/item>/gi;
  let itemMatch;

  while ((itemMatch = itemRegex.exec(xml)) !== null) {
    const itemXml = itemMatch[1];
    
    const epTitle = getTagContent(itemXml, 'title') || 'Untitled Episode';
    const epGuid = getTagContent(itemXml, 'guid') || getTagContent(itemXml, 'link') || epTitle;
    const epPubDate = getTagContent(itemXml, 'pubDate') || getTagContent(itemXml, 'published');
    const epDescription = getTagContent(itemXml, 'description') || getTagContent(itemXml, 'summary');
    const epDuration = getTagContent(itemXml, 'duration');

    // Audio Stream URL (from <enclosure url="..." type="audio/..."> or <media:content>)
    let audioUrl = getAttribute(itemXml, 'enclosure', 'url');
    if (!audioUrl) {
      audioUrl = getAttribute(itemXml, 'media:content', 'url');
    }
    if (!audioUrl) {
      const linkMatch = itemXml.match(/<link[^>]*>(https?:\/\/[^\s<]+\.(mp3|m4a|aac|ogg|wav)[^\s<]*)<\/link>/i);
      if (linkMatch) audioUrl = linkMatch[1];
    }

    // Episode specific artwork or fallback to channel artwork
    let epArtwork = getAttribute(itemXml, 'image', 'href') || getAttribute(itemXml, 'itunes:image', 'href');
    if (!epArtwork) epArtwork = artwork;

    // Parse date timestamp
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
        feedUrl: feedUrl
      });
    }
  }

  // Sort episodes by timestamp descending (newest first)
  items.sort((a, b) => b.timestamp - a.timestamp);

  return {
    title,
    description: description.substring(0, 500),
    link,
    author,
    artwork,
    feedUrl,
    episodesCount: items.length,
    updatedAt: new Date().toISOString(),
    episodes: items
  };
}
