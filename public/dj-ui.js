(function () {
  'use strict';

  const mixer = new DJMixer();

  const deckEls = {
    A: {
      root: document.querySelector('.deck-a'),
      title: document.querySelector('.deck-a [data-role="title"]'),
      cur: document.querySelector('.deck-a [data-role="cur"]'),
      dur: document.querySelector('.deck-a [data-role="dur"]'),
      play: document.querySelector('.deck-a [data-role="play"]'),
      rate: document.querySelector('.deck-a [data-role="rate"]'),
      rateLabel: document.querySelector('.deck-a [data-role="rate-label"]'),
      cues: document.querySelectorAll('.deck-a .cue'),
      wave: document.querySelector('.deck-a [data-role="wave"]')
    },
    B: {
      root: document.querySelector('.deck-b'),
      title: document.querySelector('.deck-b [data-role="title"]'),
      cur: document.querySelector('.deck-b [data-role="cur"]'),
      dur: document.querySelector('.deck-b [data-role="dur"]'),
      play: document.querySelector('.deck-b [data-role="play"]'),
      rate: document.querySelector('.deck-b [data-role="rate"]'),
      rateLabel: document.querySelector('.deck-b [data-role="rate-label"]'),
      cues: document.querySelectorAll('.deck-b .cue'),
      wave: document.querySelector('.deck-b [data-role="wave"]')
    }
  };

  const FALLBACK_ARTWORK = 'data:image/svg+xml,%3Csvg%20xmlns=%22http://www.w3.org/2000/svg%22%20width=%22100%22%20height=%22100%22%3E%3Crect%20width=%22100%25%22%20height=%22100%25%22%20fill=%22%231c1c24%22/%3E%3Ccircle%20cx=%2250%22%20cy=%2250%22%20r=%2222%22%20fill=%22none%22%20stroke=%22%234b4b60%22%20stroke-width=%224%22/%3E%3Ccircle%20cx=%2250%22%20cy=%2250%22%20r=%226%22%20fill=%22%234b4b60%22/%3E%3C/svg%3E';

  const DEFAULT_STARTER_FEEDS = [
    'https://feeds.megaphone.fm/NATIONALAERONAUTICSANDSPACEADMINISTRATION8162188566',
    'https://feeds.simplecast.com/EmVW7VGp',
    'https://podcasts.files.bbci.co.uk/w13xtvb6.rss',
    'https://www.deutschlandfunk.de/forschung-aktuell-102.xml'
  ];

  const STARTER_METADATA = {
    'https://feeds.megaphone.fm/NATIONALAERONAUTICSANDSPACEADMINISTRATION8162188566': {
      title: "NASA's Curious Universe",
      artwork: 'https://content.production.cdn.art19.com/images/3a/0c/3a0c0a37-5489-4ba6-86f1-a1698d28cfda/86c6734d85290b200b213b1f9b3be5d8518e3881fa2c2f741ae84b6da1bbd2d8ceeafeeeaa8c2bc13d52d9a6c7ecdf7ad6b499159954a6db2d1cfa97645ef5fe_1400x1400.jpeg',
      episodesCount: 50
    },
    'https://feeds.simplecast.com/EmVW7VGp': {
      title: 'Radiolab',
      artwork: 'https://media.wnyc.org/i/1400/1400/l/80/1/Radiolab_SquareAudioLogo_Final.png',
      episodesCount: 100
    },
    'https://podcasts.files.bbci.co.uk/w13xtvb6.rss': {
      title: 'The Climate Question (BBC)',
      artwork: 'https://ichef.bbci.co.uk/images/ic/1024x1024/p09249sl.jpg',
      episodesCount: 80
    },
    'https://www.deutschlandfunk.de/forschung-aktuell-102.xml': {
      title: 'Forschung aktuell (Deutschlandfunk)',
      artwork: 'https://static.deutschlandradio.de/dlf/podcast/forschung_aktuell.jpg',
      episodesCount: 120
    }
  };

  function formatTime(s) {
    if (!s || !isFinite(s)) return '0:00';
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec < 10 ? '0' : ''}${sec}`;
  }

  function formatEpDuration(dur) {
    if (!dur) return '';
    if (typeof dur === 'number') {
      const h = Math.floor(dur / 3600);
      const m = Math.floor((dur % 3600) / 60);
      const s = Math.floor(dur % 60);
      if (h > 0) return `${h}h ${m}m`;
      return `${m}:${s < 10 ? '0' : ''}${s}`;
    }
    const str = String(dur).trim();
    if (str.includes(':')) {
      const parts = str.split(':').map(Number);
      if (parts.length === 3) {
        return parts[0] > 0 ? `${parts[0]}h ${parts[1]}m` : `${parts[1]}:${parts[2] < 10 ? '0' : ''}${parts[2]}`;
      }
      if (parts.length === 2) {
        return `${parts[0]}:${parts[1] < 10 ? '0' : ''}${parts[1]}`;
      }
    }
    const sec = parseFloat(str);
    if (!isNaN(sec) && sec > 0) return formatEpDuration(sec);
    return str;
  }

  function formatEpDate(ts) {
    if (!ts) return '';
    try {
      const d = new Date(typeof ts === 'number' && ts < 10000000000 ? ts * 1000 : ts);
      if (isNaN(d.getTime())) return '';
      return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    } catch (_) {
      return '';
    }
  }

  function drawWaveform(canvas, progress, color) {
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const w = (canvas.width = canvas.clientWidth);
    const h = (canvas.height = canvas.clientHeight);

    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#222230';
    ctx.fillRect(0, 0, w, h);

    const step = 4;
    const bars = Math.floor(w / step);
    for (let i = 0; i < bars; i++) {
      const barX = i * step;
      const barProgress = barX / w;
      const val = (Math.sin(i * 0.2) + Math.cos(i * 0.5) + 2) / 4;
      const barH = Math.max(4, val * (h - 8));
      const barY = (h - barH) / 2;

      ctx.fillStyle = barProgress <= progress ? color : '#3a3a4e';
      ctx.fillRect(barX, barY, step - 1, barH);
    }
  }

  // Bind deck actions
  ['A', 'B'].forEach((id) => {
    const el = deckEls[id];
    const color = id === 'A' ? '#ff3b5c' : '#00d2ff';

    el.play.addEventListener('click', () => mixer.toggle(id));

    el.rate.addEventListener('input', (e) => {
      const val = parseFloat(e.target.value);
      el.rateLabel.textContent = `${val.toFixed(2)}×`;
      mixer.setPlaybackRate(id, val);
    });

    el.cues.forEach((btn) => {
      const cueIdx = parseInt(btn.dataset.cue, 10);
      let holdTimer = null;
      let isHold = false;

      btn.addEventListener('pointerdown', () => {
        isHold = false;
        holdTimer = setTimeout(() => {
          isHold = true;
          mixer.clearHotCue(id, cueIdx);
        }, 800);
      });

      btn.addEventListener('pointerup', () => {
        clearTimeout(holdTimer);
        if (isHold) return;
        const cues = mixer.decks[id].cues;
        if (typeof cues[cueIdx] === 'number') {
          mixer.triggerHotCue(id, cueIdx);
        } else {
          mixer.setHotCue(id, cueIdx);
        }
      });

      btn.addEventListener('pointercancel', () => clearTimeout(holdTimer));
    });

    // Waveform seek
    el.wave.addEventListener('click', (e) => {
      const rect = el.wave.getBoundingClientRect();
      const pos = (e.clientX - rect.left) / rect.width;
      const dur = mixer.decks[id].audio.duration;
      if (dur && isFinite(dur)) {
        mixer.seek(id, pos * dur);
      }
    });

    drawWaveform(el.wave, 0, color);
  });

  // EQ Sliders
  document.querySelectorAll('.vslider').forEach((slider) => {
    slider.addEventListener('input', (e) => {
      const deck = e.target.closest('.eq').dataset.deck;
      const band = e.target.dataset.eq;
      mixer.setEQ(deck, band, parseFloat(e.target.value));
    });
  });

  // Crossfader
  const xfader = document.getElementById('crossfader');
  xfader.addEventListener('input', (e) => {
    mixer.setCrossfader(parseFloat(e.target.value));
  });

  // Mixer engine events
  mixer.on('time', ({ deck, currentTime, duration }) => {
    const el = deckEls[deck];
    el.cur.textContent = formatTime(currentTime);
    const prog = duration > 0 ? currentTime / duration : 0;
    drawWaveform(el.wave, prog, deck === 'A' ? '#ff3b5c' : '#00d2ff');
  });

  mixer.on('loaded', ({ deck, duration }) => {
    deckEls[deck].dur.textContent = formatTime(duration);
  });

  mixer.on('state', ({ deck, playing }) => {
    const el = deckEls[deck];
    if (playing) {
      el.play.textContent = '❚❚';
      el.play.classList.add('playing');
    } else {
      el.play.textContent = '▶';
      el.play.classList.remove('playing');
    }
  });

  mixer.on('track', ({ deck, meta, cues }) => {
    deckEls[deck].title.textContent = meta.title || 'Untitled';
    updateCueButtons(deck, cues);
  });

  mixer.on('cues', ({ deck, cues }) => {
    updateCueButtons(deck, cues);
  });

  function updateCueButtons(deck, cues) {
    deckEls[deck].cues.forEach((btn, idx) => {
      if (typeof cues[idx] === 'number') {
        btn.classList.add('active');
        btn.title = `Cue ${idx + 1}: ${formatTime(cues[idx])} (Hold to clear)`;
      } else {
        btn.classList.remove('active');
        btn.title = `Set Cue ${idx + 1}`;
      }
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // CRATE DRAWER & PODCAST FEED BROWSER
  // ─────────────────────────────────────────────────────────────────────────

  const crateToggle = document.getElementById('crate-toggle');
  const crateEl = document.getElementById('crate');
  const crateCount = document.getElementById('crate-count');
  const crateSearchInput = document.getElementById('crate-search-input');
  const btnClearCrateSearch = document.getElementById('btn-clear-crate-search');
  const crateTabs = document.querySelectorAll('.crate-tab');
  const crateAdd = document.getElementById('crate-add');
  const crateUrl = document.getElementById('crate-url');

  // Views
  const crateFeedsView = document.getElementById('crate-feeds-view');
  const crateFeedsGrid = document.getElementById('crate-feeds-grid');
  const crateDetailView = document.getElementById('crate-detail-view');
  const crateDetailArt = document.getElementById('crate-detail-art');
  const crateDetailTitle = document.getElementById('crate-detail-title');
  const crateDetailEpCount = document.getElementById('crate-detail-ep-count');
  const crateDetailList = document.getElementById('crate-detail-list');
  const btnCrateBack = document.getElementById('btn-crate-back');
  const crateEpisodesView = document.getElementById('crate-episodes-view');
  const crateSearchFeedMatches = document.getElementById('crate-search-feed-matches');
  const crateList = document.getElementById('crate-list');

  const state = {
    activeTab: 'feeds', // 'feeds' | 'queue' | 'favorites' | 'cached'
    selectedFeedUrl: null,
    searchQuery: '',
    feeds: [],
    feedMetadata: {},
    cachedEpisodes: [],
    queue: [],
    favorites: [],
    feedEpisodesCache: {},
    loadingFeedUrl: null
  };

  // Toggle Crate drawer
  crateToggle.addEventListener('click', () => {
    const open = crateEl.classList.toggle('open');
    crateToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    updateCrateCountBadge();
  });

  function updateCrateCountBadge() {
    let count = 0;
    if (state.activeTab === 'feeds') {
      count = state.feeds.length;
    } else if (state.activeTab === 'queue') {
      count = state.queue.length;
    } else if (state.activeTab === 'favorites') {
      count = state.favorites.length;
    } else if (state.activeTab === 'cached') {
      count = state.cachedEpisodes.length;
    }
    const open = crateEl.classList.contains('open');
    crateToggle.innerHTML = `${open ? '▼' : '▲'} Crate <span id="crate-count">${count}</span>`;
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

  function highlightText(str, query) {
    if (!str) return '';
    const safe = escapeHtml(str);
    if (!query || query.trim().length < 2) return safe;
    const terms = query.trim().toLowerCase().split(/\s+/).filter(t => t.length >= 2);
    if (terms.length === 0) return safe;
    const pattern = terms.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
    return safe.replace(new RegExp(`(${pattern})`, 'gi'), '<mark style="background:#ffcc00;color:#000;border-radius:2px;padding:0 2px;">$1</mark>');
  }

  // Load storage data from Anypod keys
  function loadCrateFromStorage() {
    try {
      // 1. Feeds
      const rawFeeds = JSON.parse(localStorage.getItem('anypod_feeds') || '[]');
      state.feeds = Array.isArray(rawFeeds) && rawFeeds.length > 0 ? rawFeeds : DEFAULT_STARTER_FEEDS.slice();

      // 2. Metadata
      const rawMeta = JSON.parse(localStorage.getItem('anypod_cached_metadata') || '{}');
      state.feedMetadata = Object.assign({}, STARTER_METADATA, rawMeta);

      // 3. Cached Episodes (can be Array or Map object)
      const rawEps = JSON.parse(localStorage.getItem('anypod_cached_episodes') || '[]');
      state.cachedEpisodes = [];
      const epMap = new Map();

      const addEp = (ep) => {
        if (!ep) return;
        const url = ep.audioUrl || ep.url;
        if (!url) return;
        const normalized = {
          guid: ep.guid || url,
          title: ep.title || 'Untitled Track',
          podcastTitle: ep.podcastTitle || ep.author || (state.feedMetadata[ep.feedUrl]?.title) || '',
          audioUrl: url,
          feedUrl: ep.feedUrl || '',
          duration: ep.duration || 0,
          pubDate: ep.pubDate || ep.timestamp || '',
          description: ep.description || ep.content || '',
          content: ep.content || ''
        };
        state.cachedEpisodes.push(normalized);
        if (normalized.guid) epMap.set(normalized.guid, normalized);
        epMap.set(url, normalized);

        if (normalized.feedUrl) {
          if (!state.feedEpisodesCache[normalized.feedUrl]) {
            state.feedEpisodesCache[normalized.feedUrl] = [];
          }
          state.feedEpisodesCache[normalized.feedUrl].push(normalized);
        }
      };

      if (Array.isArray(rawEps)) {
        rawEps.forEach(addEp);
      } else if (rawEps && typeof rawEps === 'object') {
        Object.values(rawEps).forEach(addEp);
      }

      // 4. Queue
      const rawQ = JSON.parse(localStorage.getItem('anypod_playback_queue') || '[]');
      state.queue = [];
      if (Array.isArray(rawQ)) {
        rawQ.forEach(item => {
          const ep = epMap.get(item.guid) || epMap.get(item.audioUrl) || item;
          if (ep && (ep.audioUrl || ep.url)) {
            state.queue.push({
              guid: ep.guid || ep.url,
              title: ep.title || 'Queued Track',
              podcastTitle: ep.podcastTitle || 'Queue',
              audioUrl: ep.audioUrl || ep.url,
              duration: ep.duration || 0,
              pubDate: ep.pubDate || ep.timestamp || '',
              description: ep.description || '',
              source: 'queue'
            });
          }
        });
      }

      // 5. Favorites
      const rawFavs = JSON.parse(localStorage.getItem('anypod_favorites') || '[]');
      state.favorites = [];
      if (Array.isArray(rawFavs)) {
        rawFavs.forEach(item => {
          const ep = epMap.get(item.guid) || epMap.get(item.audioUrl) || item;
          if (ep && (ep.audioUrl || ep.url)) {
            state.favorites.push({
              guid: ep.guid || ep.url,
              title: ep.title || 'Favorite Track',
              podcastTitle: ep.podcastTitle || 'Favorites',
              audioUrl: ep.audioUrl || ep.url,
              duration: ep.duration || 0,
              pubDate: ep.pubDate || ep.timestamp || '',
              description: ep.description || '',
              source: 'favorites'
            });
          }
        });
      }

      // Sample pack fallback if no cached tracks exist at all
      if (state.cachedEpisodes.length === 0) {
        const sample1 = {
          guid: 'sample-1',
          title: 'Synth Loop Beat (120 BPM)',
          podcastTitle: 'Sample Pack',
          audioUrl: 'https://cdn.freesound.org/previews/381/381382_1676145-lq.mp3',
          duration: 30,
          description: 'Electronic synth loop',
          source: 'sample'
        };
        const sample2 = {
          guid: 'sample-2',
          title: 'Funk Drum Groove',
          podcastTitle: 'Sample Pack',
          audioUrl: 'https://cdn.freesound.org/previews/242/242857_4284968-lq.mp3',
          duration: 25,
          description: 'Funky drum breaks',
          source: 'sample'
        };
        state.cachedEpisodes.push(sample1, sample2);
        state.queue.push(sample1, sample2);
      }
    } catch (e) {
      console.warn('[dj] Error loading storage:', e);
    }

    renderCrate();
  }

  // ─────────────────────────────────────────────────────────────────────────
  // FEED PICKER & DETAIL VIEWS
  // ─────────────────────────────────────────────────────────────────────────

  function renderCrate() {
    updateCrateCountBadge();

    // 1. If currently inside a Feed's detail view
    if (state.selectedFeedUrl) {
      showView('detail');
      renderFeedDetail(state.selectedFeedUrl);
      return;
    }

    // 2. If viewing the Feed Picker (Podcasts tab)
    if (state.activeTab === 'feeds') {
      showView('feeds');
      renderFeedsGrid();
      return;
    }

    // 3. If viewing Queue, Favorites, All Episodes, or Global Search
    showView('episodes');
    renderEpisodesList();
  }

  function showView(viewName) {
    crateFeedsView.classList.toggle('hidden', viewName !== 'feeds');
    crateDetailView.classList.toggle('hidden', viewName !== 'detail');
    crateEpisodesView.classList.toggle('hidden', viewName !== 'episodes');
  }

  // Render Grid of Subscribed Podcasts
  function renderFeedsGrid() {
    crateFeedsGrid.innerHTML = '';
    const q = state.searchQuery.toLowerCase().trim();

    let list = state.feeds;
    if (q) {
      const terms = q.split(/\s+/).filter(Boolean);
      list = list.filter(url => {
        const meta = state.feedMetadata[url] || {};
        const title = (meta.title || '').toLowerCase();
        const author = (meta.author || '').toLowerCase();
        const desc = (meta.description || '').toLowerCase();
        return terms.every(t => title.includes(t) || author.includes(t) || desc.includes(t) || url.toLowerCase().includes(t));
      });
    }

    if (list.length === 0) {
      crateFeedsGrid.innerHTML = `
        <div style="grid-column: 1 / -1; padding: 24px 10px; text-align: center; color: var(--muted); font-size: 11px;">
          ${q ? `No podcasts matching "${escapeHtml(state.searchQuery)}"` : 'No podcasts found. Try searching or paste an RSS feed URL.'}
        </div>
      `;
      return;
    }

    list.forEach(feedUrl => {
      const meta = state.feedMetadata[feedUrl] || {};
      const card = document.createElement('div');
      card.className = 'crate-feed-card';
      const count = meta.episodesCount || (state.feedEpisodesCache[feedUrl]?.length) || '';

      card.innerHTML = `
        <img class="crate-feed-art" src="${escapeHtml(meta.artwork || FALLBACK_ARTWORK)}" alt="" loading="lazy">
        <span class="crate-feed-title">${highlightText(meta.title || 'Untitled Podcast', state.searchQuery)}</span>
        <span class="crate-feed-meta">${count ? `${count} episodes` : (meta.author ? escapeHtml(meta.author) : 'Podcast')}</span>
      `;

      card.addEventListener('click', () => {
        openCrateFeed(feedUrl);
      });

      crateFeedsGrid.appendChild(card);
    });
  }

  // Open Feed Detail View
  async function openCrateFeed(feedUrl) {
    state.selectedFeedUrl = feedUrl;
    showView('detail');
    renderFeedDetail(feedUrl);

    // If no episodes cached yet for this feed, fetch them from /api/feed
    const cached = state.feedEpisodesCache[feedUrl];
    if (!cached || cached.length === 0) {
      await fetchFeedEpisodes(feedUrl);
    }
  }

  // Fetch episodes from API
  async function fetchFeedEpisodes(feedUrl) {
    state.loadingFeedUrl = feedUrl;
    renderFeedDetail(feedUrl);

    try {
      const sessionToken = localStorage.getItem('anypod_session_token');
      const headers = sessionToken ? { 'X-Session-Token': sessionToken } : {};
      const res = await fetch(`/api/feed?url=${encodeURIComponent(feedUrl)}`, { headers });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();

      if (data && Array.isArray(data.episodes)) {
        const epList = data.episodes.map(item => ({
          guid: item.guid || item.audioUrl || item.url,
          title: item.title || 'Untitled Episode',
          podcastTitle: data.title || state.feedMetadata[feedUrl]?.title || '',
          audioUrl: item.audioUrl || item.url,
          feedUrl: feedUrl,
          duration: item.duration || 0,
          pubDate: item.pubDate || item.timestamp || '',
          description: item.description || item.content || ''
        }));

        state.feedEpisodesCache[feedUrl] = epList;

        // Merge into cachedEpisodes
        epList.forEach(ep => {
          if (!state.cachedEpisodes.some(e => (e.guid && e.guid === ep.guid) || e.audioUrl === ep.audioUrl)) {
            state.cachedEpisodes.push(ep);
          }
        });

        // Update metadata
        state.feedMetadata[feedUrl] = Object.assign({}, state.feedMetadata[feedUrl], {
          title: data.title || state.feedMetadata[feedUrl]?.title,
          artwork: data.artwork || state.feedMetadata[feedUrl]?.artwork,
          episodesCount: data.episodesCount || epList.length,
          description: data.description || state.feedMetadata[feedUrl]?.description
        });
      }
    } catch (err) {
      console.warn('[dj] Error fetching feed episodes:', err);
    } finally {
      state.loadingFeedUrl = null;
      if (state.selectedFeedUrl === feedUrl) {
        renderFeedDetail(feedUrl);
      }
    }
  }

  // Render Feed Detail View
  function renderFeedDetail(feedUrl) {
    const meta = state.feedMetadata[feedUrl] || {};
    crateDetailArt.src = meta.artwork || FALLBACK_ARTWORK;
    crateDetailTitle.textContent = meta.title || 'Untitled Podcast';

    let episodes = state.feedEpisodesCache[feedUrl] || [];
    const totalCount = episodes.length;

    // Filter by search query if present
    const q = state.searchQuery.toLowerCase().trim();
    if (q) {
      const terms = q.split(/\s+/).filter(Boolean);
      episodes = episodes.filter(ep => {
        const title = (ep.title || '').toLowerCase();
        const desc = (ep.description || ep.content || '').toLowerCase();
        return terms.every(t => title.includes(t) || desc.includes(t));
      });
    }

    crateDetailEpCount.textContent = q ? `${episodes.length} of ${totalCount} episodes` : `${totalCount} episodes`;
    crateDetailList.innerHTML = '';

    if (state.loadingFeedUrl === feedUrl && totalCount === 0) {
      crateDetailList.innerHTML = `
        <li class="crate-loading">
          <span class="crate-spinner"></span>
          <span>Fetching show episodes...</span>
        </li>
      `;
      return;
    }

    if (episodes.length === 0) {
      crateDetailList.innerHTML = `
        <li style="padding: 24px 10px; text-align: center; color: var(--muted); font-size: 11px;">
          ${q ? `No episodes matching "${escapeHtml(state.searchQuery)}"` : 'No episodes available for this feed.'}
        </li>
      `;
      return;
    }

    episodes.forEach(ep => {
      crateDetailList.appendChild(createEpisodeListItem(ep, meta));
    });
  }

  // Back button in Feed Detail View
  btnCrateBack.addEventListener('click', () => {
    state.selectedFeedUrl = null;
    renderCrate();
  });

  // ─────────────────────────────────────────────────────────────────────────
  // EPISODE LIST (QUEUE / FAVORITES / ALL EPISODES / SEARCH)
  // ─────────────────────────────────────────────────────────────────────────

  function renderEpisodesList() {
    crateList.innerHTML = '';
    crateSearchFeedMatches.innerHTML = '';
    crateSearchFeedMatches.classList.add('hidden');

    let list = [];
    if (state.activeTab === 'queue') {
      list = state.queue;
    } else if (state.activeTab === 'favorites') {
      list = state.favorites;
    } else {
      list = state.cachedEpisodes;
    }

    const q = state.searchQuery.toLowerCase().trim();

    // Check matching feeds if user searched
    if (q) {
      const terms = q.split(/\s+/).filter(Boolean);
      const matchingFeeds = state.feeds.filter(url => {
        const meta = state.feedMetadata[url] || {};
        const title = (meta.title || '').toLowerCase();
        const author = (meta.author || '').toLowerCase();
        return terms.some(t => title.includes(t) || author.includes(t));
      });

      if (matchingFeeds.length > 0) {
        crateSearchFeedMatches.classList.remove('hidden');
        crateSearchFeedMatches.innerHTML = `
          <div class="crate-search-matches-header">Matching Podcasts (${matchingFeeds.length})</div>
          <div class="crate-search-feed-chips">
            ${matchingFeeds.map(url => {
              const meta = state.feedMetadata[url] || {};
              return `
                <div class="crate-mini-feed-chip" data-feed="${escapeHtml(url)}">
                  <img src="${escapeHtml(meta.artwork || FALLBACK_ARTWORK)}" alt="">
                  <span>${escapeHtml(meta.title || 'Podcast')}</span>
                </div>
              `;
            }).join('')}
          </div>
        `;

        crateSearchFeedMatches.querySelectorAll('.crate-mini-feed-chip').forEach(chip => {
          chip.addEventListener('click', () => {
            const feedUrl = chip.dataset.feed;
            openCrateFeed(feedUrl);
          });
        });
      }

      // Filter episodes
      list = list.filter(t => {
        const title = (t.title || '').toLowerCase();
        const pod = (t.podcastTitle || '').toLowerCase();
        const desc = (t.content || t.description || '').toLowerCase();
        const url = (t.audioUrl || t.url || '').toLowerCase();
        return terms.every(term => title.includes(term) || pod.includes(term) || desc.includes(term) || url.includes(term));
      });
    }

    if (list.length === 0) {
      crateList.innerHTML = `
        <li style="padding: 24px 10px; text-align: center; color: var(--muted); font-size: 11px;">
          ${q ? `No episodes matching "${escapeHtml(state.searchQuery)}"` : 'No episodes in this section. Browse "Podcasts" tab to select a show.'}
        </li>
      `;
      return;
    }

    list.forEach(ep => {
      crateList.appendChild(createEpisodeListItem(ep, state.feedMetadata[ep.feedUrl]));
    });
  }

  // Create Episode Row Component with "Load A" and "Load B"
  function createEpisodeListItem(ep, meta) {
    const li = document.createElement('li');
    li.className = 'crate-item';

    const podTitle = ep.podcastTitle || meta?.title || '';
    const dateStr = formatEpDate(ep.pubDate);
    const durStr = formatEpDuration(ep.duration);
    const subParts = [];
    if (podTitle) subParts.push(highlightText(podTitle, state.searchQuery));
    if (dateStr) subParts.push(dateStr);
    if (durStr) subParts.push(`⏱ ${durStr}`);

    li.innerHTML = `
      <div class="crate-item-main">
        <span class="crate-item-title">${highlightText(ep.title, state.searchQuery)}</span>
        <span class="crate-item-meta">${subParts.join(' • ')}</span>
      </div>
      <div class="crate-item-actions">
        <button class="btn-load btn-load-a" data-action="load-a">Load A</button>
        <button class="btn-load btn-load-b" data-action="load-b">Load B</button>
      </div>
    `;

    const btnA = li.querySelector('[data-action="load-a"]');
    btnA.addEventListener('click', (e) => {
      e.stopPropagation();
      const trackUrl = ep.audioUrl || ep.url;
      mixer.loadTrack('A', trackUrl, {
        title: ep.title,
        artist: podTitle,
        artwork: meta?.artwork || FALLBACK_ARTWORK
      });
      btnA.classList.add('loaded');
      btnA.textContent = '✓ Deck A';
      setTimeout(() => {
        btnA.classList.remove('loaded');
        btnA.textContent = 'Load A';
      }, 1400);
    });

    const btnB = li.querySelector('[data-action="load-b"]');
    btnB.addEventListener('click', (e) => {
      e.stopPropagation();
      const trackUrl = ep.audioUrl || ep.url;
      mixer.loadTrack('B', trackUrl, {
        title: ep.title,
        artist: podTitle,
        artwork: meta?.artwork || FALLBACK_ARTWORK
      });
      btnB.classList.add('loaded');
      btnB.textContent = '✓ Deck B';
      setTimeout(() => {
        btnB.classList.remove('loaded');
        btnB.textContent = 'Load B';
      }, 1400);
    });

    return li;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // SEARCH & TABS LISTENERS
  // ─────────────────────────────────────────────────────────────────────────

  let searchDebounce = null;
  if (crateSearchInput) {
    crateSearchInput.addEventListener('input', (e) => {
      const val = e.target.value.trim();
      state.searchQuery = val;
      if (btnClearCrateSearch) {
        btnClearCrateSearch.classList.toggle('hidden', !val);
      }
      clearTimeout(searchDebounce);
      searchDebounce = setTimeout(renderCrate, 200);
    });

    if (btnClearCrateSearch) {
      btnClearCrateSearch.addEventListener('click', () => {
        crateSearchInput.value = '';
        state.searchQuery = '';
        btnClearCrateSearch.classList.add('hidden');
        renderCrate();
        crateSearchInput.focus();
      });
    }
  }

  // Tabs Click
  crateTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      crateTabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      state.activeTab = tab.dataset.tab;
      // If user switches tab away from detail, reset feed selection
      if (state.activeTab !== 'feeds') {
        state.selectedFeedUrl = null;
      }
      renderCrate();
    });
  });

  // Custom Audio URL submission
  if (crateAdd && crateUrl) {
    crateAdd.addEventListener('submit', (e) => {
      e.preventDefault();
      const url = crateUrl.value.trim();
      if (!url) return;
      const title = url.split('/').pop().split('?')[0] || 'Custom Track';
      const customTrack = {
        guid: 'custom-' + Date.now(),
        title,
        podcastTitle: 'Custom Stream',
        audioUrl: url,
        url: url,
        source: 'queue'
      };
      state.queue.unshift(customTrack);
      state.cachedEpisodes.unshift(customTrack);
      crateUrl.value = '';
      state.activeTab = 'queue';
      crateTabs.forEach(t => t.classList.toggle('active', t.dataset.tab === 'queue'));
      renderCrate();
    });
  }

  loadCrateFromStorage();
})();
