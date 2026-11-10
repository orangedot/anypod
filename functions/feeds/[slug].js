const PODCAST_NAMESPACE_UUID_BYTES = new Uint8Array([
  0xea, 0xd4, 0xc2, 0x36, 0xbf, 0x58, 0x58, 0xc6,
  0xa2, 0xc6, 0xa6, 0xb2, 0x8d, 0x12, 0x8c, 0xb6
]);

function escapeXml(val) {
  if (val === null || val === undefined) return '';
  return String(val)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function formatRfc2822Date(unixSeconds) {
  const ms = unixSeconds ? Number(unixSeconds) * 1000 : Date.now();
  const d = new Date(ms);
  return isNaN(d.getTime()) ? new Date().toUTCString() : d.toUTCString();
}

function formatItunesDuration(seconds) {
  const total = Math.max(0, Math.round(Number(seconds || 0)));
  const hrs = Math.floor(total / 3600);
  const mins = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  if (hrs > 0) {
    return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export async function generatePodcastGuid(feedUrlString) {
  const normalized = String(feedUrlString || '')
    .trim()
    .replace(/^https?:\/\//i, '')
    .replace(/\/+$/, '');
  const encoder = new TextEncoder();
  const nameBytes = encoder.encode(normalized);
  const combined = new Uint8Array(PODCAST_NAMESPACE_UUID_BYTES.length + nameBytes.length);
  combined.set(PODCAST_NAMESPACE_UUID_BYTES, 0);
  combined.set(nameBytes, PODCAST_NAMESPACE_UUID_BYTES.length);

  const hashBuffer = await crypto.subtle.digest('SHA-1', combined);
  const bytes = new Uint8Array(hashBuffer.slice(0, 16));
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  const hex = Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

async function hashToken(token) {
  const encoder = new TextEncoder();
  const data = encoder.encode(token);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

function parseTokenFromRequest(request) {
  const url = new URL(request.url);
  const queryToken = url.searchParams.get('token');
  if (queryToken && queryToken.trim()) return queryToken.trim();

  const authHeader = request.headers.get('Authorization') || '';
  if (authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7).trim();
  }
  if (authHeader.startsWith('Basic ')) {
    try {
      const b64 = authHeader.slice(6).trim();
      const decoded = atob(b64);
      const colonIdx = decoded.indexOf(':');
      if (colonIdx !== -1) {
        const user = decoded.slice(0, colonIdx).trim();
        const pass = decoded.slice(colonIdx + 1).trim();
        return pass || user;
      }
      return decoded.trim();
    } catch (_) {}
  }
  return null;
}

function buildAssetUrl(baseUrl, showSlug, objectKey, feedToken = null) {
  if (!objectKey) return '';
  if (objectKey.startsWith('http://') || objectKey.startsWith('https://')) {
    if (feedToken && !objectKey.includes('token=')) {
      const sep = objectKey.includes('?') ? '&' : '?';
      return `${objectKey}${sep}token=${encodeURIComponent(feedToken)}`;
    }
    return objectKey;
  }
  const cleanKey = objectKey.startsWith(`${showSlug}/`)
    ? objectKey.slice(showSlug.length + 1)
    : objectKey.replace(/^\/+/, '');
  const url = `${baseUrl}/audio/${encodeURIComponent(showSlug)}/${encodeURIComponent(cleanKey)}`;
  return feedToken ? `${url}?token=${encodeURIComponent(feedToken)}` : url;
}

export async function buildRssXml(show, episodes, baseUrl, feedToken = null) {
  const cleanBase = String(baseUrl || 'https://anypod.org').replace(/\/+$/, '');
  const feedUrl = feedToken
    ? `${cleanBase}/feeds/${encodeURIComponent(show.slug)}.xml?token=${encodeURIComponent(feedToken)}`
    : `${cleanBase}/feeds/${encodeURIComponent(show.slug)}.xml`;
  const showLink = show.website_url || `${cleanBase}/embed/${encodeURIComponent(show.slug)}`;
  const podcastGuid = await generatePodcastGuid(feedUrl);
  const explicitStr = show.explicit ? 'true' : 'false';
  const language = show.language || 'en';
  const category = show.category || 'Technology';
  const author = show.author || show.title;
  const email = show.email || 'podcasts@anypod.org';
  const coverImage = show.cover_image_url || `${cleanBase}/icon-512.png`;
  const isPrivate = Boolean(show.is_private);

  const itemsXml = (episodes || []).map(ep => {
    const audioUrl = buildAssetUrl(cleanBase, show.slug, ep.audio_key, feedToken);
    const byteSize = Math.max(0, parseInt(ep.audio_byte_size || 0, 10));
    const audioType = ep.audio_content_type || 'audio/mpeg';
    const pubDate = formatRfc2822Date(ep.published_at || ep.created_at);
    const durationStr = formatItunesDuration(ep.duration_seconds);
    const epExplicit = ep.explicit ? 'true' : 'false';
    const epType = ep.episode_type || 'full';
    const epLink = `${cleanBase}/embed/${encodeURIComponent(show.slug)}/${encodeURIComponent(ep.id)}`;
    const transcriptUrl = ep.transcript_key ? buildAssetUrl(cleanBase, show.slug, ep.transcript_key, feedToken) : '';
    const chaptersUrl = ep.chapters_key ? buildAssetUrl(cleanBase, show.slug, ep.chapters_key, feedToken) : '';

    let optionalTags = '';
    if (ep.episode_number !== null && ep.episode_number !== undefined) {
      optionalTags += `\n      <itunes:episode>${parseInt(ep.episode_number, 10)}</itunes:episode>`;
    }
    if (ep.season_number !== null && ep.season_number !== undefined) {
      optionalTags += `\n      <itunes:season>${parseInt(ep.season_number, 10)}</itunes:season>`;
    }
    if (transcriptUrl) {
      optionalTags += `\n      <podcast:transcript url="${escapeXml(transcriptUrl)}" type="text/vtt" />`;
    }
    if (chaptersUrl) {
      optionalTags += `\n      <podcast:chapters url="${escapeXml(chaptersUrl)}" type="application/json+chapters" />`;
    }

    return `    <item>
      <title>${escapeXml(ep.title)}</title>
      <description>${escapeXml(ep.description || '')}</description>
      <content:encoded><![CDATA[${String(ep.description || '').replace(/]]>/g, ']]]]><![CDATA[>')}]]></content:encoded>
      <link>${escapeXml(epLink)}</link>
      <guid isPermaLink="false">${escapeXml(ep.id)}</guid>
      <pubDate>${escapeXml(pubDate)}</pubDate>
      <enclosure url="${escapeXml(audioUrl)}" length="${byteSize}" type="${escapeXml(audioType)}" />
      <itunes:duration>${escapeXml(durationStr)}</itunes:duration>
      <itunes:explicit>${epExplicit}</itunes:explicit>
      <itunes:episodeType>${escapeXml(epType)}</itunes:episodeType>${optionalTags}
    </item>`;
  }).join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"
  xmlns:itunes="http://www.itunes.apple.com/dtds/podcast-1.0.dtd"
  xmlns:podcast="https://podcastindex.org/namespace/1.0"
  xmlns:content="http://purl.org/rss/1.0/modules/content/"
  xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${escapeXml(show.title)}</title>
    <description>${escapeXml(show.description || '')}</description>
    <link>${escapeXml(showLink)}</link>
    <language>${escapeXml(language)}</language>
    <generator>Anypod Studio (Cloudflare Edge)</generator>
    <atom:link href="${escapeXml(feedUrl)}" rel="self" type="application/rss+xml" />
    <podcast:guid>${escapeXml(podcastGuid)}</podcast:guid>
    <podcast:medium>podcast</podcast:medium>
    <podcast:locked owner="${escapeXml(email)}">${isPrivate ? 'yes' : 'no'}</podcast:locked>
    <itunes:author>${escapeXml(author)}</itunes:author>
    <itunes:explicit>${explicitStr}</itunes:explicit>
    <itunes:type>episodic</itunes:type>
    <itunes:owner>
      <itunes:name>${escapeXml(author)}</itunes:name>
      <itunes:email>${escapeXml(email)}</itunes:email>
    </itunes:owner>
    <itunes:image href="${escapeXml(coverImage)}" />
    <itunes:category text="${escapeXml(category)}" />
${itemsXml}
  </channel>
</rss>`;
}

export async function onRequest(context) {
  const { request, env, params } = context;
  const method = request.method.toUpperCase();

  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
    'Cache-Control': 'public, max-age=300, s-maxage=600',
    'Content-Type': 'application/rss+xml; charset=utf-8'
  };

  if (method === 'OPTIONS') {
    return new Response(null, { status: 204, headers });
  }

  if (method !== 'GET' && method !== 'HEAD') {
    return new Response('Method Not Allowed', { status: 405, headers });
  }

  const isHead = method === 'HEAD';
  const rawParam = String(params?.slug || '').trim();
  const showSlug = rawParam.replace(/\.xml$/i, '').replace(/\.rss$/i, '').trim();

  if (!showSlug) {
    return new Response('Not Found', { status: 404, headers });
  }

  if (!env || !env.DB) {
    return new Response('Database unavailable', { status: 503, headers });
  }

  const show = await env.DB.prepare(
    'SELECT id, owner_id, slug, title, description, author, email, cover_image_url, language, category, explicit, website_url, is_private, auth_type, custom_domain, created_at FROM shows WHERE slug = ?'
  ).bind(showSlug).first();

  if (!show) {
    return new Response('Feed Not Found', { status: 404, headers });
  }

  let feedToken = null;
  if (show.is_private) {
    feedToken = parseTokenFromRequest(request);
    if (!feedToken) {
      return new Response('Unauthorized: This podcast feed is private. A valid subscriber token is required.', {
        status: 401,
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
          'WWW-Authenticate': 'Basic realm="Private Podcast Feed"'
        }
      });
    }

    const tokenHash = await hashToken(feedToken);
    const validToken = await env.DB.prepare(
      'SELECT id, subscriber_label FROM show_feed_tokens WHERE show_id = ? AND token_hash = ? AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at > unixepoch())'
    ).bind(show.id, tokenHash).first();

    if (!validToken) {
      return new Response('Forbidden: Invalid or revoked subscriber token', {
        status: 403,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' }
      });
    }

    // Set private non-cacheable headers for subscriber feeds
    headers['Cache-Control'] = 'private, no-cache, no-store, must-revalidate';
    headers['Pragma'] = 'no-cache';
    headers['Expires'] = '0';
  }

  const now = Math.floor(Date.now() / 1000);
  const episodesResult = await env.DB.prepare(
    `SELECT id, show_id, title, description, audio_key, audio_content_type, audio_byte_size,
            duration_seconds, episode_number, season_number, episode_type, explicit,
            transcript_key, chapters_key, waveform_peaks_json, status, scheduled_for, published_at, created_at
     FROM episodes
     WHERE show_id = ?
       AND (status = 'published' OR status IS NULL)
       AND published_at IS NOT NULL
       AND published_at <= ?
     ORDER BY published_at DESC`
  ).bind(show.id, now).all();

  const episodes = episodesResult?.results || [];
  const reqUrl = new URL(request.url);
  const baseUrl = (env && env.APP_URL) || reqUrl.origin;

  const xml = await buildRssXml(show, episodes, baseUrl, feedToken);

  if (isHead) {
    return new Response(null, { status: 200, headers });
  }

  return new Response(xml, { status: 200, headers });
}
