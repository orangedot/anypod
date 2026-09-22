(function () {
  'use strict';

  const STORAGE_KEYS = {
    FEEDS: 'podany_feeds',
    SESSION: 'podany_session_token',
    CACHED_EPISODES: 'podany_cached_episodes',
    CACHED_METADATA: 'podany_cached_metadata',
    POSITIONS: 'podany_playback_positions',
    THEME: 'podany_theme'
  };

  const CARD_ICONS = {
    PLAY: '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="6 4 20 12 6 20 6 4"></polygon></svg>',
    PAUSE: '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>',
    SPINNER: '<svg class="spinner" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="9" stroke-opacity="0.25"></circle><path d="M12 3a9 9 0 0 1 9 9" stroke-linecap="round"></path></svg>',
    CHECK: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>'
  };

  const DEFAULT_STARTER_FEEDS = [
    'https://changelog.com/podcast/feed',
    'https://feeds.feedburner.com/syntaxfm'
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
    filterMode: 'unplayed',
    ytPlayer: null,
    ytReady: false,
    activeEngine: 'audio',
    playbackStatus: 'idle',
    timelinePage: 1,
    pageSize: 30,
    activeFeedDetailUrl: null,
    continueCollapsed: true,
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
    btnCloseAuth: document.getElementById('btn-close-auth'),
    btnCancelAuth: document.getElementById('btn-cancel-auth'),
    magicAuthForm: document.getElementById('magic-auth-form'),
    magicEmailInput: document.getElementById('magic-email-input'),
    btnSubmitMagic: document.getElementById('btn-submit-magic'),
    magicStatusMsg: document.getElementById('magic-status-msg'),
    userSyncStatus: document.getElementById('user-sync-status'),
    btnShowLogin: document.getElementById('btn-show-login'),
    userStatusPill: document.getElementById('user-status-pill'),
    statusIndicator: document.getElementById('status-indicator'),
    userEmailLabel: document.getElementById('user-email-label'),
    btnAccountToggle: document.getElementById('btn-account-toggle'),

    confirmModal: document.getElementById('confirm-modal'),
    confirmModalMsg: document.getElementById('confirm-modal-msg'),
    btnConfirmCancel: document.getElementById('btn-confirm-cancel'),
    btnConfirmDelete: document.getElementById('btn-confirm-delete'),
    btnPrev15: document.getElementById('btn-prev-15'),
    btnNext15: document.getElementById('btn-next-15'),
    btnSkipEpisode: document.getElementById('btn-skip-episode'),

    tabs: document.querySelectorAll('.nav-tab'),
    panels: document.querySelectorAll('.tab-panel'),
    tabFeeds: document.getElementById('tab-feeds'),
    tabTimeline: document.getElementById('tab-timeline'),
    panelFeeds: document.getElementById('panel-feeds'),
    panelTimeline: document.getElementById('panel-timeline'),
    panelFeedDetail: document.getElementById('panel-feed-detail'),
    feedDetailHeader: document.getElementById('feed-detail-header'),
    feedDetailEpisodes: document.getElementById('feed-detail-episodes'),
    themeBtns: document.querySelectorAll('.btn-theme'),
    feedCount: document.getElementById('feed-count'),

    searchInput: document.getElementById('search-input'),
    sortOrderSelect: document.getElementById('sort-order'),
    btnOpenAddModal: document.getElementById('btn-open-add-modal'),
    btnRefreshAll: document.getElementById('btn-refresh-all'),
    statusBanner: document.getElementById('status-banner'),

    timelineList: document.getElementById('timeline-list'),
    feedsGrid: document.getElementById('feeds-grid'),
    continueShelf: document.getElementById('continue-shelf'),
    continueGrid: document.getElementById('continue-grid'),
    continueCount: document.getElementById('continue-count'),
    btnToggleContinue: document.getElementById('btn-toggle-continue'),
    continueToggleLabel: document.getElementById('continue-toggle-label'),
    playedCount: document.getElementById('played-count'),
    filterChips: document.querySelectorAll('.chip-filter'),

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
    playerBar: document.getElementById('player-bar'),
    playerArtwork: document.getElementById('player-artwork'),
    playerTitle: document.getElementById('player-title'),
    playerPodcast: document.getElementById('player-podcast'),
    btnPlayToggle: document.getElementById('btn-play-toggle'),
    iconPlay: document.querySelector('.icon-play'),
    iconPause: document.querySelector('.icon-pause'),
    iconSpinner: document.querySelector('.icon-spinner'),
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
            if (event.data === YT.PlayerState.BUFFERING) {
              state.playbackStatus = 'loading';
              syncPlaybackButtons();
            } else if (event.data === YT.PlayerState.PLAYING) {
              state.playbackStatus = 'playing';
              syncPlaybackButtons();
            } else if (event.data === YT.PlayerState.PAUSED) {
              state.playbackStatus = 'paused';
              syncPlaybackButtons();
            } else if (event.data === YT.PlayerState.ENDED) {
              state.playbackStatus = 'idle';
              syncPlaybackButtons();
              onEpisodeEnded();
            }
          }
        }
      }
    });
  };

  function initTheme() {
    const saved = localStorage.getItem(STORAGE_KEYS.THEME) || 'system';
    applyTheme(saved);
    if (window.matchMedia) {
      window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
        const current = localStorage.getItem(STORAGE_KEYS.THEME) || 'system';
        if (current === 'system') {
          applyTheme('system');
        }
      });
    }
  }

  function applyTheme(theme) {
    if (theme === 'system') {
      document.documentElement.removeAttribute('data-theme');
    } else {
      document.documentElement.setAttribute('data-theme', theme);
    }
    if (elements.themeBtns) {
      elements.themeBtns.forEach(btn => {
        if (btn.dataset.themeVal === theme) {
          btn.classList.add('active');
        } else {
          btn.classList.remove('active');
        }
      });
    }
  }

  function setTheme(theme) {
    localStorage.setItem(STORAGE_KEYS.THEME, theme);
    applyTheme(theme);
  }

  function init() {
    initTheme();
    checkUrlSessionParam();
    loadPositionsFromStorage();
    loadFeedsFromStorage();
    loadCacheFromStorage();
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
      state.sessionToken = localStorage.getItem(STORAGE_KEYS.SESSION) || localStorage.getItem('podcast_pulse_session_token') || '';
    }
  }

  async function checkAuth() {
    if (state.sessionToken) {
      elements.authModal.classList.add('hidden');
      updateSyncStatusUI('Authenticated via Magic Session (Cloud D1 Synced)');
      syncFeedsWithD1();
      return;
    }

    try {
      const res = await fetch('/api/sync/feeds', { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        elements.authModal.classList.add('hidden');
        state.userEmail = data.userEmail || '';
        updateSyncStatusUI('Authenticated via Session Cookie (Cloud D1 Synced)', state.userEmail, true);
        state.feeds = Array.isArray(data.feeds) ? data.feeds.map(f => f.feed_url) : [];
        saveFeedsToStorage();
        await loadPlaybackPositionsFromD1();
        await refreshAllFeeds();
        return;
      }
    } catch (e) {}

    elements.authModal.classList.remove('hidden');
    updateSyncStatusUI('Logged in as guest / local device storage');
    if (state.feeds.length > 0) {
      refreshAllFeeds();
    } else {
      renderTimeline();
    }
  }

  function updateSyncStatusUI(statusText, email = '', isConnected = false) {
    if (elements.userSyncStatus) {
      elements.userSyncStatus.textContent = statusText;
    }
    if (elements.statusIndicator) {
      if (isConnected) {
        elements.statusIndicator.classList.add('online');
      } else {
        elements.statusIndicator.classList.remove('online');
      }
    }
    if (elements.userEmailLabel) {
      elements.userEmailLabel.textContent = email || (isConnected ? 'Logged In' : 'Guest Mode');
    }
    if (elements.btnAccountToggle) {
      elements.btnAccountToggle.textContent = isConnected ? 'Sign Out' : 'Log In';
    }
  }

  function getWebmailProvider(email) {
    if (!email || !email.includes('@')) return null;
    const domain = email.split('@')[1].toLowerCase().trim();
    if (domain === 'gmail.com' || domain === 'googlemail.com') {
      return { name: 'Gmail', url: 'https://mail.google.com/' };
    }
    if (['outlook.com', 'hotmail.com', 'live.com', 'msn.com', 'outlook.de'].includes(domain)) {
      return { name: 'Outlook', url: 'https://outlook.live.com/mail/' };
    }
    if (domain === 'ue-germany.de') {
      return { name: 'Outlook (UE Germany)', url: 'https://outlook.office.com/mail/' };
    }
    if (['yahoo.com', 'ymail.com', 'yahoo.de', 'yahoo.fr', 'yahoo.co.uk'].includes(domain)) {
      return { name: 'Yahoo Mail', url: 'https://mail.yahoo.com/' };
    }
    if (['icloud.com', 'me.com', 'mac.com'].includes(domain)) {
      return { name: 'iCloud Mail', url: 'https://www.icloud.com/mail/' };
    }
    if (domain === 'proton.me' || domain === 'protonmail.com') {
      return { name: 'Proton Mail', url: 'https://mail.proton.me/' };
    }
    if (domain.startsWith('gmx.')) {
      return { name: 'GMX', url: 'https://www.gmx.net/' };
    }
    if (domain === 'web.de') {
      return { name: 'WEB.DE', url: 'https://web.de/' };
    }
    if (domain === 't-online.de') {
      return { name: 'Telekom Mail', url: 'https://email.t-online.de/' };
    }
    if (domain === 'posteo.de' || domain === 'posteo.net' || domain === 'posteo.org') {
      return { name: 'Posteo', url: 'https://posteo.de/' };
    }
    if (domain === 'mailbox.org') {
      return { name: 'mailbox.org', url: 'https://mailbox.org/' };
    }
    if (domain === 'freenet.de') {
      return { name: 'freenet Mail', url: 'https://email.freenet.de/' };
    }
    if (domain === 'zoho.com' || domain === 'zoho.eu') {
      return { name: 'Zoho Mail', url: 'https://mail.zoho.com/' };
    }
    if (domain === 'fastmail.com' || domain === 'fastmail.fm') {
      return { name: 'Fastmail', url: 'https://app.fastmail.com/' };
    }
    if (domain === 'ionos.de' || domain === 'ionos.com' || domain === 'online.de') {
      return { name: 'IONOS Webmail', url: 'https://mail.ionos.de/' };
    }
    return { name: domain, url: `https://${domain}` };
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
        body: JSON.stringify({ email, origin: window.location.origin })
      });

      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || 'Failed to send link');

      const provider = getWebmailProvider(email);
      let content = '<div style="margin-top: 6px; line-height: 1.45;">';
      content += '<div style="color: #cbd5e1;">Sign-in link sent! Check your email inbox (and spam folder) to complete sign in.</div>';

      if (data.verifyUrl) {
        content += `<div style="margin-top: 10px;"><span style="color:#22c55e; font-weight: 600;">${escapeHtml(data.sandboxNotice || data.devNotice || 'Direct Login:')}</span> <a href="${escapeHtml(data.verifyUrl)}" style="color:#60a5fa; text-decoration:underline; font-weight: 500;">Click here to sign in instantly</a></div>`;
      }

      if (provider) {
        content += `<div style="margin-top: 12px;">
          <a href="${escapeHtml(provider.url)}" target="_blank" rel="noopener noreferrer" class="btn btn-primary" style="display: flex; align-items: center; justify-content: center; gap: 8px; text-decoration: none; padding: 9px 16px; font-size: 0.9rem; border-radius: 8px; font-weight: 600;">
            <span>Open ${escapeHtml(provider.name)}</span>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>
          </a>
        </div>`;
      }
      content += '</div>';
      elements.magicStatusMsg.innerHTML = content;
    } catch (e) {
      elements.magicStatusMsg.style.color = '#ef4444';
      elements.magicStatusMsg.textContent = `Error: ${e.message}`;
    }
  }

  async function syncFeedsWithD1() {
    showStatus('Syncing feeds & playback state with Cloud D1...');
    try {
      const headers = {};
      if (state.sessionToken) headers['X-Session-Token'] = state.sessionToken;

      const res = await fetch('/api/sync/feeds', { headers });

      if (res.status === 401) {
        localStorage.removeItem(STORAGE_KEYS.SESSION);
        state.sessionToken = '';
        updateSyncStatusUI('Session Expired', '', false);
        elements.authModal.classList.remove('hidden');
        return;
      }

      const data = await res.json();
      if (data.userEmail) {
        state.userEmail = data.userEmail;
      }
      updateSyncStatusUI('Cloud D1 Synced', state.userEmail, true);

      const remoteFeeds = Array.isArray(data.feeds) ? data.feeds : [];
      state.feeds = remoteFeeds.map(f => f.feed_url);
      saveFeedsToStorage();

      await loadPlaybackPositionsFromD1();
      await refreshAllFeeds();

    } catch (err) {
      console.warn('D1 sync warning:', err);
    } finally {
      hideStatus();
    }
  }

  async function saveFeedToD1(feedUrl, title = '', artwork = '') {
    try {
      const headers = { 'Content-Type': 'application/json' };
      if (state.sessionToken) headers['X-Session-Token'] = state.sessionToken;
      await fetch('/api/sync/feeds', {
        method: 'POST',
        headers,
        body: JSON.stringify({ feedUrl, title, artwork })
      });
    } catch (e) {}
  }

  async function removeFeedFromD1(feedUrl) {
    try {
      const headers = { 'Content-Type': 'application/json' };
      if (state.sessionToken) headers['X-Session-Token'] = state.sessionToken;
      await fetch('/api/sync/feeds', {
        method: 'DELETE',
        headers,
        body: JSON.stringify({ feedUrl })
      });
    } catch (e) {}
  }

  function savePositionsToStorage() {
    try {
      localStorage.setItem(STORAGE_KEYS.POSITIONS, JSON.stringify(state.playbackPositions));
    } catch (e) {}
  }

  function loadPositionsFromStorage() {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.POSITIONS);
      if (saved) {
        state.playbackPositions = JSON.parse(saved);
      }
    } catch (e) {}
  }

  async function loadPlaybackPositionsFromD1() {
    try {
      const headers = {};
      if (state.sessionToken) headers['X-Session-Token'] = state.sessionToken;
      const res = await fetch('/api/sync/position', { headers });
      if (res.ok) {
        const data = await res.json();
        state.playbackPositions = data.positions || {};
        savePositionsToStorage();
      }
    } catch (e) {}
    renderContinueShelf();
    updateFilterBadges();
  }

  async function savePlaybackPositionToD1(episodeGuid, positionSeconds, completed = false) {
    if (!episodeGuid) return;
    state.playbackPositions[episodeGuid] = {
      position: positionSeconds,
      completed: completed ? 1 : 0,
      lastListenedAt: Math.floor(Date.now() / 1000)
    };
    savePositionsToStorage();
    renderContinueShelf();
    updateFilterBadges();
    try {
      const headers = { 'Content-Type': 'application/json' };
      if (state.sessionToken) headers['X-Session-Token'] = state.sessionToken;
      await fetch('/api/sync/position', {
        method: 'POST',
        headers,
        body: JSON.stringify({ episodeGuid, positionSeconds, completed })
      });
    } catch (e) {}
  }

  function loadFeedsFromStorage() {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.FEEDS) || localStorage.getItem('podcast_pulse_feeds');
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

  function loadCacheFromStorage() {
    try {
      const cachedEps = localStorage.getItem(STORAGE_KEYS.CACHED_EPISODES);
      const cachedMeta = localStorage.getItem(STORAGE_KEYS.CACHED_METADATA);
      if (cachedEps) {
        state.allEpisodes = JSON.parse(cachedEps);
      }
      if (cachedMeta) {
        state.feedMetadata = JSON.parse(cachedMeta);
      }
      if (state.allEpisodes && state.allEpisodes.length > 0) {
        processAndSortEpisodes();
        renderTimeline();
        renderContinueShelf();
        renderFeedsGrid();
      }
    } catch (e) {}
  }

  function saveCacheToStorage() {
    try {
      if (state.allEpisodes && state.allEpisodes.length > 0) {
        const trimmed = state.allEpisodes.slice(0, 500);
        localStorage.setItem(STORAGE_KEYS.CACHED_EPISODES, JSON.stringify(trimmed));
      }
      if (state.feedMetadata) {
        localStorage.setItem(STORAGE_KEYS.CACHED_METADATA, JSON.stringify(state.feedMetadata));
      }
    } catch (e) {}
  }

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

  async function refreshAllFeeds() {
    if (state.feeds.length === 0) {
      state.allEpisodes = [];
      state.filteredEpisodes = [];
      state.feedMetadata = {};
      saveCacheToStorage();
      updateFeedCountUI();
      renderContinueShelf();
      renderTimeline();
      renderFeedsGrid();
      return;
    }

    if (state.allEpisodes.length === 0) {
      renderSkeletonTimeline();
    }

    showStatus('Updating feeds...');
    const incomingEpisodes = [];
    const updatedMetadata = { ...state.feedMetadata };

    const fetchPromises = state.feeds.map(url => fetchSingleFeed(url, incomingEpisodes, updatedMetadata));
    await Promise.allSettled(fetchPromises);

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
    }

    hideStatus();
    processAndSortEpisodes();
    renderTimeline();
    renderFeedsGrid();
  }

  async function fetchSingleFeed(url, incomingEpisodes, updatedMetadata) {
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
        if (!updatedMetadata[url]) {
          updatedMetadata[url] = {
            title: feedData.title || 'Unavailable Feed',
            artwork: '',
            episodesCount: 0,
            error: feedData.error
          };
        }
        return null;
      }

      updatedMetadata[url] = {
        title: feedData.title,
        artwork: feedData.artwork,
        episodesCount: feedData.episodesCount,
        description: feedData.description
      };

      if (Array.isArray(feedData.episodes)) {
        incomingEpisodes.push(...feedData.episodes);
      }

      return feedData;
    } catch (err) {
      if (!updatedMetadata[url]) {
        updatedMetadata[url] = {
          title: 'Error Loading Feed',
          artwork: '',
          episodesCount: 0,
          error: err.message
        };
      }
      return null;
    }
  }

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
  }

  function parseDurationSeconds(durationStr) {
    if (!durationStr || typeof durationStr !== 'string') return 0;
    const parts = durationStr.trim().split(':').map(p => parseFloat(p) || 0);
    if (parts.length === 3) {
      return parts[0] * 3600 + parts[1] * 60 + parts[2];
    } else if (parts.length === 2) {
      return parts[0] * 60 + parts[1];
    } else if (parts.length === 1) {
      return parts[0];
    }
    return 0;
  }

  function formatCompactDate(dateInput) {
    if (!dateInput) return '';
    const d = new Date(dateInput);
    if (isNaN(d.getTime())) return '';
    const now = new Date();
    const diffSec = Math.floor((now - d) / 1000);
    const diffDays = Math.floor(diffSec / 86400);
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays}d ago`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }

  function formatDurationCompact(durStr) {
    if (!durStr) return '';
    const sec = parseDurationSeconds(durStr);
    if (!sec) return '';
    const mins = Math.round(sec / 60);
    if (mins >= 60) {
      const h = Math.floor(mins / 60);
      const m = mins % 60;
      return m > 0 ? `${h}h ${m}m` : `${h}h`;
    }
    return `${mins}m`;
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
        if (isCurrent) return false;
        return !pos || (!pos.completed && (!pos.position || pos.position <= 2));
      });
    } else if (state.filterMode === 'played') {
      list = list.filter(ep => {
        const pos = state.playbackPositions[ep.guid];
        return pos && (pos.completed === 1 || pos.completed === true);
      });
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

  async function searchPodcastDirectory(query, targetContainer = null) {
    const q = query.trim();
    const container = targetContainer || elements.searchDirectoryResults;
    if (!container) return;
    if (!q) {
      container.innerHTML = '';
      return;
    }

    container.innerHTML = `<p style="color: var(--text-muted); padding: 0.5rem;">Searching directory...</p>`;

    try {
      const searchUrl = `https://itunes.apple.com/search?term=${encodeURIComponent(q)}&entity=podcast&limit=8`;
      const res = await fetch(searchUrl);
      if (!res.ok) throw new Error('Search failed');

      const data = await res.json();
      renderDirectorySearchResults(data.results || [], container);
    } catch (e) {
      container.innerHTML = `<p style="color: #fca5a5; padding: 0.5rem;">Error searching directory: ${escapeHtml(e.message)}</p>`;
    }
  }

  function renderDirectorySearchResults(results, targetContainer = null) {
    const container = targetContainer || elements.searchDirectoryResults;
    if (!container) return;
    container.innerHTML = '';

    if (results.length === 0) {
      container.innerHTML = `<p style="color: var(--text-muted); padding: 0.5rem;">No podcasts found matching your query.</p>`;
      return;
    }

    results.forEach(item => {
      if (!item.feedUrl) return;

      const isSubbed = state.feeds.includes(item.feedUrl);
      const relDate = item.releaseDate ? formatCompactDate(item.releaseDate) : '';

      const card = document.createElement('div');
      card.className = 'dir-search-card';

      card.innerHTML = `
        <img src="${item.artworkUrl100 || item.artworkUrl600}" alt="" class="dir-search-art" loading="lazy">
        <div class="dir-search-info">
          <div class="dir-search-title">${escapeHtml(item.collectionName || item.trackName)}</div>
          <div class="dir-search-artist">${escapeHtml(item.artistName || '')}</div>
          <div class="dir-search-tags">
            ${item.primaryGenreName ? `<span class="dir-tag-genre">${escapeHtml(item.primaryGenreName)}</span>` : ''}
            ${item.trackCount ? `<span class="dir-tag-meta">${item.trackCount} eps</span>` : ''}
            ${relDate ? `<span class="dir-tag-meta">• ${relDate}</span>` : ''}
          </div>
        </div>
        <button class="btn ${isSubbed ? 'btn-secondary' : 'btn-primary'} btn-sm btn-sub-dir" style="flex-shrink: 0;" ${isSubbed ? 'disabled' : ''}>
          ${isSubbed ? 'Subscribed' : '+ Add'}
        </button>
      `;

      if (!isSubbed) {
        const subBtn = card.querySelector('.btn-sub-dir');
        subBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          addFeed(item.feedUrl, item.collectionName || item.trackName, item.artworkUrl600 || item.artworkUrl100);
          subBtn.textContent = 'Subscribed';
          subBtn.classList.remove('btn-primary');
          subBtn.classList.add('btn-secondary');
          subBtn.disabled = true;
        });
      }

      container.appendChild(card);
    });
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

    elements.continueShelf.classList.remove('hidden');
    elements.continueGrid.innerHTML = '';

    if (elements.btnToggleContinue && elements.continueToggleLabel) {
      if (inProgressEps.length <= 2) {
        elements.btnToggleContinue.style.display = 'none';
      } else {
        elements.btnToggleContinue.style.display = 'inline-flex';
        if (state.continueCollapsed) {
          elements.continueToggleLabel.textContent = `Show all (${inProgressEps.length})`;
          elements.continueShelf.classList.remove('is-expanded');
        } else {
          elements.continueToggleLabel.textContent = 'Show less';
          elements.continueShelf.classList.add('is-expanded');
        }
      }
    }

    const visibleEps = state.continueCollapsed ? inProgressEps.slice(0, 2) : inProgressEps;
    visibleEps.forEach(ep => {
      elements.continueGrid.appendChild(createEpisodeCard(ep));
    });
  }

  let emptySearchDebounceTimer = null;

  function wireEmptyStateEvents() {
    const quickForm = document.getElementById('empty-quick-form');
    const quickInput = document.getElementById('empty-quick-input');
    const quickSubmit = document.getElementById('btn-empty-quick-submit');
    const quickResults = document.getElementById('empty-quick-results');

    if (quickInput && quickForm) {
      quickInput.addEventListener('input', () => {
        const val = quickInput.value.trim();
        if (quickSubmit) {
          if (val.startsWith('http://') || val.startsWith('https://')) {
            quickSubmit.textContent = 'Add Feed';
          } else {
            quickSubmit.textContent = 'Search';
          }
        }
        if (emptySearchDebounceTimer) clearTimeout(emptySearchDebounceTimer);
        if (!val) {
          if (quickResults) quickResults.innerHTML = '';
          return;
        }
        if (val.startsWith('http://') || val.startsWith('https://')) {
          if (quickResults) quickResults.innerHTML = '';
          return;
        }
        emptySearchDebounceTimer = setTimeout(() => {
          if (quickResults) {
            searchPodcastDirectory(val, quickResults);
          }
        }, 350);
      });

      quickForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const val = quickInput.value.trim();
        if (!val) return;
        if (val.startsWith('http://') || val.startsWith('https://')) {
          if (quickSubmit) quickSubmit.textContent = 'Adding...';
          addFeed(val);
          quickInput.value = '';
          if (quickResults) quickResults.innerHTML = '';
        } else {
          if (emptySearchDebounceTimer) clearTimeout(emptySearchDebounceTimer);
          if (quickResults) {
            searchPodcastDirectory(val, quickResults);
          }
        }
      });
    }

    document.getElementById('btn-empty-opml-trigger')?.addEventListener('click', () => {
      elements.opmlFileInput?.click();
    });
    document.getElementById('btn-empty-defaults-trigger')?.addEventListener('click', () => {
      elements.btnLoadDefaults?.click();
    });
    document.getElementById('btn-empty-goto-settings')?.addEventListener('click', () => {
      const settingsTab = document.getElementById('tab-settings');
      const settingsPanel = document.getElementById('panel-settings');
      elements.tabs.forEach(t => t.classList.remove('active'));
      elements.panels.forEach(p => p.classList.remove('active'));
      if (settingsTab) settingsTab.classList.add('active');
      if (settingsPanel) settingsPanel.classList.add('active');
    });
  }

  function renderTimeline() {
    const container = elements.timelineList;
    container.innerHTML = '';

    if (state.feeds.length === 0) {
      container.innerHTML = `
        <div class="empty-state onboarding-card">
          <div class="empty-icon-wrap">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z"></path><path d="M19 10v2a7 7 0 0 1-14 0v-2"></path><line x1="12" y1="19" x2="12" y2="23"></line><line x1="8" y1="23" x2="16" y2="23"></line></svg>
          </div>
          <h3>No podcasts added yet</h3>
          <p>Search by podcast name, paste any RSS feed URL, or import your existing library.</p>
          <div class="empty-quick-add">
            <form id="empty-quick-form" class="quick-add-form" action="javascript:void(0);">
              <div class="quick-add-input-wrap">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="quick-add-icon"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
                <input type="text" id="empty-quick-input" placeholder="Search podcast or paste RSS URL..." autocomplete="off">
                <button type="submit" class="btn btn-primary btn-quick-submit" id="btn-empty-quick-submit">Add</button>
              </div>
            </form>
            <div id="empty-quick-results" class="quick-results-container"></div>
          </div>
          <div class="empty-actions">
            <button class="btn btn-secondary" id="btn-empty-opml-trigger">Import OPML File</button>
            <button class="btn btn-secondary" id="btn-empty-defaults-trigger">Load Starter Feeds</button>
          </div>
          <div class="empty-footer-hint">
            <span>Migrating from Apple Podcasts, Spotify, or Pocket Casts? Export your OPML file and import it here. Or visit <a href="javascript:void(0);" id="btn-empty-goto-settings" style="color: var(--text-primary); text-decoration: underline;">Settings</a> for sync and cloud storage options.</span>
          </div>
        </div>
      `;
      wireEmptyStateEvents();
      return;
    }

    if (state.filteredEpisodes.length === 0) {
      let emptyTitle = 'No episodes found';
      let emptyMsg = 'Try clearing your search query or refreshing your feeds.';
      if (state.filterMode === 'played') {
        emptyTitle = 'No played episodes';
        emptyMsg = 'Episodes you finish or mark as played will appear here.';
      } else if (state.filterMode === 'continue') {
        emptyTitle = 'No episodes in progress';
        emptyMsg = 'Episodes you start listening to will appear here.';
      } else if (state.filterMode === 'unplayed') {
        emptyTitle = 'All caught up';
        emptyMsg = 'You have listened to all episodes.';
      }
      container.innerHTML = `
        <div class="empty-state">
          <h3>${emptyTitle}</h3>
          <p>${emptyMsg}</p>
        </div>
      `;
      return;
    }

    state.timelinePage = 1;
    appendTimelineBatch();
  }

  let sentinelObserver = null;

  function appendTimelineBatch() {
    const container = elements.timelineList;
    if (!container) return;

    const existingSentinel = document.getElementById('timeline-sentinel');
    if (existingSentinel) existingSentinel.remove();

    const start = (state.timelinePage - 1) * state.pageSize;
    const end = state.timelinePage * state.pageSize;
    const batch = state.filteredEpisodes.slice(start, end);

    const frag = document.createDocumentFragment();
    batch.forEach(ep => {
      frag.appendChild(createEpisodeCard(ep));
    });
    container.appendChild(frag);

    if (end < state.filteredEpisodes.length) {
      const sentinel = document.createElement('div');
      sentinel.id = 'timeline-sentinel';
      sentinel.className = 'timeline-sentinel';
      container.appendChild(sentinel);
      setupSentinelObserver(sentinel);
    }
  }

  function setupSentinelObserver(sentinel) {
    if (sentinelObserver) sentinelObserver.disconnect();
    sentinelObserver = new IntersectionObserver((entries) => {
      if (entries[0] && entries[0].isIntersecting) {
        sentinelObserver.disconnect();
        state.timelinePage++;
        appendTimelineBatch();
      }
    }, { rootMargin: '400px' });
    sentinelObserver.observe(sentinel);
  }

  function toggleMarkPlayed(ep) {
    const current = state.playbackPositions[ep.guid];
    const isCompleted = current && (current.completed === 1 || current.completed === true);
    if (isCompleted) {
      savePlaybackPositionToD1(ep.guid, 0, false);
    } else {
      savePlaybackPositionToD1(ep.guid, 0, true);
    }
    renderContinueShelf();
    if (state.filterMode === 'unplayed' || state.filterMode === 'continue' || state.filterMode === 'played') {
      processAndSortEpisodes();
      renderTimeline();
    } else {
      const cards = document.querySelectorAll(`.episode-card[data-guid="${ep.guid}"]`);
      cards.forEach(card => {
        card.classList.toggle('is-played', !isCompleted);
        const checkBtn = card.querySelector('.btn-mark-played');
        if (checkBtn) {
          checkBtn.classList.toggle('is-completed', !isCompleted);
          checkBtn.innerHTML = CARD_ICONS.CHECK;
          checkBtn.title = !isCompleted ? 'Mark as Unplayed' : 'Mark as Played';
        }
      });
    }
  }

  function createEpisodeCard(ep) {
    const isCurrentlyActive = state.currentEpisode && state.currentEpisode.guid === ep.guid;
    const isPlaying = isCurrentlyActive && state.playbackStatus === 'playing';
    const isLoading = isCurrentlyActive && state.playbackStatus === 'loading';

    const savedPos = state.playbackPositions[ep.guid];
    const isCompleted = savedPos && (savedPos.completed === 1 || savedPos.completed === true);
    const hasProgress = savedPos && savedPos.position > 15 && !isCompleted;
    const resumeTimeStr = hasProgress ? `Resumes at ${formatTime(savedPos.position)}` : '';

    let progressTrackHtml = '';
    if (hasProgress) {
      const durSec = ep.duration ? parseDurationSeconds(ep.duration) : 0;
      let progressPct = 0;
      if (durSec > 0) {
        progressPct = Math.min(100, Math.max(1, Math.round((savedPos.position / durSec) * 100)));
      } else {
        progressPct = 5;
      }
      progressTrackHtml = `<div class="ep-progress-track"><div class="ep-progress-fill" style="width: ${progressPct}%"></div></div>`;
    }

    const card = document.createElement('div');
    card.className = `episode-card ${isCurrentlyActive ? 'playing' : ''} ${isCompleted ? 'is-played' : ''}`;
    card.dataset.guid = ep.guid;

    const formattedDate = ep.timestamp 
      ? new Date(ep.timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
      : 'Unknown date';

    let btnHtml = CARD_ICONS.PLAY;
    let btnTitle = 'Play';
    if (isLoading) {
      btnHtml = CARD_ICONS.SPINNER;
      btnTitle = 'Loading...';
    } else if (isPlaying) {
      btnHtml = CARD_ICONS.PAUSE;
      btnTitle = 'Pause';
    }

    card.innerHTML = `
      <div class="episode-card-top">
        <img class="episode-artwork" src="${ep.artwork || 'data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'100\' height=\'100\'%3E%3Crect width=\'100%25\' height=\'100%25\' fill=\'%2318181b\'/%3E%3C/svg%3E'}" alt="" loading="lazy" onerror="this.src='data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'100\' height=\'100\'%3E%3Crect width=\'100%25\' height=\'100%25\' fill=\'%2318181b\'/%3E%3C/svg%3E';">
        <div class="episode-header-info">
          <div class="episode-podcast-name">${ep.isYouTube ? 'YOUTUBE' : escapeHtml(ep.podcastTitle)}</div>
          <div class="episode-title">${escapeHtml(ep.title)}</div>
        </div>
      </div>
      ${ep.description ? `<div class="episode-desc">${escapeHtml(ep.description)}</div>` : ''}
      ${progressTrackHtml}
      <div class="episode-footer">
        <div class="episode-meta">
          <span>${formattedDate}</span>
          ${ep.duration ? `<span>${escapeHtml(ep.duration)}</span>` : ''}
          ${resumeTimeStr ? `<span class="ep-resume-time">• ${resumeTimeStr}</span>` : ''}
        </div>
        <div class="episode-card-actions">
          <button class="btn-mark-played ${isCompleted ? 'is-completed' : ''}" title="${isCompleted ? 'Mark as Unplayed' : 'Mark as Played'}">
            ${CARD_ICONS.CHECK}
          </button>
          <button class="btn-play-ep" title="${btnTitle}">
            ${btnHtml}
          </button>
        </div>
      </div>
    `;

    const podNameEl = card.querySelector('.episode-podcast-name');
    if (podNameEl && ep.feedUrl) {
      podNameEl.addEventListener('click', (e) => {
        e.stopPropagation();
        openFeedDetail(ep.feedUrl);
      });
    }

    card.querySelector('.btn-play-ep').addEventListener('click', (e) => {
      e.stopPropagation();
      toggleEpisodePlayback(ep);
    });

    card.querySelector('.btn-mark-played').addEventListener('click', (e) => {
      e.stopPropagation();
      toggleMarkPlayed(ep);
    });

    return card;
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

      const rawDesc = meta.description || '';
      const plainDesc = rawDesc.replace(/<[^>]*>?/gm, '').replace(/\s+/g, ' ').trim();

      const feedEpisodes = state.allEpisodes
        .filter(e => e.feedUrl === url)
        .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))
        .slice(0, 3);

      let recentWidgetHtml = '';
      if (feedEpisodes.length > 0) {
        recentWidgetHtml = `
          <div class="feed-recent-widget">
            <div class="feed-recent-header">Latest episodes</div>
            <div class="feed-recent-list">
              ${feedEpisodes.map(ep => {
                const isCurrent = state.currentEpisode && state.currentEpisode.guid === ep.guid;
                const isEpPlaying = isCurrent && state.playbackStatus === 'playing';
                const durStr = ep.duration ? formatDurationCompact(ep.duration) : '';
                return `
                  <div class="recent-ep-row ${isCurrent ? 'active' : ''}" data-guid="${escapeHtml(ep.guid)}" title="${escapeHtml(ep.title)}">
                    <button class="btn-recent-play ${isEpPlaying ? 'is-playing' : ''}" data-guid="${escapeHtml(ep.guid)}" aria-label="Play ${escapeHtml(ep.title)}">
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
      }

      card.innerHTML = `
        <div class="feed-header">
          <img class="feed-art" src="${meta.artwork || 'data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'100\' height=\'100\'%3E%3Crect width=\'100%25\' height=\'100%25\' fill=\'%2318181b\'/%3E%3C/svg%3E'}" alt="" onerror="this.src='data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'100\' height=\'100\'%3E%3Crect width=\'100%25\' height=\'100%25\' fill=\'%2318181b\'/%3E%3C/svg%3E';">
          <div class="feed-info">
            <h4>${escapeHtml(meta.title || url)}</h4>
            <p>${meta.error ? `<span style="color: #ef4444;">${escapeHtml(meta.error)}</span>` : `${meta.episodesCount || feedEpisodes.length} episodes`}</p>
          </div>
          <button class="btn-feed-unsubscribe" title="Remove podcast" aria-label="Remove podcast">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="3 6 5 6 21 6"></polyline>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
            </svg>
          </button>
        </div>
        ${plainDesc ? `<p class="feed-card-desc">${escapeHtml(plainDesc)}</p>` : ''}
        ${recentWidgetHtml}
      `;

      card.addEventListener('click', (e) => {
        if (e.target.closest('.btn-feed-unsubscribe') || e.target.closest('.recent-ep-row')) return;
        openFeedDetail(url);
      });

      card.querySelector('.btn-feed-unsubscribe')?.addEventListener('click', (e) => {
        e.stopPropagation();
        promptRemoveFeed(url);
      });

      card.querySelectorAll('.recent-ep-row').forEach(row => {
        const guid = row.dataset.guid;
        const ep = feedEpisodes.find(item => item.guid === guid);
        if (!ep) return;
        row.addEventListener('click', (e) => {
          e.stopPropagation();
          toggleEpisodePlayback(ep);
        });
      });

      grid.appendChild(card);
    });
  }

  function openFeedDetail(feedUrl) {
    state.activeFeedDetailUrl = feedUrl;
    elements.tabs.forEach(t => t.classList.remove('active'));
    elements.panels.forEach(p => p.classList.remove('active'));
    if (elements.panelFeedDetail) {
      elements.panelFeedDetail.classList.add('active');
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
    renderFeedDetail(feedUrl);
  }

  function renderFeedDetail(feedUrl) {
    const meta = state.feedMetadata[feedUrl] || {};
    const episodes = state.allEpisodes.filter(e => e.feedUrl === feedUrl);
    const header = elements.feedDetailHeader;
    if (!header) return;

    header.innerHTML = `
      <div class="feed-detail-top-nav">
        <button class="btn btn-secondary btn-sm" id="btn-feed-back">Back</button>
        <button class="btn btn-danger btn-sm" id="btn-feed-unsubscribe">Unsubscribe</button>
      </div>
      <div class="feed-detail-main">
        <img class="feed-detail-art" src="${meta.artwork || 'data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'100\' height=\'100\'%3E%3Crect width=\'100%25\' height=\'100%25\' fill=\'%2318181b\'/%3E%3C/svg%3E'}" alt="" onerror="this.src='data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'100\' height=\'100\'%3E%3Crect width=\'100%25\' height=\'100%25\' fill=\'%2318181b\'/%3E%3C/svg%3E';">
        <div class="feed-detail-info">
          <div class="feed-detail-title">${escapeHtml(meta.title || 'Untitled Podcast')}</div>
          <div class="feed-detail-author">${escapeHtml(meta.author || '')}</div>
          ${meta.description ? `<div class="feed-detail-desc">${escapeHtml(meta.description)}</div>` : ''}
          <div class="feed-detail-links">
            ${meta.link ? `<a href="${escapeHtml(meta.link)}" target="_blank" rel="noopener noreferrer" class="feed-link-badge">Website</a>` : ''}
            <button class="feed-link-badge" id="btn-copy-rss" title="Copy RSS Feed URL">Copy RSS</button>
            <span class="feed-link-badge" style="cursor: default;">${episodes.length} episodes</span>
          </div>
        </div>
      </div>
    `;

    header.querySelector('#btn-feed-back').addEventListener('click', () => {
      if (elements.panelFeedDetail) elements.panelFeedDetail.classList.remove('active');
      const activeTab = document.querySelector('.nav-tab.active')?.dataset.tab || 'timeline';
      const target = document.getElementById(`panel-${activeTab}`);
      if (target) target.classList.add('active');
    });

    header.querySelector('#btn-feed-unsubscribe').addEventListener('click', () => {
      promptRemoveFeed(feedUrl);
    });

    header.querySelector('#btn-copy-rss').addEventListener('click', () => {
      navigator.clipboard.writeText(feedUrl).then(() => {
        const btn = header.querySelector('#btn-copy-rss');
        if (btn) btn.textContent = 'Copied!';
        setTimeout(() => {
          if (btn) btn.textContent = 'Copy RSS';
        }, 2000);
      });
    });

    const list = elements.feedDetailEpisodes;
    if (!list) return;
    list.innerHTML = '';
    if (episodes.length === 0) {
      list.innerHTML = `<div class="empty-state"><h3>No episodes found for this podcast</h3></div>`;
      return;
    }

    const frag = document.createDocumentFragment();
    episodes.forEach(ep => {
      frag.appendChild(createEpisodeCard(ep));
    });
    list.appendChild(frag);
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
      if (state.activeEngine === 'audio') {
        state.playbackStatus = 'idle';
        syncPlaybackButtons();
        onEpisodeEnded();
      }
    });
    audio.addEventListener('loadstart', () => {
      if (state.activeEngine === 'audio' && !audio.paused) {
        state.playbackStatus = 'loading';
        syncPlaybackButtons();
      }
    });
    audio.addEventListener('waiting', () => {
      if (state.activeEngine === 'audio') {
        state.playbackStatus = 'loading';
        syncPlaybackButtons();
      }
    });
    audio.addEventListener('canplay', () => {
      if (state.activeEngine === 'audio' && !audio.paused) {
        state.playbackStatus = 'playing';
        syncPlaybackButtons();
      }
    });
    audio.addEventListener('playing', () => {
      if (state.activeEngine === 'audio') {
        state.playbackStatus = 'playing';
        syncPlaybackButtons();
      }
    });
    audio.addEventListener('play', () => {
      if (state.activeEngine === 'audio') {
        if (state.playbackStatus !== 'playing') {
          state.playbackStatus = 'loading';
        }
        syncPlaybackButtons();
      }
    });
    audio.addEventListener('pause', () => {
      if (state.activeEngine === 'audio') {
        state.playbackStatus = 'paused';
        syncPlaybackButtons();
      }
    });
    audio.addEventListener('error', () => {
      if (state.activeEngine === 'audio') {
        state.playbackStatus = 'paused';
        syncPlaybackButtons();
      }
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
        if (state.filteredEpisodes.length > 0) {
          toggleEpisodePlayback(state.filteredEpisodes[0]);
        }
        return;
      }
      toggleEpisodePlayback(state.currentEpisode);
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
      navigator.mediaSession.setActionHandler('nexttrack', () => onEpisodeEnded());
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
      if (state.playbackStatus === 'playing') {
        state.playbackStatus = 'paused';
        syncPlaybackButtons();
        pauseCurrentEngine();
      } else {
        state.playbackStatus = 'loading';
        syncPlaybackButtons();
        playCurrentEngine();
      }
    } else {
      state.currentEpisode = episode;
      state.playbackStatus = 'loading';
      syncPlaybackButtons();
      playEpisode(episode);
    }
  }

  function playEpisode(episode) {
    state.currentEpisode = episode;
    state.playbackStatus = 'loading';
    syncPlaybackButtons();

    elements.audio.pause();
    if (state.ytPlayer && state.ytPlayer.stopVideo) {
      state.ytPlayer.stopVideo();
    }

    const savedPos = state.playbackPositions[episode.guid];
    const startTime = (savedPos && savedPos.position > 1) ? savedPos.position : 0;

    state.playbackPositions[episode.guid] = {
      position: startTime || 2,
      completed: false
    };
    savePositionsToStorage();
    renderContinueShelf();
    updateFilterBadges();

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
        state.playbackStatus = 'paused';
        syncPlaybackButtons();
        return;
      }
    } else {
      state.activeEngine = 'audio';
      elements.audio.src = episode.audioUrl;
      elements.audio.playbackRate = state.playbackSpeed;
      if (startTime > 0) elements.audio.currentTime = startTime;
      elements.audio.play().catch(e => {
        console.warn('Autoplay blocked:', e);
        state.playbackStatus = 'paused';
        syncPlaybackButtons();
      });
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

    if (elements.playerBar) {
      elements.playerBar.classList.add('active-episode');
    }
    document.body.classList.add('has-active-episode');

    syncPlaybackButtons();
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

  function playNextEpisode() {
    let nextEp = null;
    const currentGuid = state.currentEpisode ? state.currentEpisode.guid : null;

    if (state.filterMode === 'continue') {
      const continueList = state.allEpisodes.filter(ep => {
        const pos = state.playbackPositions[ep.guid];
        return (!pos || !pos.completed) && (pos && pos.position > 2);
      });
      const idx = continueList.findIndex(e => e.guid === currentGuid);
      if (idx !== -1 && idx + 1 < continueList.length) {
        nextEp = continueList[idx + 1];
      } else if (continueList.length > 0) {
        nextEp = continueList[0];
      }
    }

    if (!nextEp && state.filteredEpisodes.length > 0) {
      const idx = state.filteredEpisodes.findIndex(e => e.guid === currentGuid);
      if (idx !== -1 && idx + 1 < state.filteredEpisodes.length) {
        nextEp = state.filteredEpisodes[idx + 1];
      } else if (idx === -1) {
        nextEp = state.filteredEpisodes[0];
      }
    }

    if (!nextEp) {
      const allIdx = state.allEpisodes.findIndex(e => e.guid === currentGuid);
      if (allIdx !== -1 && allIdx + 1 < state.allEpisodes.length) {
        nextEp = state.allEpisodes[allIdx + 1];
      } else if (state.allEpisodes.length > 0) {
        nextEp = state.allEpisodes[0];
      }
    }

    if (nextEp) {
      playEpisode(nextEp);
      processAndSortEpisodes();
      renderTimeline();
      renderContinueShelf();
      if (state.activeFeedDetailUrl) {
        renderFeedDetail(state.activeFeedDetailUrl);
      }
    } else {
      state.playbackStatus = 'idle';
      syncPlaybackButtons();
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

    playNextEpisode();
  }

  function syncPlaybackButtons() {
    const isPlaying = state.playbackStatus === 'playing';
    const isLoading = state.playbackStatus === 'loading';

    if (elements.iconPlay && elements.iconPause && elements.iconSpinner) {
      if (isLoading) {
        elements.iconPlay.classList.add('hidden');
        elements.iconPause.classList.add('hidden');
        elements.iconSpinner.classList.remove('hidden');
      } else if (isPlaying) {
        elements.iconPlay.classList.add('hidden');
        elements.iconPause.classList.remove('hidden');
        elements.iconSpinner.classList.add('hidden');
      } else {
        elements.iconPlay.classList.remove('hidden');
        elements.iconPause.classList.add('hidden');
        elements.iconSpinner.classList.add('hidden');
      }
    }

    const cards = document.querySelectorAll('.episode-card');
    cards.forEach(card => {
      const guid = card.dataset.guid;
      const btn = card.querySelector('.btn-play-ep');
      if (!btn) return;
      if (state.currentEpisode && state.currentEpisode.guid === guid) {
        card.classList.add('playing');
        if (isLoading) {
          btn.innerHTML = CARD_ICONS.SPINNER;
          btn.title = 'Loading...';
        } else if (isPlaying) {
          btn.innerHTML = CARD_ICONS.PAUSE;
          btn.title = 'Pause';
        } else {
          btn.innerHTML = CARD_ICONS.PLAY;
          btn.title = 'Play';
        }
      } else {
        card.classList.remove('playing');
        btn.innerHTML = CARD_ICONS.PLAY;
        btn.title = 'Play';
      }
    });

    const recentRows = document.querySelectorAll('.recent-ep-row');
    recentRows.forEach(row => {
      const guid = row.dataset.guid;
      const btn = row.querySelector('.btn-recent-play');
      if (!btn) return;
      if (state.currentEpisode && state.currentEpisode.guid === guid) {
        row.classList.add('active');
        if (isLoading) {
          btn.innerHTML = `<span class="spinner" style="width: 10px; height: 10px;"></span>`;
          btn.classList.remove('is-playing');
        } else if (isPlaying) {
          btn.innerHTML = `<svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>`;
          btn.classList.add('is-playing');
        } else {
          btn.innerHTML = `<svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>`;
          btn.classList.remove('is-playing');
        }
      } else {
        row.classList.remove('active');
        btn.innerHTML = `<svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>`;
        btn.classList.remove('is-playing');
      }
    });
  }

  function updatePlayerUI(isPlaying) {
    state.playbackStatus = isPlaying ? 'playing' : 'paused';
    syncPlaybackButtons();
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
      refreshAllFeeds();
      if (elements.feedUrlInput && elements.feedUrlInput.value.trim() === cleanUrl) {
        elements.feedUrlInput.value = '';
      }
    } else {
      alert('This feed is already in your subscriptions.');
    }
  }

  function promptRemoveFeed(url) {
    state.feedToDelete = url;
    const meta = state.feedMetadata[url] || {};
    const title = meta.title || 'this podcast';
    if (elements.confirmModalMsg) {
      elements.confirmModalMsg.textContent = `Are you sure you want to remove "${title}"? This will unsubscribe from the feed and clear saved playback progress.`;
    }
    if (elements.confirmModal) {
      elements.confirmModal.classList.remove('hidden');
    }
  }

  function removeFeed(url) {
    if (state.activeFeedDetailUrl === url) {
      state.activeFeedDetailUrl = null;
      if (elements.panelFeedDetail) elements.panelFeedDetail.classList.remove('active');
      const feedsTab = document.getElementById('tab-feeds');
      const feedsPanel = document.getElementById('panel-feeds');
      elements.tabs.forEach(t => t.classList.remove('active'));
      elements.panels.forEach(p => p.classList.remove('active'));
      if (feedsTab) feedsTab.classList.add('active');
      if (feedsPanel) feedsPanel.classList.add('active');
    }
    state.allEpisodes = state.allEpisodes.filter(ep => ep.feedUrl !== url);
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
    let xml = `<?xml version="1.0" encoding="UTF-8"?>\n<opml version="2.0">\n  <head>\n    <title>Podany Export</title>\n  </head>\n  <body>\n`;
    
    state.feeds.forEach(url => {
      const meta = state.feedMetadata[url] || {};
      const title = meta.title ? escapeHtml(meta.title) : 'Podcast';
      xml += `    <outline type="rss" text="${title}" title="${title}" xmlUrl="${escapeHtml(url)}"/>\n`;
    });

    xml += `  </body>\n</opml>`;

    const blob = new Blob([xml], { type: 'text/xml' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'podany_subscriptions.opml';
    a.click();
  }

  function setupEventListeners() {
    if (elements.magicAuthForm) {
      elements.magicAuthForm.addEventListener('submit', (e) => {
        e.preventDefault();
        submitMagicAuth();
      });
    }

    if (elements.btnCloseAuth) {
      elements.btnCloseAuth.addEventListener('click', () => {
        elements.authModal.classList.add('hidden');
      });
    }

    if (elements.btnCancelAuth) {
      elements.btnCancelAuth.addEventListener('click', () => {
        elements.authModal.classList.add('hidden');
      });
    }

    if (elements.btnShowLogin) {
      elements.btnShowLogin.addEventListener('click', () => {
        elements.authModal.classList.remove('hidden');
      });
    }

    if (elements.filterChips) {
      elements.filterChips.forEach(chip => {
        chip.addEventListener('click', () => {
          elements.filterChips.forEach(c => c.classList.remove('active'));
          chip.classList.add('active');
          state.filterMode = chip.dataset.filter || 'all';
          processAndSortEpisodes();
          renderTimeline();
        });
      });
    }

    if (elements.btnAccountToggle) {
      elements.btnAccountToggle.addEventListener('click', async () => {
        if (elements.statusIndicator && elements.statusIndicator.classList.contains('online')) {
          const currentToken = state.sessionToken;
          try {
            await fetch('/api/auth/logout', {
              method: 'POST',
              credentials: 'include',
              headers: {
                'Content-Type': 'application/json',
                ...(currentToken ? { 'X-Session-Token': currentToken } : {})
              },
              body: JSON.stringify({ sessionToken: currentToken })
            });
          } catch (e) {}
          localStorage.removeItem(STORAGE_KEYS.SESSION);
          localStorage.removeItem('podcast_pulse_session_token');
          localStorage.removeItem(STORAGE_KEYS.FEEDS);
          localStorage.removeItem(STORAGE_KEYS.POSITIONS);
          localStorage.removeItem(STORAGE_KEYS.CACHED_EPISODES);
          localStorage.removeItem(STORAGE_KEYS.CACHED_METADATA);
          document.cookie = 'podcast_session=; Path=/; Expires=Thu, 01 Jan 1970 00:00:01 GMT;';
          window.history.replaceState({}, document.title, window.location.pathname);
          state.sessionToken = '';
          state.userEmail = '';
          state.feeds = [];
          state.playbackPositions = {};
          state.allEpisodes = [];
          state.filteredEpisodes = [];
          state.feedMetadata = {};
          if (elements.audio) {
            elements.audio.pause();
            elements.audio.src = '';
          }
          if (state.ytPlayer && state.ytPlayer.stopVideo) {
            state.ytPlayer.stopVideo();
          }
          state.currentEpisode = null;
          state.playbackStatus = 'idle';
          if (elements.playerBar) elements.playerBar.classList.remove('active-episode');
          document.body.classList.remove('has-active-episode');
          updatePlayerUI(false);
          updateFeedCountUI();
          renderContinueShelf();
          renderTimeline();
          renderFeedsGrid();
          updateSyncStatusUI('Logged Out', '', false);
          elements.authModal.classList.remove('hidden');
        } else {
          elements.authModal.classList.remove('hidden');
        }
      });
    }

    if (elements.btnConfirmCancel) {
      elements.btnConfirmCancel.addEventListener('click', () => {
        state.feedToDelete = null;
        if (elements.confirmModal) elements.confirmModal.classList.add('hidden');
      });
    }

    if (elements.btnConfirmDelete) {
      elements.btnConfirmDelete.addEventListener('click', () => {
        if (state.feedToDelete) {
          removeFeed(state.feedToDelete);
          state.feedToDelete = null;
        }
        if (elements.confirmModal) elements.confirmModal.classList.add('hidden');
      });
    }

    if (elements.btnPrev15) {
      elements.btnPrev15.addEventListener('click', () => {
        if (state.activeEngine === 'audio') {
          elements.audio.currentTime = Math.max(0, elements.audio.currentTime - 15);
        } else if (state.activeEngine === 'youtube' && state.ytPlayer && state.ytPlayer.getCurrentTime) {
          const cur = state.ytPlayer.getCurrentTime();
          state.ytPlayer.seekTo(Math.max(0, cur - 15), true);
        }
      });
    }

    if (elements.btnNext15) {
      elements.btnNext15.addEventListener('click', () => {
        if (state.activeEngine === 'audio') {
          elements.audio.currentTime = Math.min(elements.audio.duration || 0, elements.audio.currentTime + 15);
        } else if (state.activeEngine === 'youtube' && state.ytPlayer && state.ytPlayer.getCurrentTime) {
          const cur = state.ytPlayer.getCurrentTime();
          state.ytPlayer.seekTo(cur + 15, true);
        }
      });
    }

    if (elements.btnSkipEpisode) {
      elements.btnSkipEpisode.addEventListener('click', () => {
        onEpisodeEnded();
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
        state.activeFeedDetailUrl = null;
        elements.tabs.forEach(t => t.classList.remove('active'));
        elements.panels.forEach(p => p.classList.remove('active'));

        tab.classList.add('active');
        document.getElementById(`panel-${targetTab}`).classList.add('active');
      });
    });

    if (elements.themeBtns) {
      elements.themeBtns.forEach(btn => {
        btn.addEventListener('click', () => {
          setTheme(btn.dataset.themeVal);
        });
      });
    }

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

    if (elements.btnToggleContinue) {
      elements.btnToggleContinue.addEventListener('click', () => {
        state.continueCollapsed = !state.continueCollapsed;
        renderContinueShelf();
      });
    }

    elements.btnCloseAdd.addEventListener('click', closeAddModal);
    elements.btnCancelAdd.addEventListener('click', closeAddModal);
    elements.btnSubmitFeed.addEventListener('click', () => {
      if (elements.feedUrlInput.value) {
        addFeed(elements.feedUrlInput.value);
        const origText = elements.btnSubmitFeed.textContent;
        elements.btnSubmitFeed.textContent = 'Subscribed!';
        setTimeout(() => {
          elements.btnSubmitFeed.textContent = origText;
        }, 2000);
      }
    });
    elements.feedUrlInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        if (elements.feedUrlInput.value) {
          addFeed(elements.feedUrlInput.value);
          const origText = elements.btnSubmitFeed.textContent;
          elements.btnSubmitFeed.textContent = 'Subscribed!';
          setTimeout(() => {
            elements.btnSubmitFeed.textContent = origText;
          }, 2000);
        }
      }
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
        state.playbackStatus = 'idle';
        if (elements.playerBar) elements.playerBar.classList.remove('active-episode');
        document.body.classList.remove('has-active-episode');
        pauseCurrentEngine();
        syncPlaybackButtons();
        updateFeedCountUI();
        renderContinueShelf();
        renderTimeline();
        renderFeedsGrid();
      }
    });

    wireEmptyStateEvents();
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
