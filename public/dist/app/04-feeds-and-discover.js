'use strict';

// ─────────────────────────────────────────────────────────────────────────
// SECTION 14 · Feed Fetching
// refreshAllFeeds — fetches all subscribed feeds in parallel via
//   Promise.allSettled, merges results into state.allEpisodes.
// fetchSingleFeed — fetches /api/feed?url=… and updates metadata map.
// renderSkeletonTimeline — placeholder cards shown during first load.
// ─────────────────────────────────────────────────────────────────────────

function renderSkeletonTimeline() {
  const container = elements.timelineList;
  if (!container) return;
  let html = '';
  for (let i = 0; i < 4; i++) {
    html += `
      <div class="skeleton-card">
        <div class="skeleton-art"></div>
        <div class="skeleton-lines">
          <div class="skeleton-line" style="width: 35%;"></div>
          <div class="skeleton-line" style="width: 80%;"></div>
          <div class="skeleton-line" style="width: 60%;"></div>
        </div>
      </div>
    `;
  }
  container.innerHTML = html;
}

const CLOUDFLARE_FEED_TTL_MS = 30 * 60 * 1000; // 30-min local TTL before re-hitting Cloudflare on auto-startup

/**
 * Native browser DOMParser RSS/Atom XML parser (0ms Cloudflare Worker CPU).
 * Parses up to 550 episodes on-device and preserves show notes locally.
 */
function parsePodcastXmlClient(xmlText, originalUrl) {
  if (!xmlText || typeof DOMParser === 'undefined') return null;
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlText, 'text/xml');
  if (!doc || doc.querySelector('parsererror')) return null;

  const stripHtmlToSummary = (raw, maxLen = 240) => {
    if (!raw) return '';
    const slice = raw.length > maxLen * 5 ? raw.slice(0, maxLen * 5) : raw;
    const clean = slice.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    return clean.length > maxLen ? clean.slice(0, maxLen) + '...' : clean;
  };

  const getChildText = (parent, localNames) => {
    if (!parent) return '';
    for (const name of localNames) {
      const el = parent.getElementsByTagName(name)[0];
      if (el && el.textContent) return el.textContent.trim();
    }
    return '';
  };

  const getChildAttr = (parent, tagNames, attrName) => {
    if (!parent) return '';
    for (const name of tagNames) {
      const el = parent.getElementsByTagName(name)[0];
      if (el) {
        const v = el.getAttribute(attrName);
        if (v) return v.trim();
      }
    }
    return '';
  };

  const isAtom = doc.documentElement && doc.documentElement.nodeName.toLowerCase() === 'feed';
  const channel = isAtom ? doc.documentElement : (doc.querySelector('channel') || doc.documentElement);
  if (!channel) return null;

  const title = getChildText(channel, ['title']) || 'Untitled Podcast';
  const rawChDesc = getChildText(channel, ['description', 'itunes:summary', 'subtitle']);
  const description = stripHtmlToSummary(rawChDesc, 500);
  const author = getChildText(channel, ['itunes:author', 'author', 'name']) || '';
  let artwork = getChildAttr(channel, ['itunes:image', 'image'], 'href');
  if (!artwork) {
    const imgEl = channel.querySelector('image > url');
    if (imgEl && imgEl.textContent) artwork = imgEl.textContent.trim();
  }
  if (artwork && artwork.startsWith('http://')) {
    artwork = 'https://' + artwork.slice(7);
  }

  const entries = isAtom
    ? Array.from(doc.getElementsByTagName('entry'))
    : Array.from(doc.getElementsByTagName('item'));

  const episodes = [];
  const MAX_CLIENT_EPISODES = 550;

  for (let i = 0; i < entries.length && episodes.length < MAX_CLIENT_EPISODES; i++) {
    const item = entries[i];
    let audioUrl = getChildAttr(item, ['enclosure', 'media:content'], 'url');
    const epVideoId = isAtom ? getChildText(item, ['yt:videoId', 'videoId']) : '';
    if (!audioUrl && epVideoId) {
      audioUrl = `https://www.youtube.com/watch?v=${epVideoId}`;
    }
    if (!audioUrl) continue;

    const epTitle = getChildText(item, ['title']) || 'Untitled Episode';
    const epGuid = getChildText(item, ['guid', 'id', 'link']) || epVideoId || epTitle;
    const epPubDate = getChildText(item, ['pubDate', 'published', 'updated']) || '';
    const rawContent = getChildText(item, ['content:encoded', 'encoded', 'description', 'itunes:summary', 'summary', 'content']);
    const epDesc = stripHtmlToSummary(rawContent, 240);
    let epDuration = getChildText(item, ['itunes:duration', 'duration']);
    if (epDuration === '0:00' || epDuration === '0' || epDuration === '00:00' || epDuration === '00:00:00') {
      epDuration = '';
    }

    let epArtwork = getChildAttr(item, ['itunes:image', 'image'], 'href')
      || getChildAttr(item, ['media:thumbnail', 'thumbnail'], 'url')
      || artwork;
    if (epArtwork && epArtwork.startsWith('http://')) {
      epArtwork = 'https://' + epArtwork.slice(7);
    }

    const transcriptUrl = getChildAttr(item, ['podcast:transcript', 'transcript'], 'url');
    const transcriptType = transcriptUrl ? (getChildAttr(item, ['podcast:transcript', 'transcript'], 'type') || 'text/vtt') : '';
    const chaptersUrl = getChildAttr(item, ['podcast:chapters', 'chapters'], 'url');
    const chaptersType = chaptersUrl ? (getChildAttr(item, ['podcast:chapters', 'chapters'], 'type') || 'application/json+chapters') : '';

    let timestamp = 0;
    if (epPubDate) {
      const parsed = Date.parse(epPubDate);
      if (!isNaN(parsed)) timestamp = parsed;
    }

    episodes.push({
      guid: epGuid,
      title: epTitle,
      description: epDesc,
      content: rawContent.length <= 24000 ? rawContent : rawContent.slice(0, 24000),
      pubDate: epPubDate,
      timestamp,
      audioUrl,
      duration: epDuration || '',
      artwork: epArtwork,
      podcastTitle: title,
      feedUrl: originalUrl,
      isYouTube: Boolean(epVideoId),
      videoId: epVideoId || undefined,
      transcriptUrl: transcriptUrl || '',
      transcriptType: transcriptType || '',
      chaptersUrl: chaptersUrl || '',
      chaptersType: chaptersType || ''
    });
  }

  episodes.sort((a, b) => b.timestamp - a.timestamp);
  if (episodes.length === 0 && entries.length > 0) return null;

  return {
    title,
    description,
    author,
    artwork: artwork || (episodes[0]?.artwork || ''),
    link: originalUrl,
    feedUrl: originalUrl,
    episodesCount: episodes.length,
    updatedAt: new Date().toISOString(),
    episodes
  };
}

async function refreshAllFeeds(options = {}) {
  const forceRefresh = Boolean(options && options.force);
  if (state.feeds.length === 0) {
    state.allEpisodes = [];
    state.filteredEpisodes = [];
    state.feedMetadata = {};
    saveCacheToStorage();
    updateFeedCountUI();
    renderContinueShelf();
    renderTimeline(true);
    renderFeedsGrid();
    return;
  }

  if (state.allEpisodes.length === 0) {
    renderSkeletonTimeline();
  }

  const totalFeeds = state.feeds.length;
  let completedFeeds = 0;
  let newEpisodesCount = 0;
  let activeFeedTitle = '';

  // Track existing guids to detect newly discovered episodes
  const existingGuids = new Set(state.allEpisodes.map(e => e.guid).filter(Boolean));
  const allKnownGuids = new Set(existingGuids);

  const updateStatusText = () => {
    let text = `Updating feeds (${completedFeeds}/${totalFeeds})`;
    if (activeFeedTitle) {
      text += ` · ${activeFeedTitle}`;
    }
    if (newEpisodesCount > 0) {
      text += ` · ${newEpisodesCount} new episode${newEpisodesCount === 1 ? '' : 's'}`;
    }
    const pct = totalFeeds > 0 ? (completedFeeds / totalFeeds) * 100 : 0;
    showStatus(text, pct);
  };

  updateStatusText();

  const incomingEpisodes = [];
  const updatedMetadata = { ...state.feedMetadata };

  // Throttled UI updater for smooth, non-blocking rendering as feeds complete
  let renderTimer = null;
  let pendingUiUpdate = false;
  const scheduleProgressiveRender = () => {
    pendingUiUpdate = true;
    if (renderTimer) return;
    renderTimer = setTimeout(() => {
      renderTimer = null;
      if (pendingUiUpdate) {
        pendingUiUpdate = false;
        processAndSortEpisodes();
        renderTimeline(true);
        renderFeedsGrid();
        updateFeedCountUI();
      }
    }, 400);
  };

  // Process feeds in bounded concurrent chunks (max 5 in-flight)
  const CONCURRENCY = 5;

  const feedPriority = new Map();
  const currentFeedUrl = state.currentEpisode?.feedUrl;
  if (currentFeedUrl) {
    feedPriority.set(currentFeedUrl, Date.now() + 10000000); // Active playing show gets top priority
  }

  // Calculate highest lastListenedAt per feed across all episodes
  if (state.allEpisodes && state.playbackPositions) {
    state.allEpisodes.forEach(ep => {
      if (!ep || !ep.feedUrl) return;
      const pos = state.playbackPositions[ep.guid];
      if (!pos) return;

      let score = 0;
      if (pos.lastListenedAt) {
        const t = new Date(pos.lastListenedAt).getTime();
        if (!isNaN(t)) score = t;
      } else if (pos.position && pos.position > 2) {
        score = 1; // Played something in this feed even without timestamp
      }

      if (score > (feedPriority.get(ep.feedUrl) || 0)) {
        feedPriority.set(ep.feedUrl, score);
      }
    });
  }

  const queue = [...state.feeds].sort((a, b) => {
    const scoreA = feedPriority.get(a) || 0;
    const scoreB = feedPriority.get(b) || 0;
    return scoreB - scoreA;
  });
  const workers = Array(Math.min(CONCURRENCY, queue.length)).fill(0).map(async () => {
    while (queue.length > 0) {
      const url = queue.shift();
      if (url) {
        const feedMeta = state.feedMetadata[url];
        activeFeedTitle = feedMeta?.title || '';
        updateStatusText();

        const result = await fetchSingleFeed(url, incomingEpisodes, updatedMetadata, { force: forceRefresh });
        completedFeeds++;

        if (result && Array.isArray(result.episodes) && result.episodes.length > 0) {
          let foundNewForThisFeed = 0;
          const newBatch = [];
          result.episodes.forEach(ep => {
            if (ep && ep.guid && !allKnownGuids.has(ep.guid)) {
              allKnownGuids.add(ep.guid);
              foundNewForThisFeed++;
              newBatch.push(ep);
            }
          });

          if (foundNewForThisFeed > 0) {
            newEpisodesCount += foundNewForThisFeed;
            state.allEpisodes = [...newBatch, ...state.allEpisodes];
            state.feedMetadata = { ...state.feedMetadata, ...updatedMetadata };
            scheduleProgressiveRender();
          }
        }

        updateStatusText();
      }
    }
  });

  await Promise.all(workers);

  // Cancel any pending throttled render
  if (renderTimer) {
    clearTimeout(renderTimer);
    renderTimer = null;
  }

  // Final merge and deduplication
  if (incomingEpisodes.length > 0) {
    const epMap = new Map();
    incomingEpisodes.forEach(ep => {
      if (ep && ep.guid) epMap.set(ep.guid, ep);
    });
    state.allEpisodes.forEach(ep => {
      if (ep && ep.guid && !epMap.has(ep.guid) && state.feeds.includes(ep.feedUrl)) {
        epMap.set(ep.guid, ep);
      }
    });
    state.allEpisodes = Array.from(epMap.values());
    state.feedMetadata = updatedMetadata;
    saveCacheToStorage();
  } else {
    state.feedMetadata = { ...state.feedMetadata, ...updatedMetadata };
    saveCacheToStorage();
  }

  processAndSortEpisodes();
  renderTimeline(true);
  renderFeedsGrid();
  updateFeedCountUI();

  let finalSummary = `Updated ${totalFeeds} feed${totalFeeds === 1 ? '' : 's'}`;
  if (newEpisodesCount > 0) {
    finalSummary += ` · ${newEpisodesCount} new episode${newEpisodesCount === 1 ? '' : 's'}`;
  }
  showStatus(finalSummary);
  setTimeout(hideStatus, 3200);
}

function sanitizeFeedUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') return '';
  let clean = rawUrl.trim();
  // Strip accidental markdown wrapper syntax: [Title](https://...) or https://...](https://...)
  if (clean.includes('](') || clean.startsWith('[') || clean.endsWith(')')) {
    const match = clean.match(/https?:\/\/[^\s\)"'\]]+/);
    if (match) clean = match[0];
  }
  clean = clean.replace(/[\]\)>]+$/, '');
  return clean;
}

const KNOWN_NO_CORS_HOSTS = new Set([
  'feeds.npr.org',
  'deutschlandfunk.de',
  'www.deutschlandfunk.de',
  'deutschlandfunkkultur.de',
  'www.deutschlandfunkkultur.de',
  'hoerspielundfeature.de',
  'www.hoerspielundfeature.de',
  'www1.wdr.de',
  'wdr.de',
  'ndr.de',
  'www.ndr.de',
  'feeds.acast.com',
  'ra.co',
  'feeds.soundcloud.com',
  'feeds.feedburner.com',
  'trueunderground.one',
  'www.trueunderground.one',
  'thecreativeprocess.squarespace.com',
  'podcast.audiocon.de',
  'podcast.daskoimladja.com'
]);

function getCachedNoCorsHosts() {
  try {
    const raw = storage.getItem('anypod_no_cors_hosts_v1');
    if (raw) return new Set(JSON.parse(raw));
  } catch (_) {}
  return new Set();
}

function rememberNoCorsHost(hostname) {
  if (!hostname) return;
  try {
    const current = getCachedNoCorsHosts();
    current.add(hostname);
    storage.setItem('anypod_no_cors_hosts_v1', JSON.stringify([...current]));
  } catch (_) {}
}

async function fetchSingleFeed(rawUrl, incomingEpisodes, updatedMetadata, options = {}) {
  const url = sanitizeFeedUrl(rawUrl);
  if (!url) return null;
  const forceRefresh = Boolean(options && options.force);
  const existingMeta = state.feedMetadata[url] || state.feedMetadata[rawUrl] || {};
  const isYouTubeUrl = url.includes('youtube.com') || url.includes('youtu.be');
  const isHttpsPage = typeof window !== 'undefined' && window.location.protocol === 'https:';
  const isHttpFeedOnHttps = isHttpsPage && url.startsWith('http://');

  let feedHostname = '';
  try { feedHostname = new URL(url).hostname; } catch (_) {}
  const isKnownNoCors = KNOWN_NO_CORS_HOSTS.has(feedHostname) || getCachedNoCorsHosts().has(feedHostname);

  try {
    let feedData = null;
    let usedDirectCors = false;

    // 1. CLIENT-FIRST HYBRID: Try direct browser RSS fetch + native DOMParser (0 Cloudflare requests!)
    //    Runs on startup for direct-capable HTTPS feeds. Skips hosts known to lack CORS to avoid red console errors.
    if (!isYouTubeUrl && !isHttpFeedOnHttps && existingMeta.corsBlocked !== true && !isKnownNoCors) {
      try {
        const directRes = await fetch(url, {
          method: 'GET',
          headers: { 'Accept': 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*' },
          signal: (typeof AbortSignal !== 'undefined' && AbortSignal.timeout) ? AbortSignal.timeout(7000) : undefined
        });
        if (directRes.ok) {
          const xmlText = await directRes.text();
          const parsedClient = parsePodcastXmlClient(xmlText, url);
          if (parsedClient && Array.isArray(parsedClient.episodes) && parsedClient.episodes.length > 0) {
            feedData = parsedClient;
            usedDirectCors = true;
          }
        }
      } catch (_) {
        // Direct fetch failed (likely CORS header missing on upstream podcast host) — remember this!
        existingMeta.corsBlocked = true;
        if (feedHostname) rememberNoCorsHost(feedHostname);
      }
    }

    // 2. CLOUDFLARE FALLBACK: Only for CORS-blocked RSS feeds, HTTP feeds on HTTPS, or YouTube playlists
    if (!feedData) {
      const currentFeedEps = state.allEpisodes ? state.allEpisodes.filter(e => e.feedUrl === url) : [];
      const lastFetched = existingMeta.lastFetchedAt || 0;

      // Respect 30-min local TTL on automatic startup for Cloudflare-proxied feeds if episodes are already cached
      if (!forceRefresh && currentFeedEps.length > 0 && lastFetched > 0 && (Date.now() - lastFetched < CLOUDFLARE_FEED_TTL_MS)) {
        updatedMetadata[url] = { ...existingMeta };
        return {
          title: existingMeta.title,
          artwork: existingMeta.artwork,
          episodesCount: existingMeta.episodesCount || currentFeedEps.length,
          description: existingMeta.description,
          episodes: currentFeedEps
        };
      }

      const headers = {};
      if (state.sessionToken) headers['X-Session-Token'] = state.sessionToken;

      // 2a. For standard RSS feeds (non-YouTube), try /api/feed?raw=1 first so Cloudflare only streams bytes (0ms Worker XML CPU!)
      if (!isYouTubeUrl) {
        try {
          const rawRes = await fetch(`/api/feed?raw=1&url=${encodeURIComponent(url)}`, { headers });
          if (rawRes.ok) {
            const xmlText = await rawRes.text();
            const parsedClient = parsePodcastXmlClient(xmlText, url);
            if (parsedClient && Array.isArray(parsedClient.episodes) && parsedClient.episodes.length > 0) {
              feedData = parsedClient;
            }
          }
        } catch (_) {}
      }

      // 2b. Fallback to server-parsed JSON (/api/feed?url=...) for YouTube playlists or if raw parse didn't match
      if (!feedData) {
        const apiUrl = `/api/feed?url=${encodeURIComponent(url)}`;
        let response = await fetch(apiUrl, { headers });

        // At most 1 retry (instead of 3x retry storm) on transient 503/524/429
        if (response.status === 503 || response.status === 524 || response.status === 429) {
          await new Promise(r => setTimeout(r, 2500));
          response = await fetch(apiUrl, { headers });
        }

        if (response.status === 401) {
          throw new Error('Unauthorized');
        }
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        feedData = await response.json();
      }
    }

    if (feedData.error) {
      if (!updatedMetadata[url]) {
        updatedMetadata[url] = {
          title: feedData.title || 'Unavailable Feed',
          artwork: '',
          episodesCount: 0,
          error: feedData.error
        };
      }
      if (rawUrl && rawUrl !== url && updatedMetadata[url]) {
      updatedMetadata[rawUrl] = updatedMetadata[url];
    }
    return null;
    }

    // Check if this playlist is already fully cached locally
    const currentFeedEps = state.allEpisodes ? state.allEpisodes.filter(e => e.feedUrl === url) : [];
    const expectedTotal = feedData.episodesCount || 0;
    const isAlreadyFullySynced = expectedTotal > 0 && currentFeedEps.length >= expectedTotal;

    // Trigger progressive background pagination for YouTube playlists ONLY if older episodes are actually missing
    if (feedData.isYouTubePlaylist && feedData.playlistId && !isAlreadyFullySynced) {
      startYouTubeBackgroundPaging(feedData.playlistId, url, feedData.nextToken || null);
    }

    updatedMetadata[url] = {
      title: feedData.title,
      artwork: feedData.artwork,
      episodesCount: feedData.episodesCount,
      description: feedData.description,
      isYouTubePlaylist: feedData.isYouTubePlaylist || false,
      playlistId: feedData.playlistId || null,
      nextToken: feedData.nextToken || null,
      corsBlocked: usedDirectCors ? false : Boolean(existingMeta.corsBlocked || isKnownNoCors),
      lastFetchedAt: Date.now()
    };

    if (rawUrl && rawUrl !== url) {
      updatedMetadata[rawUrl] = updatedMetadata[url];
    }

    if (Array.isArray(feedData.episodes)) {
      incomingEpisodes.push(...feedData.episodes);
    }

    return feedData;
  } catch (err) {
    if (!updatedMetadata[url]) {
      updatedMetadata[url] = state.feedMetadata[url]
        ? { ...state.feedMetadata[url], error: err.message }
        : {
            title: 'Error Loading Feed',
            artwork: '',
            episodesCount: 0,
            error: err.message
          };
    }
    if (rawUrl && rawUrl !== url && updatedMetadata[url]) {
      updatedMetadata[rawUrl] = updatedMetadata[url];
    }
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────
// SECTION 15 · Filtering, Sorting & Time Utilities
// processAndSortEpisodes — applies search query + filterMode + sortOrder
//   to produce state.filteredEpisodes.
// filterMode values: 'unplayed' | 'continue' | 'played' | 'downloaded' | 'all'
// Utility formatters: parseDurationSeconds, formatCompactDate,
//   formatDurationCompact, formatHumanRelativeDate, formatEpisodeDuration.
// ─────────────────────────────────────────────────────────────────────────

function updateFilterBadges() {
  const currentGuid = state.currentEpisode ? state.currentEpisode.guid : null;
  if (elements.continueCount) {
    const inProgressCount = state.allEpisodes.filter(ep => {
      const pos = state.playbackPositions[ep.guid];
      const isCurrent = currentGuid && ep.guid === currentGuid;
      return (!pos || !pos.completed) && (isCurrent || (pos && pos.position > 2));
    }).length;
    elements.continueCount.textContent = inProgressCount;
  }
  if (elements.playedCount) {
    const playedCount = state.allEpisodes.filter(ep => {
      const pos = state.playbackPositions[ep.guid];
      return pos && (pos.completed === 1 || pos.completed === true);
    }).length;
    elements.playedCount.textContent = playedCount;
  }
  if (elements.downloadedCount) {
    const dlCount = Object.keys(state.downloadedEpisodes || {}).length;
    elements.downloadedCount.textContent = dlCount;
  }
}

const parseDurationSeconds = window.AnypodShared.parseDurationSeconds;
const formatCompactDate = window.AnypodShared.formatCompactDate;
const formatDurationCompact = window.AnypodShared.formatDurationCompact;
const formatHumanRelativeDate = window.AnypodShared.formatHumanRelativeDate;
const formatEpisodeDuration = window.AnypodShared.formatEpisodeDuration;

function processAndSortEpisodes() {
  //console.log('[Anypod Debug] processAndSortEpisodes running. FilterMode:', state.filterMode);
  let list = [...state.allEpisodes];

  if (!state.searchQuery && state.mutedFeeds && state.mutedFeeds.length > 0) {
    list = list.filter(ep => !state.mutedFeeds.includes(ep.feedUrl));
  }

  if (state.searchQuery) {
    const q = state.searchQuery.toLowerCase().trim();
    const terms = q.split(/\s+/).filter(Boolean);
    list = list.filter(ep => {
      const fullDesc = (ep.content || ep.description || '').toLowerCase();
      const title = (ep.title || '').toLowerCase();
      const podTitle = (ep.podcastTitle || '').toLowerCase();
      const feedUrl = (ep.feedUrl || '').toLowerCase();
      const author = (ep.author || (state.feedMetadata[ep.feedUrl]?.author) || '').toLowerCase();

      // In-depth search: all terms must match across any of the fields
      return terms.every(term => 
        title.includes(term) ||
        podTitle.includes(term) ||
        fullDesc.includes(term) ||
        author.includes(term) ||
        feedUrl.includes(term)
      );
    });
  }

  const currentGuid = state.currentEpisode ? state.currentEpisode.guid : null;

  if (state.filterMode === 'continue') {
    list = list.filter(ep => {
      const pos = state.playbackPositions[ep.guid];
      const isCurrent = currentGuid && ep.guid === currentGuid;
      return (!pos || !pos.completed) && (isCurrent || (pos && pos.position > 2));
    });
    if (currentGuid) {
      const curIdx = list.findIndex(e => e.guid === currentGuid);
      if (curIdx > 0) {
        const cur = list.splice(curIdx, 1)[0];
        list.unshift(cur);
      }
    }
  } else if (state.filterMode === 'unplayed') {
    list = list.filter(ep => {
      const pos = state.playbackPositions[ep.guid];
      const isCurrent = currentGuid && ep.guid === currentGuid;
      // Keep episode in unplayed list if it's currently active or unplayed
      if (isCurrent) return true;
      // Keep active episode in list so it doesn't vanish on click
      return !pos || (!pos.completed);
    });
  } else if (state.filterMode === 'played') {
    list = list.filter(ep => {
      const pos = state.playbackPositions[ep.guid];
      return pos && (pos.completed === 1 || pos.completed === true);
    });
  } else if (state.filterMode === 'downloaded') {
    list = list.filter(ep => !!state.downloadedEpisodes[ep.guid]);
  }

  if (state.filterMode === 'continue') {
    list.sort((a, b) => {
      const posA = state.playbackPositions[a.guid];
      const posB = state.playbackPositions[b.guid];
      const timeA = (posA && posA.lastListenedAt) || (a.timestamp ? a.timestamp / 1000 : 0);
      const timeB = (posB && posB.lastListenedAt) || (b.timestamp ? b.timestamp / 1000 : 0);
      return timeB - timeA;
    });
    if (currentGuid) {
      const curIdx = list.findIndex(e => e.guid === currentGuid);
      if (curIdx > 0) {
        const cur = list.splice(curIdx, 1)[0];
        list.unshift(cur);
      }
    }
  } else if (state.sortOrder === 'newest') {
    list.sort((a, b) => b.timestamp - a.timestamp);
  } else if (state.sortOrder === 'oldest') {
    list.sort((a, b) => a.timestamp - b.timestamp);
  } else if (state.sortOrder === 'title-asc') {
    list.sort((a, b) => (a.title || '').localeCompare(b.title || ''));
  } else if (state.sortOrder === 'title-desc') {
    list.sort((a, b) => (b.title || '').localeCompare(a.title || ''));
  } else if (state.sortOrder === 'podcast-asc') {
    list.sort((a, b) => {
      const comp = (a.podcastTitle || '').localeCompare(b.podcastTitle || '');
      return comp !== 0 ? comp : b.timestamp - a.timestamp;
    });
  } else if (state.sortOrder === 'duration-asc') {
    list.sort((a, b) => parseDurationSeconds(a.duration) - parseDurationSeconds(b.duration));
  } else if (state.sortOrder === 'duration-desc') {
    list.sort((a, b) => parseDurationSeconds(b.duration) - parseDurationSeconds(a.duration));
  }

  state.filteredEpisodes = list;
  state.timelinePage = 1;
  updateFilterBadges();
  renderContinueShelf();
}

const DIR_PAGE_SIZE = 12;

const SUBGENRE_MAP = {
  'Science': [
    { label: 'General Science', query: 'Science Nature Research' },
    { label: 'Daily Science News', query: 'Daily Science Discovery News' },
    { label: 'Scientific Breakthroughs', query: 'Scientific Breakthroughs Frontiers' },
    { label: 'Deep Dive Science', query: 'Radiolab Science Vs Explained' },
    { label: 'Skepticism & Critical Thinking', query: 'Skeptics Guide Science Critical Thinking' },
    { label: 'Citizen & Open Science', query: 'Open Science Citizen Science' },
    { label: 'Laboratory & Methods', query: 'Laboratory Scientific Method Experiments' },
    { label: 'Science Communication', query: 'Science Communication Scicomm' },
    { label: 'Space & Earth Studies', query: 'Earth Space Science Discovery' },
    { label: 'Evolution & Origins', query: 'Evolution Origin of Life Science' },
    { label: 'Cutting-Edge Tech', query: 'Emerging Technology Science Trends' },
    { label: 'Women in STEM', query: 'Women in Science STEM Research' },
    { label: 'Science Journalism', query: 'Science Journalism Investigation' },
    { label: 'Nobel & Discoveries', query: 'Nobel Prize Science Discoveries' },
    { label: 'Science History & Society', query: 'Science Society Culture Future' }
  ],
  'Climate': [
    { label: 'Climate Science', query: 'Climate Science Global Warming Research' },
    { label: 'Climate Solutions', query: 'Climate Solutions Drawdown Carbon' },
    { label: 'Global Policy & COP', query: 'Climate Policy IPCC UN COP' },
    { label: 'Carbon Removal & Capture', query: 'Carbon Capture Removal Climate' },
    { label: 'Extreme Weather & Planet', query: 'Extreme Weather Climate Impacts' },
    { label: 'Climate Economics', query: 'Climate Economics Green Finance' },
    { label: 'Degrowth & Regeneration', query: 'Regenerative Climate Sustainability' },
    { label: 'Climate Justice', query: 'Climate Justice Frontline Communities' },
    { label: 'Urban Resilience', query: 'Climate Resilient Cities Urban Design' },
    { label: 'Cryosphere & Ice', query: 'Arctic Antarctic Glaciers Ice Melt' },
    { label: 'Decarbonization', query: 'Decarbonization Net Zero Transition' },
    { label: 'Climate Culture & Fiction', query: 'Climate Culture Storytelling Cli-Fi' },
    { label: 'Youth & Activism', query: 'Climate Activism Fridays Future Movement' },
    { label: 'Circular Economy', query: 'Circular Economy Waste Reduction Climate' },
    { label: 'Renewable Transition', query: 'Clean Transition Climate Action' }
  ],
  'Earth Nature': [
    { label: 'Biodiversity & Wildlife', query: 'Biodiversity Wildlife Animals Conservation' },
    { label: 'Geology & Earth Science', query: 'Geology Rocks Volcanoes Earthquakes' },
    { label: 'Soil & Mycelium', query: 'Soil Biology Fungi Mycelium Earth' },
    { label: 'Rainforests & Jungles', query: 'Rainforest Amazon Tropical Ecology' },
    { label: 'Mountains & Canyons', query: 'Mountains Alpine Ecology Geology' },
    { label: 'Deserts & Arid Lands', query: 'Desert Ecology Arid Landscapes Nature' },
    { label: 'Rivers & Freshwaters', query: 'Rivers Freshwater Ecology Wetlands' },
    { label: 'Wilderness & Rewilding', query: 'Rewilding Wilderness Restoration Nature' },
    { label: 'National Parks', query: 'National Parks Nature Preservation' },
    { label: 'Botany & Plant Life', query: 'Botany Plant Ecology Flora Nature' },
    { label: 'Birdwatching & Ornithology', query: 'Ornithology Birdwatching Birds Nature' },
    { label: 'Insect World', query: 'Entomology Insects Pollinators Bees' },
    { label: 'Caves & Subterranean', query: 'Speleology Caves Subterranean Earth' },
    { label: 'Islands & Endemism', query: 'Island Biogeography Endemic Wildlife' },
    { label: 'Earth System & Gaia', query: 'Earth System Science Biosphere Gaia' }
  ],
  'Space Astronomy': [
    { label: 'Astrophysics & Cosmos', query: 'Astrophysics Cosmos Universe Space' },
    { label: 'NASA Missions', query: 'NASA Space Exploration Missions' },
    { label: 'ESA & Global Agencies', query: 'European Space Agency Space Missions' },
    { label: 'James Webb & Telescopes', query: 'James Webb Hubble Space Telescope Astronomy' },
    { label: 'Solar System & Planets', query: 'Solar System Mars Jupiter Moon Planets' },
    { label: 'Exoplanets & Worlds', query: 'Exoplanets Habitable Zones Astronomy' },
    { label: 'Black Holes & Spacetime', query: 'Black Holes Gravitational Waves Spacetime' },
    { label: 'Commercial Spaceflight', query: 'SpaceX Rocket Launch Space Exploration' },
    { label: 'SETI & Astrobiology', query: 'SETI Astrobiology Alien Life Cosmos' },
    { label: 'Lunar Missions & Artemis', query: 'Artemis Moon Landing Lunar Base' },
    { label: 'Mars Colonization', query: 'Mars Rover Exploration Colony' },
    { label: 'The Sun & Space Weather', query: 'Solar Physics Space Weather Sun Flares' },
    { label: 'Stargazing & Night Sky', query: 'Stargazing Night Sky Constellations Astronomy' },
    { label: 'Dark Matter & Energy', query: 'Dark Matter Dark Energy Big Bang' },
    { label: 'Deep Space Telescopes', query: 'Radio Astronomy Deep Space Interferometry' }
  ],
  'Oceans Marine': [
    { label: 'Marine Biology', query: 'Marine Biology Ocean Sea Creatures' },
    { label: 'Deep Sea Exploration', query: 'Deep Sea Ocean Abyss Exploration Trench' },
    { label: 'Coral Reefs & Ecology', query: 'Coral Reefs Marine Conservation Ocean' },
    { label: 'Whales & Cetaceans', query: 'Whales Dolphins Marine Mammals Ocean' },
    { label: 'Sharks & Apex Predators', query: 'Sharks Marine Apex Predators Ocean' },
    { label: 'Ocean Currents & AMOC', query: 'Ocean Currents Atlantic AMOC Climate' },
    { label: 'Coastal & Mangrove Seas', query: 'Mangroves Coastal Wetlands Ocean Ecology' },
    { label: 'Plastic Pollution', query: 'Ocean Plastics Marine Debris Cleanup' },
    { label: 'Sustainable Fisheries', query: 'Sustainable Fisheries Overfishing Ocean' },
    { label: 'Bioluminescence & Abyssal', query: 'Bioluminescence Abyssal Creatures Deep Sea' },
    { label: 'Underwater Archaeology', query: 'Shipwrecks Marine Archaeology Submerged Cities' },
    { label: 'Scientific Diving', query: 'Scientific Diving Ocean Expedition Marine' },
    { label: 'Kelp Forests', query: 'Kelp Forests Sea Otters Marine Ecosystems' },
    { label: 'Polar Oceans & Sea Ice', query: 'Arctic Ocean Antarctic Marine Life Sea Ice' },
    { label: 'Submersibles & Ocean Tech', query: 'Submersibles Ocean Exploration ROV AUV' }
  ],
  'Physics Quantum': [
    { label: 'Quantum Mechanics', query: 'Quantum Mechanics Quantum Physics Science' },
    { label: 'Quantum Computing', query: 'Quantum Computing Qubits Quantum Tech' },
    { label: 'Particle Physics & CERN', query: 'CERN Particle Physics Large Hadron Collider' },
    { label: 'General Relativity', query: 'Einstein General Relativity Gravitation Physics' },
    { label: 'String Theory & Multiverse', query: 'String Theory Theoretical Physics Multiverse' },
    { label: 'Thermodynamics & Entropy', query: 'Thermodynamics Entropy Arrow of Time Physics' },
    { label: 'Lasers & Optics', query: 'Optics Photonics Laser Physics Light' },
    { label: 'Nuclear Physics', query: 'Nuclear Physics Fusion Fission Energy' },
    { label: 'Condensed Matter', query: 'Condensed Matter Superconductivity Materials' },
    { label: 'Acoustics & Waves', query: 'Acoustics Sound Physics Wave Theory' },
    { label: 'Quantum Entanglement', query: 'Quantum Entanglement Information Paradox' },
    { label: 'Standard Model & Higgs', query: 'Standard Model Higgs Boson Particles' },
    { label: 'Plasma & Fusion Physics', query: 'Plasma Physics Tokamak Nuclear Fusion' },
    { label: 'Biophysics', query: 'Biophysics Molecular Mechanics Physics of Life' },
    { label: 'Mathematical Physics', query: 'Mathematical Physics Symmetries Field Theory' }
  ],
  'Neuroscience Mind': [
    { label: 'Neuroplasticity & Memory', query: 'Neuroplasticity Brain Learning Memory' },
    { label: 'Consciousness & Qualia', query: 'Consciousness Philosophy of Mind Neuroscience' },
    { label: 'Cognitive Science', query: 'Cognitive Science Psychology Neuroscience' },
    { label: 'Neurons & Synapses', query: 'Neurobiology Neurons Synaptic Transmission' },
    { label: 'Brain-Computer Interfaces', query: 'Brain Computer Interface Neuralink Neurotech' },
    { label: 'Sleep & Dreams', query: 'Sleep Science Dreams Circadian Rhythm Neuro' },
    { label: 'Neurochemistry & Dopamine', query: 'Neurochemistry Dopamine Serotonin Brain' },
    { label: 'Memory & Recall', query: 'Memory Formation Recall Neuroscience' },
    { label: 'Emotions & Limbic System', query: 'Affective Neuroscience Emotion Brain Limbic' },
    { label: 'Sensory Perception', query: 'Sensory Perception Vision Auditory Neuroscience' },
    { label: 'Neurodegenerative Research', query: 'Alzheimers Parkinsons Brain Disease Research' },
    { label: 'Psychedelics & Brain', query: 'Psychedelic Science Neuroscience Therapy' },
    { label: 'Attention & Focus', query: 'Attention Focus ADHD Neuroscience Executive Function' },
    { label: 'Neuroethics', query: 'Neuroethics Free Will Moral Neuroscience' },
    { label: 'Animal Intelligence', query: 'Animal Intelligence Comparative Cognition Neuro' }
  ],
  'Biology Genetics': [
    { label: 'CRISPR & Gene Editing', query: 'CRISPR Gene Editing Genetic Engineering' },
    { label: 'Evolutionary Biology', query: 'Evolutionary Biology Natural Selection Genetics' },
    { label: 'Epigenetics', query: 'Epigenetics Gene Expression DNA Methylation' },
    { label: 'Synthetic Biology', query: 'Synthetic Biology Bioengineering DNA Design' },
    { label: 'Gut Microbiome & Microbes', query: 'Microbiome Gut Bacteria Microbes Biology' },
    { label: 'Genomics & DNA Sequencing', query: 'Human Genome Project Genomics DNA Sequencing' },
    { label: 'Cell Biology & Organelles', query: 'Cell Biology Organelles Mitosis Ribosomes' },
    { label: 'Immunology & Antibodies', query: 'Immunology Immune System White Blood Cells' },
    { label: 'Virology & Epidemics', query: 'Virology Viruses Epidemics Infectious Disease' },
    { label: 'Developmental Biology', query: 'Developmental Biology Embryology Morphogenesis' },
    { label: 'Plant Genetics & Crops', query: 'Plant Genetics GMO Photosynthesis Crop Biology' },
    { label: 'Rare Diseases & Precision Med', query: 'Rare Genetic Diseases Genomics Precision Medicine' },
    { label: 'Longevity & Cellular Aging', query: 'Telomeres Cellular Senescence Aging Biology' },
    { label: 'Extremophiles & Origins', query: 'Extremophiles Origin of Life Astrobiology' },
    { label: 'Structural Biology', query: 'Structural Biology Protein Folding Molecular Biology' }
  ],
  'Clean Energy': [
    { label: 'Solar & Photovoltaics', query: 'Solar Energy Photovoltaics Solar Power Clean Tech' },
    { label: 'Wind Energy', query: 'Wind Turbines Offshore Wind Renewable Energy' },
    { label: 'Battery Tech & Storage', query: 'Battery Technology Grid Storage Lithium Ion Solid State' },
    { label: 'Green Hydrogen', query: 'Hydrogen Fuel Cells Green Hydrogen Energy' },
    { label: 'Smart Grids & Transmission', query: 'Smart Grid Energy Transmission High Voltage' },
    { label: 'Geothermal Energy', query: 'Geothermal Energy Deep Geothermal Heat' },
    { label: 'Nuclear Fusion Power', query: 'Nuclear Fusion Clean Power Clean Energy' },
    { label: 'Electric Mobility & EVs', query: 'Electric Vehicles EV Charging Transport Transition' },
    { label: 'Heat Pumps & Efficiency', query: 'Heat Pumps Building Decarbonization Efficiency' },
    { label: 'Carbon Capture & Storage', query: 'Carbon Capture Sequestration Direct Air Capture' },
    { label: 'Hydro & Tidal Power', query: 'Hydropower Ocean Tidal Wave Energy' },
    { label: 'Biofuels & SAF', query: 'Sustainable Aviation Fuel Biofuels Clean Energy' },
    { label: 'Green Steel & Industry', query: 'Green Steel Cement Clean Industrial Transition' },
    { label: 'Energy Policy & Markets', query: 'Energy Markets Policy Power Grid Clean Energy' },
    { label: 'Microgrids & Decentralized', query: 'Microgrids Decentralized Power Offgrid Solar' }
  ],
  'Ecology Forests': [
    { label: 'Old-Growth & Ancient Trees', query: 'Old Growth Forests Ancient Trees Canopy Ecology' },
    { label: 'Reforestation & Rewilding', query: 'Reforestation Tree Planting Ecosystem Restoration' },
    { label: 'Wildfire Ecology', query: 'Wildfire Ecology Forest Management Pyrogeography' },
    { label: 'Boreal Forests & Taiga', query: 'Boreal Forest Taiga Ecology Carbon Sink' },
    { label: 'Tree Communication & Fungi', query: 'Tree Communication Suzanne Simard Wood Wide Web' },
    { label: 'Urban Forestry', query: 'Urban Forestry Green Canopy City Trees Ecology' },
    { label: 'Mangroves & Blue Carbon', query: 'Mangrove Restoration Blue Carbon Coastal Ecology' },
    { label: 'Deforestation & Conservation', query: 'Deforestation Tropical Rainforest Conservation' },
    { label: 'Agroforestry & Permaculture', query: 'Agroforestry Food Forests Regenerative Forestry' },
    { label: 'Canopy Research', query: 'Forest Canopy Biodiversity Tree Research' },
    { label: 'Indigenous Land Stewardship', query: 'Indigenous Forest Stewardship Traditional Ecological Knowledge' },
    { label: 'Temperate Rainforests', query: 'Temperate Rainforest Pacific Northwest Ecology' },
    { label: 'Mycorrhizal Ecology', query: 'Mycorrhizal Fungi Forest Ecology Mycology' },
    { label: 'Forest Invasive Species', query: 'Forest Pests Invasive Species Tree Diseases' },
    { label: 'Forest Carbon Offsets', query: 'Forest Carbon Offset Sequestration Biomass' }
  ],
  'Weather Atmosphere': [
    { label: 'Meteorology & Forecasting', query: 'Meteorology Weather Forecasting Atmospheric Science' },
    { label: 'Severe Storms & Tornadoes', query: 'Tornadoes Severe Storms Supercells Chasing' },
    { label: 'Hurricanes & Typhoons', query: 'Hurricanes Tropical Cyclones Typhoons Tracking' },
    { label: 'Jet Stream & Polar Vortex', query: 'Jet Stream Polar Vortex Atmosphere Climate' },
    { label: 'Cloud Physics & Rain', query: 'Cloud Microphysics Atmospheric Moisture Rain' },
    { label: 'Lightning & Thunderstorms', query: 'Lightning Atmospheric Electricity Thunderstorms' },
    { label: 'Monsoons & Global Weather', query: 'Monsoon Circulation Global Atmospheric Weather' },
    { label: 'Droughts & Heatwaves', query: 'Heatwaves Drought Atmospheric Blocking Science' },
    { label: 'Air Quality & Aerosols', query: 'Air Quality Particulate Matter Smog Atmospheric Chemistry' },
    { label: 'Stratosphere & Ozone', query: 'Ozone Layer Stratospheric Chemistry Atmosphere' },
    { label: 'Radar & Weather Satellites', query: 'Doppler Radar Weather Satellites Meteorology' },
    { label: 'Urban Microclimates', query: 'Microclimate Urban Heat Island Weather Science' },
    { label: 'El Niño & ENSO Cycles', query: 'El Nino Southern Oscillation ENSO Pacific Weather' },
    { label: 'Blizzards & Winter Storms', query: 'Winter Storms Blizzards Atmospheric Ice Snow' },
    { label: 'Planetary Weather', query: 'Planetary Atmospheres Mars Venus Weather' }
  ],
  'Paleontology Fossils': [
    { label: 'Dinosaurs & Theropods', query: 'Dinosaurs Paleontology T-Rex Sauropods Fossils' },
    { label: 'Mass Extinctions', query: 'Mass Extinctions Permian Cretaceous Asteroid Impact' },
    { label: 'Ice Age & Megafauna', query: 'Ice Age Megafauna Mammoths Paleontology' },
    { label: 'Marine Reptiles', query: 'Plesiosaurs Mosasaurs Ancient Oceans Fossils' },
    { label: 'Human Evolution & Hominins', query: 'Paleoanthropology Neanderthals Hominin Evolution' },
    { label: 'Fossil Hunting & Prep', query: 'Fossil Hunting Dig Sites Paleontology Prep' },
    { label: 'Cambrian Explosion', query: 'Cambrian Explosion Burgess Shale Early Animal Life' },
    { label: 'Paleoart & Reconstruction', query: 'Paleoart Dinosaur Reconstruction Paleontology' },
    { label: 'Paleobotany & Fossil Forests', query: 'Paleobotany Ancient Plants Fossil Trees Carboniferous' },
    { label: 'Amber & Ancient Insects', query: 'Amber Fossils Ancient Insects Prehistoric Resin' },
    { label: 'Feathered Dinosaurs', query: 'Feathered Dinosaurs Evolution of Birds Paleontology' },
    { label: 'Pterosaurs', query: 'Pterosaurs Flying Reptiles Paleontology Fossils' },
    { label: 'Trilobites & Invertebrates', query: 'Trilobites Paleozoic Fossils Invertebrate Paleontology' },
    { label: 'Ancient DNA & De-extinction', query: 'Ancient DNA Paleogenomics Mammoth De-extinction' },
    { label: 'Tar Pits & Quaternary Life', query: 'La Brea Tar Pits Quaternary Paleontology Fossils' }
  ],
  'Medicine Health': [
    { label: 'Immunology & Vaccines', query: 'Immunology Vaccine Development Infectious Disease' },
    { label: 'Cancer Research & Oncology', query: 'Oncology Cancer Research Immunotherapy Genetics' },
    { label: 'Longevity & Healthspan', query: 'Longevity Healthspan Lifespan Peter Attia Huberman' },
    { label: 'Public Health & Pandemics', query: 'Epidemiology Public Health Pandemics Global Health' },
    { label: 'Cardiology & Heart Health', query: 'Cardiology Heart Health Cardiovascular Science' },
    { label: 'Endocrinology & Metabolism', query: 'Endocrinology Hormones Metabolism Health Science' },
    { label: 'Gut Microbiome & Digestion', query: 'Gut Microbiome Gastroenterology Digestive Health' },
    { label: 'Pharmacology & Drugs', query: 'Pharmacology Drug Discovery Clinical Trials Medicine' },
    { label: 'Surgical Robotics & Tech', query: 'Medical Devices Surgical Robotics Health Tech' },
    { label: 'Rare Diseases & Genetics', query: 'Precision Medicine Rare Genetic Disorders Genomics' },
    { label: 'Psychiatry & Mental Health', query: 'Psychiatry Neurobiology Mental Health Science' },
    { label: 'Nutrition & Evidence', query: 'Nutrition Science Micronutrients Diet Health Evidence' },
    { label: 'Infectious Diseases & Superbugs', query: 'Infectious Diseases Antimicrobial Resistance Bacteria' },
    { label: 'Bioethics & Clinical Ethics', query: 'Bioethics Medical Ethics Patient Care Clinical Trials' },
    { label: 'Emergency & Critical Care', query: 'Critical Care Emergency Medicine Trauma Science' }
  ],
  'AI Tech': [
    { label: 'Large Language Models', query: 'Large Language Models LLM AI Deep Learning' },
    { label: 'Machine Learning Research', query: 'Machine Learning Neural Networks AI Research' },
    { label: 'Generative AI & Diffusion', query: 'Generative AI Diffusion Transformers Neural Nets' },
    { label: 'Autonomous AI Agents', query: 'AI Agents Autonomous Systems AI Tools' },
    { label: 'Computer Vision', query: 'Computer Vision Object Detection Image AI' },
    { label: 'Robotics & Embodied AI', query: 'Embodied AI Robotics Boston Dynamics Manipulation' },
    { label: 'AI Safety & Alignment', query: 'AI Safety Alignment Superintelligence Anthropic' },
    { label: 'Natural Language Processing', query: 'Natural Language Processing NLP Linguistics AI' },
    { label: 'AI Hardware & Silicon', query: 'GPU AI Hardware Accelerators Tensor Chips Nvidia' },
    { label: 'Reinforcement Learning', query: 'Reinforcement Learning RLHF AlphaGo DeepMind' },
    { label: 'AI in Science & AlphaFold', query: 'AlphaFold AI in Science Drug Discovery DeepMind' },
    { label: 'AI Ethics & Governance', query: 'AI Ethics Bias Fairness Technology Regulation' },
    { label: 'Open Source AI Models', query: 'Open Source AI Hugging Face Open Models Llama' },
    { label: 'Neuromorphic Computing', query: 'Neuromorphic Computing Spiking Neural Networks AI' },
    { label: 'History of AI & Pioneers', query: 'History of AI Turing Von Neumann Deep Learning' }
  ],
  'History Science': [
    { label: 'Scientific Revolution', query: 'Scientific Revolution Galileo Newton Copernicus History' },
    { label: 'Alchemy to Chemistry', query: 'History of Chemistry Alchemy Boyle Lavoisier' },
    { label: 'Medical History & Pandemics', query: 'History of Medicine Black Death Cholera Penicillin' },
    { label: 'Darwin & Evolution History', query: 'Charles Darwin Evolution Origin of Species History' },
    { label: 'Women Pioneers in STEM', query: 'Ada Lovelace Marie Curie Women in Science History' },
    { label: 'Space Race & Cold War', query: 'Space Race Cold War Apollo Sputnik History' },
    { label: 'Enlightenment & Natural Phil', query: 'Enlightenment Age of Reason Natural Philosophy' },
    { label: 'Islamic Golden Age Science', query: 'Islamic Golden Age Algebra Astronomy Science History' },
    { label: 'Ancient Greek & Roman Science', query: 'Ancient Greek Science Archimedes Aristotle Ptolemy' },
    { label: 'Manhattan Project & Atom', query: 'Manhattan Project Oppenheimer Atomic Age Nuclear History' },
    { label: 'History of Computing', query: 'History of Computing Alan Turing Babbage ENIAC' },
    { label: 'Victorian Naturalists', query: 'Victorian Science Naturalists Humboldt Expeditions' },
    { label: 'Renaissance Anatomy', query: 'Renaissance Science Da Vinci Vesalius Anatomy' },
    { label: 'History of Astronomy', query: 'History of Astronomy Telescopes Kepler Brahe' },
    { label: 'Paradigm Shifts (Kuhn)', query: 'History and Philosophy of Science Paradigm Shifts Kuhn' }
  ],
  'Archaeology Ancient': [
    { label: 'Ancient Egypt & Pyramids', query: 'Ancient Egypt Pyramids Pharaonic Archaeology Tombs' },
    { label: 'Roman Empire & Pompeii', query: 'Roman Archaeology Pompeii Colosseum Antiquity' },
    { label: 'Maya & Mesoamerica', query: 'Maya Archaeology Mesoamerica Aztec Teotihuacan' },
    { label: 'Bronze Age Civilizations', query: 'Bronze Age Minoans Mycenaeans Ancient Near East' },
    { label: 'Mesopotamia & Sumer', query: 'Mesopotamia Sumerian Babylon Cuneiform Archaeology' },
    { label: 'Maritime & Shipwrecks', query: 'Maritime Archaeology Shipwrecks Submerged Ruins' },
    { label: 'Silk Road Discoveries', query: 'Silk Road Archaeology Ancient Trade Routes Asia' },
    { label: 'Paleolithic Cave Art', query: 'Stone Age Paleolithic Cave Art Neanderthal Sites' },
    { label: 'LiDAR & Remote Sensing', query: 'LiDAR Archaeology Satellite Remote Sensing Discovery' },
    { label: 'Archaeogenetics & DNA', query: 'Archaeogenetics Ancient DNA Migration Civilizations' },
    { label: 'Ancient Greece & Aegean', query: 'Ancient Greece Archaeology Parthenon Knossos' },
    { label: 'Indus Valley Harappa', query: 'Indus Valley Harappa Mohenjo-daro Archaeology' },
    { label: 'Incas & Andes Civilizations', query: 'Inca Andes Machu Picchu Archaeology Tiwanaku' },
    { label: 'Viking Age & Runes', query: 'Viking Age Archaeology Norse Settlements Runes' },
    { label: 'Bioarchaeology & Mummies', query: 'Bioarchaeology Mummies Skeletal Analysis Antiquity' }
  ],
  'Math Logic': [
    { label: 'Pure Mathematics', query: 'Pure Mathematics Number Theory Algebra Geometry' },
    { label: 'Prime Numbers & Riemann', query: 'Number Theory Prime Numbers Riemann Hypothesis Math' },
    { label: 'Cryptography & Ciphers', query: 'Cryptography Ciphers Zero Knowledge Proofs Math' },
    { label: 'Topology & Manifolds', query: 'Topology Manifolds Poincaré Geometry Math' },
    { label: 'Probability & Bayes', query: 'Probability Statistics Bayesian Inference Math' },
    { label: 'Gödel & Mathematical Logic', query: 'Mathematical Logic Gödel Incompleteness Proof Theory' },
    { label: 'Game Theory & Strategy', query: 'Game Theory Nash Equilibrium Strategic Math' },
    { label: 'Chaos Theory & Fractals', query: 'Chaos Theory Mandelbrot Fractals Nonlinear Dynamics' },
    { label: 'Applied Mathematics', query: 'Applied Mathematics Fluid Dynamics Differential Equations' },
    { label: 'History of Mathematics', query: 'History of Mathematics Euler Gauss Newton Ramanujan' },
    { label: 'Puzzles & Recreational Math', query: 'Recreational Math Numberphile Puzzles Mathologer' },
    { label: 'Information Theory (Shannon)', query: 'Claude Shannon Information Theory Entropy Math' },
    { label: 'Graph Theory & Networks', query: 'Graph Theory Network Analysis Combinatorics' },
    { label: 'Linear Algebra & Tensors', query: 'Linear Algebra Matrices Vector Spaces Tensors' },
    { label: 'Quantum Information Math', query: 'Quantum Information Theory Quantum Math Linear Algebra' }
  ],
  'Agriculture Food': [
    { label: 'Regenerative Agriculture', query: 'Regenerative Agriculture Soil Health Carbon Farming' },
    { label: 'Food Science & Ferment', query: 'Food Science Fermentation Culinary Chemistry' },
    { label: 'Agtech & Precision Drones', query: 'Precision Agriculture Agtech Drones Satellite Farming' },
    { label: 'Vertical Farming & Hydro', query: 'Vertical Farming Hydroponics Controlled Environment Ag' },
    { label: 'Heirloom Seeds & Diversity', query: 'Heirloom Seeds Seed Saving Crop Diversity Botany' },
    { label: 'Sustainable Aquaculture', query: 'Sustainable Aquaculture Fish Farming Seaweed Ecology' },
    { label: 'Soil Microbiome & Compost', query: 'Soil Biology Compost Soil Health Agriculture' },
    { label: 'Cultivated Meat & Alt Protein', query: 'Cultivated Meat Alternative Protein Food Tech' },
    { label: 'Agroforestry & Food Forests', query: 'Agroforestry Food Forest Permaculture Systems' },
    { label: 'Water & Drip Irrigation', query: 'Agricultural Irrigation Drip Water Conservation Crops' },
    { label: 'Pollinators & Beekeeping', query: 'Pollinators Honeybees Beekeeping Agriculture Botany' },
    { label: 'Food Waste Reduction', query: 'Food Waste Circular Food Systems Sustainable Food' },
    { label: 'Crop Genetics & CRISPR', query: 'Crop Breeding GMO CRISPR Drought Tolerant Plants' },
    { label: 'Future Food Security', query: 'Future of Food Nutrition Security Sustainable Diets' },
    { label: 'Traditional Ecological Farming', query: 'Indigenous Agriculture Traditional Ecological Farming' }
  ],
  'Tech Robotics': [
    { label: 'Humanoid Robots', query: 'Humanoid Robotics Boston Dynamics Bipedal Robots' },
    { label: 'Autonomous Vehicles', query: 'Autonomous Vehicles Self-Driving Cars Waymo Tech' },
    { label: 'Drones & UAVs', query: 'Drones UAV Robotics Autonomous Flight Aerial' },
    { label: 'Industrial Automation', query: 'Industrial Robotics Factory Automation Tech' },
    { label: 'Surgical & Medical Robotics', query: 'Surgical Robotics Medical Devices Da Vinci Tech' },
    { label: 'Soft Robotics & Biomimicry', query: 'Soft Robotics Biomimicry Flexible Materials Actuators' },
    { label: 'Nanorobotics', query: 'Nanorobotics Microbots Targeted Delivery Tech' },
    { label: 'Swarm Robotics', query: 'Swarm Robotics Distributed Collective Intelligence' },
    { label: 'Computer Vision & Sensors', query: 'Robotic Sensors LiDAR Computer Vision Perception' },
    { label: 'Bionics & Cybernetics', query: 'Cybernetics Bionic Prosthetics Human Augmentation' },
    { label: 'Space Robotics & Mars Rovers', query: 'Space Robotics Mars Rovers Robotic Arms Canadarm' },
    { label: 'Agricultural Robotics', query: 'Agricultural Robotics Harvest Robots Weeding Automation' },
    { label: 'Deep Sea ROVs', query: 'Underwater Robotics Deep Sea ROV Exploration' },
    { label: 'Robotics Ethics & Safety', query: 'Robotics Ethics Laws of Robotics Automation Safety' },
    { label: 'ROS & Open Robotics', query: 'Robot Operating System ROS Open Robotics Tech' }
  ],
  'Wildlife Zoology': [
    { label: 'Animal Behavior & Ethology', query: 'Animal Behavior Ethology Jane Goodall Zoology' },
    { label: 'Big Cats & Apex Predators', query: 'Big Cats Lions Tigers Leopards Predators Wildlife' },
    { label: 'Primatology & Apes', query: 'Primatology Chimpanzees Gorillas Orangutans Jane Goodall' },
    { label: 'Elephants & Megafauna', query: 'Elephants Wildlife Conservation African Wildlife' },
    { label: 'Birds of Prey & Raptors', query: 'Raptors Birds of Prey Eagles Hawks Owls Zoology' },
    { label: 'Reptiles & Amphibians', query: 'Herpetology Reptiles Amphibians Snakes Frogs' },
    { label: 'Entomology & Arachnids', query: 'Entomology Arachnology Spiders Insects Biodiversity' },
    { label: 'Animal Communication', query: 'Animal Communication Bioacoustics Animal Vocalization' },
    { label: 'Bird & Animal Migration', query: 'Animal Migration Bird Migration Magnetic Navigation' },
    { label: 'Anti-Poaching & Rangers', query: 'Wildlife Conservation Anti Poaching Rangers Safari' },
    { label: 'Nocturnal Wildlife', query: 'Nocturnal Animals Bats Owls Night Wildlife Ecology' },
    { label: 'Deep Sea Zoology', query: 'Deep Sea Creatures Marine Zoology Abyssal Biology' },
    { label: 'Evolutionary Morphology', query: 'Evolutionary Zoology Adaptation Speciation Morphology' },
    { label: 'Endangered Species Recovery', query: 'Endangered Species Captive Breeding Rewilding' },
    { label: 'Urban Wildlife', query: 'Urban Wildlife Coyotes Raccoons City Animals Ecology' }
  ],
  'Chemistry Materials': [
    { label: 'Nanotechnology & Graphene', query: 'Materials Science Nanotechnology Graphene Metamaterials' },
    { label: 'Organic Chemistry', query: 'Organic Chemistry Chemical Synthesis Molecular Design' },
    { label: 'Battery Chemistry', query: 'Electrochemistry Battery Chemistry Lithium Solid State' },
    { label: 'Green Chemistry', query: 'Green Chemistry Sustainable Solvents Catalysis' },
    { label: 'Bioplastics & Polymers', query: 'Polymers Biodegradable Plastics Materials Chemistry' },
    { label: 'Superconductors', query: 'Superconductivity Room Temperature Superconductors Physics' },
    { label: 'Periodic Table Elements', query: 'Periodic Table Elements Chemistry Compounds' },
    { label: 'Biochemistry & Enzymes', query: 'Biochemistry Enzymes Proteins Metabolic Pathways' },
    { label: 'Catalysis & Reactions', query: 'Catalysis Chemical Reactions Catalysts Chemical Eng' },
    { label: 'Self-Healing Materials', query: 'Smart Materials Self-Healing Shape Memory Alloys' },
    { label: 'Quantum Chemistry', query: 'Quantum Chemistry Molecular Orbitals Computational Chemistry' },
    { label: 'Atmospheric Chemistry', query: 'Atmospheric Chemistry Ozone Aerosols Trace Gases' },
    { label: 'Crystallography', query: 'Crystallography X-Ray Diffraction Crystal Structure' },
    { label: 'Forensic Chemistry', query: 'Forensic Science Forensic Chemistry Mass Spectrometry' },
    { label: 'History of Chemistry', query: 'History of Chemistry Alchemy Elements Lavoisier Mendeleev' }
  ],
  'Philosophy Science': [
    { label: 'Scientific Realism & Method', query: 'Philosophy of Science Scientific Realism Epistemology' },
    { label: 'Epistemology & Knowledge', query: 'Epistemology Knowledge Truth Justified Belief Philosophy' },
    { label: 'Philosophy of Spacetime', query: 'Philosophy of Physics Time Space Spacetime Quantum' },
    { label: 'Philosophy of Biology', query: 'Philosophy of Biology Evolution Organisms Teleology' },
    { label: 'Consciousness & Physicalism', query: 'Philosophy of Mind Consciousness Qualia Dualism Physicalism' },
    { label: 'Tech Ethics & Bioethics', query: 'Ethics of Technology AI Ethics Bioethics Philosophy' },
    { label: 'Causality & Free Will', query: 'Causality Free Will Determinism Chaos Philosophy' },
    { label: 'Paradigm Shifts (Kuhn)', query: 'Thomas Kuhn Paradigms Incommensurability Science' },
    { label: 'Formal Logic & Fallacies', query: 'Formal Logic Deductive Inductive Reasoning Arguments' },
    { label: 'Philosophy of Mathematics', query: 'Philosophy of Mathematics Platonism Constructivism' },
    { label: 'Deep Ecology & Biosphere', query: 'Environmental Ethics Deep Ecology Biosphere Philosophy' },
    { label: 'Social Epistemology', query: 'Social Epistemology Peer Review Scientific Consensus' },
    { label: 'Reductionism & Emergence', query: 'Reductionism Emergence Complexity Complex Systems' },
    { label: 'Can Machines Think (Turing)', query: 'Can Machines Think Turing Test Chinese Room Philosophy' },
    { label: 'Philosophy of Time', query: 'Philosophy of Time Presentism Eternalism Arrow of Time' }
  ],
  'Wissen DE': [
    { label: 'Forschung aktuell (DLF)', query: 'Forschung aktuell Deutschlandfunk Wissen' },
    { label: 'SWR Wissen', query: 'SWR Wissen Wissenschaft Forschung Bildung' },
    { label: 'Terra X Natur & Erde', query: 'Terra X Natur Erde Tiere ZDF' },
    { label: 'WDR Quarks', query: 'WDR Quarks Science Wissenschaft Forschung' },
    { label: 'Sternengeschichten', query: 'Sternengeschichten Astronomie Universum Florian Freistetter' },
    { label: 'Hörsaal (DLF Nova)', query: 'Deutschlandfunk Nova Hörsaal Wissen Vortrag' },
    { label: 'Planet Wissen', query: 'Planet Wissen WDR SWR Natur Mensch Technik' },
    { label: 'Zeit Wissen', query: 'Zeit Wissen Medizin Gesundheit Wissenschaft' },
    { label: 'Spektrum der Wissenschaft', query: 'Spektrum der Wissenschaft Forschungsquadrant Podcast' },
    { label: 'Biologie & Natur (DE)', query: 'Biologie Evolution Tiere Natur Deutschlandfunk' },
    { label: 'Klimawandel & Zukunft (DE)', query: 'Klimawandel Energiewende Deutschlandfunk Klima' },
    { label: 'Welt der Physik (DE)', query: 'Welt der Physik Teilchenbeschleuniger Quanten' },
    { label: 'Archäologie & Antike (DE)', query: 'Archäologie Antike Geschichte Ausgrabungen DE' },
    { label: 'Technik & Zukunft (DE)', query: 'Zukunft Technologie Digitalisierung Wissenschaft DE' },
    { label: 'Psychologie & Hirnforschung', query: 'Psychologie Neurowissenschaft Gehirn Wissen DE' }
  ],
  'Sciences FR': [
    { label: 'La Terre au Carré (Inter)', query: 'La Terre au Carre France Inter Climat' },
    { label: 'CQFD Sciences (RTS)', query: 'CQFD Sciences Recherche Nature RTS' },
    { label: 'Sixième Science', query: 'Sixieme Science 20 Minutes Sciences Avenir' },
    { label: 'La Science CQFD (Culture)', query: 'La Science CQFD France Culture Recherche' },
    { label: 'Chaleur Humaine (Le Monde)', query: 'Chaleur Humaine Le Monde Climat Transition' },
    { label: 'Astronomie & Univers (FR)', query: 'Astronomie Espace Univers Sciences France' },
    { label: 'Océans & Biodiversité (FR)', query: 'Ecologie Oceans Biodiversite Mer Planete FR' },
    { label: 'Physique & Quantique (FR)', query: 'Physique Quantique CEA Recherche Sciences FR' },
    { label: 'Cerveau & Neurosciences (FR)', query: 'Neurosciences Cerveau Psychologie Sciences FR' },
    { label: 'Santé & Médecine (FR)', query: 'Sante Medecine Recherche Medicale France' },
    { label: 'Histoire des Sciences (FR)', query: 'Histoire des Sciences Decouvertes France Culture' },
    { label: 'Archéologie & Préhistoire', query: 'Archeologie Prehistoire Fouilles Histoire FR' },
    { label: 'IA & Nouvelles Tech (FR)', query: 'Intelligence Artificielle Tech Futur Sciences FR' },
    { label: 'Forêts & Botanique (FR)', query: 'Foret Botanique Arbres Nature France' },
    { label: 'Transition & Énergie (FR)', query: 'Transition Energetique Carbone Climat Solutions FR' }
  ],
  'Ciencia ES': [
    { label: 'Coffee Break Señal y Ruido', query: 'Coffee Break Señal y Ruido Ciencia Astrofísica' },
    { label: 'Materia Oscura & Física', query: 'Materia Oscura Ciencia Fisica Universo' },
    { label: 'Planeta Océano', query: 'Planeta Oceano Biologia Marina Mar Conservacion' },
    { label: 'A Hombros de Gigantes (RNE)', query: 'A hombros de gigantes RNE Ciencia Investigacion' },
    { label: 'Astronomía & Cosmos (ES)', query: 'Astronomia Cosmologia Espacio Universo ES' },
    { label: 'Biodiversidad & Fauna (ES)', query: 'Biodiversidad Naturaleza Vida Silvestre Ecologia ES' },
    { label: 'Genética & Células (ES)', query: 'Genetica Biologia Molecular Celulas Ciencia ES' },
    { label: 'Neurociencia & Mente (ES)', query: 'Neurociencia Cerebro Psicologia Investigacion ES' },
    { label: 'Historia de la Ciencia (ES)', query: 'Historia de la Ciencia Descubrimientos Cientificos ES' },
    { label: 'Atapuerca & Evolución (ES)', query: 'Arqueologia Atapuerca Paleontologia Evolucion Humana' },
    { label: 'Transición Ecológica (ES)', query: 'Transicion Ecologica Energia Renovable Clima ES' },
    { label: 'Paleontología & Fósiles (ES)', query: 'Paleontologia Dinosaurios Fosiles Tierra ES' },
    { label: 'IA & Tecnología (ES)', query: 'Inteligencia Artificial Robotica Futuro Ciencia ES' },
    { label: 'Salud & Biomedicina (ES)', query: 'Medicina Investigacion Biomedica Salud Evidencia ES' },
    { label: 'Química & Materiales (ES)', query: 'Quimica Materiales Nanotecnologia Divulgacion ES' }
  ]
};

function renderSubgenreChips(category, container = elements.modalSubgenreChips, onSelect = null) {
  if (!container) return;
  const subgenres = SUBGENRE_MAP[category];
  if (!subgenres || subgenres.length === 0) {
    container.innerHTML = '';
    container.classList.add('hidden');
    return;
  }

  container.classList.remove('hidden');
  container.innerHTML = `
    <span class="subgenre-label">Subgenres:</span>
    ${subgenres.map(sub => `
      <button type="button" class="subgenre-chip" data-query="${escapeHtml(sub.query)}" data-label="${escapeHtml(sub.label)}">
        ${escapeHtml(sub.label)}
      </button>
    `).join('')}
  `;

  container.querySelectorAll('.subgenre-chip').forEach(btn => {
    btn.addEventListener('click', () => {
      container.querySelectorAll('.subgenre-chip').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const q = btn.dataset.query;
      if (typeof onSelect === 'function') {
        onSelect(q, btn.dataset.label);
      } else if (elements.podcastSearchQuery) {
        elements.podcastSearchQuery.value = q;
        searchPodcastDirectory(q);
      }
    });
  });
}

// ─────────────────────────────────────────────────────────────────────────
// SECTION 16 · Podcast Directory Search
// Queries iTunes Search API, renders results with lazy infinite scroll.
// searchPodcastDirectory — initiates search, sets up scroll listener.
function setDirectoryEnlarged(enlarged) {
  if (!elements.searchDirectoryResults) return;
  if (enlarged) {
    elements.searchDirectoryResults.classList.remove('dir-carousel-view');
    elements.searchDirectoryResults.classList.add('is-enlarged');
    if (elements.btnToggleEnlarge) {
      elements.btnToggleEnlarge.classList.add('active');
      const label = elements.btnToggleEnlarge.querySelector('.enlarge-label');
      if (label) label.textContent = '⤡ collapse to row';
    }
    if (elements.dirStickyCollapseBar) {
      elements.dirStickyCollapseBar.classList.remove('hidden');
    }
  } else {
    elements.searchDirectoryResults.classList.remove('is-enlarged');
    elements.searchDirectoryResults.classList.add('dir-carousel-view');
    if (elements.btnToggleEnlarge) {
      elements.btnToggleEnlarge.classList.remove('active');
      const label = elements.btnToggleEnlarge.querySelector('.enlarge-label');
      if (label) label.textContent = '⤢ enlarge (5 per row)';
    }
    if (elements.dirStickyCollapseBar) {
      elements.dirStickyCollapseBar.classList.add('hidden');
    }
  }
}

async function searchPodcastDirectory(query, targetContainer = null) {
  const q = query.trim();
  const container = targetContainer || elements.searchDirectoryResults;
  if (!container) return;
  if (!q) {
    container._dirSearch = null;
    container.innerHTML = '';
    return;
  }

  container._dirSearch = null;
  container.innerHTML = `
    <div style="padding: 0.75rem 0.25rem;">
      <div style="display: flex; align-items: center; gap: 0.5rem; color: var(--text-muted); font-size: 0.85rem; margin-bottom: 0.75rem;">
        <svg class="spinner" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="9" stroke-opacity="0.25"></circle><path d="M12 3a9 9 0 0 1 9 9" stroke-linecap="round"></path></svg>
        searching podcasts for "${escapeHtml(q)}"...
      </div>
      <div class="skeleton-card" style="margin-bottom: 0.5rem;"><div class="skeleton-art"></div><div class="skeleton-lines"><div class="skeleton-line" style="width: 40%;"></div><div class="skeleton-line" style="width: 70%;"></div></div></div>
      <div class="skeleton-card"><div class="skeleton-art"></div><div class="skeleton-lines"><div class="skeleton-line" style="width: 35%;"></div><div class="skeleton-line" style="width: 60%;"></div></div></div>
    </div>
  `;

  // Smoothly scroll results into view so they are never hidden offscreen
  if (container === elements.searchDirectoryResults && elements.addModal && !elements.addModal.classList.contains('hidden')) {
    const modalBody = elements.addModal.querySelector('.modal-body');
    if (modalBody) {
      modalBody.scrollTo({ top: container.offsetTop - 70, behavior: 'smooth' });
    }
  }

  try {
    const countryParam = (state.directoryCountry && state.directoryCountry !== 'all') ? `&country=${encodeURIComponent(state.directoryCountry)}` : '';
    let data = null;

    // 1. Try direct browser fetch to iTunes Search API first (0 Cloudflare requests!)
    try {
      const directUrl = `https://itunes.apple.com/search?term=${encodeURIComponent(q)}&entity=podcast${countryParam}&limit=50`;
      const directRes = await fetch(directUrl);
      if (directRes.ok) {
        data = await directRes.json();
      }
    } catch (_) {}

    // 2. Fallback to first-party API proxy only if direct browser fetch was blocked by an ad/privacy extension
    if (!data || !data.results) {
      try {
        const proxyRes = await fetch(`/api/search-directory?term=${encodeURIComponent(q)}${countryParam}&limit=50`);
        if (proxyRes.ok) {
          data = await proxyRes.json();
        }
      } catch (_) {}
    }

    const results = (data?.results || []).filter(item => Boolean(item.feedUrl));
    container.innerHTML = '';

    if (results.length === 0) {
      container.innerHTML = `
        <div style="padding: 1.5rem 1rem; text-align: center; color: var(--text-muted); background: rgba(0, 0, 0, 0.03); border: 1px solid var(--border-light); border-radius: var(--radius-sm);">
          <p style="font-weight: 500; color: var(--text-primary); margin-bottom: 0.25rem;">no podcasts found</p>
          <p style="font-size: 0.82rem;">no matching shows found for "${escapeHtml(q)}". try searching a broader term, or paste an rss feed url directly below.</p>
        </div>
      `;
      return;
    }

    if (elements.dirResultsTitle) {
      elements.dirResultsTitle.textContent = `podcasts (${results.length} found)`;
    }

    if (container === elements.searchDirectoryResults) {
      if (!container.classList.contains('is-enlarged')) {
        container.classList.add('dir-carousel-view');
      }
    }

    const listEl = document.createElement('div');
    listEl.className = 'dir-search-list';
    if (container !== elements.searchDirectoryResults) {
      listEl.style.display = 'flex';
      listEl.style.flexDirection = 'column';
      listEl.style.gap = '0.5rem';
    }
    container.appendChild(listEl);

    container._dirSearch = {
      results,
      renderedCount: 0,
      listEl
    };

    renderNextDirectoryBatch(container);

    if (!container._hasDirScroll) {
      container._hasDirScroll = true;
      container.addEventListener('scroll', () => {
        if (container.scrollTop + container.clientHeight >= container.scrollHeight - 70) {
          renderNextDirectoryBatch(container);
        }
      }, { passive: true });
    }

    if (!listEl._hasHorizontalScroll) {
      listEl._hasHorizontalScroll = true;
      listEl.addEventListener('scroll', () => {
        if (listEl.scrollLeft + listEl.clientWidth >= listEl.scrollWidth - 120) {
          renderNextDirectoryBatch(container);
        }
      }, { passive: true });
    }

    if (elements.addModalBody && !elements.addModalBody._hasDirInfiniteScroll) {
      elements.addModalBody._hasDirInfiniteScroll = true;
      elements.addModalBody.addEventListener('scroll', () => {
        if (container.classList.contains('is-enlarged')) {
          if (elements.addModalBody.scrollTop + elements.addModalBody.clientHeight >= elements.addModalBody.scrollHeight - 200) {
            renderNextDirectoryBatch(container);
          }
        }
      }, { passive: true });
    }
  } catch (e) {
    container.innerHTML = `<p style="color: #fca5a5; padding: 0.5rem;">Error searching directory: ${escapeHtml(e.message)}</p>`;
  }
}

function renderNextDirectoryBatch(container) {
  const s = container._dirSearch;
  if (!s || s.renderedCount >= s.results.length) return;

  const nextBatch = s.results.slice(s.renderedCount, s.renderedCount + DIR_PAGE_SIZE);
  s.renderedCount += nextBatch.length;

  nextBatch.forEach(item => {
    const isSubbed = state.feeds.includes(item.feedUrl);
    const artwork = item.artworkUrl600 || item.artworkUrl100 || FALLBACK_ARTWORK;
    const title = item.collectionName || item.trackName || 'Untitled Podcast';
    const author = item.artistName || '';
    const genre = item.primaryGenreName ? ` • ${item.primaryGenreName}` : '';
    const epCount = item.trackCount ? `${item.trackCount} episodes` : 'Podcast';

    // Look up pre-loaded episodes if available in state
    const allForFeed = (state.allEpisodes || []).filter(e => e.feedUrl === item.feedUrl);
    const recentWidgetHtml = typeof buildRecentEpisodesWidget === 'function' ? buildRecentEpisodesWidget(allForFeed, item.feedUrl) : '';

    const card = document.createElement('div');
    card.className = 'feed-card directory-result-card';
    card.dataset.feed = item.feedUrl;
    card.dataset.title = title;

    card.innerHTML = `
      <div class="feed-header">
        <img class="feed-art" src="${escapeHtml(artwork)}" alt="" loading="lazy" decoding="async" onerror="this.onerror=null;this.src='${FALLBACK_ARTWORK}';">
        <div class="feed-info">
          <h4>${escapeHtml(title)}</h4>
          <p>${escapeHtml(epCount)}${escapeHtml(genre)}</p>
        </div>
        <div class="feed-header-actions">
          <button type="button" class="btn-feed-share" title="Share podcast" aria-label="Share podcast">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"></path>
              <polyline points="16 6 12 2 8 6"></polyline>
              <line x1="12" y1="2" x2="12" y2="15"></line>
            </svg>
          </button>
          <button type="button" class="btn ${isSubbed ? 'btn-secondary' : 'btn-primary'} btn-sm btn-sub-dir ${isSubbed ? 'subscribed' : ''}" data-feed="${escapeHtml(item.feedUrl)}" data-title="${escapeHtml(title)}" ${isSubbed ? 'disabled' : ''}>
            ${isSubbed ? '✓ followed' : '+ follow'}
          </button>
        </div>
      </div>
      ${author ? `<p class="feed-card-desc">${escapeHtml(author)}</p>` : ''}
      ${recentWidgetHtml}
    `;

    // Clicking anywhere opens feed detail (unless clicking actions/episodes)
    card.addEventListener('click', (e) => {
      if (e.target.closest('.btn-sub-dir') || e.target.closest('.btn-feed-share') || e.target.closest('.recent-ep-row')) return;
      if (!state.feedMetadata[item.feedUrl]) {
        state.feedMetadata[item.feedUrl] = {
          title,
          author,
          artwork
        };
      }
      openFeedDetail(item.feedUrl);
    });

    // Share button handler
    const shareBtn = card.querySelector('.btn-feed-share');
    if (shareBtn) {
      shareBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (typeof shareFeed === 'function') {
          shareFeed(item.feedUrl, title);
        }
      });
    }

    // Follow / subscribe button handler
    const subBtn = card.querySelector('.btn-sub-dir');
    if (subBtn && !isSubbed) {
      subBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        subBtn.textContent = 'adding...';
        await addFeed(item.feedUrl, title, artwork);
        subBtn.textContent = '✓ followed';
        subBtn.classList.remove('btn-primary');
        subBtn.classList.add('btn-secondary');
        subBtn.disabled = true;
      });
    }

    // Playable recent episode rows wiring
    card.querySelectorAll('.recent-ep-row').forEach(row => {
      const guid = row.dataset.guid;
      if (!guid) return;
      row.addEventListener('click', (e) => {
        e.stopPropagation();
        const ep = (state.allEpisodes || []).find(item => item.guid === guid);
        if (ep) {
          if (typeof toggleEpisodePlayback === 'function') {
            toggleEpisodePlayback(ep);
          } else if (typeof playEpisode === 'function') {
            playEpisode(ep);
          }
        }
      });
    });

    s.listEl.appendChild(card);
  });

  // Trigger the background lazy loader to fetch episodes for newly rendered directory cards
  if (typeof loadCuratedFeedEpisodes === 'function') {
    loadCuratedFeedEpisodes(container);
  }
}

// ─────────────────────────────────────────────────────────────────────────
// SECTION 17 · Continue Shelf
// Horizontal shelf showing in-progress episodes above the timeline.
// getContinueRowCapacity — responsive slot count based on viewport width.
// renderContinueShelf — sorts by lastListenedAt, pins current episode first.
// ─────────────────────────────────────────────────────────────────────────

function getContinueRowCapacity() {
  const w = window.innerWidth;
  if (w >= 1400) return 5;
  if (w >= 1150) return 4;
  if (w >= 880) return 3;
  return 2;
}

function renderContinueShelf() {
  if (!elements.continueShelf || !elements.continueGrid) return;

  const currentGuid = state.currentEpisode ? state.currentEpisode.guid : null;

  let inProgressEps = state.allEpisodes.filter(ep => {
    const pos = state.playbackPositions[ep.guid];
    const isCurrent = currentGuid && ep.guid === currentGuid;
    return (!pos || !pos.completed) && (isCurrent || (pos && pos.position > 2));
  });

  inProgressEps.sort((a, b) => {
    const posA = state.playbackPositions[a.guid];
    const posB = state.playbackPositions[b.guid];
    const timeA = (posA && posA.lastListenedAt) || (a.timestamp ? a.timestamp / 1000 : 0);
    const timeB = (posB && posB.lastListenedAt) || (b.timestamp ? b.timestamp / 1000 : 0);
    return timeB - timeA;
  });

  if (currentGuid) {
    const curIdx = inProgressEps.findIndex(e => e.guid === currentGuid);
    if (curIdx > 0) {
      const cur = inProgressEps.splice(curIdx, 1)[0];
      inProgressEps.unshift(cur);
    }
  }

  if (elements.continueCount) {
    elements.continueCount.textContent = inProgressEps.length;
  }

  if (inProgressEps.length === 0 || state.filterMode === 'played') {
    elements.continueShelf.classList.add('hidden');
    return;
  }

  const prevScroll = window.scrollY;
  const prevGridHeight = elements.continueGrid.clientHeight;
  if (prevGridHeight > 0) elements.continueGrid.style.minHeight = `${prevGridHeight}px`;

  elements.continueShelf.classList.remove('hidden');
  elements.continueGrid.innerHTML = '';

  const capacity = getContinueRowCapacity();

  if (elements.btnToggleContinue && elements.continueToggleLabel) {
    if (inProgressEps.length <= capacity) {
      elements.btnToggleContinue.style.display = 'none';
      elements.continueShelf.classList.remove('is-expanded');
    } else {
      elements.btnToggleContinue.style.display = 'inline-flex';
      if (state.continueCollapsed) {
        elements.continueToggleLabel.textContent = `show all (${inProgressEps.length})`;
        elements.continueShelf.classList.remove('is-expanded');
      } else {
        elements.continueToggleLabel.textContent = 'show less';
        elements.continueShelf.classList.add('is-expanded');
      }
    }
  }
  const visibleEps = state.continueCollapsed ? inProgressEps.slice(0, capacity) : inProgressEps;
  const continueContext = {
    type: 'continue',
    id: 'continue',
    title: 'Continue Listening',
    items: inProgressEps
  };
  visibleEps.forEach(ep => {
    elements.continueGrid.appendChild(createEpisodeCard(ep, continueContext));
  });

  requestAnimationFrame(() => {
    elements.continueGrid.style.minHeight = '';
    if (window.scrollY !== prevScroll) {
      window.scrollTo({ top: prevScroll, behavior: 'instant' });
    }
  });
}

function updateCardPlaybackProgress(episodeGuid, positionSeconds, durationSeconds) {
  if (!episodeGuid) return;
  const cards = document.querySelectorAll(`.episode-card[data-guid="${CSS.escape(episodeGuid)}"]`);
  if (!cards || !cards.length) return;

  const rawDur = durationSeconds || (state.currentEpisode && state.currentEpisode.guid === episodeGuid ? (elements.audio?.duration || (state.currentEpisode.duration ? parseDurationSeconds(state.currentEpisode.duration) : 0)) : 0);
  const dur = (rawDur && isFinite(rawDur) && rawDur > 0) ? rawDur : 0;
  const pct = dur > 0 ? Math.min(100, Math.max(1, Math.round((positionSeconds / dur) * 100))) : 5;

  cards.forEach(card => {
    let fill = card.querySelector('.ep-progress-fill');
    if (!fill) {
      const metaRow = card.querySelector('.ep-meta-row');
      if (metaRow) {
        const track = document.createElement('div');
        track.className = 'ep-progress-track';
        track.title = 'Click or scrub to resume at any point';
        track.innerHTML = `<div class="ep-progress-fill" style="width: ${pct}%"></div>`;
        card.insertBefore(track, metaRow.nextSibling);
        if (typeof setupProgressTrackInteractivity === 'function') {
          setupProgressTrackInteractivity(track, card, state.currentEpisode);
        }
      }
    } else {
      fill.style.width = `${pct}%`;
    }
  });
}

function setDirectoryCountry(code) {
  state.directoryCountry = code || 'all';
  document.querySelectorAll('.region-chip').forEach(c => {
    c.classList.toggle('active', c.dataset.region === state.directoryCountry);
  });
}

// ─────────────────────────────────────────────────────────────────────────
// SECTION 29b · Local AI Taste Profiler & Narrated Discover
// ─────────────────────────────────────────────────────────────────────────

const DISCOVER_AI_TOPICS = {
  space_cosmos: {
    key: 'space_cosmos',
    label: 'Space & Cosmology',
    icon: '🚀',
    shortLabel: 'Cosmology',
    keywords: [
      'space', 'cosmos', 'universe', 'nasa', 'astronomy', 'astrophysics',
      'galaxy', 'black hole', 'star', 'telescope', 'orbit', 'mars', 'gravity',
      'moon', 'planetary', 'cosmological', 'spacetime', 'solar', 'quantum',
      'physics', 'exoplanet', 'supernova', 'relativity', 'james webb'
    ],
    feedPatterns: ['nasa', 'startalk', 'planetary', 'sternengeschichten', 'aparici', 'quanta', 'space']
  },
  climate_planet: {
    key: 'climate_planet',
    label: 'Climate & Earth Systems',
    icon: '🌱',
    shortLabel: 'Climate Systems',
    keywords: [
      'climate', 'planet', 'earth', 'nature', 'ocean', 'ecology', 'carbon',
      'warming', 'renewable', 'energy', 'emission', 'biodiversity', 'forest',
      'water', 'environment', 'green', 'sustainability', 'ice', 'atmosphere',
      'wildlife', 'conservation', 'klima', 'umwelt', 'cop'
    ],
    feedPatterns: ['climate', 'earth', 'ecologies', 'mongabay', 'living on earth', 'volts', 'energy gang', 'klima', 'das klima', 'gradmesser', 'la terre', 'chaleur humaine', 'klotet']
  },
  mind_biology: {
    key: 'mind_biology',
    label: 'Neuroscience & Biology',
    icon: '🧠',
    shortLabel: 'Neuro & Biology',
    keywords: [
      'brain', 'neuroscience', 'biology', 'mind', 'psychology', 'cognitive',
      'dna', 'genetic', 'evolution', 'health', 'neuron', 'sleep', 'behavior',
      'consciousness', 'huberman', 'cellular', 'organism', 'species', 'synapsen',
      'darwin', 'immune', 'microbiome'
    ],
    feedPatterns: ['huberman', 'ologies', 'gastropod', 'synapsen', 'darwin', 'baleine']
  },
  tech_futures: {
    key: 'tech_futures',
    label: 'AI & Technological Frontiers',
    icon: '⚡',
    shortLabel: 'AI & Tech',
    keywords: [
      'ai', 'artificial intelligence', 'algorithm', 'technology', 'computing',
      'software', 'neural', 'machine learning', 'future', 'data', 'robot',
      'code', 'cyber', 'silicon', 'digital', 'tech', 'automation', 'chip', 'model'
    ],
    feedPatterns: ['volts', 'sixième science', 'quarks']
  },
  electronic_audio: {
    key: 'electronic_audio',
    label: 'Electronic Music & Mixes',
    icon: '🎵',
    shortLabel: 'Electronic & Mixes',
    keywords: [
      'music', 'electronic', 'techno', 'ambient', 'mix', 'dj', 'club', 'house',
      'synthesizer', 'beats', 'track', 'album', 'sound', 'artist', 'remix',
      'soundtrack', 'resident advisor'
    ],
    feedPatterns: ['ra podcast', 'resident advisor', 'dj', 'mix']
  },
  investigative_ideas: {
    key: 'investigative_ideas',
    label: 'Global Inquiries & Deep Reporting',
    icon: '🌐',
    shortLabel: 'Deep Reporting',
    keywords: [
      'investigate', 'world', 'society', 'history', 'economy', 'politics',
      'documentary', 'global', 'culture', 'human', 'democracy', 'report',
      'future', 'analysis', 'philosophy', 'interview', 'zeit'
    ],
    feedPatterns: ['economist', 'zeit', 'dlf', 'bbc', 'ted', 'france culture']
  },
  pure_science: {
    key: 'pure_science',
    label: 'Frontier Research & Discovery',
    icon: '🔬',
    shortLabel: 'Frontier Research',
    keywords: [
      'science', 'research', 'discovery', 'experiment', 'laboratory',
      'nature podcast', 'quarks', 'forschung', 'wissen', 'spektrum',
      'curiosity', 'scientist', 'evidence', 'study'
    ],
    feedPatterns: ['science vs', 'nature podcast', 'science friday', 'short wave', 'infinite monkey cage', 'crowdscience', 'forschung aktuell', 'zeit wissen', 'terra x', 'radiowissen', 'spektrum']
  }
};

function analyzeTasteProfile(currentState) {
  const feeds = currentState.feeds || [];
  const feedMeta = currentState.feedMetadata || {};
  const allEps = currentState.allEpisodes || [];
  const positions = currentState.playbackPositions || {};
  const favorites = currentState.favorites || [];
  const queue = currentState.queue || [];

  const topicScores = {};
  Object.keys(DISCOVER_AI_TOPICS).forEach(k => { topicScores[k] = 0; });

  let totalEngagedEps = 0;
  let totalDurationSec = 0;
  let durationSamples = 0;

  // 1. Score based on subscribed feeds & metadata
  feeds.forEach(fUrl => {
    const meta = feedMeta[fUrl] || {};
    const textCorpus = `${meta.title || ''} ${meta.description || ''} ${meta.author || ''}`.toLowerCase();
    
    Object.values(DISCOVER_AI_TOPICS).forEach(topic => {
      let matchCount = 0;
      topic.keywords.forEach(kw => {
        if (textCorpus.includes(kw)) matchCount += 1.5;
      });
      topic.feedPatterns.forEach(pat => {
        if (textCorpus.includes(pat)) matchCount += 3;
      });
      topicScores[topic.key] += matchCount;
    });
  });

  // 2. Score based on episodes with engagement weights
  allEps.forEach(ep => {
    const guid = ep.guid;
    const pos = positions[guid];
    const isCompleted = pos && (pos.completed === 1 || pos.completed === true);
    const hasProgress = pos && pos.position > 10;
    const isFav = favorites.some(fav => (typeof fav === 'string' ? fav === guid : fav.guid === guid));
    const isQueued = queue.some(q => (typeof q === 'string' ? q === guid : q.guid === guid));

    let weight = 1.0;
    if (isCompleted) { weight = 4.0; totalEngagedEps++; }
    else if (isFav) { weight = 4.5; totalEngagedEps++; }
    else if (isQueued) { weight = 3.0; totalEngagedEps++; }
    else if (hasProgress) { weight = 2.5; totalEngagedEps++; }

    if (isCompleted || hasProgress || isFav) {
      const durSec = parseDurationSeconds(ep.duration);
      if (durSec > 60) {
        totalDurationSec += durSec;
        durationSamples++;
      }
    }

    const epText = `${ep.title || ''} ${ep.podcastTitle || ''} ${ep.description || ''}`.toLowerCase();
    Object.values(DISCOVER_AI_TOPICS).forEach(topic => {
      let matched = false;
      for (const kw of topic.keywords) {
        if (epText.includes(kw)) {
          topicScores[topic.key] += (weight * 0.8);
          matched = true;
          break;
        }
      }
      if (!matched) {
        for (const pat of topic.feedPatterns) {
          if (epText.includes(pat)) {
            topicScores[topic.key] += (weight * 1.2);
            break;
          }
        }
      }
    });
  });

  // Sort topics by score
  const sortedTopics = Object.keys(topicScores)
    .map(key => ({ key, score: topicScores[key], def: DISCOVER_AI_TOPICS[key] }))
    .sort((a, b) => b.score - a.score);

  const top1 = sortedTopics[0] && sortedTopics[0].score > 0 ? sortedTopics[0] : null;
  const top2 = sortedTopics[1] && sortedTopics[1].score > 0 ? sortedTopics[1] : null;

  // Determine listening duration style
  const avgSec = durationSamples > 0 ? (totalDurationSec / durationSamples) : 2100;
  let durationStyle = 'Balanced Flow (25-45m)';
  let durationVibe = 'Deep Dives (40m+)';
  if (avgSec < 1500) {
    durationStyle = 'Snackable Listens (<25m)';
    durationVibe = 'Snackable (<25m)';
  } else if (avgSec > 2700) {
    durationStyle = 'Expansive Masterclasses (45m+)';
    durationVibe = 'Expansive (45m+)';
  }

  // Derive Persona
  let personaTitle = 'Inquisitive Polymath';
  let personaNarrative = 'Your library embraces a broad spectrum of ideas, science, and storytelling with a keen eye for thoughtful, high-signal conversations.';
  const vibes = [];

  if (feeds.length === 0) {
    personaTitle = 'Curious Explorer';
    personaNarrative = 'Welcome to Anypod! We have prepared a narrated discovery feed spanning planetary science, cosmic mysteries, and cutting-edge research to calibrate your personal taste profile.';
    vibes.push('🌱 Planet & Space', '🔬 Frontier Research', '⚡ Zero Ads / Pure RSS');
  } else if (top1 && top1.key === 'space_cosmos') {
    personaTitle = 'Cosmic Explorer & Deep Systems Thinker';
    personaNarrative = 'Your library reveals an insatiable appetite for astrophysics, space exploration, and fundamental physical laws. You seek out first-principles explanations and expansive perspectives on the universe.';
    vibes.push('🚀 Cosmology', '🌌 Deep Space', durationVibe);
    if (top2) vibes.push(top2.def.shortLabel);
  } else if (top1 && top1.key === 'climate_planet') {
    personaTitle = 'Planetary Ecologist & Earth Steward';
    personaNarrative = 'Your collection reflects deep engagement with planetary systems, climate transitions, and ecological conservation. You gravitate toward investigative solutions and grounded reporting on the living world.';
    vibes.push('🌱 Climate Systems', '🌊 Living Earth', durationVibe);
    if (top2) vibes.push(top2.def.shortLabel);
  } else if (top1 && top1.key === 'mind_biology') {
    personaTitle = 'Cognitive Seeker & Biological Inquirer';
    personaNarrative = 'You are fascinated by the human mind, neurobiology, and evolutionary mechanisms. You appreciate empirical rigor combined with actionable insights into human consciousness and health.';
    vibes.push('🧠 Neuroscience', '🧬 Biology', durationVibe);
    if (top2) vibes.push(top2.def.shortLabel);
  } else if (top1 && top1.key === 'electronic_audio') {
    personaTitle = 'Sonic Architect & Electronic Connoisseur';
    personaNarrative = 'Your taste highlights long-form electronic audio journeys, club-level sound design, and masterfully curated mixes. You listen for production nuance, dynamic pacing, and sonic flow.';
    vibes.push('🎵 Electronic Music', '🎧 Mix Flow', durationVibe);
    if (top2) vibes.push(top2.def.shortLabel);
  } else if (top1 && top1.key === 'tech_futures') {
    personaTitle = 'Technological Futurist & Systems Strategist';
    personaNarrative = 'Your feeds trace the cutting edge of artificial intelligence, computing architectures, and digital evolution. You prioritize substantive discussions about the technologies reshaping our collective future.';
    vibes.push('⚡ AI & Tech', '🤖 Future Systems', durationVibe);
    if (top2) vibes.push(top2.def.shortLabel);
  } else if (top1 && top1.key === 'investigative_ideas') {
    personaTitle = 'Global Inquirer & Investigative Mind';
    personaNarrative = 'Your library seeks deep journalistic rigor, global economic perspectives, and cultural documentaries that unravel the complex layers of human societies.';
    vibes.push('🌐 Global Affairs', '🔍 Investigative', durationVibe);
    if (top2) vibes.push(top2.def.shortLabel);
  } else if (top1 && top1.key === 'pure_science') {
    if (top2 && top2.key === 'space_cosmos') {
      personaTitle = 'Cosmic Explorer & Deep Systems Thinker';
      personaNarrative = 'Your library reveals an insatiable appetite for astrophysics, space exploration, and fundamental physical laws. You seek out first-principles explanations and expansive perspectives on the cosmos.';
      vibes.push('🚀 Cosmology', '🌌 Deep Space', durationVibe);
      vibes.push('🔬 Frontier Science');
    } else {
      personaTitle = 'Frontier Scientist & Empirical Inquirer';
      personaNarrative = 'Your library is anchored in cutting-edge laboratory research, fundamental inquiries, and original scientific findings. You prioritize empirical data and rigorous peer-reviewed insight over quick takes.';
      vibes.push('🔬 Frontier Science', '💡 Research Depth', durationVibe);
      if (top2) vibes.push(top2.def.shortLabel);
    }
  } else {
    personaTitle = 'Scientific Polymath & Inquisitive Mind';
    personaNarrative = 'Your listening spans fundamental science, exploratory reporting, and thoughtful commentary. You prefer substantive, curious audio over fast hot takes.';
    vibes.push('🔬 Frontier Science', '💡 Thoughtful Audio', durationVibe);
    if (top1) vibes.push(top1.def.shortLabel);
  }

  const statText = feeds.length > 0 
    ? `Based on ${feeds.length} subscribed ${feeds.length === 1 ? 'show' : 'shows'}${totalEngagedEps > 0 ? `, ${totalEngagedEps} listened episodes` : ''}`
    : 'Starter Profile • Calibrates with your listening';

  return {
    title: personaTitle,
    narrative: personaNarrative,
    vibes: vibes.slice(0, 4),
    stats: statText,
    durationStyle,
    topTopics: sortedTopics.filter(t => t.score > 0).map(t => t.key),
    engineLabel: 'Local AI Taste Engine'
  };
}

function buildDiscoverEpisodeCard(ep, whyNote, isExternal = false) {
  let card = null;
  if (typeof createEpisodeCard === 'function') {
    card = createEpisodeCard(ep, 'discover');
  } else {
    card = document.createElement('div');
    card.className = 'episode-card';
    card.dataset.guid = ep.guid;
  }

  if (whyNote) {
    const badge = document.createElement('div');
    badge.className = 'discover-why-badge';
    let icon = '✦';
    let text = String(whyNote || '').trim();
    const firstChar = text.slice(0, 2).trim();
    if (['⏳', '✨', '✦', '🌱', '🚀', '🔬', '🎵', '⚡', '🧠', '🌐'].includes(firstChar) || ['⏳', '✨', '✦'].includes(text[0])) {
      icon = text.slice(0, 2).trim() || text[0];
      text = text.slice(icon.length).trim();
    }
    badge.innerHTML = `<span class="why-icon">${escapeHtml(icon)}</span><span class="why-text">${escapeHtml(text)}</span>`;
    const topEl = card.querySelector('.episode-card-top');
    if (topEl) {
      card.insertBefore(badge, topEl);
    } else {
      card.prepend(badge);
    }
  }

  if (isExternal && ep.feedUrl && !state.feeds.includes(ep.feedUrl)) {
    const actionsEl = card.querySelector('.episode-card-actions');
    if (actionsEl) {
      const followBtn = document.createElement('button');
      followBtn.type = 'button';
      followBtn.className = 'btn btn-primary btn-sm btn-discover-follow';
      followBtn.innerHTML = '+ Follow';
      followBtn.title = `Subscribe to ${ep.podcastTitle || 'Show'}`;
      followBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        followBtn.textContent = 'Adding...';
        followBtn.disabled = true;
        try {
          await addFeed(ep.feedUrl, ep.podcastTitle, ep.artwork);
          followBtn.textContent = '✓ Followed';
          followBtn.classList.remove('btn-primary');
          followBtn.classList.add('btn-secondary');
          showToast(`Subscribed to ${ep.podcastTitle}!`);
        } catch (err) {
          followBtn.textContent = '+ Follow';
          followBtn.disabled = false;
        }
      });
      actionsEl.prepend(followBtn);
    }
  }

  return card;
}

function buildDiscoverShowCard(show, whyNote, idx = 0) {
  const card = document.createElement('div');
  card.className = 'episode-card discover-show-recommendation-card';
  card.dataset.feed = show.feed;

  const isSubbed = state.feeds.includes(show.feed);
  let art = show.artwork || (state.feedMetadata[show.feed] && state.feedMetadata[show.feed].artwork) || (_curatedArtworkCache && _curatedArtworkCache[show.feed]) || FALLBACK_ARTWORK;
  if (typeof art === 'string' && art.includes('600x600bb')) {
    art = art.replace('600x600bb', '100x100bb');
  }

  let icon = '✦';
  let text = String(whyNote || '').trim();
  const firstChar = text.slice(0, 2).trim();
  if (['⏳', '✨', '✦', '🌱', '🚀', '🔬', '🎵', '⚡', '🧠', '🌐'].includes(firstChar) || ['⏳', '✨', '✦'].includes(text[0])) {
    icon = text.slice(0, 2).trim() || text[0];
    text = text.slice(icon.length).trim();
  }

  const loadingAttr = idx < 2 ? 'decoding="async"' : 'loading="lazy" decoding="async"';

  card.innerHTML = `
    <div class="discover-why-badge">
      <span class="why-icon">${escapeHtml(icon)}</span>
      <span class="why-text">${escapeHtml(text)}</span>
    </div>
    <div class="episode-card-top">
      <img class="episode-artwork feed-art" src="${escapeHtml(art)}" alt="" ${loadingAttr} width="52" height="52" onerror="this.onerror=null;this.src='${FALLBACK_ARTWORK}';">
      <div class="episode-header-info">
        <div class="episode-podcast-name">${escapeHtml(show.badge || 'Recommended Show')}</div>
        <div class="episode-title">${escapeHtml(show.title)}</div>
      </div>
    </div>
    ${show.description ? `<div class="episode-desc">${escapeHtml(show.description)}</div>` : ''}
    <div class="episode-footer" style="margin-top:auto;">
      <div class="episode-meta">
        <span class="date-line">${escapeHtml(show.topic ? show.topic.toUpperCase() : 'PODCAST')}</span>
        <span class="time-line"><span class="btn-preview-link" style="color:var(--text-muted); cursor:pointer;">Explore episodes →</span></span>
      </div>
      <div class="episode-card-actions" style="display:flex; gap:6px;">
        <button type="button" class="btn ${isSubbed ? 'btn-secondary' : 'btn-primary'} btn-sm btn-discover-follow" ${isSubbed ? 'disabled' : ''}>
          ${isSubbed ? '✓ Followed' : '+ Follow Show'}
        </button>
      </div>
    </div>
  `;

  const followBtn = card.querySelector('.btn-discover-follow');
  if (followBtn && !isSubbed) {
    followBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      followBtn.textContent = 'Adding...';
      followBtn.disabled = true;
      try {
        await addFeed(show.feed, show.title, art);
        followBtn.textContent = '✓ Followed';
        followBtn.classList.remove('btn-primary');
        followBtn.classList.add('btn-secondary');
        showToast(`Subscribed to ${show.title}!`);
      } catch (err) {
        followBtn.textContent = '+ Follow Show';
        followBtn.disabled = false;
      }
    });
  }

  card.addEventListener('click', (e) => {
    if (e.target.closest('.btn-discover-follow')) return;
    if (typeof openFeedDetail === 'function') {
      openFeedDetail(show.feed);
    }
  });

  return card;
}

/**
 * Resolves up to 10 recommended / hot podcast feeds that the user does NOT have subscribed already.
 * Prioritizes any unsubscribed feeds with playback activity, followed by top-matched curated shows.
 */
function getHotUnsubscribedFeeds(limit = 10, profile = null) {
  const result = [];
  const seenUrls = new Set();
  const subbedSet = new Set(state.feeds || []);

  // 1. Any podcasts with playback history that are NOT in state.feeds (e.g. played via discover, search, or shared link)
  const feedTimes = new Map();
  const now = Math.floor(Date.now() / 1000);

  if (state.currentEpisode && state.currentEpisode.feedUrl && !subbedSet.has(state.currentEpisode.feedUrl)) {
    feedTimes.set(state.currentEpisode.feedUrl, now + 100000);
  }

  const epMap = new Map();
  (state.allEpisodes || []).forEach(ep => {
    if (ep && ep.guid) epMap.set(ep.guid, ep);
  });

  const positions = state.playbackPositions || {};
  for (const [guid, pos] of Object.entries(positions)) {
    if (!pos) continue;
    const ep = epMap.get(guid) || (state.currentEpisode?.guid === guid ? state.currentEpisode : null);
    if (!ep || !ep.feedUrl || subbedSet.has(ep.feedUrl)) continue;

    let t = 0;
    if (pos.lastListenedAt) {
      t = pos.lastListenedAt > 1e11 ? Math.floor(pos.lastListenedAt / 1000) : pos.lastListenedAt;
    } else if (pos.position > 2) {
      t = (pos.position || 0) + (ep.timestamp ? Math.floor(ep.timestamp / 1000) : 0);
    } else if (pos.completed) {
      t = (ep.timestamp ? Math.floor(ep.timestamp / 1000) : 1);
    }

    if (t > 0) {
      const prev = feedTimes.get(ep.feedUrl) || 0;
      if (t > prev) {
        feedTimes.set(ep.feedUrl, t);
      }
    }
  }

  const sortedPlayedUnsubbed = Array.from(feedTimes.entries())
    .sort((a, b) => b[1] - a[1])
    .map(entry => entry[0]);

  for (const url of sortedPlayedUnsubbed) {
    if (result.length >= limit) break;
    if (!seenUrls.has(url)) {
      seenUrls.add(url);
      result.push(url);
    }
  }

  // 2. Fill up to limit with curated catalog shows that are NOT subscribed, ranked by taste profile
  if (result.length < limit && typeof CURATED_SCIENCE_FEEDS !== 'undefined') {
    const unsubscribedCurated = CURATED_SCIENCE_FEEDS.filter(item => !subbedSet.has(item.feed) && !seenUrls.has(item.feed));
    const topTopics = profile?.topTopics || ['science', 'space', 'climate', 'nature'];
    const scored = unsubscribedCurated.map(item => {
      let score = 1.0;
      const text = `${item.title} ${item.badge || ''} ${item.topic || ''}`.toLowerCase();
      topTopics.forEach((tKey, idx) => {
        const topic = (typeof DISCOVER_AI_TOPICS !== 'undefined') && DISCOVER_AI_TOPICS[tKey];
        if (topic) {
          if (item.topic === topic.key || topic.feedPatterns.some(p => text.includes(p))) {
            score += (10 - idx * 2);
          }
        } else if (item.topic === tKey) {
          score += (10 - idx * 2);
        }
      });
      return { item, score };
    });

    scored.sort((a, b) => b.score - a.score);

    for (const entry of scored) {
      if (result.length >= limit) break;
      seenUrls.add(entry.item.feed);
      result.push(entry.item.feed);
    }
  }

  return result.slice(0, limit);
}

/**
 * Builds a feed card with a 3-episode preview and share action for the Discover view.
 */
function buildDiscoverRecentFeedCard(url) {
  const curatedItem = (typeof CURATED_SCIENCE_FEEDS !== 'undefined')
    ? CURATED_SCIENCE_FEEDS.find(c => c.feed === url)
    : null;
  const meta = state.feedMetadata[url] || {};
  const isSubbed = state.feeds && state.feeds.includes(url);
  const title = meta.title || curatedItem?.title || url;
  const art = meta.artwork || curatedItem?.artwork || (_curatedArtworkCache && _curatedArtworkCache[url]) || FALLBACK_ARTWORK;
  const card = document.createElement('div');
  card.className = 'feed-card starter-show-card discover-recent-feed-card';
  card.dataset.feed = url;
  card.dataset.title = title;

  const rawDesc = meta.description || curatedItem?.description || '';
  const plainDesc = rawDesc.replace(/<[^>]*>?/gm, '').replace(/\s+/g, ' ').trim();

  const allForFeed = (state.allEpisodes || [])
    .filter(e => e.feedUrl === url)
    .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

  const inProgressEps = allForFeed.filter(ep => {
    const pos = state.playbackPositions ? state.playbackPositions[ep.guid] : null;
    return pos && !pos.completed && pos.position > 2;
  });

  const unplayedEps = allForFeed.filter(ep => {
    const pos = state.playbackPositions ? state.playbackPositions[ep.guid] : null;
    const isProg = inProgressEps.some(p => p.guid === ep.guid);
    return !isProg && (!pos || (!pos.completed && (!pos.position || pos.position <= 2)));
  });

  let feedEpisodes = [...inProgressEps, ...unplayedEps].slice(0, 3);
  const hasUnplayed = feedEpisodes.length > 0;
  if (feedEpisodes.length < 3) {
    const existingGuids = new Set(feedEpisodes.map(e => e.guid));
    const remaining = allForFeed.filter(e => !existingGuids.has(e.guid)).slice(0, 3 - feedEpisodes.length);
    feedEpisodes.push(...remaining);
  }

  const widgetHeader = hasUnplayed
    ? (inProgressEps.length > 0 ? 'Continue & up next' : 'Up next (unplayed)')
    : 'Caught up • Latest';

  let recentWidgetHtml = '';
  if (feedEpisodes.length > 0) {
    recentWidgetHtml = `
      <div class="feed-recent-widget">
        <div class="feed-recent-header">${widgetHeader}</div>
        <div class="feed-recent-list">
          ${feedEpisodes.map(ep => {
            const isCurrent = state.currentEpisode && state.currentEpisode.guid === ep.guid;
            const isEpPlaying = isCurrent && state.playbackStatus === 'playing';
            const pos = state.playbackPositions ? state.playbackPositions[ep.guid] : null;
            const isCompleted = pos && (pos.completed === 1 || pos.completed === true);
            const isInProgress = pos && !isCompleted && pos.position > 2;
            let durStr = ep.duration ? (typeof formatDurationCompact === 'function' ? formatDurationCompact(ep.duration) : ep.duration) : '';
            if (isInProgress && typeof formatTime === 'function') {
              durStr = `Resume ${formatTime(pos.position)}`;
            } else if (isCompleted) {
              durStr = `✓ ${durStr}`;
            }
            return `
              <div class="recent-ep-row ${isCurrent ? 'active' : ''} ${isCompleted ? 'is-played' : ''} ${isInProgress ? 'is-in-progress' : ''}" data-guid="${escapeHtml(ep.guid)}" title="${escapeHtml(ep.title)}">
                <button type="button" class="btn-recent-play ${isEpPlaying ? 'is-playing' : ''}" data-guid="${escapeHtml(ep.guid)}" aria-label="Play ${escapeHtml(ep.title)}">
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">${isEpPlaying ? '<rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect>' : '<polygon points="5 3 19 12 5 21 5 3"></polygon>'}</svg>
                </button>
                <span class="recent-ep-title">${escapeHtml(ep.title)}</span>
                ${durStr ? `<span class="recent-ep-duration">${durStr}</span>` : ''}
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;
  } else {
    recentWidgetHtml = `
      <div class="feed-recent-widget feed-recent-preview-empty" data-feed="${escapeHtml(url)}">
        <div class="feed-recent-header">latest episodes</div>
        <div class="feed-recent-list">
          <div class="recent-ep-row recent-ep-placeholder" style="color: var(--text-muted); font-size: 0.78rem; padding: 0.35rem 0.5rem;">
            <span>Click card to explore episodes</span>
          </div>
        </div>
      </div>
    `;
  }

  const epCountLabel = allForFeed.length > 0 
    ? `${allForFeed.length} episodes` 
    : (meta.episodesCount ? `${meta.episodesCount} episodes` : (curatedItem?.badge || 'New Show'));

  card.innerHTML = `
    <div class="feed-header">
      <img class="feed-art" loading="lazy" decoding="async" width="48" height="48" src="${escapeHtml(art)}" alt="" onerror="this.onerror=null;this.src='${FALLBACK_ARTWORK}';">
      <div class="feed-info">
        <h4>${escapeHtml(title)}</h4>
        <p><span class="hot-feed-chip">🔥 Hot</span> • ${escapeHtml(epCountLabel)}</p>
      </div>
      <div class="feed-header-actions">
        <button type="button" class="btn-feed-share btn-feed-share-prominent" title="Share podcast" aria-label="Share podcast">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"></path>
            <polyline points="16 6 12 2 8 6"></polyline>
            <line x1="12" y1="2" x2="12" y2="15"></line>
          </svg>
        </button>
        ${!isSubbed ? `
          <button type="button" class="btn btn-primary btn-sm starter-chip-add" data-feed="${escapeHtml(url)}" data-title="${escapeHtml(title)}">+ follow</button>
        ` : ''}
      </div>
    </div>
    ${plainDesc ? `<p class="feed-card-desc">${escapeHtml(plainDesc)}</p>` : ''}
    ${recentWidgetHtml}
  `;

  // Wire events
  card.addEventListener('click', (e) => {
    if (e.target.closest('.feed-header-actions') || e.target.closest('.recent-ep-row')) return;
    if (typeof openFeedDetail === 'function') {
      openFeedDetail(url);
    }
  });

  const shareBtn = card.querySelector('.btn-feed-share');
  if (shareBtn) {
    shareBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (typeof shareFeed === 'function') {
        shareFeed(url, title);
      }
    });
  }

  const addBtn = card.querySelector('.starter-chip-add');
  if (addBtn) {
    addBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      addBtn.textContent = 'Adding...';
      try {
        await addFeed(url, title, art);
        addBtn.textContent = '✓ followed';
        addBtn.classList.remove('btn-primary');
        addBtn.classList.add('btn-secondary');
        addBtn.disabled = true;
        if (typeof showStatus === 'function') showStatus('Subscribed! Added to your library');
      } catch (err) {
        addBtn.textContent = '+ follow';
      }
    });
  }

  card.querySelectorAll('.recent-ep-row').forEach(row => {
    const guid = row.dataset.guid;
    const ep = feedEpisodes.find(item => item.guid === guid) || (state.allEpisodes || []).find(item => item.guid === guid);
    if (!ep) return;
    row.addEventListener('click', (e) => {
      e.stopPropagation();
      if (typeof toggleEpisodePlayback === 'function') {
        toggleEpisodePlayback(ep, {
          type: 'feed',
          id: url,
          title: title || 'Podcast Show',
          items: allForFeed
        });
      } else if (typeof playEpisode === 'function') {
        playEpisode(ep);
      }
    });
  });

  return card;
}

function renderDiscover() {
  const container = document.getElementById('discover-content-container');
  if (!container) return;

  const hasFeeds = state.feeds && state.feeds.length > 0;
  const existingWrap = container.querySelector('.discover-view-wrap');

  // If new visitor with no custom feeds and pre-rendered shell is already present in DOM:
  if (!hasFeeds && existingWrap && (existingWrap.dataset.prerendered === 'true' || existingWrap.dataset.prerendered === 'hydrated')) {
    existingWrap.dataset.prerendered = 'hydrated';
    wireEmptyStateEvents(container);
    return;
  }

  const profile = analyzeTasteProfile(state);

  // Gather up to 10 hot / trending podcast feeds that are not yet in library
  const lastPlayedFeeds = getHotUnsubscribedFeeds(10, profile);

  // 1. Gather Unplayed/Backlog library episodes matching taste
  const completedGuids = new Set();
  Object.entries(state.playbackPositions || {}).forEach(([g, pos]) => {
    if (pos && (pos.completed === 1 || pos.completed === true)) {
      completedGuids.add(g);
    }
  });

  const libraryCandidates = [];
  (state.allEpisodes || []).forEach(ep => {
    if (!ep || !ep.guid) return;
    if (!state.feeds.includes(ep.feedUrl)) return;
    if (completedGuids.has(ep.guid)) return;

    const pos = state.playbackPositions[ep.guid];
    const isResuming = pos && pos.position > 10;
    const isFav = state.favorites.some(fav => (typeof fav === 'string' ? fav === ep.guid : fav.guid === ep.guid));

    let score = 1.0;
    let whyNote = '✦ From your subscribed library backlog';

    if (isResuming) {
      score += 5.0;
      whyNote = `⏳ Pick up where you left off • Resumes at ${formatTime(pos.position)}`;
    } else if (isFav) {
      score += 4.0;
      whyNote = `✨ Favorite show cut • High engagement`;
    }

    const text = `${ep.title || ''} ${ep.description || ''}`.toLowerCase();
    for (const tKey of profile.topTopics) {
      const topic = DISCOVER_AI_TOPICS[tKey];
      if (topic) {
        for (const kw of topic.keywords) {
          if (text.includes(kw)) {
            score += 2.5;
            if (!isResuming) {
              whyNote = `✦ Matches your ${topic.shortLabel} focus`;
            }
            break;
          }
        }
      }
    }

    libraryCandidates.push({ ep, score, whyNote });
  });

  libraryCandidates.sort((a, b) => b.score - a.score);
  const selectedLibraryEps = libraryCandidates.slice(0, 6);

  // 2. Gather External Recommendations outside library matching taste
  const externalCandidates = [];
  const unsubscribedCurated = CURATED_SCIENCE_FEEDS.filter(item => !state.feeds.includes(item.feed));

  unsubscribedCurated.forEach(show => {
    let score = 1.0;
    let matchedTopicLabel = 'Science';

    const showText = `${show.title} ${show.badge} ${show.topic}`.toLowerCase();
    for (const tKey of profile.topTopics) {
      const topic = DISCOVER_AI_TOPICS[tKey];
      if (topic) {
        if (show.topic === topic.key || topic.feedPatterns.some(p => showText.includes(p))) {
          score += 4.0;
          matchedTopicLabel = topic.shortLabel;
          break;
        }
      }
    }

    const whyNote = `✨ Recommended companion for your ${matchedTopicLabel} taste`;
    externalCandidates.push({ show, score, whyNote });
  });

  externalCandidates.sort((a, b) => b.score - a.score);
  const selectedExternalShows = externalCandidates.slice(0, 6);

  // Narrative descriptions for sections
  const librarySectionNarrative = hasFeeds
    ? `Curated unplayed gems and in-progress deep cuts from your ${state.feeds.length} subscribed shows, aligned with your current listening persona.`
    : `Once you subscribe to shows, your personal unplayed deep cuts and backlog highlights will narrate here.`;

  const externalSectionNarrative = hasFeeds
    ? `Handpicked podcasts outside your current library, selected because their reporting depth directly complements your audio taste.`
    : `Curated starter shows from worldwide producers to introduce fresh perspectives and tune your profile.`;

  container.innerHTML = `
    <div class="discover-view-wrap">
      <!-- AI Taste Persona Banner -->
      <div class="discover-persona-banner">
        <div class="persona-banner-header">
          <div class="persona-badge">
            <span class="persona-sparkle">✦</span>
            <span class="persona-badge-title">AI Taste Profile</span>
          </div>
          <button type="button" class="btn-recalibrate-taste" id="btn-recalibrate-taste" title="Recalibrate taste profile based on current library and history">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="23 4 23 10 17 10"></polyline>
              <polyline points="1 20 1 14 7 14"></polyline>
              <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>
            </svg>
            <span>Recalibrate</span>
          </button>
        </div>
        <div class="persona-main">
          <h2 class="persona-title">${escapeHtml(profile.title)}</h2>
          <p class="persona-narrative">${escapeHtml(profile.narrative)}</p>
        </div>
        <div class="persona-footer">
          <div class="persona-vibes">
            ${profile.vibes.map(v => `<span class="persona-vibe-chip">${escapeHtml(v)}</span>`).join('')}
          </div>
          <div class="persona-stats">
            <span>${escapeHtml(profile.stats)}</span>
            <span class="persona-engine-tag" title="Runs privately and locally on your device">${escapeHtml(profile.engineLabel)}</span>
          </div>
        </div>
      </div>

      <!-- Clean Search & Direct RSS Add -->
      <div class="discover-search-box">
        <form id="empty-quick-form" class="quick-add-form" action="javascript:void(0);">
          <div class="quick-add-input-wrap">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="quick-add-icon">
              <circle cx="11" cy="11" r="8"></circle>
              <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
            </svg>
            <input type="text" id="empty-quick-input" placeholder="search podcast name or paste rss feed url..." autocomplete="off">
            <button type="submit" class="btn btn-primary btn-quick-submit" id="btn-empty-quick-submit">search / add</button>
          </div>
        </form>
        <div class="empty-category-chips" id="empty-category-chips">
          <button type="button" class="category-chip" data-category="Science">science</button>
          <button type="button" class="category-chip" data-category="Climate">climate &amp; planet</button>
          <button type="button" class="category-chip" data-category="Earth Nature">earth &amp; nature</button>
          <button type="button" class="category-chip" data-category="Space Astronomy">space &amp; astronomy</button>
          <button type="button" class="category-chip" data-category="Oceans Marine">oceans &amp; marine</button>
          <button type="button" class="category-chip" data-category="Physics Quantum">physics &amp; quantum</button>
          <button type="button" class="category-chip" data-category="Neuroscience Mind">neuroscience &amp; mind</button>
          <button type="button" class="category-chip" data-category="Biology Genetics">biology &amp; genetics</button>
          <button type="button" class="category-chip" data-category="Clean Energy">clean tech &amp; energy</button>
          <button type="button" class="category-chip" data-category="AI Tech">artificial intelligence</button>
          <button type="button" class="category-chip" data-category="History Science">history of science</button>
          <button type="button" class="category-chip" data-category="Wissen DE">wissen (de)</button>
        </div>
        <div id="empty-quick-results" class="quick-results-container"></div>
      </div>

      <!-- Section 1: From Your Library -->
      ${hasFeeds && selectedLibraryEps.length > 0 ? `
        <div class="discover-section">
          <div class="discover-section-header">
            <div class="discover-section-title-wrap">
              <h3 class="discover-section-title">Rediscover Your Library</h3>
              <span class="discover-section-pill">From Your Shows</span>
            </div>
            <p class="discover-section-narrative">${escapeHtml(librarySectionNarrative)}</p>
          </div>
          <div class="discover-narrative-grid" id="discover-library-grid"></div>
        </div>
      ` : ''}

      <!-- Section 2: Explore New Horizons -->
      <div class="discover-section">
        <div class="discover-section-header">
          <div class="discover-section-title-wrap">
            <h3 class="discover-section-title">Explore New Horizons</h3>
            <span class="discover-section-pill">Matched To Your Taste</span>
          </div>
          <p class="discover-section-narrative">${escapeHtml(externalSectionNarrative)}</p>
        </div>
        <div class="discover-narrative-grid" id="discover-external-grid"></div>
      </div>

      <!-- Section: Hot Shows To Discover -->
      ${lastPlayedFeeds.length > 0 ? `
        <div class="discover-section discover-recent-feeds-section">
          <div class="discover-section-header">
            <div class="discover-section-title-wrap">
              <h3 class="discover-section-title">Hot Shows To Discover</h3>
              <span class="discover-section-pill">New To You (${lastPlayedFeeds.length})</span>
            </div>
            <p class="discover-section-narrative">Top 10 recommended shows not yet in your library with 3-episode previews — tap to preview, subscribe (+ follow), or share with friends.</p>
          </div>
          <div class="feeds-grid discover-recent-feeds-grid" id="discover-recent-feeds-grid"></div>
        </div>
      ` : ''}

      <!-- Section 3: Curated Global Directory Catalog -->
      <div class="discover-section">
        <div class="discover-section-header">
          <div class="discover-section-title-wrap">
            <h3 class="discover-section-title">Curated Planetary &amp; Science Catalog</h3>
            <span class="discover-section-pill">50 Worldwide Shows</span>
          </div>
          <p class="discover-section-narrative">Explore curated independent podcasts across English, German, French, Spanish, and global reporting.</p>
        </div>
        ${buildStarterSuggestionsHTML('all', 12)}
      </div>

      <!-- OPML import helper footer -->
      <div class="discover-opml-footer">
        <button class="btn btn-secondary btn-sm" id="btn-empty-opml-trigger">import opml file</button>
      </div>
    </div>
  `;

  // Populate dynamic cards
  const libGrid = container.querySelector('#discover-library-grid');
  if (libGrid && selectedLibraryEps.length > 0) {
    selectedLibraryEps.forEach(item => {
      const card = buildDiscoverEpisodeCard(item.ep, item.whyNote, false);
      libGrid.appendChild(card);
    });
  }

  const extGrid = container.querySelector('#discover-external-grid');
  if (extGrid && selectedExternalShows.length > 0) {
    selectedExternalShows.forEach((item, idx) => {
      const card = buildDiscoverShowCard(item.show, item.whyNote, idx);
      extGrid.appendChild(card);
    });
  }

  const recentFeedsGrid = container.querySelector('#discover-recent-feeds-grid');
  if (recentFeedsGrid && lastPlayedFeeds.length > 0) {
    lastPlayedFeeds.forEach(url => {
      const card = buildDiscoverRecentFeedCard(url);
      if (card) recentFeedsGrid.appendChild(card);
    });
    if (typeof loadCuratedFeedEpisodes === 'function') {
      loadCuratedFeedEpisodes(recentFeedsGrid);
    }
  }

  // Wire events
  wireEmptyStateEvents(container);

  const recalibrateBtn = container.querySelector('#btn-recalibrate-taste');
  if (recalibrateBtn) {
    recalibrateBtn.addEventListener('click', (e) => {
      e.preventDefault();
      recalibrateBtn.style.opacity = '0.5';
      showToast('✨ AI taste profile recalibrated against your library!');
      setTimeout(() => {
        renderDiscover();
      }, 200);
    });
  }
}

let emptySearchDebounceTimer = null;

function wireEmptyStateEvents(targetRoot = document) {
  const quickForm = targetRoot.querySelector('#empty-quick-form');
  const quickInput = targetRoot.querySelector('#empty-quick-input');
  const quickSubmit = targetRoot.querySelector('#btn-empty-quick-submit');
  const quickResults = targetRoot.querySelector('#empty-quick-results');

  if (quickInput && quickForm) {
    const normalizeUrl = (str) => {
      let u = str.trim();
      if ((u.startsWith('www.') || u.includes('youtube.com/') || u.includes('youtu.be/')) && !u.startsWith('http://') && !u.startsWith('https://')) {
        u = 'https://' + u;
      }
      return u;
    };

    const isDirectUrl = (str) => {
      const u = str.trim().toLowerCase();
      return u.startsWith('http://') || u.startsWith('https://') || u.startsWith('www.') || u.includes('youtube.com/') || u.includes('youtu.be/');
    };

    quickInput.addEventListener('input', () => {
      const raw = quickInput.value.trim();
      if (quickSubmit) {
        quickSubmit.textContent = isDirectUrl(raw) ? 'Add Feed' : 'Search';
      }
      if (emptySearchDebounceTimer) clearTimeout(emptySearchDebounceTimer);
      if (!raw || raw.length < 3 || isDirectUrl(raw)) {
        if (quickResults) quickResults.innerHTML = '';
        return;
      }
      emptySearchDebounceTimer = setTimeout(() => {
        if (quickResults) searchPodcastDirectory(raw, quickResults);
      }, 650);
    });

    quickForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const raw = quickInput.value.trim();
      if (!raw) return;

      if (isDirectUrl(raw)) {
        const val = normalizeUrl(raw);
        if (quickSubmit) {
          quickSubmit.textContent = 'adding...';
          quickSubmit.disabled = true;
        }
        try {
          const added = await addFeed(val);
          if (added) {
            const meta = state.feedMetadata[val] || {};
            if (meta.error) {
              showToast(`⚠️ Could not load feed: ${meta.error}`, 4000);
              if (quickSubmit) {
                quickSubmit.textContent = 'Add Feed';
                quickSubmit.disabled = false;
              }
            } else {
              quickInput.value = '';
              if (quickResults) quickResults.innerHTML = '';
              const feedTitle = meta.title || 'podcast';
              const count = meta.episodesCount || (state.allEpisodes ? state.allEpisodes.filter(ep => ep.feedUrl === val).length : 0);
              showToast(`✓ Subscribed to "${feedTitle}" (${count} episodes)!`, 3500);
              if (quickSubmit) {
                quickSubmit.textContent = '✓ added';
                setTimeout(() => {
                  if (quickSubmit) {
                    quickSubmit.textContent = 'search / add';
                    quickSubmit.disabled = false;
                  }
                }, 2500);
              }
              if (typeof _currentView === 'function' && (_currentView().tab === 'discover' || state.feeds.length === 1)) {
                if (typeof navigateTo === 'function') {
                  navigateTo('timeline', null);
                }
              }
            }
          } else {
            if (quickSubmit) {
              quickSubmit.textContent = 'Add Feed';
              quickSubmit.disabled = false;
            }
          }
        } catch (err) {
          showToast(`⚠️ Error adding feed: ${err?.message || 'Network error'}`, 4000);
          if (quickSubmit) {
            quickSubmit.textContent = 'Add Feed';
            quickSubmit.disabled = false;
          }
        }
      } else {
        if (emptySearchDebounceTimer) clearTimeout(emptySearchDebounceTimer);
        if (quickResults) searchPodcastDirectory(raw, quickResults);
      }
    });
  }

  targetRoot.querySelector('#btn-empty-open-add')?.addEventListener('click', openAddModal);
  targetRoot.querySelector('#btn-empty-opml-trigger')?.addEventListener('click', () => elements.opmlFileInput?.click());

  const emptyCatChips = targetRoot.querySelectorAll('#empty-category-chips .category-chip');
  if (emptyCatChips && quickInput && quickResults) {
    emptyCatChips.forEach(chip => {
      chip.addEventListener('click', () => {
        const cat = chip.dataset.category;
        quickInput.value = cat;
        if (quickSubmit) quickSubmit.textContent = 'search';
        searchPodcastDirectory(cat, quickResults);
      });
    });
  }

  wireStarterSuggestionsEvents(targetRoot);
}

