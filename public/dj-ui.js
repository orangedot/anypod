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
    liveAppTrack: null
  };

  const SAMPLE_TRACKS = [
    {
      guid: 'sample-909-kit',
      title: '909 Deep Tech Beat (128 BPM)',
      podcastTitle: 'DJ Anypod Tools',
      artwork: 'https://images.unsplash.com/photo-1598488035139-bdbb2231ce04?w=160&auto=format&fit=crop&q=80',
      audioUrl: 'https://cdn.freesound.org/previews/381/381382_1676145-lq.mp3',
      duration: 32,
      bpm: 128,
      key: '8m',
      isYouTube: false,
      isSample: true
    },
    {
      guid: 'sample-funk-groove',
      title: 'Funk Breakbeat & Bassline',
      podcastTitle: 'DJ Anypod Tools',
      artwork: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=160&auto=format&fit=crop&q=80',
      audioUrl: 'https://cdn.freesound.org/previews/242/242857_4284968-lq.mp3',
      duration: 28,
      bpm: 124,
      key: '10m',
      isYouTube: false,
      isSample: true
    },
    {
      guid: 'sample-acid-synth',
      title: 'Acid Resonance Bassline (130 BPM)',
      podcastTitle: 'DJ Anypod Tools',
      artwork: 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=160&auto=format&fit=crop&q=80',
      audioUrl: 'https://cdn.freesound.org/previews/450/450621_649468-lq.mp3',
      duration: 30,
      bpm: 130,
      key: '6m',
      isYouTube: false,
      isSample: true
    },
    {
      guid: 'sample-vocal-drop',
      title: 'Hypnotic Vocal FX Stems',
      podcastTitle: 'DJ Anypod Tools',
      artwork: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=160&auto=format&fit=crop&q=80',
      audioUrl: 'https://cdn.freesound.org/previews/173/173859_321967-lq.mp3',
      duration: 20,
      bpm: 126,
      key: '11m',
      isYouTube: false,
      isSample: true
    }
  ];

  // ─────────────────────────────────────────────────────────────────────────
  // TIME & FORMAT UTILITIES
  // ─────────────────────────────────────────────────────────────────────────
  function formatTime(s) {
    if (!s || !isFinite(s) || s < 0) return '0:00';
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec < 10 ? '0' : ''}${sec}`;
  }

  function formatDuration(dur) {
    if (!dur) return '0:00';
    if (typeof dur === 'number') return formatTime(dur);
    const str = String(dur).trim();
    if (str.includes(':')) return str;
    const s = parseFloat(str);
    return isNaN(s) ? str : formatTime(s);
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function parseDurationSeconds(dur) {
    if (!dur) return 0;
    if (typeof dur === 'number') return dur;
    const parts = String(dur).split(':').map(Number);
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
    if (parts.length === 2) return parts[0] * 60 + parts[1];
    const s = parseFloat(dur);
    return isNaN(s) ? 0 : s;
  }

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
        const syncRes = await fetch('/api/sync/feeds');
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

          await Promise.allSettled(feedsToFetch.slice(0, 15).map(async (feedUrl) => {
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
                    localStorage.setItem('anypod_cached_metadata', JSON.stringify(state.feedMetadata));
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
      const rawLive = localStorage.getItem('anypod_last_active_episode');
      if (rawLive) state.liveAppTrack = JSON.parse(rawLive);
    } catch (_) {}

    // 2. Load Feeds & Metadata
    try {
      state.feeds = JSON.parse(localStorage.getItem('anypod_feeds') || '[]');
      state.feedMetadata = JSON.parse(localStorage.getItem('anypod_cached_metadata') || '{}');
      state.queue = JSON.parse(localStorage.getItem('anypod_playback_queue') || '[]');
      state.favorites = JSON.parse(localStorage.getItem('anypod_favorites') || '[]');
    } catch (_) {}

    // 2b. Load Downloaded Episodes & Offline Files from app.js
    try {
      const rawDownloads = JSON.parse(localStorage.getItem('anypod_downloads') || '{}');
      if (rawDownloads && typeof rawDownloads === 'object') {
        Object.values(rawDownloads).forEach(ep => {
          if (ep) {
            ep.isDownloaded = true;
            addTrack(ep);
          }
        });
      }
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
        bpm: estimateBpm(ep, epMap.size),
        key: estimateKey(ep, epMap.size)
      };

      epMap.set(key, norm);
      if (norm.guid) epMap.set(norm.guid, norm);
    };

    // 3. Fast sync from localStorage cached episodes
    try {
      const rawCached = JSON.parse(localStorage.getItem('anypod_cached_episodes') || '[]');
      if (Array.isArray(rawCached)) rawCached.forEach(addTrack);
    } catch (_) {}

    // 4. Asynchronous Deep Hydration from IndexedDB 'anypod_store_v1'
    try {
      if (window.indexedDB) {
        const idbTracks = await new Promise((resolve) => {
          const req = window.indexedDB.open('anypod_store_v1', 1);
          req.onsuccess = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains('keyval')) return resolve([]);
            const tx = db.transaction('keyval', 'readonly');
            const getReq = tx.objectStore('keyval').get('anypod_cached_episodes');
            getReq.onsuccess = () => resolve(getReq.result || []);
            getReq.onerror = () => resolve([]);
          };
          req.onerror = () => resolve([]);
        });

        if (Array.isArray(idbTracks)) {
          idbTracks.forEach(addTrack);
        }
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

    const fragment = document.createDocumentFragment();

    list.forEach((track, idx) => {
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
      if (mixer.master) mixer.master.threshold.value = -30 + (val / 100) * 20;
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

    // Pitch Faders
    ['A', 'B'].forEach((id) => {
      const slider = document.getElementById(`pitch-slider-${id.toLowerCase()}`);
      const pctEl = document.getElementById(`pitch-pct-${id.toLowerCase()}`);
      const btnDown = document.getElementById(`pitch-${id.toLowerCase()}-down`);
      const btnUp = document.getElementById(`pitch-${id.toLowerCase()}-up`);

      const applyRate = (rate) => {
        state.deckPitch[id] = rate;
        mixer.setPlaybackRate(id, rate);
        if (pctEl) {
          const pct = ((rate - 1.0) * 100).toFixed(2);
          pctEl.textContent = `${pct >= 0 ? '+' : ''}${pct}%`;
        }
        if (slider) slider.value = rate;
      };

      if (slider) {
        slider.addEventListener('input', (e) => applyRate(parseFloat(e.target.value)));
      }
      if (btnDown) {
        btnDown.addEventListener('click', () => applyRate(Math.max(0.8, state.deckPitch[id] - 0.005)));
      }
      if (btnUp) {
        btnUp.addEventListener('click', () => applyRate(Math.min(1.2, state.deckPitch[id] + 0.005)));
      }
    });

    // PFL Cue Buttons
    ['A', 'B'].forEach((id) => {
      const btn = document.getElementById(`pfl-${id.toLowerCase()}`);
      if (btn) btn.addEventListener('click', () => btn.classList.toggle('active'));
    });
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

      // Loop Controls
      const loopActive = document.getElementById(`loop-${id.toLowerCase()}-active`);
      if (loopActive) {
        loopActive.addEventListener('click', () => {
          const d = mixer.decks[id];
          d.loop.active = !d.loop.active;
          loopActive.classList.toggle('active', d.loop.active);
          if (d.loop.active) {
            d.loop.start = mixer.getCurrentTime(id);
            // 4 beats at 128 BPM ≈ 1.875s
            d.loop.end = d.loop.start + 1.875;
          }
        });
      }

      // Waveform click to scrub/seek
      const waveWrap = document.getElementById(`waveform-wrap-${id.toLowerCase()}`);
      if (waveWrap) {
        waveWrap.addEventListener('click', (e) => {
          const rect = waveWrap.getBoundingClientRect();
          const pos = (e.clientX - rect.left) / rect.width;
          const dur = mixer.getDuration(id);
          if (dur > 0) mixer.seek(id, pos * dur);
        });
      }

      // Overview stripe click to jump
      const overviewWrap = document.getElementById(`overview-wrap-${id.toLowerCase()}`);
      if (overviewWrap) {
        overviewWrap.addEventListener('click', (e) => {
          const rect = overviewWrap.getBoundingClientRect();
          const pos = (e.clientX - rect.left) / rect.width;
          const dur = mixer.getDuration(id);
          if (dur > 0) mixer.seek(id, pos * dur);
        });
      }
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
            if (masterBpmVal) masterBpmVal.textContent = bpm.toFixed(2);
          }
        }
      });
    }

    // Master SYNC button
    const btnSync = document.getElementById('btn-master-sync');
    if (btnSync) {
      btnSync.addEventListener('click', () => {
        btnSync.classList.toggle('active');
        // Match both decks to Master BPM
        ['A', 'B'].forEach((id) => {
          const track = id === 'A' ? state.loadedDeckA : state.loadedDeckB;
          const baseBpm = track?.bpm || 128;
          const targetRate = state.masterBpm / baseBpm;
          mixer.setPlaybackRate(id, targetRate);
        });
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
  // BOOTSTRAP
  // ─────────────────────────────────────────────────────────────────────────
  window.addEventListener('DOMContentLoaded', () => {
    initRotaryKnobs();
    initMixerControls();
    initTransportAndCues();
    initMixerEngineEvents();
    initSearchAndSidebar();
    hydrateCollection();

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
    try {
      if ('BroadcastChannel' in window) {
        const syncChannel = new BroadcastChannel('anypod_workout_sync');
        syncChannel.addEventListener('message', (e) => {
          if (e.data?.type === 'WORKOUT_ACTIVE') {
            if (mixer.isPlaying('A')) mixer.pause('A');
            if (mixer.isPlaying('B')) mixer.pause('B');
          }
        });

        const storageChannel = new BroadcastChannel('anypod_storage_channel');
        storageChannel.addEventListener('message', (e) => {
          if (e.data?.type === 'UPDATE_STORAGE') {
            hydrateCollection();
          }
        });
      }
    } catch (_) {}

    // Cross-subdomain Storage Bridge (syncs with anypod.org if on dj.anypod.org)
    try {
      const isSubdomain = location.hostname.endsWith('.anypod.org') && location.hostname !== 'anypod.org';
      const bridgeOrigin = isSubdomain ? 'https://anypod.org' : '';
      const iframe = document.createElement('iframe');
      iframe.src = `${bridgeOrigin}/storage-bridge.html`;
      iframe.style.display = 'none';
      iframe.title = 'Storage Bridge';
      document.body.appendChild(iframe);

      window.addEventListener('message', (event) => {
        if (event.data?.type === 'ANYPOD_STORAGE_READY' || event.data?.type === 'ANYPOD_STORAGE_RESPONSE' || event.data?.type === 'ANYPOD_STORAGE_UPDATE') {
          const payload = event.data.payload;
          if (payload && typeof payload === 'object') {
            let hasNew = false;
            Object.keys(payload).forEach(k => {
              const cur = localStorage.getItem(k);
              if (payload[k] && cur !== payload[k]) {
                try {
                  localStorage.setItem(k, payload[k]);
                  hasNew = true;
                } catch (_) {}
              }
            });
            if (hasNew) {
              hydrateCollection();
            }
          }
        }
      });
    } catch (_) {}
  });

})();
