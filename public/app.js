(function () {
  'use strict';

  /**
   * app.js — Podany Podcast App
   *
   * Single-file vanilla JS frontend for a private podcast player.
   * Runs on Cloudflare Pages + D1. No build step, no bundler.
   *
   * TABLE OF CONTENTS
   * -----------------
   *  1. Constants & Configuration  (~L14)
   *     STORAGE_KEYS, CARD_ICONS, FALLBACK_ARTWORK, DEFAULT_STARTER_FEEDS
   *
   *  2. State                      (~L35)
   *     Single shared `state` object. All mutable app state lives here.
   *
   *  3. DOM Element Cache          (~L69)
   *     `elements` object — cached getElementById/querySelector refs.
   *
   *  4. YouTube Player             (~L194)
   *     YouTube IFrame API init + state change handler.
   *
   *  5. Theme                      (~L258)
   *     initTheme / applyTheme / setTheme.
   *
   *  6. Init & Boot                (~L293)
   *     init() — called on DOMContentLoaded. Wires everything up.
   *
   *  7. Auth & Session             (~L311)
   *     checkUrlSessionParam, checkAuth, updateSyncStatusUI,
   *     getWebmailProvider, submitMagicAuth.
   *
   *  8. Cloud Sync (D1)            (~L467)
   *     syncFeedsWithD1, saveFeedToD1, removeFeedFromD1.
   *
   *  9. Playback Position Sync     (~L527)
   *     savePositionsToStorage, loadPositionsFromStorage,
   *     loadPlaybackPositionsFromD1, savePlaybackPositionToD1.
   *
   * 10. Feed Storage               (~L578)
   *     loadFeedsFromStorage, saveFeedsToStorage, updateFeedCountUI,
   *     updateDockVisibility, loadCacheFromStorage, saveCacheToStorage.
   *
   * 11. Queue                      (~L646)
   *     loadQueueFromStorage, saveQueueToStorage, isEpisodeQueued,
   *     toggleEpisodeQueue, removeFromQueue, clearQueue,
   *     updateQueueUI, renderQueueModalContent, openQueueModal, closeQueueModal.
   *
   * 12. Downloads (Offline)        (~L916)
   *     loadDownloadsFromStorage, saveDownloadsToStorage, formatBytes,
   *     updateDownloadedCountUI, renderOfflineStorageSettings,
   *     downloadEpisode, removeDownloadedEpisode, clearAllDownloads,
   *     updateEpisodeCardDownloadState.
   *
   * 13. Service Worker & Network   (~L1108)
   *     initServiceWorker, setupNetworkListeners.
   *
   * 14. Feed Fetching              (~L1133)
   *     renderSkeletonTimeline, refreshAllFeeds, fetchSingleFeed.
   *
   * 15. Filtering & Sorting        (~L1250)
   *     updateFilterBadges, processAndSortEpisodes.
   *     Utility: parseDurationSeconds, formatCompactDate,
   *     formatDurationCompact, formatHumanRelativeDate, formatEpisodeDuration.
   *
   * 16. Podcast Directory Search   (~L1444)
   *     searchPodcastDirectory, renderNextDirectoryBatch.
   *
   * 17. Continue Shelf             (~L1545)
   *     getContinueRowCapacity, renderContinueShelf.
   *
   * 18. Timeline Rendering         (~L1697)
   *     renderTimeline, appendTimelineBatch, setupSentinelObserver.
   *     wireEmptyStateEvents (empty / onboarding state).
   *
   * 19. Episode Cards              (~L1827)
   *     toggleMarkPlayed, formatShowNotesHtml, seekToExactTime,
   *     openShowNotes, closeShowNotes, setupProgressTrackInteractivity,
   *     createEpisodeCard.
   *
   * 20. Feeds Grid & Feed Detail   (~L2223)
   *     wireFeedsEmptyStateEvents, renderFeedsGrid,
   *     openFeedDetail, renderFeedDetail.
   *
   * 21. Audio Engine               (~L2566)
   *     setupAudioEngines — <audio> event wiring, seek bar, position save
   *     interval, MediaSession API, keyboard controls.
   *
   * 22. Playback Control           (~L2731)
   *     isEnginePlaying, playCurrentEngine, pauseCurrentEngine,
   *     resumeCurrentEngine, toggleEpisodePlayback, playEpisode,
   *     updateProgress, updateDuration, playNextEpisode, onEpisodeEnded,
   *     skipToNextEpisode.
   *
   * 23. Player UI Sync             (~L3127)
   *     syncPlaybackButtons, updatePlayerUI, setPlayerCollapsed,
   *     cyclePlaybackSpeed.
   *
   * 24. Sleep Timer                (~L3252)
   *     startSleepTimer, stopSleepTimer.
   *
   * 25. Feed Management            (~L3294)
   *     addFeed, promptRemoveFeed, purgeOrphanedDownloads, removeFeed.
   *
   * 26. OPML Import / Export       (~L3387)
   *     importOpml, exportOpml.
   *
   * 27. Event Listeners            (~L3434)
   *     setupEventListeners — all UI click/input/keyboard wiring.
   *     Modal helpers: openAddModal, closeAddModal, openSleepModal,
   *     closeSleepModal, showStatus, hideStatus.
   *
   * 28. Utilities                  (~L3871)
   *     formatTime, decodeHtmlEntities, escapeHtml.
   *
   * 29. Bootstrap                  (~L3916)
   *     document.addEventListener('DOMContentLoaded', init)
   */


  // ─────────────────────────────────────────────────────────────────────────
  // SECTION 1 · Constants & Configuration
  // ─────────────────────────────────────────────────────────────────────────

  const STORAGE_KEYS = {
    FEEDS: 'podany_feeds',
    MUTED_FEEDS: 'podany_muted_feeds',
    SESSION: 'podany_session_token',
    CACHED_EPISODES: 'podany_cached_episodes',
    CACHED_METADATA: 'podany_cached_metadata',
    POSITIONS: 'podany_playback_positions',
    THEME: 'podany_theme',
    QUEUE: 'podany_playback_queue',
    DOWNLOADS: 'podany_downloads',
    EXPERIMENTAL: 'podany_experimental_settings'
  };

  const CARD_ICONS = {
    PLAY: '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="6 4 20 12 6 20 6 4"></polygon></svg>',
    PAUSE: '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>',
    SPINNER: '<svg class="spinner" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="9" stroke-opacity="0.25"></circle><path d="M12 3a9 9 0 0 1 9 9" stroke-linecap="round"></path></svg>',
    CHECK: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"></circle><polyline points="16 9 11 14 8 11"></polyline></svg>',
    CHECK_FILLED: '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg>',
    QUEUE: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 6h16M4 12h10M4 18h7"></path><path d="M18 15v6M15 18h6"></path></svg>',
    QUEUE_ADDED: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 6h16M4 12h10M4 18h7"></path><polyline points="15 18 18 21 23 15"></polyline></svg>',
    DOWNLOAD: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>',
    DOWNLOADED: '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a1 1 0 0 1 1 1v10.586l3.293-3.293a1 1 0 1 1 1.414 1.414l-5 5a1 1 0 0 1-1.414 0l-5-5a1 1 0 1 1 1.414-1.414L11 13.586V3a1 1 0 0 1 1-1zM4 20a1 1 0 0 1 1-1h14a1 1 0 1 1 0 2H5a1 1 0 0 1-1-1z"/></svg>',
    DOWNLOAD_SPINNER: '<svg class="spinner" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="9" stroke-opacity="0.25"></circle><path d="M12 3a9 9 0 0 1 9 9" stroke-linecap="round"></path></svg>',
    BELL_OFF: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13.73 21a2 2 0 0 1-3.46 0"></path><path d="M18.63 13A17.89 17.89 0 0 1 18 8"></path><path d="M6.26 6.26A5.86 5.86 0 0 0 6 8c0 7-3 9-3 9h14"></path><path d="M18 8a6 6 0 0 0-9.33-5"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>',
    BELL: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path><path d="M13.73 21a2 2 0 0 1-3.46 0"></path></svg>'
  };

  const FALLBACK_ARTWORK = 'data:image/svg+xml,%3Csvg%20xmlns=%22http://www.w3.org/2000/svg%22%20width=%22100%22%20height=%22100%22%3E%3Crect%20width=%22100%25%22%20height=%22100%25%22%20fill=%22%2318181b%22/%3E%3C/svg%3E';

  const DEFAULT_STARTER_FEEDS = [
    'https://changelog.com/podcast/feed',
    'https://feeds.feedburner.com/syntaxfm'
  ];

  // ─────────────────────────────────────────────────────────────────────────
  // SECTION 2 · State
  // Single shared mutable state object. No framework — direct mutation +
  // manual render calls. activeEngine switches between 'audio' and 'youtube'.
  // playbackStatus: 'idle' | 'loading' | 'playing' | 'paused'
  // ─────────────────────────────────────────────────────────────────────────

  let state = {
    sessionToken: '',
    userEmail: '',
    feeds: [],
    mutedFeeds: [],
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
    navHistory: [],          // stack of { tab, feedUrl } entries for back navigation
    continueCollapsed: true,
    queue: [],
    downloadedEpisodes: {},
    downloadingGuids: new Set(),
    directoryCountry: (typeof navigator !== 'undefined' && navigator.language && navigator.language.startsWith('de')) ? 'de' : 'all',
    sleepTimer: {
      active: false,
      minutes: 0,
      endTime: null,
      intervalId: null,
      fadeout: true,
      initialVolume: 1.0
    },
    experimentalSettings: {
      enableVisualizer: false,
      enableAudioClassifier: false,
      autoSkipSpeech: false
    },
    audioAnalysis: {
      ctx: null,           // AudioContext singleton
      analyser: null,      // AnalyserNode
      source: null,        // MediaElementSourceNode (created once)
      rafId: null,         // requestAnimationFrame id
      dataArray: null,     // Uint8Array for frequency data
      corsBlocked: false,  // true when getByteFrequencyData returns zeros
      classifierSpeechMs: 0, // rolling ms of speech detected
      lastClassifyAt: 0
    }
  };

  // ─────────────────────────────────────────────────────────────────────────
  // SECTION 3 · DOM Element Cache
  // All getElementById / querySelector calls happen once at startup.
  // Grouped by feature area (auth, tabs, player, modals…).
  // ─────────────────────────────────────────────────────────────────────────

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
    btnPlayerMarkPlayed: document.getElementById('btn-player-mark-played'),

    tabs: document.querySelectorAll('.nav-tab'),
    panels: document.querySelectorAll('.tab-panel'),
    tabFeeds: document.getElementById('tab-feeds'),
    tabTimeline: document.getElementById('tab-timeline'),
    tabDownloads: document.getElementById('tab-downloads'),
    tabSettings: document.getElementById('tab-settings'),
    panelFeeds: document.getElementById('panel-feeds'),
    panelTimeline: document.getElementById('panel-timeline'),
    panelDownloads: document.getElementById('panel-downloads'),
    panelFeedDetail: document.getElementById('panel-feed-detail'),
    feedDetailHeader: document.getElementById('feed-detail-header'),
    feedDetailEpisodes: document.getElementById('feed-detail-episodes'),
    themeBtns: document.querySelectorAll('.btn-theme'),
    feedCount: document.getElementById('feed-count'),
    downloadsTabCount: document.getElementById('downloads-tab-count'),
    btnOpenSettings: document.getElementById('btn-open-settings'),

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
    downloadedCount: document.getElementById('downloaded-count'),
    offlineBadge: document.getElementById('offline-badge'),
    offlineStorageCard: document.getElementById('offline-storage-card'),
    offlineStorageCount: document.getElementById('offline-storage-count'),
    btnClearDownloads: document.getElementById('btn-clear-downloads'),
    offlineEpisodesList: document.getElementById('offline-episodes-list'),
    filterChips: document.querySelectorAll('.chip-filter'),
    bottomActionDock: document.getElementById('bottom-action-dock'),

    opmlFileInput: document.getElementById('opml-file-input'),
    btnExportOpml: document.getElementById('btn-export-opml'),
    btnLoadDefaults: document.getElementById('btn-load-defaults'),
    btnClearStorage: document.getElementById('btn-clear-storage'),

    addModal: document.getElementById('add-modal'),
    podcastSearchQuery: document.getElementById('podcast-search-query'),
    btnSearchDirectory: document.getElementById('btn-search-directory'),
    searchDirectoryResults: document.getElementById('search-directory-results'),
    modalSubgenreChips: document.getElementById('modal-subgenre-chips'),
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

    btnOpenQueue: document.getElementById('btn-open-queue'),
    btnCloseQueue: document.getElementById('btn-close-queue'),
    btnClearQueue: document.getElementById('btn-clear-queue'),
    queueModal: document.getElementById('queue-modal'),
    queueBadge: document.getElementById('queue-badge'),
    queueCountBadge: document.getElementById('queue-count-badge'),
    queueNowPlayingContainer: document.getElementById('queue-now-playing-container'),
    queueItemsContainer: document.getElementById('queue-items-container'),

    showNotesModal: document.getElementById('show-notes-modal'),
    btnCloseNotes: document.getElementById('btn-close-notes'),
    showNotesPodcastTitle: document.getElementById('show-notes-podcast-title'),
    showNotesEpisodeTitle: document.getElementById('show-notes-episode-title'),
    showNotesMeta: document.getElementById('show-notes-meta'),
    showNotesContent: document.getElementById('show-notes-content'),

    audio: document.getElementById('audio-engine'),
    playerBar: document.getElementById('player-bar'),
    playerTrackInfo: document.querySelector('.player-track-info'),
    playerArtwork: document.getElementById('player-artwork'),
    playerTitle: document.getElementById('player-title'),
    playerPodcast: document.getElementById('player-podcast'),
    btnPlayToggle: document.getElementById('btn-play-toggle'),
    iconPlay: document.querySelector('.icon-play'),
    iconPause: document.querySelector('.icon-pause'),
    iconSpinner: document.querySelector('.icon-spinner'),
    currentTimeLabel: document.getElementById('current-time'),
    totalDurationLabel: document.getElementById('total-duration'),
    seekBar: document.getElementById('seek-bar'),
    btnSpeedToggle: document.getElementById('btn-speed-toggle'),
    btnPlayerNotes: document.getElementById('btn-player-notes'),
    btnCollapsePlayer: document.getElementById('btn-collapse-player'),
    playerMini: document.getElementById('player-mini'),
    miniExpandZone: document.getElementById('mini-expand-zone'),
    miniArtwork: document.getElementById('mini-artwork'),
    miniTitle: document.getElementById('mini-title'),
    miniPodcast: document.getElementById('mini-podcast'),
    miniPlayToggle: document.getElementById('mini-play-toggle'),
    miniIconPlay: document.querySelector('.mini-icon-play'),
    miniIconPause: document.querySelector('.mini-icon-pause'),
    miniIconSpinner: document.querySelector('.mini-icon-spinner'),
    miniToggle: document.getElementById('mini-toggle'),
    miniProgressFill: document.getElementById('mini-progress-fill'),
    visualizerCanvas: document.getElementById('visualizer-canvas'),

    // Experimental feature toggles
    toggleVisualizer: document.getElementById('toggle-visualizer'),
    toggleClassifier: document.getElementById('toggle-classifier'),
    toggleAutoSkip: document.getElementById('toggle-auto-skip'),
    experimentalStatus: document.getElementById('experimental-status')
  };

  // ─────────────────────────────────────────────────────────────────────────
  // SECTION 4 · YouTube Player
  // Initialises the YouTube IFrame API player inside #yt-player.
  // handleYouTubeStateChange — maps YT.PlayerState to state.playbackStatus.
  // window.onYouTubeIframeAPIReady — global callback required by the API.
  // ─────────────────────────────────────────────────────────────────────────

  function handleYouTubeStateChange(event) {
    if (state.activeEngine === 'youtube') {
      const ytBuffering = window.YT ? YT.PlayerState.BUFFERING : 3;
      const ytPlaying = window.YT ? YT.PlayerState.PLAYING : 1;
      const ytPaused = window.YT ? YT.PlayerState.PAUSED : 2;
      const ytEnded = window.YT ? YT.PlayerState.ENDED : 0;
      if (event.data === ytBuffering) {
        state.playbackStatus = 'loading';
        syncPlaybackButtons();
      } else if (event.data === ytPlaying) {
        state.playbackStatus = 'playing';
        syncPlaybackButtons();
      } else if (event.data === ytPaused) {
        state.playbackStatus = 'paused';
        syncPlaybackButtons();
      } else if (event.data === ytEnded) {
        state.playbackStatus = 'idle';
        syncPlaybackButtons();
        onEpisodeEnded();
      }
    }
  }

  function initYouTubePlayer() {
    if (state.ytPlayer || !window.YT || !window.YT.Player) return;
    const playerTarget = document.getElementById('yt-player');
    if (!playerTarget) return;

    state.ytPlayer = new YT.Player('yt-player', {
      height: '180',
      width: '320',
      playerVars: {
        autoplay: 0,
        controls: 0,
        playsinline: 1,
        enablejsapi: 1,
        origin: window.location.origin
      },
      events: {
        onReady: (event) => {
          state.ytReady = true;
          if (state.pendingYouTubePlay) {
            const pending = state.pendingYouTubePlay;
            state.pendingYouTubePlay = null;
            playEpisode(pending.episode, pending.startTime);
          }
        },
        onStateChange: handleYouTubeStateChange,
        onError: () => {
          state.playbackStatus = 'paused';
          syncPlaybackButtons();
        }
      }
    });
  }

  window.onYouTubeIframeAPIReady = function () {
    initYouTubePlayer();
  };

  if (window.YT && window.YT.Player) {
    initYouTubePlayer();
  }

  // ─────────────────────────────────────────────────────────────────────────
  // SECTION 4b · Navigation History
  // Full modern navigation stack:
  // - Keeps an in-memory stack (state.navHistory) and browser URL hash
  // - Handles tab navigation, feed detail drill-down, and modals
  // - Listens to 'popstate' so browser Back/Forward & mobile gestures work
  // - Back button dynamically labels previous target ('← Timeline', '← Feeds', etc.)
  // ─────────────────────────────────────────────────────────────────────────

  function _applyView({ tab, feedUrl }) {
    elements.tabs.forEach(t => t.classList.remove('active'));
    elements.panels.forEach(p => p.classList.remove('active'));
    if (elements.btnOpenSettings) elements.btnOpenSettings.classList.remove('is-active');

    if (feedUrl) {
      state.activeFeedDetailUrl = feedUrl;
      if (elements.panelFeedDetail) elements.panelFeedDetail.classList.add('active');
      window.scrollTo({ top: 0, behavior: 'smooth' });
      const meta = state.feedMetadata[feedUrl] || {};
      if (elements.searchInput) {
        elements.searchInput.placeholder = `Search in ${meta.title || 'podcast'}...`;
      }
      renderFeedDetail(feedUrl);
    } else {
      state.activeFeedDetailUrl = null;
      if (elements.panelFeedDetail) elements.panelFeedDetail.classList.remove('active');
      const targetTab = tab || 'timeline';
      const tabEl = document.getElementById(`tab-${targetTab}`);
      if (tabEl) tabEl.classList.add('active');
      const panelEl = document.getElementById(`panel-${targetTab}`);
      if (panelEl) panelEl.classList.add('active');
      if (targetTab === 'settings' && elements.btnOpenSettings) {
        elements.btnOpenSettings.classList.add('is-active');
      }
      if (targetTab === 'feeds') {
        if (elements.searchInput) elements.searchInput.placeholder = 'Search subscribed podcasts...';
        renderFeedsGrid();
      } else if (targetTab === 'timeline') {
        if (elements.searchInput) elements.searchInput.placeholder = 'Search loaded episodes...';
        renderTimeline();
      } else if (targetTab === 'downloads') {
        if (elements.searchInput) elements.searchInput.placeholder = 'Search downloaded episodes...';
        updateDownloadedCountUI();
      } else if (targetTab === 'settings') {
        if (elements.searchInput) elements.searchInput.placeholder = 'Search episodes...';
      }
    }
    updateDockVisibility();
  }

  function _currentView() {
    if (state.activeFeedDetailUrl) return { tab: null, feedUrl: state.activeFeedDetailUrl };
    const activeTab = document.querySelector('.nav-tab.active')?.dataset.tab || 'timeline';
    return { tab: activeTab, feedUrl: null };
  }

  function navigateTo(tab, feedUrl, pushBrowser = true) {
    const cur = _currentView();
    if (cur.tab === tab && cur.feedUrl === feedUrl) return;
    state.navHistory.push(cur);

    if (pushBrowser) {
      const hash = feedUrl ? `feed=${encodeURIComponent(feedUrl)}` : (tab || 'timeline');
      window.history.pushState({ tab, feedUrl }, '', '#' + hash);
    }
    _applyView({ tab, feedUrl });
  }

  function navigateBack() {
    // If a modal is open, let back close it
    const openModal = [elements.showNotesModal, elements.queueModal, elements.addModal, elements.sleepModal, elements.confirmModal]
      .find(m => m && !m.classList.contains('hidden'));
    if (openModal) {
      openModal.classList.add('hidden');
      return true;
    }

    if (window.history.length > 1) {
      window.history.back();
      return true;
    }
    if (state.navHistory.length > 0) {
      const prev = state.navHistory.pop();
      _applyView(prev);
      return true;
    }
    _applyView({ tab: 'timeline', feedUrl: null });
    return false;
  }

  function initNavigationRoute() {
    window.addEventListener('popstate', (e) => {
      // 1. Close any modal if open
      let modalClosed = false;
      const modals = [elements.showNotesModal, elements.queueModal, elements.addModal, elements.sleepModal, elements.confirmModal];
      for (const m of modals) {
        if (m && !m.classList.contains('hidden')) {
          m.classList.add('hidden');
          modalClosed = true;
        }
      }
      if (modalClosed) return;

      // 2. Apply view from state or URL hash
      if (e.state && (e.state.tab !== undefined || e.state.feedUrl !== undefined)) {
        _applyView(e.state);
      } else if (window.location.hash) {
        const raw = window.location.hash.slice(1);
        if (raw.startsWith('feed=')) {
          _applyView({ tab: null, feedUrl: decodeURIComponent(raw.slice(5)) });
        } else if (['timeline', 'feeds', 'downloads', 'settings'].includes(raw)) {
          _applyView({ tab: raw, feedUrl: null });
        } else {
          _applyView({ tab: 'timeline', feedUrl: null });
        }
      } else {
        _applyView({ tab: 'timeline', feedUrl: null });
      }
    });

    const hash = window.location.hash ? window.location.hash.slice(1) : '';
    if (hash.startsWith('feed=')) {
      const feedUrl = decodeURIComponent(hash.slice(5));
      _applyView({ tab: null, feedUrl });
      window.history.replaceState({ tab: null, feedUrl }, '', '#' + hash);
    } else if (['timeline', 'feeds', 'downloads', 'settings'].includes(hash)) {
      _applyView({ tab: hash, feedUrl: null });
      window.history.replaceState({ tab: hash, feedUrl: null }, '', '#' + hash);
    } else {
      window.history.replaceState({ tab: 'timeline', feedUrl: null }, '', '#timeline');
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // SECTION 5 · Theme
  // Supports 'light' | 'dark' | 'system'. Applied via data-theme attribute
  // on <html>. Listens for prefers-color-scheme changes when set to 'system'.
  // ─────────────────────────────────────────────────────────────────────────

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

  // ─────────────────────────────────────────────────────────────────────────
  // SECTION 6 · Init & Boot
  // init() is the single entry point, called from DOMContentLoaded (end of
  // file). Runs all setup functions in dependency order.
  // ─────────────────────────────────────────────────────────────────────────

  function init() {
    initTheme();
    checkUrlSessionParam();
    loadPositionsFromStorage();
    loadFeedsFromStorage();
    loadCacheFromStorage();
    loadQueueFromStorage();
    loadDownloadsFromStorage();
    setupEventListeners();
    setupAudioEngines();
    hookVisualizerToAudio();
    setupNetworkListeners();
    updateQueueUI();
    updateDownloadedCountUI();
    updateDockVisibility();
    initServiceWorker();
    initNavigationRoute();
    checkAuth();
    loadExperimentalSettings();
    setupExperimentalSettings();
  }

  // ─────────────────────────────────────────────────────────────────────────
  // SECTION 7 · Auth & Session
  // Two auth paths:
  //   a) Magic link → ?session=TOKEN in URL → stored in localStorage.
  //   b) Session cookie (set by /api/auth/send-link verify flow).
  // getWebmailProvider — returns a deeplink to the user's inbox provider
  //   so we can render an "Open Gmail / Outlook" button after sending a link.
  // ─────────────────────────────────────────────────────────────────────────

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

    elements.authModal.classList.add('hidden');
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
    const cardDelete = document.getElementById('card-delete-account');
    if (cardDelete) {
      cardDelete.style.display = isConnected ? 'block' : 'none';
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

  // ─────────────────────────────────────────────────────────────────────────
  // SECTION 8 · Cloud Sync (Cloudflare D1)
  // API endpoints: /api/sync/feeds (GET/POST/DELETE), /api/sync/position
  // Auth header: X-Session-Token (magic link) or session cookie.
  // syncFeedsWithD1 — pulls remote feeds + positions on login/startup.
  // ─────────────────────────────────────────────────────────────────────────

  async function syncFeedsWithD1() {
    showStatus('Syncing feeds & playback state with Cloud D1...');
    try {
      const headers = {};
      if (state.sessionToken) headers['X-Session-Token'] = state.sessionToken;

      const res = await fetch('/api/sync/feeds', { headers });

      if (res.status === 401) {
        localStorage.removeItem(STORAGE_KEYS.SESSION);
        state.sessionToken = '';
        updateSyncStatusUI('Session Expired • Switched to Guest Mode', '', false);
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

  // ─────────────────────────────────────────────────────────────────────────
  // SECTION 9 · Playback Position Sync
  // state.playbackPositions: { [guid]: { position, completed, lastListenedAt } }
  // Saved locally every 8 s and immediately on pause/skip/completion.
  // Also synced to/from Cloudflare D1 via /api/sync/position.
  // ─────────────────────────────────────────────────────────────────────────

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

  // ─────────────────────────────────────────────────────────────────────────
  // SECTION 10 · Feed Storage & Cache
  // state.feeds — ordered array of RSS feed URLs (strings).
  // state.feedMetadata — { [feedUrl]: { title, artwork, episodesCount, … } }
  // state.allEpisodes — flat array of all episodes across all feeds.
  // Cache is capped at 2000 episodes to avoid localStorage quota issues.
  // ─────────────────────────────────────────────────────────────────────────

  function loadFeedsFromStorage() {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.FEEDS) || localStorage.getItem('podcast_pulse_feeds');
      state.feeds = saved ? JSON.parse(saved) : [];
      updateFeedCountUI();
    } catch (e) {
      state.feeds = [];
    }
    loadMutedFeedsFromStorage();
  }

  function loadMutedFeedsFromStorage() {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.MUTED_FEEDS);
      state.mutedFeeds = saved ? JSON.parse(saved) : [];
      if (!Array.isArray(state.mutedFeeds)) state.mutedFeeds = [];
    } catch (e) {
      state.mutedFeeds = [];
    }
  }

  function saveMutedFeedsToStorage() {
    try {
      localStorage.setItem(STORAGE_KEYS.MUTED_FEEDS, JSON.stringify(state.mutedFeeds));
    } catch (e) {}
  }

  function isFeedMuted(url) {
    return Array.isArray(state.mutedFeeds) && state.mutedFeeds.includes(url);
  }

  function toggleMuteFeed(url) {
    if (!url) return;
    if (isFeedMuted(url)) {
      state.mutedFeeds = state.mutedFeeds.filter(u => u !== url);
    } else {
      if (!state.mutedFeeds.includes(url)) {
        state.mutedFeeds.push(url);
      }
    }
    saveMutedFeedsToStorage();
    processAndSortEpisodes();
    renderTimeline();
    renderFeedsGrid();
    if (state.activeFeedDetailUrl === url) {
      renderFeedDetail(url);
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
    updateDockVisibility();
  }

  function updateDockVisibility() {
    if (!elements.bottomActionDock) return;
    const isTimelineActive = elements.tabTimeline && elements.tabTimeline.classList.contains('active');
    const isDetailActive = !!state.activeFeedDetailUrl;
    const hasFeeds = state.feeds && state.feeds.length > 0;

    if (isTimelineActive && !isDetailActive && hasFeeds) {
      elements.bottomActionDock.classList.remove('dock-hidden');
    } else {
      elements.bottomActionDock.classList.add('dock-hidden');
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
        const trimmed = state.allEpisodes.slice(0, 2000);
        localStorage.setItem(STORAGE_KEYS.CACHED_EPISODES, JSON.stringify(trimmed));
      }
      if (state.feedMetadata) {
        localStorage.setItem(STORAGE_KEYS.CACHED_METADATA, JSON.stringify(state.feedMetadata));
      }
    } catch (e) {}
  }

  // ─────────────────────────────────────────────────────────────────────────
  // SECTION 11 · Queue ("Up Next")
  // state.queue is an ordered array of episode objects.
  // Persisted minimally (guid + playback fields only) to localStorage.
  // Queue items are consumed by playNextEpisode (section 22).
  // The queue modal supports drag-and-drop + touch reordering.
  // ─────────────────────────────────────────────────────────────────────────

  function loadQueueFromStorage() {
    try {
      const stored = localStorage.getItem(STORAGE_KEYS.QUEUE);
      if (stored) {
        state.queue = JSON.parse(stored);
        if (!Array.isArray(state.queue)) {
          state.queue = [];
        }
      } else {
        state.queue = [];
      }
    } catch (e) {
      state.queue = [];
    }
  }

  function saveQueueToStorage() {
    try {
      const minimalQueue = state.queue.map(ep => ({
        guid: ep.guid,
        title: ep.title,
        podcastTitle: ep.podcastTitle,
        audioUrl: ep.audioUrl,
        artwork: ep.artwork,
        duration: ep.duration,
        isYouTube: !!ep.isYouTube,
        videoId: ep.videoId,
        playlistId: ep.playlistId,
        feedUrl: ep.feedUrl,
        timestamp: ep.timestamp
      }));
      localStorage.setItem(STORAGE_KEYS.QUEUE, JSON.stringify(minimalQueue));
    } catch (e) {}
  }

  function isEpisodeQueued(guid) {
    if (!state.queue || !Array.isArray(state.queue)) return false;
    return state.queue.some(ep => ep.guid === guid);
  }

  function toggleEpisodeQueue(episode) {
    const idx = state.queue.findIndex(ep => ep.guid === episode.guid);
    if (idx !== -1) {
      state.queue.splice(idx, 1);
    } else {
      state.queue.push(episode);
    }
    saveQueueToStorage();
    updateQueueUI();
  }

  function removeFromQueue(guid) {
    state.queue = state.queue.filter(ep => ep.guid !== guid);
    saveQueueToStorage();
    updateQueueUI();
  }

  function clearQueue() {
    state.queue = [];
    saveQueueToStorage();
    updateQueueUI();
  }

  function updateQueueUI() {
    const count = (state.queue && Array.isArray(state.queue)) ? state.queue.length : 0;
    if (elements.queueBadge) {
      if (count > 0) {
        elements.queueBadge.textContent = count;
        elements.queueBadge.classList.remove('hidden');
      } else {
        elements.queueBadge.classList.add('hidden');
      }
    }

    if (elements.queueCountBadge) {
      elements.queueCountBadge.textContent = count === 1 ? '1 episode' : `${count} episodes`;
    }

    const cards = document.querySelectorAll('.episode-card');
    cards.forEach(card => {
      const guid = card.dataset.guid;
      const qBtn = card.querySelector('.btn-queue-ep');
      if (qBtn) {
        const inQueue = isEpisodeQueued(guid);
        if (inQueue) {
          qBtn.classList.add('is-queued');
          qBtn.innerHTML = CARD_ICONS.QUEUE_ADDED;
          qBtn.title = 'Remove from Up Next';
        } else {
          qBtn.classList.remove('is-queued');
          qBtn.innerHTML = CARD_ICONS.QUEUE;
          qBtn.title = 'Add to Up Next';
        }
      }
    });

    if (elements.queueModal && !elements.queueModal.classList.contains('hidden')) {
      renderQueueModalContent();
    }
  }

  function renderQueueModalContent() {
    if (!elements.queueNowPlayingContainer || !elements.queueItemsContainer) return;

    if (state.currentEpisode) {
      const cur = state.currentEpisode;
      elements.queueNowPlayingContainer.innerHTML = `
        <div class="queue-now-playing-card">
          <div class="queue-now-playing-label">Now Playing</div>
          <div class="queue-now-playing-row">
            <img class="queue-item-artwork" src="${cur.artwork || FALLBACK_ARTWORK}" alt="" onerror="this.onerror=null;this.src='${FALLBACK_ARTWORK}';">
            <div class="queue-item-info">
              <div class="queue-item-title">${escapeHtml(cur.title)}</div>
              <div class="queue-item-meta">${cur.isYouTube ? 'YouTube' : escapeHtml(cur.podcastTitle)}</div>
            </div>
            <div class="queue-now-playing-indicator">
              <span></span><span></span><span></span>
            </div>
          </div>
        </div>
      `;
    } else {
      elements.queueNowPlayingContainer.innerHTML = '';
    }

    elements.queueItemsContainer.innerHTML = '';
    if (!state.queue || state.queue.length === 0) {
      elements.queueItemsContainer.innerHTML = `
        <div class="queue-empty-box">
          <p>Your queue is empty</p>
          <span>Click the queue icon on any episode to queue it up next.</span>
        </div>
      `;
      return;
    }

    let draggedIndex = null;

    state.queue.forEach((ep, idx) => {
      const row = document.createElement('div');
      row.className = 'queue-item-row';
      row.dataset.guid = ep.guid;
      row.dataset.index = idx;
      row.draggable = true;
      row.innerHTML = `
        <span class="queue-drag-handle" title="Drag to reorder">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="5" r="1"></circle><circle cx="9" cy="12" r="1"></circle><circle cx="9" cy="19" r="1"></circle><circle cx="15" cy="5" r="1"></circle><circle cx="15" cy="12" r="1"></circle><circle cx="15" cy="19" r="1"></circle></svg>
        </span>
        <span class="queue-item-index">${idx + 1}</span>
        <img class="queue-item-artwork" src="${ep.artwork || FALLBACK_ARTWORK}" alt="" onerror="this.onerror=null;this.src='${FALLBACK_ARTWORK}';">
        <div class="queue-item-info">
          <div class="queue-item-title">${escapeHtml(ep.title)}</div>
          <div class="queue-item-meta">${escapeHtml(ep.podcastTitle)}${ep.duration ? ` • ${escapeHtml(ep.duration)}` : ''}</div>
        </div>
        <div class="queue-item-actions">
          <button class="btn-queue-item-play" title="Play Now">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="6 4 20 12 6 20 6 4"></polygon></svg>
          </button>
          <button class="btn-queue-item-remove" title="Remove from Queue">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
          </button>
        </div>
      `;

      row.addEventListener('dragstart', (e) => {
        draggedIndex = idx;
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', String(idx));
        setTimeout(() => row.classList.add('is-dragging'), 0);
      });

      row.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        const rect = row.getBoundingClientRect();
        const midY = rect.top + rect.height / 2;
        if (e.clientY < midY) {
          row.classList.add('drag-over-above');
          row.classList.remove('drag-over-below');
        } else {
          row.classList.add('drag-over-below');
          row.classList.remove('drag-over-above');
        }
      });

      row.addEventListener('dragleave', () => {
        row.classList.remove('drag-over-above', 'drag-over-below');
      });

      row.addEventListener('drop', (e) => {
        e.preventDefault();
        row.classList.remove('drag-over-above', 'drag-over-below');
        const fromIdx = draggedIndex !== null ? draggedIndex : parseInt(e.dataTransfer.getData('text/plain'), 10);
        const toIdx = idx;

        if (fromIdx !== null && !isNaN(fromIdx) && fromIdx !== toIdx) {
          const item = state.queue.splice(fromIdx, 1)[0];
          state.queue.splice(toIdx, 0, item);
          saveQueueToStorage();
          updateQueueUI();
          renderQueueModalContent();
        }
      });

      row.addEventListener('dragend', () => {
        row.classList.remove('is-dragging', 'drag-over-above', 'drag-over-below');
        draggedIndex = null;
      });

      const handle = row.querySelector('.queue-drag-handle');
      if (handle) {
        let touchCurrentRow = null;

        handle.addEventListener('touchstart', () => {
          draggedIndex = idx;
          row.classList.add('is-dragging');
        }, { passive: true });

        handle.addEventListener('touchmove', (e) => {
          const touchY = e.touches[0].clientY;
          const target = document.elementFromPoint(e.touches[0].clientX, touchY);
          const targetRow = target ? target.closest('.queue-item-row') : null;
          document.querySelectorAll('.queue-item-row').forEach(r => r.classList.remove('drag-over-above', 'drag-over-below'));
          if (targetRow && targetRow !== row) {
            touchCurrentRow = targetRow;
            targetRow.classList.add('drag-over-above');
          }
        }, { passive: true });

        handle.addEventListener('touchend', () => {
          row.classList.remove('is-dragging');
          if (touchCurrentRow && draggedIndex !== null) {
            const toIdx = parseInt(touchCurrentRow.dataset.index, 10);
            if (!isNaN(toIdx) && toIdx !== draggedIndex) {
              const item = state.queue.splice(draggedIndex, 1)[0];
              state.queue.splice(toIdx, 0, item);
              saveQueueToStorage();
              updateQueueUI();
              renderQueueModalContent();
            }
          }
          document.querySelectorAll('.queue-item-row').forEach(r => r.classList.remove('drag-over-above', 'drag-over-below'));
          draggedIndex = null;
        });
      }

      row.querySelector('.btn-queue-item-play').addEventListener('click', (e) => {
        e.stopPropagation();
        removeFromQueue(ep.guid);
        playEpisode(ep);
      });

      row.querySelector('.btn-queue-item-remove').addEventListener('click', (e) => {
        e.stopPropagation();
        removeFromQueue(ep.guid);
      });

      elements.queueItemsContainer.appendChild(row);
    });
  }

  function openQueueModal() {
    elements.queueModal.classList.remove('hidden');
    renderQueueModalContent();
    window.history.pushState({ modal: 'queue' }, '', window.location.hash);
  }

  function closeQueueModal() {
    if (window.history.state && window.history.state.modal) {
      window.history.back();
    } else if (elements.queueModal) {
      elements.queueModal.classList.add('hidden');
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // SECTION 12 · Downloads (Offline Listening)
  // Episodes are cached in the Cache API under 'podany-audio-v1'.
  // Metadata (guid, size, title…) is tracked in state.downloadedEpisodes
  // and persisted to localStorage under STORAGE_KEYS.DOWNLOADS.
  // downloadEpisode — fetches audio, falls back to /api/audio-proxy on CORS.
  // ─────────────────────────────────────────────────────────────────────────

  function loadDownloadsFromStorage() {
    try {
      const stored = localStorage.getItem(STORAGE_KEYS.DOWNLOADS) || localStorage.getItem('podcast_pulse_downloads');
      state.downloadedEpisodes = stored ? JSON.parse(stored) : {};
    } catch (e) {
      state.downloadedEpisodes = {};
    }
  }

  function saveDownloadsToStorage() {
    try {
      localStorage.setItem(STORAGE_KEYS.DOWNLOADS, JSON.stringify(state.downloadedEpisodes));
      updateDownloadedCountUI();
    } catch (e) {}
  }

  function formatBytes(bytes) {
    if (!bytes || isNaN(bytes) || bytes <= 0) return '0 MB';
    const mb = bytes / (1024 * 1024);
    if (mb < 1000) {
      return `${mb.toFixed(1)} MB`;
    }
    return `${(mb / 1024).toFixed(2)} GB`;
  }

  function updateDownloadedCountUI() {
    const list = Object.values(state.downloadedEpisodes || {});
    const count = list.length;
    if (elements.downloadedCount) {
      elements.downloadedCount.textContent = count;
    }
    if (elements.downloadsTabCount) {
      elements.downloadsTabCount.textContent = count > 0 ? count : '';
    }
    if (elements.offlineStorageCount) {
      const totalBytes = list.reduce((sum, item) => sum + (item.size || 0), 0);
      elements.offlineStorageCount.textContent = `${count} ${count === 1 ? 'episode' : 'episodes'} (${formatBytes(totalBytes)})`;
    }
    renderOfflineStorageSettings();
  }

  function renderOfflineStorageSettings() {
    if (!elements.offlineEpisodesList) return;
    purgeOrphanedDownloads();
    let list = Object.values(state.downloadedEpisodes || {});
    const q = (state.searchQuery || '').trim().toLowerCase();
    if (q) {
      list = list.filter(item => {
        return (item.title || '').toLowerCase().includes(q) ||
               (item.podcastTitle || '').toLowerCase().includes(q);
      });
    }

    elements.offlineEpisodesList.innerHTML = '';

    if (list.length === 0) {
      elements.offlineEpisodesList.innerHTML = q
        ? `<div class="empty-state" style="grid-column: 1 / -1; padding: 2.5rem 1rem; text-align: center;"><p style="color: var(--text-muted); font-size: 0.9rem;">No downloaded episodes match "${escapeHtml(state.searchQuery)}".</p></div>`
        : '<div class="empty-state" style="grid-column: 1 / -1; padding: 2.5rem 1rem; text-align: center;"><p style="color: var(--text-muted); font-size: 0.9rem;">No episodes downloaded for offline listening yet.</p></div>';
      return;
    }

    list.forEach(item => {
      const matched = (state.allEpisodes || []).find(e => e.guid === item.guid);
      const ep = matched ? { ...matched, size: item.size } : { ...item };
      const card = createEpisodeCard(ep);
      elements.offlineEpisodesList.appendChild(card);
    });
  }

  async function downloadEpisode(ep) {
    if (!ep || !ep.audioUrl) return;
    if (state.downloadingGuids.has(ep.guid)) return;

    state.downloadingGuids.add(ep.guid);
    updateEpisodeCardDownloadState(ep.guid);

    try {
      let response = null;
      try {
        response = await fetch(ep.audioUrl, { mode: 'cors' });
        if (!response.ok) response = null;
      } catch (e) {
        response = null;
      }

      if (!response) {
        const proxyUrl = `/api/audio-proxy?url=${encodeURIComponent(ep.audioUrl)}`;
        response = await fetch(proxyUrl);
      }

      if (!response || !response.ok) {
        throw new Error('Unable to download audio stream');
      }

      const blob = await response.blob();
      const approxSize = blob.size || 0;

      if ('caches' in window) {
        const audioCache = await caches.open('podany-audio-v1');
        const headers = new Headers();
        headers.set('Content-Type', blob.type || 'audio/mpeg');
        headers.set('Content-Length', String(blob.size));
        headers.set('Accept-Ranges', 'bytes');
        const cacheResponse = new Response(blob, {
          status: 200,
          statusText: 'OK',
          headers: headers
        });
        await audioCache.put(ep.audioUrl, cacheResponse);
      }

      state.downloadedEpisodes[ep.guid] = {
        guid: ep.guid,
        feedUrl: ep.feedUrl,
        audioUrl: ep.audioUrl,
        title: ep.title,
        podcastTitle: ep.podcastTitle,
        artwork: ep.artwork,
        duration: ep.duration,
        timestamp: ep.timestamp,
        size: approxSize,
        downloadedAt: Date.now()
      };

      saveDownloadsToStorage();
    } catch (err) {
      alert(`Download failed: ${err.message || 'Network error'}`);
    } finally {
      state.downloadingGuids.delete(ep.guid);
      updateEpisodeCardDownloadState(ep.guid);
      if (state.filterMode === 'downloaded') {
        processAndSortEpisodes();
        renderTimeline();
      }
    }
  }

  async function removeDownloadedEpisode(guid) {
    const ep = state.downloadedEpisodes[guid];
    if (ep && 'caches' in window) {
      try {
        const audioCache = await caches.open('podany-audio-v1');
        await audioCache.delete(ep.audioUrl);
      } catch (e) {}
    }
    delete state.downloadedEpisodes[guid];
    saveDownloadsToStorage();
    updateEpisodeCardDownloadState(guid);
    if (state.filterMode === 'downloaded') {
      processAndSortEpisodes();
      renderTimeline();
    }
  }

  async function clearAllDownloads() {
    if ('caches' in window) {
      try {
        await caches.delete('podany-audio-v1');
      } catch (e) {}
    }
    state.downloadedEpisodes = {};
    saveDownloadsToStorage();
    document.querySelectorAll('.btn-download-ep').forEach(btn => {
      btn.classList.remove('is-downloaded', 'is-downloading');
      btn.innerHTML = CARD_ICONS.DOWNLOAD;
      btn.title = 'Download for offline';
    });
    if (state.filterMode === 'downloaded') {
      processAndSortEpisodes();
      renderTimeline();
    }
  }

  function updateEpisodeCardDownloadState(guid) {
    const isDownloaded = !!state.downloadedEpisodes[guid];
    const isDownloading = state.downloadingGuids.has(guid);
    const cards = document.querySelectorAll(`.episode-card[data-guid="${guid}"]`);

    cards.forEach(card => {
      const btn = card.querySelector('.btn-download-ep');
      if (!btn) return;
      btn.classList.toggle('is-downloaded', isDownloaded);
      btn.classList.toggle('is-downloading', isDownloading);
      if (isDownloading) {
        btn.innerHTML = CARD_ICONS.DOWNLOAD_SPINNER;
        btn.title = 'Downloading...';
      } else if (isDownloaded) {
        btn.innerHTML = CARD_ICONS.DOWNLOADED;
        btn.title = 'Downloaded (Click to remove)';
      } else {
        btn.innerHTML = CARD_ICONS.DOWNLOAD;
        btn.title = 'Download for offline';
      }
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // SECTION 13 · Service Worker & Network
  // initServiceWorker — registers sw.js for offline caching.
  // setupNetworkListeners — online/offline badge + resize → shelf rerender.
  // ─────────────────────────────────────────────────────────────────────────

  function initServiceWorker() {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }
  }

  function setupNetworkListeners() {
    const updateStatus = () => {
      if (!elements.offlineBadge) return;
      if (navigator.onLine) {
        elements.offlineBadge.classList.add('hidden');
      } else {
        elements.offlineBadge.classList.remove('hidden');
      }
    };
    window.addEventListener('online', updateStatus);
    window.addEventListener('offline', updateStatus);
    window.addEventListener('resize', () => {
      if (state.continueCollapsed && state.allEpisodes.length > 0) {
        renderContinueShelf();
      }
    });
    updateStatus();
  }

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

    // Process feeds in bounded concurrent chunks (max 5 in-flight)
    // to avoid overloading Cloudflare Workers subrequest limits and causing 503s.
    const CONCURRENCY = 5;
    const queue = [...state.feeds];
    const workers = Array(Math.min(CONCURRENCY, queue.length)).fill(0).map(async () => {
      while (queue.length > 0) {
        const url = queue.shift();
        if (url) {
          await fetchSingleFeed(url, incomingEpisodes, updatedMetadata);
        }
      }
    });
    await Promise.all(workers);

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

      let response = await fetch(apiUrl, { headers });

      // If Cloudflare or origin returns 503/524, retry once after a short backoff
      if (response.status === 503 || response.status === 524) {
        await new Promise(r => setTimeout(r, 750));
        response = await fetch(apiUrl, { headers });
      }

      if (response.status === 401) {
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

  function formatHumanRelativeDate(dateInput) {
    if (!dateInput) return '';
    const d = new Date(dateInput);
    if (isNaN(d.getTime())) return '';
    const now = new Date();
    const diffSec = Math.floor((now - d) / 1000);
    if (diffSec < 0 || diffSec < 60) return 'Just now';
    if (diffSec < 3600) {
      const m = Math.floor(diffSec / 60);
      return `${m}m ago`;
    }
    const diffHours = Math.floor(diffSec / 3600);
    if (diffHours < 24) {
      return `${diffHours}h ago`;
    }
    const diffDays = Math.floor(diffSec / 86400);
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;
    if (diffDays < 14) return '1 week ago';
    if (diffDays < 30) {
      const weeks = Math.floor(diffDays / 7);
      return `${weeks} weeks ago`;
    }
    if (diffDays < 60) return '1 month ago';
    if (diffDays < 365) {
      const months = Math.floor(diffDays / 30);
      return `${months} months ago`;
    }
    const years = Math.floor(diffDays / 365);
    return `${years} ${years === 1 ? 'year' : 'years'} ago`;
  }

  function formatEpisodeDuration(durStr) {
    if (!durStr) return '';
    const trimmed = String(durStr).trim();
    if (trimmed === '0:00' || trimmed === '0' || trimmed === '00:00' || trimmed === '00:00:00') {
      return '';
    }
    if (trimmed.startsWith('00:')) {
      return trimmed.slice(3);
    }
    const sec = parseDurationSeconds(trimmed);
    if (!sec || sec <= 0) return '';
    return formatTime(sec);
  }

  function processAndSortEpisodes() {
    let list = [...state.allEpisodes];

    if (!state.searchQuery && state.mutedFeeds && state.mutedFeeds.length > 0) {
      list = list.filter(ep => !state.mutedFeeds.includes(ep.feedUrl));
    }

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
    'Music': [
      { label: 'Electronic & Club', query: 'Electronic Music' },
      { label: 'Jazz & Soul', query: 'Jazz Music' },
      { label: 'Hip Hop & Rap', query: 'Hip Hop' },
      { label: 'Rock & Indie', query: 'Indie Rock' },
      { label: 'Classical & Ambient', query: 'Classical Music' },
      { label: 'DJ Mixes & Sets', query: 'DJ Mix' }
    ],
    'Tech': [
      { label: 'Artificial Intelligence', query: 'AI Artificial Intelligence' },
      { label: 'Software & Dev', query: 'Software Engineering Coding' },
      { label: 'Cybersecurity', query: 'Cybersecurity' },
      { label: 'Startups & Tech News', query: 'Tech Startups' },
      { label: 'Gadgets & Hardware', query: 'Hardware Gadgets' }
    ],
    'News': [
      { label: 'Daily Briefings', query: 'Daily News Briefing' },
      { label: 'World Affairs & Politics', query: 'World News Politics' },
      { label: 'Business & Markets', query: 'Business Economy Markets' },
      { label: 'Investigative Journalism', query: 'Investigative Journalism' }
    ],
    'Wissen': [
      { label: 'Astronomy & Space', query: 'Astronomy Space NASA' },
      { label: 'Biology & Nature', query: 'Nature Biology Wildlife' },
      { label: 'History & Deep Dives', query: 'History Deep Dive' },
      { label: 'Physics & Earth Science', query: 'Physics Science' },
      { label: 'Psychology & Mind', query: 'Psychology Neuroscience' }
    ],
    'Culture': [
      { label: 'Cinema & TV Shows', query: 'Film Cinema Movies' },
      { label: 'Literature & Books', query: 'Books Literature' },
      { label: 'Art & Design', query: 'Art Design' },
      { label: 'Society & Philosophy', query: 'Philosophy Society Culture' }
    ],
    'True Crime': [
      { label: 'Serial & Solved', query: 'True Crime Mystery' },
      { label: 'Unsolved & Cold Cases', query: 'Unsolved Cold Cases' },
      { label: 'Courtroom & Law', query: 'Courtroom True Crime Law' },
      { label: 'Heists & Scams', query: 'Scams Heists Fraud' }
    ],
    'Comedy': [
      { label: 'Stand-Up & Interviews', query: 'Stand Up Comedians' },
      { label: 'Satire & Parody', query: 'Satire Comedy' },
      { label: 'Improv & Storytelling', query: 'Improv Comedy' }
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
  // renderNextDirectoryBatch — appends next page of DIR_PAGE_SIZE results.
  // ─────────────────────────────────────────────────────────────────────────

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
    container.innerHTML = `<p style="color: var(--text-muted); padding: 0.5rem;">Searching directory...</p>`;

    try {
      const countryParam = (state.directoryCountry && state.directoryCountry !== 'all') ? `&country=${state.directoryCountry}` : '';
      const searchUrl = `https://itunes.apple.com/search?term=${encodeURIComponent(q)}&entity=podcast${countryParam}&limit=200`;
      const res = await fetch(searchUrl);
      if (!res.ok) throw new Error('Search failed');

      const data = await res.json();
      const results = (data.results || []).filter(item => Boolean(item.feedUrl));
      container.innerHTML = '';

      if (results.length === 0) {
        container.innerHTML = `<p style="color: var(--text-muted); padding: 0.5rem;">No podcasts found matching your query.</p>`;
        return;
      }

      const listEl = document.createElement('div');
      listEl.className = 'dir-search-list';
      listEl.style.display = 'flex';
      listEl.style.flexDirection = 'column';
      listEl.style.gap = '0.5rem';
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
      const relDate = item.releaseDate ? formatCompactDate(item.releaseDate) : '';

      const card = document.createElement('div');
      card.className = 'dir-search-card';
      card.style.cursor = 'pointer';

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

      card.addEventListener('click', () => {
        if (elements.addModal && !elements.addModal.classList.contains('hidden')) {
          closeAddModal();
        }
        if (!state.feedMetadata[item.feedUrl]) {
          state.feedMetadata[item.feedUrl] = {
            title: item.collectionName || item.trackName,
            author: item.artistName || '',
            artwork: item.artworkUrl600 || item.artworkUrl100
          };
        }
        openFeedDetail(item.feedUrl);
      });

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

      s.listEl.appendChild(card);
    });
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

    elements.continueShelf.classList.remove('hidden');
    elements.continueGrid.innerHTML = '';

    const capacity = getContinueRowCapacity();

    if (elements.btnToggleContinue && elements.continueToggleLabel) {
      if (inProgressEps.length <= capacity) {
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

    const visibleEps = state.continueCollapsed ? inProgressEps.slice(0, capacity) : inProgressEps;
    visibleEps.forEach(ep => {
      elements.continueGrid.appendChild(createEpisodeCard(ep));
    });
  }

  function setDirectoryCountry(code) {
    state.directoryCountry = code || 'all';
    document.querySelectorAll('.region-chip').forEach(c => {
      c.classList.toggle('active', c.dataset.region === state.directoryCountry);
    });
  }

  let emptySearchDebounceTimer = null;

  function wireEmptyStateEvents() {
    const quickForm = document.getElementById('empty-quick-form');
    const quickInput = document.getElementById('empty-quick-input');
    const quickSubmit = document.getElementById('btn-empty-quick-submit');
    const quickResults = document.getElementById('empty-quick-results');

    const regionChips = elements.timelineList?.querySelectorAll('.region-chip');
    if (regionChips) {
      regionChips.forEach(chip => {
        chip.classList.toggle('active', chip.dataset.region === state.directoryCountry);
        chip.addEventListener('click', () => {
          setDirectoryCountry(chip.dataset.region);
          if (quickInput && quickInput.value.trim()) {
            searchPodcastDirectory(quickInput.value.trim(), quickResults);
          }
        });
      });
    }

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
      updateDockVisibility();
    });

    const emptyCatChips = elements.timelineList?.querySelectorAll('#empty-category-chips .category-chip');
    if (emptyCatChips && quickInput && quickResults) {
      emptyCatChips.forEach(chip => {
        chip.addEventListener('click', () => {
          const cat = chip.dataset.category;
          quickInput.value = cat;
          if (quickSubmit) quickSubmit.textContent = 'Search';
          searchPodcastDirectory(cat, quickResults);
        });
      });
    }

    const chips = elements.timelineList?.querySelectorAll('.starter-suggestion-chip');
    if (chips) {
      chips.forEach(chip => {
        chip.addEventListener('click', () => {
          const feedUrl = chip.dataset.feed;
          if (!feedUrl) return;
          const addSpan = chip.querySelector('.starter-chip-add');
          if (addSpan) addSpan.textContent = 'Adding...';
          addFeed(feedUrl);
        });
      });
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // SECTION 18 · Timeline Rendering
  // renderTimeline — main episode list (handles empty/onboarding state).
  // appendTimelineBatch / setupSentinelObserver — infinite scroll via
  // IntersectionObserver; loads 30 cards at a time.
  // wireEmptyStateEvents — wires up the onboarding empty state UI.
  // ─────────────────────────────────────────────────────────────────────────

  function renderTimeline() {
    updateDockVisibility();
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
            <div class="dir-filters-row">
              <div class="empty-category-chips" id="empty-category-chips">
                <button type="button" class="category-chip" data-category="News">News</button>
                <button type="button" class="category-chip" data-category="Tech">Tech</button>
                <button type="button" class="category-chip" data-category="Wissen">Science & Wissen</button>
                <button type="button" class="category-chip" data-category="Culture">Culture</button>
                <button type="button" class="category-chip" data-category="True Crime">True Crime</button>
                <button type="button" class="category-chip" data-category="Comedy">Comedy</button>
                <button type="button" class="category-chip" data-category="Music">Music</button>
              </div>
              <div class="dir-region-toggle">
                <button type="button" class="region-chip active" data-region="de" title="German directory shows">🇩🇪 DE</button>
                <button type="button" class="region-chip" data-region="all" title="Global directory shows">🌐 Global</button>
              </div>
            </div>
            <div id="empty-quick-results" class="quick-results-container"></div>
          </div>
          <div class="empty-actions">
            <button class="btn btn-secondary" id="btn-empty-opml-trigger">Import OPML File</button>
          </div>
          <div class="starter-suggestions-section">
            <div class="starter-suggestions-title">Discover Science, Planet & Climate shows:</div>
            <div class="starter-suggestions-grid">
              <div class="starter-suggestion-chip" data-feed="https://feeds.megaphone.fm/NATIONALAERONAUTICSANDSPACEADMINISTRATION8162188566">
                <span class="starter-chip-name">NASA's Curious Universe</span>
                <span class="starter-chip-add">+ Follow</span>
              </div>
              <div class="starter-suggestion-chip" data-feed="https://feeds.simplecast.com/EmVW7VGp">
                <span class="starter-chip-name">Radiolab</span>
                <span class="starter-chip-add">+ Follow</span>
              </div>
              <div class="starter-suggestion-chip" data-feed="https://www.deutschlandfunk.de/forschung-aktuell-102.xml">
                <span class="starter-chip-name">Forschung aktuell (DLF)</span>
                <span class="starter-chip-add">+ Follow</span>
              </div>
              <div class="starter-suggestion-chip" data-feed="https://www.ndr.de/nachrichten/info/podcast4696.xml">
                <span class="starter-chip-name">ARD Klima-Update</span>
                <span class="starter-chip-add">+ Follow</span>
              </div>
              <div class="starter-suggestion-chip" data-feed="https://feeds.simplecast.com/NM3_bR51">
                <span class="starter-chip-name">ZEIT WISSEN</span>
                <span class="starter-chip-add">+ Follow</span>
              </div>
              <div class="starter-suggestion-chip" data-feed="https://podcasts.files.bbci.co.uk/w13xtvb6.rss">
                <span class="starter-chip-name">The Climate Question (BBC)</span>
                <span class="starter-chip-add">+ Follow</span>
              </div>
            </div>
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
      } else if (state.filterMode === 'downloaded') {
        emptyTitle = 'No downloaded episodes';
        emptyMsg = 'Episodes you download for offline listening will appear here.';
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

  // ─────────────────────────────────────────────────────────────────────────
  // SECTION 19 · Episode Cards
  // createEpisodeCard — builds the full interactive episode card element.
  // Show notes: formatShowNotesHtml, openShowNotes, closeShowNotes.
  // Progress scrubbing: setupProgressTrackInteractivity.
  // ─────────────────────────────────────────────────────────────────────────

  function toggleMarkPlayed(ep) {
    const current = state.playbackPositions[ep.guid];
    const isCompleted = current && (current.completed === 1 || current.completed === true);
    if (isCompleted) {
      savePlaybackPositionToD1(ep.guid, 0, false);
    } else {
      savePlaybackPositionToD1(ep.guid, 0, true);
      if (isEpisodeQueued(ep.guid)) {
        removeFromQueue(ep.guid);
      }
    }
    renderContinueShelf();

    const cards = document.querySelectorAll(`.episode-card[data-guid="${ep.guid}"]`);
    cards.forEach(card => {
      card.classList.toggle('is-played', !isCompleted);
      const checkBtn = card.querySelector('.btn-mark-played');
      if (checkBtn) {
        checkBtn.classList.toggle('is-completed', !isCompleted);
        checkBtn.innerHTML = !isCompleted ? CARD_ICONS.CHECK_FILLED : CARD_ICONS.CHECK;
        checkBtn.title = !isCompleted ? 'Mark as Unplayed' : 'Mark as Played';
      }
    });

    if (state.filterMode === 'unplayed' || state.filterMode === 'continue' || state.filterMode === 'played') {
      processAndSortEpisodes();
      renderTimeline();
    }
  }

  function formatShowNotesHtml(rawInput) {
    if (!rawInput) return '<p>No show notes available for this episode.</p>';

    let processed = rawInput;
    const hasHtmlTags = /<\/?[a-z][\s\S]*>/i.test(processed);

    if (!hasHtmlTags) {
      processed = escapeHtml(processed);
      processed = processed.replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>');
      processed = processed.split(/\r?\n\r?\n/).map(p => `<p>${p.replace(/\r?\n/g, '<br>')}</p>`).join('');
    } else {
      const parser = new DOMParser();
      const doc = parser.parseFromString(`<div>${processed}</div>`, 'text/html');
      const container = doc.body.firstElementChild || doc.body;

      const dangerous = container.querySelectorAll('script, style, iframe, object, embed, form, input, button');
      dangerous.forEach(el => el.remove());

      const links = container.querySelectorAll('a');
      links.forEach(a => {
        a.setAttribute('target', '_blank');
        a.setAttribute('rel', 'noopener noreferrer');
      });

      processed = container.innerHTML;
    }

    processed = processed.replace(/\b(?:(\d{1,2}):)?([0-5]?\d):([0-5]\d)\b/g, (match, h, m, s) => {
      const hours = h ? parseInt(h, 10) : 0;
      const mins = parseInt(m, 10);
      const secs = parseInt(s, 10);
      const totalSec = (hours * 3600) + (mins * 60) + secs;
      return `<button type="button" class="note-timestamp" data-seconds="${totalSec}">${match}</button>`;
    });

    return processed;
  }

  function seekToExactTime(seconds) {
    if (state.activeEngine === 'audio' && elements.audio) {
      elements.audio.currentTime = seconds;
    } else if (state.activeEngine === 'youtube' && state.ytPlayer && state.ytPlayer.seekTo) {
      state.ytPlayer.seekTo(seconds, true);
    }
    updateProgress();
  }

  function openShowNotes(targetEp) {
    const ep = targetEp || state.currentEpisode;
    if (!ep || !elements.showNotesModal) return;

    if (elements.showNotesPodcastTitle) {
      elements.showNotesPodcastTitle.textContent = ep.podcastTitle || 'Podcast';
    }
    if (elements.showNotesEpisodeTitle) {
      elements.showNotesEpisodeTitle.textContent = ep.title || 'Untitled Episode';
    }
    if (elements.showNotesMeta) {
      const dStr = ep.timestamp ? formatHumanRelativeDate(ep.timestamp) : (ep.pubDate || '');
      const dur = ep.duration ? formatEpisodeDuration(ep.duration) : '';
      elements.showNotesMeta.innerHTML = [
        dStr ? `<span>${escapeHtml(dStr)}</span>` : '',
        dur ? `<span class="show-notes-duration">${escapeHtml(dur)}</span>` : ''
      ].filter(Boolean).join(' • ');
    }
    if (elements.showNotesContent) {
      const rawContent = ep.content || ep.description || '';
      elements.showNotesContent.innerHTML = formatShowNotesHtml(rawContent);

      elements.showNotesContent.querySelectorAll('.note-timestamp').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.preventDefault();
          const sec = parseFloat(btn.dataset.seconds);
          if (isNaN(sec)) return;
          if (state.currentEpisode && state.currentEpisode.guid === ep.guid) {
            seekToExactTime(sec);
            if (state.playbackStatus !== 'playing') {
              resumeCurrentEngine();
            }
          } else {
            playEpisode(ep);
            setTimeout(() => {
              seekToExactTime(sec);
            }, 300);
          }
        });
      });
    }

    elements.showNotesModal.classList.remove('hidden');
    window.history.pushState({ modal: 'showNotes' }, '', window.location.hash);
  }

  function closeShowNotes() {
    if (window.history.state && window.history.state.modal) {
      window.history.back();
    } else if (elements.showNotesModal) {
      elements.showNotesModal.classList.add('hidden');
    }
  }

  function setupProgressTrackInteractivity(progressTrack, card, ep) {
    if (!progressTrack) return;
    let isDragging = false;

    const handleScrub = (clientX, commit) => {
      const rect = progressTrack.getBoundingClientRect();
      if (rect.width <= 0) return;
      const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      const pct = Math.round(ratio * 100);
      const fillEl = progressTrack.querySelector('.ep-progress-fill');
      if (fillEl) fillEl.style.width = `${pct}%`;

      let totalDur = 0;
      if (state.currentEpisode && state.currentEpisode.guid === ep.guid) {
        if (state.activeEngine === 'audio' && elements.audio.duration && !isNaN(elements.audio.duration) && isFinite(elements.audio.duration)) {
          totalDur = elements.audio.duration;
        } else if (state.activeEngine === 'youtube' && state.ytPlayer && state.ytPlayer.getDuration) {
          totalDur = state.ytPlayer.getDuration() || 0;
        }
      }
      if (!totalDur && ep.duration) {
        totalDur = parseDurationSeconds(ep.duration);
      }

      if (totalDur > 0) {
        const targetTime = Math.round(ratio * totalDur);
        const resumeBadge = card.querySelector('.ep-resume-time');
        if (resumeBadge) resumeBadge.textContent = `• Resumes at ${formatTime(targetTime)}`;

        if (commit) {
          state.playbackPositions[ep.guid] = {
            position: targetTime,
            completed: false,
            lastListenedAt: Math.floor(Date.now() / 1000)
          };
          savePositionsToStorage();

          if (state.currentEpisode && state.currentEpisode.guid === ep.guid) {
            if (state.activeEngine === 'audio') {
              elements.audio.currentTime = targetTime;
              if (elements.audio.paused) {
                elements.audio.play().catch(() => {});
                state.playbackStatus = 'playing';
                syncPlaybackButtons();
              }
            } else if (state.activeEngine === 'youtube' && state.ytPlayer && state.ytPlayer.seekTo) {
              state.ytPlayer.seekTo(targetTime, true);
              state.ytPlayer.playVideo();
              state.playbackStatus = 'playing';
              syncPlaybackButtons();
            }
          } else {
            playEpisode(ep, targetTime);
          }
        }
      } else if (commit) {
        if (!state.currentEpisode || state.currentEpisode.guid !== ep.guid) {
          playEpisode(ep);
        } else if (state.activeEngine === 'audio' && elements.audio.paused) {
          elements.audio.play().catch(() => {});
          state.playbackStatus = 'playing';
          syncPlaybackButtons();
        } else if (state.activeEngine === 'youtube' && state.ytPlayer && state.ytPlayer.playVideo) {
          state.ytPlayer.playVideo();
          state.playbackStatus = 'playing';
          syncPlaybackButtons();
        }
      }
    };

    progressTrack.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      isDragging = true;
      try { progressTrack.setPointerCapture(e.pointerId); } catch (_) {}
      handleScrub(e.clientX, false);
    });

    progressTrack.addEventListener('pointermove', (e) => {
      if (!isDragging) return;
      e.stopPropagation();
      handleScrub(e.clientX, false);
    });

    progressTrack.addEventListener('pointerup', (e) => {
      if (!isDragging) return;
      e.stopPropagation();
      isDragging = false;
      try { progressTrack.releasePointerCapture(e.pointerId); } catch (_) {}
      handleScrub(e.clientX, true);
    });

    progressTrack.addEventListener('pointercancel', (e) => {
      if (!isDragging) return;
      isDragging = false;
      try { progressTrack.releasePointerCapture(e.pointerId); } catch (_) {}
    });

    progressTrack.addEventListener('click', (e) => {
      e.stopPropagation();
    });
  }

  function createEpisodeCard(ep) {
    const isCurrentlyActive = state.currentEpisode && state.currentEpisode.guid === ep.guid;
    const isPlaying = isCurrentlyActive && state.playbackStatus === 'playing';
    const isLoading = isCurrentlyActive && state.playbackStatus === 'loading';
    const isQueued = isEpisodeQueued(ep.guid);

    const savedPos = state.playbackPositions[ep.guid];
    const isCompleted = savedPos && (savedPos.completed === 1 || savedPos.completed === true);
    const hasProgress = (isCurrentlyActive || (savedPos && savedPos.position > 2)) && !isCompleted;
    const curPos = isCurrentlyActive ? ((state.activeEngine === 'audio' ? elements.audio.currentTime : (state.ytPlayer && state.ytPlayer.getCurrentTime ? state.ytPlayer.getCurrentTime() : 0)) || (savedPos ? savedPos.position : 0)) : (savedPos ? savedPos.position : 0);
    const resumeTimeStr = hasProgress ? `Resumes at ${formatTime(curPos)}` : '';

    let progressTrackHtml = '';
    if (hasProgress) {
      let durSec = 0;
      if (isCurrentlyActive) {
        if (state.activeEngine === 'audio' && elements.audio.duration && !isNaN(elements.audio.duration) && isFinite(elements.audio.duration)) {
          durSec = elements.audio.duration;
        } else if (state.activeEngine === 'youtube' && state.ytPlayer && state.ytPlayer.getDuration) {
          durSec = state.ytPlayer.getDuration();
        }
      }
      if (!durSec && ep.duration) {
        durSec = parseDurationSeconds(ep.duration);
      }
      let progressPct = 0;
      if (durSec > 0) {
        progressPct = Math.min(100, Math.max(1, Math.round((curPos / durSec) * 100)));
      } else {
        progressPct = 5;
      }
      progressTrackHtml = `<div class="ep-progress-track" title="Click or scrub to resume at any point"><div class="ep-progress-fill" style="width: ${progressPct}%"></div></div>`;
    }

    const card = document.createElement('div');
    card.className = `episode-card ${isCurrentlyActive ? 'playing' : ''} ${isCompleted ? 'is-played' : ''}`;
    card.dataset.guid = ep.guid;

    const dateInput = ep.timestamp || ep.pubDate;
    const humanDate = dateInput ? formatHumanRelativeDate(dateInput) : 'Unknown date';
    const fullDate = dateInput ? new Date(dateInput).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '';
    const formattedDuration = ep.duration ? formatEpisodeDuration(ep.duration) : '';

    let btnHtml = CARD_ICONS.PLAY;
    let btnTitle = 'Play';
    if (isLoading) {
      btnHtml = CARD_ICONS.SPINNER;
      btnTitle = 'Loading...';
    } else if (isPlaying) {
      btnHtml = CARD_ICONS.PAUSE;
      btnTitle = 'Pause';
    }

    const isDownloaded = !!state.downloadedEpisodes[ep.guid];
    const isDownloading = state.downloadingGuids.has(ep.guid);
    let dlIcon = CARD_ICONS.DOWNLOAD;
    let dlTitle = 'Download for offline';
    if (isDownloading) {
      dlIcon = CARD_ICONS.DOWNLOAD_SPINNER;
      dlTitle = 'Downloading...';
    } else if (isDownloaded) {
      dlIcon = CARD_ICONS.DOWNLOADED;
      dlTitle = 'Downloaded (Click to remove)';
    }

    const downloadBtnHtml = ep.isYouTube ? '' : `
      <button class="btn-download-ep ${isDownloaded ? 'is-downloaded' : ''} ${isDownloading ? 'is-downloading' : ''}" title="${dlTitle}">
        ${dlIcon}
      </button>
    `;

    card.innerHTML = `
      <div class="episode-card-top">
        <img class="episode-artwork" src="${ep.artwork || FALLBACK_ARTWORK}" alt="" loading="lazy" onerror="this.onerror=null;this.src='${FALLBACK_ARTWORK}';">
        <div class="episode-header-info">
          <div class="episode-podcast-name">${ep.isYouTube ? 'YOUTUBE' : highlightText(ep.podcastTitle, state.searchQuery)}</div>
          <div class="episode-title">${highlightText(ep.title, state.searchQuery)}</div>
        </div>
      </div>
      ${ep.description ? `<div class="episode-desc">${formatHighlightedDesc(ep.description, state.searchQuery)} <span class="episode-desc-link">Notes & links →</span></div>` : ''}
      ${progressTrackHtml}
      <div class="episode-footer">
        <div class="episode-meta">
          <span title="${escapeHtml(fullDate)}" class="date-line" style="display:block;">${escapeHtml(humanDate)}</span>
          <span class="time-line" style="display:block;">
            ${formattedDuration ? `<span>${escapeHtml(formattedDuration)}</span>` : ''}
            ${resumeTimeStr ? `<span class="ep-resume-time" title="Click to resume playback">• ${resumeTimeStr}</span>` : ''}
          </span>
        </div>
        <div class="episode-card-actions" style="display:flex; gap:4px; flex-wrap:nowrap;">
          ${downloadBtnHtml}
          <button class="btn-queue-ep ${isQueued ? 'is-queued' : ''}" title="${isQueued ? 'Remove from Up Next' : 'Add to Up Next'}">
            ${isQueued ? CARD_ICONS.QUEUE_ADDED : CARD_ICONS.QUEUE}
          </button>
          <button class="btn-mark-played ${isCompleted ? 'is-completed' : ''}" title="${isCompleted ? 'Mark as Unplayed' : 'Mark as Played'}">
            ${isCompleted ? CARD_ICONS.CHECK_FILLED : CARD_ICONS.CHECK}
          </button>
          <button class="btn-play-ep" title="${btnTitle}">
            ${btnHtml}
          </button>
        </div>
      </div>
    `;

    const descEl = card.querySelector('.episode-desc');
    if (descEl) {
      descEl.addEventListener('click', (e) => {
        e.stopPropagation();
        openShowNotes(ep);
      });
    }

    const titleEl = card.querySelector('.episode-title');
    if (titleEl) {
      titleEl.addEventListener('click', (e) => {
        e.stopPropagation();
        openShowNotes(ep);
      });
    }

    const podNameEl = card.querySelector('.episode-podcast-name');
    if (podNameEl && ep.feedUrl) {
      podNameEl.addEventListener('click', (e) => {
        e.stopPropagation();
        openFeedDetail(ep.feedUrl);
      });
    }

    const dlBtn = card.querySelector('.btn-download-ep');
    if (dlBtn) {
      dlBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (state.downloadedEpisodes[ep.guid]) {
          removeDownloadedEpisode(ep.guid);
        } else {
          downloadEpisode(ep);
        }
      });
    }

    card.querySelector('.btn-play-ep').addEventListener('click', (e) => {
      e.stopPropagation();
      toggleEpisodePlayback(ep);
    });

    card.querySelector('.btn-queue-ep').addEventListener('click', (e) => {
      e.stopPropagation();
      toggleEpisodeQueue(ep);
    });

    card.querySelector('.btn-mark-played').addEventListener('click', (e) => {
      e.stopPropagation();
      toggleMarkPlayed(ep);
    });

    const progressTrack = card.querySelector('.ep-progress-track');
    if (progressTrack) {
      setupProgressTrackInteractivity(progressTrack, card, ep);
    }

    const resumeBadge = card.querySelector('.ep-resume-time');
    if (resumeBadge) {
      resumeBadge.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleEpisodePlayback(ep);
      });
    }

    return card;
  }

  let feedsSearchDebounceTimer = null;

  // ─────────────────────────────────────────────────────────────────────────
  // SECTION 20 · Feeds Grid & Feed Detail
  // renderFeedsGrid — podcast library grid with per-feed episode widgets.
  // openFeedDetail / renderFeedDetail — drills into a single podcast.
  // ─────────────────────────────────────────────────────────────────────────

  function wireFeedsEmptyStateEvents() {
    const quickForm = document.getElementById('feeds-empty-quick-form');
    const quickInput = document.getElementById('feeds-empty-quick-input');
    const quickSubmit = document.getElementById('btn-feeds-empty-quick-submit');
    const quickResults = document.getElementById('feeds-empty-quick-results');

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
        if (feedsSearchDebounceTimer) clearTimeout(feedsSearchDebounceTimer);
        if (!val) {
          if (quickResults) quickResults.innerHTML = '';
          return;
        }
        if (val.startsWith('http://') || val.startsWith('https://')) {
          if (quickResults) quickResults.innerHTML = '';
          return;
        }
        feedsSearchDebounceTimer = setTimeout(() => {
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
          if (feedsSearchDebounceTimer) clearTimeout(feedsSearchDebounceTimer);
          if (quickResults) {
            searchPodcastDirectory(val, quickResults);
          }
        }
      });
    }

    const regionChips = elements.feedsList?.querySelectorAll('.region-chip');
    if (regionChips) {
      regionChips.forEach(chip => {
        chip.classList.toggle('active', chip.dataset.region === state.directoryCountry);
        chip.addEventListener('click', () => {
          setDirectoryCountry(chip.dataset.region);
          if (quickInput && quickInput.value.trim()) {
            searchPodcastDirectory(quickInput.value.trim(), quickResults);
          }
        });
      });
    }

    const catChips = document.querySelectorAll('#feeds-empty-category-chips .category-chip');
    catChips.forEach(chip => {
      chip.addEventListener('click', () => {
        const cat = chip.dataset.category;
        if (quickInput) quickInput.value = cat;
        if (quickResults) searchPodcastDirectory(cat, quickResults);
      });
    });

    document.getElementById('btn-feeds-empty-opml')?.addEventListener('click', () => {
      elements.opmlFileInput?.click();
    });
    document.getElementById('btn-feeds-empty-defaults')?.addEventListener('click', () => {
      elements.btnLoadDefaults?.click();
    });

    const chips = elements.feedsGrid.querySelectorAll('.starter-suggestion-chip');
    chips.forEach(chip => {
      chip.addEventListener('click', () => {
        const feedUrl = chip.dataset.feed;
        if (!feedUrl) return;
        const addSpan = chip.querySelector('.starter-chip-add');
        if (addSpan) addSpan.textContent = 'Adding...';
        addFeed(feedUrl);
      });
    });
  }

  function renderFeedsGrid() {
    updateDockVisibility();
    const grid = elements.feedsGrid;
    grid.innerHTML = '';

    if (state.feeds.length === 0) {
      grid.innerHTML = `
        <div class="empty-state onboarding-card">
          <div class="empty-icon-wrap">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
              <path d="M4 11a9 9 0 0 1 9 9"></path>
              <path d="M4 4a16 16 0 0 1 16 16"></path>
              <circle cx="5" cy="19" r="1"></circle>
            </svg>
          </div>
          <h3>Your podcast library is empty</h3>
          <p>Search any podcast by name, paste an RSS feed URL, or import an OPML backup to start listening.</p>
          <div class="empty-quick-add">
            <form id="feeds-empty-quick-form" class="quick-add-form" action="javascript:void(0);">
              <div class="quick-add-input-wrap">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="quick-add-icon"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
                <input type="text" id="feeds-empty-quick-input" placeholder="Search podcast name or paste RSS URL..." autocomplete="off">
                <button type="submit" class="btn btn-primary btn-quick-submit" id="btn-feeds-empty-quick-submit">Add</button>
              </div>
            </form>
            <div class="dir-filters-row">
              <div class="empty-category-chips" id="feeds-empty-category-chips">
                <button type="button" class="category-chip" data-category="News">News</button>
                <button type="button" class="category-chip" data-category="Tech">Tech</button>
                <button type="button" class="category-chip" data-category="Wissen">Science & Wissen</button>
                <button type="button" class="category-chip" data-category="Culture">Culture</button>
                <button type="button" class="category-chip" data-category="True Crime">True Crime</button>
                <button type="button" class="category-chip" data-category="Comedy">Comedy</button>
                <button type="button" class="category-chip" data-category="Music">Music</button>
              </div>
              <div class="dir-region-toggle">
                <button type="button" class="region-chip active" data-region="de" title="German directory shows">🇩🇪 DE</button>
                <button type="button" class="region-chip" data-region="all" title="Global directory shows">🌐 Global</button>
              </div>
            </div>
            <div id="feeds-empty-quick-results" class="quick-results-container"></div>
          </div>
          <div class="empty-actions">
            <button class="btn btn-secondary" id="btn-feeds-empty-opml">Import OPML File</button>
          </div>
          <div class="starter-suggestions-section">
            <div class="starter-suggestions-title">Discover Science, Planet & Climate shows:</div>
            <div class="starter-suggestions-grid">
              <div class="starter-suggestion-chip" data-feed="https://feeds.megaphone.fm/NATIONALAERONAUTICSANDSPACEADMINISTRATION8162188566">
                <span class="starter-chip-name">NASA's Curious Universe</span>
                <span class="starter-chip-add">+ Follow</span>
              </div>
              <div class="starter-suggestion-chip" data-feed="https://feeds.simplecast.com/EmVW7VGp">
                <span class="starter-chip-name">Radiolab</span>
                <span class="starter-chip-add">+ Follow</span>
              </div>
              <div class="starter-suggestion-chip" data-feed="https://www.deutschlandfunk.de/forschung-aktuell-102.xml">
                <span class="starter-chip-name">Forschung aktuell (DLF)</span>
                <span class="starter-chip-add">+ Follow</span>
              </div>
              <div class="starter-suggestion-chip" data-feed="https://www.ndr.de/nachrichten/info/podcast4696.xml">
                <span class="starter-chip-name">ARD Klima-Update</span>
                <span class="starter-chip-add">+ Follow</span>
              </div>
              <div class="starter-suggestion-chip" data-feed="https://feeds.simplecast.com/NM3_bR51">
                <span class="starter-chip-name">ZEIT WISSEN</span>
                <span class="starter-chip-add">+ Follow</span>
              </div>
              <div class="starter-suggestion-chip" data-feed="https://podcasts.files.bbci.co.uk/w13xtvb6.rss">
                <span class="starter-chip-name">The Climate Question (BBC)</span>
                <span class="starter-chip-add">+ Follow</span>
              </div>
            </div>
          </div>
        </div>
      `;
      wireFeedsEmptyStateEvents();
      return;
    }

    let feedsToRender = state.feeds;
    if (state.searchQuery && elements.tabFeeds && elements.tabFeeds.classList.contains('active')) {
      const q = state.searchQuery.toLowerCase();
      feedsToRender = state.feeds.filter(url => {
        const meta = state.feedMetadata[url] || {};
        return (meta.title && meta.title.toLowerCase().includes(q)) ||
               (meta.author && meta.author.toLowerCase().includes(q)) ||
               url.toLowerCase().includes(q);
      });
    }

    if (feedsToRender.length === 0) {
      grid.innerHTML = `
        <div class="empty-state">
          <h3>No matching podcasts</h3>
          <p>No podcasts in your library match "${escapeHtml(state.searchQuery)}".</p>
        </div>
      `;
      return;
    }

    feedsToRender.forEach(url => {
      const meta = state.feedMetadata[url] || {};
      const card = document.createElement('div');
      card.className = 'feed-card';

      const rawDesc = meta.description || '';
      const plainDesc = rawDesc.replace(/<[^>]*>?/gm, '').replace(/\s+/g, ' ').trim();

      const allForFeed = state.allEpisodes
        .filter(e => e.feedUrl === url)
        .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

      const inProgressEps = allForFeed.filter(ep => {
        const pos = state.playbackPositions[ep.guid];
        return pos && !pos.completed && pos.position > 2;
      });

      const unplayedEps = allForFeed.filter(ep => {
        const pos = state.playbackPositions[ep.guid];
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
                const pos = state.playbackPositions[ep.guid];
                const isCompleted = pos && (pos.completed === 1 || pos.completed === true);
                const isInProgress = pos && !isCompleted && pos.position > 2;
                let durStr = ep.duration ? formatDurationCompact(ep.duration) : '';
                if (isInProgress) {
                  durStr = `Resume ${formatTime(pos.position)}`;
                } else if (isCompleted) {
                  durStr = `✓ ${durStr}`;
                }
                return `
                  <div class="recent-ep-row ${isCurrent ? 'active' : ''} ${isCompleted ? 'is-played' : ''} ${isInProgress ? 'is-in-progress' : ''}" data-guid="${escapeHtml(ep.guid)}" title="${escapeHtml(ep.title)}">
                    <button class="btn-recent-play ${isEpPlaying ? 'is-playing' : ''}" data-guid="${escapeHtml(ep.guid)}" aria-label="Play ${escapeHtml(ep.title)}">
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">${isEpPlaying ? '<rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect>' : '<polygon points="5 3 19 12 5 21 5 3"></polygon>'}</svg>
                    </button>
                    <span class="recent-ep-title">${highlightText(ep.title, state.searchQuery)}</span>
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
          <img class="feed-art" src="${meta.artwork || FALLBACK_ARTWORK}" alt="" onerror="this.onerror=null;this.src='${FALLBACK_ARTWORK}';">
          <div class="feed-info">
            <h4>${highlightText(meta.title || url, state.searchQuery)}</h4>
            <p>${meta.error ? `<span style="color: #ef4444;">${escapeHtml(meta.error)}</span>` : `${meta.episodesCount || feedEpisodes.length} episodes`}${isFeedMuted(url) ? ' • <span style="color: var(--danger); font-weight: 500;">Muted</span>' : ''}</p>
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
    navigateTo(null, feedUrl);
  }

  const previewLoadingSet = new Set();

  function renderFeedDetail(feedUrl) {
    const isSubbed = state.feeds.includes(feedUrl);
    const isMuted = isFeedMuted(feedUrl);
    const meta = state.feedMetadata[feedUrl] || {};
    let episodes = state.allEpisodes.filter(e => e.feedUrl === feedUrl);
    const header = elements.feedDetailHeader;
    if (!header) return;

    const totalCount = episodes.length;
    const q = (state.searchQuery || '').trim().toLowerCase();
    if (q) {
      episodes = episodes.filter(ep => {
        const title = (ep.title || '').toLowerCase();
        const desc = (ep.description || '').toLowerCase();
        return title.includes(q) || desc.includes(q);
      });
    }

    if (header.dataset.feedUrl !== feedUrl) {
      header.dataset.feedUrl = feedUrl;
      const prevView = state.navHistory[state.navHistory.length - 1];
      const backLabel = prevView?.feedUrl
        ? '← Back'
        : prevView?.tab
          ? `← ${prevView.tab.charAt(0).toUpperCase() + prevView.tab.slice(1)}`
          : '← Back';

      header.innerHTML = `
        <div class="feed-detail-top-nav">
          <button class="btn-back-nav" id="btn-feed-back">${escapeHtml(backLabel)}</button>
          <div class="feed-detail-top-actions">
            ${isSubbed ? `
              <button class="btn btn-secondary btn-sm btn-feed-mute ${isMuted ? 'is-muted' : ''}" id="btn-feed-mute" title="${isMuted ? 'Unmute: show episodes in timeline' : 'Mute: hide episodes from timeline'}">
                <span>${isMuted ? 'Muted' : 'Mute'}</span>
              </button>
            ` : ''}
            <button class="btn ${isSubbed ? 'btn-secondary' : 'btn-primary'} btn-sm" id="btn-feed-action">
              ${isSubbed ? 'Unsubscribe' : '+ Follow Podcast'}
            </button>
          </div>
        </div>
        <div class="feed-detail-main">
          <img class="feed-detail-art" src="${meta.artwork || FALLBACK_ARTWORK}" alt="" onerror="this.onerror=null;this.src='${FALLBACK_ARTWORK}';">
          <div class="feed-detail-info">
            <div class="feed-detail-title">${escapeHtml(meta.title || 'Untitled Podcast')}</div>
            <div class="feed-detail-author">${escapeHtml(meta.author || '')}</div>
            ${meta.description ? `<div class="feed-detail-desc">${escapeHtml(meta.description)}</div>` : ''}
            <div class="feed-detail-links">
              ${meta.link ? `<a href="${escapeHtml(meta.link)}" target="_blank" rel="noopener noreferrer" class="feed-link-badge">Website</a>` : ''}
              <button class="feed-link-badge" id="btn-copy-rss" title="Copy RSS Feed URL">Copy RSS</button>
              <span class="feed-link-badge" id="feed-episodes-badge" style="cursor: default;">${q ? `${episodes.length} / ${totalCount} episodes` : `${totalCount} episodes`}</span>
              ${isSubbed && isMuted ? `<span class="feed-link-badge feed-muted-badge" style="cursor: default;">Timeline Muted</span>` : ''}
            </div>
          </div>
        </div>
      `;

      header.querySelector('#btn-feed-back').addEventListener('click', () => {
        navigateBack();
      });

      const muteBtn = header.querySelector('#btn-feed-mute');
      if (muteBtn) {
        muteBtn.addEventListener('click', () => {
          toggleMuteFeed(feedUrl);
        });
      }

      const actionBtn = header.querySelector('#btn-feed-action');
      if (actionBtn) {
        actionBtn.addEventListener('click', () => {
          if (state.feeds.includes(feedUrl)) {
            promptRemoveFeed(feedUrl);
          } else {
            addFeed(feedUrl, meta.title, meta.artwork);
            header.dataset.feedUrl = '';
            renderFeedDetail(feedUrl);
          }
        });
      }

      header.querySelector('#btn-copy-rss').addEventListener('click', () => {
        navigator.clipboard.writeText(feedUrl).then(() => {
          const btn = header.querySelector('#btn-copy-rss');
          if (btn) btn.textContent = 'Copied!';
          setTimeout(() => {
            if (btn) btn.textContent = 'Copy RSS';
          }, 2000);
        });
      });
    } else {
      const badge = header.querySelector('#feed-episodes-badge');
      if (badge) {
        badge.textContent = q ? `${episodes.length} / ${totalCount} episodes` : `${totalCount} episodes`;
      }
      const actionBtn = header.querySelector('#btn-feed-action');
      if (actionBtn) {
        actionBtn.textContent = isSubbed ? 'Unsubscribe' : '+ Follow Podcast';
        actionBtn.className = `btn ${isSubbed ? 'btn-secondary' : 'btn-primary'} btn-sm`;
      }
      const muteBtn = header.querySelector('#btn-feed-mute');
      if (muteBtn) {
        muteBtn.className = `btn btn-secondary btn-sm btn-feed-mute ${isMuted ? 'is-muted' : ''}`;
        muteBtn.title = isMuted ? 'Unmute: show episodes in timeline' : 'Mute: hide episodes from timeline';
        muteBtn.innerHTML = `<span>${isMuted ? 'Muted' : 'Mute'}</span>`;
      }
      const existingMutedBadge = header.querySelector('.feed-muted-badge');
      if (isSubbed && isMuted) {
        if (!existingMutedBadge) {
          const linksRow = header.querySelector('.feed-detail-links');
          if (linksRow) {
            const span = document.createElement('span');
            span.className = 'feed-link-badge feed-muted-badge';
            span.style.cursor = 'default';
            span.textContent = 'Timeline Muted';
            linksRow.appendChild(span);
          }
        }
      } else if (existingMutedBadge) {
        existingMutedBadge.remove();
      }
    }

    const list = elements.feedDetailEpisodes;
    if (!list) return;
    list.innerHTML = '';

    if (totalCount === 0) {
      if (!isSubbed && !previewLoadingSet.has(feedUrl)) {
        previewLoadingSet.add(feedUrl);
        list.innerHTML = `
          <div class="empty-state">
            <div class="spinner" style="margin: 0 auto 1.25rem auto; width: 32px; height: 32px; border: 3px solid var(--border-light); border-top-color: var(--text-primary); border-radius: 50%;"></div>
            <h3>Loading episodes preview...</h3>
            <p>Fetching episodes so you can listen before adding.</p>
          </div>
        `;
        fetchSingleFeed(feedUrl, state.allEpisodes, state.feedMetadata).then(res => {
          previewLoadingSet.delete(feedUrl);
          if (res) {
            header.dataset.feedUrl = '';
            renderFeedDetail(feedUrl);
          } else {
            list.innerHTML = `<div class="empty-state"><h3>Unable to load preview</h3><p>Could not fetch RSS feed for this podcast.</p></div>`;
          }
        }).catch(() => {
          previewLoadingSet.delete(feedUrl);
          list.innerHTML = `<div class="empty-state"><h3>Unable to load preview</h3><p>Could not fetch RSS feed for this podcast.</p></div>`;
        });
        return;
      }
      list.innerHTML = `<div class="empty-state"><h3>No episodes found for this podcast</h3></div>`;
      return;
    }

    if (episodes.length === 0) {
      list.innerHTML = `<div class="empty-state"><h3>No matching episodes</h3><p>No episodes in this podcast match "${escapeHtml(state.searchQuery)}".</p></div>`;
      return;
    }

    const frag = document.createDocumentFragment();
    episodes.forEach(ep => {
      frag.appendChild(createEpisodeCard(ep));
    });
    list.appendChild(frag);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // SECTION 21 · Audio Engine
  // Sets up all <audio> element event listeners, the seek bar, the
  // position-save interval (every 8 s), MediaSession API integration,
  // and YouTube poll interval (every 500 ms for progress updates).
  // ─────────────────────────────────────────────────────────────────────────

  function setupAudioEngines() {
    const audio = elements.audio;

    const applyPendingAudioSeek = () => {
      if (state.pendingStartTime === null || state.pendingStartTime === undefined || state.pendingStartTime <= 0) return;
      const target = state.pendingStartTime;
      try {
        if (elements.audio.seekable && elements.audio.seekable.length > 0) {
          elements.audio.currentTime = target;
          state.pendingStartTime = null;
        } else if (elements.audio.duration && elements.audio.duration > 0 && isFinite(elements.audio.duration)) {
          elements.audio.currentTime = Math.min(target, elements.audio.duration);
          state.pendingStartTime = null;
        } else if (elements.audio.readyState >= 1) {
          elements.audio.currentTime = target;
          state.pendingStartTime = null;
        }
      } catch (_) {}
    };

    audio.addEventListener('timeupdate', () => {
      if (state.activeEngine === 'audio') updateProgress();
    });
    audio.addEventListener('loadedmetadata', () => {
      applyPendingAudioSeek();
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
      applyPendingAudioSeek();
      if (state.activeEngine === 'audio' && !audio.paused) {
        state.playbackStatus = 'playing';
        syncPlaybackButtons();
      }
    });
    audio.addEventListener('playing', () => {
      applyPendingAudioSeek();
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
        if (state.currentEpisode && !elements.audio.src.includes('/api/audio-proxy')) {
          const proxySrc = `/api/audio-proxy?url=${encodeURIComponent(state.currentEpisode.audioUrl)}`;
          elements.audio.src = proxySrc;
          elements.audio.play().catch(() => {});
          return;
        }
        state.playbackStatus = 'paused';
        syncPlaybackButtons();
      }
    });

    const handleSeekBarChange = () => {
      const pct = elements.seekBar.value / 100;
      elements.seekBar.style.setProperty('--seek-pct', `${elements.seekBar.value}%`);
      if (state.activeEngine === 'audio' && audio.duration && isFinite(audio.duration)) {
        audio.currentTime = pct * audio.duration;
      } else if (state.activeEngine === 'youtube' && state.ytPlayer && state.ytPlayer.getDuration) {
        const dur = state.ytPlayer.getDuration();
        if (dur) state.ytPlayer.seekTo(pct * dur, true);
      }
    };
    elements.seekBar.addEventListener('input', handleSeekBarChange);
    elements.seekBar.addEventListener('change', handleSeekBarChange);

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

  // ─────────────────────────────────────────────────────────────────────────
  // SECTION 22 · Playback Control
  // Core playback logic: start/pause/resume/skip episodes, track progress,
  // auto-advance queue. Handles both <audio> and YouTube engines.
  // Key functions: toggleEpisodePlayback, playEpisode, playNextEpisode,
  // onEpisodeEnded, skipToNextEpisode, updateProgress, updateDuration.
  // ─────────────────────────────────────────────────────────────────────────

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

  function playEpisode(episode, overrideStartTime) {
    state.currentEpisode = episode;
    state.playbackStatus = 'loading';
    syncPlaybackButtons();

    elements.audio.pause();
    if (state.ytPlayer && state.ytPlayer.stopVideo) {
      state.ytPlayer.stopVideo();
    }

    const savedPos = state.playbackPositions[episode.guid];
    let startTime = 0;
    if (typeof overrideStartTime === 'number') {
      startTime = overrideStartTime;
    } else {
      startTime = (savedPos && savedPos.position > 1) ? savedPos.position : 0;
    }

    state.playbackPositions[episode.guid] = {
      position: startTime || 2,
      completed: false,
      lastListenedAt: Math.floor(Date.now() / 1000)
    };
    savePositionsToStorage();

    if (isEpisodeQueued(episode.guid)) {
      state.queue = state.queue.filter(q => q.guid !== episode.guid);
      saveQueueToStorage();
      updateQueueUI();
    }

    renderContinueShelf();
    updateFilterBadges();

    if (state.filterMode === 'unplayed' || state.filterMode === 'continue') {
      processAndSortEpisodes();
      renderTimeline();
    }

    if (episode.isYouTube || episode.videoId || episode.playlistId) {
      state.activeEngine = 'youtube';
      if (state.ytPlayer && typeof state.ytPlayer.loadVideoById === 'function') {
        if (episode.isYouTubePlaylist && episode.playlistId) {
          state.ytPlayer.loadPlaylist({
            list: episode.playlistId,
            listType: 'playlist'
          });
        } else if (episode.videoId) {
          state.ytPlayer.loadVideoById({ videoId: episode.videoId, startSeconds: startTime || 0 });
        }
        if (state.ytPlayer.playVideo) state.ytPlayer.playVideo();
        if (state.ytPlayer.setPlaybackRate) state.ytPlayer.setPlaybackRate(state.playbackSpeed);
      } else if (window.YT && window.YT.Player) {
        const container = document.getElementById('yt-player-container');
        if (container) {
          container.innerHTML = '<div id="yt-player"></div>';
        }
        const playerConfig = {
          height: '180',
          width: '320',
          playerVars: {
            autoplay: 1,
            controls: 0,
            playsinline: 1,
            enablejsapi: 1,
            origin: window.location.origin
          },
          events: {
            onReady: (event) => {
              state.ytReady = true;
              if (startTime > 0 && event.target.seekTo) {
                event.target.seekTo(startTime, true);
              }
              if (event.target.playVideo) event.target.playVideo();
              if (event.target.setPlaybackRate) event.target.setPlaybackRate(state.playbackSpeed);
            },
            onStateChange: handleYouTubeStateChange,
            onError: () => {
              state.playbackStatus = 'paused';
              syncPlaybackButtons();
            }
          }
        };
        if (episode.isYouTubePlaylist && episode.playlistId) {
          playerConfig.playerVars.listType = 'playlist';
          playerConfig.playerVars.list = episode.playlistId;
        } else if (episode.videoId) {
          playerConfig.videoId = episode.videoId;
          if (startTime > 0) {
            playerConfig.playerVars.start = Math.floor(startTime);
          }
        }
        state.ytPlayer = new YT.Player('yt-player', playerConfig);
      } else {
        state.pendingYouTubePlay = { episode, startTime };
        if (!document.querySelector('script[src*="youtube.com/iframe_api"]')) {
          const s = document.createElement('script');
          s.src = 'https://www.youtube.com/iframe_api';
          document.head.appendChild(s);
        }
      }
    } else {
      state.activeEngine = 'audio';
      let streamUrl = episode.audioUrl;
      if (window.location.protocol === 'https:' && streamUrl.startsWith('http://')) {
        streamUrl = `/api/audio-proxy?url=${encodeURIComponent(streamUrl)}`;
      }
      elements.audio.src = streamUrl;
      elements.audio.playbackRate = state.playbackSpeed;
      state.pendingStartTime = startTime > 0 ? startTime : null;
      if (startTime > 0) {
        try {
          elements.audio.currentTime = startTime;
        } catch (_) {}
      }
      elements.audio.play().catch(e => {
        state.playbackStatus = 'paused';
        syncPlaybackButtons();
      });
    }

    elements.playerTitle.textContent = episode.title;
    elements.playerPodcast.textContent = episode.podcastTitle;
    elements.playerArtwork.src = episode.artwork || FALLBACK_ARTWORK;
    elements.playerArtwork.onerror = () => {
      elements.playerArtwork.onerror = null;
      elements.playerArtwork.src = FALLBACK_ARTWORK;
    };

    if (elements.miniTitle) elements.miniTitle.textContent = episode.title;
    if (elements.miniPodcast) elements.miniPodcast.textContent = episode.podcastTitle;
    if (elements.miniArtwork) {
      elements.miniArtwork.src = episode.artwork || FALLBACK_ARTWORK;
      elements.miniArtwork.onerror = () => {
        elements.miniArtwork.onerror = null;
        elements.miniArtwork.src = FALLBACK_ARTWORK;
      };
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

    setPlayerCollapsed(false, false);

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
      const pct = (current / total) * 100;
      elements.seekBar.value = pct;
      elements.seekBar.style.setProperty('--seek-pct', `${pct}%`);
      if (elements.miniProgressFill) {
        elements.miniProgressFill.style.width = `${pct}%`;
      }

      if (state.currentEpisode) {
        const activeCards = document.querySelectorAll(`.episode-card[data-guid="${CSS.escape(state.currentEpisode.guid)}"]`);
        activeCards.forEach(card => {
          let track = card.querySelector('.ep-progress-track');
          let fill = card.querySelector('.ep-progress-fill');
          if (!track && current > 2) {
            track = document.createElement('div');
            track.className = 'ep-progress-track';
            track.title = 'Click or scrub to resume at any point';
            fill = document.createElement('div');
            fill.className = 'ep-progress-fill';
            track.appendChild(fill);
            const footer = card.querySelector('.episode-footer');
            if (footer) {
              card.insertBefore(track, footer);
              setupProgressTrackInteractivity(track, card, state.currentEpisode);
            }
          }
          if (fill) {
            fill.style.width = `${Math.min(100, Math.max(1, pct))}%`;
          }
          let resumeBadge = card.querySelector('.ep-resume-time');
          if (!resumeBadge && current > 2) {
            const meta = card.querySelector('.episode-meta');
            if (meta) {
              resumeBadge = document.createElement('span');
              resumeBadge.className = 'ep-resume-time';
              resumeBadge.title = 'Click to resume playback';
              meta.appendChild(resumeBadge);
              resumeBadge.addEventListener('click', (e) => {
                e.stopPropagation();
                toggleEpisodePlayback(state.currentEpisode);
              });
            }
          }
          if (resumeBadge) {
            resumeBadge.textContent = `• Resumes at ${formatTime(current)}`;
          }
        });
      }
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
    if (dur && isFinite(dur) && dur > 0) {
      const formatted = formatTime(dur);
      elements.totalDurationLabel.textContent = formatted;
      if (state.currentEpisode) {
        state.currentEpisode.duration = formatted;
        const matchAll = state.allEpisodes.find(e => e.guid === state.currentEpisode.guid);
        if (matchAll) matchAll.duration = formatted;
        const matchFiltered = state.filteredEpisodes.find(e => e.guid === state.currentEpisode.guid);
        if (matchFiltered) matchFiltered.duration = formatted;
        const card = document.querySelector(`.episode-card[data-guid="${CSS.escape(state.currentEpisode.guid)}"]`);
        if (card) {
          const durBadge = card.querySelector('.episode-duration');
          if (durBadge && (!durBadge.textContent || durBadge.textContent === '0:00')) {
            durBadge.textContent = formatted;
          }
        }
      }
    }
  }

  function playNextEpisode() {
    let nextEp = null;
    const currentGuid = state.currentEpisode ? state.currentEpisode.guid : null;

    if (state.queue && state.queue.length > 0) {
      nextEp = state.queue.shift();
      saveQueueToStorage();
      updateQueueUI();
    }

    if (!nextEp && state.filterMode === 'continue') {
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

    if (state.sleepTimer.active) {
      if (state.sleepTimer.minutes === 'end') {
        stopSleepTimer();
        pauseCurrentEngine();
        return;
      }
      if (state.sleepTimer.minutes === 'end-queue') {
        if (!state.queue || state.queue.length === 0) {
          stopSleepTimer();
          pauseCurrentEngine();
          return;
        }
      }
    }

    playNextEpisode();
  }

  function skipToNextEpisode(markCompleted = false) {
    if (!state.currentEpisode) return;
    const curEp = state.currentEpisode;
    if (markCompleted) {
      savePlaybackPositionToD1(curEp.guid, 0, true);
      if (isEpisodeQueued(curEp.guid)) {
        removeFromQueue(curEp.guid);
      }
    } else {
      let curPos = 0;
      if (state.activeEngine === 'audio' && elements.audio) {
        curPos = elements.audio.currentTime || 0;
      } else if (state.activeEngine === 'youtube' && state.ytPlayer && state.ytPlayer.getCurrentTime) {
        curPos = state.ytPlayer.getCurrentTime() || 0;
      }
      if (curPos > 2) {
        savePlaybackPositionToD1(curEp.guid, curPos, false);
      }
    }
    renderContinueShelf();
    playNextEpisode();
  }

  // ─────────────────────────────────────────────────────────────────────────
  // SECTION 23 · Player UI Sync
  // syncPlaybackButtons keeps play/pause icons, episode cards, and mini
  // player in sync with state.playbackStatus.
  // ─────────────────────────────────────────────────────────────────────────

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

    if (elements.miniIconPlay && elements.miniIconPause && elements.miniIconSpinner) {
      if (isLoading) {
        elements.miniIconPlay.classList.add('hidden');
        elements.miniIconPause.classList.add('hidden');
        elements.miniIconSpinner.classList.remove('hidden');
      } else if (isPlaying) {
        elements.miniIconPlay.classList.add('hidden');
        elements.miniIconPause.classList.remove('hidden');
        elements.miniIconSpinner.classList.add('hidden');
      } else {
        elements.miniIconPlay.classList.remove('hidden');
        elements.miniIconPause.classList.add('hidden');
        elements.miniIconSpinner.classList.add('hidden');
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

  function setPlayerCollapsed(collapsed, save = true) {
    if (collapsed) {
      document.body.classList.add('has-mini-player');
      document.body.classList.remove('has-full-player');
      if (elements.btnCollapsePlayer) elements.btnCollapsePlayer.setAttribute('aria-expanded', 'false');
      if (elements.miniToggle) elements.miniToggle.setAttribute('aria-expanded', 'false');
    } else {
      document.body.classList.remove('has-mini-player');
      document.body.classList.add('has-full-player');
      if (elements.btnCollapsePlayer) elements.btnCollapsePlayer.setAttribute('aria-expanded', 'true');
      if (elements.miniToggle) elements.miniToggle.setAttribute('aria-expanded', 'true');
    }
    if (save) {
      try {
        localStorage.setItem('podany_player_collapsed', collapsed ? 'true' : 'false');
      } catch (e) {}
    }
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

  // ─────────────────────────────────────────────────────────────────────────
  // SECTION 24 · Sleep Timer
  // Pauses playback after a set duration, with optional volume fadeout.
  // ─────────────────────────────────────────────────────────────────────────

  function updateSleepTimerUI() {
    const isActive = Boolean(state.sleepTimer && state.sleepTimer.active);
    const currentMin = state.sleepTimer ? state.sleepTimer.minutes : 0;

    elements.timerBtns.forEach(btn => {
      const val = btn.dataset.minutes;
      if (val === '0') {
        btn.classList.toggle('is-inactive', !isActive);
        return;
      }
      const isThisActive = isActive && (
        val === String(currentMin) ||
        (val === 'end' && currentMin === 'end') ||
        (val === 'end-queue' && currentMin === 'end-queue')
      );
      btn.classList.toggle('active', Boolean(isThisActive));
    });

    const statusEl = document.getElementById('sleep-status-text');
    if (statusEl) {
      if (isActive) {
        if (state.sleepTimer.endTime) {
          const remainingSec = Math.max(0, Math.round((state.sleepTimer.endTime - Date.now()) / 1000));
          const remainingMin = Math.ceil(remainingSec / 60);
          statusEl.innerHTML = `<span style="color: var(--primary); font-weight: 600;">● Active:</span> stops in <strong>${remainingMin} min</strong> (${formatTime(remainingSec)})`;
        } else if (currentMin === 'end') {
          statusEl.innerHTML = `<span style="color: var(--primary); font-weight: 600;">● Active:</span> stops at <strong>end of current episode</strong>`;
        } else if (currentMin === 'end-queue') {
          statusEl.innerHTML = `<span style="color: var(--primary); font-weight: 600;">● Active:</span> stops at <strong>end of queue</strong>`;
        }
      } else {
        statusEl.textContent = 'Automatically stop audio playback after specified time:';
      }
    }

    if (elements.sleepBadge) {
      if (isActive) {
        elements.sleepBadge.classList.remove('hidden');
        if (state.sleepTimer.endTime) {
          const remainingMin = Math.max(1, Math.ceil((state.sleepTimer.endTime - Date.now()) / 60000));
          elements.sleepBadge.textContent = `${remainingMin}m`;
        } else {
          elements.sleepBadge.textContent = '✓';
        }
      } else {
        elements.sleepBadge.classList.add('hidden');
        elements.sleepBadge.textContent = '';
      }
    }
  }

  function startSleepTimer(minutes) {
    if (state.sleepTimer.intervalId) {
      clearInterval(state.sleepTimer.intervalId);
    }

    if (minutes === 0 || minutes === '0') {
      stopSleepTimer();
      return;
    }

    state.sleepTimer.active = true;
    state.sleepTimer.minutes = minutes;
    state.sleepTimer.initialVolume = elements.audio.volume || 1.0;

    if (minutes !== 'end' && minutes !== 'end-queue') {
      const ms = minutes * 60 * 1000;
      state.sleepTimer.endTime = Date.now() + ms;

      state.sleepTimer.intervalId = setInterval(() => {
        const remaining = Math.max(0, state.sleepTimer.endTime - Date.now());
        if (remaining <= 0) {
          pauseCurrentEngine();
          elements.audio.volume = state.sleepTimer.initialVolume;
          stopSleepTimer();
        } else {
          updateSleepTimerUI();
        }
      }, 1000);
    } else {
      state.sleepTimer.endTime = null;
    }

    updateSleepTimerUI();
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
    updateSleepTimerUI();
    closeSleepModal();
  }

  // ─────────────────────────────────────────────────────────────────────────
  // SECTION 25 · Feed Management
  // addFeed, promptRemoveFeed, purgeOrphanedDownloads, removeFeed
  // ─────────────────────────────────────────────────────────────────────────

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

  function openConfirmDialog({ title, message, actionLabel = 'Confirm', onConfirm }) {
    state.confirmModalAction = onConfirm;
    const titleEl = elements.confirmModal?.querySelector('h2');
    if (titleEl && title) titleEl.textContent = title;
    if (elements.confirmModalMsg && message) elements.confirmModalMsg.textContent = message;
    if (elements.btnConfirmDelete && actionLabel) elements.btnConfirmDelete.textContent = actionLabel;
    if (elements.confirmModal) elements.confirmModal.classList.remove('hidden');
  }

  function promptRemoveFeed(url) {
    state.feedToDelete = url;
    state.confirmModalAction = null;
    const meta = state.feedMetadata[url] || {};
    const title = meta.title || 'this podcast';
    openConfirmDialog({
      title: 'Remove from Library',
      message: `Do you want to unsubscribe from "${title}"?`,
      actionLabel: 'Remove',
      onConfirm: () => {
        removeFeed(url);
        state.feedToDelete = null;
      }
    });
  }

  function purgeOrphanedDownloads() {
    if (!state.feeds || !state.downloadedEpisodes) return;
    const activeFeedSet = new Set(state.feeds);
    const activeGuidSet = new Set(state.allEpisodes.map(e => e.guid));
    let changed = false;
    for (const [guid, dl] of Object.entries(state.downloadedEpisodes)) {
      const isFeedMissing = dl.feedUrl && !activeFeedSet.has(dl.feedUrl);
      const isGuidMissing = state.allEpisodes.length > 0 && !activeGuidSet.has(guid);
      const isAllFeedsGone = state.feeds.length === 0;
      if (isAllFeedsGone || isFeedMissing || (!dl.feedUrl && isGuidMissing)) {
        if ('caches' in window) {
          try {
            caches.open('podany-audio-v1').then(cache => cache.delete(dl.audioUrl)).catch(() => {});
          } catch (e) {}
        }
        delete state.downloadedEpisodes[guid];
        changed = true;
      }
    }
    if (changed) {
      saveDownloadsToStorage();
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

    const epsToRemove = state.allEpisodes.filter(ep => ep.feedUrl === url);
    const guidsToRemove = new Set(epsToRemove.map(ep => ep.guid));
    let downloadsChanged = false;
    for (const [guid, dl] of Object.entries(state.downloadedEpisodes)) {
      if (guidsToRemove.has(guid) || dl.feedUrl === url) {
        if ('caches' in window) {
          try {
            caches.open('podany-audio-v1').then(cache => cache.delete(dl.audioUrl)).catch(() => {});
          } catch (e) {}
        }
        delete state.downloadedEpisodes[guid];
        downloadsChanged = true;
      }
    }
    if (downloadsChanged) {
      saveDownloadsToStorage();
    }

    state.allEpisodes = state.allEpisodes.filter(ep => ep.feedUrl !== url);
    state.feeds = state.feeds.filter(f => f !== url);
    if (state.mutedFeeds) {
      state.mutedFeeds = state.mutedFeeds.filter(f => f !== url);
      saveMutedFeedsToStorage();
    }
    delete state.feedMetadata[url];
    saveFeedsToStorage();
    removeFeedFromD1(url);
    processAndSortEpisodes();
    renderTimeline();
    renderFeedsGrid();
  }

  // ─────────────────────────────────────────────────────────────────────────
  // SECTION 26 · OPML Import / Export
  // ─────────────────────────────────────────────────────────────────────────

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

  // ─────────────────────────────────────────────────────────────────────────
  // SECTION 27 · Event Listeners & Modal Helpers
  // All UI click/input/keyboard wiring lives here.
  // Modal helpers: openAddModal, closeAddModal, openSleepModal,
  // closeSleepModal, showStatus, hideStatus.
  // ─────────────────────────────────────────────────────────────────────────

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
        sessionStorage.setItem('podany_guest_mode', '1');
      });
    }

    if (elements.btnCancelAuth) {
      elements.btnCancelAuth.addEventListener('click', () => {
        elements.authModal.classList.add('hidden');
        sessionStorage.setItem('podany_guest_mode', '1');
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
          localStorage.removeItem(STORAGE_KEYS.MUTED_FEEDS);
          localStorage.removeItem(STORAGE_KEYS.POSITIONS);
          localStorage.removeItem(STORAGE_KEYS.CACHED_EPISODES);
          localStorage.removeItem(STORAGE_KEYS.CACHED_METADATA);
          localStorage.removeItem(STORAGE_KEYS.QUEUE);
          document.cookie = 'podcast_session=; Path=/; Expires=Thu, 01 Jan 1970 00:00:01 GMT;';
          window.history.replaceState({}, document.title, window.location.pathname);
          state.sessionToken = '';
          state.userEmail = '';
          state.feeds = [];
          state.mutedFeeds = [];
          state.playbackPositions = {};
          state.allEpisodes = [];
          state.filteredEpisodes = [];
          state.feedMetadata = {};
          state.queue = [];
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
          document.body.classList.remove('has-active-episode', 'has-mini-player', 'has-full-player');
          updatePlayerUI(false);
          updateFeedCountUI();
          updateQueueUI();
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

    if (elements.userStatusPill) {
      elements.userStatusPill.addEventListener('click', (e) => {
        if (e.target.closest('#btn-account-toggle')) return;
        elements.userStatusPill.classList.toggle('is-expanded');
      });

      document.addEventListener('click', (e) => {
        if (!e.target.closest('#user-status-pill')) {
          elements.userStatusPill.classList.remove('is-expanded');
        }
      });
    }

    if (elements.btnConfirmCancel) {
      elements.btnConfirmCancel.addEventListener('click', () => {
        state.feedToDelete = null;
        state.confirmModalAction = null;
        if (elements.confirmModal) elements.confirmModal.classList.add('hidden');
      });
    }

    if (elements.btnConfirmDelete) {
      elements.btnConfirmDelete.addEventListener('click', () => {
        if (typeof state.confirmModalAction === 'function') {
          const action = state.confirmModalAction;
          state.confirmModalAction = null;
          action();
        } else if (state.feedToDelete) {
          removeFeed(state.feedToDelete);
          state.feedToDelete = null;
        }
        if (elements.confirmModal) elements.confirmModal.classList.add('hidden');
      });
    }

    const btnDeleteAccount = document.getElementById('btn-delete-account');
    if (btnDeleteAccount) {
      btnDeleteAccount.addEventListener('click', () => {
        openConfirmDialog({
          title: 'Delete Cloud Account?',
          message: 'Permanently wipe your account email, synced podcast subscriptions, playback positions, and active sessions from Cloudflare D1. This action cannot be undone.',
          actionLabel: 'Wipe & Delete',
          onConfirm: async () => {
            btnDeleteAccount.disabled = true;
            btnDeleteAccount.textContent = 'Deleting account...';
            try {
              const res = await fetch('/api/auth/delete-account', {
                method: 'POST',
                credentials: 'include'
              });
              const data = await res.json();
              if (!res.ok || !data.success) {
                throw new Error(data.error || 'Failed to delete account');
              }

              localStorage.removeItem(STORAGE_KEYS.SESSION);
              localStorage.removeItem('podcast_pulse_session_token');
              localStorage.removeItem('podany_session_token');
              state.sessionToken = '';
              state.userEmail = '';

              updateSyncStatusUI('Logged in as guest / local device storage', '', false);
              showStatus('Cloud account and sync data permanently wiped.');
            } catch (err) {
              showStatus('Failed to delete account: ' + err.message);
            } finally {
              btnDeleteAccount.disabled = false;
              btnDeleteAccount.textContent = 'Delete Account & Wipe Cloud Data';
            }
          }
        });
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
        skipToNextEpisode(false);
      });
    }

    if (elements.btnPlayerMarkPlayed) {
      elements.btnPlayerMarkPlayed.addEventListener('click', () => {
        skipToNextEpisode(true);
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
        navigateTo(targetTab);
      });
    });

    // Gear icon → Settings (history-aware)
    if (elements.btnOpenSettings) {
      elements.btnOpenSettings.addEventListener('click', () => {
        navigateTo('settings');
      });
    }

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
      renderFeedsGrid();
      if (state.activeFeedDetailUrl) {
        renderFeedDetail(state.activeFeedDetailUrl);
      }
      renderOfflineStorageSettings();
    });

    elements.sortOrderSelect.addEventListener('change', (e) => {
      state.sortOrder = e.target.value;
      processAndSortEpisodes();
      renderTimeline();
      if (state.activeFeedDetailUrl) {
        renderFeedDetail(state.activeFeedDetailUrl);
      }
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
        startSleepTimer(val === 'end' || val === 'end-queue' ? val : parseInt(val, 10));
      });
    });
    elements.fadeoutCheck.addEventListener('change', (e) => {
      state.sleepTimer.fadeout = e.target.checked;
    });

    const modalCatChips = document.querySelectorAll('#modal-category-chips .category-chip');
    modalCatChips.forEach(chip => {
      chip.addEventListener('click', () => {
        modalCatChips.forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        const cat = chip.dataset.category;
        renderSubgenreChips(cat, elements.modalSubgenreChips);
        if (elements.podcastSearchQuery) {
          elements.podcastSearchQuery.value = cat;
          searchPodcastDirectory(cat);
        }
      });
    });

    const modalRegionChips = document.querySelectorAll('#add-modal .region-chip');
    modalRegionChips.forEach(chip => {
      chip.classList.toggle('active', chip.dataset.region === state.directoryCountry);
      chip.addEventListener('click', () => {
        setDirectoryCountry(chip.dataset.region);
        if (elements.podcastSearchQuery && elements.podcastSearchQuery.value.trim()) {
          searchPodcastDirectory(elements.podcastSearchQuery.value.trim());
        }
      });
    });

    if (elements.btnOpenQueue) elements.btnOpenQueue.addEventListener('click', openQueueModal);
    if (elements.btnCloseQueue) elements.btnCloseQueue.addEventListener('click', closeQueueModal);
    if (elements.btnClearQueue) elements.btnClearQueue.addEventListener('click', clearQueue);
    if (elements.queueModal) {
      elements.queueModal.addEventListener('click', (e) => {
        if (e.target === elements.queueModal) closeQueueModal();
      });
    }

    if (elements.btnPlayerNotes) elements.btnPlayerNotes.addEventListener('click', () => openShowNotes());
    if (elements.playerTrackInfo) elements.playerTrackInfo.addEventListener('click', () => openShowNotes());
    if (elements.btnCloseNotes) elements.btnCloseNotes.addEventListener('click', closeShowNotes);
    if (elements.showNotesModal) {
      elements.showNotesModal.addEventListener('click', (e) => {
        if (e.target === elements.showNotesModal) closeShowNotes();
      });
    }

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (elements.showNotesModal && !elements.showNotesModal.classList.contains('hidden')) {
          closeShowNotes();
        } else if (elements.queueModal && !elements.queueModal.classList.contains('hidden')) {
          closeQueueModal();
        } else if (elements.sleepModal && !elements.sleepModal.classList.contains('hidden')) {
          closeSleepModal();
        } else if (elements.addModal && !elements.addModal.classList.contains('hidden')) {
          closeAddModal();
        } else if (elements.confirmModal && !elements.confirmModal.classList.contains('hidden')) {
          elements.confirmModal.classList.add('hidden');
        }
      }
    });

    elements.opmlFileInput.addEventListener('change', (e) => {
      if (e.target.files.length > 0) importOpml(e.target.files[0]);
    });
    elements.btnExportOpml.addEventListener('click', exportOpml);

    if (elements.btnLoadDefaults) {
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
    }

    if (elements.btnClearDownloads) {
      elements.btnClearDownloads.addEventListener('click', () => {
        const count = Object.keys(state.downloadedEpisodes || {}).length;
        if (count === 0) return;
        if (confirm(`Remove all ${count} downloaded podcast episodes from this device?`)) {
          clearAllDownloads();
        }
      });
    }

    elements.btnClearStorage.addEventListener('click', () => {
      if (confirm('Are you sure you want to clear all feeds and state?')) {
        localStorage.clear();
        if ('caches' in window) {
          caches.delete('podany-audio-v1').catch(() => {});
        }
        state.downloadedEpisodes = {};
        state.feeds = [];
        state.mutedFeeds = [];
        state.feedMetadata = {};
        state.allEpisodes = [];
        state.filteredEpisodes = [];
        state.queue = [];
        state.currentEpisode = null;
        state.playbackStatus = 'idle';
        if (elements.playerBar) elements.playerBar.classList.remove('active-episode');
        document.body.classList.remove('has-active-episode', 'has-mini-player', 'has-full-player');
        pauseCurrentEngine();
        syncPlaybackButtons();
        updateFeedCountUI();
        updateQueueUI();
        updateDownloadedCountUI();
        renderContinueShelf();
        renderTimeline();
        renderFeedsGrid();
      }
    });

    if (elements.btnCollapsePlayer) {
      elements.btnCollapsePlayer.addEventListener('click', () => {
        setPlayerCollapsed(true);
      });
    }

    if (elements.miniToggle) {
      elements.miniToggle.addEventListener('click', (e) => {
        e.stopPropagation();
        setPlayerCollapsed(false);
      });
    }

    if (elements.miniExpandZone) {
      elements.miniExpandZone.addEventListener('click', () => {
        setPlayerCollapsed(false);
      });
      elements.miniExpandZone.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          setPlayerCollapsed(false);
        }
      });
    }

    if (elements.miniPlayToggle) {
      elements.miniPlayToggle.addEventListener('click', (e) => {
        e.stopPropagation();
        if (elements.btnPlayToggle) {
          elements.btnPlayToggle.click();
        }
      });
    }

    let scrollCollapseTimer = null;
    window.addEventListener('scroll', () => {
      if (scrollCollapseTimer) return;
      scrollCollapseTimer = setTimeout(() => {
        scrollCollapseTimer = null;
        if (document.body.classList.contains('has-active-episode')) {
          if (window.scrollY > 200 && !document.body.classList.contains('has-mini-player')) {
            setPlayerCollapsed(true, false);
          }
        }
      }, 100);
    }, { passive: true });

    wireEmptyStateEvents();
  }

  function openAddModal() {
    elements.addModal.classList.remove('hidden');
    elements.podcastSearchQuery.focus();
    window.history.pushState({ modal: 'add' }, '', window.location.hash);
  }

  function closeAddModal() {
    elements.podcastSearchQuery.value = '';
    elements.searchDirectoryResults.innerHTML = '';
    elements.feedUrlInput.value = '';
    if (elements.modalSubgenreChips) {
      elements.modalSubgenreChips.innerHTML = '';
      elements.modalSubgenreChips.classList.add('hidden');
    }
    document.querySelectorAll('#modal-category-chips .category-chip').forEach(c => c.classList.remove('active'));
    if (window.history.state && window.history.state.modal) {
      window.history.back();
    } else if (elements.addModal) {
      elements.addModal.classList.add('hidden');
    }
  }

  function openSleepModal() {
    updateSleepTimerUI();
    elements.sleepModal.classList.remove('hidden');
    window.history.pushState({ modal: 'sleep' }, '', window.location.hash);
  }

  function closeSleepModal() {
    if (window.history.state && window.history.state.modal) {
      window.history.back();
    } else if (elements.sleepModal) {
      elements.sleepModal.classList.add('hidden');
    }
  }

  function showStatus(msg) {
    elements.statusBanner.textContent = msg;
    elements.statusBanner.classList.remove('hidden');
  }

  function hideStatus() {
    elements.statusBanner.classList.add('hidden');
  }

  // ─────────────────────────────────────────────────────────────────────────
  // SECTION 28 · Utilities
  // ─────────────────────────────────────────────────────────────────────────

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

  function decodeHtmlEntities(str) {
    if (!str) return '';
    return String(str)
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
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&apos;/g, "'")
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>');
  }

  function escapeHtml(str) {
    if (!str) return '';
    const decoded = decodeHtmlEntities(str);
    return decoded
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function highlightText(str, query) {
    if (!str) return '';
    const safe = escapeHtml(str);
    if (!query) return safe;
    const q = query.trim();
    if (q.length < 2) return safe;

    const escapedQuery = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`(${escapedQuery})`, 'gi');
    return safe.replace(regex, '<mark class="search-highlight">$1</mark>');
  }

  function formatHighlightedDesc(fullText, query) {
    if (!fullText) return '';
    const cleanText = fullText.replace(/\s+/g, ' ').trim();
    if (!query || query.trim().length < 2) {
      return escapeHtml(cleanText);
    }
    const q = query.trim();
    const lowerText = cleanText.toLowerCase();
    const lowerQ = q.toLowerCase();
    const matchIdx = lowerText.indexOf(lowerQ);

    if (matchIdx === -1) {
      return escapeHtml(cleanText);
    }

    if (matchIdx <= 100) {
      return highlightText(cleanText, q);
    }

    const startIdx = Math.max(0, cleanText.lastIndexOf(' ', matchIdx - 20));
    const endIdx = Math.min(cleanText.length, cleanText.indexOf(' ', matchIdx + q.length + 100));
    const actualEnd = endIdx === -1 ? cleanText.length : endIdx;

    const prefix = startIdx > 0 ? '… ' : '';
    const suffix = actualEnd < cleanText.length ? ' …' : '';
    const excerpt = prefix + cleanText.slice(startIdx, actualEnd).trim() + suffix;

    return highlightText(excerpt, q);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // SECTION 30 · Experimental: Audio Analysis & Visualizer
  // Web Audio API pipeline: AudioContext → MediaElementSource → AnalyserNode.
  // Visualizer: Canvas-based spectrum bars in the full player footer.
  // Classifier stub: heuristic energy/spectral-centroid speech vs music.
  // Auto-skip: if speech detected >8 s in a row, seek forward 30 s.
  //
  // CORS note: podcast streams rarely expose CORS headers, so
  // getByteFrequencyData may return all-zeros (tainted). The audio itself
  // still plays. We detect this and fall back to an idle animation.
  // ─────────────────────────────────────────────────────────────────────────

  // ── Experimental settings persistence ──────────────────────────────────

  function loadExperimentalSettings() {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.EXPERIMENTAL);
      if (raw) {
        const parsed = JSON.parse(raw);
        Object.assign(state.experimentalSettings, parsed);
      }
    } catch (_) {}
    syncExperimentalUI();
  }

  function saveExperimentalSettings() {
    try {
      localStorage.setItem(STORAGE_KEYS.EXPERIMENTAL, JSON.stringify(state.experimentalSettings));
    } catch (_) {}
  }

  function syncExperimentalUI() {
    const es = state.experimentalSettings;
    if (elements.toggleVisualizer) elements.toggleVisualizer.checked = es.enableVisualizer;
    if (elements.toggleClassifier) elements.toggleClassifier.checked = es.enableAudioClassifier;
    if (elements.toggleAutoSkip) elements.toggleAutoSkip.checked = es.autoSkipSpeech;

    // Show/hide auto-skip row depending on classifier being enabled
    const skipRow = document.getElementById('row-auto-skip');
    if (skipRow) skipRow.style.opacity = es.enableAudioClassifier ? '1' : '0.4';
  }

  function setupExperimentalSettings() {
    if (elements.toggleVisualizer) {
      elements.toggleVisualizer.addEventListener('change', () => {
        state.experimentalSettings.enableVisualizer = elements.toggleVisualizer.checked;
        saveExperimentalSettings();
        if (state.experimentalSettings.enableVisualizer) {
          initAudioContext();
          if (state.playbackStatus === 'playing' && state.activeEngine === 'audio') {
            startVisualizerLoop();
          }
        } else {
          stopVisualizerLoop();
        }
      });
    }
    if (elements.toggleClassifier) {
      elements.toggleClassifier.addEventListener('change', () => {
        state.experimentalSettings.enableAudioClassifier = elements.toggleClassifier.checked;
        if (!state.experimentalSettings.enableAudioClassifier) {
          state.experimentalSettings.autoSkipSpeech = false;
          if (elements.toggleAutoSkip) elements.toggleAutoSkip.checked = false;
        }
        saveExperimentalSettings();
        syncExperimentalUI();
        if (state.experimentalSettings.enableAudioClassifier) {
          initAudioContext();
        }
      });
    }
    if (elements.toggleAutoSkip) {
      elements.toggleAutoSkip.addEventListener('change', () => {
        state.experimentalSettings.autoSkipSpeech = elements.toggleAutoSkip.checked;
        saveExperimentalSettings();
      });
    }
  }

  // ── AudioContext / AnalyserNode init ────────────────────────────────────

  function initAudioContext() {
    const aa = state.audioAnalysis;
    if (aa.ctx) return; // already initialised

    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) {
        setExperimentalStatus('Web Audio API not supported in this browser.', 'warn');
        return;
      }
      aa.ctx = new AudioCtx();

      // AnalyserNode — fftSize 256 gives 128 frequency bins (fast enough for 60 fps)
      aa.analyser = aa.ctx.createAnalyser();
      aa.analyser.fftSize = 256;
      aa.analyser.smoothingTimeConstant = 0.8;
      aa.dataArray = new Uint8Array(aa.analyser.frequencyBinCount); // 128 bins

      // MediaElementSource — created once; cannot be re-created for same element.
      // crossOrigin must already be set (or we accept zero-data graceful fallback).
      try {
        aa.source = aa.ctx.createMediaElementSource(elements.audio);
        aa.source.connect(aa.analyser);
        aa.analyser.connect(aa.ctx.destination);
      } catch (e) {
        // If source was already created (InvalidStateError), ignore.
        if (!String(e).includes('InvalidStateError')) {
          console.warn('[AudioAnalysis] createMediaElementSource failed:', e);
        }
        // Connect analyser directly to destination as fallback
        try { aa.analyser.connect(aa.ctx.destination); } catch (_) {}
      }
    } catch (e) {
      console.warn('[AudioAnalysis] AudioContext init failed:', e);
      setExperimentalStatus('AudioContext init failed: ' + e.message, 'warn');
    }
  }

  // ── Visualizer loop ─────────────────────────────────────────────────────

  function startVisualizerLoop() {
    const aa = state.audioAnalysis;
    const es = state.experimentalSettings;
    if (!es.enableVisualizer) return;
    if (!aa.ctx || !aa.analyser) {
      initAudioContext();
      if (!aa.ctx) return;
    }
    if (aa.ctx.state === 'suspended') {
      aa.ctx.resume().catch(() => {});
    }
    stopVisualizerLoop(); // cancel any previous RAF

    const canvas = elements.visualizerCanvas;
    if (!canvas) return;
    canvas.classList.add('active');

    const ctx2d = canvas.getContext('2d');

    let corsCheckCount = 0;
    let isCorsBlocked = false;

    function resizeCanvas() {
      const bar = elements.playerBar;
      if (!bar) return;
      const w = bar.offsetWidth;
      canvas.width = w * (window.devicePixelRatio || 1);
      canvas.height = 32 * (window.devicePixelRatio || 1);
      canvas.style.width = w + 'px';
      canvas.style.height = '32px';
    }
    resizeCanvas();

    function drawFrame() {
      // Pause rendering when player is mini / hidden
      const isFullPlayer = document.body.classList.contains('has-full-player');
      if (!isFullPlayer || state.playbackStatus !== 'playing' || state.activeEngine !== 'audio') {
        // Draw a flat idle line instead of clearing
        ctx2d.clearRect(0, 0, canvas.width, canvas.height);
        aa.rafId = requestAnimationFrame(drawFrame);
        return;
      }

      aa.analyser.getByteFrequencyData(aa.dataArray);

      // CORS detection: if first 10 frames all return zero sum, mark as blocked
      if (!isCorsBlocked && corsCheckCount < 10) {
        let sum = 0;
        for (let i = 0; i < aa.dataArray.length; i++) sum += aa.dataArray[i];
        if (sum === 0) corsCheckCount++;
        else corsCheckCount = 0; // reset if we get data
        if (corsCheckCount >= 10) {
          isCorsBlocked = true;
          aa.corsBlocked = true;
          setExperimentalStatus('ℹ️ Stream lacks CORS headers — showing idle animation. Audio plays normally.', 'warn');
        }
      }

      ctx2d.clearRect(0, 0, canvas.width, canvas.height);

      const W = canvas.width;
      const H = canvas.height;
      const bins = aa.dataArray.length;

      // Use only the lower half of bins (voice/music fundamentals: 0–4 kHz)
      const useBins = Math.floor(bins * 0.5);
      const barW = W / useBins;
      const gap = Math.max(1, Math.floor(barW * 0.15));

      // Accent colour from CSS variable or fallback to orange
      const accentRaw = getComputedStyle(document.documentElement).getPropertyValue('--accent-orange').trim();
      const accent = accentRaw || '#f97316';

      for (let i = 0; i < useBins; i++) {
        let val = isCorsBlocked
          ? (Math.sin(Date.now() / 400 + i * 0.6) * 0.5 + 0.5) * 0.35  // idle animation
          : aa.dataArray[i] / 255;

        const barH = Math.max(2, val * H);
        const x = i * barW;
        const y = H - barH;

        // Gradient: brighter orange at top, dimmer at bottom
        const grad = ctx2d.createLinearGradient(0, y, 0, H);
        grad.addColorStop(0, accent);
        grad.addColorStop(1, accent + '44');

        ctx2d.fillStyle = grad;
        ctx2d.fillRect(x + gap / 2, y, barW - gap, barH);
      }

      // Audio classification (if enabled) — sample every ~250 ms
      if (es.enableAudioClassifier && !isCorsBlocked) {
        const now = performance.now();
        if (now - aa.lastClassifyAt > 250) {
          aa.lastClassifyAt = now;
          classifyAudioFrame();
        }
      }

      aa.rafId = requestAnimationFrame(drawFrame);
    }

    aa.rafId = requestAnimationFrame(drawFrame);

    // Resize canvas when window resizes
    window._vizResizeHandler = () => resizeCanvas();
    window.addEventListener('resize', window._vizResizeHandler);
  }

  function stopVisualizerLoop() {
    const aa = state.audioAnalysis;
    if (aa.rafId) {
      cancelAnimationFrame(aa.rafId);
      aa.rafId = null;
    }
    const canvas = elements.visualizerCanvas;
    if (canvas) {
      canvas.classList.remove('active');
      const ctx2d = canvas.getContext('2d');
      if (ctx2d) ctx2d.clearRect(0, 0, canvas.width, canvas.height);
    }
    if (window._vizResizeHandler) {
      window.removeEventListener('resize', window._vizResizeHandler);
      window._vizResizeHandler = null;
    }
  }

  // ── Audio Classifier (heuristic stub) ──────────────────────────────────
  // Heuristic approach using energy levels and spectral centroid.
  // Ready to be replaced with @xenova/transformers / ONNX model.
  //
  // Speech characteristics:
  //   - Mid-frequency energy dominant (300 Hz – 3 kHz, bins ~5–65 of 128)
  //   - Low spectral centroid (centred around 1–2 kHz)
  //   - Moderate total energy (not silence, not loud music)
  //
  // Music characteristics:
  //   - Broader frequency spread
  //   - Higher total energy or heavy low-end bass

  function classifyAudioFrame() {
    const aa = state.audioAnalysis;
    if (!aa.dataArray) return;
    const data = aa.dataArray;
    const len = data.length; // 128 bins at fftSize=256

    // Compute total energy
    let totalEnergy = 0;
    for (let i = 0; i < len; i++) totalEnergy += data[i];

    if (totalEnergy < 200) {
      // Near-silence — don't classify
      aa.classifierSpeechMs = 0;
      return;
    }

    // Spectral centroid: weighted mean of frequency bins
    let weightedSum = 0;
    for (let i = 0; i < len; i++) weightedSum += i * data[i];
    const centroid = weightedSum / (totalEnergy || 1);

    // Low-end energy (bass: bins 0-10)
    let bassEnergy = 0;
    for (let i = 0; i < Math.min(10, len); i++) bassEnergy += data[i];

    // High-end energy (treble: bins 80-128)
    let highEnergy = 0;
    for (let i = 80; i < len; i++) highEnergy += data[i];

    // Heuristic classification:
    // Speech: centroid in voice range (roughly bins 8-45), low bass, low treble
    const isSpeech = (centroid > 8 && centroid < 45) &&
                     (bassEnergy / totalEnergy < 0.25) &&
                     (highEnergy / totalEnergy < 0.2);

    if (isSpeech) {
      aa.classifierSpeechMs += 250;
    } else {
      aa.classifierSpeechMs = Math.max(0, aa.classifierSpeechMs - 100);
    }

    updateClassifierStatus(isSpeech, centroid);

    // Auto-skip if speech detected continuously for >8 s in music mode
    if (state.experimentalSettings.autoSkipSpeech && aa.classifierSpeechMs >= 8000) {
      aa.classifierSpeechMs = 0;
      if (state.activeEngine === 'audio' && elements.audio.duration) {
        const newTime = Math.min(elements.audio.duration, elements.audio.currentTime + 30);
        elements.audio.currentTime = newTime;
        setExperimentalStatus('⏭ Auto-skipped 30s (speech detected)', 'ok');
        setTimeout(() => updateClassifierStatus(false, centroid), 3000);
      }
    }
  }

  function updateClassifierStatus(isSpeech, centroid) {
    if (!elements.experimentalStatus) return;
    if (!state.experimentalSettings.enableAudioClassifier) return;
    const speechBar = Math.min(100, (state.audioAnalysis.classifierSpeechMs / 8000) * 100).toFixed(0);
    const label = isSpeech ? '🎙 Speech' : '🎵 Music';
    const centLabel = centroid ? ` · centroid: ${centroid.toFixed(1)}` : '';
    elements.experimentalStatus.textContent = `${label}${centLabel} · speech confidence: ${speechBar}%`;
    elements.experimentalStatus.className = 'experimental-status' + (isSpeech ? ' warn' : ' ok');
  }

  function setExperimentalStatus(msg, cls) {
    if (!elements.experimentalStatus) return;
    elements.experimentalStatus.textContent = msg;
    elements.experimentalStatus.className = 'experimental-status' + (cls ? ' ' + cls : '');
  }

  // ── Hook visualizer into audio engine events ────────────────────────────
  // Called from setupAudioEngines() after the audio element is ready.

  function hookVisualizerToAudio() {
    const audio = elements.audio;

    audio.addEventListener('playing', () => {
      if (state.activeEngine === 'audio' && state.experimentalSettings.enableVisualizer) {
        // Resume AudioContext (browsers suspend it until user gesture)
        if (state.audioAnalysis.ctx && state.audioAnalysis.ctx.state === 'suspended') {
          state.audioAnalysis.ctx.resume().catch(() => {});
        }
        startVisualizerLoop();
      }
    });

    audio.addEventListener('pause', () => {
      if (state.experimentalSettings.enableVisualizer) {
        stopVisualizerLoop();
      }
      state.audioAnalysis.classifierSpeechMs = 0;
    });

    audio.addEventListener('ended', () => {
      stopVisualizerLoop();
      state.audioAnalysis.classifierSpeechMs = 0;
    });

    // When a new src is assigned, the AudioContext source stays connected —
    // we just need to resume if it was suspended.
  }

  document.addEventListener('DOMContentLoaded', init);
})();
