/**
 * Podcast Pulse - Main Application Logic
 * Passwordless Magic Email Authentication & Cloudflare D1 Sync
 */

(function () {
  'use strict';

  const STORAGE_KEYS = {
    FEEDS: 'podcast_pulse_feeds',
    SESSION: 'podcast_pulse_session_token'
  };

  const DEFAULT_STARTER_FEEDS = [
    'https://feeds.simplecast.com/54521442',
    'https://changelog.com/podcast/feed'
  ];

  let state = {
    sessionToken: '',
    userEmail: '',
    feeds: [],
    feedMetadata: {},
    allEpisodes: [],
    filteredEpisodes: [],
    playbackPositions: {},
    currentEpisode: null,
    playbackSpeed: 1.0,
    sortOrder: 'newest',
    searchQuery: '',
    ytPlayer: null,
    ytReady: false,
    activeEngine: 'audio',
    sleepTimer: {
      active: false,
      minutes: 0,
      endTime: null,
      intervalId: null,
      fadeout: true,
      initialVolume: 1.0
    }
  };

  const elements = {
    authModal: document.getElementById('auth-modal'),
    magicAuthForm: document.getElementById('magic-auth-form'),
    magicEmailInput: document.getElementById('magic-email-input'),
    btnSubmitMagic: document.getElementById('btn-submit-magic'),
    magicStatusMsg: document.getElementById('magic-status-msg'),
    userSyncStatus: document.getElementById('user-sync-status'),
    btnShowLogin: document.getElementById('btn-show-login'),

    tabs: document.querySelectorAll('.nav-tab'),
    panels: document.querySelectorAll('.tab-panel'),
    feedCount: document.getElementById('feed-count'),

    searchInput: document.getElementById('search-input'),
    sortOrderSelect: document.getElementById('sort-order'),
    btnOpenAddModal: document.getElementById('btn-open-add-modal'),
    btnRefreshAll: document.getElementById('btn-refresh-all'),
    statusBanner: document.getElementById('status-banner'),

    timelineList: document.getElementById('timeline-list'),
    feedsGrid: document.getElementById('feeds-grid'),

    opmlFileInput: document.getElementById('opml-file-input'),
    btnExportOpml: document.getElementById('btn-export-opml'),
    btnLoadDefaults: document.getElementById('btn-load-defaults'),
    btnClearStorage: document.getElementById('btn-clear-storage'),

    addModal: document.getElementById('add-modal'),
    podcastSearchQuery: document.getElementById('podcast-search-query'),
    btnSearchDirectory: document.getElementById('btn-search-directory'),
    searchDirectoryResults: document.getElementById('search-directory-results'),
    feedUrlInput: document.getElementById('feed-url-input'),
    btnCloseAdd: document.getElementById('btn-close-add'),
    btnCancelAdd: document.getElementById('btn-cancel-add'),
    btnSubmitFeed: document.getElementById('btn-submit-feed'),

    sleepModal: document.getElementById('sleep-modal'),
    btnCloseSleep: document.getElementById('btn-close-sleep'),
    btnOpenSleep: document.getElementById('btn-open-sleep'),
    sleepBadge: document.getElementById('sleep-badge'),
    timerBtns: document.querySelectorAll('.timer-btn'),
    fadeoutCheck: document.getElementById('fadeout-check'),

    audio: document.getElementById('audio-engine'),
    playerArtwork: document.getElementById('player-artwork'),
    playerTitle: document.getElementById('player-title'),
    playerPodcast: document.getElementById('player-podcast'),
    btnPlayToggle: document.getElementById('btn-play-toggle'),
    iconPlay: document.querySelector('.icon-play'),
    iconPause: document.querySelector('.icon-pause'),
    btnPrev15: document.getElementById('btn-prev-15'),
    btnNext15: document.getElementById('btn-next-15'),
    currentTimeLabel: document.getElementById('current-time'),
    totalDurationLabel: document.getElementById('total-duration'),
    seekBar: document.getElementById('seek-bar'),
    btnSpeedToggle: document.getElementById('btn-speed-toggle')
  };

  window.onYouTubeIframeAPIReady = function () {
    state.ytPlayer = new YT.Player('yt-player', {
      height: '1',
      width: '1',
      playerVars: {
        autoplay: 0,
        controls: 0,
        playsinline: 1,
        enablejsapi: 1,
        origin: window.location.origin
      },
      events: {
        onReady: () => {
          state.ytReady = true;
        },
        onStateChange: (event) => {
          if (state.activeEngine === 'youtube') {
            if (event.data === YT.PlayerState.PLAYING) {
              updatePlayerUI(true);
            } else if (event.data === YT.PlayerState.PAUSED) {
              updatePlayerUI(false);
            } else if (event.data === YT.PlayerState.ENDED) {
              onEpisodeEnded();
            }
          }
        }
      }
    });
  };

  function init() {
    checkUrlSessionParam();
    loadFeedsFromStorage();
    setupEventListeners();
    setupAudioEngines();
    checkAuth();
  }

  function checkUrlSessionParam() {
    const urlParams = new URLSearchParams(window.location.search);
    const sessionParam = urlParams.get('session');
    if (sessionParam) {
      state.sessionToken = sessionParam;
      localStorage.setItem(STORAGE_KEYS.SESSION, sessionParam);
      window.history.replaceState({}, document.title, window.location.pathname);
    } else {
      state.sessionToken = localStorage.getItem(STORAGE_KEYS.SESSION) || '';
    }
  }

  function checkAuth() {
    if (state.sessionToken) {
      elements.authModal.classList.add('hidden');
      updateSyncStatusUI('Authenticated via Magic Session (Cloud D1 Synced)');
      syncFeedsWithD1();
    } else {
      elements.authModal.classList.remove('hidden');
      updateSyncStatusUI('Logged in as guest / local device storage');
      if (state.feeds.length > 0) {
        refreshAllFeeds();
      } else {
        renderTimeline();
      }
    }
  }

  function updateSyncStatusUI(statusText) {
    if (elements.userSyncStatus) {
      elements.userSyncStatus.textContent = statusText;
    }
  }

  async function submitMagicAuth() {
    const email = elements.magicEmailInput.value.trim();
    if (!email || !email.includes('@')) return;

    elements.magicStatusMsg.style.display = 'block';
    elements.magicStatusMsg.style.color = '#a5b4fc';
    elements.magicStatusMsg.textContent = 'Sending sign-in link...';

    try {
      const res = await fetch('/api/auth/send-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      });

      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || 'Failed to send link');

      elements.magicStatusMsg.textContent = `📧 Sign-in link sent! Check your email inbox to complete sign in.`;
    } catch (e) {
      elements.magicStatusMsg.style.color = '#fca5a5';
      elements.magicStatusMsg.textContent = `Error: ${e.message}`;
    }
  }

  async function syncFeedsWithD1() {
    if (!state.sessionToken) return;

    showStatus('Syncing feeds & playback state with Cloud D1...');
    try {
      const res = await fetch('/api/sync/feeds', {
        headers: { 'X-Session-Token': state.sessionToken }
      });

      if (res.status === 401) {
        localStorage.removeItem(STORAGE_KEYS.SESSION);
        state.sessionToken = '';
        elements.authModal.classList.remove('hidden');
        return;
      }

      const data = await res.json();
      if (Array.isArray(data.feeds) && data.feeds.length > 0) {
        state.feeds = data.feeds.map(f => f.feed_url);
        saveFeedsToStorage();
      }

      await loadPlaybackPositionsFromD1();
      await refreshAllFeeds();

    } catch (err) {
      console.warn('D1 sync warning:', err);
    } finally {
      hideStatus();
    }
  }

  async function saveFeedToD1(feedUrl, title = '', artwork = '') {
    if (!state.sessionToken) return;
    try {
      await fetch('/api/sync/feeds', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Session-Token': state.sessionToken
        },
        body: JSON.stringify({ feedUrl, title, artwork })
      });
    } catch (e) {}
  }

  async function removeFeedFromD1(feedUrl) {
    if (!state.sessionToken) return;
    try {
      await fetch('/api/sync/feeds', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'X-Session-Token': state.sessionToken
        },
        body: JSON.stringify({ feedUrl })
      });
    } catch (e) {}
  }

  async function loadPlaybackPositionsFromD1() {
    if (!state.sessionToken) return;
    try {
      const res = await fetch('/api/sync/position', {
        headers: { 'X-Session-Token': state.sessionToken }
      });
      if (res.ok) {
        const data = await res.json();
        if (data.positions) {
          state.playbackPositions = data.positions;
        }
      }
    } catch (e) {}
  }

  async function savePlaybackPositionToD1(episodeGuid, positionSeconds, completed = false) {
    if (!state.sessionToken || !episodeGuid) return;
    try {
      await fetch('/api/sync/position', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Session-Token': state.sessionToken
        },
        body: JSON.stringify({ episodeGuid, positionSeconds, completed })
      });
    } catch (e) {}
  }

  function loadFeedsFromStorage() {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.FEEDS);
      state.feeds = saved ? JSON.parse(saved) : [];
      updateFeedCountUI();
    } catch (e) {
      state.feeds = [];
    }
  }

  function saveFeedsToStorage() {
    try {
      localStorage.setItem(STORAGE_KEYS.FEEDS, JSON.stringify(state.feeds));
      updateFeedCountUI();
    } catch (e) {}
  }

  function updateFeedCountUI() {
    if (elements.feedCount) {
      elements.feedCount.textContent = state.feeds.length;
    }
  }

  async function refreshAllFeeds() {
    if (state.feeds.length === 0) {
      renderTimeline();
      renderFeedsGrid();
      return;
    }

    showStatus('Refreshing feeds...');
    state.allEpisodes = [];
    state.feedMetadata = {};

    const fetchPromises = state.feeds.map(url => fetchSingleFeed(url));
    await Promise.allSettled(fetchPromises);

    hideStatus();
    processAndSortEpisodes();
    renderTimeline();
    renderFeedsGrid();
  }

  async function fetchSingleFeed(url) {
    try {
      const apiUrl = `/api/feed?url=${encodeURIComponent(url)}`;
      const headers = {};
      if (state.sessionToken) headers['X-Session-Token'] = state.sessionToken;

      const response = await fetch(apiUrl, { headers });

      if (response.status === 401) {
        elements.authModal.classList.remove('hidden');
        throw new Error('Unauthorized');
      }

      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const feedData = await response.json();
      if (feedData.error) {
        state.feedMetadata[url] = {
          title: feedData.title || 'Unavailable Feed',
          artwork: '',
          episodesCount: 0,
          error: feedData.error
        };
        return null;
      }

      state.feedMetadata[url] = {
        title: feedData.title,
        artwork: feedData.artwork,
        episodesCount: feedData.episodesCount,
        description: feedData.description
      };

      if (Array.isArray(feedData.episodes)) {
        state.allEpisodes.push(...feedData.episodes);
      }

      return feedData;
    } catch (err) {
      state.feedMetadata[url] = {
        title: 'Error Loading Feed',
        artwork: '',
        episodesCount: 0,
        error: err.message
      };
      return null;
    }
  }

  function processAndSortEpisodes() {
    let list = [...state.allEpisodes];

    if (state.searchQuery) {
      const q = state.searchQuery.toLowerCase();
      list = list.filter(ep => 
        ep.title.toLowerCase().includes(q) || 
        ep.podcastTitle.toLowerCase().includes(q) ||
        (ep.description && ep.description.toLowerCase().includes(q))
      );
    }

    if (state.sortOrder === 'newest') {
      list.sort((a, b) => b.timestamp - a.timestamp);
    } else {
      list.sort((a, b) => a.timestamp - b.timestamp);
    }

    state.filteredEpisodes = list;
  }

  async function searchPodcastDirectory(query) {
    const q = query.trim();
    if (!q) return;

    elements.searchDirectoryResults.innerHTML = `<p style="color: var(--text-muted); padding: 0.5rem;">Searching directory...</p>`;

    try {
      const searchUrl = `https://itunes.apple.com/search?term=${encodeURIComponent(q)}&entity=podcast&limit=8`;
      const res = await fetch(searchUrl);
      if (!res.ok) throw new Error('Search failed');

      const data = await res.json();
      renderDirectorySearchResults(data.results || []);
    } catch (e) {
      elements.searchDirectoryResults.innerHTML = `<p style="color: #fca5a5; padding: 0.5rem;">Error searching directory: ${escapeHtml(e.message)}</p>`;
    }
  }

  function renderDirectorySearchResults(results) {
    const container = elements.searchDirectoryResults;
    container.innerHTML = '';

    if (results.length === 0) {
      container.innerHTML = `<p style="color: var(--text-muted); padding: 0.5rem;">No podcasts found matching your query.</p>`;
      return;
    }

    results.forEach(item => {
      if (!item.feedUrl) return;

      const isSubbed = state.feeds.includes(item.feedUrl);

      const card = document.createElement('div');
      card.style.cssText = 'display: flex; align-items: center; justify-content: space-between; gap: 0.75rem; background: var(--bg-card); border: 1px solid var(--border-light); border-radius: var(--radius-sm); padding: 0.75rem;';

      card.innerHTML = `
        <div style="display: flex; align-items: center; gap: 0.75rem; min-width: 0;">
          <img src="${item.artworkUrl100 || item.artworkUrl600}" alt="" style="width: 44px; height: 44px; border-radius: 6px; object-fit: cover;">
          <div style="min-width: 0;">
            <div style="font-weight: 600; font-size: 0.9rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${escapeHtml(item.collectionName || item.trackName)}</div>
            <div style="font-size: 0.775rem; color: var(--text-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${escapeHtml(item.artistName || '')}</div>
          </div>
        </div>
        <button class="btn ${isSubbed ? 'btn-secondary' : 'btn-primary'} btn-sm btn-sub-dir" ${isSubbed ? 'disabled' : ''}>
          ${isSubbed ? 'Subscribed' : 'Add Feed'}
        </button>
      `;

      if (!isSubbed) {
        card.querySelector('.btn-sub-dir').addEventListener('click', () => {
          addFeed(item.feedUrl, item.collectionName || item.trackName, item.artworkUrl600 || item.artworkUrl100);
        });
      }

      container.appendChild(card);
    });
  }

  function renderTimeline() {
    const container = elements.timelineList;
    container.innerHTML = '';

    if (state.feeds.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">🎙️</div>
          <h3>No podcasts added yet</h3>
          <p>Search for any podcast by name or paste an RSS feed URL to start listening.</p>
          <button class="btn btn-primary" id="btn-empty-add-trigger">Search / Add Podcast</button>
        </div>
      `;
      document.getElementById('btn-empty-add-trigger')?.addEventListener('click', openAddModal);
      return;
    }

    if (state.filteredEpisodes.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">🔍</div>
          <h3>No episodes found</h3>
          <p>Try clearing your search query or refreshing your feeds.</p>
        </div>
      `;
      return;
    }

    state.filteredEpisodes.forEach(ep => {
      const isCurrentlyPlaying = state.currentEpisode && state.currentEpisode.guid === ep.guid;
      const isPlayingActive = isCurrentlyPlaying && isEnginePlaying();

      const savedPos = state.playbackPositions[ep.guid];
      const resumeTimeStr = savedPos && savedPos.position > 5 ? ` • Resumes at ${formatTime(savedPos.position)}` : '';

      const card = document.createElement('div');
      card.className = `episode-card ${isCurrentlyPlaying ? 'playing' : ''}`;
      card.dataset.guid = ep.guid;

      const formattedDate = ep.timestamp 
        ? new Date(ep.timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
        : 'Unknown date';

      card.innerHTML = `
        <img class="episode-artwork" src="${ep.artwork || 'data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'50\' height=\'50\' viewBox=\'0 0 24 24\' fill=\'none\' stroke=\'%23666\' stroke-width=\'2\'%3E%3Cpath d=\'M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z\'/%3E%3C/svg%3E'}" alt="" loading="lazy" onerror="this.src='data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'50\' height=\'50\' viewBox=\'0 0 24 24\' fill=\'none\' stroke=\'%23666\' stroke-width=\'2\'%3E%3Cpath d=\'M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z\'/%3E%3C/svg%3E';">
        <div class="episode-details">
          <div class="episode-podcast-name">${ep.isYouTube ? '▶️ YOUTUBE MUSIC' : escapeHtml(ep.podcastTitle)}</div>
          <div class="episode-title">${escapeHtml(ep.title)}</div>
          <div class="episode-desc">${escapeHtml(ep.description || '')}</div>
          <div class="episode-meta">
            <span>📅 ${formattedDate}</span>
            ${ep.duration ? `<span>⏱️ ${escapeHtml(ep.duration)}</span>` : ''}
            <span style="color: #a5b4fc;">${resumeTimeStr}</span>
          </div>
        </div>
        <button class="btn-play-ep" title="${isPlayingActive ? 'Pause' : 'Play'}">
          ${isPlayingActive 
            ? `<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>`
            : `<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>`
          }
        </button>
      `;

      card.querySelector('.btn-play-ep').addEventListener('click', (e) => {
        e.stopPropagation();
        toggleEpisodePlayback(ep);
      });

      container.appendChild(card);
    });
  }

  function renderFeedsGrid() {
    const grid = elements.feedsGrid;
    grid.innerHTML = '';

    if (state.feeds.length === 0) {
      grid.innerHTML = `<p style="color: var(--text-muted);">No subscriptions yet.</p>`;
      return;
    }

    state.feeds.forEach(url => {
      const meta = state.feedMetadata[url] || {};
      const card = document.createElement('div');
      card.className = 'feed-card';

      card.innerHTML = `
        <div class="feed-header">
          <img class="feed-art" src="${meta.artwork || 'data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'50\' height=\'50\' viewBox=\'0 0 24 24\' fill=\'none\' stroke=\'%23666\' stroke-width=\'2\'%3E%3Cpath d=\'M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z\'/%3E%3C/svg%3E'}" alt="" onerror="this.src='data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'50\' height=\'50\' viewBox=\'0 0 24 24\' fill=\'none\' stroke=\'%23666\' stroke-width=\'2\'%3E%3Cpath d=\'M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z\'/%3E%3C/svg%3E';">
          <div class="feed-info">
            <h4>${escapeHtml(meta.title || url)}</h4>
            <p>${meta.error ? `<span style="color: #fca5a5;">${escapeHtml(meta.error)}</span>` : `${meta.episodesCount} episodes`}</p>
          </div>
        </div>
        <div class="feed-actions">
          <button class="btn btn-danger btn-sm btn-remove-feed">Remove</button>
        </div>
      `;

      card.querySelector('.btn-remove-feed').addEventListener('click', () => {
        removeFeed(url);
      });

      grid.appendChild(card);
    });
  }

  function setupAudioEngines() {
    const audio = elements.audio;

    audio.addEventListener('timeupdate', () => {
      if (state.activeEngine === 'audio') updateProgress();
    });
    audio.addEventListener('loadedmetadata', () => {
      if (state.activeEngine === 'audio') updateDuration();
    });
    audio.addEventListener('ended', () => {
      if (state.activeEngine === 'audio') onEpisodeEnded();
    });
    audio.addEventListener('play', () => {
      if (state.activeEngine === 'audio') updatePlayerUI(true);
    });
    audio.addEventListener('pause', () => {
      if (state.activeEngine === 'audio') updatePlayerUI(false);
    });

    elements.seekBar.addEventListener('input', () => {
      const pct = elements.seekBar.value / 100;
      if (state.activeEngine === 'audio' && audio.duration) {
        audio.currentTime = pct * audio.duration;
      } else if (state.activeEngine === 'youtube' && state.ytPlayer && state.ytPlayer.getDuration) {
        const dur = state.ytPlayer.getDuration();
        if (dur) state.ytPlayer.seekTo(pct * dur, true);
      }
    });

    setInterval(() => {
      if (state.currentEpisode && isEnginePlaying()) {
        let currentPos = 0;
        if (state.activeEngine === 'audio') {
          currentPos = elements.audio.currentTime || 0;
        } else if (state.activeEngine === 'youtube' && state.ytPlayer && state.ytPlayer.getCurrentTime) {
          currentPos = state.ytPlayer.getCurrentTime() || 0;
        }
        if (currentPos > 3) {
          savePlaybackPositionToD1(state.currentEpisode.guid, currentPos);
        }
      }
    }, 8000);

    setInterval(() => {
      if (state.activeEngine === 'youtube' && state.ytPlayer && state.ytPlayer.getCurrentTime) {
        updateProgress();
        updateDuration();
      }
    }, 500);

    elements.btnPlayToggle.addEventListener('click', () => {
      if (!state.currentEpisode) {
        if (state.filteredEpisodes.length > 0) playEpisode(state.filteredEpisodes[0]);
        return;
      }

      if (isEnginePlaying()) {
        pauseCurrentEngine();
      } else {
        playCurrentEngine();
      }
    });

    elements.btnPrev15.addEventListener('click', () => {
      if (state.activeEngine === 'audio') {
        audio.currentTime = Math.max(0, audio.currentTime - 15);
      } else if (state.activeEngine === 'youtube' && state.ytPlayer && state.ytPlayer.getCurrentTime) {
        const cur = state.ytPlayer.getCurrentTime();
        state.ytPlayer.seekTo(Math.max(0, cur - 15), true);
      }
    });

    elements.btnNext15.addEventListener('click', () => {
      if (state.activeEngine === 'audio' && audio.duration) {
        audio.currentTime = Math.min(audio.duration, audio.currentTime + 15);
      } else if (state.activeEngine === 'youtube' && state.ytPlayer && state.ytPlayer.getCurrentTime) {
        const cur = state.ytPlayer.getCurrentTime();
        const dur = state.ytPlayer.getDuration();
        state.ytPlayer.seekTo(Math.min(dur, cur + 15), true);
      }
    });

    elements.btnSpeedToggle.addEventListener('click', cyclePlaybackSpeed);

    if ('mediaSession' in navigator) {
      navigator.mediaSession.setActionHandler('play', () => playCurrentEngine());
      navigator.mediaSession.setActionHandler('pause', () => pauseCurrentEngine());
      navigator.mediaSession.setActionHandler('seekbackward', () => {
        if (state.activeEngine === 'audio') audio.currentTime = Math.max(0, audio.currentTime - 15);
      });
      navigator.mediaSession.setActionHandler('seekforward', () => {
        if (state.activeEngine === 'audio' && audio.duration) audio.currentTime = Math.min(audio.duration, audio.currentTime + 15);
      });
    }
  }

  function isEnginePlaying() {
    if (state.activeEngine === 'audio') {
      return !elements.audio.paused;
    } else if (state.activeEngine === 'youtube' && state.ytPlayer && state.ytPlayer.getPlayerState) {
      return state.ytPlayer.getPlayerState() === YT.PlayerState.PLAYING;
    }
    return false;
  }

  function playCurrentEngine() {
    if (state.activeEngine === 'audio') {
      elements.audio.play();
    } else if (state.activeEngine === 'youtube' && state.ytPlayer) {
      state.ytPlayer.playVideo();
    }
  }

  function pauseCurrentEngine() {
    if (state.activeEngine === 'audio') {
      elements.audio.pause();
    } else if (state.activeEngine === 'youtube' && state.ytPlayer) {
      state.ytPlayer.pauseVideo();
    }
  }

  function toggleEpisodePlayback(episode) {
    if (state.currentEpisode && state.currentEpisode.guid === episode.guid) {
      if (isEnginePlaying()) {
        pauseCurrentEngine();
      } else {
        playCurrentEngine();
      }
    } else {
      playEpisode(episode);
    }
  }

  function playEpisode(episode) {
    state.currentEpisode = episode;

    elements.audio.pause();
    if (state.ytPlayer && state.ytPlayer.stopVideo) {
      state.ytPlayer.stopVideo();
    }

    const savedPos = state.playbackPositions[episode.guid];
    const startTime = (savedPos && savedPos.position > 5) ? savedPos.position : 0;

    if (episode.isYouTube || episode.videoId || episode.playlistId) {
      state.activeEngine = 'youtube';
      if (state.ytReady && state.ytPlayer) {
        if (episode.isYouTubePlaylist && episode.playlistId) {
          state.ytPlayer.loadPlaylist({
            list: episode.playlistId,
            listType: 'playlist'
          });
        } else if (episode.videoId) {
          state.ytPlayer.loadVideoById({ videoId: episode.videoId, startSeconds: startTime });
        }
        state.ytPlayer.setPlaybackRate(state.playbackSpeed);
      } else {
        alert('YouTube Player is initializing, please try playing in a few seconds.');
        return;
      }
    } else {
      state.activeEngine = 'audio';
      elements.audio.src = episode.audioUrl;
      elements.audio.playbackRate = state.playbackSpeed;
      if (startTime > 0) elements.audio.currentTime = startTime;
      elements.audio.play().catch(e => console.warn('Autoplay blocked:', e));
    }

    elements.playerTitle.textContent = episode.title;
    elements.playerPodcast.textContent = episode.podcastTitle;
    if (episode.artwork) {
      elements.playerArtwork.src = episode.artwork;
    }

    if ('mediaSession' in navigator) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: episode.title,
        artist: episode.podcastTitle,
        artwork: episode.artwork ? [{ src: episode.artwork, sizes: '512x512', type: 'image/png' }] : []
      });
    }

    renderTimeline();
  }

  function updateProgress() {
    let current = 0;
    let total = 0;

    if (state.activeEngine === 'audio') {
      current = elements.audio.currentTime || 0;
      total = elements.audio.duration || 0;
    } else if (state.activeEngine === 'youtube' && state.ytPlayer && state.ytPlayer.getCurrentTime) {
      current = state.ytPlayer.getCurrentTime() || 0;
      total = state.ytPlayer.getDuration() || 0;
    }

    elements.currentTimeLabel.textContent = formatTime(current);
    if (total > 0) {
      elements.seekBar.value = (current / total) * 100;
    }

    if (state.sleepTimer.active && state.sleepTimer.fadeout && state.sleepTimer.endTime) {
      const remainingSec = Math.max(0, (state.sleepTimer.endTime - Date.now()) / 1000);
      if (remainingSec <= 30 && remainingSec > 0) {
        if (state.activeEngine === 'audio') {
          elements.audio.volume = Math.max(0, (remainingSec / 30) * state.sleepTimer.initialVolume);
        } else if (state.activeEngine === 'youtube' && state.ytPlayer) {
          state.ytPlayer.setVolume(Math.max(0, (remainingSec / 30) * 100));
        }
      }
    }
  }

  function updateDuration() {
    let dur = 0;
    if (state.activeEngine === 'audio') {
      dur = elements.audio.duration;
    } else if (state.activeEngine === 'youtube' && state.ytPlayer && state.ytPlayer.getDuration) {
      dur = state.ytPlayer.getDuration();
    }
    if (dur) {
      elements.totalDurationLabel.textContent = formatTime(dur);
    }
  }

  function onEpisodeEnded() {
    if (state.currentEpisode) {
      savePlaybackPositionToD1(state.currentEpisode.guid, 0, true);
    }

    if (state.sleepTimer.active && state.sleepTimer.minutes === 'end') {
      stopSleepTimer();
      pauseCurrentEngine();
      return;
    }

    if (state.currentEpisode) {
      const idx = state.filteredEpisodes.findIndex(e => e.guid === state.currentEpisode.guid);
      if (idx !== -1 && idx + 1 < state.filteredEpisodes.length) {
        playEpisode(state.filteredEpisodes[idx + 1]);
      }
    }
  }

  function updatePlayerUI(isPlaying) {
    if (isPlaying) {
      elements.iconPlay.classList.add('hidden');
      elements.iconPause.classList.remove('hidden');
    } else {
      elements.iconPlay.classList.remove('hidden');
      elements.iconPause.classList.add('hidden');
    }
    renderTimeline();
  }

  function cyclePlaybackSpeed() {
    const speeds = [1.0, 1.25, 1.5, 2.0, 0.8];
    let nextIdx = speeds.indexOf(state.playbackSpeed) + 1;
    if (nextIdx >= speeds.length) nextIdx = 0;

    state.playbackSpeed = speeds[nextIdx];
    
    if (state.activeEngine === 'audio') {
      elements.audio.playbackRate = state.playbackSpeed;
    } else if (state.activeEngine === 'youtube' && state.ytPlayer && state.ytPlayer.setPlaybackRate) {
      state.ytPlayer.setPlaybackRate(state.playbackSpeed);
    }

    elements.btnSpeedToggle.textContent = `${state.playbackSpeed}x`;
  }

  function startSleepTimer(minutes) {
    stopSleepTimer();
    if (minutes === 0) return;

    state.sleepTimer.active = true;
    state.sleepTimer.minutes = minutes;
    state.sleepTimer.initialVolume = elements.audio.volume || 1.0;

    if (minutes !== 'end') {
      const ms = minutes * 60 * 1000;
      state.sleepTimer.endTime = Date.now() + ms;

      state.sleepTimer.intervalId = setInterval(() => {
        const remaining = Math.max(0, state.sleepTimer.endTime - Date.now());
        if (remaining <= 0) {
          pauseCurrentEngine();
          elements.audio.volume = state.sleepTimer.initialVolume;
          stopSleepTimer();
        }
      }, 1000);
    }

    elements.sleepBadge.classList.remove('hidden');
    closeSleepModal();
  }

  function stopSleepTimer() {
    if (state.sleepTimer.intervalId) {
      clearInterval(state.sleepTimer.intervalId);
    }
    state.sleepTimer = {
      active: false,
      minutes: 0,
      endTime: null,
      intervalId: null,
      fadeout: true,
      initialVolume: 1.0
    };
    elements.sleepBadge.classList.add('hidden');
    closeSleepModal();
  }

  function addFeed(url, title = '', artwork = '') {
    const cleanUrl = url.trim();
    if (!cleanUrl) return;

    if (!state.feeds.includes(cleanUrl)) {
      state.feeds.push(cleanUrl);
      saveFeedsToStorage();
      saveFeedToD1(cleanUrl, title, artwork);
      closeAddModal();
      refreshAllFeeds();
    } else {
      alert('This feed is already in your subscriptions.');
    }
  }

  function removeFeed(url) {
    state.feeds = state.feeds.filter(f => f !== url);
    delete state.feedMetadata[url];
    saveFeedsToStorage();
    removeFeedFromD1(url);
    processAndSortEpisodes();
    renderTimeline();
    renderFeedsGrid();
  }

  function importOpml(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
      const xmlText = e.target.result;
      const parser = new DOMParser();
      const doc = parser.parseFromString(xmlText, 'text/xml');
      const outlines = doc.querySelectorAll('outline[xmlUrl], outline[xmlurl]');

      let addedCount = 0;
      outlines.forEach(node => {
        const feedUrl = node.getAttribute('xmlUrl') || node.getAttribute('xmlurl');
        if (feedUrl && !state.feeds.includes(feedUrl)) {
          state.feeds.push(feedUrl);
          saveFeedToD1(feedUrl, node.getAttribute('text') || '');
          addedCount++;
        }
      });

      if (addedCount > 0) {
        saveFeedsToStorage();
        refreshAllFeeds();
        alert(`Successfully imported ${addedCount} podcast feeds!`);
      } else {
        alert('No new podcast feeds found in this OPML file.');
      }
    };
    reader.readAsText(file);
  }

  function exportOpml() {
    let xml = `<?xml version="1.0" encoding="UTF-8"?>\n<opml version="2.0">\n  <head>\n    <title>Podcast Pulse Export</title>\n  </head>\n  <body>\n`;
    
    state.feeds.forEach(url => {
      const meta = state.feedMetadata[url] || {};
      const title = meta.title ? escapeHtml(meta.title) : 'Podcast';
      xml += `    <outline type="rss" text="${title}" title="${title}" xmlUrl="${escapeHtml(url)}"/>\n`;
    });

    xml += `  </body>\n</opml>`;

    const blob = new Blob([xml], { type: 'text/xml' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'podcast_subscriptions.opml';
    a.click();
  }

  function setupEventListeners() {
    if (elements.magicAuthForm) {
      elements.magicAuthForm.addEventListener('submit', (e) => {
        e.preventDefault();
        submitMagicAuth();
      });
    }

    if (elements.btnShowLogin) {
      elements.btnShowLogin.addEventListener('click', () => {
        elements.authModal.classList.remove('hidden');
      });
    }

    elements.btnSearchDirectory.addEventListener('click', () => {
      searchPodcastDirectory(elements.podcastSearchQuery.value);
    });
    elements.podcastSearchQuery.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        searchPodcastDirectory(elements.podcastSearchQuery.value);
      }
    });

    elements.tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        const targetTab = tab.dataset.tab;
        elements.tabs.forEach(t => t.classList.remove('active'));
        elements.panels.forEach(p => p.classList.remove('active'));

        tab.classList.add('active');
        document.getElementById(`panel-${targetTab}`).classList.add('active');
      });
    });

    elements.searchInput.addEventListener('input', (e) => {
      state.searchQuery = e.target.value;
      processAndSortEpisodes();
      renderTimeline();
    });

    elements.sortOrderSelect.addEventListener('change', (e) => {
      state.sortOrder = e.target.value;
      processAndSortEpisodes();
      renderTimeline();
    });

    elements.btnOpenAddModal.addEventListener('click', openAddModal);
    elements.btnRefreshAll.addEventListener('click', refreshAllFeeds);

    elements.btnCloseAdd.addEventListener('click', closeAddModal);
    elements.btnCancelAdd.addEventListener('click', closeAddModal);
    elements.btnSubmitFeed.addEventListener('click', () => {
      if (elements.feedUrlInput.value) addFeed(elements.feedUrlInput.value);
    });

    elements.btnOpenSleep.addEventListener('click', openSleepModal);
    elements.btnCloseSleep.addEventListener('click', closeSleepModal);
    elements.timerBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const val = btn.dataset.minutes;
        startSleepTimer(val === 'end' ? 'end' : parseInt(val, 10));
      });
    });
    elements.fadeoutCheck.addEventListener('change', (e) => {
      state.sleepTimer.fadeout = e.target.checked;
    });

    elements.opmlFileInput.addEventListener('change', (e) => {
      if (e.target.files.length > 0) importOpml(e.target.files[0]);
    });
    elements.btnExportOpml.addEventListener('click', exportOpml);

    elements.btnLoadDefaults.addEventListener('click', async () => {
      showStatus('Adding recommended starter feeds...');
      const searchTerms = ['ZEIT Geschichte', 'ZEIT WISSEN', 'Weltspiegel Podcast', 'Syntax Podcast'];
      for (const term of searchTerms) {
        try {
          const res = await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(term)}&entity=podcast&limit=1`);
          const data = await res.json();
          if (data.results && data.results[0] && data.results[0].feedUrl) {
            const feedUrl = data.results[0].feedUrl;
            if (!state.feeds.includes(feedUrl)) {
              state.feeds.push(feedUrl);
              saveFeedToD1(feedUrl, data.results[0].collectionName, data.results[0].artworkUrl600);
            }
          }
        } catch (e) {}
      }

      saveFeedsToStorage();
      refreshAllFeeds();
    });

    elements.btnClearStorage.addEventListener('click', () => {
      if (confirm('Are you sure you want to clear all feeds and state?')) {
        localStorage.clear();
        state.feeds = [];
        state.feedMetadata = {};
        state.allEpisodes = [];
        state.filteredEpisodes = [];
        state.currentEpisode = null;
        pauseCurrentEngine();
        updateFeedCountUI();
        renderTimeline();
        renderFeedsGrid();
      }
    });
  }

  function openAddModal() {
    elements.addModal.classList.remove('hidden');
    elements.podcastSearchQuery.focus();
  }

  function closeAddModal() {
    elements.addModal.classList.add('hidden');
    elements.podcastSearchQuery.value = '';
    elements.searchDirectoryResults.innerHTML = '';
    elements.feedUrlInput.value = '';
  }

  function openSleepModal() {
    elements.sleepModal.classList.remove('hidden');
  }

  function closeSleepModal() {
    elements.sleepModal.classList.add('hidden');
  }

  function showStatus(msg) {
    elements.statusBanner.textContent = msg;
    elements.statusBanner.classList.remove('hidden');
  }

  function hideStatus() {
    elements.statusBanner.classList.add('hidden');
  }

  function formatTime(seconds) {
    if (!seconds || isNaN(seconds)) return '0:00';
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    const secStr = secs < 10 ? `0${secs}` : `${secs}`;
    if (hrs > 0) {
      const minStr = mins < 10 ? `0${mins}` : `${mins}`;
      return `${hrs}:${minStr}:${secStr}`;
    }
    return `${mins}:${secStr}`;
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  document.addEventListener('DOMContentLoaded', init);
})();
