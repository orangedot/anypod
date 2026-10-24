(function () {
  'use strict';

  const mixer = new DJMixer();

  // ─────────────────────────────────────────────────────────────────────────
  // STATE MANAGEMENT
  // ─────────────────────────────────────────────────────────────────────────
  const state = {
    allTracks: [],
    filteredTracks: [],
    activeFilter: 'all', // 'all' | 'youtube' | 'podcasts' | 'queue' | 'favorites' | 'live-now' | 'samples'
    searchQuery: '',
    loadedDeckA: null,
    loadedDeckB: null,
    masterBpm: 128.00,
    deckPitch: { A: 1.0, B: 1.0 },
    tapTimes: [],
    feeds: [],
    feedMetadata: {},
    queue: [],
    favorites: [],
    liveAppTrack: null,
    collapsedGroups: new Set(),
    hasInitializedGroupCollapse: false
  };

  const Shared = window.AnypodShared || {};

  // Procedural WAV synthesizer for 100% offline, un-expirable sample decks
  const createSynthBeatBlobUrl = Shared.createSynthBeatBlobUrl || function () { return ''; };

  const SAMPLE_TRACKS = [
    {
      guid: 'sample-909-kit',
      title: '909 Deep Tech Beat (128 BPM)',
      podcastTitle: 'DJ Beats & Loops',
      artwork: 'https://images.unsplash.com/photo-1598488035139-bdbb2231ce04?w=160&auto=format&fit=crop&q=80',
      audioUrl: createSynthBeatBlobUrl(128, 'house'),
      duration: 32,
      bpm: 128,
      key: '8m',
      isYouTube: false,
      isSample: true
    },
    {
      guid: 'sample-funk-groove',
      title: 'Funk Breakbeat & Bassline',
      podcastTitle: 'DJ Beats & Loops',
      artwork: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=160&auto=format&fit=crop&q=80',
      audioUrl: createSynthBeatBlobUrl(124, 'house'),
      duration: 28,
      bpm: 124,
      key: '10m',
      isYouTube: false,
      isSample: true
    },
    {
      guid: 'sample-acid-synth',
      title: 'Acid Resonance Bassline (130 BPM)',
      podcastTitle: 'DJ Beats & Loops',
      artwork: 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=160&auto=format&fit=crop&q=80',
      audioUrl: createSynthBeatBlobUrl(130, 'acid'),
      duration: 30,
      bpm: 130,
      key: '6m',
      isYouTube: false,
      isSample: true
    },
    {
      guid: 'sample-vocal-drop',
      title: 'Hypnotic Deep Pulse (126 BPM)',
      podcastTitle: 'DJ Beats & Loops',
      artwork: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=160&auto=format&fit=crop&q=80',
      audioUrl: createSynthBeatBlobUrl(126, 'acid'),
      duration: 20,
      bpm: 126,
      key: '11m',
      isYouTube: false,
      isSample: true
    }
  ];

  // ─────────────────────────────────────────────────────────────────────────
  // TIME & FORMAT UTILITIES (DELEGATED TO AnypodShared)
  // ─────────────────────────────────────────────────────────────────────────
  const formatTime = (s) => Shared.formatTime ? Shared.formatTime(s, false) : '0:00';
  const formatDuration = Shared.formatDuration || ((dur) => formatTime(dur));
  const escapeHtml = Shared.escapeHtml || ((str) => String(str || ''));
  const parseDurationSeconds = Shared.parseDurationSeconds || ((dur) => Number(dur) || 0);

  function estimateBpm(track, idx) {
    if (track.bpm && typeof track.bpm === 'number') return track.bpm;
    // Pseudo-consistent deterministic BPM from track title length/hash
    const hash = (track.title || '').split('').reduce((acc, c) => acc + c.charCodeAt(0), idx * 7);
    return 120 + (hash % 16);
  }

  function estimateKey(track, idx) {
    if (track.key) return track.key;
    const keys = ['1A', '2A', '3A', '4A', '5A', '6A', '7A', '8A', '9A', '10A', '11A', '12A', '8m', '9m', '10m', '11m'];
    const hash = (track.title || '').split('').reduce((acc, c) => acc + c.charCodeAt(0), idx * 3);
    return keys[hash % keys.length];
  }

  // ─────────────────────────────────────────────────────────────────────────
  // STORAGE HYDRATION (LOCALSTORAGE + INDEXEDDB COMPREHENSIVE IMPORT)
  // ─────────────────────────────────────────────────────────────────────────
  let syncMissingFeedsPromise = null;
  async function syncMissingFeeds() {
    if (syncMissingFeedsPromise) return syncMissingFeedsPromise;
    syncMissingFeedsPromise = (async () => {
      // 1. Check D1 /api/sync/feeds to ensure all subscriptions are discovered
      try {
        const syncRes = await fetch('/api/sync/feeds', { credentials: 'include' });
        if (syncRes.ok) {
          const syncData = await syncRes.json();
          if (Array.isArray(syncData.feeds)) {
            let metaUpdated = false;
            syncData.feeds.forEach(f => {
              if (f.feed_url && !state.feeds.includes(f.feed_url)) {
                state.feeds.push(f.feed_url);
              }
              if (f.feed_url && !state.feedMetadata[f.feed_url]) {
                state.feedMetadata[f.feed_url] = {
                  title: f.title,
                  artwork: f.artwork,
                  isYouTube: f.feed_url.includes('youtube.com') || f.feed_url.includes('youtu.be') || f.feed_url.includes('list=')
                };
                metaUpdated = true;
              }
            });
            localStorage.setItem('anypod_feeds', JSON.stringify(state.feeds));
            if (metaUpdated) {
              localStorage.setItem('anypod_cached_metadata', JSON.stringify(state.feedMetadata));
            }
          }
        }
      } catch (_) {}

      // 2. Identify feeds that need track fetching (all YouTube feeds or feeds with no cached tracks)
      if (Array.isArray(state.feeds) && state.feeds.length > 0) {
        const feedsToFetch = state.feeds.filter(feedUrl => {
          const isYt = feedUrl.includes('youtube.com') || feedUrl.includes('youtu.be') || feedUrl.includes('list=') || !!state.feedMetadata[feedUrl]?.isYouTube || !!state.feedMetadata[feedUrl]?.isYouTubePlaylist;
          const trackCount = state.allTracks.filter(t => t.feedUrl === feedUrl).length;
          return isYt ? trackCount < 5 : trackCount === 0;
        });

        if (feedsToFetch.length > 0) {
          let hasNewTracks = false;
          const newlyFetched = [];
          const fetchedUrls = new Set();

          // Try batch POST fetch first for maximum speed
          try {
            const batchRes = await fetch('/api/feed', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ urls: feedsToFetch.slice(0, 20) })
            });
            if (batchRes.ok) {
              const batchData = await batchRes.json();
              if (Array.isArray(batchData.feeds)) {
                batchData.feeds.forEach(feedData => {
                  const feedUrl = feedData.feedUrl || '';
                  if (feedUrl) fetchedUrls.add(feedUrl);
                  if (Array.isArray(feedData.episodes) && feedData.episodes.length > 0) {
                    const isYt = !!(feedData.isYouTube || feedData.isYouTubePlaylist || feedUrl.includes('youtube.com') || feedUrl.includes('youtu.be') || feedUrl.includes('list='));
                    if (feedData.title && feedUrl && !state.feedMetadata[feedUrl]) {
                      state.feedMetadata[feedUrl] = {
                        title: feedData.title,
                        artwork: feedData.artwork,
                        isYouTube: isYt
                      };
                    }
                    feedData.episodes.forEach(ep => {
                      if (feedUrl) ep.feedUrl = feedUrl;
                      if (isYt) ep.isYouTube = true;
                      if (feedData.title && !ep.podcastTitle) ep.podcastTitle = feedData.title;
                      if (feedData.artwork && !ep.artwork) ep.artwork = feedData.artwork;
                      newlyFetched.push(ep);
                      hasNewTracks = true;
                    });
                  }
                });
              }
            }
          } catch (_) {}

          // Fallback fetch for any remaining feeds not covered in batch
          const remainingFeeds = feedsToFetch.filter(u => !fetchedUrls.has(u)).slice(0, 15);
          if (remainingFeeds.length > 0) {
            await Promise.allSettled(remainingFeeds.map(async (feedUrl) => {
              try {
                const res = await fetch(`/api/feed?url=${encodeURIComponent(feedUrl)}`);
                if (res.ok) {
                  const data = await res.json();
                  if (Array.isArray(data.episodes) && data.episodes.length > 0) {
                    const isYt = !!(data.isYouTube || data.isYouTubePlaylist || feedUrl.includes('youtube.com') || feedUrl.includes('youtu.be') || feedUrl.includes('list='));
                    if (data.title && !state.feedMetadata[feedUrl]) {
                      state.feedMetadata[feedUrl] = {
                        title: data.title,
                        artwork: data.artwork,
                        isYouTube: isYt
                      };
                    }
                    data.episodes.forEach(ep => {
                      ep.feedUrl = feedUrl;
                      if (isYt) ep.isYouTube = true;
                      if (data.title && !ep.podcastTitle) ep.podcastTitle = data.title;
                      if (data.artwork && !ep.artwork) ep.artwork = data.artwork;
                      newlyFetched.push(ep);
                      hasNewTracks = true;
                    });
                  }
                }
              } catch (_) {}
            }));
          }

          if (hasNewTracks) {
            try {
              const existingCached = JSON.parse(localStorage.getItem('anypod_cached_episodes') || '[]');
              const existingMap = new Map();
              existingCached.forEach(ep => {
                const key = ep.guid || ep.videoId || ep.audioUrl || ep.url;
                if (key) existingMap.set(key, ep);
              });
              newlyFetched.forEach(ep => {
                const key = ep.guid || ep.videoId || ep.audioUrl || ep.url;
                if (key && !existingMap.has(key)) {
                  existingMap.set(key, ep);
                }
              });
              const merged = Array.from(existingMap.values()).slice(0, 1500);
              localStorage.setItem('anypod_cached_episodes', JSON.stringify(merged));
            } catch (_) {}

            await hydrateCollection(false);
          }
        }
      }
    })().finally(() => {
      syncMissingFeedsPromise = null;
    });
    return syncMissingFeedsPromise;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // STORAGE HYDRATION (LOCALSTORAGE + INDEXEDDB COMPREHENSIVE IMPORT)
  // ─────────────────────────────────────────────────────────────────────────
  async function hydrateCollection(triggerSync = true) {
    const epMap = new Map();

    // 1. Load Live App Current Track
    try {
      state.liveAppTrack = Shared.getLastActiveEpisode
        ? Shared.getLastActiveEpisode()
        : JSON.parse(localStorage.getItem('anypod_last_active_episode') || 'null');
    } catch (_) {}

    // 2. Load Feeds & Metadata
    try {
      state.feeds = Shared.getCachedFeeds ? Shared.getCachedFeeds() : JSON.parse(localStorage.getItem('anypod_feeds') || '[]');
      state.feedMetadata = Shared.getCachedMetadata ? Shared.getCachedMetadata() : JSON.parse(localStorage.getItem('anypod_cached_metadata') || '{}');
      state.queue = JSON.parse(localStorage.getItem('anypod_playback_queue') || '[]');
      state.favorites = JSON.parse(localStorage.getItem('anypod_favorites') || '[]');
    } catch (_) {}

    const addTrack = (ep) => {
      if (!ep) return;
      const key = ep.guid || ep.videoId || ep.audioUrl || ep.url;
      if (!key || epMap.has(key)) return;

      const isYt = !!ep.isYouTube || !!ep.videoId ||
        String(ep.audioUrl || '').includes('youtube.com') || String(ep.audioUrl || '').includes('youtu.be') ||
        String(ep.feedUrl || '').includes('youtube.com') || String(ep.feedUrl || '').includes('youtu.be') ||
        String(ep.feedUrl || '').includes('list=') ||
        String(ep.link || '').includes('youtube.com') || String(ep.link || '').includes('youtu.be') ||
        String(ep.guid || '').includes('youtube.com') || String(ep.guid || '').includes('youtu.be') ||
        !!(state.feedMetadata[ep.feedUrl]?.isYouTube || state.feedMetadata[ep.feedUrl]?.isYouTubePlaylist);

      const vId = ep.videoId || (isYt ? (
        (ep.audioUrl || '').match(/(?:v=|\/embed\/|\/watch\?v=|youtu\.be\/)([\w-]{11})/)?.[1] ||
        (ep.link || '').match(/(?:v=|\/embed\/|\/watch\?v=|youtu\.be\/)([\w-]{11})/)?.[1] ||
        (String(key).match(/(?:v=|\/embed\/|\/watch\?v=|youtu\.be\/)([\w-]{11})/)?.[1])
      ) : null);

      let cachedAnalysis = null;
      try {
        const rawAnalysis = localStorage.getItem('anypod_dj_analysis_cache');
        if (rawAnalysis) {
          const aMap = JSON.parse(rawAnalysis);
          cachedAnalysis = aMap[key] || aMap[ep.audioUrl] || aMap[ep.guid] || aMap[ep.videoId] || aMap[ep.title] || null;
        }
      } catch (_) {}

      const trackBpm = cachedAnalysis ? cachedAnalysis.bpm : (ep.bpm || estimateBpm(ep, epMap.size));
      const trackKey = cachedAnalysis ? (cachedAnalysis.camelot || cachedAnalysis.key) : (ep.key || estimateKey(ep, epMap.size));

      const norm = {
        guid: ep.guid || key,
        title: ep.title || 'Untitled Track',
        podcastTitle: ep.podcastTitle || ep.author || (state.feedMetadata[ep.feedUrl]?.title) || (isYt ? 'YouTube' : 'Podcast'),
        artwork: ep.artwork || (state.feedMetadata[ep.feedUrl]?.artwork) || '/icon-192.png',
        audioUrl: ep.audioUrl || ep.url || '',
        feedUrl: ep.feedUrl || '',
        duration: ep.duration || 0,
        durSec: parseDurationSeconds(ep.duration),
        isYouTube: isYt,
        videoId: vId,
        isSample: !!ep.isSample || (ep.guid && ep.guid.startsWith('sample-')),
        isDownloaded: !!ep.isDownloaded,
        bpm: trackBpm,
        key: trackKey,
        camelot: cachedAnalysis?.camelot || trackKey,
        musicalKey: cachedAnalysis?.key || null
      };

      epMap.set(key, norm);
      if (norm.guid) epMap.set(norm.guid, norm);
    };

    // 2b. Load Downloaded Episodes & Offline Files from app.js
    try {
      const rawDownloads = Shared.getDownloadsMap
        ? Shared.getDownloadsMap()
        : JSON.parse(localStorage.getItem('anypod_downloads') || '{}');
      if (rawDownloads && typeof rawDownloads === 'object') {
        Object.values(rawDownloads).forEach(ep => {
          if (ep) {
            ep.isDownloaded = true;
            addTrack(ep);
          }
        });
      }
    } catch (_) {}

    // 3. Fast sync from localStorage cached episodes
    try {
      const rawCached = JSON.parse(localStorage.getItem('anypod_cached_episodes') || '[]');
      if (Array.isArray(rawCached)) rawCached.forEach(addTrack);
    } catch (_) {}

    // 4. Asynchronous Deep Hydration from IndexedDB 'anypod_store_v1'
    try {
      const idbTracks = Shared.idbStore
        ? await Shared.idbStore.get('anypod_cached_episodes')
        : null;
      if (Array.isArray(idbTracks)) {
        idbTracks.forEach(addTrack);
      }
    } catch (_) {}

    // 5. Add Queue & Favorites to ensure complete visibility
    state.queue.forEach(addTrack);
    state.favorites.forEach(addTrack);

    // 6. Include Sample Pack if empty
    SAMPLE_TRACKS.forEach(addTrack);

    // If live track exists, add it too
    if (state.liveAppTrack) addTrack(state.liveAppTrack);

    state.allTracks = Array.from(new Set(epMap.values()));
    updateCounts();
    filterAndRenderTable();

    // 7. Auto-fetch subscribed YouTube playlists & missing feeds if requested
    if (triggerSync) {
      syncMissingFeeds();
    }
  }

  function updateCounts() {
    const countAll = document.getElementById('count-all');
    const countYt = document.getElementById('count-yt');
    const countPodcasts = document.getElementById('count-podcasts');
    const countDownloads = document.getElementById('count-downloads');
    const countQueue = document.getElementById('count-queue');
    const countFavs = document.getElementById('count-favs');

    if (countAll) countAll.textContent = state.allTracks.length;
    if (countYt) countYt.textContent = state.allTracks.filter(t => t.isYouTube).length;
    if (countPodcasts) countPodcasts.textContent = state.allTracks.filter(t => !t.isYouTube && !t.isSample).length;
    if (countDownloads) countDownloads.textContent = state.allTracks.filter(t => t.isDownloaded).length;
    if (countQueue) countQueue.textContent = state.queue.length;
    if (countFavs) countFavs.textContent = state.favorites.length;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // TRACK BROWSER & TABLE RENDERING
  // ─────────────────────────────────────────────────────────────────────────
  function filterAndRenderTable() {
    let list = state.allTracks;

    // Apply category filter
    if (state.activeFilter === 'youtube') {
      list = list.filter(t => t.isYouTube);
    } else if (state.activeFilter === 'podcasts') {
      list = list.filter(t => !t.isYouTube && !t.isSample);
    } else if (state.activeFilter === 'downloads') {
      list = list.filter(t => t.isDownloaded);
    } else if (state.activeFilter === 'queue') {
      const qGuids = new Set(state.queue.map(q => q.guid || q.audioUrl));
      list = list.filter(t => qGuids.has(t.guid) || qGuids.has(t.audioUrl));
    } else if (state.activeFilter === 'favorites') {
      const favGuids = new Set(state.favorites.map(f => f.guid || f.audioUrl));
      list = list.filter(t => favGuids.has(t.guid) || favGuids.has(t.audioUrl));
    } else if (state.activeFilter === 'live-now') {
      list = state.liveAppTrack ? [state.liveAppTrack] : [];
    } else if (state.activeFilter === 'samples') {
      list = list.filter(t => t.isSample);
    }

    // Apply search query
    if (state.searchQuery) {
      const q = state.searchQuery.toLowerCase();
      list = list.filter(t => 
        (t.title && t.title.toLowerCase().includes(q)) ||
        (t.podcastTitle && t.podcastTitle.toLowerCase().includes(q))
      );
    }

    state.filteredTracks = list;

    const tbody = document.getElementById('track-table-body');
    const viewTitle = document.getElementById('table-view-title');
    const showingCount = document.getElementById('table-showing-count');

    if (viewTitle) {
      const titles = {
        all: 'All Tracks Collection',
        youtube: 'YouTube Playlists & Videos',
        podcasts: 'Subscribed Podcast Feeds',
        downloads: 'Downloaded Offline Episodes',
        queue: 'Up Next Queue',
        favorites: 'Starred Favorites',
        'live-now': 'Now Playing in Live Player',
        samples: 'DJ Beats & Loops'
      };
      viewTitle.textContent = titles[state.activeFilter] || 'Tracks';
    }

    if (showingCount) {
      showingCount.textContent = `${list.length} tracks`;
    }

    if (!tbody) return;

    if (list.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="10" style="text-align: center; padding: 36px; color: var(--text-muted);">
            No tracks found in this category. Paste a YouTube playlist or RSS URL on the left to add songs.
          </td>
        </tr>
      `;
      return;
    }

    // Group tracks by Feed / Playlist Folder
    const groupMap = new Map();
    list.forEach(track => {
      const gName = track.podcastTitle || (track.isYouTube ? 'YouTube Playlist' : 'Podcast');
      if (!groupMap.has(gName)) {
        groupMap.set(gName, {
          name: gName,
          isYouTube: track.isYouTube,
          isSample: track.isSample,
          artwork: track.artwork || (state.feedMetadata[track.feedUrl]?.artwork) || '/icon-192.png',
          tracks: []
        });
      }
      groupMap.get(gName).tracks.push(track);
    });

    const allGroupIds = Array.from(groupMap.keys()).map(name => 'grp_' + encodeURIComponent(name).replace(/[^a-zA-Z0-9_]/g, '_'));

    // Default: all groups start closed / collapsed on initial load
    if (!state.hasInitializedGroupCollapse && allGroupIds.length > 0) {
      allGroupIds.forEach(id => state.collapsedGroups.add(id));
      state.hasInitializedGroupCollapse = true;
    }

    const isSearching = !!state.searchQuery;
    const isAllCollapsed = allGroupIds.length > 0 && allGroupIds.every(id => state.collapsedGroups.has(id));

    const btnToggleFolders = document.getElementById('btn-toggle-folders');
    if (btnToggleFolders) {
      btnToggleFolders.textContent = isAllCollapsed ? '📂 Expand All' : '📁 Collapse All';
    }

    const fragment = document.createDocumentFragment();

    groupMap.forEach((group) => {
      const groupId = 'grp_' + encodeURIComponent(group.name).replace(/[^a-zA-Z0-9_]/g, '_');
      const isCollapsed = !isSearching && state.collapsedGroups.has(groupId);

      // Render Folder Header Row
      const headerTr = document.createElement('tr');
      headerTr.className = `folder-header-row ${isCollapsed ? 'is-collapsed' : ''}`;
      headerTr.dataset.groupId = groupId;

      const typeBadge = group.isYouTube
        ? '<span class="folder-type-tag yt">YouTube</span>'
        : (group.isSample ? '<span class="folder-type-tag sample">Sample</span>' : '<span class="folder-type-tag podcast">Feed</span>');

      headerTr.innerHTML = `
        <td colspan="10" class="folder-header-cell">
          <div class="folder-header-content">
            <span class="folder-toggle-icon">${isCollapsed ? '▶' : '▼'}</span>
            <img src="${escapeHtml(group.artwork)}" class="folder-artwork" alt="" loading="lazy">
            <span class="folder-name">${escapeHtml(group.name)}</span>
            ${typeBadge}
            <span class="folder-count-badge">${group.tracks.length} track${group.tracks.length === 1 ? '' : 's'}</span>
          </div>
        </td>
      `;

      headerTr.addEventListener('click', (e) => {
        e.stopPropagation();
        if (state.collapsedGroups.has(groupId)) {
          state.collapsedGroups.delete(groupId);
        } else {
          state.collapsedGroups.add(groupId);
        }
        filterAndRenderTable();
      });

      fragment.appendChild(headerTr);

      // Render tracks belonging to this folder if not collapsed
      if (!isCollapsed) {
        group.tracks.forEach((track, idx) => {
          const tr = document.createElement('tr');
          tr.className = 'track-row';
          const isLoadedA = state.loadedDeckA && state.loadedDeckA.guid === track.guid;
          const isLoadedB = state.loadedDeckB && state.loadedDeckB.guid === track.guid;
          if (isLoadedA) tr.classList.add('is-loaded-a');
          if (isLoadedB) tr.classList.add('is-loaded-b');

          let deckBadgeHtml = '-';
          if (isLoadedA) deckBadgeHtml = '<span class="deck-loaded-badge deck-a">A</span>';
          else if (isLoadedB) deckBadgeHtml = '<span class="deck-loaded-badge deck-b">B</span>';

          const fmtBadge = track.isYouTube
            ? '<span class="fmt-badge yt">YouTube</span>'
            : '<span class="fmt-badge audio">Audio</span>';

          tr.innerHTML = `
            <td class="td-num">${idx + 1}</td>
            <td class="td-deck">${deckBadgeHtml}</td>
            <td class="td-art"><img src="${escapeHtml(track.artwork || '/icon-192.png')}" class="track-thumb" alt="" loading="lazy"></td>
            <td class="td-title" title="${escapeHtml(track.title)}">${escapeHtml(track.title)}</td>
            <td class="td-artist" title="${escapeHtml(track.podcastTitle)}">${escapeHtml(track.podcastTitle)}</td>
            <td class="td-bpm">${track.bpm ? track.bpm.toFixed(1) : '126.0'}</td>
            <td class="td-key">${escapeHtml(track.key || '8m')}</td>
            <td class="td-time">${formatDuration(track.duration)}</td>
            <td class="td-fmt">${fmtBadge}</td>
            <td class="td-actions">
              <div class="load-btn-group">
                <button type="button" class="btn-load btn-load-a" data-act="load-a">◄ LOAD A</button>
                <button type="button" class="btn-load btn-load-b" data-act="load-b">LOAD B ►</button>
              </div>
            </td>
          `;

          // Event Listeners for Load
          tr.querySelector('[data-act="load-a"]').addEventListener('click', (e) => {
            e.stopPropagation();
            loadTrackIntoDeck('A', track);
          });
          tr.querySelector('[data-act="load-b"]').addEventListener('click', (e) => {
            e.stopPropagation();
            loadTrackIntoDeck('B', track);
          });
          tr.addEventListener('dblclick', () => {
            loadTrackIntoDeck('A', track);
          });

          fragment.appendChild(tr);
        });
      }
    });

    tbody.innerHTML = '';
    tbody.appendChild(fragment);
  }

  function loadTrackIntoDeck(deckId, track) {
    mixer.loadTrack(deckId, track);

    if (deckId === 'A') state.loadedDeckA = track;
    if (deckId === 'B') state.loadedDeckB = track;

    // Update Deck Header Display
    const titleEl = document.getElementById(`deck-${deckId.toLowerCase()}-title`);
    const artistEl = document.getElementById(`deck-${deckId.toLowerCase()}-artist`);
    const keyEl = document.getElementById(`deck-${deckId.toLowerCase()}-key`);
    const bpmEl = document.getElementById(`deck-${deckId.toLowerCase()}-bpm`);

    if (titleEl) titleEl.textContent = track.title;
    if (artistEl) artistEl.textContent = `${track.isYouTube ? '🔴 ' : '🎙️ '}${track.podcastTitle || 'Traktor Pro'}`;
    if (keyEl) keyEl.textContent = track.key || '8m';
    if (bpmEl) bpmEl.textContent = (track.bpm || 128.00).toFixed(2);

    filterAndRenderTable();
  }

  // ─────────────────────────────────────────────────────────────────────────
  // DYNAMIC MULTI-BAND WAVEFORM RENDERING (TRAKTOR PRO RGB STYLE)
  // ─────────────────────────────────────────────────────────────────────────
  const waveCanvases = {
    A: document.getElementById('wave-canvas-a'),
    B: document.getElementById('wave-canvas-b')
  };
  const overviewCanvases = {
    A: document.getElementById('overview-canvas-a'),
    B: document.getElementById('overview-canvas-b')
  };

  function renderWaveformFrame(deckId, progress, isPlaying) {
    const canvas = waveCanvases[deckId];
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const w = (canvas.width = canvas.clientWidth);
    const h = (canvas.height = canvas.clientHeight);

    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#09090e';
    ctx.fillRect(0, 0, w, h);

    // Multi-band frequency visualizer
    const barWidth = 3;
    const barGap = 1;
    const totalBars = Math.floor(w / (barWidth + barGap));
    const centerY = h / 2;

    const deckColor = deckId === 'A' ? '#ff3b5c' : '#00d2ff';

    // Animated playhead phase
    const track = deckId === 'A' ? state.loadedDeckA : state.loadedDeckB;
    const seed = (track?.title || deckId).charCodeAt(0) || 42;

    for (let i = 0; i < totalBars; i++) {
      const x = i * (barWidth + barGap);
      const normX = x / w;
      
      // Calculate 3 frequency bands
      const waveLow = (Math.sin(i * 0.12 + seed) + Math.cos(i * 0.05) + 2) / 4;
      const waveMid = (Math.sin(i * 0.28 + seed * 2) + 1) / 2;
      const waveHigh = (Math.sin(i * 0.65 + seed * 3) + 1) / 2;

      const barHeightLow = Math.max(4, waveLow * (h * 0.88));
      const barHeightMid = Math.max(2, waveMid * (h * 0.55));
      const barHeightHigh = Math.max(2, waveHigh * (h * 0.3));

      const isPlayed = normX <= 0.5; // Waveform scrolls through center playhead

      // Multi-band RGB layer 1: Bass / Kick (Warm Orange/Red)
      ctx.fillStyle = isPlayed ? deckColor : 'rgba(255, 75, 75, 0.35)';
      ctx.fillRect(x, centerY - barHeightLow / 2, barWidth, barHeightLow);

      // Multi-band RGB layer 2: Midrange / Vocals (Green / Cyan)
      ctx.fillStyle = isPlayed ? '#22c55e' : 'rgba(34, 197, 94, 0.4)';
      ctx.fillRect(x, centerY - barHeightMid / 2, barWidth, barHeightMid);

      // Multi-band RGB layer 3: Highs / Hi-hats (Electric Blue / White)
      ctx.fillStyle = isPlayed ? '#ffffff' : 'rgba(255, 255, 255, 0.5)';
      ctx.fillRect(x, centerY - barHeightHigh / 2, barWidth, barHeightHigh);

      // Beatgrid vertical marker lines every 16 bars
      if (i % 16 === 0) {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.12)';
        ctx.fillRect(x, 0, 1, h);
      }
    }

    // Center Playhead Marker
    const needle = document.getElementById(`playhead-needle-${deckId.toLowerCase()}`);
    if (needle) needle.style.left = '50%';
  }

  function renderOverviewStripe(deckId, progress) {
    const canvas = overviewCanvases[deckId];
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const w = (canvas.width = canvas.clientWidth);
    const h = (canvas.height = canvas.clientHeight);

    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#0b0b12';
    ctx.fillRect(0, 0, w, h);

    const centerY = h / 2;
    const bars = Math.floor(w / 2);
    const deckColor = deckId === 'A' ? '#ff3b5c' : '#00d2ff';

    for (let i = 0; i < bars; i++) {
      const x = i * 2;
      const barProgress = x / w;
      const amp = (Math.sin(i * 0.15) + Math.cos(i * 0.08) + 2) / 4;
      const barH = Math.max(2, amp * (h - 4));

      ctx.fillStyle = barProgress <= progress ? deckColor : '#222232';
      ctx.fillRect(x, centerY - barH / 2, 1.5, barH);
    }

    // Playhead needle
    const playhead = document.getElementById(`overview-playhead-${deckId.toLowerCase()}`);
    if (playhead) {
      playhead.style.left = `${Math.min(100, Math.max(0, progress * 100))}%`;
    }
  }

  function updateCueMarkerFlags(deckId, cues, duration) {
    const container = document.getElementById(`cue-markers-${deckId.toLowerCase()}`);
    if (!container || !duration || duration <= 0) return;

    container.innerHTML = '';
    cues.forEach((time, idx) => {
      if (typeof time === 'number' && time >= 0) {
        const pct = (time / duration) * 100;
        const flag = document.createElement('div');
        flag.className = 'cue-flag';
        flag.style.left = `${pct}%`;
        flag.innerHTML = `<span class="cue-flag-label">${idx + 1}</span>`;
        container.appendChild(flag);
      }
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // TOUCH JOG PLATTER TURNTABLE RENDERER (60 FPS)
  // ─────────────────────────────────────────────────────────────────────────
  const jogState = {
    A: { rotation: 0, isScratching: false, isRimNudge: false, lastAngle: 0, lastTime: 0, velocity: 0 },
    B: { rotation: 0, isScratching: false, isRimNudge: false, lastAngle: 0, lastTime: 0, velocity: 0 }
  };

  function drawJogPlatter(deckId) {
    const canvas = document.getElementById(`jog-canvas-${deckId.toLowerCase()}`);
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;

    const targetW = Math.round(rect.width * dpr);
    const targetH = Math.round(rect.height * dpr);
    if (canvas.width !== targetW || canvas.height !== targetH) {
      canvas.width = targetW;
      canvas.height = targetH;
    }

    const w = canvas.width;
    const h = canvas.height;
    const cx = w / 2;
    const cy = h / 2;
    const r = Math.min(cx, cy) - 2 * dpr;

    ctx.clearRect(0, 0, w, h);

    // 1. Outer Chassis / Platter Rim (Brushed gunmetal)
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = '#14141d';
    ctx.fill();
    ctx.lineWidth = 1.5 * dpr;
    ctx.strokeStyle = '#28283a';
    ctx.stroke();

    // 2. Turntable Strobe Bezel Notches (40 notches around outer rim)
    const strobeCount = 40;
    const strobeRInner = r - 6 * dpr;
    const strobeROuter = r - 1.5 * dpr;
    for (let i = 0; i < strobeCount; i++) {
      const ang = (i / strobeCount) * Math.PI * 2;
      const x1 = cx + Math.cos(ang) * strobeRInner;
      const y1 = cy + Math.sin(ang) * strobeRInner;
      const x2 = cx + Math.cos(ang) * strobeROuter;
      const y2 = cy + Math.sin(ang) * strobeROuter;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.strokeStyle = i % 4 === 0 ? 'rgba(255, 255, 255, 0.45)' : 'rgba(255, 255, 255, 0.15)';
      ctx.lineWidth = 1.2 * dpr;
      ctx.stroke();
    }

    // 3. Dark Vinyl Body
    const vinylR = strobeRInner - 2 * dpr;
    ctx.beginPath();
    ctx.arc(cx, cy, vinylR, 0, Math.PI * 2);
    ctx.fillStyle = '#0a0a10';
    ctx.fill();

    // Concentric micro-groove rings
    const grooves = [0.88, 0.76, 0.64, 0.52];
    ctx.lineWidth = 1 * dpr;
    grooves.forEach((fraction, idx) => {
      ctx.beginPath();
      ctx.arc(cx, cy, vinylR * fraction, 0, Math.PI * 2);
      ctx.strokeStyle = idx % 2 === 0 ? 'rgba(255, 255, 255, 0.04)' : 'rgba(255, 255, 255, 0.02)';
      ctx.stroke();
    });

    // 4. Center Label Recess
    const centerRecessR = vinylR * 0.42;
    ctx.beginPath();
    ctx.arc(cx, cy, centerRecessR, 0, Math.PI * 2);
    ctx.fillStyle = '#161622';
    ctx.fill();
    ctx.strokeStyle = '#222232';
    ctx.stroke();

    // 5. Spinning Strobe / Needle Position Indicator
    const angle = jogState[deckId].rotation;
    const deckColor = deckId === 'A' ? '#ff3b5c' : '#00d2ff';
    const isScratching = jogState[deckId].isScratching;

    // Strobe Marker Line
    const innerPip = centerRecessR + 3 * dpr;
    const outerPip = vinylR - 2 * dpr;
    const px1 = cx + Math.cos(angle) * innerPip;
    const py1 = cy + Math.sin(angle) * innerPip;
    const px2 = cx + Math.cos(angle) * outerPip;
    const py2 = cy + Math.sin(angle) * outerPip;

    ctx.save();
    ctx.shadowColor = deckColor;
    ctx.shadowBlur = isScratching ? 12 * dpr : 6 * dpr;
    ctx.beginPath();
    ctx.moveTo(px1, py1);
    ctx.lineTo(px2, py2);
    ctx.lineWidth = (isScratching ? 3.5 : 2.5) * dpr;
    ctx.strokeStyle = deckColor;
    ctx.lineCap = 'round';
    ctx.stroke();

    // Outer Position Dot LED
    const dotX = cx + Math.cos(angle) * (outerPip - 2 * dpr);
    const dotY = cy + Math.sin(angle) * (outerPip - 2 * dpr);
    ctx.beginPath();
    ctx.arc(dotX, dotY, (isScratching ? 4 : 3) * dpr, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.restore();
  }

  let lastPlatterTime = performance.now();
  function platterRenderLoop(now) {
    const dt = Math.max(0.001, Math.min(0.1, (now - lastPlatterTime) / 1000));
    lastPlatterTime = now;

    ['A', 'B'].forEach((id) => {
      const js = jogState[id];
      if (mixer.isPlaying(id) && !js.isScratching) {
        const rate = mixer.decks[id]?.playbackRate || 1.0;
        // Standard 33 1/3 RPM = 0.5555 rev/sec = 3.49065 rad/sec
        js.rotation += dt * (33.333 / 60) * Math.PI * 2 * rate;
      }
      drawJogPlatter(id);
    });

    requestAnimationFrame(platterRenderLoop);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // TOUCH JOG PLATTER & VINYL SCRATCH INTERACTION CONTROLLERS
  // ─────────────────────────────────────────────────────────────────────────
  function initJogPlatters() {
    ['A', 'B'].forEach((id) => {
      const wrap = document.getElementById(`jog-wrap-${id.toLowerCase()}`);
      if (!wrap) return;

      const js = jogState[id];

      wrap.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        try { wrap.setPointerCapture(e.pointerId); } catch (_) {}
        const rect = wrap.getBoundingClientRect();
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;
        const dx = e.clientX - cx;
        const dy = e.clientY - cy;
        const dist = Math.hypot(dx, dy);
        const radius = rect.width / 2;

        const isVinyl = mixer.isVinylMode(id);
        const isRim = dist >= radius * 0.70;

        js.isScratching = isVinyl && !isRim;
        js.isRimNudge = isRim || !isVinyl;
        js.lastAngle = Math.atan2(dy, dx);
        js.lastTime = performance.now();
        js.velocity = 0;

        if (js.isScratching) {
          mixer.startScratch(id);
          wrap.classList.add('scratching');
          const waveWrap = document.getElementById(`waveform-wrap-${id.toLowerCase()}`);
          if (waveWrap) waveWrap.classList.add('scratching');
          const hud = document.getElementById(`scratch-hud-${id.toLowerCase()}`);
          if (hud) {
            hud.classList.remove('hidden');
            hud.textContent = 'SCRATCH 0.0x';
          }
        }
      });

      wrap.addEventListener('pointermove', (e) => {
        if (!wrap.hasPointerCapture(e.pointerId)) return;
        const rect = wrap.getBoundingClientRect();
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;
        const dx = e.clientX - cx;
        const dy = e.clientY - cy;
        const currentAngle = Math.atan2(dy, dx);
        const now = performance.now();
        const dt = Math.max(0.001, (now - js.lastTime) / 1000);

        let deltaAngle = currentAngle - js.lastAngle;
        while (deltaAngle > Math.PI) deltaAngle -= Math.PI * 2;
        while (deltaAngle < -Math.PI) deltaAngle += Math.PI * 2;

        js.lastAngle = currentAngle;
        js.lastTime = now;
        js.rotation += deltaAngle;

        // Standard 33 1/3 RPM: 1 full turn (2*PI rad) = 1.8 seconds of audio
        const deltaSec = (deltaAngle / (Math.PI * 2)) * 1.8;
        const rawVel = deltaSec / dt;
        js.velocity = js.velocity * 0.6 + rawVel * 0.4;

        if (js.isScratching) {
          mixer.scratch(id, deltaSec, js.velocity);
          const hud = document.getElementById(`scratch-hud-${id.toLowerCase()}`);
          if (hud) {
            const vSign = js.velocity >= 0 ? '+' : '';
            hud.textContent = `SCRATCH ${vSign}${js.velocity.toFixed(1)}x`;
          }
        } else if (js.isRimNudge) {
          // Jog Rim touch: manual beatmatching tempo bend
          mixer.scratch(id, deltaSec * 0.35, js.velocity * 0.35);
        }
      });

      const endHandler = (e) => {
        if (wrap.hasPointerCapture(e.pointerId)) {
          try { wrap.releasePointerCapture(e.pointerId); } catch (_) {}
        }
        if (js.isScratching) {
          mixer.endScratch(id);
          wrap.classList.remove('scratching');
          const waveWrap = document.getElementById(`waveform-wrap-${id.toLowerCase()}`);
          if (waveWrap) waveWrap.classList.remove('scratching');
          const hud = document.getElementById(`scratch-hud-${id.toLowerCase()}`);
          if (hud) hud.classList.add('hidden');
        }
        js.isScratching = false;
        js.isRimNudge = false;
        js.velocity = 0;
      };

      wrap.addEventListener('pointerup', endHandler);
      wrap.addEventListener('pointercancel', endHandler);
    });
  }

  function initWaveformScratch() {
    ['A', 'B'].forEach((id) => {
      const waveWrap = document.getElementById(`waveform-wrap-${id.toLowerCase()}`);
      if (!waveWrap) return;

      let isDragging = false;
      let startX = 0;
      let lastX = 0;
      let lastTime = 0;
      let totalDist = 0;
      let velocity = 0;

      waveWrap.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        try { waveWrap.setPointerCapture(e.pointerId); } catch (_) {}
        isDragging = true;
        startX = e.clientX;
        lastX = e.clientX;
        lastTime = performance.now();
        totalDist = 0;
        velocity = 0;

        if (mixer.isVinylMode(id)) {
          mixer.startScratch(id);
          waveWrap.classList.add('scratching');
          const jogWrap = document.getElementById(`jog-wrap-${id.toLowerCase()}`);
          if (jogWrap) jogWrap.classList.add('scratching');
          const hud = document.getElementById(`scratch-hud-${id.toLowerCase()}`);
          if (hud) {
            hud.classList.remove('hidden');
            hud.textContent = 'SCRATCH 0.0x';
          }
        }
      });

      waveWrap.addEventListener('pointermove', (e) => {
        if (!isDragging) return;
        const now = performance.now();
        const dt = Math.max(0.001, (now - lastTime) / 1000);
        const dx = e.clientX - lastX;
        totalDist += Math.abs(dx);
        lastX = e.clientX;
        lastTime = now;

        const rect = waveWrap.getBoundingClientRect();
        // Moving waveform right pulls earlier audio backward; moving left pulls future audio forward
        const visibleSec = 6.0;
        const deltaSec = -(dx / (rect.width || 300)) * visibleSec;
        const rawVel = deltaSec / dt;
        velocity = velocity * 0.5 + rawVel * 0.5;

        // Platter rotation synchronizes with waveform scrubbing
        jogState[id].rotation += (deltaSec / 1.8) * Math.PI * 2;

        if (mixer.isVinylMode(id)) {
          mixer.scratch(id, deltaSec, velocity);
          const hud = document.getElementById(`scratch-hud-${id.toLowerCase()}`);
          if (hud) {
            const vSign = velocity >= 0 ? '+' : '';
            hud.textContent = `SCRATCH ${vSign}${velocity.toFixed(1)}x`;
          }
        }
      });

      const endHandler = (e) => {
        if (!isDragging) return;
        if (waveWrap.hasPointerCapture(e.pointerId)) {
          try { waveWrap.releasePointerCapture(e.pointerId); } catch (_) {}
        }
        isDragging = false;

        // If pointer traveled less than 5px, handle as normal click-to-seek
        if (totalDist < 5) {
          const rect = waveWrap.getBoundingClientRect();
          const pos = (e.clientX - rect.left) / rect.width;
          const dur = mixer.getDuration(id);
          if (dur > 0) mixer.seek(id, pos * dur);
        }

        if (mixer.isVinylMode(id)) {
          mixer.endScratch(id);
          waveWrap.classList.remove('scratching');
          const jogWrap = document.getElementById(`jog-wrap-${id.toLowerCase()}`);
          if (jogWrap) jogWrap.classList.remove('scratching');
          const hud = document.getElementById(`scratch-hud-${id.toLowerCase()}`);
          if (hud) hud.classList.add('hidden');
        }
      };

      waveWrap.addEventListener('pointerup', endHandler);
      waveWrap.addEventListener('pointercancel', endHandler);
    });
  }

  function initVinylModeControls() {
    ['A', 'B'].forEach((id) => {
      const btn = document.getElementById(`btn-vinyl-${id.toLowerCase()}`);
      const modeTag = document.getElementById(`jog-mode-tag-${id.toLowerCase()}`);

      const updateUI = (isActive) => {
        if (btn) btn.classList.toggle('active', !!isActive);
        if (modeTag) modeTag.textContent = isActive ? 'VINYL' : 'BEND';
      };

      updateUI(mixer.isVinylMode(id));

      if (btn) {
        btn.addEventListener('click', () => {
          const next = !mixer.isVinylMode(id);
          mixer.setVinylMode(id, next);
          updateUI(next);
        });
      }

      mixer.on('vinylMode', (data) => {
        if (data.deck === id) updateUI(data.active);
      });
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // REALISTIC HARDWARE ROTARY KNOBS INTERACTION
  // ─────────────────────────────────────────────────────────────────────────
  function initRotaryKnobs() {
    document.querySelectorAll('.knob-wrap').forEach((wrap) => {
      const min = parseFloat(wrap.dataset.min ?? -24);
      const max = parseFloat(wrap.dataset.max ?? 12);
      const def = parseFloat(wrap.dataset.default ?? 0);
      const knobName = wrap.dataset.knob || '';
      let currentVal = def;

      const dial = wrap.querySelector('.knob-dial');

      function updateKnobDisplay(val) {
        currentVal = Math.max(min, Math.min(max, val));
        const norm = (currentVal - min) / (max - min); // 0.0 to 1.0
        const angle = -135 + norm * 270; // -135deg to +135deg
        if (dial) dial.style.transform = `rotate(${angle}deg)`;
      }

      updateKnobDisplay(def);

      // Pointer drag interaction (vertical & horizontal movement)
      let startY = 0;
      let startVal = def;
      let isDragging = false;

      wrap.addEventListener('pointerdown', (e) => {
        isDragging = true;
        startY = e.clientY;
        startVal = currentVal;
        wrap.setPointerCapture(e.pointerId);
      });

      wrap.addEventListener('pointermove', (e) => {
        if (!isDragging) return;
        const deltaY = startY - e.clientY; // drag up = positive
        const sensitivity = (max - min) / 120; // 120px drag across full range
        const newVal = startVal + deltaY * sensitivity;
        updateKnobDisplay(newVal);
        dispatchKnobChange(knobName, currentVal);
      });

      const endDrag = (e) => {
        if (isDragging) {
          isDragging = false;
          try { wrap.releasePointerCapture(e.pointerId); } catch (_) {}
        }
      };
      wrap.addEventListener('pointerup', endDrag);
      wrap.addEventListener('pointercancel', endDrag);

      // Double-click resets to default (center detent)
      wrap.addEventListener('dblclick', () => {
        updateKnobDisplay(def);
        dispatchKnobChange(knobName, def);
      });
    });
  }

  function dispatchKnobChange(name, val) {
    if (name.startsWith('gain-')) {
      const deck = name.split('-')[1];
      mixer.setGain(deck, val);
    } else if (name.startsWith('eq-')) {
      const parts = name.split('-'); // eq, hi/mid/low, A/B
      const band = parts[1] === 'hi' ? 'high' : parts[1];
      const deck = parts[2];
      mixer.setEQ(deck, band, val);
    } else if (name.startsWith('filter-')) {
      const deck = name.split('-')[1];
      mixer.setFilter(deck, val / 100); // normalize -100..100 to -1..1
    } else if (name === 'master-vol') {
      mixer.setMasterVolume(val / 100);
    } else if (name === 'cue-mix') {
      mixer.setCueMix(val / 100);
    } else if (name === 'cue-vol') {
      mixer.setCueVolume(val / 100);
    } else if (name === 'fx1-drywet') {
      mixer.setFXDryWet('1', val);
    } else if (name === 'fx2-drywet') {
      mixer.setFXDryWet('2', val);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // CHANNEL FADERS, CROSSFADER & PITCH CONTROLS
  // ─────────────────────────────────────────────────────────────────────────
  function initMixerControls() {
    // Channel Volume Faders
    const volA = document.getElementById('vol-fader-a');
    const volB = document.getElementById('vol-fader-b');
    if (volA) volA.addEventListener('input', (e) => mixer.setVolume('A', parseFloat(e.target.value)));
    if (volB) volB.addEventListener('input', (e) => mixer.setVolume('B', parseFloat(e.target.value)));

    // Crossfader
    const xfader = document.getElementById('crossfader');
    if (xfader) xfader.addEventListener('input', (e) => mixer.setCrossfader(parseFloat(e.target.value)));

    // Pitch Faders & Momentary Nudge Buttons
    ['A', 'B'].forEach((id) => {
      const slider = document.getElementById(`pitch-slider-${id.toLowerCase()}`);
      const pctEl = document.getElementById(`pitch-pct-${id.toLowerCase()}`);
      const btnDown = document.getElementById(`pitch-${id.toLowerCase()}-down`);
      const btnUp = document.getElementById(`pitch-${id.toLowerCase()}-up`);

      const applyRate = (rate) => {
        state.deckPitch[id] = rate;
        mixer.setPlaybackRate(id, rate);
        if (pctEl && !mixer.decks[id]?.isNudging) {
          const pct = ((rate - 1.0) * 100).toFixed(2);
          pctEl.textContent = `${pct >= 0 ? '+' : ''}${pct}%`;
        }
        if (slider) slider.value = rate;
      };

      if (slider) {
        slider.addEventListener('input', (e) => applyRate(parseFloat(e.target.value)));
      }

      // Momentary Tempo Nudge (-5% while held, restores on release)
      if (btnDown) {
        const startDown = (e) => {
          e.preventDefault();
          mixer.nudge(id, -1);
        };
        const endDown = () => {
          mixer.releaseNudge(id);
        };
        btnDown.addEventListener('pointerdown', startDown);
        btnDown.addEventListener('pointerup', endDown);
        btnDown.addEventListener('pointercancel', endDown);
        btnDown.addEventListener('pointerleave', endDown);
      }

      // Momentary Tempo Nudge (+5% while held, restores on release)
      if (btnUp) {
        const startUp = (e) => {
          e.preventDefault();
          mixer.nudge(id, +1);
        };
        const endUp = () => {
          mixer.releaseNudge(id);
        };
        btnUp.addEventListener('pointerdown', startUp);
        btnUp.addEventListener('pointerup', endUp);
        btnUp.addEventListener('pointercancel', endUp);
        btnUp.addEventListener('pointerleave', endUp);
      }
    });

    // PFL Cue Buttons
    ['A', 'B'].forEach((id) => {
      const btn = document.getElementById(`pfl-${id.toLowerCase()}`);
      if (btn) {
        btn.addEventListener('click', () => {
          mixer.setPFL(id, !mixer.pflEnabled[id]);
        });
      }
    });

    // Cue Monitoring Mode Selector
    const btnCueMode = document.getElementById('btn-cue-mode');
    if (btnCueMode) {
      btnCueMode.addEventListener('click', () => {
        const nextMode = mixer.cycleCueMode();
        updateCueModeUI(nextMode);
      });
    }
  }

  function updateCueModeUI(mode) {
    const btnCueMode = document.getElementById('btn-cue-mode');
    const cueModeLabel = document.getElementById('cue-mode-label');
    if (!btnCueMode || !cueModeLabel) return;

    btnCueMode.classList.remove('split', 'multichannel');
    if (mode === 'split') {
      cueModeLabel.textContent = 'SPLIT';
      btnCueMode.classList.add('split');
      btnCueMode.title = 'Split Cable Active: Left Ear = Headphone Cue (PFL), Right Ear = Master Speakers';
    } else if (mode === 'multichannel') {
      cueModeLabel.textContent = '4-CH';
      btnCueMode.classList.add('multichannel');
      btnCueMode.title = 'Multi-channel Audio Active: Ch 1-2 = Master, Ch 3-4 = Headphones';
    } else {
      cueModeLabel.textContent = 'STEREO';
      btnCueMode.title = 'Stereo Mode: Click to switch to Split Cable mode';
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // AUDIO FX PROCESSORS (FX 1 & FX 2)
  // ─────────────────────────────────────────────────────────────────────────
  function initFXControls() {
    // FX Unit 1 (Deck A)
    const btnFx1On = document.getElementById('btn-fx1-on');
    const btnFx1Delay = document.getElementById('btn-fx1-delay');
    const btnFx1Reverb = document.getElementById('btn-fx1-reverb');

    if (btnFx1On) {
      btnFx1On.addEventListener('click', () => {
        const isActive = !btnFx1On.classList.contains('active');
        btnFx1On.classList.toggle('active', isActive);
        mixer.setFXEnabled('1', isActive);
      });
    }

    if (btnFx1Delay) {
      const dlySubdivisions = ['1/2', '3/4', '1'];
      let dlySubIndex = 1; // Default '3/4'

      const updateDelayLabel = () => {
        const sub = dlySubdivisions[dlySubIndex];
        btnFx1Delay.title = `Delay FX (${sub} beat) - Click: toggle, Right-click: cycle division`;
        btnFx1Delay.textContent = `DLY ${sub}`;
        mixer.setFXParam('1', 'delay', 'subdivision', sub);
      };

      let pressTimer = null;
      let isLongPress = false;

      btnFx1Delay.addEventListener('pointerdown', () => {
        isLongPress = false;
        pressTimer = setTimeout(() => {
          isLongPress = true;
          dlySubIndex = (dlySubIndex + 1) % dlySubdivisions.length;
          updateDelayLabel();
        }, 500);
      });

      btnFx1Delay.addEventListener('pointerup', (e) => {
        clearTimeout(pressTimer);
        if (isLongPress) return;
        if (e.shiftKey || e.altKey) {
          dlySubIndex = (dlySubIndex + 1) % dlySubdivisions.length;
          updateDelayLabel();
          return;
        }
        const isActive = !btnFx1Delay.classList.contains('active');
        btnFx1Delay.classList.toggle('active', isActive);
        mixer.setFXEffect('1', 'delay', isActive);
      });

      btnFx1Delay.addEventListener('pointercancel', () => clearTimeout(pressTimer));

      btnFx1Delay.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        dlySubIndex = (dlySubIndex + 1) % dlySubdivisions.length;
        updateDelayLabel();
      });

      updateDelayLabel();
    }

    if (btnFx1Reverb) {
      btnFx1Reverb.addEventListener('click', () => {
        const isActive = !btnFx1Reverb.classList.contains('active');
        btnFx1Reverb.classList.toggle('active', isActive);
        mixer.setFXEffect('1', 'reverb', isActive);
      });
    }

    // FX Unit 2 (Deck B)
    const btnFx2On = document.getElementById('btn-fx2-on');
    const btnFx2Filter = document.getElementById('btn-fx2-filter');
    const btnFx2Gater = document.getElementById('btn-fx2-gater');

    if (btnFx2On) {
      btnFx2On.addEventListener('click', () => {
        const isActive = !btnFx2On.classList.contains('active');
        btnFx2On.classList.toggle('active', isActive);
        mixer.setFXEnabled('2', isActive);
      });
    }

    if (btnFx2Filter) {
      btnFx2Filter.addEventListener('click', () => {
        const isActive = !btnFx2Filter.classList.contains('active');
        btnFx2Filter.classList.toggle('active', isActive);
        mixer.setFXEffect('2', 'filter', isActive);
      });
    }

    if (btnFx2Gater) {
      const gaterRates = ['1/8', '1/16'];
      let gaterRateIndex = 0; // Default '1/8'

      const updateGaterLabel = () => {
        const rate = gaterRates[gaterRateIndex];
        btnFx2Gater.title = `Gater FX (${rate} note) - Click: toggle, Right-click: cycle rate`;
        btnFx2Gater.textContent = `GATE ${rate}`;
        mixer.setFXParam('2', 'gater', 'rate', rate);
      };

      let pressTimer = null;
      let isLongPress = false;

      btnFx2Gater.addEventListener('pointerdown', () => {
        isLongPress = false;
        pressTimer = setTimeout(() => {
          isLongPress = true;
          gaterRateIndex = (gaterRateIndex + 1) % gaterRates.length;
          updateGaterLabel();
        }, 500);
      });

      btnFx2Gater.addEventListener('pointerup', (e) => {
        clearTimeout(pressTimer);
        if (isLongPress) return;
        if (e.shiftKey || e.altKey) {
          gaterRateIndex = (gaterRateIndex + 1) % gaterRates.length;
          updateGaterLabel();
          return;
        }
        const isActive = !btnFx2Gater.classList.contains('active');
        btnFx2Gater.classList.toggle('active', isActive);
        mixer.setFXEffect('2', 'gater', isActive);
      });

      btnFx2Gater.addEventListener('pointercancel', () => clearTimeout(pressTimer));

      btnFx2Gater.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        gaterRateIndex = (gaterRateIndex + 1) % gaterRates.length;
        updateGaterLabel();
      });

      updateGaterLabel();
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // TRANSPORT, CUES & LOOPS WIRING
  // ─────────────────────────────────────────────────────────────────────────
  function initTransportAndCues() {
    ['A', 'B'].forEach((id) => {
      const btnPlay = document.getElementById(`btn-play-${id.toLowerCase()}`);
      const btnCue = document.getElementById(`btn-cue-${id.toLowerCase()}`);
      const btnCup = document.getElementById(`btn-cup-${id.toLowerCase()}`);

      if (btnPlay) {
        btnPlay.addEventListener('click', () => mixer.toggle(id));
      }
      if (btnCue) {
        btnCue.addEventListener('pointerdown', () => {
          mixer.pause(id);
          mixer.triggerHotCue(id, 0);
        });
      }
      if (btnCup) {
        btnCup.addEventListener('click', () => {
          mixer.triggerHotCue(id, 0);
          mixer.play(id);
        });
      }

      // Hot Cue Pads 1 - 4
      for (let c = 0; c < 4; c++) {
        const pad = document.getElementById(`cue-${id.toLowerCase()}-${c}`);
        if (!pad) continue;

        let holdTimer = null;
        let isHold = false;

        pad.addEventListener('pointerdown', () => {
          isHold = false;
          holdTimer = setTimeout(() => {
            isHold = true;
            mixer.clearHotCue(id, c);
          }, 700);
        });

        pad.addEventListener('pointerup', () => {
          clearTimeout(holdTimer);
          if (isHold) return;
          const cues = mixer.decks[id].cues;
          if (typeof cues[c] === 'number') {
            mixer.triggerHotCue(id, c);
          } else {
            mixer.setHotCue(id, c);
          }
        });

        pad.addEventListener('pointercancel', () => clearTimeout(holdTimer));
      }

      // Deck Sync & Master Buttons
      const btnSyncDeck = document.getElementById(`btn-sync-${id.toLowerCase()}`);
      const btnMasterDeck = document.getElementById(`btn-master-${id.toLowerCase()}`);

      if (btnSyncDeck) {
        btnSyncDeck.addEventListener('click', () => {
          mixer.setDeckSync(id, !mixer.deckSync[id]);
        });
      }
      if (btnMasterDeck) {
        btnMasterDeck.addEventListener('click', () => {
          mixer.setMasterDeck(id);
        });
      }

      // Loop Controls
      const loopActive = document.getElementById(`loop-${id.toLowerCase()}-active`);
      const loopHalf = document.getElementById(`loop-${id.toLowerCase()}-half`);
      const loopDouble = document.getElementById(`loop-${id.toLowerCase()}-double`);

      if (loopActive) {
        loopActive.addEventListener('click', () => mixer.toggleLoop(id));
      }
      if (loopHalf) {
        loopHalf.addEventListener('click', () => mixer.halfLoop(id));
      }
      if (loopDouble) {
        loopDouble.addEventListener('click', () => mixer.doubleLoop(id));
      }

      // Overview stripe click to jump across full track
      const overviewWrap = document.getElementById(`overview-wrap-${id.toLowerCase()}`);
      if (overviewWrap) {
        overviewWrap.addEventListener('click', (e) => {
          const rect = overviewWrap.getBoundingClientRect();
          const pos = (e.clientX - rect.left) / rect.width;
          const dur = mixer.getDuration(id);
          if (dur > 0) mixer.seek(id, pos * dur);
        });
      }

      // Re-analyze BPM/Key on badge click
      const bpmBadge = document.getElementById(`deck-${id.toLowerCase()}-bpm`);
      const keyBadge = document.getElementById(`deck-${id.toLowerCase()}-key`);
      const triggerReanalysis = () => {
        const meta = mixer.decks[id]?.meta;
        if (meta) {
          mixer.analyzeTrack(meta, id, true);
        }
      };
      if (bpmBadge) bpmBadge.addEventListener('click', triggerReanalysis);
      if (keyBadge) keyBadge.addEventListener('click', triggerReanalysis);
    });

    // Master BPM TAP Tempo
    const btnTap = document.getElementById('btn-bpm-tap');
    const masterBpmVal = document.getElementById('master-bpm-val');
    if (btnTap) {
      btnTap.addEventListener('click', () => {
        const now = Date.now();
        state.tapTimes.push(now);
        if (state.tapTimes.length > 5) state.tapTimes.shift();
        if (state.tapTimes.length >= 2) {
          const diffs = [];
          for (let i = 1; i < state.tapTimes.length; i++) {
            diffs.push(state.tapTimes[i] - state.tapTimes[i - 1]);
          }
          const avgMs = diffs.reduce((a, b) => a + b, 0) / diffs.length;
          const bpm = Math.round(60000 / avgMs);
          if (bpm >= 60 && bpm <= 190) {
            state.masterBpm = bpm;
            mixer.setBpm(bpm);
            if (masterBpmVal) masterBpmVal.textContent = bpm.toFixed(2);
          }
        }
      });
    }

    // Master SNAP and QUANT buttons
    const btnSnap = document.getElementById('btn-snap');
    const btnQuant = document.getElementById('btn-quant');

    if (btnSnap) {
      btnSnap.classList.toggle('active', !!mixer.snapEnabled);
      btnSnap.addEventListener('click', () => {
        mixer.setSnapEnabled(!mixer.snapEnabled);
      });
    }

    if (btnQuant) {
      btnQuant.classList.toggle('active', !!mixer.quantEnabled);
      btnQuant.addEventListener('click', () => {
        mixer.setQuantEnabled(!mixer.quantEnabled);
      });
    }

    // Master SYNC button
    const btnSync = document.getElementById('btn-master-sync');
    if (btnSync) {
      btnSync.addEventListener('click', () => {
        const willSync = !btnSync.classList.contains('active');
        btnSync.classList.toggle('active', willSync);
        mixer.setDeckSync('A', willSync);
        mixer.setDeckSync('B', willSync);
      });
    }

    // Fullscreen Toggle
    const btnFs = document.getElementById('btn-fullscreen');
    if (btnFs) {
      btnFs.addEventListener('click', () => {
        if (!document.fullscreenElement) {
          document.documentElement.requestFullscreen().catch(() => {});
        } else {
          document.exitFullscreen().catch(() => {});
        }
      });
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // MIXER ENGINE EVENT LISTENERS
  // ─────────────────────────────────────────────────────────────────────────
  function initMixerEngineEvents() {
    mixer.on('time', ({ deck, currentTime, duration }) => {
      const curEl = document.getElementById(`deck-${deck.toLowerCase()}-cur`);
      const remEl = document.getElementById(`deck-${deck.toLowerCase()}-rem`);
      if (curEl) curEl.textContent = formatTime(currentTime);
      if (remEl && duration > 0) remEl.textContent = `-${formatTime(Math.max(0, duration - currentTime))}`;

      const prog = duration > 0 ? (currentTime / duration) : 0;
      renderWaveformFrame(deck, prog, mixer.isPlaying(deck));
      renderOverviewStripe(deck, prog);
    });

    mixer.on('state', ({ deck, playing }) => {
      const btn = document.getElementById(`btn-play-${deck.toLowerCase()}`);
      if (btn) {
        btn.classList.toggle('playing', !!playing);
        btn.textContent = playing ? '❚❚' : '▶';
      }
    });

    mixer.on('cues', ({ deck, cues }) => {
      cues.forEach((time, idx) => {
        const pad = document.getElementById(`cue-${deck.toLowerCase()}-${idx}`);
        if (pad) {
          const isSet = typeof time === 'number' && time >= 0;
          pad.classList.toggle('active', isSet);
        }
      });
      const dur = mixer.getDuration(deck);
      updateCueMarkerFlags(deck, cues, dur);
    });

    mixer.on('levels', ({ A, B, master }) => {
      updateMeterLeds('vu-meter-a', A);
      updateMeterLeds('vu-meter-b', B);
      updateMeterLeds('master-meter-l', master * 0.95);
      updateMeterLeds('master-meter-r', master * 1.05);
    });

    mixer.on('loop', ({ deck, active, beats }) => {
      const loopActive = document.getElementById(`loop-${deck.toLowerCase()}-active`);
      if (loopActive) {
        loopActive.classList.toggle('active', !!active);
        let label = `LOOP ${beats}`;
        if (beats === 0.5) label = 'LOOP ½';
        else if (beats === 0.25) label = 'LOOP ¼';
        else if (beats === 0.125) label = 'LOOP ⅛';
        loopActive.textContent = label;
      }
    });

    mixer.on('masterDeck', ({ masterDeckId }) => {
      const btnMasterA = document.getElementById('btn-master-a');
      const btnMasterB = document.getElementById('btn-master-b');
      if (btnMasterA) btnMasterA.classList.toggle('active', masterDeckId === 'A');
      if (btnMasterB) btnMasterB.classList.toggle('active', masterDeckId === 'B');
    });

    mixer.on('sync', ({ deck, sync }) => {
      const btn = document.getElementById(`btn-sync-${deck.toLowerCase()}`);
      if (btn) btn.classList.toggle('active', !!sync);
    });

    mixer.on('snap', ({ snap }) => {
      const btn = document.getElementById('btn-snap');
      if (btn) btn.classList.toggle('active', !!snap);
    });

    mixer.on('quant', ({ quant }) => {
      const btn = document.getElementById('btn-quant');
      if (btn) btn.classList.toggle('active', !!quant);
    });

    mixer.on('rate', ({ deck, rate, bpm }) => {
      state.deckPitch[deck] = rate;
      const slider = document.getElementById(`pitch-slider-${deck.toLowerCase()}`);
      const pctEl = document.getElementById(`pitch-pct-${deck.toLowerCase()}`);
      const bpmEl = document.getElementById(`deck-${deck.toLowerCase()}-bpm`);

      if (slider && Math.abs(parseFloat(slider.value) - rate) > 0.001) {
        slider.value = rate;
      }
      if (pctEl && !mixer.decks[deck]?.isNudging) {
        const pct = ((rate - 1.0) * 100).toFixed(2);
        pctEl.textContent = `${pct >= 0 ? '+' : ''}${pct}%`;
      }
      if (bpmEl && bpm) {
        bpmEl.textContent = bpm.toFixed(2);
      }
    });

    mixer.on('nudge', ({ deck, nudging, direction, rate }) => {
      const btnDown = document.getElementById(`pitch-${deck.toLowerCase()}-down`);
      const btnUp = document.getElementById(`pitch-${deck.toLowerCase()}-up`);
      const pctEl = document.getElementById(`pitch-pct-${deck.toLowerCase()}`);

      if (nudging) {
        if (direction < 0 && btnDown) btnDown.classList.add('nudging');
        if (direction > 0 && btnUp) btnUp.classList.add('nudging');
        if (pctEl) {
          pctEl.classList.add('nudging');
          pctEl.textContent = direction > 0 ? '+5.0% NUDGE' : '-5.0% NUDGE';
        }
      } else {
        if (btnDown) btnDown.classList.remove('nudging');
        if (btnUp) btnUp.classList.remove('nudging');
        if (pctEl) {
          pctEl.classList.remove('nudging');
          const pct = ((rate - 1.0) * 100).toFixed(2);
          pctEl.textContent = `${pct >= 0 ? '+' : ''}${pct}%`;
        }
      }
    });

    mixer.on('scratch', ({ deck, scratching, velocity }) => {
      const jogWrap = document.getElementById(`jog-wrap-${deck.toLowerCase()}`);
      const waveWrap = document.getElementById(`waveform-wrap-${deck.toLowerCase()}`);
      const hud = document.getElementById(`scratch-hud-${deck.toLowerCase()}`);

      if (jogWrap) jogWrap.classList.toggle('scratching', !!scratching);
      if (waveWrap) waveWrap.classList.toggle('scratching', !!scratching);
      if (hud) {
        hud.classList.toggle('hidden', !scratching);
        if (scratching && typeof velocity === 'number') {
          const vSign = velocity >= 0 ? '+' : '';
          hud.textContent = `SCRATCH ${vSign}${velocity.toFixed(1)}x`;
        }
      }
    });

    mixer.on('pfl', ({ deck, active }) => {
      const btn = document.getElementById(`pfl-${deck.toLowerCase()}`);
      if (btn) btn.classList.toggle('active', !!active);
    });

    mixer.on('cueRouting', ({ mode }) => {
      updateCueModeUI(mode);
    });

    mixer.on('analyzing', ({ deckId }) => {
      if (!deckId) return;
      const bpmEl = document.getElementById(`deck-${deckId.toLowerCase()}-bpm`);
      const keyEl = document.getElementById(`deck-${deckId.toLowerCase()}-key`);
      if (bpmEl) {
        bpmEl.classList.add('analyzing');
        bpmEl.textContent = '...';
        bpmEl.title = 'Detecting track BPM & beatgrid...';
      }
      if (keyEl) {
        keyEl.classList.add('analyzing');
        keyEl.textContent = '...';
        keyEl.title = 'Detecting musical key...';
      }
    });

    mixer.on('analyzed', ({ deckId, trackKey, bpm, key, camelot, openKey, confidence }) => {
      if (deckId) {
        const bpmEl = document.getElementById(`deck-${deckId.toLowerCase()}-bpm`);
        const keyEl = document.getElementById(`deck-${deckId.toLowerCase()}-key`);
        const rate = mixer.decks[deckId]?.playbackRate || 1.0;

        if (bpmEl) {
          bpmEl.classList.remove('analyzing');
          bpmEl.textContent = (bpm * rate).toFixed(2);
          bpmEl.title = `Auto-Detected: ${bpm.toFixed(1)} BPM (${confidence}% confidence) - Click to re-analyze`;
        }
        if (keyEl) {
          keyEl.classList.remove('analyzing');
          keyEl.textContent = `${camelot} / ${key}`;
          keyEl.title = `Auto-Detected Key: ${key} (${camelot} / ${openKey || 'OpenKey'}) - ${confidence}% confidence - Click to re-analyze`;
        }
      }

      // Update matching track entries in collection
      let needsRerender = false;
      state.allTracks.forEach(t => {
        const match = (t.audioUrl && t.audioUrl === trackKey) ||
                      (t.guid && t.guid === trackKey) ||
                      (t.videoId && t.videoId === trackKey) ||
                      (t.title && t.title === trackKey);
        if (match) {
          t.bpm = bpm;
          t.key = camelot;
          t.camelot = camelot;
          t.musicalKey = key;
          needsRerender = true;
        }
      });
      if (needsRerender) {
        filterAndRenderTable();
      }
    });
  }

  function updateMeterLeds(containerId, level) {
    const cont = document.getElementById(containerId);
    if (!cont) return;
    const leds = cont.querySelectorAll('.meter-led, .vu-segment');
    const litCount = Math.round(level * leds.length * 1.6);
    leds.forEach((led, idx) => {
      led.classList.toggle('lit', idx < litCount);
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // SEARCH & TREE NAVIGATION
  // ─────────────────────────────────────────────────────────────────────────
  function initSearchAndSidebar() {
    // Tree Navigation
    document.querySelectorAll('.tree-item').forEach((item) => {
      item.addEventListener('click', () => {
        document.querySelectorAll('.tree-item').forEach(i => i.classList.remove('active'));
        item.classList.add('active');
        state.activeFilter = item.dataset.filter || 'all';
        filterAndRenderTable();

        if (state.activeFilter === 'youtube') {
          const ytCount = state.allTracks.filter(t => t.isYouTube).length;
          if (ytCount === 0) {
            syncMissingFeeds();
          }
        }
      });
    });

    // Search Bar
    const searchInput = document.getElementById('browser-search-input');
    const clearBtn = document.getElementById('btn-clear-search');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        state.searchQuery = e.target.value.trim();
        if (clearBtn) clearBtn.classList.toggle('hidden', !state.searchQuery);
        filterAndRenderTable();
      });
    }
    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        if (searchInput) searchInput.value = '';
        state.searchQuery = '';
        clearBtn.classList.add('hidden');
        filterAndRenderTable();
      });
    }

    // Toggle All Folders Button
    const btnToggleFolders = document.getElementById('btn-toggle-folders');
    if (btnToggleFolders) {
      btnToggleFolders.addEventListener('click', () => {
        const groupHeaders = document.querySelectorAll('.folder-header-row');
        const ids = Array.from(groupHeaders).map(h => h.dataset.groupId).filter(Boolean);
        const isAllCollapsed = ids.length > 0 && ids.every(id => state.collapsedGroups.has(id));
        if (isAllCollapsed) {
          state.collapsedGroups.clear();
        } else {
          ids.forEach(id => state.collapsedGroups.add(id));
        }
        filterAndRenderTable();
      });
    }

    // Quick Add Form (YouTube Playlist or RSS Feed)
    const addForm = document.getElementById('form-quick-add');
    const addInput = document.getElementById('input-add-url');
    if (addForm && addInput) {
      addForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const url = addInput.value.trim();
        if (!url) return;
        addInput.value = '';
        addInput.placeholder = 'Fetching feed...';

        try {
          const res = await fetch(`/api/feed?url=${encodeURIComponent(url)}`);
          if (res.ok) {
            const feedData = await res.json();
            if (feedData.episodes && feedData.episodes.length > 0) {
              const isYt = !!(feedData.isYouTube || feedData.isYouTubePlaylist || url.includes('youtube.com') || url.includes('youtu.be') || url.includes('list='));

              // Add feed to local storage
              const curFeeds = JSON.parse(localStorage.getItem('anypod_feeds') || '[]');
              if (!curFeeds.includes(url)) {
                curFeeds.unshift(url);
                localStorage.setItem('anypod_feeds', JSON.stringify(curFeeds));
              }
              // Save metadata
              const curMeta = JSON.parse(localStorage.getItem('anypod_cached_metadata') || '{}');
              curMeta[url] = {
                title: feedData.title || (isYt ? 'YouTube Playlist' : 'Podcast'),
                artwork: feedData.artwork || '/icon-192.png',
                episodesCount: feedData.episodes.length,
                isYouTube: isYt,
                isYouTubePlaylist: isYt
              };
              localStorage.setItem('anypod_cached_metadata', JSON.stringify(curMeta));

              // Cache new episodes into anypod_cached_episodes
              const existingCached = JSON.parse(localStorage.getItem('anypod_cached_episodes') || '[]');
              const newEpisodes = feedData.episodes.map(ep => ({
                ...ep,
                feedUrl: url,
                isYouTube: isYt,
                podcastTitle: feedData.title || ep.podcastTitle || (isYt ? 'YouTube' : 'Podcast'),
                artwork: ep.artwork || feedData.artwork || '/icon-192.png'
              }));
              const merged = [...newEpisodes, ...existingCached].slice(0, 1500);
              localStorage.setItem('anypod_cached_episodes', JSON.stringify(merged));

              // If YouTube, automatically switch to youtube view
              if (isYt) {
                state.activeFilter = 'youtube';
                document.querySelectorAll('.tree-item').forEach(i => i.classList.toggle('active', i.dataset.filter === 'youtube'));
              }

              // Rehydrate
              await hydrateCollection(false);
            }
          }
        } catch (_) {}

        addInput.placeholder = 'Paste YouTube playlist or RSS URL...';
      });
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // KEYBOARD SHORTCUTS
  // ─────────────────────────────────────────────────────────────────────────
  function initKeyboardShortcuts() {
    window.addEventListener('keydown', (e) => {
      const tag = document.activeElement ? document.activeElement.tagName.toLowerCase() : '';
      if (tag === 'input' || tag === 'textarea' || document.activeElement?.isContentEditable) {
        return;
      }

      const key = e.key.toUpperCase();

      // Global: Space = toggle playback
      if (e.code === 'Space') {
        e.preventDefault();
        if (mixer.isPlaying('B') && !mixer.isPlaying('A')) {
          mixer.toggle('B');
        } else {
          mixer.toggle('A');
        }
        return;
      }

      // Global: ArrowLeft / ArrowRight = Crossfader nudging
      if (e.code === 'ArrowLeft') {
        e.preventDefault();
        const xf = document.getElementById('crossfader');
        if (xf) {
          const val = Math.max(0, parseFloat(xf.value) - 0.05);
          xf.value = val;
          mixer.setCrossfader(val);
        }
        return;
      }
      if (e.code === 'ArrowRight') {
        e.preventDefault();
        const xf = document.getElementById('crossfader');
        if (xf) {
          const val = Math.min(1, parseFloat(xf.value) + 0.05);
          xf.value = val;
          mixer.setCrossfader(val);
        }
        return;
      }

      // Deck A Shortcuts
      if (key === 'Q') {
        mixer.pause('A');
        mixer.triggerHotCue('A', 0);
      } else if (key === 'W') {
        mixer.toggle('A');
      } else if (key === 'E') {
        mixer.triggerHotCue('A', 0);
        mixer.play('A');
      } else if (['1', '2', '3', '4'].includes(e.key)) {
        const idx = parseInt(e.key, 10) - 1;
        if (e.shiftKey) mixer.clearHotCue('A', idx);
        else if (mixer.decks.A.cues[idx] !== null) mixer.triggerHotCue('A', idx);
        else mixer.setHotCue('A', idx);
      } else if (key === 'A') {
        mixer.halfLoop('A');
      } else if (key === 'S') {
        mixer.toggleLoop('A');
      } else if (key === 'D') {
        mixer.doubleLoop('A');
      } else if (e.key === '[' && !e.repeat) {
        e.preventDefault();
        mixer.nudge('A', -1);
      } else if (e.key === ']' && !e.repeat) {
        e.preventDefault();
        mixer.nudge('A', +1);
      }

      // Deck B Shortcuts
      else if (key === 'U') {
        mixer.pause('B');
        mixer.triggerHotCue('B', 0);
      } else if (key === 'I') {
        mixer.toggle('B');
      } else if (key === 'O') {
        mixer.triggerHotCue('B', 0);
        mixer.play('B');
      } else if (['7', '8', '9', '0'].includes(e.key)) {
        const map = { '7': 0, '8': 1, '9': 2, '0': 3 };
        const idx = map[e.key];
        if (e.shiftKey) mixer.clearHotCue('B', idx);
        else if (mixer.decks.B.cues[idx] !== null) mixer.triggerHotCue('B', idx);
        else mixer.setHotCue('B', idx);
      } else if (key === 'J') {
        mixer.halfLoop('B');
      } else if (key === 'K') {
        mixer.toggleLoop('B');
      } else if (key === 'L') {
        mixer.doubleLoop('B');
      } else if ((e.key === ',' || e.key === '-') && !e.repeat) {
        e.preventDefault();
        mixer.nudge('B', -1);
      } else if ((e.key === '.' || e.key === '=') && !e.repeat) {
        e.preventDefault();
        mixer.nudge('B', +1);
      }

      // Master Sync & Cue Monitoring shortcuts
      else if (key === 'M') {
        const btn = document.getElementById('btn-master-sync');
        if (btn) btn.click();
      } else if (key === 'P') {
        mixer.setPFL('A', !mixer.pflEnabled.A);
      } else if (e.key === ';') {
        mixer.setPFL('B', !mixer.pflEnabled.B);
      } else if (key === 'C') {
        const next = mixer.cycleCueMode();
        updateCueModeUI(next);
      }
    });

    window.addEventListener('keyup', (e) => {
      const tag = document.activeElement ? document.activeElement.tagName.toLowerCase() : '';
      if (tag === 'input' || tag === 'textarea' || document.activeElement?.isContentEditable) {
        return;
      }

      if (e.key === '[' || e.key === ']') {
        mixer.releaseNudge('A');
      } else if (e.key === ',' || e.key === '-' || e.key === '.' || e.key === '=') {
        mixer.releaseNudge('B');
      }
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // BOOTSTRAP
  // ─────────────────────────────────────────────────────────────────────────
  window.addEventListener('DOMContentLoaded', () => {
    initRotaryKnobs();
    initMixerControls();
    initFXControls();
    initJogPlatters();
    initWaveformScratch();
    initVinylModeControls();
    initTransportAndCues();
    initMixerEngineEvents();
    initSearchAndSidebar();
    initKeyboardShortcuts();
    hydrateCollection();

    // Start 60fps platter turntable animation loop
    requestAnimationFrame(platterRenderLoop);

    // Initial dummy waveform draw
    renderWaveformFrame('A', 0, false);
    renderWaveformFrame('B', 0, false);
    renderOverviewStripe('A', 0);
    renderOverviewStripe('B', 0);

    // Auto-load sample tracks if decks are idle
    setTimeout(() => {
      if (!state.loadedDeckA && state.allTracks[0]) loadTrackIntoDeck('A', state.allTracks[0]);
      if (!state.loadedDeckB && state.allTracks[1]) loadTrackIntoDeck('B', state.allTracks[1]);
    }, 400);

    // Cross-app sync with Workout DJ Sequencer (sets.anypod.org)
    if (Shared.initWorkoutSync) {
      Shared.initWorkoutSync({
        onWorkoutActive: () => {
          if (mixer.isPlaying('A')) mixer.pause('A');
          if (mixer.isPlaying('B')) mixer.pause('B');
        }
      });
    }

    // Cross-tab & Cross-subdomain Storage Bridge (syncs with anypod.org if on dj.anypod.org)
    if (Shared.initStorageBridge) {
      Shared.initStorageBridge({
        onUpdate: () => hydrateCollection()
      });
    }
  });

})();
