(function () {
  'use strict';

  /**
   * app.js — Anypod Podcast App
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

  // ── Safe Storage Fallback Proxy ──────────────────────────────────────────
  // Chrome / Webview can deny access to window.localStorage if third-party cookies
  // or site data are restricted. We proxy storage access into an in-memory dictionary
  // so the entire application UI and playback continue functioning seamlessly without fatal errors.
  let isStorageBlocked = false;
  const memoryStore = {};

  const safeStorage = {
    getItem(key) {
      try {
        if (window.localStorage) return window.localStorage.getItem(key);
      } catch (e) {
        isStorageBlocked = true;
      }
      return Object.prototype.hasOwnProperty.call(memoryStore, key) ? memoryStore[key] : null;
    },
    setItem(key, value) {
      const valStr = String(value);
      try {
        if (window.localStorage) {
          window.localStorage.setItem(key, valStr);
          return;
        }
      } catch (e) {
        isStorageBlocked = true;
      }
      memoryStore[key] = valStr;
    },
    removeItem(key) {
      try {
        if (window.localStorage) {
          window.localStorage.removeItem(key);
          return;
        }
      } catch (e) {
        isStorageBlocked = true;
      }
      delete memoryStore[key];
    },
    clear() {
      try {
        if (window.localStorage) {
          window.localStorage.clear();
          return;
        }
      } catch (e) {
        isStorageBlocked = true;
      }
      for (const k in memoryStore) delete memoryStore[k];
    }
  };

  // Test storage access once at startup
  try {
    const testKey = '__storage_test__';
    window.localStorage.setItem(testKey, '1');
    window.localStorage.removeItem(testKey);
  } catch (_) {
    isStorageBlocked = true;
    console.warn('[anypod] Browser local storage access is restricted. Using memory store with permission banner.');
  }

  // Alias localStorage inside this function scope so any existing call
  // automatically falls back gracefully if browser blocks storage
  const storage = safeStorage;
  const localStorage = safeStorage;

  const STORAGE_KEYS = {
    FEEDS: 'anypod_feeds',
    MUTED_FEEDS: 'anypod_muted_feeds',
    SESSION: 'anypod_session_token',
    USER_EMAIL: 'anypod_user_email',
    CACHED_EPISODES: 'anypod_cached_episodes',
    CACHED_METADATA: 'anypod_cached_metadata',
    POSITIONS: 'anypod_playback_positions',
    THEME: 'anypod_theme',
    QUEUE: 'anypod_playback_queue',
    DOWNLOADS: 'anypod_downloads',
    FAVORITES: 'anypod_favorites',
    EXPERIMENTAL: 'anypod_experimental_settings',
    AUTOPLAY: 'anypod_autoplay',
    SHUFFLE: 'anypod_shuffle',
    LAST_EPISODE: 'anypod_last_active_episode'
  };

  const CARD_ICONS = {
    PLAY: '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="6 4 20 12 6 20 6 4"></polygon></svg>',
    PAUSE: '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>',
    SPINNER: '<svg class="spinner" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="9" stroke-opacity="0.25"></circle><path d="M12 3a9 9 0 0 1 9 9" stroke-linecap="round"></path></svg>',
    CHECK: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"></circle><polyline points="16 9 11 14 8 11"></polyline></svg>',
    CHECK_FILLED: '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg>',
    HEART: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path></svg>',
    HEART_FILLED: '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path></svg>',
    QUEUE: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 6h16M4 12h10M4 18h7"></path><path d="M18 15v6M15 18h6"></path></svg>',
    QUEUE_ADDED: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 6h16M4 12h10M4 18h7"></path><polyline points="15 18 18 21 23 15"></polyline></svg>',
    DOWNLOAD: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>',
    DOWNLOADED: '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a1 1 0 0 1 1 1v10.586l3.293-3.293a1 1 0 1 1 1.414 1.414l-5 5a1 1 0 0 1-1.414 0l-5-5a1 1 0 1 1 1.414-1.414L11 13.586V3a1 1 0 0 1 1-1zM4 20a1 1 0 0 1 1-1h14a1 1 0 1 1 0 2H5a1 1 0 0 1-1-1z"/></svg>',
    DOWNLOAD_SPINNER: '<svg class="spinner" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="9" stroke-opacity="0.25"></circle><path d="M12 3a9 9 0 0 1 9 9" stroke-linecap="round"></path></svg>',
    BELL_OFF: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13.73 21a2 2 0 0 1-3.46 0"></path><path d="M18.63 13A17.89 17.89 0 0 1 18 8"></path><path d="M6.26 6.26A5.86 5.86 0 0 0 6 8c0 7-3 9-3 9h14"></path><path d="M18 8a6 6 0 0 0-9.33-5"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>',
    BELL: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path><path d="M13.73 21a2 2 0 0 1-3.46 0"></path></svg>',
    TRANSCRIPT: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>',
    SHARE: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"></path><polyline points="16 6 12 2 8 6"></polyline><line x1="12" y1="2" x2="12" y2="15"></line></svg>'
  };

  const FALLBACK_ARTWORK = 'data:image/svg+xml,%3Csvg%20xmlns=%22http://www.w3.org/2000/svg%22%20width=%22100%22%20height=%22100%22%3E%3Crect%20width=%22100%25%22%20height=%22100%25%22%20fill=%22%2318181b%22/%3E%3C/svg%3E';

  const DEFAULT_STARTER_FEEDS = [
    'https://feeds.megaphone.fm/NATIONALAERONAUTICSANDSPACEADMINISTRATION8162188566',
    'https://podcasts.files.bbci.co.uk/w13xtvb6.rss',
    'https://feeds.simplecast.com/EmVW7VGp',
    'https://www.deutschlandfunk.de/forschung-aktuell-102.xml'
  ];

  // Curated 50 Science, Planet & Climate shows worldwide across multiple languages
  const CURATED_SCIENCE_FEEDS = [
    // --- English (EN) ---
    { title: "NASA's Curious Universe", feed: "https://feeds.megaphone.fm/NATIONALAERONAUTICSANDSPACEADMINISTRATION8162188566", lang: "en", badge: "EN • Space", topic: "space" },
    { title: "Radiolab", feed: "https://feeds.simplecast.com/EmVW7VGp", lang: "en", badge: "EN • Science", topic: "science" },
    { title: "The Climate Question (BBC)", feed: "https://podcasts.files.bbci.co.uk/w13xtvb6.rss", lang: "en", badge: "EN • Climate", topic: "climate" },
    { title: "Science Vs", feed: "https://feeds.megaphone.fm/sciencevs", lang: "en", badge: "EN • Science", topic: "science" },
    { title: "Ologies with Alie Ward", feed: "https://feeds.simplecast.com/S-J-2z2f", lang: "en", badge: "EN • Nature", topic: "nature" },
    { title: "Nature Podcast", feed: "https://feeds.acast.com/public/shows/nature", lang: "en", badge: "EN • Research", topic: "science" },
    { title: "StarTalk Radio", feed: "https://feeds.simplecast.com/4T39_jAj", lang: "en", badge: "EN • Space", topic: "space" },
    { title: "Science Friday", feed: "https://feeds.simplecast.com/8Px3L_y8", lang: "en", badge: "EN • Science", topic: "science" },
    { title: "TED Climate", feed: "https://feeds.feedburner.com/tedtalks_audio", lang: "en", badge: "EN • Climate", topic: "climate" },
    { title: "Costing the Earth (BBC)", feed: "https://podcasts.files.bbci.co.uk/b006r4wn.rss", lang: "en", badge: "EN • Ecology", topic: "climate" },
    { title: "BBC Earth Podcast", feed: "https://feeds.acast.com/public/shows/bbc-earth-podcast", lang: "en", badge: "EN • Planet", topic: "nature" },
    { title: "Future Ecologies", feed: "https://feeds.captivate.fm/future-ecologies/", lang: "en", badge: "EN • Ecology", topic: "nature" },
    { title: "Mongabay Newscast", feed: "https://mongabay.libsyn.com/rss", lang: "en", badge: "EN • Forests", topic: "nature" },
    { title: "Living on Earth (PRI)", feed: "https://feeds.megaphone.fm/livingonearth", lang: "en", badge: "EN • Environment", topic: "climate" },
    { title: "Short Wave (NPR)", feed: "https://feeds.npr.org/510351/podcast.xml", lang: "en", badge: "EN • Science", topic: "science" },
    { title: "Huberman Lab", feed: "https://feeds.megaphone.fm/hubermanlab", lang: "en", badge: "EN • Biology", topic: "science" },
    { title: "Planetary Radio", feed: "https://www.planetary.org/feed/podcast", lang: "en", badge: "EN • Space", topic: "space" },
    { title: "The Infinite Monkey Cage (BBC)", feed: "https://podcasts.files.bbci.co.uk/b00snr0w.rss", lang: "en", badge: "EN • Science", topic: "science" },
    { title: "Quanta Science Podcast", feed: "https://api.quantamagazine.org/feed/podcast/", lang: "en", badge: "EN • Physics", topic: "science" },
    { title: "Outrage + Optimism", feed: "https://feeds.acast.com/public/shows/outrage-optimism", lang: "en", badge: "EN • Climate", topic: "climate" },
    { title: "CrowdScience (BBC)", feed: "https://podcasts.files.bbci.co.uk/p04d42rc.rss", lang: "en", badge: "EN • Global", topic: "science" },
    { title: "Climate One", feed: "https://feeds.megaphone.fm/CCC9544803627", lang: "en", badge: "EN • Climate", topic: "climate" },
    { title: "Volts (Clean Energy)", feed: "https://api.substack.com/feed/podcast/193024.rss", lang: "en", badge: "EN • Energy", topic: "climate" },
    { title: "Gastropod", feed: "https://feeds.megaphone.fm/VMP6255701211", lang: "en", badge: "EN • Food Sci", topic: "science" },
    { title: "The Energy Gang", feed: "https://rss.art19.com/the-energy-gang", lang: "en", badge: "EN • Energy", topic: "climate" },

    // --- German (DE) ---
    { title: "Forschung aktuell (DLF)", feed: "https://www.deutschlandfunk.de/forschung-aktuell-102.xml", lang: "de", badge: "DE • Wissen", topic: "science" },
    { title: "ARD Klima-Update", feed: "https://www.ndr.de/nachrichten/info/podcast4696.xml", lang: "de", badge: "DE • Klima", topic: "climate" },
    { title: "ZEIT WISSEN: Woher weißt du das?", feed: "https://feeds.simplecast.com/NM3_bR51", lang: "de", badge: "DE • Wissen", topic: "science" },
    { title: "Terra X Podcast (ZDF)", feed: "https://cdn.julephosting.de/podcasts/1350-terra-x-der-podcast/feed.rss", lang: "de", badge: "DE • Natur", topic: "nature" },
    { title: "radiowissen (Bayern 2)", feed: "https://feeds.br.de/radiowissen/feed.xml", lang: "de", badge: "DE • Wissen", topic: "science" },
    { title: "Synapsen (NDR Info)", feed: "https://www.ndr.de/nachrichten/info/podcast2994.xml", lang: "de", badge: "DE • Forschung", topic: "science" },
    { title: "Spektrum der Wissenschaft", feed: "https://detektor.fm/podcasts/spektrum-der-wissenschaft/feed", lang: "de", badge: "DE • Natur", topic: "nature" },
    { title: "Das Klima (IPCC)", feed: "https://dasklima.podigee.io/feed/mp3", lang: "de", badge: "DE • Klima", topic: "climate" },
    { title: "Quarks Science-Cops (WDR)", feed: "https://www1.wdr.de/mediathek/audio/quarks-science-cops/science-cops-100.podcast", lang: "de", badge: "DE • Fakten", topic: "science" },
    { title: "Gradmesser (Tagesspiegel)", feed: "https://dergradmesser.podigee.io/feed/mp3", lang: "de", badge: "DE • Klima", topic: "climate" },
    { title: "Sternengeschichten", feed: "https://sternengeschichten.podigee.io/feed/mp3", lang: "de", badge: "DE • Raumfahrt", topic: "space" },
    { title: "Quarks Daily (WDR)", feed: "https://www1.wdr.de/mediathek/audio/daily-quarks/daily-quarks-podcast-104.podcast", lang: "de", badge: "DE • Wissen", topic: "science" },

    // --- French (FR) ---
    { title: "La Terre au carré (France Inter)", feed: "https://radiofrance-podcast.net/podcast09/rss_10078.xml", lang: "fr", badge: "FR • Écologie", topic: "nature" },
    { title: "La Science, CQFD (France Culture)", feed: "https://radiofrance-podcast.net/podcast09/rss_10076.xml", lang: "fr", badge: "FR • Sciences", topic: "science" },
    { title: "Chaleur Humaine (Le Monde)", feed: "https://feeds.acast.com/public/shows/68db9a016d92c33f9c2eff83", lang: "fr", badge: "FR • Climat", topic: "climate" },
    { title: "Sixième Science (20 Minutes)", feed: "https://feeds.acast.com/public/shows/sixieme-science", lang: "fr", badge: "FR • Sciences", topic: "science" },
    { title: "Baleine sous gravillon", feed: "https://feed.ausha.co/BNxwOTwv2gLX", lang: "fr", badge: "FR • Vivant", topic: "nature" },
    { title: "Sur les épaules de Darwin", feed: "https://radiofrance-podcast.net/podcast09/rss_11553.xml", lang: "fr", badge: "FR • Évolution", topic: "nature" },

    // --- Spanish (ES) ---
    { title: "Coffee Break: Señal y Ruido", feed: "https://feeds.ivoox.com/feed_fg_f1172991_filtro_1.xml", lang: "es", badge: "ES • Cosmos", topic: "space" },
    { title: "Materia Oscura", feed: "https://feeds.ivoox.com/feed_fg_f1772652_filtro_1.xml", lang: "es", badge: "ES • Ciencia", topic: "science" },
    { title: "Aparici en Órbita", feed: "https://feeds.ivoox.com/feed_fg_f1646895_filtro_1.xml", lang: "es", badge: "ES • Cosmos", topic: "space" },
    { title: "A Hombros de Gigantes (RNE)", feed: "http://api.rtve.es/api/programas/1873/audios.rss", lang: "es", badge: "ES • Divulgación", topic: "science" },
    { title: "Catástrofe Ultravioleta", feed: "https://www.omnycontent.com/d/playlist/554539c9-b3b2-431a-9f3a-ada4006d04a0/d422d26a-b8b3-4c1f-b507-b2e20117a99d/d1a34000-0d86-4257-b229-b2e20117a9b8/podcast.rss", lang: "es", badge: "ES • Ciencia", topic: "science" },

    // --- Multilingual Worldwide (IT / SV) ---
    { title: "Ci vuole una scienza (Il Post)", feed: "https://feeds.megaphone.fm/IPS8073667277", lang: "it", badge: "IT • Scienza", topic: "science" },
    { title: "Vetenskapsradion Klotet (SR)", feed: "https://api.sr.se/api/rss/pod/3966", lang: "sv", badge: "SV • Miljö & Klimat", topic: "climate" }
  ];
  
  const _curatedArtworkCache = {};

  async function loadCuratedArtworks(container) {
    if (!container) return;
    const cards = container.querySelectorAll('.starter-show-card');

    for (const card of cards) {
      const feedUrl = card.dataset.feed;
      const title = card.dataset.title;
      const img = card.querySelector('.feed-art');
      if (!img || !feedUrl) continue;

      // 1. Return from existing state or memory cache
      if (state.feedMetadata[feedUrl]?.artwork) {
        img.src = state.feedMetadata[feedUrl].artwork;
        continue;
      }
      if (_curatedArtworkCache[feedUrl]) {
        img.src = _curatedArtworkCache[feedUrl];
        continue;
      }

      // 2. Fetch fresh high-res artwork from proxy (with direct fallback)
      try {
        let artUrl = null;
        try {
          const res = await fetch(`/api/search-directory?term=${encodeURIComponent(title)}&limit=1`);
          if (res.ok) {
            const data = await res.json();
            if (data.results && data.results[0]?.artworkUrl600) {
              artUrl = data.results[0].artworkUrl600;
            }
          }
        } catch (_) {}

        // if (!artUrl) {
        //   try {
        //     const res = await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(title)}&media=podcast&entity=podcast&limit=1`);
        //     if (res.ok) {
        //       const data = await res.json();
        //       if (data.results && data.results[0]?.artworkUrl600) {
        //         artUrl = data.results[0].artworkUrl600;
        //       }
        //     }
        //   } catch (_) {}
        // }

        if (artUrl) {
          _curatedArtworkCache[feedUrl] = artUrl;
          img.src = artUrl;
        }
      } catch (_) {}
    }
  }

  // ── Auto-load 3 Real Episodes for Visible Discover Cards ──────────────────
  const _fetchingFeedPreviews = new Set();

  function updateCardWithEpisodes(card, eps, feedUrl) {
    if (!card || !eps || eps.length === 0) return;
    const oldWidget = card.querySelector('.feed-recent-widget');
    if (oldWidget && typeof buildRecentEpisodesWidget === 'function') {
      const temp = document.createElement('div');
      temp.innerHTML = buildRecentEpisodesWidget(eps, feedUrl);
      const newWidget = temp.firstElementChild;
      if (newWidget) {
        oldWidget.replaceWith(newWidget);

        // Wire playback clicks on the new episode rows
        newWidget.querySelectorAll('.recent-ep-row').forEach(row => {
          const guid = row.dataset.guid;
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
      }
    }

    const infoP = card.querySelector('.feed-info p');
    if (infoP && !infoP.textContent.includes('episodes')) {
      infoP.textContent = `${infoP.textContent ? infoP.textContent + ' • ' : ''}${eps.length} episodes`;
    }
  }

  function loadCuratedFeedEpisodes(container = document) {
    if (!container || !('IntersectionObserver' in window)) return;
    const cards = container.querySelectorAll('.starter-show-card, .feed-card[data-feed]');

    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        observer.unobserve(entry.target);

        const card = entry.target;
        const feedUrl = card.dataset.feed;
        if (!feedUrl || _fetchingFeedPreviews.has(feedUrl)) return;

        const existing = (state.allEpisodes || []).filter(e => e.feedUrl === feedUrl);
        if (existing.length > 0) {
          updateCardWithEpisodes(card, existing, feedUrl);
          return;
        }

        _fetchingFeedPreviews.add(feedUrl);
        if (typeof fetchSingleFeed === 'function') {
          fetchSingleFeed(feedUrl, state.allEpisodes, state.feedMetadata).then(() => {
            _fetchingFeedPreviews.delete(feedUrl);
            const eps = (state.allEpisodes || []).filter(e => e.feedUrl === feedUrl);
            if (eps.length > 0) {
              updateCardWithEpisodes(card, eps, feedUrl);
            }
          }).catch(() => {
            _fetchingFeedPreviews.delete(feedUrl);
          });
        }
      });
    }, { rootMargin: '250px' });

    cards.forEach(card => {
      const feedUrl = card.dataset.feed;
      const existing = (state.allEpisodes || []).filter(e => e.feedUrl === feedUrl);
      if (existing.length > 0) {
        updateCardWithEpisodes(card, existing, feedUrl);
      } else {
        observer.observe(card);
      }
    });
  }
  // ── Wire Discover Curated Show Interactivity ──────────────────────────────
  function wireStarterSuggestionsEvents(container = document) {
    if (!container) return;

    // 1. Category / Language Filter Pills
    container.querySelectorAll('.starter-filter-pill').forEach(pill => {
      pill.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const filter = pill.dataset.filter || 'all';
        const section = container.querySelector('.starter-suggestions-section') || container.querySelector('.discover-curated-section');
        if (section && typeof buildStarterSuggestionsHTML === 'function') {
          const temp = document.createElement('div');
          temp.innerHTML = buildStarterSuggestionsHTML(filter);
          const newSection = temp.firstElementChild;
          if (newSection) {
            section.replaceWith(newSection);
            wireStarterSuggestionsEvents(container);
          }
        }
      });
    });

    // 2. Feed Cards (Follow, Share, Play Episodes, View Detail)
    container.querySelectorAll('.starter-show-card').forEach(card => {
      const feedUrl = card.dataset.feed;
      const title = card.dataset.title || '';

      // Share button
      const shareBtn = card.querySelector('.btn-feed-share');
      if (shareBtn) {
        shareBtn.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          if (typeof shareFeed === 'function') {
            shareFeed(feedUrl, title);
          }
        });
      }

      // Follow / Subscribe button
      const addBtn = card.querySelector('.starter-chip-add');
      if (addBtn) {
        addBtn.addEventListener('click', async (e) => {
          e.preventDefault();
          e.stopPropagation();
          if (state.feeds.includes(feedUrl)) {
            if (typeof showStatus === 'function') showStatus('Already in your podcast library');
            return;
          }
          const img = card.querySelector('.feed-art');
          const artwork = img?.src || '';
          addBtn.textContent = 'Adding...';
          try {
            await addFeed(feedUrl, title, artwork);
            addBtn.textContent = '✓ followed';
            addBtn.classList.remove('btn-primary');
            addBtn.classList.add('btn-secondary');
            addBtn.disabled = true;
            if (typeof showStatus === 'function') showStatus('Subscribed! Added to your library');
          } catch (err) {
            console.error('Error adding feed:', err);
            addBtn.textContent = '+ follow';
          }
        });
      }

      // Playable recent episode rows
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

      // Card body click -> Open Feed Detail preview
      card.addEventListener('click', (e) => {
        if (e.target.closest('.starter-chip-add') || e.target.closest('.btn-feed-share') || e.target.closest('.recent-ep-row')) return;
        if (elements.addModal && !elements.addModal.classList.contains('hidden')) {
          closeAddModal();
        }
        if (feedUrl && typeof openFeedDetail === 'function') {
          openFeedDetail(feedUrl);
        }
      });
    });

    // 3. Load high-res cover art and the 3 real episodes for visible cards
    if (typeof loadCuratedArtworks === 'function') {
      loadCuratedArtworks(container);
    }
    loadCuratedFeedEpisodes(container);
  }

  // Helper to build curated science starter suggestions HTML
  function buildStarterSuggestionsHTML(activeFilter = 'all') {
    const filters = [
      { id: 'all', label: 'all (50)' },
      { id: 'en', label: 'english (25)' },
      { id: 'de', label: 'deutsch (12)' },
      { id: 'fr', label: 'français (6)' },
      { id: 'es', label: 'español (5)' },
      { id: 'other', label: 'global / other (2)' },
      { id: 'climate', label: '🌱 climate & planet' },
      { id: 'science', label: '🔬 science' },
      { id: 'space', label: '🚀 space' }
    ];

    const filterPillsHTML = filters.map(f => `
      <button type="button" class="starter-filter-pill ${f.id === activeFilter ? 'active' : ''}" data-filter="${f.id}">${f.label}</button>
    `).join('');

    const filtered = CURATED_SCIENCE_FEEDS.filter(item => {
      if (activeFilter === 'all') return true;
      if (activeFilter === 'other') return item.lang === 'it' || item.lang === 'sv';
      if (['climate', 'science', 'space', 'nature'].includes(activeFilter)) {
        return item.topic === activeFilter;
      }
      return item.lang === activeFilter;
    });

    const chipsHTML = filtered.map(item => {
      const isSubbed = state.feeds.includes(item.feed);
      const art = item.artwork || (state.feedMetadata[item.feed] && state.feedMetadata[item.feed].artwork) || (_curatedArtworkCache && _curatedArtworkCache[item.feed]) || FALLBACK_ARTWORK;
      const allForFeed = (state.allEpisodes || []).filter(e => e.feedUrl === item.feed);
      const recentWidgetHtml = typeof buildRecentEpisodesWidget === 'function' ? buildRecentEpisodesWidget(allForFeed, item.feed) : '';
      const epCountText = allForFeed.length > 0 ? `${allForFeed.length} episodes` : (item.badge || item.lang.toUpperCase());

      return `
        <div class="feed-card starter-show-card" data-feed="${escapeHtml(item.feed)}" data-title="${escapeHtml(item.title)}">
          <div class="feed-header">
            <img class="feed-art" loading="lazy" decoding="async" width="48" height="48" src="${escapeHtml(art)}" alt="" onerror="this.onerror=null;this.src='${FALLBACK_ARTWORK}';">
            <div class="feed-info">
              <h4>${escapeHtml(item.title)}</h4>
              <p>${escapeHtml(epCountText)}</p>
            </div>
            <div class="feed-header-actions">
              <button type="button" class="btn-feed-share" title="Share podcast" aria-label="Share podcast">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"></path>
                  <polyline points="16 6 12 2 8 6"></polyline>
                  <line x1="12" y1="2" x2="12" y2="15"></line>
                </svg>
              </button>
              <button type="button" class="btn ${isSubbed ? 'btn-secondary' : 'btn-primary'} btn-sm starter-chip-add ${isSubbed ? 'subscribed' : ''}" data-feed="${escapeHtml(item.feed)}" data-title="${escapeHtml(item.title)}" ${isSubbed ? 'disabled' : ''}>
                ${isSubbed ? '✓ followed' : '+ follow'}
              </button>
            </div>
          </div>
          ${item.description ? `<p class="feed-card-desc">${escapeHtml(item.description)}</p>` : ''}
          ${recentWidgetHtml}
        </div>
      `;
    }).join('');

    return `
      <div class="starter-suggestions-section">
        <div class="starter-suggestions-header">
          <div class="starter-suggestions-title">discover curated shows worldwide</div>
          <div class="starter-suggestions-sub">science, planet &amp; climate • 50 curated worldwide audio shows</div>
        </div>
        <div class="starter-filters-row">
          ${filterPillsHTML}
        </div>
        <div class="feeds-grid starter-suggestions-grid">
          ${chipsHTML}
        </div>
      </div>
    `;
  }

  // Helper to build the 3 recent playable episodes widget matching the Feeds tab
  function buildRecentEpisodesWidget(feedEpisodes, feedUrl) {
    if (!feedEpisodes || feedEpisodes.length === 0) {
      // Return a clean skeleton / preview prompt so cards have consistent layout
      return `
        <div class="feed-recent-widget feed-recent-preview-empty" data-feed="${escapeHtml(feedUrl || '')}">
          <div class="feed-recent-header">latest episodes</div>
          <div class="feed-recent-list">
            <div class="recent-ep-row recent-ep-placeholder" style="color: var(--text-muted); font-size: 0.78rem; padding: 0.35rem 0.5rem;">
              <span>Click card to preview episodes</span>
            </div>
          </div>
        </div>
      `;
    }
    const recent = feedEpisodes.slice(0, 3);

    return `
      <div class="feed-recent-widget">
        <div class="feed-recent-header">up next (unplayed)</div>
        <div class="feed-recent-list">
          ${recent.map(ep => {
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
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
                    ${isEpPlaying ? '<rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect>' : '<polygon points="5 3 19 12 5 21 5 3"></polygon>'}
                  </svg>
                </button>
                <span class="recent-ep-title">${escapeHtml(ep.title)}</span>${durStr ? `<span class="recent-ep-duration">${escapeHtml(durStr)}</span>` : ''}
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;
  }

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
    isShuffle: localStorage.getItem('anypod_shuffle') === 'true',
    searchQuery: '',
    filterMode: 'unplayed',
    feedFilter: 'all',
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
    favorites: [],
    favoriteGuids: new Set(),
    downloadedEpisodes: {},
    downloadingGuids: new Set(),
    directoryCountry: 'all',
    sleepTimer: {
      active: false,
      minutes: 0,
      endTime: null,
      intervalId: null,
      fadeout: true,
      initialVolume: 1.0
    },
    experimentalSettings: {
      enableVisualizer: true,
      enableAudioClassifier: false,
      showJumpButtons: false,
      autoSkipSpeech: false,
      enableTranscript: false,
      enableLiveTranscript: false
    },
    episodeTimeline: {
      guid: null,
      duration: 0,
      bars: [],        // array of { height: 0..1, type: 'speech' | 'music' | 'neutral', time: seconds }
      segments: [],    // array of { start: s, end: s, type: 'speech' | 'music' }
      cues: [],        // array of { start: s, end: s, text: string, type: 'speech' }
      transcriptSource: '',
      isProbing: false,
      progressPct: 0
    },
    showRemainingTime: true,
    isTabActive: typeof document !== 'undefined' ? !document.hidden : true,
    autoplayEnabled: safeStorage.getItem(STORAGE_KEYS.AUTOPLAY) !== 'false',
    playbackContext: {
      type: 'timeline',
      id: '',
      title: 'Timeline',
      items: []
    },
    _mediaSessionGuid: null,
    _nowPlayingActiveGuid: null,
    _episodeEndedTriggered: false
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
    btnPlayerShuffle: document.getElementById('btn-player-shuffle'),
    btnPlayerMarkPlayed: document.getElementById('btn-player-mark-played'),

    tabs: document.querySelectorAll('.nav-tab'),
    panels: document.querySelectorAll('.tab-panel'),
    tabFeeds: document.getElementById('tab-feeds'),
    tabTimeline: document.getElementById('tab-timeline'),
    tabFavorites: document.getElementById('tab-favorites'),
    tabDownloads: document.getElementById('tab-downloads'),
    tabDiscover: document.getElementById('tab-discover'),
    tabSettings: document.getElementById('tab-settings'),
    panelFeeds: document.getElementById('panel-feeds'),
    panelTimeline: document.getElementById('panel-timeline'),
    panelFavorites: document.getElementById('panel-favorites'),
    panelDownloads: document.getElementById('panel-downloads'),
    panelDiscover: document.getElementById('panel-discover'),
    panelFeedDetail: document.getElementById('panel-feed-detail'),
    feedDetailHeader: document.getElementById('feed-detail-header'),
    feedDetailEpisodes: document.getElementById('feed-detail-episodes'),
    favoritesEpisodesList: document.getElementById('favorites-episodes-list'),
    favoritesHeaderCount: document.getElementById('favorites-header-count'),
    themeBtns: document.querySelectorAll('.btn-theme'),
    feedCount: document.getElementById('feed-count'),
    favoritesTabCount: document.getElementById('favorites-tab-count'),
    downloadsTabCount: document.getElementById('downloads-tab-count'),
    btnOpenSettings: document.getElementById('btn-open-settings'),
    btnPlayerFav: document.getElementById('btn-player-fav'),

    searchInput: document.getElementById('search-input'),
    searchBarWrap: document.getElementById('search-bar-wrap'),
    btnClearSearch: document.getElementById('btn-clear-search'),
    sortOrderSelect: document.getElementById('sort-order'),
    // btnOpenAddModal: document.getElementById('btn-open-add-modal'),
    // btnRefreshAll: document.getElementById('btn-refresh-all'),
    statusBanner: document.getElementById('status-banner'),

    timelineList: document.getElementById('timeline-list'),
    feedsFilterBar: document.getElementById('feeds-filter-bar'),
    // feedsFilterChips: document.getElementById('feeds-filter-chips'),
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
    btnReloadCache: document.getElementById('btn-reload-cache'),
    btnClearStorage: document.getElementById('btn-clear-storage'),

    addModal: document.getElementById('add-modal'),
    addModalNav: document.getElementById('add-modal-nav'),
    addModalBody: document.getElementById('add-modal-body'),
    btnToggleEnlarge: document.getElementById('btn-toggle-enlarge'),
    dirResultsTitle: document.getElementById('dir-results-title'),
    dirStickyCollapseBar: document.getElementById('dir-sticky-collapse-bar'),
    btnStickyCollapse: document.getElementById('btn-sticky-collapse'),
    podcastSearchQuery: document.getElementById('podcast-search-query'),
    btnClearModalSearch: document.getElementById('btn-clear-modal-search'),
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
    showNotesArt: document.getElementById('show-notes-art'),
    showNotesPodcastTitle: document.getElementById('show-notes-podcast-title'),
    showNotesEpisodeTitle: document.getElementById('show-notes-episode-title'),
    showNotesMeta: document.getElementById('show-notes-meta'),
    btnNotesPlay: document.getElementById('btn-notes-play'),
    notesPlayIcon: document.getElementById('notes-play-icon'),
    notesPlayLabel: document.getElementById('notes-play-label'),
    btnAutoplayToggle: document.getElementById('btn-autoplay-toggle'),
    showNotesContent: document.getElementById('show-notes-content'),
    tabBtnNotes: document.getElementById('tab-btn-notes'),
    tabBtnTranscript: document.getElementById('tab-btn-transcript'),
    transcriptSourcePill: document.getElementById('transcript-source-pill'),
    showTranscriptContent: document.getElementById('show-transcript-content'),
    // transcriptSearchInput: document.getElementById('transcript-search-input'),
    // transcriptFileInput: document.getElementById('transcript-file-input'),
    transcriptCuesList: document.getElementById('transcript-cues-list'),

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
    btnPlayerTranscript: document.getElementById('btn-player-transcript'),
    btnPlayerNotes: document.getElementById('btn-player-notes'),
    btnPlayerShare: document.getElementById('btn-player-share'),
    playerStatusBadges: document.getElementById('player-status-badges'),
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
    miniOpenQueue: document.getElementById('mini-open-queue'),
    miniQueueDot: document.getElementById('mini-queue-dot'),
    miniStatusBadges: document.getElementById('mini-status-badges'),
    miniToggle: document.getElementById('mini-toggle'),
    miniProgressFill: document.getElementById('mini-progress-fill'),

    // Volume Popover Controls
    btnPlayerVolume: document.getElementById('btn-player-volume'),
    btnMiniVolume: document.getElementById('btn-mini-volume'),
    volumePopover: document.getElementById('volume-popover'),
    volumeSlider: document.getElementById('volume-slider'),
    volumePercentLabel: document.getElementById('volume-percent-label'),
    btnVolumeMute: document.getElementById('btn-volume-mute'),

    // Full-Episode Waveform & Speech/Music Timeline Chart
    timeScrubber: document.getElementById('time-scrubber'),
    timelineLegend: document.getElementById('timeline-legend'),
    waveformTimelineWrap: document.getElementById('waveform-timeline-wrap'),
    episodeWaveformCanvas: document.getElementById('episode-waveform-canvas'),
    waveformProgressOverlay: document.getElementById('waveform-progress-overlay'),
    waveformPlayheadLine: document.getElementById('waveform-playhead-line'),
    waveformHoverCursor: document.getElementById('waveform-hover-cursor'),
    waveformTooltip: document.getElementById('waveform-tooltip'),
    btnJumpSpeech: document.getElementById('btn-jump-speech'),
    btnJumpMusic: document.getElementById('btn-jump-music'),
    probeStatusPill: document.getElementById('probe-status-pill'),

    // Experimental feature toggles
    toggleVisualizer: document.getElementById('toggle-visualizer'),
    toggleClassifier: document.getElementById('toggle-classifier'),
    toggleLiveTranscript: document.getElementById('toggle-live-transcript'),
    rowLiveTranscript: document.getElementById('row-live-transcript'),
    toggleAutoSkip: document.getElementById('toggle-auto-skip'),
    toggleTranscript: document.getElementById('toggle-transcript'),
    experimentalStatus: document.getElementById('experimental-status'),

    // Top navigation back button
    btnHeaderBack: document.getElementById('btn-header-back'),
    // btnHeaderBackLabel: document.getElementById('btn-header-back-label')

    // Live caption popup (floats above player bar)
    liveCaptionPopup: document.getElementById('live-caption-popup'),
    liveCaptionText: document.getElementById('live-caption-text'),
    btnCloseCaption: document.getElementById('btn-close-caption'),

    // Storage permission banner
    storagePermissionBanner: document.getElementById('storage-permission-banner'),
    btnRequestStorage: document.getElementById('btn-request-storage'),
    btnRetryStorage: document.getElementById('btn-retry-storage'),
    btnDismissStorage: document.getElementById('btn-dismiss-storage'),
  };
  document.addEventListener('visibilitychange', () => {
    state.isTabActive = !document.hidden;

    if (document.hidden) {
      if (activeProbeAbortController) {
        activeProbeAbortController.abort();
        activeProbeAbortController = null;
      }
      state.episodeTimeline.isProbing = false;
      if (elements.probeStatusPill) {
        elements.probeStatusPill.classList.add('hidden');
      }
      if (typeof liveTranscription !== 'undefined' && liveTranscription && liveTranscription.onPlayStateChange) {
        liveTranscription.onPlayStateChange(false);
      }
    } else {
      // Tab/app became visible again — resync UI
      if (state.currentEpisode) {
        if (elements.playerTitle) elements.playerTitle.textContent = state.currentEpisode.title;
        if (elements.playerPodcast) elements.playerPodcast.textContent = state.currentEpisode.podcastTitle;
        if (elements.playerArtwork) elements.playerArtwork.src = state.currentEpisode.artwork || FALLBACK_ARTWORK;
        if (elements.miniTitle) elements.miniTitle.textContent = state.currentEpisode.title;
        if (elements.miniPodcast) elements.miniPodcast.textContent = state.currentEpisode.podcastTitle;
        if (elements.miniArtwork) elements.miniArtwork.src = state.currentEpisode.artwork || FALLBACK_ARTWORK;
        renderContinueShelf();
        updateFilterBadges();
        initOrLoadEpisodeTimeline(state.currentEpisode, (state.currentEpisode.duration ? parseDurationSeconds(state.currentEpisode.duration) : 0));
      }
      updateDuration();
      updateProgress();
      syncPlaybackButtons();
      if (state.currentEpisode && state.experimentalSettings.enableVisualizer) {
        renderWaveformChart();
      }
      if (state.experimentalSettings.enableLiveTranscript && typeof liveTranscription !== 'undefined' && liveTranscription && state.playbackStatus === 'playing') {
        liveTranscription.onPlayStateChange(true);
      }
      // Mobile OS (iOS/Android) may have paused audio while backgrounded.
      // If our state says playing but the element is paused, try to resume.
      if (
        state.activeEngine === 'audio' &&
        state.playbackStatus === 'playing' &&
        elements.audio &&
        elements.audio.paused &&
        !elements.audio.ended
      ) {
        elements.audio.play().catch(() => {
          // If play was rejected (e.g. user locked screen manually), honor the pause
          state.playbackStatus = 'paused';
          syncPlaybackButtons();
        });
      }
      // Re-sync MediaSession so lock-screen controls reappear
      if (state.currentEpisode && 'mediaSession' in navigator) {
        syncMediaSession(state.currentEpisode);
        if (state.playbackStatus === 'playing') {
          navigator.mediaSession.playbackState = 'playing';
        }
      }
    }
  });
  // document.addEventListener('visibilitychange', () => {
  //   state.isTabActive = !document.hidden;

  //   if (document.hidden) {
  //     // Abort background probing immediately to save battery and satisfy OS watchdog
  //     if (activeProbeAbortController) {
  //       activeProbeAbortController.abort();
  //       activeProbeAbortController = null;
  //     }
  //     state.episodeTimeline.isProbing = false;
  //     if (elements.probeStatusPill) {
  //       elements.probeStatusPill.classList.add('hidden');
  //     }

  //     if (typeof liveDspInterval !== 'undefined' && liveDspInterval) {
  //       clearInterval(liveDspInterval);
  //       liveDspInterval = null;
  //     }
  //     if (typeof isAcceleratingSilence !== 'undefined' && isAcceleratingSilence && elements.audio) {
  //       elements.audio.playbackRate = state.playbackSpeed || 1.0;
  //       isAcceleratingSilence = false;
  //     }
  //   } else {
  //     if (state.experimentalSettings.enableSilenceSkip && isEnginePlaying()) {
  //       if (typeof startLiveSilenceDetection === 'function') {
  //         startLiveSilenceDetection();
  //       }
  //     }

  //     processAndSortEpisodes();
  //     renderTimeline(true);
  //     renderContinueShelf();
  //     updateFilterBadges();
  //     syncPlaybackButtons();

  //     if (state.activeFeedDetailUrl) {
  //       renderFeedDetail(state.activeFeedDetailUrl);
  //     }
  //     if (state.currentEpisode) {
  //       initOrLoadEpisodeTimeline(state.currentEpisode, state.episodeTimeline.duration);
  //     }
  //     if (state.experimentalSettings.enableVisualizer) {
  //       renderWaveformChart();
  //     }
  //   }
  // });

  // ─────────────────────────────────────────────────────────────────────────
  // Scroll-position memory for the episode timeline list.
  // When the user opens a feed detail and then returns, the list scrolls
  // back to where it was.
  // ─────────────────────────────────────────────────────────────────────────
  let _savedScrollTop = 0;
  const _timelineListEl = document.getElementById('timeline-list');
  if (_timelineListEl) {
    _timelineListEl.addEventListener('scroll', () => {
      _savedScrollTop = _timelineListEl.scrollTop;
    }, { passive: true });
  }

  function _restoreTimelineScroll() {
    if (_timelineListEl) {
      // Use rAF so the list is already visible before we scroll
      requestAnimationFrame(() => {
        _timelineListEl.scrollTop = _savedScrollTop;
      });
    }
  }

  // Wire top nav back button → navigateBack
  // if (elements.btnHeaderBack) {
  //   elements.btnHeaderBack.addEventListener('click', (e) => {
  //     e.preventDefault();
  //     navigateBack();
  //   });
  // }

  function syncShowNotesPlayButton(ep) {
    if (!elements.btnNotesPlay || !ep) return;

    const isCurrent = state.currentEpisode && state.currentEpisode.guid === ep.guid;
    const isPlaying = isCurrent && state.playbackStatus === 'playing';
    const isLoading = isCurrent && state.playbackStatus === 'loading';

    const savedPos = state.playbackPositions[ep.guid];
    const hasProgress = savedPos && !savedPos.completed && savedPos.position > 2;

    if (elements.notesPlayIcon) {
      if (isLoading) {
        elements.notesPlayIcon.innerHTML = CARD_ICONS.SPINNER;
      } else if (isPlaying) {
        elements.notesPlayIcon.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>`;
      } else {
        elements.notesPlayIcon.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><polygon points="6 4 20 12 6 20 6 4"></polygon></svg>`;
      }
    }

    if (elements.notesPlayLabel) {
      if (isLoading) {
        elements.notesPlayLabel.textContent = 'Loading...';
      } else if (isPlaying) {
        elements.notesPlayLabel.textContent = 'Pause';
      } else if (hasProgress) {
        elements.notesPlayLabel.textContent = `Resume (${formatTime(savedPos.position)})`;
      } else {
        const dur = ep.duration ? formatEpisodeDuration(ep.duration) : '';
        elements.notesPlayLabel.textContent = dur ? `Play (${dur})` : 'Play Episode';
      }
    }

    elements.btnNotesPlay.classList.toggle('is-playing', isPlaying);
  }

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
      const ytCued = window.YT ? YT.PlayerState.CUED : 5;

      if (event.data === ytBuffering) {
        state.playbackStatus = 'loading';
        syncPlaybackButtons();
      } else if (event.data === ytPlaying) {
        state.playbackStatus = 'playing';
        syncPlaybackButtons();
        if (state.currentEpisode) {
          const needsReassert = state._nowPlayingActiveGuid !== state.currentEpisode.guid;
          if (needsReassert) {
            state._nowPlayingActiveGuid = state.currentEpisode.guid;
            syncMediaSession(state.currentEpisode, true);
          } else {
            syncMediaSession(state.currentEpisode, false);
          }
        }
      } else if (event.data === ytPaused) {
        state.playbackStatus = 'paused';
        syncPlaybackButtons();
      } else if (event.data === ytEnded) {
        state.playbackStatus = 'idle';
        syncPlaybackButtons();
        onEpisodeEnded();
      } else if (event.data === ytCued) {
        // Video is loaded and ready — trigger playback
        if (state.ytPlayer && state.ytPlayer.playVideo) {
          state.ytPlayer.playVideo();
        }
      }
    }
  }

  function handleYouTubeError(event) {
    const code = event?.data;
    console.error('[YouTube Player Error Code]:', code);
    state.playbackStatus = 'paused';
    syncPlaybackButtons();

    if (code === 150 || code === 101) {
      showStatus('Playback restricted: creator disabled embedding for this video.');
    } else if (code === 100) {
      showStatus('YouTube video not found or removed.');
    } else if (code === 2) {
      showStatus('Invalid YouTube video ID.');
    } else {
      showStatus(`YouTube playback error (${code || 'unknown'}).`);
    }
  }

  function initYouTubePlayer() {
    if (state.ytPlayer || !window.YT || !window.YT.Player) return;
    const playerTarget = document.getElementById('yt-player');
    if (!playerTarget) return;

    state.ytPlayer = new YT.Player('yt-player', {
      height: '120',
      width: '200',
      playerVars: {
        autoplay: 1,
        controls: 0,
        playsinline: 1,
        enablejsapi: 1,
        origin: window.location.origin
      },
      events: {
        onReady: () => {
          state.ytReady = true;
          if (state.pendingYouTubePlay) {
            const pending = state.pendingYouTubePlay;
            state.pendingYouTubePlay = null;
            playEpisode(pending.episode, pending.startTime);
          }
        },
        onStateChange: handleYouTubeStateChange,
        onError: handleYouTubeError
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
      if (elements.btnHeaderBack) {
        elements.btnHeaderBack.classList.remove('hidden');
        const prev = state.navHistory[state.navHistory.length - 1];
        const prevName = prev?.tab ? (prev.tab.charAt(0).toUpperCase() + prev.tab.slice(1)) : 'Back';
        // if (elements.btnHeaderBackLabel) {
        //   elements.btnHeaderBackLabel.textContent = prevName;
        // }
      }
      window.scrollTo({ top: 0, behavior: 'smooth' });
      const meta = state.feedMetadata[feedUrl] || {};
      if (elements.searchInput) {
        elements.searchInput.placeholder = `Search in ${meta.title || 'podcast'}...`;
      }
      renderFeedDetail(feedUrl);
    } else {
      state.activeFeedDetailUrl = null;
      if (elements.panelFeedDetail) elements.panelFeedDetail.classList.remove('active');
      if (elements.btnHeaderBack) {
        elements.btnHeaderBack.classList.add('hidden');
      }
      let targetTab = tab || 'timeline';
      const hasFeeds = state.feeds && state.feeds.length > 0;

      // Check if user opened a direct shared episode or feed link
      const urlParams = new URLSearchParams(window.location.search);
      const hashVal = window.location.hash;
      const hasSharedLink = urlParams.has('feed') || urlParams.has('guid') || hashVal.includes('feed=');

      // Only force 'discover' if library is empty AND there is no incoming shared link
      if (!hasFeeds && !hasSharedLink && ['timeline', 'feeds', 'favorites', 'downloads'].includes(targetTab)) {
        targetTab = 'discover';
      }

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
        _restoreTimelineScroll();
      } else if (targetTab === 'favorites') {
        if (elements.searchInput) elements.searchInput.placeholder = 'Search favorite episodes...';
        renderFavorites();
      } else if (targetTab === 'downloads') {
        if (elements.searchInput) elements.searchInput.placeholder = 'Search downloaded episodes...';
        updateDownloadedCountUI();
      } else if (targetTab === 'discover') {
        if (elements.searchInput) elements.searchInput.placeholder = 'Search directory or paste URL...';
        window.scrollTo({ top: 0, behavior: 'smooth' });
        renderDiscover();
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

      // 2. Apply view from state, query params, or URL hash
      if (e.state && (e.state.tab !== undefined || e.state.feedUrl !== undefined)) {
        _applyView(e.state);
      } else {
        const queryParams = new URLSearchParams(window.location.search);
        const rawHash = window.location.hash.startsWith('#') ? window.location.hash.slice(1) : window.location.hash;
        const hashParams = new URLSearchParams(rawHash);

        const feedUrl = queryParams.get('feed') || hashParams.get('feed') || (rawHash.startsWith('feed=') ? decodeURIComponent(rawHash.slice(5).split('&')[0]) : null);
        if (feedUrl) {
          _applyView({ tab: null, feedUrl });
        } else if (['timeline', 'feeds', 'favorites', 'downloads', 'discover', 'settings'].includes(rawHash)) {
          _applyView({ tab: rawHash, feedUrl: null });
        } else {
          const defaultTab = (!state.feeds || state.feeds.length === 0) ? 'discover' : 'timeline';
          _applyView({ tab: defaultTab, feedUrl: null });
        }
      }
    });

    const queryParams = new URLSearchParams(window.location.search);
    const rawHash = window.location.hash.startsWith('#') ? window.location.hash.slice(1) : window.location.hash;
    const hashParams = new URLSearchParams(rawHash);

    const feedUrl = queryParams.get('feed') || hashParams.get('feed') || (rawHash.startsWith('feed=') ? decodeURIComponent(rawHash.slice(5).split('&')[0]) : null);
    const searchQuery = queryParams.get('q') || queryParams.get('search') || hashParams.get('search');
    const isAdd = queryParams.has('add') || hashParams.has('add') || rawHash === 'add';

    if (feedUrl) {
      _applyView({ tab: null, feedUrl });
      window.history.replaceState({ tab: null, feedUrl }, '', '#' + (rawHash.startsWith('feed=') ? rawHash : 'feed=' + encodeURIComponent(feedUrl)));
      const guid = queryParams.get('guid') || hashParams.get('guid') || queryParams.get('ep') || hashParams.get('ep');
      if (guid) {
        setTimeout(() => {
          const targetEp = state.allEpisodes.find(e => e.guid === guid || e.title === guid);
          if (targetEp) {
            playEpisode(targetEp);
          }
        }, 800);
      }
    } else if (searchQuery) {
      _applyView({ tab: 'timeline', feedUrl: null });
      setTimeout(() => {
        openAddModal();
        if (elements.podcastSearchQuery) {
          elements.podcastSearchQuery.value = searchQuery;
          searchPodcastDirectory(searchQuery);
        }
      }, 100);
    } else if (isAdd) {
      _applyView({ tab: 'timeline', feedUrl: null });
      setTimeout(openAddModal, 100);
    } else if (['timeline', 'feeds', 'favorites', 'downloads', 'discover', 'settings'].includes(rawHash)) {
      _applyView({ tab: rawHash, feedUrl: null });
      window.history.replaceState({ tab: rawHash, feedUrl: null }, '', '#' + rawHash);
    } else {
      const defaultTab = (!state.feeds || state.feeds.length === 0) ? 'discover' : 'timeline';
      _applyView({ tab: defaultTab, feedUrl: null });
      window.history.replaceState({ tab: defaultTab, feedUrl: null }, '', '#' + defaultTab);
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
    loadFavoritesFromStorage();
    loadDownloadsFromStorage();
    setupEventListeners();
    setupAudioEngines();
    hookVisualizerToAudio();
    setupNetworkListeners();
    updateQueueUI();
    updateDownloadedCountUI();
    updateDockVisibility();
    updateAutoplayButtonUI();
    updateShuffleButtonUI();
    initServiceWorker();
    initNavigationRoute();
    checkAuth();
    loadExperimentalSettings();
    setupExperimentalSettings();
    restoreLastActiveEpisode();
    checkStoragePermissionAlert();
  }

  function checkStoragePermissionAlert() {
    if (!elements.storagePermissionBanner) return;
    if (isStorageBlocked) {
      elements.storagePermissionBanner.classList.remove('hidden');
    } else {
      elements.storagePermissionBanner.classList.add('hidden');
    }
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
    state.userEmail = localStorage.getItem(STORAGE_KEYS.USER_EMAIL) || '';
  }

  async function checkAuth() {
    if (state.sessionToken) {
      elements.authModal.classList.add('hidden');
      updateSyncStatusUI('authenticated via magic session (cloud d1 synced)', state.userEmail, true);
      syncFeedsWithD1();
      return;
    }

    try {
      const res = await fetch('/api/sync/feeds', { credentials: 'include' });
      if (res.status === 401) {
        elements.authModal.classList.add('hidden');
        updateSyncStatusUI('logged in as guest / local device storage', '', false);
        if (state.feeds.length > 0) {
          refreshAllFeeds();
        } else {
          renderTimeline();
        }
        return;
      }
      if (res.ok) {
        const data = await res.json();
        elements.authModal.classList.add('hidden');
        if (data.sessionToken) {
          state.sessionToken = data.sessionToken;
          try {
            localStorage.setItem(STORAGE_KEYS.SESSION, data.sessionToken);
          } catch (_) {}
        }
        state.userEmail = data.userEmail || '';
        try {
          if (state.userEmail) localStorage.setItem(STORAGE_KEYS.USER_EMAIL, state.userEmail);
        } catch (_) {}
        updateSyncStatusUI('authenticated via session cookie (cloud d1 synced)', state.userEmail, true);
        if (Array.isArray(data.feeds) && data.feeds.length > 0) {
          state.feeds = data.feeds.map(f => f.feed_url);
          saveFeedsToStorage();
        }
        await loadPlaybackPositionsFromD1();
        await syncFavoritesWithD1();
        await refreshAllFeeds();
        return;
      } else {
        console.warn('Sync server responded with', res.status);
        elements.authModal.classList.add('hidden');
        updateSyncStatusUI('cloud sync temporarily unavailable — listening offline', state.userEmail, !!state.sessionToken);
        if (!state.feeds || state.feeds.length === 0) {
          loadFeedsFromStorage();
        }
        loadCacheFromStorage();
        if (state.feeds.length > 0) {
          refreshAllFeeds();
        } else {
          renderTimeline();
        }
        return;
      }
    } catch (e) {
      console.warn('Auth check network error:', e);
      elements.authModal.classList.add('hidden');
      updateSyncStatusUI('cloud sync temporarily unavailable — listening offline', state.userEmail, !!state.sessionToken);
      if (!state.feeds || state.feeds.length === 0) {
        loadFeedsFromStorage();
      }
      loadCacheFromStorage();
      if (state.feeds.length > 0) {
        refreshAllFeeds();
      } else {
        renderTimeline();
      }
      return;
    }

    elements.authModal.classList.add('hidden');
    updateSyncStatusUI('logged in as guest / local device storage', '', false);
    if (state.feeds.length > 0) {
      refreshAllFeeds();
    } else {
      renderTimeline();
    }
  }

  function updateSyncStatusUI(statusText, email = '', isConnected = false) {
    if (elements.userSyncStatus) {
      elements.userSyncStatus.textContent = (statusText || '').toLowerCase();
    }
    if (elements.statusIndicator) {
      if (isConnected) {
        elements.statusIndicator.classList.add('online');
      } else {
        elements.statusIndicator.classList.remove('online');
      }
    }
    if (elements.userEmailLabel) {
      elements.userEmailLabel.textContent = (email || (isConnected ? 'logged in' : 'guest mode')).toLowerCase();
    }
    if (elements.btnAccountToggle) {
      elements.btnAccountToggle.textContent = isConnected ? 'sign out' : 'log in';
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

      let data = {};
      try {
        data = await res.json();
      } catch (e) {
        data = { error: `Server error (${res.status}). Please try again in a moment.` };
      }
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
    showStatus('syncing feeds & playback state with cloud d1...');
    try {
      const headers = {};
      if (state.sessionToken) headers['X-Session-Token'] = state.sessionToken;

      const res = await fetch('/api/sync/feeds', { headers, credentials: 'include' });

      if (res.status === 401) {
        console.warn('D1 sync returned 401. Preserving offline session & library.');
        updateSyncStatusUI('cloud sync temporarily unavailable — listening offline', state.userEmail, !!state.sessionToken);
        if (!state.feeds || state.feeds.length === 0) {
          loadFeedsFromStorage();
        }
        loadCacheFromStorage();
        if (state.feeds && state.feeds.length > 0) {
          refreshAllFeeds();
        } else {
          renderTimeline();
        }
        return;
      }

      if (!res.ok) {
        console.warn('D1 sync HTTP error:', res.status);
        updateSyncStatusUI('cloud sync temporarily unavailable — listening offline', state.userEmail, true);
        if (!state.feeds || state.feeds.length === 0) {
          loadFeedsFromStorage();
        }
        loadCacheFromStorage();
        if (state.feeds && state.feeds.length > 0) {
          refreshAllFeeds();
        } else {
          renderTimeline();
        }
        return;
      }

      const data = await res.json();
      if (data.sessionToken && !state.sessionToken) {
        state.sessionToken = data.sessionToken;
        try {
          localStorage.setItem(STORAGE_KEYS.SESSION, data.sessionToken);
        } catch (_) {}
      }
      if (data.userEmail) {
        state.userEmail = data.userEmail;
        try {
          localStorage.setItem(STORAGE_KEYS.USER_EMAIL, data.userEmail);
        } catch (_) {}
      }
      updateSyncStatusUI('cloud d1 synced', state.userEmail, true);

      const remoteFeeds = Array.isArray(data.feeds) ? data.feeds : [];
      if (remoteFeeds.length > 0 || !state.feeds || state.feeds.length === 0) {
        state.feeds = remoteFeeds.map(f => f.feed_url);
        saveFeedsToStorage();
      }

      await loadPlaybackPositionsFromD1();
      await syncFavoritesWithD1();
      await refreshAllFeeds();

    } catch (err) {
      console.warn('D1 sync warning:', err);
      updateSyncStatusUI('cloud sync temporarily unavailable — listening offline', state.userEmail, true);
      if (!state.feeds || state.feeds.length === 0) {
        loadFeedsFromStorage();
      }
      loadCacheFromStorage();
      if (state.feeds && state.feeds.length > 0) {
        refreshAllFeeds();
      } else {
        renderTimeline();
      }
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
        credentials: 'include',
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
        credentials: 'include',
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
      if (state.currentEpisode) {
        localStorage.setItem(STORAGE_KEYS.LAST_EPISODE, JSON.stringify(state.currentEpisode));
      }
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

  function restoreLastActiveEpisode() {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.LAST_EPISODE);
      if (!raw) return;
      const lastEp = JSON.parse(raw);
      if (!lastEp || !lastEp.guid) return;

      state.currentEpisode = lastEp;
      state.playbackStatus = 'paused';
      
      if (elements.playerTitle) elements.playerTitle.textContent = lastEp.title || '';
      if (elements.playerPodcast) elements.playerPodcast.textContent = lastEp.podcastTitle || '';
      if (elements.playerArtwork) {
        elements.playerArtwork.src = lastEp.artwork || FALLBACK_ARTWORK;
      }
      if (elements.miniTitle) elements.miniTitle.textContent = lastEp.title || '';
      if (elements.miniPodcast) elements.miniPodcast.textContent = lastEp.podcastTitle || '';
      if (elements.miniArtwork) {
        elements.miniArtwork.src = lastEp.artwork || FALLBACK_ARTWORK;
      }

      if (elements.playerBar) {
        elements.playerBar.classList.add('active-episode');
      }
      document.body.classList.add('has-active-episode');

      const savedPos = state.playbackPositions[lastEp.guid];
      const curSec = (savedPos && savedPos.position) ? savedPos.position : 0;
      let durSec = 0;
      if (lastEp.duration && typeof parseDurationSeconds === 'function') {
        durSec = parseDurationSeconds(lastEp.duration);
      }
      if (elements.currentTimeLabel) elements.currentTimeLabel.textContent = formatTime(curSec);
      if (elements.totalDurationLabel && durSec > 0) elements.totalDurationLabel.textContent = formatTime(durSec);

      // Pre-load audio stream & set seek point so hitting play instantly starts audio
      if (lastEp.audioUrl && elements.audio) {
        state.activeEngine = 'audio';
        let streamUrl = lastEp.audioUrl;
        const isDownloaded = !!(state.downloadedEpisodes && state.downloadedEpisodes[lastEp.guid]);
        if (isDownloaded) {
          streamUrl = `${streamUrl}${streamUrl.includes('?') ? '&' : '?'}offline=1`;
        } else if (window.location.protocol === 'https:' && streamUrl.startsWith('http://')) {
          streamUrl = `/api/audio-proxy?url=${encodeURIComponent(streamUrl)}`;
        }
        state.pendingStartTime = curSec > 0 ? curSec : null;
        elements.audio.src = streamUrl;
        elements.audio.playbackRate = state.playbackSpeed || 1.0;
        elements.audio.preload = 'metadata';
      }

      const savedCollapsed = localStorage.getItem('anypod_player_collapsed');
      const shouldCollapse = savedCollapsed === 'true';
      setPlayerCollapsed(shouldCollapse, false);
      syncMediaSession(lastEp);
      syncPlaybackButtons();
      updatePlayerFavButton();

      // Render waveform
      state.episodeTimeline.guid = lastEp.guid;
      state.episodeTimeline.duration = durSec || 1800;
      state.episodeTimeline.progressPct = (durSec > 0 && curSec > 0) ? (curSec / durSec) : 0;
      setTimeout(() => {
        initOrLoadEpisodeTimeline(lastEp, durSec || 1800);
        renderWaveformChart();
      }, 50);
      setTimeout(() => {
        renderWaveformChart();
      }, 250);
    } catch (_) {}
  }

  async function loadPlaybackPositionsFromD1() {
    try {
      const headers = {};
      if (state.sessionToken) headers['X-Session-Token'] = state.sessionToken;
      const res = await fetch('/api/sync/position', { headers, credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        const remotePositions = data.positions || {};

        // Merge smartly: only let D1 overwrite if remote timestamp is newer
        const merged = { ...state.playbackPositions };
        for (const [guid, rPos] of Object.entries(remotePositions)) {
          const lPos = merged[guid];
          if (!lPos || (rPos.lastListenedAt || 0) >= (lPos.lastListenedAt || 0)) {
            merged[guid] = rPos;
          }
        }
        state.playbackPositions = merged;
        savePositionsToStorage();
      }
    } catch (e) {}
    renderContinueShelf();
    updateFilterBadges();
  }

  let _lastCloudSyncTime = 0;

  async function savePlaybackPositionToD1(episodeGuid, positionSeconds, completed = false) {
    if (!episodeGuid) return;

    // 1. Instant local storage update (instant crash-proofing, zero network)
    state.playbackPositions[episodeGuid] = {
      position: positionSeconds,
      completed: completed ? 1 : 0,
      lastListenedAt: Math.floor(Date.now() / 1000)
    };
    savePositionsToStorage();

    // 2. Only update UI DOM when screen is visible
    if (!document.hidden) {
      renderContinueShelf();
      updateFilterBadges();
    }

    if (!state.sessionToken) return;

    // 3. Throttle remote HTTP sync: only sync remote D1 once every 60s unless paused/completed
    const now = Date.now();
    if (!completed && (now - _lastCloudSyncTime < 60000)) {
      return;
    }
    _lastCloudSyncTime = now;

    try {
      const headers = { 'Content-Type': 'application/json' };
      if (state.sessionToken) headers['X-Session-Token'] = state.sessionToken;
      await fetch('/api/sync/position', {
        method: 'POST',
        headers,
        credentials: 'include',
        body: JSON.stringify({ episodeGuid, positionSeconds, completed })
      });
    } catch (_) {}
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
    const hasEpisodes = state.allEpisodes && state.allEpisodes.length > 0;

    if ((isTimelineActive || isDetailActive) && hasEpisodes) {
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
    updatePlayerStatusBadges();
    const count = (state.queue && Array.isArray(state.queue)) ? state.queue.length : 0;
    if (elements.queueBadge) {
      if (count > 0) {
        elements.queueBadge.textContent = count;
        elements.queueBadge.classList.remove('hidden');
      } else {
        elements.queueBadge.classList.add('hidden');
      }
    }

    if (elements.miniOpenQueue) {
      if (count > 0) {
        elements.miniOpenQueue.classList.remove('hidden');
      } else {
        elements.miniOpenQueue.classList.add('hidden');
      }
    }

    if (elements.miniQueueDot) {
      if (count > 0) {
        elements.miniQueueDot.classList.remove('hidden');
      } else {
        elements.miniQueueDot.classList.add('hidden');
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

  function getAutoQueueEpisodes(limit = 10) {
    if (!state.currentEpisode) return [];
    const currentGuid = state.currentEpisode.guid;
    const queuedGuids = new Set((state.queue || []).map(ep => ep.guid));
    queuedGuids.add(currentGuid);

    let candidates = [];

    // 0. Shuffle Mode: Random selection from current playback context or global pool
    if (state.isShuffle) {
      let pool = [];
      if (state.playbackContext && Array.isArray(state.playbackContext.items) && state.playbackContext.items.length > 0) {
        pool = state.playbackContext.items.filter(ep => !queuedGuids.has(ep.guid));
      } else if (state.filteredEpisodes.length > 0) {
        pool = state.filteredEpisodes.filter(ep => !queuedGuids.has(ep.guid));
      } else {
        pool = state.allEpisodes.filter(ep => !queuedGuids.has(ep.guid));
      }

      // If all unqueued items have been exhausted, fall back to any track from context except currently playing
      if (pool.length === 0) {
        const fullList = (state.playbackContext?.items?.length) ? state.playbackContext.items : state.allEpisodes;
        pool = fullList.filter(ep => ep.guid !== currentGuid);
      }

      const shuffled = [...pool];
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }
      return shuffled.slice(0, limit);
    }

    // 1. Context-specific sequential queueing
    if (state.playbackContext && Array.isArray(state.playbackContext.items) && state.playbackContext.items.length > 0) {
      const ctxItems = state.playbackContext.items;
      const curIdx = ctxItems.findIndex(e => e.guid === currentGuid);

      if (curIdx !== -1 && curIdx + 1 < ctxItems.length) {
        const after = ctxItems.slice(curIdx + 1);
        candidates.push(...after.filter(ep => !queuedGuids.has(ep.guid)));
      }
    }

    // 2. Fallback: Continue list if in continue mode
    if (candidates.length < limit && state.filterMode === 'continue') {
      const continueList = state.allEpisodes.filter(ep => {
        const pos = state.playbackPositions[ep.guid];
        return (!pos || !pos.completed) && (pos && pos.position > 2);
      });
      const idx = continueList.findIndex(e => e.guid === currentGuid);
      if (idx !== -1) {
        const after = continueList.slice(idx + 1);
        candidates.push(...after.filter(ep => !queuedGuids.has(ep.guid) && !candidates.some(c => c.guid === ep.guid)));
      }
    }

    // 3. Fallback: Filtered timeline list
    if (candidates.length < limit && state.filteredEpisodes.length > 0) {
      const idx = state.filteredEpisodes.findIndex(e => e.guid === currentGuid);
      if (idx !== -1) {
        const after = state.filteredEpisodes.slice(idx + 1);
        candidates.push(...after.filter(ep => !queuedGuids.has(ep.guid) && !candidates.some(c => c.guid === ep.guid)));
      }
    }

    // 4. Fallback: Global episodes list
    if (candidates.length < limit && state.allEpisodes.length > 0) {
      const allIdx = state.allEpisodes.findIndex(e => e.guid === currentGuid);
      if (allIdx !== -1) {
        const after = state.allEpisodes.slice(allIdx + 1);
        candidates.push(...after.filter(ep => !queuedGuids.has(ep.guid) && !candidates.some(c => c.guid === ep.guid)));
      }
    }

    return candidates.slice(0, limit);
  }


  function renderQueueModalContent() {
    if (!elements.queueNowPlayingContainer || !elements.queueItemsContainer) return;

    if (state.currentEpisode) {
      const cur = state.currentEpisode;
      elements.queueNowPlayingContainer.innerHTML = `
        <div class="queue-now-playing-card">
          <div class="queue-now-playing-label">now playing</div>
          <div class="queue-now-playing-row">
            <img class="queue-item-artwork" src="${cur.artwork || FALLBACK_ARTWORK}" alt="">
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

    const hasManualQueue = state.queue && state.queue.length > 0;
    let draggedIndex = null;
    let cachedRowRects = new Map();

    if (hasManualQueue) {
      const manualHeader = document.createElement('div');
      manualHeader.className = 'queue-section-header';
      manualHeader.innerHTML = `<span>Up Next (${state.queue.length})</span>
      <button class="btn-text-subtle" id="btn-clear-queue">clear all</button>`;
    
      elements.queueItemsContainer.appendChild(manualHeader);

      manualHeader.querySelector('#btn-clear-queue')?.addEventListener('click', clearQueue);
      
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
          <img class="queue-item-artwork" src="${ep.artwork || FALLBACK_ARTWORK}" alt="">
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
          cachedRowRects.clear();
          e.dataTransfer.effectAllowed = 'move';
          e.dataTransfer.setData('text/plain', String(idx));
          setTimeout(() => row.classList.add('is-dragging'), 0);
        });

        row.addEventListener('dragover', (e) => {
          e.preventDefault();
          e.dataTransfer.dropEffect = 'move';
          let rect = cachedRowRects.get(row);
          if (!rect) {
            rect = row.getBoundingClientRect();
            cachedRowRects.set(row, rect);
          }
          const midY = rect.top + rect.height / 2;
          const isAbove = e.clientY < midY;
          row.classList.toggle('drag-over-above', isAbove);
          row.classList.toggle('drag-over-below', !isAbove);
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
          cachedRowRects.clear();
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
            if (targetRow && targetRow !== touchCurrentRow && targetRow !== row) {
              if (touchCurrentRow) touchCurrentRow.classList.remove('drag-over-above');
              touchCurrentRow = targetRow;
              targetRow.classList.add('drag-over-above');
            }
          }, { passive: true });

          handle.addEventListener('touchend', () => {
            row.classList.remove('is-dragging');
            if (touchCurrentRow && draggedIndex !== null) {
              touchCurrentRow.classList.remove('drag-over-above');
              const toIdx = parseInt(touchCurrentRow.dataset.index, 10);
              if (!isNaN(toIdx) && toIdx !== draggedIndex) {
                const item = state.queue.splice(draggedIndex, 1)[0];
                state.queue.splice(toIdx, 0, item);
                saveQueueToStorage();
                updateQueueUI();
                renderQueueModalContent();
              }
            }
            draggedIndex = null;
            touchCurrentRow = null;
          });
        }

        row.querySelector('.btn-queue-item-play').addEventListener('click', (e) => {
          e.stopPropagation();
          removeFromQueue(ep.guid);
          playEpisode(ep, null, state.playbackContext);
        });

        row.querySelector('.btn-queue-item-remove').addEventListener('click', (e) => {
          e.stopPropagation();
          removeFromQueue(ep.guid);
        });

        elements.queueItemsContainer.appendChild(row);
      });  
    }

    if (state.autoplayEnabled) {
      const autoEpisodes = getAutoQueueEpisodes(8);

      if (autoEpisodes.length > 0) {
        const ctxLabel = state.playbackContext?.title || 'Timeline';
        const autoHeader = document.createElement('div');
        autoHeader.className = 'queue-section-header auto-queue-header';
        autoHeader.style.marginTop = hasManualQueue ? '1.25rem' : '0.25rem';
        autoHeader.innerHTML = `
          <span>Autoplay Next</span>
          <span class="queue-context-badge">${escapeHtml(ctxLabel)}</span>
        `;
        elements.queueItemsContainer.appendChild(autoHeader);

        autoEpisodes.forEach((ep) => {
          const row = document.createElement('div');
          row.className = 'queue-item-row auto-queue-row';
          row.dataset.guid = ep.guid;
          row.innerHTML = `
            <span class="queue-item-index" style="color:var(--text-muted);">↳</span>
            <img class="queue-item-artwork" src="${ep.artwork || FALLBACK_ARTWORK}" alt="">
            <div class="queue-item-info">
              <div class="queue-item-title">${escapeHtml(ep.title)}</div>
              <div class="queue-item-meta">${escapeHtml(ep.podcastTitle)}${ep.duration ? ` • ${escapeHtml(ep.duration)}` : ''}</div>
            </div>
            <div class="queue-item-actions">
              <button class="btn-queue-item-add" title="Add to Up Next Queue">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
              </button>
              <button class="btn-queue-item-play" title="Play Now">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="6 4 20 12 6 20 6 4"></polygon></svg>
              </button>
            </div>
          `;

          row.querySelector('.btn-queue-item-add').addEventListener('click', (e) => {
            e.stopPropagation();
            toggleEpisodeQueue(ep);
          });

          row.querySelector('.btn-queue-item-play').addEventListener('click', (e) => {
            e.stopPropagation();
            playEpisode(ep, null, state.playbackContext);
          });

          elements.queueItemsContainer.appendChild(row);
        });
      }
    } else if (!hasManualQueue) {
      elements.queueItemsContainer.innerHTML = `
        <div class="queue-empty-box">
          <p>Queue is empty</p>
          <span>Autoplay is paused. Toggle Autoplay in player controls to automatically stream next episodes.</span>
        </div>
      `;
    }
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
  // SECTION 11b · Favorites (Synced Starred Episodes)
  // Persisted locally under STORAGE_KEYS.FAVORITES and synced with Cloud D1
  // via /api/sync/favorites.
  // ─────────────────────────────────────────────────────────────────────────

  function loadFavoritesFromStorage() {
    try {
      const stored = localStorage.getItem(STORAGE_KEYS.FAVORITES);
      state.favorites = stored ? JSON.parse(stored) : [];
      if (!Array.isArray(state.favorites)) state.favorites = [];
      state.favoriteGuids = new Set(state.favorites.map(f => f.guid).filter(Boolean));
    } catch (e) {
      state.favorites = [];
      state.favoriteGuids = new Set();
    }
    updateFavoritesCountUI();
  }

  function saveFavoritesToStorage() {
    try {
      localStorage.setItem(STORAGE_KEYS.FAVORITES, JSON.stringify(state.favorites));
      updateFavoritesCountUI();
    } catch (e) {}
  }

  function updateFavoritesCountUI() {
    const count = (state.favorites || []).length;
    if (elements.favoritesTabCount) {
      elements.favoritesTabCount.textContent = count > 0 ? count : '';
    }
    if (elements.favoritesHeaderCount) {
      elements.favoritesHeaderCount.textContent = `${count} ${count === 1 ? 'favorite' : 'favorites'}`;
    }
  }

  function isEpisodeFavorited(guid) {
    if (!guid) return false;
    return state.favoriteGuids && state.favoriteGuids.has(guid);
  }

  async function toggleFavoriteEpisode(ep) {
    if (!ep || !ep.guid) return;
    const isFav = isEpisodeFavorited(ep.guid);
    if (isFav) {
      state.favorites = (state.favorites || []).filter(f => f.guid !== ep.guid);
      state.favoriteGuids.delete(ep.guid);
      showStatus('Removed from favorites');
    } else {
      const favObj = {
        guid: ep.guid,
        feedUrl: ep.feedUrl || '',
        title: ep.title || 'Untitled Episode',
        podcastTitle: ep.podcastTitle || '',
        artwork: ep.artwork || '',
        audioUrl: ep.audioUrl || '',
        duration: ep.duration || '',
        pubDate: ep.pubDate || ep.timestamp || '',
        description: ep.description || '',
        addedAt: Date.now()
      };
      state.favorites = [favObj, ...(state.favorites || []).filter(f => f.guid !== ep.guid)];
      state.favoriteGuids.add(ep.guid);
      showStatus('Added to favorites');
    }

    saveFavoritesToStorage();
    updateEpisodeCardFavoriteState(ep.guid);
    updatePlayerFavButton();

    const activeTab = document.querySelector('.nav-tab.active')?.dataset.tab;
    if (activeTab === 'favorites') {
      renderFavorites();
    }

    syncFavoriteToD1(ep, !isFav);
  }

  function updateEpisodeCardFavoriteState(guid) {
    if (!guid) return;
    const isFav = isEpisodeFavorited(guid);
    document.querySelectorAll(`.episode-card[data-guid="${CSS.escape(guid)}"] .btn-fav-ep`).forEach(btn => {
      btn.classList.toggle('is-favorited', isFav);
      btn.innerHTML = isFav ? CARD_ICONS.HEART_FILLED : CARD_ICONS.HEART;
      btn.title = isFav ? 'Remove from favorites' : 'Add to favorites';
    });
  }

  function updatePlayerStatusBadges() {
    const current = state.currentEpisode;
    const isDownloaded = current && !!state.downloadedEpisodes[current.guid];
    const isFav = current && isEpisodeFavorited(current.guid);
    const isQueued = current && isEpisodeQueued(current.guid);

    const badgeContainers = [
      elements.playerStatusBadges || document.getElementById('player-status-badges'),
      elements.miniStatusBadges || document.getElementById('mini-status-badges')
    ];

    badgeContainers.forEach(container => {
      if (!container) return;
      const dlEl = container.querySelector('.badge-downloaded');
      const favEl = container.querySelector('.badge-fav');
      const queueEl = container.querySelector('.badge-queue');

      if (dlEl) dlEl.classList.toggle('hidden', !isDownloaded);
      if (favEl) favEl.classList.toggle('hidden', !isFav);
      if (queueEl) {
        if (container.id === 'mini-status-badges' || container.classList.contains('mini-status-badges')) {
          queueEl.classList.add('hidden');
        } else {
          queueEl.classList.toggle('hidden', !isQueued);
        }
      }
    });
  }

  function updatePlayerFavButton() {
    if (!elements.btnPlayerFav) return;
    const current = state.currentEpisode;
    if (!current) {
      elements.btnPlayerFav.classList.remove('is-favorited');
      updatePlayerStatusBadges();
      return;
    }
    const isFav = isEpisodeFavorited(current.guid);
    elements.btnPlayerFav.classList.toggle('is-favorited', isFav);
    elements.btnPlayerFav.title = isFav ? 'Remove from favorites' : 'Add to favorites';
    updatePlayerStatusBadges();
  }

  function showToast(message, duration = 2500) {
    let toast = document.getElementById('app-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'app-toast';
      toast.className = 'app-toast';
      document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(toast._timeout);
    toast._timeout = setTimeout(() => {
      toast.classList.remove('show');
    }, duration);
  }

  async function shareContent({ title, text, url }) {
    // 1. ALWAYS copy URL directly to clipboard first so the user has it immediately
    let copied = false;
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(url);
        copied = true;
        showToast('Link copied to clipboard');
      }
    } catch (_) {}

    // 2. On mobile / Web Share supporting devices, also open native OS share sheet (AirDrop, Messages, WhatsApp, etc.)
    if (navigator.share) {
      try {
        await navigator.share({
          title: title || 'Anypod',
          text: text || '',
          url: url || window.location.href
        });
        return;
      } catch (err) {
        if (err.name === 'AbortError') return;
      }
    }

    // 3. Fallback prompt if clipboard was blocked
    if (!copied) {
      try {
        window.prompt('Copy link:', url);
      } catch (_) {}
    }
  }

  function shareCurrentEpisode() {
    const ep = state.currentEpisode;
    if (!ep) {
      showToast('No active episode to share');
      return;
    }
    shareEpisode(ep);
  }

  function shareEpisode(ep) {
    if (!ep) return;
    const shareUrl = ep.feedUrl
      ? `${window.location.origin}/?feed=${encodeURIComponent(ep.feedUrl)}&guid=${encodeURIComponent(ep.guid || '')}#feed=${encodeURIComponent(ep.feedUrl)}`
      : (ep.audioUrl || window.location.href);
    shareContent({
      title: ep.title || 'Episode',
      text: `Listen to "${ep.title}" from ${ep.podcastTitle || 'Podcast'} on Anypod`,
      url: shareUrl
    });
  }

  function shareFeed(feedUrl, title) {
    if (!feedUrl) return;
    const shareUrl = `${window.location.origin}/?feed=${encodeURIComponent(feedUrl)}#feed=${encodeURIComponent(feedUrl)}`;
    shareContent({
      title: title || 'Podcast',
      text: `Listen to ${title || 'this podcast'} on Anypod`,
      url: shareUrl
    });
  }

  async function syncFavoritesWithD1() {
    try {
      const headers = {};
      if (state.sessionToken) headers['X-Session-Token'] = state.sessionToken;
      const res = await fetch('/api/sync/favorites', { headers, credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        const remoteFavs = data.favorites || [];
        const map = new Map();
        (state.favorites || []).forEach(f => map.set(f.guid, f));
        remoteFavs.forEach(rf => {
          if (!map.has(rf.guid)) {
            map.set(rf.guid, rf);
          } else {
            map.set(rf.guid, { ...map.get(rf.guid), ...rf });
          }
        });
        state.favorites = Array.from(map.values()).sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0));
        state.favoriteGuids = new Set(state.favorites.map(f => f.guid).filter(Boolean));
        saveFavoritesToStorage();
        updateFavoritesCountUI();
        if (document.querySelector('.nav-tab.active')?.dataset.tab === 'favorites') {
          renderFavorites();
        }
      }
    } catch (e) {}
  }

  async function syncFavoriteToD1(ep, isFavorite) {
    try {
      const headers = { 'Content-Type': 'application/json' };
      if (state.sessionToken) headers['X-Session-Token'] = state.sessionToken;
      await fetch('/api/sync/favorites', {
        method: 'POST',
        headers,
        credentials: 'include',
        body: JSON.stringify({
          episodeGuid: ep.guid,
          feedUrl: ep.feedUrl || '',
          title: ep.title || '',
          podcastTitle: ep.podcastTitle || '',
          artwork: ep.artwork || '',
          audioUrl: ep.audioUrl || '',
          duration: ep.duration || '',
          pubDate: ep.pubDate || ep.timestamp || '',
          isFavorite
        })
      });
    } catch (e) {}
  }

  function renderFavorites() {
    if (!elements.favoritesEpisodesList) return;
    if (!state.feeds || state.feeds.length === 0) {
      navigateTo('discover');
      return;
    }
    let list = [...(state.favorites || [])];
    const q = (state.searchQuery || '').trim().toLowerCase();
    if (q) {
      const terms = q.split(/\s+/).filter(Boolean);
      list = list.filter(item => {
        const title = (item.title || '').toLowerCase();
        const podTitle = (item.podcastTitle || '').toLowerCase();
        const fullDesc = (item.content || item.description || '').toLowerCase();
        return terms.every(term => title.includes(term) || podTitle.includes(term) || fullDesc.includes(term));
      });
    }

    elements.favoritesEpisodesList.innerHTML = '';

    if (list.length === 0) {
      elements.favoritesEpisodesList.innerHTML = q
        ? `<div class="empty-state" style="grid-column: 1 / -1; padding: 2.5rem 1rem; text-align: center;"><p style="color: var(--text-muted); font-size: 0.9rem;">No favorite episodes match "${escapeHtml(state.searchQuery)}".</p></div>`
        : `<div class="empty-state" style="grid-column: 1 / -1; padding: 2.5rem 1rem; text-align: center;"><p style="color: var(--text-muted); font-size: 0.9rem;">No favorite episodes yet. Click the heart icon on any episode to save it here.</p></div>`;
      return;
    }

    const favContext = {
      type: 'favorites',
      id: 'favorites',
      title: 'Favorites',
      items: list
    };

    const frag = document.createDocumentFragment();
    list.forEach(item => {
      const matched = (state.allEpisodes || []).find(e => e.guid === item.guid);
      const ep = matched ? { ...matched, ...item } : { ...item };
      const card = createEpisodeCard(ep, favContext);
      frag.appendChild(card);
    });
    elements.favoritesEpisodesList.appendChild(frag);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // SECTION 12 · Downloads (Offline Listening)
  // Episodes are cached in the Cache API under 'anypod-audio-v1'.
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
    updatePlayerStatusBadges();
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
      const terms = q.split(/\s+/).filter(Boolean);
      list = list.filter(item => {
        const title = (item.title || '').toLowerCase();
        const podTitle = (item.podcastTitle || '').toLowerCase();
        const fullDesc = (item.content || item.description || '').toLowerCase();
        return terms.every(term => title.includes(term) || podTitle.includes(term) || fullDesc.includes(term));
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

  function notifyServiceWorkerAudioCache() {
    if (navigator.serviceWorker && navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage({ type: 'SYNC_AUDIO_CACHE' });
    }
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
        const audioCache = await caches.open('anypod-audio-v1');
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
        notifyServiceWorkerAudioCache();
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
        const audioCache = await caches.open('anypod-audio-v1');
        await audioCache.delete(ep.audioUrl);
        notifyServiceWorkerAudioCache();
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
        await caches.delete('anypod-audio-v1');
        notifyServiceWorkerAudioCache();
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
      //renderTimeline();
      renderTimeline(true);
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

      // Retry up to 3 times with exponential backoff if Cloudflare returns 503/524/429
      let retryCount = 0;
      while ((response.status === 503 || response.status === 524 || response.status === 429) && retryCount < 3) {
        retryCount++;
        const backoffMs = Math.min(1000 * Math.pow(2, retryCount), 6000);
        console.warn(`[Feed Fetch] Got HTTP ${response.status} for ${url}, retrying in ${backoffMs}ms (attempt ${retryCount}/3)...`);
        await new Promise(r => setTimeout(r, backoffMs));
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

      // Trigger progressive background pagination for YouTube playlists
      if (feedData.isYouTubePlaylist && feedData.playlistId) {
        startYouTubeBackgroundPaging(feedData.playlistId, url, feedData.nextToken || null);
      }

      updatedMetadata[url] = {
        title: feedData.title,
        artwork: feedData.artwork,
        episodesCount: feedData.episodesCount,
        description: feedData.description,
        isYouTubePlaylist: feedData.isYouTubePlaylist || false,
        playlistId: feedData.playlistId || null,
        nextToken: feedData.nextToken || null
      };

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
    if (typeof durationStr === 'number') return (isFinite(durationStr) && durationStr > 0) ? durationStr : 0;
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

      // 1. Try first-party API proxy (bypasses client ad-blockers)
      try {
        const proxyRes = await fetch(`/api/search-directory?term=${encodeURIComponent(q)}${countryParam}&limit=50`);
        if (proxyRes.ok) {
          data = await proxyRes.json();
        }
      } catch (_) {}

      // 2. Fallback to direct browser fetch if proxy failed, was rate-limited, or returned 0 results
      if (!data || !data.results || data.results.length === 0 || data.rateLimited) {
        try {
          const directUrl = `https://itunes.apple.com/search?term=${encodeURIComponent(q)}&entity=podcast${countryParam}&limit=50`;
          const directRes = await fetch(directUrl);
          if (directRes.ok) {
            data = await directRes.json();
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
  }

  function setDirectoryCountry(code) {
    state.directoryCountry = code || 'all';
    document.querySelectorAll('.region-chip').forEach(c => {
      c.classList.toggle('active', c.dataset.region === state.directoryCountry);
    });
  }

  function renderDiscover() {
    const container = document.getElementById('discover-content-container');
    if (!container) return;

    const hasFeeds = state.feeds && state.feeds.length > 0;

    container.innerHTML = `
      <div class="discover-view-wrap">
        ${!hasFeeds ? `
          <div class="welcome-onboard-banner" style="background: var(--bg-card); border: 1px solid var(--border-light); border-radius: 12px; padding: 1.75rem; margin-bottom: 1.75rem; text-align: center; box-shadow: 0 4px 12px rgba(0,0,0,0.03);">
            <h3 style="font-size: 1.25rem; font-weight: 600; margin-bottom: 0.5rem; color: var(--text-primary);">welcome to anypod</h3>
            <p style="color: var(--text-muted); font-size: 0.92rem; line-height: 1.5; max-width: 600px; margin: 0 auto;">
              no podcasts added yet. no extra ads, no tracking, no noise — zero clutter means total audio freedom. explore our curated science &amp; climate shows below or search to add your first subscription!
            </p>
          </div>
        ` : ''}

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

        <!-- Curated 50 Worldwide Shows -->
        ${buildStarterSuggestionsHTML('all')}

        <!-- OPML import helper footer -->
        <div class="discover-opml-footer">
          <button class="btn btn-secondary btn-sm" id="btn-empty-opml-trigger">import opml file</button>
        </div>
      </div>
    `;

    wireEmptyStateEvents(container);
  }

  let emptySearchDebounceTimer = null;

  function wireEmptyStateEvents(targetRoot = document) {
    const quickForm = targetRoot.querySelector('#empty-quick-form');
    const quickInput = targetRoot.querySelector('#empty-quick-input');
    const quickSubmit = targetRoot.querySelector('#btn-empty-quick-submit');
    const quickResults = targetRoot.querySelector('#empty-quick-results');

    if (quickInput && quickForm) {
      quickInput.addEventListener('input', () => {
        const val = quickInput.value.trim();
        if (quickSubmit) {
          quickSubmit.textContent = (val.startsWith('http://') || val.startsWith('https://')) ? 'Add Feed' : 'Search';
        }
        if (emptySearchDebounceTimer) clearTimeout(emptySearchDebounceTimer);
        if (!val || val.length < 3 || val.startsWith('http://') || val.startsWith('https://')) {
          if (quickResults) quickResults.innerHTML = '';
          return;
        }
        emptySearchDebounceTimer = setTimeout(() => {
          if (quickResults) searchPodcastDirectory(val, quickResults);
        }, 650);
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
          if (quickResults) searchPodcastDirectory(val, quickResults);
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

  // ─────────────────────────────────────────────────────────────────────────
  // SECTION 18 · Timeline Rendering
  // renderTimeline — main episode list (handles empty/onboarding state).
  // appendTimelineBatch / setupSentinelObserver — infinite scroll via
  // IntersectionObserver; loads 30 cards at a time.
  // wireEmptyStateEvents — wires up the onboarding empty state UI.
  // ─────────────────────────────────────────────────────────────────────────

  function renderTimeline(preserveScroll = false) {
    // console.log('[Anypod Debug] renderTimeline called. preserveScroll:', preserveScroll, {
    //   scrollTopBeforeRender: elements.timelineList?.scrollTop,
    //   stack: new Error().stack.split('\n')[2] // Shows what triggered the render!
    // });

    updateDockVisibility();
    const container = elements.timelineList;
    if (!container) return;

    if (preserveScroll && state.timelinePage > 1) {
      const prevScroll = container.scrollTop;
      const existingSentinel = document.getElementById('timeline-sentinel');
      if (existingSentinel) existingSentinel.remove();
      container.innerHTML = '';

      const total = state.timelinePage * state.pageSize;
      const batch = state.filteredEpisodes.slice(0, total);
      const frag = document.createDocumentFragment();
      batch.forEach(ep => frag.appendChild(createEpisodeCard(ep)));
      container.appendChild(frag);

      if (total < state.filteredEpisodes.length) {
        const sentinel = document.createElement('div');
        sentinel.id = 'timeline-sentinel';
        sentinel.className = 'timeline-sentinel';
        container.appendChild(sentinel);
        setupSentinelObserver(sentinel);
      }
      container.scrollTop = prevScroll;
      return;
    }

    if (state.feeds.length === 0) {
      navigateTo('discover');
      return;
    }

    container.innerHTML = '';

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

  function appendTimelineBatch() {
    const container = elements.timelineList;
    if (!container) return;

    const existingSentinel = document.getElementById('timeline-sentinel');
    if (existingSentinel) existingSentinel.remove();

    const start = (state.timelinePage - 1) * state.pageSize;
    const end = state.timelinePage * state.pageSize;
    const batch = state.filteredEpisodes.slice(start, end);

    const timelineContext = {
      type: state.searchQuery ? 'search' : state.filterMode,
      id: state.searchQuery || state.filterMode,
      title: state.searchQuery ? `Search: "${state.searchQuery}"` : (state.filterMode === 'continue' ? 'Continue Listening' : 'Timeline'),
      items: state.filteredEpisodes
    };

    const frag = document.createDocumentFragment();
    batch.forEach(ep => {
      frag.appendChild(createEpisodeCard(ep, timelineContext));
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

  let sentinelObserver = null;

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

  /**
   * Render an inline "Audio Analysis" section at the bottom of the show-notes
   * content pane. Called every time openShowNotes() populates the notes tab.
   *
   * Shows:
   *  - Segment chapter pills (only when a real analysis source exists)
   *  - Live-transcript cues inline (if any)
   *  - A nudge/link to Settings when the classifier/transcript is not enabled
   */
  function _renderInlineAnalysisSection(container) {
    if (!container) return;
    // Remove previous section if present
    const prev = container.querySelector('.notes-analysis-section');
    if (prev) prev.remove();

    const segments  = state.episodeTimeline.segments || [];
    const cues      = state.episodeTimeline.cues || [];
    const src       = state.episodeTimeline.transcriptSource || '';
    const hasReal   = segments.length > 0 && !!src;
    const hasCues   = cues.length > 0;
    const isClassOn = !!state.experimentalSettings.enableAudioClassifier;
    const isLiveOn  = !!state.experimentalSettings.enableLiveTranscript;

    // Nothing to show and features are enabled (will populate once analysis runs)
    if (!hasReal && !hasCues && isClassOn) return;

    const section = document.createElement('div');
    section.className = 'notes-analysis-section';

    let innerHtml = '';

    if (hasReal || hasCues) {
      // ── Header pill ─────────────────────────────────────────────────────
      const sourcePillText = hasCues ? (src || 'live') : (src || 'probe');
      innerHtml += `
        <div class="analysis-header">
          <span>🔬 Audio Analysis</span>
          <span class="source-pill">${escapeHtml(sourcePillText)}</span>
        </div>
      `;

      // ── Segment chapter pills (only when real analysis) ─────────────────
      if (hasReal) {
        innerHtml += `<div class="transcript-segment-pills" style="justify-content:flex-start;">
          ${segments.slice(0, 20).map(s => `
            <button type="button" class="segment-jump-pill ${s.type === 'music' ? 'is-music' : 'is-speech'}" data-seconds="${s.start}">
              ${s.type === 'music' ? '🎵' : '🎙️'} ${formatTime(s.start)}
            </button>
          `).join('')}
        </div>`;
      }

      // ── Live cues preview (last 3, scrolls into transcript tab for full) ──
      if (hasCues) {
        const preview = cues.slice(-3);
        innerHtml += `
          <div style="margin-top:0.75rem; font-size:0.82rem; color:var(--text-secondary);">
            <strong style="color:var(--text-primary);">🎙 Live transcript</strong>
            ${preview.map(c => `<p style="margin:0.3rem 0 0; color:var(--text-primary);">"${escapeHtml(c.text)}"</p>`).join('')}
            ${cues.length > 3 ? `<button type="button" class="inline-link notes-open-transcript">see all ${cues.length} lines →</button>` : ''}
          </div>
        `;
      }
    } else {
      // Features are disabled — show a friendly nudge
      innerHtml += `
        <div class="notes-enable-hint">
          <strong>🔬 Audio Analysis not active</strong><br>
          <button type="button" class="inline-link" id="inline-goto-settings">Enable Audio Classifier or Live Transcript in Experimental Settings →</button>
        </div>
      `;
    }

    section.innerHTML = innerHtml;
    container.appendChild(section);

    // Wire segment-jump clicks
    section.querySelectorAll('.segment-jump-pill').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const sec = parseFloat(btn.dataset.seconds);
        if (!isNaN(sec)) {
          seekToExactTime(sec);
          if (state.playbackStatus !== 'playing') resumeCurrentEngine();
        }
      });
    });

    // Wire "see all" → switch to transcript tab
    const seeAllBtn = section.querySelector('.notes-open-transcript');
    if (seeAllBtn) {
      seeAllBtn.addEventListener('click', () => switchShowNotesTab('transcript'));
    }

    // Wire settings deeplink
    const settingsBtn = section.querySelector('#inline-goto-settings');
    if (settingsBtn) {
      settingsBtn.addEventListener('click', (e) => {
        e.preventDefault();
        closeShowNotes();
        const settingsTab = document.getElementById('tab-settings');
        if (settingsTab) settingsTab.click();
      });
    }
  }

  function switchShowNotesTab(tab) {
    const isNotes = tab === 'notes';
    if (elements.tabBtnNotes) elements.tabBtnNotes.classList.toggle('active', isNotes);
    if (elements.tabBtnTranscript) elements.tabBtnTranscript.classList.toggle('active', !isNotes);
    if (elements.showNotesContent) elements.showNotesContent.classList.toggle('hidden', !isNotes);
    if (elements.showTranscriptContent) elements.showTranscriptContent.classList.toggle('hidden', isNotes);

    if (!isNotes) {
      renderTranscriptView();
    }
  }

  function renderTranscriptView(filterText = '') {
    const cuesList = elements.transcriptCuesList;
    if (!cuesList) return;

    const cues = state.episodeTimeline.cues || [];
    const source = state.episodeTimeline.transcriptSource || (cues.length > 0 ? 'RSS' : '');

    if (elements.transcriptSourcePill) {
      if (source) {
        elements.transcriptSourcePill.textContent = source.toUpperCase();
        elements.transcriptSourcePill.classList.remove('hidden');
      } else {
        elements.transcriptSourcePill.classList.add('hidden');
      }
    }

    if (cues.length === 0) {
      const segments = state.episodeTimeline.segments || [];
      const hasRealAnalysis = segments.length > 0 && !!state.episodeTimeline.transcriptSource;
      const speechSegs = segments.filter(s => s.type === 'speech');
      const musicSegs  = segments.filter(s => s.type === 'music');

      const isLiveAvailable = !!(window.SpeechRecognition || window.webkitSpeechRecognition);
      const isLiveEnabled   = !!state.experimentalSettings.enableLiveTranscript;
      const isClassifierEnabled = !!state.experimentalSettings.enableAudioClassifier;

      // Segment pills — only visible when we have a real analysis (RSS, probe, community)
      const pillsHtml = hasRealAnalysis ? `
        <div class="transcript-segment-pills">
          ${segments.slice(0, 16).map(s => `
            <button type="button" class="segment-jump-pill ${s.type === 'music' ? 'is-music' : 'is-speech'}" data-seconds="${s.start}">
              <span>${s.type === 'music' ? '🎵 Music' : '🎙️ Talk'} · ${formatTime(s.start)}</span>
            </button>
          `).join('')}
        </div>
      ` : '';

      // Live transcription status box
      const liveHtml = isLiveAvailable ? `
        <div style="margin: 1rem 0; padding: 0.75rem 1rem; background: var(--bg-surface); border: 1px solid var(--border-light); border-radius: var(--radius-sm); font-size: 0.85rem;">
          ${isLiveEnabled
            ? `<strong>🎙 Live transcription is on</strong> — text appears here as you listen.`
            : `<strong>💡 Live Transcription available!</strong>
               <button type="button" class="inline-link" id="transcript-goto-settings">Enable it in Experimental Settings →</button>`
          }
        </div>
      ` : '';

      // Summary line
      let summaryHtml = '';
      if (hasRealAnalysis) {
        const src = state.episodeTimeline.transcriptSource;
        summaryHtml = `<p>Anypod's FFT classifier detected <strong>${speechSegs.length} speech</strong> and <strong>${musicSegs.length} music</strong> sections.<br><small style="color:var(--text-secondary)">source: ${escapeHtml(src)}</small></p>`;
      } else if (isClassifierEnabled) {
        summaryHtml = `<p>The audio classifier is active — open this episode to start analysis.</p>`;
      } else {
        summaryHtml = `<p>No transcript available. <button type="button" class="inline-link" id="transcript-goto-settings">Enable Audio Classifier in Experimental Settings</button> to detect speech and music sections.</p>`;
      }

      cuesList.innerHTML = `
        <div class="transcript-empty-state">
          <div style="font-size: 2.2rem; margin-bottom: 0.75rem;">🎙️</div>
          <h4>No Official Text Transcript in RSS</h4>
          ${summaryHtml}
          ${liveHtml}
          ${pillsHtml}
        </div>
      `;

      // Segment-jump clicks
      cuesList.querySelectorAll('.segment-jump-pill').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.preventDefault();
          const sec = parseFloat(btn.dataset.seconds);
          if (!isNaN(sec)) {
            seekToExactTime(sec);
            if (state.playbackStatus !== 'playing') resumeCurrentEngine();
          }
        });
      });

      // Settings deeplink
      const gotoSettingsBtn = cuesList.querySelector('#transcript-goto-settings');
      if (gotoSettingsBtn) {
        gotoSettingsBtn.addEventListener('click', (e) => {
          e.preventDefault();
          closeShowNotes();
          // Switch to settings tab
          const settingsTab = document.getElementById('tab-settings');
          if (settingsTab) settingsTab.click();
        });
      }
      return;
    }


    const query = (filterText || '').toLowerCase().trim();
    const filteredCues = query
      ? cues.filter(c => c.text && c.text.toLowerCase().includes(query))
      : cues;

    if (filteredCues.length === 0) {
      cuesList.innerHTML = `
        <div class="transcript-empty-state">
          <p>No lines matching "<strong>${escapeHtml(filterText)}</strong>"</p>
        </div>
      `;
      return;
    }

    let currentSec = 0;
    if (state.activeEngine === 'audio' && elements.audio) {
      currentSec = elements.audio.currentTime || 0;
    } else if (state.activeEngine === 'youtube' && state.ytPlayer && state.ytPlayer.getCurrentTime) {
      currentSec = state.ytPlayer.getCurrentTime() || 0;
    }

    cuesList.innerHTML = filteredCues.map((c, idx) => {
      const isActive = currentSec >= c.start && currentSec <= c.end;
      let textHtml = escapeHtml(c.text || '');
      if (query) {
        const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
        textHtml = textHtml.replace(regex, '<mark>$1</mark>');
      }

      return `
        <div class="transcript-cue ${isActive ? 'is-active' : ''}" data-start="${c.start}" data-end="${c.end}" id="transcript-cue-${idx}">
          <button type="button" class="transcript-cue-time" data-seconds="${c.start}" title="Jump to ${formatTime(c.start)}">
            ${formatTime(c.start)}
          </button>
          <div class="transcript-cue-text">${textHtml}</div>
        </div>
      `;
    }).join('');

    cuesList.querySelectorAll('.transcript-cue-time').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const sec = parseFloat(btn.dataset.seconds);
        if (!isNaN(sec)) {
          seekToExactTime(sec);
          if (state.playbackStatus !== 'playing') resumeCurrentEngine();
        }
      });
    });
  }

  function openShowNotes(targetEp, defaultTab = 'notes') {
    const ep = targetEp || state.currentEpisode;
    if (!ep || !elements.showNotesModal) return;

    state.activeNotesEpisode = ep;

    // 1. Artwork
    if (elements.showNotesArtwork || elements.showNotesArt) {
      const artEl = elements.showNotesArtwork || elements.showNotesArt;
      artEl.src = ep.artwork || FALLBACK_ARTWORK;
      artEl.onerror = () => {
        artEl.onerror = null;
        artEl.src = FALLBACK_ARTWORK;
      };
    }

    // 2. Clickable Podcast Feed Name (larger & links to full show detail)
    if (elements.showNotesPodcastTitle) {
      elements.showNotesPodcastTitle.innerHTML = `
        <span>${escapeHtml(ep.podcastTitle || 'Podcast')}</span>
        <span class="podcast-link-arrow">→</span>
      `;
      elements.showNotesPodcastTitle.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        closeShowNotes();
        if (ep.feedUrl) {
          openFeedDetail(ep.feedUrl);
        }
      };
    }

    // 3. Episode Title
    if (elements.showNotesEpisodeTitle) {
      elements.showNotesEpisodeTitle.textContent = ep.title || 'Untitled Episode';
    }

    // 4. Centered Rich Meta: Relative Date • Exact Date • Duration • Resume info
    if (elements.showNotesMeta) {
      const dateInput = ep.timestamp || ep.pubDate;
      const relDate = dateInput ? formatHumanRelativeDate(dateInput) : '';
      const fullDate = dateInput ? new Date(dateInput).toLocaleDateString(undefined, { 
        month: 'short', 
        day: 'numeric', 
        year: 'numeric' 
      }) : '';
      const dur = ep.duration ? formatEpisodeDuration(ep.duration) : '';
      
      const savedPos = state.playbackPositions[ep.guid];
      const hasProgress = savedPos && !savedPos.completed && savedPos.position > 2;
      const resumeStr = hasProgress ? `resumes at ${formatTime(savedPos.position)}` : '';

      const parts = [
        relDate ? `<span class="meta-rel-date">${escapeHtml(relDate)}</span>` : '',
        fullDate ? `<span class="meta-full-date">${escapeHtml(fullDate)}</span>` : '',
        dur ? `<span class="meta-dur">${escapeHtml(dur)}</span>` : '',
        resumeStr ? `<span class="meta-resume" style="color: var(--primary, #f97316);">${escapeHtml(resumeStr)}</span>` : ''
      ].filter(Boolean);

      elements.showNotesMeta.innerHTML = parts.join('<span class="meta-sep">•</span>');
    }

    // 5. Notes Content
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
            if (state.playbackStatus !== 'playing') resumeCurrentEngine();
          } else {
            playEpisode(ep);
            setTimeout(() => seekToExactTime(sec), 300);
          }
        });
      });

      // Inject inline analysis section at the bottom of the notes tab
      _renderInlineAnalysisSection(elements.showNotesContent);
    }


    // Wire main popup Play button
    if (elements.btnNotesPlay) {
      syncShowNotesPlayButton(ep);
      elements.btnNotesPlay.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        toggleEpisodePlayback(ep);
        syncShowNotesPlayButton(ep);
      };
    }

    switchShowNotesTab(defaultTab);
    elements.showNotesModal.classList.remove('hidden');
    window.history.pushState({ modal: 'showNotes' }, '', window.location.hash);
  }

  function closeShowNotes() {
    state.activeNotesEpisode = null;

    if (window.history.state && window.history.state.modal) {
      window.history.back();
    } else if (elements.showNotesModal) {
      elements.showNotesModal.classList.add('hidden');
    }
  }

  function setupProgressTrackInteractivity(progressTrack, card, ep, context = null) {
    if (!progressTrack) return;
    let isDragging = false;
    let trackRect = null;

    const handleScrub = (clientX, commit) => {
      if (!trackRect) trackRect = progressTrack.getBoundingClientRect();
      if (trackRect.width <= 0) return;
      const ratio = Math.max(0, Math.min(1, (clientX - trackRect.left) / trackRect.width));
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
            playEpisode(ep, targetTime, context);
          }
        }
      } else if (commit) {
        if (!state.currentEpisode || state.currentEpisode.guid !== ep.guid) {
          playEpisode(ep, null, context);
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
      trackRect = progressTrack.getBoundingClientRect();
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
      trackRect = null;
    });

    progressTrack.addEventListener('pointercancel', (e) => {
      if (!isDragging) return;
      isDragging = false;
      trackRect = null;
      try { progressTrack.releasePointerCapture(e.pointerId); } catch (_) {}
    });

    progressTrack.addEventListener('click', (e) => {
      e.stopPropagation();
    });
  }

  function createEpisodeCard(ep, context = null) {
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

    const isFav = isEpisodeFavorited(ep.guid);
    const favBtnHtml = `
      <button class="btn-fav-ep ${isFav ? 'is-favorited' : ''}" title="${isFav ? 'Remove from favorites' : 'Add to favorites'}">
        ${isFav ? CARD_ICONS.HEART_FILLED : CARD_ICONS.HEART}
      </button>
    `;

    const downloadBtnHtml = ep.isYouTube ? '' : `
      <button class="btn-download-ep ${isDownloaded ? 'is-downloaded' : ''} ${isDownloading ? 'is-downloading' : ''}" title="${dlTitle}">
        ${dlIcon}
      </button>
    `;

    card.innerHTML = `
      <div class="episode-card-top">
        <img class="episode-artwork" src="${ep.artwork || FALLBACK_ARTWORK}" alt="" loading="lazy" width="52" height="52">
        <div class="episode-header-info">
          <div class="episode-podcast-name">${ep.isYouTube ? 'YouTube' : highlightText(ep.podcastTitle, state.searchQuery)}</div>
          <div class="episode-title">${highlightText(ep.title, state.searchQuery)}</div>
        </div>
      </div>
      ${(ep.description || ep.content) ? `<div class="episode-desc">${formatHighlightedDesc(ep.content || ep.description, state.searchQuery)} <span class="episode-desc-link">Notes & links →</span></div>` : ''}
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
          ${favBtnHtml}
          ${downloadBtnHtml}
          <button class="btn-transcript-ep" title="View Transcript" style="${state.experimentalSettings.enableTranscript === false ? 'display:none;' : ''}">
            ${CARD_ICONS.TRANSCRIPT}
          </button>
          <button class="btn-queue-ep ${isQueued ? 'is-queued' : ''}" title="${isQueued ? 'Remove from Up Next' : 'Add to Up Next'}">
            ${isQueued ? CARD_ICONS.QUEUE_ADDED : CARD_ICONS.QUEUE}
          </button>
          <button class="btn-share-ep" title="Share Episode">
            ${CARD_ICONS.SHARE}
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

    const favBtn = card.querySelector('.btn-fav-ep');
    if (favBtn) {
      favBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleFavoriteEpisode(ep);
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

    const transcriptBtn = card.querySelector('.btn-transcript-ep');
    if (transcriptBtn) {
      transcriptBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        openShowNotes(ep, 'transcript');
      });
    }

    card.querySelector('.btn-play-ep').addEventListener('click', (e) => {
      e.stopPropagation();
      toggleEpisodePlayback(ep, context);
    });

    card.querySelector('.btn-queue-ep').addEventListener('click', (e) => {
      e.stopPropagation();
      toggleEpisodeQueue(ep);
    });

    const shareBtn = card.querySelector('.btn-share-ep');
    if (shareBtn) {
      shareBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        shareEpisode(ep);
      });
    }

    card.querySelector('.btn-mark-played').addEventListener('click', (e) => {
      e.stopPropagation();
      toggleMarkPlayed(ep);
    });

    const progressTrack = card.querySelector('.ep-progress-track');
    if (progressTrack) {
      setupProgressTrackInteractivity(progressTrack, card, ep, context);
    }

    const resumeBadge = card.querySelector('.ep-resume-time');
    if (resumeBadge) {
      resumeBadge.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleEpisodePlayback(ep, context);
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
        if (!val || val.length < 3 || val.startsWith('http://') || val.startsWith('https://')) {
          if (quickResults) quickResults.innerHTML = '';
          return;
        }
        feedsSearchDebounceTimer = setTimeout(() => {
          if (quickResults) {
            searchPodcastDirectory(val, quickResults);
          }
        }, 650);
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

    const catChips = document.querySelectorAll('#feeds-empty-category-chips .category-chip');
    catChips.forEach(chip => {
      chip.addEventListener('click', () => {
        const cat = chip.dataset.category;
        if (quickInput) quickInput.value = cat;
        if (quickResults) searchPodcastDirectory(cat, quickResults);
      });
    });

    document.getElementById('btn-feeds-empty-open-add')?.addEventListener('click', () => {
      openAddModal();
    });
    document.getElementById('btn-feeds-empty-opml')?.addEventListener('click', () => {
      elements.opmlFileInput?.click();
    });
    document.getElementById('btn-feeds-empty-defaults')?.addEventListener('click', () => {
      elements.btnLoadDefaults?.click();
    });

    wireStarterSuggestionsEvents(elements.feedsGrid);
  }

  const FEED_CATEGORIES = [
    { id: 'all', label: 'all podcasts', match: () => true },
    { id: 'audio', label: 'audio', match: (url) => !url.includes('youtube.com') && !url.includes('youtu.be') },
    { id: 'video', label: 'video / youtube', match: (url) => url.includes('youtube.com') || url.includes('youtu.be') },
    { id: 'news', label: 'news', match: (url, meta) => /news|nachrichten|politik|zeit|hintergrund|berichte|report|tagesschau|bbc|spiegel|echo/i.test(((meta.title || '') + ' ' + (meta.description || ''))) },
    { id: 'science', label: 'science', match: (url, meta) => /science|forschung|wissen|spektrum|nature|nasa|physik|biology|climate|klima|space|planet/i.test(((meta.title || '') + ' ' + (meta.description || ''))) },
    { id: 'doc', label: 'docs', match: (url, meta) => /doc|doku|story|geschichten|history|investigative|feature|crime|leben/i.test(((meta.title || '') + ' ' + (meta.description || ''))) },
    { id: 'music', label: 'music', match: (url, meta) => /music|techno|dj|sound|mix|beats|song|dance/i.test(((meta.title || '') + ' ' + (meta.description || ''))) },
    { id: 'tech', label: 'tech & ai', match: (url, meta) => /tech|technology|software|ai|computer|digital|code|gadget/i.test(((meta.title || '') + ' ' + (meta.description || ''))) }
  ];

  function renderFeedsFilterChips() {
    if (!elements.feedsFilterChips) return;
    const active = state.feedFilter || 'all';

    // Compute counts for each category based on current saved feeds
    const visibleChips = FEED_CATEGORIES.map(cat => {
      const count = state.feeds.filter(url => {
        const meta = state.feedMetadata[url] || {};
        return cat.match(url, meta);
      }).length;
      return { ...cat, count };
    }).filter(c => c.id === 'all' || c.count > 0);

    elements.feedsFilterChips.innerHTML = visibleChips.map(c => `
      <button type="button" class="feed-filter-chip ${active === c.id ? 'active' : ''}" data-filter="${c.id}">
        <span>${escapeHtml(c.label)}</span>
        <span class="chip-count">(${c.count})</span>
      </button>
    `).join('');

    elements.feedsFilterChips.querySelectorAll('.feed-filter-chip').forEach(btn => {
      btn.addEventListener('click', () => {
        state.feedFilter = btn.dataset.filter;
        renderFeedsGrid();
      });
    });
  }

  const FEEDS_SORT_KEY = 'anypod_feeds_sort';
  const isYouTubeFeedUrl = (url) => /youtube\.com|youtu\.be/i.test(url || '');

  function getFeedsSortOrder() {
    return localStorage.getItem(FEEDS_SORT_KEY) || 'recent';
  }

  function sortFeedsForGrid(urls) {
    const order = getFeedsSortOrder();
    const addedIndex = new Map(state.feeds.map((u, i) => [u, i]));
    const titleOf = (u) => ((state.feedMetadata[u] || {}).title || u).toLowerCase();

    // One pass over all episodes → per-feed stats
    const stats = new Map();
    urls.forEach(u => stats.set(u, { lastPlayed: 0, newest: 0, unplayed: 0 }));
    state.allEpisodes.forEach(ep => {
      const s = stats.get(ep.feedUrl);
      if (!s) return;
      const ts = ep.timestamp || 0;
      if (ts > s.newest) s.newest = ts;
      const pos = state.playbackPositions[ep.guid];
      if (pos && pos.lastListenedAt) {
        // lastListenedAt may be stored in seconds or ms — normalise to ms
        const l = pos.lastListenedAt < 1e12 ? pos.lastListenedAt * 1000 : pos.lastListenedAt;
        if (l > s.lastPlayed) s.lastPlayed = l;
      }
      if (!pos || (!pos.completed && (!pos.position || pos.position <= 2))) s.unplayed++;
    });

    const byName = (a, b) => titleOf(a).localeCompare(titleOf(b));
    const sorted = [...urls];
    switch (order) {
      case 'newest':
        sorted.sort((a, b) => stats.get(b).newest - stats.get(a).newest || byName(a, b));
        break;
      case 'unplayed':
        sorted.sort((a, b) => stats.get(b).unplayed - stats.get(a).unplayed || byName(a, b));
        break;
      case 'name-asc':
        sorted.sort(byName);
        break;
      case 'name-desc':
        sorted.sort((a, b) => byName(b, a));
        break;
      case 'added-desc':
        sorted.sort((a, b) => addedIndex.get(b) - addedIndex.get(a));
        break;
      case 'added-asc':
        sorted.sort((a, b) => addedIndex.get(a) - addedIndex.get(b));
        break;
      case 'type':
        sorted.sort((a, b) => (isYouTubeFeedUrl(a) - isYouTubeFeedUrl(b)) || byName(a, b));
        break;
      case 'recent':
      default:
        // Last played first; never-played feeds fall back to newest episode
        sorted.sort((a, b) => {
          const sa = stats.get(a), sb = stats.get(b);
          if (sa.lastPlayed || sb.lastPlayed) return sb.lastPlayed - sa.lastPlayed;
          return sb.newest - sa.newest;
        });
    }
    return sorted;
  }

  function setupFeedsSortSelect() {
    const sel = document.getElementById('feeds-sort-order');
    if (!sel || sel.dataset.wired) return;
    sel.dataset.wired = '1';
    sel.value = getFeedsSortOrder();
    sel.addEventListener('change', () => {
      localStorage.setItem(FEEDS_SORT_KEY, sel.value);
      renderFeedsGrid();
    });
  }

  function renderFeedsGrid() {
    setupFeedsSortSelect();
    updateDockVisibility();
    const grid = elements.feedsGrid;
    grid.innerHTML = '';

    if (state.feeds.length === 0) {
      if (elements.feedsFilterBar) elements.feedsFilterBar.classList.add('hidden');
      navigateTo('discover');
      return;
    }

    if (elements.feedsFilterBar) {
      elements.feedsFilterBar.classList.remove('hidden');
      // renderFeedsFilterChips();
    }

    let feedsToRender = state.feeds;

    // Apply quick category filter
    if (state.feedFilter && state.feedFilter !== 'all') {
      const catObj = FEED_CATEGORIES.find(c => c.id === state.feedFilter);
      if (catObj) {
        feedsToRender = feedsToRender.filter(url => {
          const meta = state.feedMetadata[url] || {};
          return catObj.match(url, meta);
        });
      }
    }

    // Apply active search query filter
    if (state.searchQuery && elements.tabFeeds && elements.tabFeeds.classList.contains('active')) {
      const q = state.searchQuery.toLowerCase();
      feedsToRender = feedsToRender.filter(url => {
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
          <p>${state.searchQuery ? `No podcasts in your library match "${escapeHtml(state.searchQuery)}".` : 'No podcasts match the selected filter.'}</p>
        </div>
      `;
      return;
    }

    feedsToRender = sortFeedsForGrid(feedsToRender);

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
          <img class="feed-art" loading="lazy" decoding="async" width="48" height="48" src="${meta.artwork || FALLBACK_ARTWORK}" alt="">
          <div class="feed-info">
            <h4>${highlightText(meta.title || url, state.searchQuery)}</h4>
            <p>${meta.error ? `<span style="color: #ef4444;">${escapeHtml(meta.error)}</span>` : `${meta.episodesCount || feedEpisodes.length} episodes`}${isFeedMuted(url) ? ' • <span style="color: var(--danger); font-weight: 500;">Muted</span>' : ''}</p>
          </div>
          <div class="feed-header-actions">
            <button class="btn-feed-share" title="Share podcast" aria-label="Share podcast">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"></path>
                <polyline points="16 6 12 2 8 6"></polyline>
                <line x1="12" y1="2" x2="12" y2="15"></line>
              </svg>
            </button>
            <button class="btn-feed-unsubscribe" title="Remove podcast" aria-label="Remove podcast">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="3 6 5 6 21 6"></polyline>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
              </svg>
            </button>
          </div>
        </div>
        ${plainDesc ? `<p class="feed-card-desc">${escapeHtml(plainDesc)}</p>` : ''}
        ${recentWidgetHtml}
      `;

      card.addEventListener('click', (e) => {
        if (e.target.closest('.feed-header-actions') || e.target.closest('.recent-ep-row')) return;
        openFeedDetail(url);
      });

      card.querySelector('.btn-feed-share')?.addEventListener('click', (e) => {
        e.stopPropagation();
        shareFeed(url, meta.title);
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
          toggleEpisodePlayback(ep, {
            type: 'feed',
            id: url,
            title: meta.title || 'Podcast Show',
            items: allForFeed
          });
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
      const terms = q.split(/\s+/).filter(Boolean);
      episodes = episodes.filter(ep => {
        const title = (ep.title || '').toLowerCase();
        const fullDesc = (ep.content || ep.description || '').toLowerCase();
        return terms.every(term => title.includes(term) || fullDesc.includes(term));
      });
    }

    // Filter by unplayed / played / all according to dock filterMode
    if (state.filterMode === 'unplayed') {
      episodes = episodes.filter(ep => {
        const pos = state.playbackPositions[ep.guid];
        return !pos || !pos.completed;
      });
    } else if (state.filterMode === 'played') {
      episodes = episodes.filter(ep => {
        const pos = state.playbackPositions[ep.guid];
        return pos && pos.completed;
      });
    }

    // Sort episodes according to dock sortOrder
    if (state.sortOrder === 'newest') {
      episodes.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
    } else if (state.sortOrder === 'oldest') {
      episodes.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
    } else if (state.sortOrder === 'title-asc') {
      episodes.sort((a, b) => (a.title || '').localeCompare(b.title || ''));
    } else if (state.sortOrder === 'title-desc') {
      episodes.sort((a, b) => (b.title || '').localeCompare(a.title || ''));
    } else if (state.sortOrder === 'duration-asc') {
      episodes.sort((a, b) => parseDurationSeconds(a.duration) - parseDurationSeconds(b.duration));
    } else if (state.sortOrder === 'duration-desc') {
      episodes.sort((a, b) => parseDurationSeconds(b.duration) - parseDurationSeconds(a.duration));
    }

    const loadedCount = episodes.length;
    const expectedTotal = meta.episodesCount || totalCount;

    const isPaging = (typeof _activeYtPaginations !== 'undefined') && (
      (meta.playlistId && _activeYtPaginations.has(meta.playlistId)) ||
      (feedUrl.includes('list=') && _activeYtPaginations.has(feedUrl.split('list=')[1].split('&')[0]))
    );

    const isPartial = expectedTotal && loadedCount < expectedTotal;

    const badgeText = q
      ? `${loadedCount} / ${expectedTotal} episodes`
      : (isPartial && isPaging)
        ? `${loadedCount} / ${expectedTotal} episodes (syncing...)`
        : isPartial
          ? `${loadedCount} / ${expectedTotal} episodes • Click to sync`
          : `${loadedCount} episodes`;

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
            <button class="btn btn-primary btn-sm btn-feed-play" id="btn-feed-play-all" title="Play episodes from this feed">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" style="margin-right: 3px;"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
              <span>Play</span>
            </button>
            <label class="feed-shuffle-checkbox-wrap" id="label-feed-shuffle" title="Toggle shuffle mode">
              <input type="checkbox" id="chk-feed-shuffle" ${state.isShuffle ? 'checked' : ''}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 3 21 3 21 8"></polyline><line x1="4" y1="20" x2="21" y2="3"></line><polyline points="21 16 21 21 16 21"></polyline><line x1="15" y1="15" x2="21" y2="21"></line><line x1="4" y1="4" x2="9" y2="9"></line></svg>
              <span>Shuffle</span>
            </label>
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
          <img class="feed-detail-art" loading="lazy" decoding="async" width="48" height="48" src="${meta.artwork || FALLBACK_ARTWORK}" alt="">
          <div class="feed-detail-info">
            <div class="feed-detail-title">${escapeHtml(meta.title || 'Untitled Podcast')}</div>
            <div class="feed-detail-author">${escapeHtml(meta.author || '')}</div>
            ${meta.description ? `<div class="feed-detail-desc">${escapeHtml(meta.description)}</div>` : ''}
            <div class="feed-detail-links">
              ${meta.link ? `<a href="${escapeHtml(meta.link)}" target="_blank" rel="noopener noreferrer" class="feed-link-badge">Website</a>` : ''}
              <button class="feed-link-badge" id="btn-copy-link" title="Copy Podcast Link to Clipboard">Copy Link</button>
              <button class="feed-link-badge" id="btn-share-feed-link" title="Share Podcast">Share Feed</button>
              <button class="feed-link-badge" id="btn-copy-rss" title="Copy RSS Feed URL">Copy RSS</button>
              <span class="feed-link-badge ${isPartial && !isPaging ? 'feed-sync-resumable' : ''}" id="feed-episodes-badge" style="cursor: ${isPartial && !isPaging ? 'pointer' : 'default'};" title="${isPartial && !isPaging ? 'Click to resume syncing remaining episodes' : isPaging ? 'Sync in progress' : ''}">${badgeText}</span>
              ${isSubbed && isMuted ? `<span class="feed-link-badge feed-muted-badge" style="cursor: default;">Timeline Muted</span>` : ''}
            </div>
          </div>
        </div>
      `;

      header.querySelector('#btn-feed-back').addEventListener('click', () => {
        navigateBack();
      });

      const playAllBtn = header.querySelector('#btn-feed-play-all');
      if (playAllBtn) {
        playAllBtn.addEventListener('click', () => {
          if (episodes.length === 0) return;
          const feedContext = {
            type: 'feed',
            id: feedUrl,
            title: meta.title || 'Podcast Show',
            items: episodes
          };
          if (state.isShuffle) {
            const randIdx = Math.floor(Math.random() * episodes.length);
            playEpisode(episodes[randIdx], null, feedContext);
          } else {
            playEpisode(episodes[0], null, feedContext);
          }
        });
      }

      const chkShuffle = header.querySelector('#chk-feed-shuffle');
      if (chkShuffle) {
        chkShuffle.addEventListener('change', (e) => {
          state.isShuffle = e.target.checked;
          localStorage.setItem(STORAGE_KEYS.SHUFFLE, String(state.isShuffle));
          updateShuffleButtonUI();
          showToast(state.isShuffle ? 'Shuffle mode ON' : 'Shuffle mode OFF');
        });
      }

      const copyLinkBtn = header.querySelector('#btn-copy-link');
      if (copyLinkBtn) {
        copyLinkBtn.addEventListener('click', async () => {
          const shareUrl = `${window.location.origin}/?feed=${encodeURIComponent(feedUrl)}#feed=${encodeURIComponent(feedUrl)}`;
          try {
            await navigator.clipboard.writeText(shareUrl);
            copyLinkBtn.textContent = 'Copied!';
            showToast('Podcast link copied to clipboard');
            setTimeout(() => {
              if (copyLinkBtn) copyLinkBtn.textContent = 'Copy Link';
            }, 2000);
          } catch (_) {
            window.prompt('Copy podcast link:', shareUrl);
          }
        });
      }

      const shareFeedLink = header.querySelector('#btn-share-feed-link');
      if (shareFeedLink) {
        shareFeedLink.addEventListener('click', () => {
          shareFeed(feedUrl, meta.title);
        });
      }

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

      const epBadge = header.querySelector('#feed-episodes-badge');
      if (epBadge) {
        epBadge.addEventListener('click', () => {
          const currentMeta = state.feedMetadata[feedUrl] || {};
          const currentEps = state.allEpisodes.filter(e => e.feedUrl === feedUrl);
          const currentExpected = currentMeta.episodesCount || 0;
          const pId = currentMeta.playlistId || (feedUrl.includes('list=') ? feedUrl.split('list=')[1].split('&')[0] : null);
          const currentlyPaging = pId && _activeYtPaginations.has(pId);

          if (currentExpected && currentEps.length < currentExpected && !currentlyPaging && pId) {
            showToast('Resuming episode sync...');
            startYouTubeBackgroundPaging(pId, feedUrl, currentMeta.nextToken || null);
            renderFeedDetail(feedUrl);
          }
        });
      }
    } else {
      const chk = header.querySelector('#chk-feed-shuffle');
      if (chk) {
        chk.checked = state.isShuffle === true;
      }
      const badge = header.querySelector('#feed-episodes-badge');
      if (badge) {
        badge.textContent = badgeText;
        badge.style.cursor = isPartial && !isPaging ? 'pointer' : 'default';
        badge.title = isPartial && !isPaging ? 'Click to resume syncing remaining episodes' : isPaging ? 'Sync in progress' : '';
        if (isPartial && !isPaging) {
          badge.classList.add('feed-sync-resumable');
        } else {
          badge.classList.remove('feed-sync-resumable');
        }
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

    const feedContext = {
      type: 'feed',
      id: feedUrl,
      title: meta.title || 'Podcast Show',
      items: episodes
    };

    const frag = document.createDocumentFragment();
    episodes.forEach(ep => {
      frag.appendChild(createEpisodeCard(ep, feedContext));
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

    function triggerEpisodeEnd(reason = 'ended') {
      if (state._episodeEndedTriggered) return;
      state._episodeEndedTriggered = true;
      if (state.activeEngine === 'audio') {
        state.playbackStatus = 'loading';
        syncPlaybackButtons();
        onEpisodeEnded();
      }
    }

    function checkEpisodeEndWatchdog() {
      if (state.activeEngine !== 'audio' || !elements.audio || !state.currentEpisode) return;
      if (state._episodeEndedTriggered) return;
      if (state.playbackStatus !== 'playing' && state.playbackStatus !== 'loading') return;

      const audio = elements.audio;
      const cur = audio.currentTime || 0;
      const rawDur = audio.duration;
      const dur = (rawDur && isFinite(rawDur) && rawDur > 0)
        ? rawDur
        : (state.currentEpisode.duration ? parseDurationSeconds(state.currentEpisode.duration) : 0);

      // If track is > 5s and currentTime is within 0.75s of the end (or past it):
      if (dur > 5 && cur >= Math.max(1, dur - 0.75)) {
        triggerEpisodeEnd('watchdog: near-end');
      }
    }

    audio.addEventListener('timeupdate', () => {
      if (state.activeEngine === 'audio') {
        updateProgress();
        checkEpisodeEndWatchdog();
      }
    });

    audio.addEventListener('loadedmetadata', () => {
      applyPendingAudioSeek();
      if (state.activeEngine === 'audio') {
        updateDuration();
        if (state.currentEpisode) {
          syncMediaSession(state.currentEpisode, false);
        }
      }
    });

    audio.addEventListener('ended', () => {
      if (state.activeEngine === 'audio') {
        triggerEpisodeEnd('event: ended');
      }
    });

    audio.addEventListener('loadstart', () => {
      // Only set loading if audio is actively playing or attempting to play,
      // so restoring a paused episode on reload keeps the paused state intact!
      if (state.activeEngine === 'audio' && state.currentEpisode && (!audio.paused || state.playbackStatus === 'playing')) {
        state.playbackStatus = 'loading';
        syncPlaybackButtons();
      }
    });

    audio.addEventListener('waiting', () => {
      if (state.activeEngine === 'audio') {
        const cur = audio.currentTime || 0;
        const rawDur = audio.duration;
        const dur = (rawDur && isFinite(rawDur) && rawDur > 0)
          ? rawDur
          : (state.currentEpisode?.duration ? parseDurationSeconds(state.currentEpisode.duration) : 0);
        if (dur > 5 && cur >= Math.max(1, dur - 2.5)) {
          triggerEpisodeEnd('waiting-near-end');
          return;
        }
        state.playbackStatus = 'loading';
        syncPlaybackButtons();
      }
    });

    audio.addEventListener('canplay', () => {
      applyPendingAudioSeek();
      if (state.activeEngine === 'audio') {
        if (!audio.paused) {
          state.playbackStatus = 'playing';
          syncPlaybackButtons();
        } else if (state.playbackStatus === 'loading' || state.playbackStatus === 'playing') {
          audio.play().then(() => {
            state.playbackStatus = 'playing';
            syncPlaybackButtons();
          }).catch(() => {});
        }
      }
    });

    audio.addEventListener('playing', () => {
      applyPendingAudioSeek();
      if (state.activeEngine === 'audio') {
        state.playbackStatus = 'playing';
        syncPlaybackButtons();

        if (state.currentEpisode) {
          const needsReassert = state._nowPlayingActiveGuid !== state.currentEpisode.guid;
          if (needsReassert) {
            state._nowPlayingActiveGuid = state.currentEpisode.guid;
            syncMediaSession(state.currentEpisode, true);
          } else {
            syncMediaSession(state.currentEpisode, false);
          }

          // Force lockscreen state to 'playing' as soon as audio outputs
          if ('mediaSession' in navigator) {
            navigator.mediaSession.playbackState = 'playing';
          }
        }
      }
    });

    audio.addEventListener('play', () => {
      if (state.activeEngine === 'audio') {
        if (state.playbackStatus !== 'playing') {
          state.playbackStatus = 'loading';
        }
        syncPlaybackButtons();
        if (state.currentEpisode) {
          syncMediaSession(state.currentEpisode, false);
        }
        liveTranscription.onPlayStateChange(true);
      }
    });

    audio.addEventListener('pause', () => {
      if (state.activeEngine === 'audio') {
        // 4. CRITICAL: Ignore browser pause events triggered by track completion (audio.ended)
        // or by elements.audio.src reassignments during track transitions (loading)
        if (audio.ended || state.playbackStatus === 'loading' || state._episodeEndedTriggered) {
          return;
        }

        const cur = audio.currentTime || 0;
        const rawDur = audio.duration;
        const dur = (rawDur && isFinite(rawDur) && rawDur > 0)
          ? rawDur
          : (state.currentEpisode?.duration ? parseDurationSeconds(state.currentEpisode.duration) : 0);
        if (dur > 5 && cur >= Math.max(1, dur - 1.5)) {
          triggerEpisodeEnd('pause-near-end');
          return;
        }

        state.playbackStatus = 'paused';
        syncPlaybackButtons();
        syncMediaSession(state.currentEpisode, false);
        liveTranscription.onPlayStateChange(false);

        if (state.currentEpisode && audio.currentTime > 2) {
          savePlaybackPositionToD1(state.currentEpisode.guid, audio.currentTime, false);
        }
      }
    });

    let _stalledRetryCount = 0;
    let _stalledRetryTimer = null;

    audio.addEventListener('stalled', () => {
      if (state.activeEngine !== 'audio') return;
      const cur = audio.currentTime || 0;
      const rawDur = audio.duration;
      const dur = (rawDur && isFinite(rawDur) && rawDur > 0)
        ? rawDur
        : (state.currentEpisode?.duration ? parseDurationSeconds(state.currentEpisode.duration) : 0);
      if (dur > 5 && cur >= Math.max(1, dur - 2.5)) {
        triggerEpisodeEnd('stalled-near-end');
        return;
      }
      // CRITICAL: On mobile (iOS Safari & Android Chrome), browsers fire 'stalled' normally
      // whenever the audio buffer reaches capacity and pauses downloading network chunks.
      // 1. If tab is in background (screen locked / pocket), NEVER touch the audio element.
      // Calling audio.load() while hidden causes mobile OS autoplay policies to kill playback.
      if (document.hidden) return;

      // 2. If the user paused or track ended, do nothing
      if (audio.paused || audio.ended) return;

      // 3. If the audio already has enough buffered data to keep playing, this is a normal network pause
      if (audio.readyState >= 3) return;

      // Only if playback has actually halted waiting for data do we show loading
      state.playbackStatus = 'loading';
      syncPlaybackButtons();

      if (_stalledRetryTimer) return; // already retrying
      _stalledRetryCount = 0;

      const attemptResume = () => {
        if (state.activeEngine !== 'audio' || state.playbackStatus !== 'loading' || document.hidden || audio.paused) {
          if (_stalledRetryTimer) { clearTimeout(_stalledRetryTimer); _stalledRetryTimer = null; }
          return;
        }

        if (_stalledRetryCount >= 3) {
          // After repeated failed attempts, fall back to audio proxy URL
          if (state.currentEpisode && elements.audio.src && !elements.audio.src.includes('/api/audio-proxy')) {
            const proxySrc = `/api/audio-proxy?url=${encodeURIComponent(state.currentEpisode.audioUrl)}`;
            const savedTime = audio.currentTime;
            elements.audio.src = proxySrc;
            elements.audio.addEventListener('loadedmetadata', function _onStallProxy() {
              elements.audio.removeEventListener('loadedmetadata', _onStallProxy);
              if (savedTime > 1) elements.audio.currentTime = savedTime;
              elements.audio.play().catch(() => {
                state.playbackStatus = 'paused';
                syncPlaybackButtons();
              });
            }, { once: true });
            elements.audio.load();
          }
          _stalledRetryCount = 0;
          _stalledRetryTimer = null;
          return;
        }

        _stalledRetryCount++;
        // Do NOT call audio.load() here! Calling load() dumps the hardware buffer.
        // Simply attempt to resume playback gently:
        audio.play().catch(() => {});
        _stalledRetryTimer = setTimeout(attemptResume, 2000);
      };

      _stalledRetryTimer = setTimeout(attemptResume, 3000);
    });

    // Clear stall retry on successful play or forward playback
    audio.addEventListener('playing', () => {
      _stalledRetryCount = 0;
      if (_stalledRetryTimer) { clearTimeout(_stalledRetryTimer); _stalledRetryTimer = null; }
    });

    audio.addEventListener('timeupdate', () => {
      if (_stalledRetryTimer && !audio.paused && audio.readyState >= 3) {
        _stalledRetryCount = 0;
        clearTimeout(_stalledRetryTimer);
        _stalledRetryTimer = null;
      }
    });

    audio.addEventListener('error', () => {
      if (state.activeEngine === 'audio') {
        // 5. Ensure valid src before attempting proxy fallback
        if (state.currentEpisode && elements.audio.src && !elements.audio.src.includes('/api/audio-proxy')) {
          state.playbackStatus = 'loading';
          syncPlaybackButtons();
          const proxySrc = `/api/audio-proxy?url=${encodeURIComponent(state.currentEpisode.audioUrl)}`;
          const savedTime = audio.currentTime;
          elements.audio.src = proxySrc;
          // Restore position after proxy load, then play
          elements.audio.addEventListener('loadedmetadata', function _onProxyMeta() {
            elements.audio.removeEventListener('loadedmetadata', _onProxyMeta);
            if (savedTime > 1) elements.audio.currentTime = savedTime;
            elements.audio.play().catch(() => {
              state.playbackStatus = 'paused';
              syncPlaybackButtons();
            });
          }, { once: true });
          elements.audio.load();
          return;
        }
        state.playbackStatus = 'paused';
        syncPlaybackButtons();
      }
    });

    let seekBarDebounce = null;
    const updateSeekBarVisual = (pct) => {
      elements.seekBar.style.setProperty('--seek-pct', `${pct * 100}%`);
      state._lastDrawnWaveformBarIndex = -1;
      let total = elements.audio?.duration || 0;
      if (total > 0 && elements.currentTimeLabel) {
        elements.currentTimeLabel.textContent = formatTime(pct * total);
      }
      const progressOverlay = document.getElementById('waveform-progress-overlay');
      const playheadLine = document.getElementById('waveform-playhead-line');
      if (progressOverlay) progressOverlay.style.width = `${pct * 100}%`;
      if (playheadLine) playheadLine.style.left = `${pct * 100}%`;
    };

    const commitAudioSeek = (pct) => {
      if (state.activeEngine === 'audio' && audio.duration && isFinite(audio.duration)) {
        audio.currentTime = pct * audio.duration;
      } else if (state.activeEngine === 'youtube' && state.ytPlayer && state.ytPlayer.getDuration) {
        const dur = state.ytPlayer.getDuration();
        if (dur) state.ytPlayer.seekTo(pct * dur, true);
      }
      updateProgress();
      if (state.experimentalSettings.enableVisualizer) {
        renderWaveformChart();
      }
    };

    elements.seekBar.addEventListener('input', () => {
      const pct = elements.seekBar.value / 100;
      updateSeekBarVisual(pct);
      clearTimeout(seekBarDebounce);
      seekBarDebounce = setTimeout(() => {
        commitAudioSeek(pct);
      }, 120);
    });
    elements.seekBar.addEventListener('change', () => {
      clearTimeout(seekBarDebounce);
      const pct = elements.seekBar.value / 100;
      commitAudioSeek(pct);
    });

    const miniProgBar = document.querySelector('.mini-progress-bar');
    if (miniProgBar) {
      let touchStartX = 0;
      let touchStartY = 0;
      let isTouchScrolling = false;

      // Detect touch gesture intention: if finger moves > 8px in any direction, it's a scroll!
      miniProgBar.addEventListener('touchstart', (e) => {
        if (e.touches && e.touches[0]) {
          touchStartX = e.touches[0].clientX;
          touchStartY = e.touches[0].clientY;
          isTouchScrolling = false;
        }
      }, { passive: true });

      miniProgBar.addEventListener('touchmove', (e) => {
        if (e.touches && e.touches[0]) {
          const deltaX = Math.abs(e.touches[0].clientX - touchStartX);
          const deltaY = Math.abs(e.touches[0].clientY - touchStartY);
          if (deltaX > 8 || deltaY > 8) {
            isTouchScrolling = true;
          }
        }
      }, { passive: true });

      miniProgBar.addEventListener('click', (e) => {
        e.stopPropagation();

        // 1. Guard against active page scroll or scroll-drag
        if (isTouchScrolling || document.body.classList.contains('is-scrolling')) {
          isTouchScrolling = false;
          return;
        }

        // 2. Only scrub if an episode is actually loaded
        if (!state.currentEpisode) return;

        const rect = miniProgBar.getBoundingClientRect();
        if (rect.width <= 0) return;
        const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));

        if (state.activeEngine === 'audio' && elements.audio && elements.audio.duration) {
          elements.audio.currentTime = pct * elements.audio.duration;
        } else if (state.activeEngine === 'youtube' && state.ytPlayer && state.ytPlayer.getDuration) {
          state.ytPlayer.seekTo(pct * state.ytPlayer.getDuration(), true);
        }
        updateProgress();
      });
    }

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
      if (state.activeEngine === 'audio' && isEnginePlaying()) {
        checkEpisodeEndWatchdog();
      } else if (state.activeEngine === 'youtube' && isEnginePlaying() && state.ytPlayer && state.ytPlayer.getCurrentTime) {
        updateProgress();
        updateDuration();
      }
    }, 1000);

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
      const setHandler = (action, handler) => {
        try {
          navigator.mediaSession.setActionHandler(action, handler);
        } catch (_) {}
      };

      setHandler('play', () => playCurrentEngine());
      setHandler('pause', () => pauseCurrentEngine());
      setHandler('seekbackward', (details) => {
        const skipTime = details?.seekOffset || 15;
        if (state.activeEngine === 'audio' && elements.audio) {
          elements.audio.currentTime = Math.max(0, elements.audio.currentTime - skipTime);
        } else if (state.activeEngine === 'youtube' && state.ytPlayer && state.ytPlayer.getCurrentTime) {
          const cur = state.ytPlayer.getCurrentTime();
          state.ytPlayer.seekTo(Math.max(0, cur - skipTime), true);
        }
        updateProgress();
      });
      setHandler('seekforward', (details) => {
        const skipTime = details?.seekOffset || 15;
        if (state.activeEngine === 'audio' && elements.audio && elements.audio.duration) {
          elements.audio.currentTime = Math.min(elements.audio.duration, elements.audio.currentTime + skipTime);
        } else if (state.activeEngine === 'youtube' && state.ytPlayer && state.ytPlayer.getCurrentTime) {
          const cur = state.ytPlayer.getCurrentTime();
          const dur = state.ytPlayer.getDuration();
          state.ytPlayer.seekTo(Math.min(dur, cur + skipTime), true);
        }
        updateProgress();
      });
      setHandler('previoustrack', () => {
        if (state.activeEngine === 'audio' && elements.audio) {
          elements.audio.currentTime = 0;
        } else if (state.activeEngine === 'youtube' && state.ytPlayer && state.ytPlayer.seekTo) {
          state.ytPlayer.seekTo(0, true);
        }
        updateProgress();
      });
      // Handles lock-screen / Bluetooth headphone next track button:
      setHandler('nexttrack', () => {
        onEpisodeEnded();
      });
      setHandler('seekto', (details) => {
        if (details && details.seekTime !== undefined && !isNaN(details.seekTime)) {
          seekToExactTime(details.seekTime);
        }
      });
      setHandler('stop', () => {
        pauseCurrentEngine();
        state.playbackStatus = 'idle';
        syncPlaybackButtons();
      });
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
    if (state.activeEngine === 'audio' && elements.audio) {
      // 1. Resume suspended Web Audio context if waking up from sleep
      if (typeof liveAudioCtx !== 'undefined' && liveAudioCtx && liveAudioCtx.state === 'suspended') {
        liveAudioCtx.resume().catch(() => {});
      }

      // 2. Play with stream auto-recovery
      const playPromise = elements.audio.play();
      if (playPromise !== undefined) {
        playPromise.catch(err => {
          console.warn('[anypod] Playback interrupted on wakeup, recovering stream:', err);

          // If the network socket dropped during sleep, reload the stream source
          if (state.currentEpisode && elements.audio.networkState === HTMLMediaElement.NETWORK_NO_SOURCE) {
            const currentPos = elements.audio.currentTime || 0;
            state.pendingStartTime = currentPos > 0 ? currentPos : null;
            elements.audio.load();
            elements.audio.play().catch(() => {
              state.playbackStatus = 'paused';
              syncPlaybackButtons();
            });
          } else {
            state.playbackStatus = 'paused';
            syncPlaybackButtons();
          }
        });
      }
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

  function toggleEpisodePlayback(episode, context = null) {
    if (state.currentEpisode && state.currentEpisode.guid === episode.guid) {
      if (state.playbackStatus === 'playing' || state.playbackStatus === 'loading') {        
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
      playEpisode(episode, null, context);
    }
  }

  function playEpisode(episode, overrideStartTime, context = null) {
    state._episodeEndedTriggered = false;
    state._nowPlayingActiveGuid = null;
    state.currentEpisode = episode;
    state.playbackStatus = 'loading';
    syncMediaSession(episode, true);

    liveTranscription.onEpisodeChange(episode);
    // Reset caption popup for the new episode
    _captionDismissed = false;
    _hideLiveCaption(false);
    syncPlaybackButtons();

    if (context && Array.isArray(context.items)) {
      state.playbackContext = {
        type: context.type || 'timeline',
        id: context.id || '',
        title: context.title || 'Timeline',
        items: context.items
      };
    } else if (!state.playbackContext || !state.playbackContext.items || state.playbackContext.items.length === 0) {
      state.playbackContext = {
        type: state.searchQuery ? 'search' : state.filterMode,
        id: '',
        title: state.searchQuery ? `Search: "${state.searchQuery}"` : 'Timeline',
        items: state.filteredEpisodes
      };
    }

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

    if (episode.isYouTube || episode.videoId || episode.playlistId) {
      // 1. Stop native audio element so streams do not conflict
      if (elements.audio) {
        elements.audio.pause();
        elements.audio.removeAttribute('src');
      }

      state.activeEngine = 'youtube';

      if (state.ytPlayer && typeof state.ytPlayer.loadVideoById === 'function') {
        if (episode.videoId) {
          state.ytPlayer.loadVideoById(episode.videoId, startTime || 0);
        } else if (episode.isYouTubePlaylist && episode.playlistId) {
          state.ytPlayer.loadPlaylist({
            list: episode.playlistId,
            listType: 'playlist'
          });
        }
        if (state.ytPlayer.playVideo) state.ytPlayer.playVideo();
        if (state.ytPlayer.setPlaybackRate) state.ytPlayer.setPlaybackRate(state.playbackSpeed);
      } else if (window.YT && window.YT.Player) {
        const container = document.getElementById('yt-player-container');
        if (container) {
          container.innerHTML = '<div id="yt-player"></div>';
        }
        const playerConfig = {
          height: '120',
          width: '200',
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
            onError: handleYouTubeError
          }
        };

        if (episode.videoId) {
          playerConfig.videoId = episode.videoId;
          if (startTime > 0) {
            playerConfig.playerVars.start = Math.floor(startTime);
          }
        } else if (episode.isYouTubePlaylist && episode.playlistId) {
          playerConfig.playerVars.listType = 'playlist';
          playerConfig.playerVars.list = episode.playlistId;
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
      const isDownloaded = !!state.downloadedEpisodes[episode.guid];
      if (isDownloaded) {
        streamUrl = `${streamUrl}${streamUrl.includes('?') ? '&' : '?'}offline=1`;
      } else if (window.location.protocol === 'https:' && streamUrl.startsWith('http://')) {
        streamUrl = `/api/audio-proxy?url=${encodeURIComponent(streamUrl)}`;
      }

      state.pendingStartTime = startTime > 0 ? startTime : null;
      elements.audio.src = streamUrl;
      elements.audio.playbackRate = state.playbackSpeed;

      const playPromise = elements.audio.play();
      if (playPromise !== undefined) {
        playPromise.catch((err) => {
          if (err && err.name === 'AbortError') return;
          if (state.playbackStatus === 'loading') return;
          state.playbackStatus = 'paused';
          syncPlaybackButtons();
        });
      }
    }

    if (elements.playerTitle) elements.playerTitle.textContent = episode.title;
    if (elements.playerPodcast) elements.playerPodcast.textContent = episode.podcastTitle;
    if (elements.playerArtwork) {
      elements.playerArtwork.src = episode.artwork || FALLBACK_ARTWORK;
      elements.playerArtwork.onerror = () => {
        elements.playerArtwork.onerror = null;
        elements.playerArtwork.src = FALLBACK_ARTWORK;
      };
    }

    if (elements.miniTitle) elements.miniTitle.textContent = episode.title;
    if (elements.miniPodcast) elements.miniPodcast.textContent = episode.podcastTitle;
    if (elements.miniArtwork) {
      elements.miniArtwork.src = episode.artwork || FALLBACK_ARTWORK;
      elements.miniArtwork.onerror = () => {
        elements.miniArtwork.onerror = null;
        elements.miniArtwork.src = FALLBACK_ARTWORK;
      };
    }

    if (elements.playerBar) {
      elements.playerBar.classList.add('active-episode');
    }
    document.body.classList.add('has-active-episode');
    updatePlayerFavButton();
    syncPlaybackButtons();
    updateAutoplayButtonUI();
    updateShuffleButtonUI();

    if (!document.hidden) {
      renderContinueShelf();
      updateFilterBadges();
      setPlayerCollapsed(false, false);
      initOrLoadEpisodeTimeline(episode, (episode.duration ? parseDurationSeconds(episode.duration) : 0));
    }
  }

  const _activeYtPaginations = new Set();

  /**
   * Lazily streams the full YouTube playlist in the background without UI lag.
   */
  async function startYouTubeBackgroundPaging(playlistId, feedUrl, initialToken) {
    if (!playlistId) return;
    if (_activeYtPaginations.has(playlistId)) return;
    _activeYtPaginations.add(playlistId);

    let nextToken = initialToken || state.feedMetadata[feedUrl]?.nextToken || null;
    let isFirstBatch = !nextToken;

    try {
      while (nextToken || isFirstBatch) {
        // 500ms delay protects against rate limits & keeps the UI responsive
        await new Promise(r => setTimeout(r, 500));

        // Abort if user removed this feed and is not viewing it in detail preview
        if (!state.feeds.includes(feedUrl) && state.activeFeedDetailUrl !== feedUrl) break;

        const apiUrl = nextToken
          ? `/api/feed?batch=1&playlistId=${encodeURIComponent(playlistId)}&continuation=${encodeURIComponent(nextToken)}`
          : `/api/feed?batch=1&playlistId=${encodeURIComponent(playlistId)}`;

        isFirstBatch = false;

        let res = null;
        let retryCount = 0;
        const maxRetries = 3;

        while (retryCount <= maxRetries) {
          try {
            res = await fetch(apiUrl);
            if (res.ok) break;

            // Retry on 503 (Cloudflare worker temporarily unavailable / CPU spike), 429 (Rate limit), 524 (Timeout)
            if ((res.status === 503 || res.status === 429 || res.status === 524) && retryCount < maxRetries) {
              retryCount++;
              const backoffMs = Math.min(1000 * Math.pow(2, retryCount), 8000);
              console.warn(`[YouTube Hydration] Got HTTP ${res.status}, retrying in ${backoffMs}ms (attempt ${retryCount}/${maxRetries})...`);
              if (state.activeFeedDetailUrl === feedUrl) {
                const badge = document.getElementById('feed-episodes-badge');
                if (badge) {
                  const currentEps = state.allEpisodes.filter(e => e.feedUrl === feedUrl);
                  const expected = state.feedMetadata[feedUrl]?.episodesCount || currentEps.length;
                  badge.textContent = `${currentEps.length} / ${expected} episodes (retrying in ${Math.round(backoffMs / 1000)}s...)`;
                }
              }
              await new Promise(r => setTimeout(r, backoffMs));
              continue;
            }
          } catch (netErr) {
            if (retryCount < maxRetries) {
              retryCount++;
              const backoffMs = Math.min(1000 * Math.pow(2, retryCount), 8000);
              console.warn(`[YouTube Hydration] Network error, retrying in ${backoffMs}ms:`, netErr);
              await new Promise(r => setTimeout(r, backoffMs));
              continue;
            }
          }
          break;
        }

        if (!res || !res.ok) {
          console.warn(`[YouTube Hydration] Batch request stopped with HTTP ${res ? res.status : 'NetworkError'}.`);
          break;
        }

        const batch = await res.json();
        if (!batch.episodes || batch.episodes.length === 0) {
          nextToken = batch.nextToken || null;
          if (state.feedMetadata[feedUrl]) {
            state.feedMetadata[feedUrl].nextToken = nextToken;
          }
          if (!nextToken) break;
          continue;
        }

        // Deduplicate against state.allEpisodes
        const currentGuids = new Set(state.allEpisodes.map(e => e.guid));
        let addedAny = false;

        for (const ep of batch.episodes) {
          if (!currentGuids.has(ep.guid)) {
            currentGuids.add(ep.guid);
            ep.feedUrl = feedUrl;
            if (state.feedMetadata[feedUrl]?.title) {
              ep.podcastTitle = state.feedMetadata[feedUrl].title;
            }
            state.allEpisodes.push(ep);
            addedAny = true;
          }
        }

        nextToken = batch.nextToken || null;
        if (state.feedMetadata[feedUrl]) {
          state.feedMetadata[feedUrl].nextToken = nextToken;
        }

        if (addedAny) {
          saveCacheToStorage();
          processAndSortEpisodes();
          renderTimeline();
          // Keep Feed Detail view up to date while user is browsing this feed
          if (state.activeFeedDetailUrl === feedUrl && typeof renderFeedDetail === 'function') {
            renderFeedDetail(feedUrl);
          }
        }
      }
    } catch (err) {
      console.warn('[YouTube Hydration] Paging stopped:', err);
    } finally {
      _activeYtPaginations.delete(playlistId);
      if (state.activeFeedDetailUrl === feedUrl && typeof renderFeedDetail === 'function') {
        renderFeedDetail(feedUrl);
      }
    }
  }

  function updatePlaylistCountBadges(feedUrl, loadedCount, expectedTotal) {
    // Target any badge displaying episode count for this feed
    const badges = document.querySelectorAll(`[data-feed-badge="${feedUrl}"], .feed-item[data-url="${feedUrl}"] .feed-count`);

    badges.forEach(badge => {
      if (expectedTotal && loadedCount < expectedTotal) {
        badge.textContent = `${loadedCount} / ${expectedTotal} ep (syncing...)`;
        badge.classList.add('is-syncing');
      } else {
        badge.textContent = `${loadedCount} episodes`;
        badge.classList.remove('is-syncing');
      }
    });
  }

  let _lastPositionStateUpdate = 0;

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

    // 1. Lock-screen MediaSession scrubber: throttled so OS doesn't receive redundant IPC spam
    const now = Date.now();
    if ('mediaSession' in navigator && 'setPositionState' in navigator.mediaSession && total > 0 && isFinite(total)) {
      if (now - _lastPositionStateUpdate > 3000) {
        _lastPositionStateUpdate = now;
        const accelerating = typeof isAcceleratingSilence !== 'undefined' && isAcceleratingSilence;
        try {
          navigator.mediaSession.setPositionState({
            duration: Math.max(0.1, total),
            playbackRate: (accelerating ? 2.5 : (state.playbackSpeed || 1.0)),
            position: Math.min(Math.max(0, current), total)
          });
        } catch (_) {}
      }
    }

    // 2. Sleep timer volume fadeout (keeps working in background)
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

    // 3. BATTERY GUARD: If phone is locked or tab is hidden, skip all DOM layout queries & visual repaints
    if (document.hidden || !state.isTabActive) {
      return;
    }

    if (elements.currentTimeLabel) {
      elements.currentTimeLabel.textContent = formatTime(current);
    }
    if (elements.totalDurationLabel) {
      if (total > 0 && state.showRemainingTime && total > current) {
        elements.totalDurationLabel.textContent = `-${formatTime(total - current)}`;
      } else if (total > 0) {
        elements.totalDurationLabel.textContent = formatTime(total);
      } else {
        elements.totalDurationLabel.textContent = '0:00';
      }
    }
    if (total > 0) {
      const pct = (current / total) * 100;
      if (elements.seekBar) {
        elements.seekBar.value = pct;
        elements.seekBar.style.setProperty('--seek-pct', `${pct}%`);
      }
      if (elements.miniProgressFill) {
        elements.miniProgressFill.style.width = `${pct}%`;
      }
      if (elements.waveformPlayheadLine) {
        elements.waveformPlayheadLine.style.left = `${pct}%`;
      }
      if (elements.waveformTimelineWrap) {
        elements.waveformTimelineWrap.setAttribute('aria-valuenow', Math.round(pct));
      }

      const dur = state.episodeTimeline.duration || total || 0;
      const progressRatio = dur > 0 ? (current / dur) : (pct / 100);
      state.episodeTimeline.progressPct = progressRatio;

      const barCount = (state.episodeTimeline.bars && state.episodeTimeline.bars.length) || 85;
      const curBarIdx = Math.floor(progressRatio * barCount);
      
      if (state._lastDrawnWaveformBarIndex !== curBarIdx) {
        state._lastDrawnWaveformBarIndex = curBarIdx;
        if (state.experimentalSettings.enableVisualizer) {
          renderWaveformChart();
        }
      }

      if (state.experimentalSettings.autoSkipSpeech && isEnginePlaying()) {
        const segments = state.episodeTimeline.segments || [];
        const currentSegment = segments.find(s => current >= s.start && current < s.end);

        if (currentSegment && currentSegment.type === 'speech') {
          if (!state._autoSkipTimer) {
            state._autoSkipTimer = setTimeout(() => {
              if (state.experimentalSettings.autoSkipSpeech && isEnginePlaying()) {
                jumpToNextSegment('music');
                showToast('⚡ skipped talk section');
              }
              state._autoSkipTimer = null;
            }, 1500);
          }
        } else if (state._autoSkipTimer) {
          clearTimeout(state._autoSkipTimer);
          state._autoSkipTimer = null;
        }
      }

      // Live transcript cue karaoke highlight & auto-scroll
      if (elements.showTranscriptContent && !elements.showTranscriptContent.classList.contains('hidden')) {
        const cueEls = elements.transcriptCuesList ? elements.transcriptCuesList.querySelectorAll('.transcript-cue') : [];
        cueEls.forEach(el => {
          const start = parseFloat(el.dataset.start);
          const end = parseFloat(el.dataset.end);
          const isActive = current >= start && current <= end;
          if (isActive !== el.classList.contains('is-active')) {
            el.classList.toggle('is-active', isActive);
            if (isActive) {
              el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }
          }
        });
      }

      // Live transcription: notify on time update (throttled to ~2s)
      if (state.experimentalSettings.enableLiveTranscript) {
        const nowMs = Date.now();
        if (!updateProgress._lastLiveTick || nowMs - updateProgress._lastLiveTick > 2000) {
          updateProgress._lastLiveTick = nowMs;
          liveTranscription.onTimeUpdate(current);
        }
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
        if (state.episodeTimeline.guid !== state.currentEpisode.guid || !state.episodeTimeline.duration || state.episodeTimeline.duration <= 0) {
          if (!document.hidden && state.isTabActive) {
            initOrLoadEpisodeTimeline(state.currentEpisode, dur);
          }
        }
      }
    }
  }

  function playNextEpisode() {
    let nextEp = null;

    // 1. Manual user queue always takes priority
    if (state.queue && state.queue.length > 0) {
      nextEp = state.queue.shift();
      saveQueueToStorage();
      updateQueueUI();
    } else if (state.autoplayEnabled) {
      // 2. Only pull auto-play candidate if autoplay is enabled
      const autoList = getAutoQueueEpisodes(1);
      if (autoList.length > 0) {
        nextEp = autoList[0];
      }
    }

    // 3. Play next or stop engine completely
    if (nextEp) {
      playEpisode(nextEp, null, state.playbackContext);
      if (!document.hidden) {
        processAndSortEpisodes();
        renderTimeline();
        renderContinueShelf();
        if (state.activeFeedDetailUrl) {
          renderFeedDetail(state.activeFeedDetailUrl);
        }
      }
    } else {
      state.playbackStatus = 'idle';
      pauseCurrentEngine();
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
    state._episodeEndedTriggered = false;
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
  function updateAutoplayButtonUI() {
    const btn = elements.btnAutoplayToggle || document.getElementById('btn-autoplay-toggle');
    if (!btn) return;

    const isEnabled = state.autoplayEnabled === true;
    btn.classList.toggle('active', isEnabled);
    btn.setAttribute('aria-pressed', String(isEnabled));
    btn.title = isEnabled
      ? `Autoplay ON (${state.playbackContext?.title || 'Timeline'})`
      : 'Autoplay OFF';
  }

  function updateShuffleButtonUI() {
    const btn = elements.btnPlayerShuffle || document.getElementById('btn-player-shuffle');
    if (btn) {
      const isShuffle = state.isShuffle === true;
      btn.classList.toggle('active', isShuffle);
      btn.setAttribute('aria-pressed', String(isShuffle));
      btn.title = isShuffle ? 'Shuffle Playback (ON)' : 'Shuffle Playback (OFF)';
    }
    const chk = document.getElementById('chk-feed-shuffle');
    if (chk) {
      chk.checked = state.isShuffle === true;
    }
  }

  function toggleShuffle() {
    state.isShuffle = !state.isShuffle;
    localStorage.setItem(STORAGE_KEYS.SHUFFLE, String(state.isShuffle));
    updateShuffleButtonUI();
    showToast(state.isShuffle ? 'Shuffle mode ON' : 'Shuffle mode OFF');
    if (elements.queueModal && !elements.queueModal.classList.contains('hidden')) {
      renderQueueModalContent();
    }
  }

  function syncMediaSession(episode, forceMetadataUpdate = false) {
    if (!('mediaSession' in navigator) || !episode) return;

    try {
      const titleStr = episode.title || 'Untitled Episode';
      const artistStr = episode.podcastTitle || 'Podcast';
      const albumStr = episode.podcastTitle || 'anypod';

      // 0. Keep document.title in sync so lockscreen/notification fallback displays the episode
      document.title = `${titleStr} • ${artistStr} — anypod`;

      // 1. Resolve Artwork to an ABSOLUTE URL
      const feedMeta = (state.feedMetadata && episode.feedUrl) ? state.feedMetadata[episode.feedUrl] : null;
      let rawArt = episode.artwork || (feedMeta && feedMeta.artwork) || '';

      let resolvedArt = '';
      if (rawArt && typeof rawArt === 'string' && !rawArt.startsWith('data:')) {
        try {
          if (window.location.protocol === 'https:' && rawArt.startsWith('http://')) {
            // Upgrade insecure HTTP to secure proxy to prevent mixed-content & SSL handshake failures
            resolvedArt = new URL(`/api/audio-proxy?url=${encodeURIComponent(rawArt)}`, window.location.origin).href;
          } else if (rawArt.startsWith('//')) {
            resolvedArt = 'https:' + rawArt;
          } else {
            resolvedArt = new URL(rawArt, window.location.origin).href;
          }
        } catch (_) {
          resolvedArt = '';
        }
      }

      // If no valid artwork or if it is SVG, fallback to our PNG icons:
      // iOS WebKit and Android lockscreen widgets reject SVG artwork!
      const isSvg = resolvedArt.toLowerCase().includes('.svg');
      const fallbackArt = new URL('/icon-512.png', window.location.origin).href;
      const primaryArt = (!resolvedArt || isSvg) ? fallbackArt : resolvedArt;

      let imgType = 'image/png';
      const lowerArt = primaryArt.toLowerCase();
      if (lowerArt.includes('.jpg') || lowerArt.includes('.jpeg')) {
        imgType = 'image/jpeg';
      } else if (lowerArt.includes('.webp')) {
        imgType = 'image/webp';
      }

      const artworkList = [
        { src: primaryArt, sizes: '96x96', type: imgType },
        { src: primaryArt, sizes: '128x128', type: imgType },
        { src: primaryArt, sizes: '192x192', type: imgType },
        { src: primaryArt, sizes: '256x256', type: imgType },
        { src: primaryArt, sizes: '384x384', type: imgType },
        { src: primaryArt, sizes: '512x512', type: imgType }
      ];
      if (primaryArt !== fallbackArt) {
        artworkList.push(
          { src: fallbackArt, sizes: '192x192', type: 'image/png' },
          { src: fallbackArt, sizes: '512x512', type: 'image/png' }
        );
      }

      // 2. Set Metadata: update when requested (force) or when guid differs
      const isSameEpisode = !forceMetadataUpdate && (state._mediaSessionGuid === episode.guid);

      if (!isSameEpisode && 'MediaMetadata' in window) {
        state._mediaSessionGuid = episode.guid;
        const newMeta = new MediaMetadata({
          title: titleStr,
          artist: artistStr,
          album: albumStr,
          artwork: artworkList
        });
        navigator.mediaSession.metadata = newMeta;
      }

      // 3. Keep lockscreen widget alive: treat loading as playing
      if (state.playbackStatus === 'paused') {
        navigator.mediaSession.playbackState = 'paused';
      } else {
        navigator.mediaSession.playbackState = 'playing';
      }

      // 4. Safe setPositionState: only update position state when not loading.
      // Calling setPositionState during track loading with estimated durations
      // desynchronizes Android's PlaybackStateCompat and can drop the notification.
      if (state.playbackStatus !== 'loading') {
        let durSec = 0;
        let curSec = 0;

        if (state.activeEngine === 'audio' && elements.audio) {
          if (elements.audio.duration && isFinite(elements.audio.duration) && elements.audio.duration > 0) {
            durSec = elements.audio.duration;
          }
          curSec = elements.audio.currentTime || 0;
        } else if (state.activeEngine === 'youtube' && state.ytPlayer) {
          if (typeof state.ytPlayer.getDuration === 'function') {
            const yd = state.ytPlayer.getDuration();
            if (yd && isFinite(yd) && yd > 0) durSec = yd;
          }
          if (typeof state.ytPlayer.getCurrentTime === 'function') {
            curSec = state.ytPlayer.getCurrentTime() || 0;
          }
        }

        if (!durSec && episode.duration && typeof parseDurationSeconds === 'function') {
          durSec = parseDurationSeconds(episode.duration);
        }

        if ('setPositionState' in navigator.mediaSession && durSec > 0 && isFinite(durSec)) {
          const safePos = Math.max(0, Math.min(curSec, durSec));
          try {
            navigator.mediaSession.setPositionState({
              duration: Math.max(0.1, durSec),
              playbackRate: state.playbackSpeed || 1.0,
              position: safePos
            });
          } catch (_) {}
        }
      }
    } catch (err) {
      console.warn('[Anypod MediaSession] sync failed:', err);
    }
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

    if ('mediaSession' in navigator) {
      navigator.mediaSession.playbackState = (isPlaying || isLoading) 
        ? 'playing' 
        : (state.playbackStatus === 'paused' ? 'paused' : 'none');
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

    // if (elements.showNotesModal && !elements.showNotesModal.classList.contains('hidden') && state.currentEpisode) {
    //   syncShowNotesPlayButton(state.currentEpisode);
    // }
    if (elements.showNotesModal && !elements.showNotesModal.classList.contains('hidden') && state.activeNotesEpisode) {
      syncShowNotesPlayButton(state.activeNotesEpisode);
    }

    const cards = document.querySelectorAll('.episode-card');
    cards.forEach(card => {
      const guid = card.dataset.guid;
      const btn = card.querySelector('.btn-play-ep');
      if (!btn) return;

      const isThisActive = state.currentEpisode && state.currentEpisode.guid === guid && state.playbackStatus !== 'idle';
      
      if (isThisActive) {
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
    updatePlayerFavButton();
    updateQueueUI();
  }
function setPlayerCollapsed(collapsed, save = true) {
    if (collapsed) {
      // console.log('[Anypod Debug] Player MINIMIZED (collapsed = true). Triggered by:', new Error().stack);
      document.body.classList.add('has-mini-player');
      document.body.classList.remove('has-full-player');
      if (elements.btnCollapsePlayer) elements.btnCollapsePlayer.setAttribute('aria-expanded', 'false');
      if (elements.miniToggle) elements.miniToggle.setAttribute('aria-expanded', 'false');
    } else {
      // console.log('[Anypod Debug] Player EXPANDED (collapsed = false).');
      // Cooldown timer to prevent background reflows from immediately re-collapsing
      state._lastPlayerExpandTime = Date.now();
      document.body.classList.remove('has-mini-player');
      document.body.classList.add('has-full-player');
      if (elements.btnCollapsePlayer) elements.btnCollapsePlayer.setAttribute('aria-expanded', 'true');
      if (elements.miniToggle) elements.miniToggle.setAttribute('aria-expanded', 'true');
      requestAnimationFrame(() => renderWaveformChart());
      setTimeout(() => renderWaveformChart(), 350);
    }
    if (save) {
      try {
        localStorage.setItem('anypod_player_collapsed', collapsed ? 'true' : 'false');
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

  async function addFeed(url, title = '', artwork = '') {
    const cleanUrl = url.trim();
    if (!cleanUrl) return false;

    if (!state.feeds.includes(cleanUrl)) {
      state.feeds.push(cleanUrl);
      saveFeedsToStorage();
      try {
        await saveFeedToD1(cleanUrl, title, artwork);
      } catch (_) {}
      await refreshAllFeeds();
      if (elements.feedUrlInput && elements.feedUrlInput.value.trim() === cleanUrl) {
        elements.feedUrlInput.value = '';
      }
      return true;
    } else {
      showStatus('This podcast is already in your subscriptions');
      return true;
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
            caches.open('anypod-audio-v1').then(cache => cache.delete(dl.audioUrl)).catch(() => {});
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
            caches.open('anypod-audio-v1').then(cache => cache.delete(dl.audioUrl)).catch(() => {});
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
    if (state.feeds.length === 0) {
      navigateTo('discover');
    } else {
      renderTimeline();
      renderFeedsGrid();
    }
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
    let xml = `<?xml version="1.0" encoding="UTF-8"?>\n<opml version="2.0">\n  <head>\n    <title>Anypod Export</title>\n  </head>\n  <body>\n`;
    
    state.feeds.forEach(url => {
      const meta = state.feedMetadata[url] || {};
      const title = meta.title ? escapeHtml(meta.title) : 'Podcast';
      xml += `    <outline type="rss" text="${title}" title="${title}" xmlUrl="${escapeHtml(url)}"/>\n`;
    });

    xml += `  </body>\n</opml>`;

    const blob = new Blob([xml], { type: 'text/xml' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'anypod_subscriptions.opml';
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
        sessionStorage.setItem('anypod_guest_mode', '1');
      });
    }

    if (elements.btnCancelAuth) {
      elements.btnCancelAuth.addEventListener('click', () => {
        elements.authModal.classList.add('hidden');
        sessionStorage.setItem('anypod_guest_mode', '1');
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
          if (state.activeFeedDetailUrl) {
            renderFeedDetail(state.activeFeedDetailUrl);
          }
        });
      });
    }

    if (elements.btnAccountToggle) {
      elements.btnAccountToggle.addEventListener('click', async () => {
        if (elements.statusIndicator && elements.statusIndicator.classList.contains('online')) {
          const emailDisplay = state.userEmail ? ` (${state.userEmail})` : '';
          openConfirmDialog({
            title: 'Sign Out?',
            message: `Are you sure you want to sign out${emailDisplay}? Your cloud subscriptions and playback positions will remain safely synced to your account.`,
            actionLabel: 'Sign Out',
            onConfirm: async () => {
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
              localStorage.removeItem(STORAGE_KEYS.USER_EMAIL);
              localStorage.removeItem('podcast_pulse_session_token');
              localStorage.removeItem(STORAGE_KEYS.FEEDS);
              localStorage.removeItem(STORAGE_KEYS.MUTED_FEEDS);
              localStorage.removeItem(STORAGE_KEYS.POSITIONS);
              localStorage.removeItem(STORAGE_KEYS.CACHED_EPISODES);
              localStorage.removeItem(STORAGE_KEYS.CACHED_METADATA);
              localStorage.removeItem(STORAGE_KEYS.QUEUE);
              localStorage.removeItem(STORAGE_KEYS.LAST_EPISODE);
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
            }
          });
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
              localStorage.removeItem(STORAGE_KEYS.USER_EMAIL);
              localStorage.removeItem('podcast_pulse_session_token');
              localStorage.removeItem('anypod_session_token');
              state.sessionToken = '';
              state.userEmail = '';

              updateSyncStatusUI('logged in as guest / local device storage', '', false);
              showStatus('cloud account and sync data permanently wiped.');
            } catch (err) {
              showStatus('failed to delete account: ' + err.message);
            } finally {
              btnDeleteAccount.disabled = false;
              btnDeleteAccount.textContent = 'delete account & wipe cloud data';
            }
          }
        });
      });

      document.addEventListener('error', (e) => {
        if (e.target && e.target.tagName === 'IMG') {
          const img = e.target;
          if (img.src !== FALLBACK_ARTWORK) {
            img.src = FALLBACK_ARTWORK;
          }
        }
      }, true);
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

    if (elements.btnPlayerShuffle) {
      elements.btnPlayerShuffle.addEventListener('click', toggleShuffle);
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
      const hasText = !!e.target.value.trim();
      if (elements.btnClearSearch) {
        elements.btnClearSearch.classList.toggle('hidden', !hasText);
      }
      if (elements.searchBarWrap) {
        elements.searchBarWrap.classList.toggle('has-text', hasText);
      }
      processAndSortEpisodes();
      renderTimeline();
      renderFeedsGrid();
      if (state.activeFeedDetailUrl) {
        renderFeedDetail(state.activeFeedDetailUrl);
      }
      renderOfflineStorageSettings();
    });

    // ───────────────────────────────────────────────────────────────────────
    // Search Discover Live Preview (5 items + trailing 'see all' card)
    // ───────────────────────────────────────────────────────────────────────
    let discoverSearchTimer = null;
    const previewContainer = document.getElementById('search-discover-preview');
    const previewScroll = document.getElementById('discover-preview-scroll');

    // Helper: completely close & reset header search
    function dismissHeaderSearch() {
      if (elements.searchInput) {
        elements.searchInput.value = '';
        elements.searchInput.blur();
      }
      state.searchQuery = '';
      if (elements.btnClearSearch) elements.btnClearSearch.classList.add('hidden');
      if (elements.searchBarWrap) elements.searchBarWrap.classList.remove('has-text');
      if (previewContainer) previewContainer.classList.add('hidden');
    }

    elements.searchInput?.addEventListener('input', (e) => {
      const q = e.target.value.trim();
      clearTimeout(discoverSearchTimer);

      if (q.length < 3) {
        if (previewContainer) previewContainer.classList.add('hidden');
        return;
      }

      discoverSearchTimer = setTimeout(async () => {
        try {
          // Fetch 5 matching shows via proxy (with direct fallback)
          let data = null;
          try {
            const proxyRes = await fetch(`/api/search-directory?term=${encodeURIComponent(q)}&limit=5`);
            if (proxyRes.ok) data = await proxyRes.json();
          } catch (_) {}

          if (!data || !data.results || data.results.length === 0 || data.rateLimited) {
            try {
              const directRes = await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(q)}&media=podcast&entity=podcast&limit=5`);
              if (directRes.ok) data = await directRes.json();
            } catch (_) {}
          }

          if (!data || !data.results || data.results.length === 0) {
            if (previewContainer) previewContainer.classList.add('hidden');
            return;
          }

          if (previewScroll) {
            // 1. Five podcast cards with inline '+' save button
            const cardsHtml = data.results.map(pod => {
              const feedUrl = pod.feedUrl || '';
              const isSubbed = state.feeds.includes(feedUrl);
              const title = pod.collectionName || 'Unknown';
              const artist = pod.artistName || '';
              const artwork = pod.artworkUrl60 || pod.artworkUrl100 || '';

              return `
                <div class="discover-preview-item" data-feed-url="${encodeURIComponent(feedUrl)}" data-title="${escapeHtml(title)}" data-artwork="${escapeHtml(artwork)}">
                  <img loading="lazy" decoding="async" width="48" height="48" src="${artwork}" alt="">
                  <div class="discover-preview-item-info">
                    <span class="discover-preview-title">${escapeHtml(title)}</span>
                    <span class="discover-preview-artist">${escapeHtml(artist)}</span>
                  </div>
                  <button type="button" class="discover-preview-add-btn ${isSubbed ? 'is-subbed' : ''}" title="${isSubbed ? 'Subscribed' : 'Save podcast'}" ${isSubbed ? 'disabled' : ''}>
                    ${isSubbed ? '✓' : '+'}
                  </button>
                </div>
              `;
            }).join('');

            // 2. Trailing 'see all in discover →' card in the same row
            const seeAllHtml = `
              <button type="button" class="discover-preview-see-all-card" id="btn-discover-see-all">
                <span>see all in discover</span>
                <span style="font-size: 1.1rem; line-height: 1;">→</span>
              </button>
            `;

            previewScroll.innerHTML = cardsHtml + seeAllHtml;

            // Clicking any card closes search & opens feed detail
            previewScroll.querySelectorAll('.discover-preview-item').forEach(item => {
              item.addEventListener('click', (ev) => {
                if (ev.target.closest('.discover-preview-add-btn')) return;
                const feedUrl = decodeURIComponent(item.dataset.feedUrl);
                if (feedUrl) {
                  dismissHeaderSearch();
                  if (!state.feedMetadata[feedUrl]) {
                    state.feedMetadata[feedUrl] = {
                      title: item.dataset.title || '',
                      author: '',
                      artwork: item.dataset.artwork || ''
                    };
                  }
                  openFeedDetail(feedUrl);
                }
              });
            });

            // Inline '+' / '✓' button
            previewScroll.querySelectorAll('.discover-preview-add-btn').forEach(btn => {
              btn.addEventListener('click', async (ev) => {
                ev.stopPropagation();
                const parent = btn.closest('.discover-preview-item');
                const feedUrl = decodeURIComponent(parent.dataset.feedUrl);
                const title = parent.dataset.title || '';
                const artwork = parent.dataset.artwork || '';

                if (feedUrl && !state.feeds.includes(feedUrl)) {
                  btn.textContent = '...';
                  await addFeed(feedUrl, title, artwork);
                  btn.textContent = '✓';
                  btn.classList.add('is-subbed');
                  btn.disabled = true;
                }
              });
            });

            // Clicking trailing 'see all in discover' closes search & navigates to discover tab
            const btnSeeAllEl = document.getElementById('btn-discover-see-all');
            btnSeeAllEl?.addEventListener('click', (ev) => {
              ev.stopPropagation();
              const term = q;
              dismissHeaderSearch();
              navigateTo('discover');
              window.scrollTo({ top: 0, behavior: 'smooth' });

              const discInput = document.getElementById('empty-quick-input');
              if (discInput && term) {
                discInput.value = term;
                const quickResults = document.getElementById('empty-quick-results');
                if (quickResults) searchPodcastDirectory(term, quickResults);
              }
            });
          }

          if (previewContainer) previewContainer.classList.remove('hidden');
        } catch (_) {}
      }, 650);
    });

    // Clicking anywhere outside closes the preview
    document.addEventListener('click', (e) => {
      if (!e.target.closest('#header-search') && previewContainer) {
        previewContainer.classList.add('hidden');
      }
    });

    // btnSeeAll?.addEventListener('click', () => {
    //   const q = elements.searchInput?.value.trim() || '';

    //   // 1. Clear general top search bar and state
    //   if (elements.searchInput) {
    //     elements.searchInput.value = '';
    //     elements.searchInput.blur();
    //   }
    //   state.searchQuery = '';
    //   if (elements.btnClearSearch) elements.btnClearSearch.classList.add('hidden');
    //   if (elements.searchBarWrap) elements.searchBarWrap.classList.remove('has-text');
    //   previewContainer?.classList.add('hidden');

    //   // 2. Switch to Discover tab & scroll to the top
    //   navigateTo('discover');
    //   window.scrollTo({ top: 0, behavior: 'smooth' });

    //   // 3. Populate Discover search & trigger results
    //   const discInput = document.getElementById('empty-quick-input');
    //   if (discInput && q) {
    //     discInput.value = q;
    //     const quickResults = document.getElementById('empty-quick-results');
    //     if (quickResults) searchPodcastDirectory(q, quickResults);
    //   }
    // });

    // document.addEventListener('click', (e) => {
    //   if (!e.target.closest('#header-search') && previewContainer) {
    //     previewContainer.classList.add('hidden');
    //   }
    // });

    if (elements.btnClearSearch) {
      elements.btnClearSearch.addEventListener('click', (e) => {
        e.stopPropagation();
        elements.searchInput.value = '';
        state.searchQuery = '';
        elements.btnClearSearch.classList.add('hidden');
        if (elements.searchBarWrap) {
          elements.searchBarWrap.classList.remove('has-text');
        }
        processAndSortEpisodes();
        renderTimeline();
        renderFeedsGrid();
        if (state.activeFeedDetailUrl) {
          renderFeedDetail(state.activeFeedDetailUrl);
        }
        renderOfflineStorageSettings();
        elements.searchInput.focus();
      });
    }

    elements.searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (elements.searchInput.value) {
          elements.btnClearSearch?.click();
        } else {
          elements.searchInput.blur();
        }
      }
    });

    if (elements.searchBarWrap) {
      elements.searchBarWrap.addEventListener('click', (e) => {
        if (e.target.closest('#btn-clear-search')) return;
        elements.searchInput.focus();
      });
    }

    elements.sortOrderSelect.addEventListener('change', (e) => {
      state.sortOrder = e.target.value;
      processAndSortEpisodes();
      renderTimeline();
      if (state.activeFeedDetailUrl) {
        renderFeedDetail(state.activeFeedDetailUrl);
      }
    });

    // elements.btnOpenAddModal.addEventListener('click', openAddModal);
    // elements.btnRefreshAll.addEventListener('click', refreshAllFeeds);

    if (elements.btnToggleContinue) {
      elements.btnToggleContinue.addEventListener('click', () => {
        const wasExpanded = !state.continueCollapsed;
        state.continueCollapsed = !state.continueCollapsed;
        renderContinueShelf();

        // If user collapsed it from the bottom, scroll back to the top of the shelf
        if (wasExpanded && elements.continueShelf) {
          elements.continueShelf.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      });
    }

    // if (elements.btnContinueStickyCollapse) {
    //   elements.btnContinueStickyCollapse.addEventListener('click', () => {
    //     state.continueCollapsed = true;
    //     renderContinueShelf();
    //     if (elements.continueShelf) {
    //       elements.continueShelf.scrollIntoView({ behavior: 'smooth', block: 'start' });
    //     }
    //   });
    // }

    if (elements.btnToggleEnlarge) {
      elements.btnToggleEnlarge.addEventListener('click', () => {
        const isEnlarged = elements.searchDirectoryResults && elements.searchDirectoryResults.classList.contains('is-enlarged');
        setDirectoryEnlarged(!isEnlarged);
      });
    }

    if (elements.btnAutoplayToggle) {
      const autoplayBtn = elements.btnAutoplayToggle || document.getElementById('btn-autoplay-toggle');
      if (autoplayBtn) {
        autoplayBtn.onclick = (e) => {
          e.preventDefault();
          e.stopPropagation();

          state.autoplayEnabled = !state.autoplayEnabled;
          localStorage.setItem(STORAGE_KEYS.AUTOPLAY, state.autoplayEnabled ? 'true' : 'false');

          updateAutoplayButtonUI();

          showToast(state.autoplayEnabled 
            ? `Autoplay ON (${state.playbackContext?.title || 'Timeline'})` 
            : 'Autoplay OFF'
          );

          if (elements.queueModal && !elements.queueModal.classList.contains('hidden')) {
            renderQueueModalContent();
          }
        };

        updateAutoplayButtonUI();
      }
    }


    if (elements.btnStickyCollapse) {
      elements.btnStickyCollapse.addEventListener('click', () => {
        setDirectoryEnlarged(false);
        if (elements.addModalBody) {
          const searchSec = elements.addModalBody.querySelector('#add-section-search');
          if (searchSec) {
            elements.addModalBody.scrollTo({ top: searchSec.offsetTop - 10, behavior: 'smooth' });
          }
        }
      });
    }

    if (elements.addModalNav && elements.addModalBody) {
      const navLinks = elements.addModalNav.querySelectorAll('.modal-scroll-link');
      navLinks.forEach(link => {
        link.addEventListener('click', () => {
          const targetId = link.getAttribute('data-target');
          const targetEl = elements.addModalBody.querySelector(targetId);
          if (targetEl) {
            elements.addModalBody.scrollTo({
              top: targetEl.offsetTop - 10,
              behavior: 'smooth'
            });
          }
          navLinks.forEach(l => l.classList.remove('active'));
          link.classList.add('active');
          if (targetId === '#add-section-search' && elements.podcastSearchQuery) {
            setTimeout(() => elements.podcastSearchQuery.focus(), 250);
          } else if (targetId === '#add-section-rss' && elements.feedUrlInput) {
            setTimeout(() => elements.feedUrlInput.focus(), 250);
          }
        });
      });

      elements.addModalBody.addEventListener('scroll', () => {
        const sections = elements.addModalBody.querySelectorAll('.add-modal-section');
        const scrollPos = elements.addModalBody.scrollTop + 60;
        sections.forEach(sec => {
          if (scrollPos >= sec.offsetTop && scrollPos < sec.offsetTop + sec.offsetHeight) {
            const id = '#' + sec.id;
            navLinks.forEach(l => {
              if (l.getAttribute('data-target') === id) {
                l.classList.add('active');
              } else {
                l.classList.remove('active');
              }
            });
          }
        });
      }, { passive: true });
    }

    let modalSearchDebounceTimer = null;
    if (elements.btnClearModalSearch && elements.podcastSearchQuery) {
      elements.podcastSearchQuery.addEventListener('input', () => {
        const val = elements.podcastSearchQuery.value.trim();
        elements.btnClearModalSearch.classList.toggle('hidden', !val);
        if (modalSearchDebounceTimer) clearTimeout(modalSearchDebounceTimer);
        if (val.length >= 3) {
          modalSearchDebounceTimer = setTimeout(() => {
            searchPodcastDirectory(val);
          }, 650);
        } else if (!val) {
          if (elements.searchDirectoryResults) {
            elements.searchDirectoryResults.innerHTML = buildStarterSuggestionsHTML('all');
            wireStarterSuggestionsEvents(elements.searchDirectoryResults);
          }
          if (elements.dirResultsTitle) {
            elements.dirResultsTitle.textContent = 'podcasts';
          }
        }
      });
      elements.btnClearModalSearch.addEventListener('click', () => {
        if (modalSearchDebounceTimer) clearTimeout(modalSearchDebounceTimer);
        elements.podcastSearchQuery.value = '';
        elements.btnClearModalSearch.classList.add('hidden');
        if (elements.searchDirectoryResults) {
          elements.searchDirectoryResults.innerHTML = buildStarterSuggestionsHTML('all');
          wireStarterSuggestionsEvents(elements.searchDirectoryResults);
        }
        if (elements.dirResultsTitle) {
          elements.dirResultsTitle.textContent = 'podcasts';
        }
        elements.podcastSearchQuery.focus();
      });
      elements.podcastSearchQuery.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
          if (modalSearchDebounceTimer) clearTimeout(modalSearchDebounceTimer);
          elements.podcastSearchQuery.value = '';
          elements.btnClearModalSearch.classList.add('hidden');
          if (elements.searchDirectoryResults) {
            elements.searchDirectoryResults.innerHTML = buildStarterSuggestionsHTML('all');
            wireStarterSuggestionsEvents(elements.searchDirectoryResults);
          }
          if (elements.dirResultsTitle) {
            elements.dirResultsTitle.textContent = 'podcasts';
          }
        }
      });
    }

    elements.btnCloseAdd.addEventListener('click', closeAddModal);
    if (elements.btnCancelAdd) {
      elements.btnCancelAdd.addEventListener('click', closeAddModal);
    }
    elements.btnSubmitFeed.addEventListener('click', () => {
      if (elements.feedUrlInput.value) {
        addFeed(elements.feedUrlInput.value);
        const origText = elements.btnSubmitFeed.textContent;
        elements.btnSubmitFeed.textContent = 'subscribed!';
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
          elements.btnSubmitFeed.textContent = 'subscribed!';
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
          if (elements.btnClearModalSearch) elements.btnClearModalSearch.classList.remove('hidden');
          searchPodcastDirectory(cat);
        }
        if (elements.addModalBody) {
          const searchSec = elements.addModalBody.querySelector('#add-section-search');
          if (searchSec) {
            elements.addModalBody.scrollTo({ top: searchSec.offsetTop - 10, behavior: 'smooth' });
          }
        }
        if (elements.addModalNav) {
          const links = elements.addModalNav.querySelectorAll('.modal-scroll-link');
          links.forEach(l => {
            if (l.getAttribute('data-target') === '#add-section-search') l.classList.add('active');
            else l.classList.remove('active');
          });
        }
      });
    });

    if (elements.btnOpenQueue) elements.btnOpenQueue.addEventListener('click', openQueueModal);
    if (elements.btnCloseQueue) elements.btnCloseQueue.addEventListener('click', closeQueueModal);
    if (elements.queueModal) {
      elements.queueModal.addEventListener('click', (e) => {
        if (e.target === elements.queueModal) closeQueueModal();
      });
    }

    if (elements.btnPlayerNotes) elements.btnPlayerNotes.addEventListener('click', () => openShowNotes(null, 'notes'));
    if (elements.btnPlayerFav) elements.btnPlayerFav.addEventListener('click', () => {
      if (state.currentEpisode) toggleFavoriteEpisode(state.currentEpisode);
    });
    if (elements.btnPlayerTranscript) elements.btnPlayerTranscript.addEventListener('click', () => openShowNotes(null, 'transcript'));
    
    if (elements.playerTitle) {
      elements.playerTitle.addEventListener('click', (e) => {
        e.stopPropagation();
        openShowNotes(null, 'notes');
      });
    }

    if (elements.playerPodcast) {
      elements.playerPodcast.addEventListener('click', (e) => {
        e.stopPropagation();
        if (state.currentEpisode && state.currentEpisode.feedUrl) {
          openFeedDetail(state.currentEpisode.feedUrl);
        }
      });
    }

    if (elements.playerArtwork) {
      elements.playerArtwork.addEventListener('click', (e) => {
        e.stopPropagation();
        openShowNotes(null, 'notes');
      });
    }

    if (elements.totalDurationLabel) {
      elements.totalDurationLabel.addEventListener('click', (e) => {
        e.stopPropagation();
        state.showRemainingTime = !state.showRemainingTime;
        updateProgress();
      });
    }

    if (elements.currentTimeLabel) {
      elements.currentTimeLabel.addEventListener('click', (e) => {
        e.stopPropagation();
      });
    }

    if (elements.btnCloseNotes) elements.btnCloseNotes.addEventListener('click', closeShowNotes);
    if (elements.showNotesModal) {
      elements.showNotesModal.addEventListener('click', (e) => {
        if (e.target === elements.showNotesModal) closeShowNotes();
      });
    }

    if (elements.tabBtnNotes) {
      elements.tabBtnNotes.addEventListener('click', () => switchShowNotesTab('notes'));
    }
    if (elements.tabBtnTranscript) {
      elements.tabBtnTranscript.addEventListener('click', () => switchShowNotesTab('transcript'));
    }
    // if (elements.transcriptSearchInput) {
    //   elements.transcriptSearchInput.addEventListener('input', (e) => {
    //     renderTranscriptView(e.target.value);
    //   });
    // }
    // if (elements.transcriptFileInput) {
    //   elements.transcriptFileInput.addEventListener('change', (e) => {
    //     const file = e.target.files && e.target.files[0];
    //     if (!file) return;
    //     const reader = new FileReader();
    //     reader.onload = (evt) => {
    //       const text = evt.target.result;
    //       const cues = parseVttOrSrtTimestamps(text);
    //       if (cues.length > 0) {
    //         state.episodeTimeline.cues = cues;
    //         state.episodeTimeline.transcriptSource = 'Upload';
    //         const dur = (elements.audio && elements.audio.duration) ? elements.audio.duration : state.episodeTimeline.duration;
    //         state.episodeTimeline.bars = deriveBarsFromCues(cues, dur, TIMELINE_BAR_COUNT);
    //         state.episodeTimeline.segments = deriveSegmentsFromCues(cues, dur);

    //         if (state.currentEpisode) {
    //           try {
    //             localStorage.setItem('anypod_timeline_' + state.currentEpisode.guid, JSON.stringify({
    //               bars: state.episodeTimeline.bars,
    //               segments: state.episodeTimeline.segments,
    //               cues: cues,
    //               transcriptSource: 'Upload'
    //             }));
    //           } catch (_) {}
    //           saveTimelineToCommunityCache(state.currentEpisode, dur, state.episodeTimeline.bars, state.episodeTimeline.segments, 'upload');
    //         }

    //         renderWaveformChart();
    //         renderTranscriptView();
    //       }
    //     };
    //     reader.readAsText(file);
    //   });
    // }

    function toggleCurrentPlayback() {
      if (state.currentEpisode) {
        toggleEpisodePlayback(state.currentEpisode);
      } else if (state.filteredEpisodes && state.filteredEpisodes.length > 0) {
        toggleEpisodePlayback(state.filteredEpisodes[0]);
      } else if (state.allEpisodes && state.allEpisodes.length > 0) {
        toggleEpisodePlayback(state.allEpisodes[0]);
      }
    }

    function seekRelative(offset) {
      if (state.activeEngine === 'audio' && elements.audio) {
        const dur = elements.audio.duration || 0;
        const cur = elements.audio.currentTime || 0;
        elements.audio.currentTime = Math.max(0, Math.min(dur || Infinity, cur + offset));
        updateProgress();
        if (state.experimentalSettings.enableVisualizer) renderWaveformChart();
      } else if (state.activeEngine === 'youtube' && state.ytPlayer && state.ytPlayer.getCurrentTime) {
        const cur = state.ytPlayer.getCurrentTime();
        state.ytPlayer.seekTo(Math.max(0, cur + offset), true);
        updateProgress();
        if (state.experimentalSettings.enableVisualizer) renderWaveformChart();
      }
    }

    function adjustPlayerVolume(delta) {
      if (elements.audio) {
        const newVol = Math.max(0, Math.min(1, elements.audio.volume + delta));
        elements.audio.volume = newVol;
        syncVolumeUI(newVol, elements.audio.muted);
        showStatus(`Volume ${Math.round(newVol * 100)}%`);
      }
    }

    function syncVolumeUI(vol, isMuted) {
      const effectiveVol = isMuted ? 0 : vol;
      const pct = Math.round(effectiveVol * 100);

      if (elements.volumeSlider) {
        elements.volumeSlider.value = isMuted ? 0 : vol;
      }
      if (elements.volumePercentLabel) {
        elements.volumePercentLabel.textContent = `${pct}%`;
      }

      const isZero = effectiveVol === 0 || isMuted;
      const isLow = effectiveVol > 0 && effectiveVol < 0.5 && !isMuted;
      const isHigh = effectiveVol >= 0.5 && !isMuted;

      [elements.btnPlayerVolume, elements.btnMiniVolume].forEach(btn => {
        if (!btn) return;
        const iconHigh = btn.querySelector('.icon-vol-high');
        const iconLow = btn.querySelector('.icon-vol-low');
        const iconMute = btn.querySelector('.icon-vol-mute');

        if (iconHigh) iconHigh.classList.toggle('hidden', !isHigh);
        if (iconLow) iconLow.classList.toggle('hidden', !isLow);
        if (iconMute) iconMute.classList.toggle('hidden', !isZero);
      });
    }

    function toggleVolumePopover(targetAnchor) {
      if (!elements.volumePopover) return;
      const card = elements.volumePopover;
      const isHidden = card.classList.contains('hidden');

      if (isHidden) {
        // Move popover into targetAnchor container if needed for proper positioning
        if (targetAnchor && card.parentElement !== targetAnchor) {
          targetAnchor.appendChild(card);
        }
        card.classList.remove('hidden');
        if (elements.audio) {
          syncVolumeUI(elements.audio.volume, elements.audio.muted);
        }
      } else {
        card.classList.add('hidden');
      }
    }

    if (elements.btnPlayerVolume) {
      elements.btnPlayerVolume.addEventListener('click', (e) => {
        e.stopPropagation();
        const wrap = elements.btnPlayerVolume.closest('.volume-popover-wrap');
        toggleVolumePopover(wrap);
      });
    }

    if (elements.btnMiniVolume) {
      elements.btnMiniVolume.addEventListener('click', (e) => {
        e.stopPropagation();
        const wrap = elements.btnMiniVolume.closest('.volume-popover-wrap');
        toggleVolumePopover(wrap);
      });
    }

    if (elements.volumeSlider) {
      elements.volumeSlider.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        if (elements.audio) {
          elements.audio.volume = val;
          if (val > 0 && elements.audio.muted) elements.audio.muted = false;
          syncVolumeUI(val, elements.audio.muted);
        }
      });
    }

    if (elements.btnVolumeMute) {
      elements.btnVolumeMute.addEventListener('click', (e) => {
        e.stopPropagation();
        togglePlayerMute();
      });
    }

    // Dismiss volume popover when clicking outside
    document.addEventListener('click', (e) => {
      if (elements.volumePopover && !elements.volumePopover.classList.contains('hidden')) {
        if (!e.target.closest('.volume-popover-wrap') && !e.target.closest('#volume-popover')) {
          elements.volumePopover.classList.add('hidden');
        }
      }
    });

    function togglePlayerMute() {
      if (elements.audio) {
        elements.audio.muted = !elements.audio.muted;
        syncVolumeUI(elements.audio.volume, elements.audio.muted);
        showStatus(elements.audio.muted ? 'Muted' : 'Unmuted');
      }
    }

    // Storage permission banner actions
    if (elements.btnRetryStorage) {
      elements.btnRetryStorage.addEventListener('click', async () => {
        // Try requesting storage access first in case the browser allows programmatic prompt
        if (typeof document.requestStorageAccess === 'function') {
          try { await document.requestStorageAccess(); } catch (_) {}
        }
        if (navigator.storage && typeof navigator.storage.persist === 'function') {
          try { await navigator.storage.persist(); } catch (_) {}
        }

        try {
          const testKey = '__storage_test__';
          window.localStorage.setItem(testKey, '1');
          window.localStorage.removeItem(testKey);
          isStorageBlocked = false;
          if (elements.storagePermissionBanner) elements.storagePermissionBanner.classList.add('hidden');
          showStatus('Storage access enabled! Reloading to load your saved data...');
          setTimeout(() => window.location.reload(), 600);
        } catch (_) {
          showStatus('Still blocked. Please click the crossed eye icon (🚫👁️) in your Chrome URL bar and choose "Allow".');
        }
      });
    }

    if (elements.btnDismissStorage) {
      elements.btnDismissStorage.addEventListener('click', () => {
        if (elements.storagePermissionBanner) elements.storagePermissionBanner.classList.add('hidden');
      });
    }

    // Modern 2026 Player Keyboard Shortcuts (Spotify / Apple Podcasts / YouTube UX)
    document.addEventListener('keydown', (e) => {
      // 1. Modals & Detail Navigation Escape
      if (e.key === 'Escape') {
        if (elements.showNotesModal && !elements.showNotesModal.classList.contains('hidden')) {
          closeShowNotes();
          return;
        } else if (elements.queueModal && !elements.queueModal.classList.contains('hidden')) {
          closeQueueModal();
          return;
        } else if (elements.sleepModal && !elements.sleepModal.classList.contains('hidden')) {
          closeSleepModal();
          return;
        } else if (elements.addModal && !elements.addModal.classList.contains('hidden')) {
          closeAddModal();
          return;
        } else if (elements.confirmModal && !elements.confirmModal.classList.contains('hidden')) {
          elements.confirmModal.classList.add('hidden');
          return;
        } else if (state.activeFeedDetailUrl) {
          navigateBack();
          return;
        }
      }

      // Ignore when user is actively typing in inputs or contenteditable areas
      const target = e.target;
      const tag = (target && target.tagName ? target.tagName : '').toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select' || (target && target.isContentEditable)) {
        return;
      }
      // Ignore OS-level modifier combos (Cmd+C, Ctrl+V, Alt+Tab, etc.)
      if (e.metaKey || e.ctrlKey || e.altKey) {
        return;
      }

      // 2. Play / Pause: Space or 'k' (prevents page scrolling on Space)
      if (e.code === 'Space' || e.key === ' ' || e.key === 'k' || e.key === 'K') {
        e.preventDefault();
        toggleCurrentPlayback();
        return;
      }

      // 3. Skip 10s: ArrowLeft / ArrowRight or 'j' / 'l'
      if (!e.shiftKey && (e.key === 'ArrowLeft' || e.key === 'j' || e.key === 'J')) {
        e.preventDefault();
        seekRelative(-10);
        return;
      }
      if (!e.shiftKey && (e.key === 'ArrowRight' || e.key === 'l' || e.key === 'L')) {
        e.preventDefault();
        seekRelative(10);
        return;
      }

      // 4. Next / Previous Episode: Shift + ArrowRight / Shift + ArrowLeft, or 'n' / 'p'
      if ((e.shiftKey && e.key === 'ArrowRight') || e.key === 'n' || e.key === 'N') {
        e.preventDefault();
        skipToNextEpisode(false);
        return;
      }
      if ((e.shiftKey && e.key === 'ArrowLeft') || e.key === 'p' || e.key === 'P') {
        e.preventDefault();
        if (state.activeEngine === 'audio' && elements.audio) {
          elements.audio.currentTime = 0;
        } else if (state.activeEngine === 'youtube' && state.ytPlayer && state.ytPlayer.seekTo) {
          state.ytPlayer.seekTo(0, true);
        }
        updateProgress();
        if (state.experimentalSettings.enableVisualizer) renderWaveformChart();
        return;
      }

      // 5. Volume Control: ArrowUp / ArrowDown
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        adjustPlayerVolume(0.05);
        return;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        adjustPlayerVolume(-0.05);
        return;
      }

      // 6. Mute Toggle: 'm'
      if (e.key === 'm' || e.key === 'M') {
        e.preventDefault();
        togglePlayerMute();
        return;
      }
    });

    elements.opmlFileInput.addEventListener('change', (e) => {
      if (e.target.files.length > 0) importOpml(e.target.files[0]);
    });
    elements.btnExportOpml.addEventListener('click', exportOpml);

    if (elements.btnLoadDefaults) {
      elements.btnLoadDefaults.addEventListener('click', async () => {
        showStatus('Adding recommended starter feeds...');
        const searchTerms = ["NASA's Curious Universe", "The Climate Question", "Radiolab", "Forschung aktuell"];
        for (const term of searchTerms) {
          try {
            let data = null;
            try {
              const res = await fetch(`/api/search-directory?term=${encodeURIComponent(term)}&limit=1`);
              if (res.ok) data = await res.json();
            } catch (_) {}

            // if (!data || !data.results || data.results.length === 0) {
            //   try {
            //     const res = await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(term)}&entity=podcast&limit=1`);
            //     if (res.ok) data = await res.json();
            //   } catch (_) {}
            // }

            if (data && data.results && data.results[0] && data.results[0].feedUrl) {
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

    // Replace elements.btnClearDownloads listener:
    if (elements.btnClearDownloads) {
      elements.btnClearDownloads.addEventListener('click', () => {
        const count = Object.keys(state.downloadedEpisodes || {}).length;
        if (count === 0) return;
        openConfirmDialog({
          title: 'Remove Downloads',
          message: `Remove all ${count} downloaded podcast episodes from this device?`,
          actionLabel: 'Remove All',
          onConfirm: () => {
            clearAllDownloads();
          }
        });
      });
    }

    if (elements.btnReloadCache) {
      elements.btnReloadCache.addEventListener('click', async () => {
        showStatus('Refreshing app cache & checking updates...');
        try {
          if ('caches' in window) {
            const keys = await caches.keys();
            await Promise.all(
              keys.map(k => k !== 'anypod-audio-v1' ? caches.delete(k) : Promise.resolve())
            );
          }
          if ('serviceWorker' in navigator) {
            const registrations = await navigator.serviceWorker.getRegistrations();
            for (const reg of registrations) {
              await reg.update();
            }
          }
        } catch (err) {
          console.warn('Cache refresh error:', err);
        }
        window.location.reload(true);
      });
    }

    // Replace elements.btnClearStorage listener:
    if (elements.btnClearStorage) {
      elements.btnClearStorage.addEventListener('click', () => {
        openConfirmDialog({
          title: 'Reset Library & Storage',
          message: 'Are you sure you want to clear all feeds, queue, and stored listening history on this device?',
          actionLabel: 'Reset Everything',
          onConfirm: () => {
            localStorage.clear();
            if ('caches' in window) {
              caches.delete('anypod-audio-v1').catch(() => {});
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
      });
    }

    if (elements.btnPlayerShare) {
      elements.btnPlayerShare.addEventListener('click', (e) => {
        e.stopPropagation();
        shareCurrentEpisode();
      });
    }

    if (elements.miniOpenQueue) {
      elements.miniOpenQueue.addEventListener('click', (e) => {
        e.stopPropagation();
        openQueueModal();
      });
    }

    if (elements.miniPlayerShare) {
      elements.miniPlayerShare.addEventListener('click', (e) => {
        e.stopPropagation();
        shareCurrentEpisode();
      });
    }

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

    let lastScrollY = window.scrollY;
    let scrollCollapseTimer = null;

    window.addEventListener('scroll', () => {
      const currentScrollY = Math.max(0, window.scrollY);
      const delta = currentScrollY - lastScrollY;
      lastScrollY = currentScrollY;

      // Ignore bounce / elastic overscroll
      if (currentScrollY <= 0 || delta <= 30) return;

      if (scrollCollapseTimer) return;
      scrollCollapseTimer = setTimeout(() => {
        scrollCollapseTimer = null;
        if (Date.now() - (state._lastPlayerExpandTime || 0) < 3000) return;

        if (document.body.classList.contains('has-active-episode')) {
          if (currentScrollY > 260 && !document.body.classList.contains('has-mini-player')) {
            setPlayerCollapsed(true, false);
          }
        }
      }, 150);
    }, { passive: true });



    wireEmptyStateEvents();
  }

  function openAddModal() {
    elements.addModal.classList.remove('hidden');
    if (elements.addModalBody) {
      elements.addModalBody.scrollTop = 0;
    }
    if (elements.addModalNav) {
      const links = elements.addModalNav.querySelectorAll('.modal-scroll-link');
      links.forEach((l, idx) => {
        if (idx === 0) l.classList.add('active');
        else l.classList.remove('active');
      });
    }
    if (window.innerWidth > 768 && elements.podcastSearchQuery) {
      elements.podcastSearchQuery.focus();
    }
    if (!elements.podcastSearchQuery.value.trim() && elements.searchDirectoryResults) {
      elements.searchDirectoryResults.innerHTML = buildStarterSuggestionsHTML('all');
      wireStarterSuggestionsEvents(elements.searchDirectoryResults);
    }
    window.history.pushState({ modal: 'add' }, '', window.location.hash);
  }

  function closeAddModal() {
    setDirectoryEnlarged(false);
    elements.podcastSearchQuery.value = '';
    if (elements.btnClearModalSearch) {
      elements.btnClearModalSearch.classList.add('hidden');
    }
    elements.searchDirectoryResults.innerHTML = '';
    elements.feedUrlInput.value = '';
    if (elements.modalSubgenreChips) {
      elements.modalSubgenreChips.innerHTML = '';
      elements.modalSubgenreChips.classList.add('hidden');
    }
    if (elements.dirResultsTitle) {
      elements.dirResultsTitle.textContent = 'podcasts';
    }
    document.querySelectorAll('#modal-category-chips .category-chip').forEach(c => c.classList.remove('active'));
    if (elements.addModalNav) {
      const links = elements.addModalNav.querySelectorAll('.modal-scroll-link');
      links.forEach((l, idx) => {
        if (idx === 0) l.classList.add('active');
        else l.classList.remove('active');
      });
    }
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

    const terms = q.split(/\s+/).filter(t => t.length >= 2);
    if (terms.length === 0) return safe;

    const pattern = terms.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
    const regex = new RegExp(`(${pattern})`, 'gi');
    return safe.replace(regex, '<mark class="search-highlight">$1</mark>');
  }

  function formatHighlightedDesc(fullText, query) {
    if (!fullText) return '';
    // Strip HTML tags for card snippet view if full content was provided
    let cleanText = fullText.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    if (!query || query.trim().length < 2) {
      return escapeHtml(cleanText.length > 240 ? cleanText.substring(0, 240) + '…' : cleanText);
    }
    const q = query.trim();
    const lowerText = cleanText.toLowerCase();
    const terms = q.toLowerCase().split(/\s+/).filter(t => t.length >= 2);

    // Find earliest match index among all query terms
    let matchIdx = -1;
    for (const term of terms) {
      const idx = lowerText.indexOf(term);
      if (idx !== -1 && (matchIdx === -1 || idx < matchIdx)) {
        matchIdx = idx;
      }
    }

    if (matchIdx === -1) {
      return escapeHtml(cleanText.length > 240 ? cleanText.substring(0, 240) + '…' : cleanText);
    }

    if (matchIdx <= 120) {
      const snippet = cleanText.length > 260 ? cleanText.slice(0, 260).trim() + ' …' : cleanText;
      return highlightText(snippet, q);
    }

    const startIdx = Math.max(0, cleanText.lastIndexOf(' ', matchIdx - 35));
    const endIdx = Math.min(cleanText.length, cleanText.indexOf(' ', matchIdx + 160));
    const actualEnd = endIdx === -1 ? cleanText.length : endIdx;

    const prefix = startIdx > 0 ? '… ' : '';
    const suffix = actualEnd < cleanText.length ? ' …' : '';
    const excerpt = prefix + cleanText.slice(startIdx, actualEnd).trim() + suffix;

    return highlightText(excerpt, q);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // SECTION 30 · Full-Episode Waveform & Speech/Music Timeline Chart
  //
  // 1. Interactive SoundCloud-style full-episode waveform canvas scrubber.
  // 2. Background audio probe using HTTP Range requests + Web Audio API.
  // 3. Classifies timeline segments into 🎙️ Speech (talking) vs 🎵 Music.
  // 4. Color-coded timeline bars across the entire episode (0:00 to end).
  // 5. Jump to next music / jump to next talk buttons.
  // 6. Caches episode timeline analysis permanently in localStorage.
  // ─────────────────────────────────────────────────────────────────────────

  const TIMELINE_BAR_COUNT = 240;

  function loadExperimentalSettings() {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.EXPERIMENTAL);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed.showJumpButtons !== undefined) {
          state.experimentalSettings.showJumpButtons = !!parsed.showJumpButtons;
        }
        if (parsed.autoSkipSpeech !== undefined){
          state.experimentalSettings.autoSkipSpeech = !!parsed.autoSkipSpeech;
        }
        if (parsed.enableAudioClassifier !== undefined) {
          state.experimentalSettings.enableAudioClassifier = !!parsed.enableAudioClassifier;
        }
        if (parsed.enableTranscript !== undefined) {
          state.experimentalSettings.enableTranscript = !!parsed.enableTranscript;
        }
        if (parsed.enableLiveTranscript !== undefined) {
          state.experimentalSettings.enableLiveTranscript = !!parsed.enableLiveTranscript;
        }
      }
    } catch (_) {}
    state.experimentalSettings.enableVisualizer = true;
    syncExperimentalUI();
  }

  function saveExperimentalSettings() {
    try {
      localStorage.setItem(STORAGE_KEYS.EXPERIMENTAL, JSON.stringify(state.experimentalSettings));
    } catch (_) {}
  }

  function syncExperimentalUI() {
    const es = state.experimentalSettings;
    const showButtons = !!es.showJumpButtons;
    const isVis = !!es.enableVisualizer;
    const isClass = !!es.enableAudioClassifier;
    const isTrans = !!es.enableTranscript;
    const isAutoSkip = !!es.autoSkipSpeech;
    const isLiveTrans = !!es.enableLiveTranscript;

    const toggleJump = document.getElementById('toggle-jump-buttons');
    if (toggleJump) toggleJump.checked = showButtons;
    if (elements.toggleVisualizer) elements.toggleVisualizer.checked = isVis;
    if (elements.toggleClassifier) elements.toggleClassifier.checked = isClass;
    if (elements.toggleAutoSkip) elements.toggleAutoSkip.checked = !!es.autoSkipSpeech;
    if (elements.toggleTranscript) elements.toggleTranscript.checked = isTrans;
    if (elements.toggleLiveTranscript) elements.toggleLiveTranscript.checked = isLiveTrans;
    // Show live transcript row only when classifier is enabled (needs segment data)
    if (elements.rowLiveTranscript) {
      elements.rowLiveTranscript.style.display = isClass ? '' : 'none';
    }

    if (elements.btnPlayerTranscript) {
      elements.btnPlayerTranscript.style.display = isTrans ? '' : 'none';
    }
    const epTranscriptBtns = document.querySelectorAll('.btn-transcript-ep');
    epTranscriptBtns.forEach(btn => {
      btn.style.display = isTrans ? '' : 'none';
    });

    const skipRow = document.getElementById('row-auto-skip');
    if (skipRow) skipRow.style.opacity = isClass ? '1' : '0.4';

    if (elements.timeScrubber) {
      elements.timeScrubber.classList.toggle('has-waveform', isVis);
      elements.timeScrubber.classList.toggle('has-classifier', isClass);
    }

    if (elements.waveformTimelineWrap) {
      elements.waveformTimelineWrap.style.display = isVis ? 'flex' : 'none';
    }
    if (elements.seekBar) {
      elements.seekBar.style.display = 'block';
    }

    if (elements.timelineLegend) {
      elements.timelineLegend.classList.toggle('hidden', !showButtons);
    }

    if (elements.btnJumpSpeech) {
      elements.btnJumpSpeech.classList.toggle('auto-skip-active', isAutoSkip);
    }
    if (elements.btnJumpMusic) {
      elements.btnJumpMusic.classList.toggle('auto-skip-active', isAutoSkip);
    }

    if (isVis) {
      renderWaveformChart();
    }
  }

  function setupExperimentalSettings() {
    const toggleJump = document.getElementById('toggle-jump-buttons');
    if (toggleJump) {
      toggleJump.addEventListener('change', () => {
        state.experimentalSettings.showJumpButtons = toggleJump.checked;
        saveExperimentalSettings();
        syncExperimentalUI();
      });
    }
    if (elements.toggleVisualizer) {
      elements.toggleVisualizer.addEventListener('change', () => {
        state.experimentalSettings.enableVisualizer = elements.toggleVisualizer.checked;
        saveExperimentalSettings();
        syncExperimentalUI();
        if (state.experimentalSettings.enableVisualizer && state.currentEpisode) {
          initOrLoadEpisodeTimeline(state.currentEpisode, state.episodeTimeline.duration);
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
        if (state.currentEpisode && state.experimentalSettings.enableAudioClassifier) {
          probeEpisodeAudio(state.currentEpisode, state.episodeTimeline.duration);
        } else if (!state.experimentalSettings.enableAudioClassifier) {
          renderWaveformChart();
        }
      });
    }
    if (elements.toggleAutoSkip) {
      elements.toggleAutoSkip.addEventListener('change', () => {
        state.experimentalSettings.autoSkipSpeech = elements.toggleAutoSkip.checked;
        saveExperimentalSettings();
      });
    }
    if (elements.toggleTranscript) {
      elements.toggleTranscript.addEventListener('change', () => {
        state.experimentalSettings.enableTranscript = elements.toggleTranscript.checked;
        saveExperimentalSettings();
        syncExperimentalUI();
      });
    }
    if (elements.toggleLiveTranscript) {
      elements.toggleLiveTranscript.addEventListener('change', () => {
        state.experimentalSettings.enableLiveTranscript = elements.toggleLiveTranscript.checked;
        saveExperimentalSettings();
        if (state.experimentalSettings.enableLiveTranscript) {
          liveTranscription.start();
        } else {
          liveTranscription.stop();
        }
      });
    }
  }

  // ── Baseline Waveform Generator ─────────────────────────────────────────

  function generateBaselineBars(guid, count) {
    const bars = [];
    let seed = 42;
    for (let c = 0; c < (guid || '').length; c++) {
      seed = (seed * 31 + guid.charCodeAt(c)) & 0x7fffffff;
    }
    const rand = () => {
      seed = (seed * 16807) % 2147483647;
      return (seed - 1) / 2147483646;
    };

    // Realistic podcast pattern:
    // - Intro music first ~3%
    // - Discussion with natural conversational pauses
    // - Short music interlude mid-way
    // - Outro music last ~4%
    const midInterludeStart = 0.48;
    const midInterludeEnd = 0.51;

    for (let i = 0; i < count; i++) {
      const pos = i / count;
      const isIntro = pos < 0.035;
      const isOutro = pos > 0.955;
      const isMidMusic = pos >= midInterludeStart && pos <= midInterludeEnd;
      const isMusic = isIntro || isOutro || isMidMusic;

      // Natural speech envelope with high-resolution dynamics
      const speechEnvelope = 0.38 + Math.sin(pos * Math.PI) * 0.22;
      const cadence = Math.sin(i * 0.85) * 0.15;
      const microVariance = (rand() - 0.5) * 0.35;
      const height = isMusic
        ? Math.min(0.92, Math.max(0.35, 0.55 + Math.sin(i * 0.5) * 0.25))
        : Math.min(1.0, Math.max(0.12, speechEnvelope + cadence + microVariance));

      bars.push({
        height: parseFloat(height.toFixed(2)),
        type: isMusic ? 'music' : 'speech'
      });
    }
    return bars;
  }

  // ── Timeline Initialization & Rendering ─────────────────────────────────

  function initOrLoadEpisodeTimeline(episode, duration) {
    if (!episode || !episode.guid) return;
    if (!state.experimentalSettings.enableVisualizer) return;
    const dur = (duration && duration > 0) ? duration : 1800; // fallback 30m if unknown

    if (state.episodeTimeline.guid === episode.guid && state.episodeTimeline.bars.length > 0) {
      state.episodeTimeline.duration = dur;
      renderWaveformChart();
      return;
    }

    state.episodeTimeline.guid = episode.guid;
    state.episodeTimeline.duration = dur;

    // Check localStorage cache (v4 prefix for calibrated FFT classifier)
    const cacheKey = 'anypod_timeline_v4_' + episode.guid;
    try {
      const cached = localStorage.getItem(cacheKey);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (parsed.bars && parsed.bars.length > 0) {
          state.episodeTimeline.bars = parsed.bars;
          state.episodeTimeline.segments = parsed.segments || [];
          state.episodeTimeline.cues = parsed.cues || [];
          state.episodeTimeline.transcriptSource = (parsed.cues && parsed.cues.length > 0) ? (parsed.transcriptSource || 'Cache') : '';
          renderWaveformChart();
          return;
        }
      }
    } catch (_) {}

    // Generate initial baseline bars so scrubber is immediately interactive
    state.episodeTimeline.bars = generateBaselineBars(episode.guid, TIMELINE_BAR_COUNT);
    state.episodeTimeline.segments = deriveSegmentsFromBars(state.episodeTimeline.bars, dur);
    state.episodeTimeline.cues = [];
    state.episodeTimeline.transcriptSource = '';
    renderWaveformChart();

    // Cascading Free-Tier Pipeline: Tier 1 (RSS Transcript) -> Tier 2 (D1 Community Cache) -> Tier 3 (Client Probe)
    fetchTimelineFromPipeline(episode, dur);
  }

  // ── Cascading Free-Tier Pipeline ────────────────────────────────────────

  async function fetchTimelineFromPipeline(episode, duration) {
    if (!episode || !episode.guid) return;
    const cacheKey = 'anypod_timeline_v4_' + episode.guid;

    // TIER 1: Check Podcasting 2.0 <podcast:transcript>
    if (episode.transcriptUrl) {
      if (elements.probeStatusPill) {
        elements.probeStatusPill.textContent = 'Reading transcript...';
        elements.probeStatusPill.classList.remove('hidden');
      }

      try {
        const proxyUrl = `/api/transcript-proxy?url=${encodeURIComponent(episode.transcriptUrl)}`;
        const res = await fetch(proxyUrl);
        if (res.ok) {
          const vttText = await res.text();
          const cues = parseVttOrSrtTimestamps(vttText);
          if (cues.length > 5) {
            const bars = deriveBarsFromCues(cues, duration, TIMELINE_BAR_COUNT);
            const segments = deriveSegmentsFromCues(cues, duration);

            state.episodeTimeline.bars = bars;
            state.episodeTimeline.segments = segments;
            state.episodeTimeline.cues = cues;
            state.episodeTimeline.transcriptSource = 'RSS';

            try {
              localStorage.setItem(cacheKey, JSON.stringify({ bars, segments, cues, transcriptSource: 'RSS' }));
            } catch (_) {}

            renderWaveformChart();

            // Seed community cache in D1
            saveTimelineToCommunityCache(episode, duration, bars, segments, 'transcript', episode.transcriptUrl);

            if (elements.probeStatusPill) {
              elements.probeStatusPill.textContent = '✓ RSS Transcript';
              setTimeout(() => {
                if (elements.probeStatusPill) elements.probeStatusPill.classList.add('hidden');
              }, 2500);
            }
            return;
          }
        }
      } catch (_) {
        // Fall through to Tier 2
      }
    }

    // TIER 2: Check Cloudflare D1 Community Cache
    try {
      if (elements.probeStatusPill) {
        elements.probeStatusPill.textContent = 'Checking community...';
        elements.probeStatusPill.classList.remove('hidden');
      }

      const res = await fetch(`/api/community-transcripts?guid=${encodeURIComponent(episode.guid)}`);
      if (res.ok) {
        const data = await res.json();
        if (data.found && data.bars && data.bars.length > 0) {
          state.episodeTimeline.bars = data.bars;
          state.episodeTimeline.segments = data.segments || [];

          try {
            localStorage.setItem(cacheKey, JSON.stringify({
              bars: data.bars,
              segments: data.segments || []
            }));
          } catch (_) {}

          renderWaveformChart();

          if (elements.probeStatusPill) {
            elements.probeStatusPill.textContent = '✓ Community Cached';
            setTimeout(() => {
              if (elements.probeStatusPill) elements.probeStatusPill.classList.add('hidden');
            }, 2500);
          }
          return;
        }
      }
    } catch (_) {
      // Fall through to Tier 3
    }

    // TIER 3: Fallback to Client-side Probing if Classifier is Enabled
    if (state.experimentalSettings.enableAudioClassifier) {
      probeEpisodeAudio(episode, duration);
    } else {
      if (elements.probeStatusPill) elements.probeStatusPill.classList.add('hidden');
    }
  }

  function parseVttOrSrtTimestamps(text) {
    if (!text || typeof text !== 'string') return [];
    const cues = [];
    const timeRegex = /(?:(\d{1,2}):)?(\d{2}):(\d{2})[.,](\d{3})\s*-->\s*(?:(\d{1,2}):)?(\d{2}):(\d{2})[.,](\d{3})/;
    const blocks = text.split(/\r?\n\r?\n/);

    for (const block of blocks) {
      const lines = block.trim().split(/\r?\n/);
      if (lines.length < 2) continue;

      let timeLineIdx = -1;
      let match = null;

      for (let l = 0; l < lines.length; l++) {
        match = lines[l].match(timeRegex);
        if (match) {
          timeLineIdx = l;
          break;
        }
      }

      if (timeLineIdx !== -1 && match) {
        const startH = parseInt(match[1] || '0', 10);
        const startM = parseInt(match[2], 10);
        const startS = parseInt(match[3], 10);
        const startMs = parseInt(match[4], 10);
        const startSec = startH * 3600 + startM * 60 + startS + startMs / 1000;

        const endH = parseInt(match[5] || '0', 10);
        const endM = parseInt(match[6], 10);
        const endS = parseInt(match[7], 10);
        const endMs = parseInt(match[8], 10);
        const endSec = endH * 3600 + endM * 60 + endS + endMs / 1000;

        const textPayload = lines.slice(timeLineIdx + 1).join(' ').replace(/<[^>]+>/g, '').trim();

        if (endSec > startSec) {
          cues.push({
            start: startSec,
            end: endSec,
            text: textPayload,
            type: 'speech'
          });
        }
      }
    }
    return cues;
  }

  function deriveBarsFromCues(cues, duration, count) {
    const bars = [];
    const dur = duration > 0 ? duration : 1800;
    const barSec = dur / count;

    for (let i = 0; i < count; i++) {
      const bStart = i * barSec;
      const bEnd = (i + 1) * barSec;
      let speechDuration = 0;

      for (const cue of cues) {
        if (cue.end > bStart && cue.start < bEnd) {
          const overlap = Math.min(cue.end, bEnd) - Math.max(cue.start, bStart);
          if (overlap > 0) speechDuration += overlap;
        }
      }

      const speechRatio = speechDuration / barSec;
      const isSpeech = speechRatio > 0.2;
      const height = isSpeech ? Math.min(0.95, 0.4 + speechRatio * 0.5) : (i < 3 || i > count - 4 ? 0.65 : 0.28);
      bars.push({
        height: parseFloat(height.toFixed(2)),
        type: isSpeech ? 'speech' : 'music'
      });
    }
    return bars;
  }

  function deriveSegmentsFromCues(cues, duration) {
    if (!cues || cues.length === 0) return [];
    const consolidated = [];
    let cur = { start: cues[0].start, end: cues[0].end, type: 'speech' };

    for (let i = 1; i < cues.length; i++) {
      if (cues[i].start <= cur.end + 3.0) {
        cur.end = Math.max(cur.end, cues[i].end);
      } else {
        consolidated.push(cur);
        cur = { start: cues[i].start, end: cues[i].end, type: 'speech' };
      }
    }
    consolidated.push(cur);

    const fullTimeline = [];
    let lastEnd = 0;

    for (const seg of consolidated) {
      if (seg.start > lastEnd + 4.0) {
        fullTimeline.push({
          start: Math.round(lastEnd),
          end: Math.round(seg.start),
          type: 'music'
        });
      }
      fullTimeline.push({
        start: Math.round(seg.start),
        end: Math.round(seg.end),
        type: 'speech'
      });
      lastEnd = seg.end;
    }

    if (duration > lastEnd + 4.0) {
      fullTimeline.push({
        start: Math.round(lastEnd),
        end: Math.round(duration),
        type: 'music'
      });
    }

    return fullTimeline;
  }

  async function saveTimelineToCommunityCache(episode, duration, bars, segments, source, transcriptUrl) {
    if (!episode || !episode.guid) return;
    try {
      fetch('/api/community-transcripts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          episodeGuid: episode.guid,
          feedUrl: episode.feedUrl || '',
          duration: duration || 0,
          bars: bars || [],
          segments: segments || [],
          transcriptUrl: transcriptUrl || '',
          source: source || 'probe'
        })
      }).catch(() => {});
    } catch (_) {}
  }

  function deriveSegmentsFromBars(bars, duration) {
    if (!bars || bars.length === 0) return [];
    const segments = [];
    const barSec = duration / bars.length;
    let currentType = bars[0].type;
    let startSec = 0;

    for (let i = 1; i < bars.length; i++) {
      if (bars[i].type !== currentType) {
        segments.push({
          start: Math.round(startSec),
          end: Math.round(i * barSec),
          type: currentType
        });
        currentType = bars[i].type;
        startSec = i * barSec;
      }
    }
    segments.push({
      start: Math.round(startSec),
      end: Math.round(duration),
      type: currentType
    });

    return segments;
  }

  let _waveformRafId = null;

  function renderWaveformChart() {
    // Battery Guard: skip canvas calculations and repaints when tab/screen is inactive
    if (!state.experimentalSettings.enableVisualizer || document.hidden || !state.isTabActive) {
      return;
    }

    // Prevent stacking duplicate animation frames during rapid updates
    if (_waveformRafId) cancelAnimationFrame(_waveformRafId);

    _waveformRafId = requestAnimationFrame(() => {
      _waveformRafId = null;

      const canvas = elements.episodeWaveformCanvas;
      const wrap = elements.waveformTimelineWrap;
      if (!canvas || !wrap) return;

      // Use cached/fixed 32px height instead of reading canvas.clientHeight (eliminates forced reflow)
      const w = wrap.clientWidth || 500;
      const h = 32; 
      const dpr = window.devicePixelRatio || 1;

      const targetWidth = Math.floor(w * dpr);
      const targetHeight = Math.floor(h * dpr);

      if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
        canvas.width = targetWidth;
        canvas.height = targetHeight;
      }

      const ctx = canvas.getContext('2d');
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);

      const bars = state.episodeTimeline.bars;
      if (!bars || bars.length === 0) return;

      // Calculate current playhead progress
      let curSec = 0;
      let totalDur = state.episodeTimeline.duration || 0;
      if (state.activeEngine === 'audio' && elements.audio) {
        curSec = elements.audio.currentTime || 0;
        if (!totalDur && elements.audio.duration && isFinite(elements.audio.duration)) {
          totalDur = elements.audio.duration;
        }
      } else if (state.activeEngine === 'youtube' && state.ytPlayer && state.ytPlayer.getCurrentTime) {
        curSec = state.ytPlayer.getCurrentTime() || 0;
        if (!totalDur && state.ytPlayer.getDuration) {
          totalDur = state.ytPlayer.getDuration();
        }
      }
      const curPct = (totalDur > 0) ? Math.min(1, Math.max(0, curSec / totalDur)) : (state.episodeTimeline.progressPct || 0);
      const playheadX = curPct * w;

      const barWidth = w / bars.length;
      const gap = 1.2;
      const drawWidth = Math.max(1.2, barWidth - gap);
      const showClassifier = !!state.experimentalSettings.enableAudioClassifier;

      // Detect light vs dark theme for contrast
      const isLight = document.documentElement.getAttribute('data-theme') === 'light' || 
                      (!document.documentElement.getAttribute('data-theme') && window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches);

      let activeModeAtPlayhead = 'speech';

      for (let i = 0; i < bars.length; i++) {
        const b = bars[i];
        const barH = Math.max(3, Math.round(b.height * (h - 2)));
        const x = i * barWidth + (gap / 2);
        const y = h - barH;

        const isPlayed = (x + drawWidth * 0.5) <= playheadX;
        if (isPlayed) {
          activeModeAtPlayhead = b.type || 'speech';
        }

        let color;
        if (showClassifier && b.type === 'music') {
          color = isPlayed ? '#a855f7' : (isLight ? 'rgba(168, 85, 247, 0.40)' : 'rgba(168, 85, 247, 0.35)');
        } else if (showClassifier && b.type === 'speech') {
          color = isPlayed ? '#f97316' : (isLight ? 'rgba(249, 115, 22, 0.40)' : 'rgba(249, 115, 22, 0.35)');
        } else {
          color = isPlayed ? '#f97316' : (isLight ? 'rgba(24, 24, 27, 0.22)' : 'rgba(255, 255, 255, 0.28)');
        }

        ctx.fillStyle = color;
        const r = Math.min(drawWidth / 2, 1.5);
        if (typeof ctx.roundRect === 'function') {
          ctx.beginPath();
          ctx.roundRect(x, y, drawWidth, barH, [r, r, 0, 0]);
          ctx.fill();
        } else {
          ctx.fillRect(x, y, drawWidth, barH);
        }
      }

      if (elements.btnJumpSpeech && elements.btnJumpMusic) {
        elements.btnJumpSpeech.classList.toggle('is-active-mode', activeModeAtPlayhead === 'speech');
        elements.btnJumpMusic.classList.toggle('is-active-mode', activeModeAtPlayhead === 'music');
      }
    });
  }

  // ── Live Caption Popup helpers ────────────────────────────────────────────
  let _captionHideTimer = null;
  let _captionDismissed = false;  // user manually closed it

  function _showLiveCaption(text) {
    console.log('[Caption] _showLiveCaption() called. dismissed=', _captionDismissed, ' text="' + text?.slice(0,50) + '"');
    if (_captionDismissed) {
      console.log('[Caption] ❌ dismissed by user, skipped.');
      return;
    }
    const popup   = elements.liveCaptionPopup;
    const textEl  = elements.liveCaptionText;
    console.log('[Caption] popup el=', popup, '  textEl=', textEl);
    if (!popup || !textEl) {
      console.warn('[Caption] ❌ DOM elements not found! liveCaptionPopup=', document.getElementById('live-caption-popup'));
      return;
    }

    textEl.textContent = text;
    popup.classList.remove('hidden');
    console.log('[Caption] ✅ caption shown. popup classes=', popup.className);

    // Auto-hide after 8 s of no new cues
    if (_captionHideTimer) clearTimeout(_captionHideTimer);
    _captionHideTimer = setTimeout(() => {
      if (popup) popup.classList.add('hidden');
    }, 8000);
  }


  function _hideLiveCaption(dismiss = false) {
    if (dismiss) _captionDismissed = true;
    if (_captionHideTimer) { clearTimeout(_captionHideTimer); _captionHideTimer = null; }
    if (elements.liveCaptionPopup) elements.liveCaptionPopup.classList.add('hidden');
  }

  // Wire the × close button (done once at startup)
  // console.log('[Caption] Startup check — liveCaptionPopup=', elements.liveCaptionPopup, '  btnCloseCaption=', elements.btnCloseCaption);
  if (elements.btnCloseCaption) {
    elements.btnCloseCaption.addEventListener('click', () => _hideLiveCaption(true));
  } else {
    console.warn('[Caption] ⚠️ btnCloseCaption not found in DOM — caption popup may not work!');
  }

  // ── Live Transcription Engine (Cloudflare AI Whisper) ───────────────────
  // Captures the podcast audio stream directly from the <audio> element
  // using audio.captureStream() + MediaRecorder.
  // Every CHUNK_SEC seconds the blob is POSTed to /api/transcribe which runs
  // @cf/openai/whisper on Cloudflare AI and returns the transcript text.
  // No microphone permission required.

  const liveTranscription = (() => {
    const CHUNK_SEC  = 8;    // record 8 s at a time
    const MIME_TYPES = [     // prefer formats CF Whisper handles well
      'audio/webm;codecs=opus',
      'audio/webm',
      'audio/ogg;codecs=opus',
      'audio/mp4'
    ];

    let mediaRecorder = null;
    let audioStream   = null;
    let active        = false;
    let guidForSession = null;
    let chunkStart    = 0;   // audio.currentTime when this chunk started recording
    let chunkTimer    = null;

    // ── helpers ─────────────────────────────────────────────────────────────

    function _currentTime() {
      if (state.activeEngine === 'audio' && elements.audio) return elements.audio.currentTime || 0;
      return 0;
    }

    function _persistCues() {
      if (!guidForSession) return;
      try {
        const stored = JSON.parse(localStorage.getItem('anypod_live_cues_' + guidForSession) || '[]');
        const existingStarts = new Set(stored.map(c => c.start));
        const newCues = (state.episodeTimeline.cues || []).filter(c => c.live && !existingStarts.has(c.start));
        localStorage.setItem('anypod_live_cues_' + guidForSession, JSON.stringify([...stored, ...newCues]));
      } catch (_) {}
    }

    function _addCue(text, startSec, endSec) {
      console.log('[LiveTranscript] _addCue() text=', JSON.stringify(text?.slice(0, 60)));
      if (!text || !text.trim()) return;
      const trimmed = text.trim();
      const cues = state.episodeTimeline.cues;
      if (cues.length > 0 && cues[cues.length - 1].text === trimmed) {
        console.log('[LiveTranscript] _addCue() duplicate, skipped.');
        return;
      }
      cues.push({ start: Math.round(startSec), end: Math.round(endSec + 0.5), text: trimmed, live: true });
      console.log('[LiveTranscript] _addCue() ✅ cue added. total=', cues.length);
      if (state.experimentalSettings.enableTranscript) renderTranscriptView();
      _persistCues();
      _showLiveCaption(trimmed);
    }

    // POST recorded blob → /api/transcribe → add cue
    async function _sendChunk(blob, startSec, endSec) {
      if (!blob || blob.size < 500) {
        console.log('[LiveTranscript] chunk too small, skipping:', blob?.size, 'bytes');
        return;
      }
      console.log(`[LiveTranscript] 📤 sending chunk ${blob.size} bytes  [${startSec.toFixed(1)}s → ${endSec.toFixed(1)}s]`);

      const lang = (state.currentEpisode && state.currentEpisode.language) || 'en';
      try {
        const res = await fetch('/api/transcribe', {
          method: 'POST',
          headers: {
            'Content-Type': blob.type || 'audio/webm',
            'X-Episode-Lang': lang
          },
          body: blob
        });

        const data = await res.json();
        console.log('[LiveTranscript] 📥 Whisper response:', data);

        if (!res.ok) {
          console.warn('[LiveTranscript] /api/transcribe error:', data.error);
          return;
        }

        const text = (data.text || '').trim();
        if (text) {
          _addCue(text, startSec, endSec);
        }
      } catch (e) {
        console.warn('[LiveTranscript] fetch /api/transcribe failed:', e.message);
      }
    }

    // Pick the best supported MIME type for MediaRecorder
    function _chooseMime() {
      for (const mime of MIME_TYPES) {
        if (MediaRecorder.isTypeSupported(mime)) return mime;
      }
      return '';   // browser default
    }

    // Start recording one CHUNK_SEC chunk from the audio element
    function _startChunk() {
      if (!active || !elements.audio || elements.audio.paused) return;

      // Capture the audio element stream
      let stream = audioStream;
      if (!stream) {
        try {
          stream = elements.audio.captureStream
            ? elements.audio.captureStream()
            : elements.audio.mozCaptureStream
              ? elements.audio.mozCaptureStream()
              : null;
        } catch (e) {
          console.warn('[LiveTranscript] captureStream() failed:', e.message);
        }
        if (!stream) {
          console.warn('[LiveTranscript] ❌ captureStream() not supported on this browser/OS.');
          if (elements.probeStatusPill) {
            elements.probeStatusPill.textContent = '⚠️ Live transcript not supported here';
            elements.probeStatusPill.classList.remove('hidden');
            setTimeout(() => elements.probeStatusPill?.classList.add('hidden'), 3000);
          }
          active = false;
          return;
        }
        audioStream = stream;
      }

      // Create new MediaRecorder for this chunk
      if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        try { mediaRecorder.stop(); } catch (_) {}
      }

      const mime = _chooseMime();
      const chunks = [];
      const chunkStartTime = _currentTime();
      chunkStart = chunkStartTime;

      try {
        mediaRecorder = new MediaRecorder(stream, mime ? { mimeType: mime } : {});
      } catch (e) {
        console.warn('[LiveTranscript] MediaRecorder creation failed:', e.message);
        active = false;
        return;
      }

      mediaRecorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunks.push(e.data);
      };

      mediaRecorder.onstop = () => {
        const endTime = _currentTime();
        const blob = new Blob(chunks, { type: mime || 'audio/webm' });
        console.log(`[LiveTranscript] 🎙 chunk stopped. ${chunks.length} parts, ${blob.size} bytes`);
        _sendChunk(blob, chunkStart, endTime);

        // Schedule next chunk if still active & playing
        if (active && state.playbackStatus === 'playing') {
          chunkTimer = setTimeout(_startChunk, 200);
        }
      };

      mediaRecorder.onerror = (e) => {
        console.warn('[LiveTranscript] MediaRecorder error:', e.error?.message || e);
      };

      console.log(`[LiveTranscript] ▶ recording chunk, mime="${mime || 'default'}" duration=${CHUNK_SEC}s`);
      mediaRecorder.start();

      // Stop after CHUNK_SEC seconds to send to Whisper
      chunkTimer = setTimeout(() => {
        if (mediaRecorder && mediaRecorder.state === 'recording') {
          mediaRecorder.stop();
        }
      }, CHUNK_SEC * 1000);

      // Show pill
      if (elements.probeStatusPill) {
        elements.probeStatusPill.textContent = '🎙 Transcribing…';
        elements.probeStatusPill.classList.remove('hidden');
      }
    }

    function _stopRecording() {
      if (chunkTimer) { clearTimeout(chunkTimer); chunkTimer = null; }
      if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        try { mediaRecorder.stop(); } catch (_) {}
      }
      mediaRecorder = null;
      // Don't release the stream — captureStream() is tied to the audio element
      audioStream = null;
      if (elements.probeStatusPill) elements.probeStatusPill.classList.add('hidden');
    }

    // ── Public API ───────────────────────────────────────────────────────────

    function start() {
      active = true;
      guidForSession = state.currentEpisode ? state.currentEpisode.guid : null;

      // Restore persisted cues from previous session
      if (guidForSession && state.episodeTimeline.cues.length === 0) {
        try {
          const stored = JSON.parse(localStorage.getItem('anypod_live_cues_' + guidForSession) || '[]');
          if (stored.length > 0) {
            state.episodeTimeline.cues = stored;
            if (state.experimentalSettings.enableTranscript) renderTranscriptView();
          }
        } catch (_) {}
      }

      if (state.playbackStatus === 'playing') _startChunk();
    }

    function stop() {
      active = false;
      _stopRecording();
    }

    function onPlayStateChange(isPlaying) {
      if (!active) return;
      if (isPlaying) {
        _startChunk();
      } else {
        _stopRecording();
      }
    }

    function onTimeUpdate(/* currentTime */) {
      // Nothing needed — chunk-based approach handles timing via stop/start
    }

    function onEpisodeChange(episode) {
      _stopRecording();
      audioStream = null;
      guidForSession = episode ? episode.guid : null;
      chunkStart = 0;

      // Load persisted cues for the new episode
      if (guidForSession && active) {
        try {
          const stored = JSON.parse(localStorage.getItem('anypod_live_cues_' + guidForSession) || '[]');
          if (stored.length > 0 && state.episodeTimeline.cues.length === 0) {
            state.episodeTimeline.cues = stored;
            if (state.experimentalSettings.enableTranscript) renderTranscriptView();
          }
        } catch (_) {}
      }

      if (active && state.playbackStatus === 'playing') {
        setTimeout(_startChunk, 600);
      }
    }

    return { start, stop, onPlayStateChange, onTimeUpdate, onEpisodeChange };
  })();


  // ── Background Audio Probing Engine ─────────────────────────────────────
  // Samples points across the audio file using HTTP Range requests through
  // /api/audio-proxy, decoding in a background AudioContext to measure
  // spectral flux, energy variance, and speech/music distribution.

  let activeProbeAbortController = null;

  async function probeEpisodeAudio(episode, duration) {
    if (!episode || !episode.audioUrl || episode.isYouTube) {
      if (elements.probeStatusPill) elements.probeStatusPill.classList.add('hidden');
      return;
    }
    // Do not run background probes if classifier is disabled or screen is already hidden
    if (!state.experimentalSettings.enableAudioClassifier || document.hidden || !state.isTabActive) {
      if (elements.probeStatusPill) elements.probeStatusPill.classList.add('hidden');
      return;
    }

    if (activeProbeAbortController) {
      activeProbeAbortController.abort();
    }
    activeProbeAbortController = new AbortController();
    const { signal } = activeProbeAbortController;

    state.episodeTimeline.isProbing = true;
    if (elements.probeStatusPill) {
      elements.probeStatusPill.textContent = 'Scanning spectrum...';
      elements.probeStatusPill.classList.remove('hidden');
    }

    // Use OfflineAudioContext: in-memory only, no OS audio channel lock
    const OfflineCtx = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    if (!OfflineCtx) {
      if (elements.probeStatusPill) elements.probeStatusPill.classList.add('hidden');
      state.episodeTimeline.isProbing = false;
      return;
    }

    const NUM_PROBES = 24;
    const CHUNK_SIZE = 49152; // 48 KB
    let offlineCtx = null;

    try {
      offlineCtx = new OfflineCtx(1, 44100, 44100);

      let totalBytes = duration * 16000;
      try {
        const headRes = await fetch(`/api/audio-proxy?url=${encodeURIComponent(episode.audioUrl)}`, {
          method: 'HEAD',
          signal
        });
        const cl = headRes.headers.get('content-length');
        if (cl && parseInt(cl, 10) > 100000) {
          totalBytes = parseInt(cl, 10);
        }
      } catch (_) {}

      const barsPerProbe = Math.ceil(state.episodeTimeline.bars.length / NUM_PROBES);

      for (let p = 0; p < NUM_PROBES; p++) {
        // Halt immediately if aborted, hidden, or tab goes inactive
        if (signal.aborted || document.hidden || !state.isTabActive) break;

        const probePos = p / NUM_PROBES;
        const startByte = Math.max(0, Math.floor(probePos * (totalBytes - CHUNK_SIZE - 2048)));
        const endByte = startByte + CHUNK_SIZE - 1;

        // Update scan progress bar (inside waveform area — visible in large player)
        const pct = Math.round((p / NUM_PROBES) * 100);
        const scanBar  = document.getElementById('scan-progress-bar');
        const scanFill = document.getElementById('scan-progress-fill');
        const scanLbl  = document.getElementById('scan-progress-label');
        if (scanBar)  scanBar.classList.remove('hidden');
        if (scanFill) scanFill.style.width = `${pct}%`;
        if (scanLbl)  scanLbl.textContent   = `Scanning ${pct}%`;

        if (elements.probeStatusPill) {
          elements.probeStatusPill.textContent = `Analyzing spectrum ${pct}%`;
        }

        try {
          const chunkRes = await fetch(`/api/audio-proxy?url=${encodeURIComponent(episode.audioUrl)}`, {
            headers: {
              Range: `bytes=${startByte}-${endByte}`
            },
            signal
          });

          if (chunkRes.ok || chunkRes.status === 206) {
            const buf = await chunkRes.arrayBuffer();
            let audioBuffer = null;

            try {
              audioBuffer = await offlineCtx.decodeAudioData(buf.slice(0));
            } catch (_) {}

            if (audioBuffer && audioBuffer.length > 0) {
              const channel = audioBuffer.getChannelData(0);
              const analysis = analyzePcmSnippet(channel, audioBuffer.sampleRate);

              const startSec = Math.round((p / NUM_PROBES) * duration);
              const meta = analysis._meta || {};
              console.log(`[AudioClassifier] Probe ${p + 1}/${NUM_PROBES} (~${Math.floor(startSec / 60)}:${String(startSec % 60).padStart(2, '0')}) -> ${analysis.type.toUpperCase()}`, {
                type: analysis.type,
                override: meta.override || 'none',
                musicScore: meta.musicScore,
                speechScore: meta.speechScore,
                bassRatio: meta.bassRatio ? Number(meta.bassRatio.toFixed(3)) : 0,
                speechCoreRatio: meta.speechCoreRatio ? Number(meta.speechCoreRatio.toFixed(3)) : 0,
                highRatio: meta.highRatio ? Number(meta.highRatio.toFixed(3)) : 0,
                dynamicRange: meta.dynamicRange ? Number(meta.dynamicRange.toFixed(3)) : 0,
                harmonicRatio: meta.harmonicRatio ? Number(meta.harmonicRatio.toFixed(3)) : 0,
                flatness: meta.flatness ? Number(meta.flatness.toFixed(3)) : 0,
                rolloffHz: meta.rolloffHz ? Math.round(meta.rolloffHz) : 0,
                centroidHz: meta.centroid ? Math.round(meta.centroid) : 0
              });

              const startBarIdx = p * barsPerProbe;
              const endBarIdx = Math.min(state.episodeTimeline.bars.length, startBarIdx + barsPerProbe);

              for (let b = startBarIdx; b < endBarIdx; b++) {
                if (state.episodeTimeline.bars[b]) {
                  state.episodeTimeline.bars[b].type = analysis.type;
                  state.episodeTimeline.bars[b].height = Math.max(0.2, analysis.energy);
                }
              }
              renderWaveformChart();
            }
          }
        } catch (err) {
          if (signal.aborted) return;
        }

        await new Promise(r => setTimeout(r, 60));
      }

      state.episodeTimeline.segments = deriveSegmentsFromBars(state.episodeTimeline.bars, duration);
      console.log(`[AudioClassifier] Episode analysis complete. Consolidated segments:`);
      if (console.table) {
        console.table(state.episodeTimeline.segments.map(s => ({
          type: s.type,
          start: `${Math.floor(s.start / 60)}:${String(s.start % 60).padStart(2, '0')}`,
          end: `${Math.floor(s.end / 60)}:${String(s.end % 60).padStart(2, '0')}`,
          duration: `${Math.round(s.end - s.start)}s`
        })));
      }

      // Hide scan progress bar
      const scanBarDone = document.getElementById('scan-progress-bar');
      const scanFillDone = document.getElementById('scan-progress-fill');
      if (scanFillDone) scanFillDone.style.width = '100%';
      setTimeout(() => {
        if (scanBarDone) scanBarDone.classList.add('hidden');
        if (scanFillDone) scanFillDone.style.width = '0%';
      }, 600);

      try {
        localStorage.setItem('anypod_timeline_v4_' + episode.guid, JSON.stringify({
          bars: state.episodeTimeline.bars,
          segments: state.episodeTimeline.segments
        }));
      } catch (_) {}

      saveTimelineToCommunityCache(episode, duration, state.episodeTimeline.bars, state.episodeTimeline.segments, 'probe');

      if (elements.probeStatusPill) {
        elements.probeStatusPill.textContent = '✓ Indexed for Community';
        setTimeout(() => {
          if (elements.probeStatusPill) elements.probeStatusPill.classList.add('hidden');
        }, 2500);
      }

    } catch (e) {
    } finally {
      // Ensure scan bar is hidden even on error
      const scanBarErr = document.getElementById('scan-progress-bar');
      if (scanBarErr) scanBarErr.classList.add('hidden');
      state.episodeTimeline.isProbing = false;
    }
  }

  // ── PCM Spectral & Energy Analyzer (FFT-based) ───────────────────────────
  // Computes a power-spectrum via a compact DFT over evenly-spaced windows,
  // then derives: spectral centroid, flatness (Wiener entropy), rolloff, and
  // sub-band energy ratios.  Much more reliable than pure time-domain ZCR.

  function _fftPowerSpectrum(samples, sampleRate) {
    // Use a power-of-2 window for speed.  Take the first 4096 samples max.
    const N = Math.min(4096, samples.length);
    const N2 = N >> 1;            // number of useful magnitude bins
    const real = new Float32Array(N);
    const imag = new Float32Array(N);

    // Hann window
    for (let i = 0; i < N; i++) {
      const hann = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N);
      real[i] = samples[i] * hann;
    }

    // Cooley-Tukey in-place radix-2 DIT FFT
    // Bit-reversal permutation
    let j = 0;
    for (let i = 1; i < N; i++) {
      let bit = N >> 1;
      for (; j & bit; bit >>= 1) j ^= bit;
      j ^= bit;
      if (i < j) {
        [real[i], real[j]] = [real[j], real[i]];
        [imag[i], imag[j]] = [imag[j], imag[i]];
      }
    }

    // FFT butterfly
    for (let len = 2; len <= N; len <<= 1) {
      const ang = (2 * Math.PI) / len;
      const wRe = Math.cos(ang);
      const wIm = -Math.sin(ang);
      for (let i = 0; i < N; i += len) {
        let uRe = 1, uIm = 0;
        for (let k = 0; k < (len >> 1); k++) {
          const a = i + k;
          const b = a + (len >> 1);
          const tRe = uRe * real[b] - uIm * imag[b];
          const tIm = uRe * imag[b] + uIm * real[b];
          real[b] = real[a] - tRe;
          imag[b] = imag[a] - tIm;
          real[a] += tRe;
          imag[a] += tIm;
          const tmp = uRe * wRe - uIm * wIm;
          uIm = uRe * wIm + uIm * wRe;
          uRe = tmp;
        }
      }
    }

    // Power spectrum (magnitude² normalised)
    const mag = new Float32Array(N2);
    const binHz = sampleRate / N;
    for (let i = 0; i < N2; i++) {
      mag[i] = real[i] * real[i] + imag[i] * imag[i];
    }
    return { mag, binHz, N2 };
  }

  function analyzePcmSnippet(samples, sampleRate) {
    const len = samples.length;
    if (len === 0) return { type: 'speech', energy: 0.1 };

    // ── 1. Time-domain RMS ───────────────────────────────────────────────────
    let sumSq = 0;
    for (let i = 0; i < len; i++) sumSq += samples[i] * samples[i];
    const rms = Math.sqrt(sumSq / len);
    if (rms < 0.008) return { type: 'silence', energy: 0.05 };

    // ── 2. Median-based dynamic range (robust to broadcast compression) ──────
    // min/max is fooled by heavily compressed broadcast audio (like NPR).
    // Compute per-window RMS, sort, use 10th-pct vs 90th-pct spread instead.
    const winSize = Math.floor(sampleRate * 0.08); // 80ms windows
    const numWins = Math.max(2, Math.floor(len / winSize));
    const winRmsArr = new Float32Array(numWins);
    for (let w = 0; w < numWins; w++) {
      let wSq = 0;
      const off = w * winSize;
      for (let j = 0; j < winSize && off + j < len; j++) {
        const s = samples[off + j]; wSq += s * s;
      }
      winRmsArr[w] = Math.sqrt(wSq / winSize);
    }
    winRmsArr.sort();
    const p10 = winRmsArr[Math.floor(numWins * 0.10)];
    const p90 = winRmsArr[Math.floor(numWins * 0.90)];
    const dynamicRange = (p90 - p10) / (rms + 1e-6);
    // speech: dynamicRange typically 0.6-2.5; music (compressed): 0.1-0.8

    // ── 3. FFT spectral analysis ──────────────────────────────────────────────
    const { mag, binHz, N2 } = _fftPowerSpectrum(samples, sampleRate);
    const EPS = 1e-12;

    let totalPower = 0, weightedFreqSum = 0, logSum = 0;
    // Sub-bands (Hz):  deep-bass | bass | low-mid | speech-core | presence | air
    //                  <80       | <300 | <1000   | <4000       | <8000    | rest
    let eDeep = 0, eSub = 0, eLow = 0, eSpeech = 0, eHigh = 0, eAir = 0;

    for (let i = 1; i < N2; i++) {
      const hz = i * binHz;
      const p  = mag[i] + EPS;
      totalPower      += p;
      weightedFreqSum += hz * p;
      logSum          += Math.log(p);
      if      (hz < 80)   eDeep   += p;
      else if (hz < 300)  eSub    += p;
      else if (hz < 1000) eLow    += p;
      else if (hz < 4000) eSpeech += p;
      else if (hz < 8000) eHigh   += p;
      else                eAir    += p;
    }

    const centroid       = weightedFreqSum / (totalPower + EPS);
    const geoMean        = Math.exp(logSum / N2);
    const arithMean      = totalPower / N2;
    const flatness       = geoMean / (arithMean + EPS);  // 0 = pure tone, ~1 = noise

    // Sub-band ratios
    const speechCoreRatio = eSpeech / (totalPower + EPS);
    const highRatio       = (eHigh + eAir) / (totalPower + EPS);
    const bassRatio       = (eDeep + eSub) / (totalPower + EPS);   // deep+sub bass
    const lowMidRatio     = eLow / (totalPower + EPS);

    // Spectral rolloff (85th percentile)
    let rolloffHz = binHz, cumPow = 0;
    const rolloffTarget = 0.85 * totalPower;
    for (let i = 1; i < N2; i++) {
      cumPow += mag[i];
      if (cumPow >= rolloffTarget) { rolloffHz = i * binHz; break; }
    }

    // ── 4. Spectral variance (spread around centroid) ────────────────────────
    // Speech has tight formant peaks → low variance relative to centroid.
    // Music (especially broadband electronic) has higher variance.
    let varSum = 0;
    for (let i = 1; i < N2; i++) {
      const hz = i * binHz;
      const p  = mag[i] + EPS;
      varSum += p * (hz - centroid) * (hz - centroid);
    }
    const spectralVar = Math.sqrt(varSum / (totalPower + EPS)); // Hz std-dev

    // ── 5. Harmonic comb detection (periodicity → music) ────────────────────
    // Scan for evenly-spaced magnitude peaks in the bass-to-mid range
    // (kick drum harmonics, bass notes, synth fundamentals).
    // Count how many of the expected harmonics show up above threshold.
    let harmonicScore = 0;
    const fundamental = Math.max(50, centroid * 0.15);  // rough fundamental guess
    const harmThresh  = (totalPower / N2) * 3;          // 3× mean power
    let harmChecked = 0;
    for (let h = 1; h <= 8; h++) {
      const hHz = fundamental * h;
      if (hHz > sampleRate / 2) break;
      const bin = Math.round(hHz / binHz);
      if (bin > 0 && bin < N2) {
        harmChecked++;
        // Check bin ±2 for a peak
        const peakPow = Math.max(mag[Math.max(0, bin - 2)], mag[bin], mag[Math.min(N2 - 1, bin + 2)]);
        if (peakPow > harmThresh) harmonicScore++;
      }
    }
    const harmonicRatio = harmChecked > 0 ? harmonicScore / harmChecked : 0;  // 0-1

    // ── 6. Hard override rules (single conditions strong enough to decide) ────
    //
    // HARD MUSIC: bass + treble simultaneously = impossible for speech
    const hasBass    = bassRatio > 0.12;
    const hasTreble  = highRatio > 0.10;
    const hasMidFill = (eLow + eSpeech) / (totalPower + EPS) > 0.30;
    // If energy is spread across bass, mid, AND treble → music, period
    if (hasBass && hasTreble && hasMidFill) {
      return {
        type: 'music',
        energy: Math.min(1.0, Math.max(0.15, rms * 5)),
        _meta: { rms, dynamicRange, centroid, flatness, rolloffHz, speechCoreRatio, highRatio, bassRatio, harmonicRatio, musicScore: 99, speechScore: 0, override: 'broadband' }
      };
    }

    // HARD SPEECH: near-zero sub-bass + narrow rolloff = almost certainly speech
    if (bassRatio < 0.04 && rolloffHz < 4000 && dynamicRange > 0.7) {
      return {
        type: 'speech',
        energy: Math.min(1.0, Math.max(0.15, rms * 5)),
        _meta: { rms, dynamicRange, centroid, flatness, rolloffHz, speechCoreRatio, highRatio, bassRatio, harmonicRatio, musicScore: 0, speechScore: 99, override: 'narrowband' }
      };
    }

    // ── 7. Scored classification ──────────────────────────────────────────────

    let musicScore = 0;

    // Bass presence — still a music indicator but less dominant
    // (lowered thresholds to avoid false‑music on spoken audio)
    if (bassRatio > 0.30)                                 musicScore += 3;
    else if (bassRatio > 0.18)                            musicScore += 2;
    else if (bassRatio > 0.10)                            musicScore += 1;



    // Harmonic periodicity — very reliable music indicator
    if (harmonicRatio > 0.6)                              musicScore += 3;
    else if (harmonicRatio > 0.4)                         musicScore += 2;
    else if (harmonicRatio > 0.25)                        musicScore += 1;

    // Sustained high-frequency content
    if (highRatio > 0.20)                                 musicScore += 2;
    else if (highRatio > 0.10)                            musicScore += 1;

    // Rolloff covers most of the audible spectrum
    if (rolloffHz > 6000)                                 musicScore += 2;
    else if (rolloffHz > 4500)                            musicScore += 1;

    // Spectral flatness: broad harmonic content
    if (flatness > 0.08)                                  musicScore += 2;
    else if (flatness > 0.04)                             musicScore += 1;

    // Spectral spread (std-dev around centroid) — broadband = music
    if (spectralVar > 2500)                               musicScore += 2;
    else if (spectralVar > 1500)                          musicScore += 1;

    // Compressed DR — only counts when combined with other music signals
    if (dynamicRange < 0.4)                               musicScore += 1;

    let speechScore = 0;

    // Speech‑core score – give it weight even when bass is present,
    // because spoken audio often contains low‑frequency rumble.
    if (speechCoreRatio > 0.55)                           speechScore += 4;
    else if (speechCoreRatio > 0.40)                      speechScore += 2;
    else if (speechCoreRatio > 0.25)                      speechScore += 1;

    // High dynamic range → pauses between words/sentences
    if (dynamicRange > 1.2)                               speechScore += 3;
    else if (dynamicRange > 0.8)                          speechScore += 1;

    // Very low sub-bass confirms voice
    if (bassRatio < 0.04)                                 speechScore += 3;
    else if (bassRatio < 0.08)                            speechScore += 1;

    // Rolloff in voice band
    if (rolloffHz < 3500)                                 speechScore += 2;
    else if (rolloffHz < 5000)                            speechScore += 1;

    // Centroid in voice formant range
    if (centroid > 200 && centroid < 2500)                speechScore += 1;

    // Require music to win clearly
    const isMusic = musicScore >= 6 && musicScore > speechScore + 2;

    return {
      type: isMusic ? 'music' : 'speech',
      energy: Math.min(1.0, Math.max(0.15, rms * 5)),
      _meta: { rms, dynamicRange, centroid, flatness, rolloffHz, speechCoreRatio, highRatio, bassRatio, harmonicRatio, spectralVar, musicScore, speechScore }
    };
  }

  // ── Segment Navigation (Jump to Music / Talk) ───────────────────────────

  function jumpToNextSegment(targetType) {
    if (!state.currentEpisode) return;

    let curTime = 0;
    if (state.activeEngine === 'audio') {
      curTime = elements.audio.currentTime || 0;
    } else if (state.activeEngine === 'youtube' && state.ytPlayer && state.ytPlayer.getCurrentTime) {
      curTime = state.ytPlayer.getCurrentTime() || 0;
    }

    const segments = state.episodeTimeline.segments || [];
    // Find next segment of targetType after current time + 4 seconds
    const nextSeg = segments.find(s => s.type === targetType && s.start > curTime + 4);

    if (nextSeg) {
      if (state.activeEngine === 'audio') {
        elements.audio.currentTime = nextSeg.start;
      } else if (state.activeEngine === 'youtube' && state.ytPlayer && state.ytPlayer.seekTo) {
        state.ytPlayer.seekTo(nextSeg.start, true);
      }
      updateProgress();
      if (elements.probeStatusPill) {
        elements.probeStatusPill.textContent = `⏭ Jumped to ${targetType === 'music' ? 'Music 🎵' : 'Talk 🎙️'} (${formatTime(nextSeg.start)})`;
        elements.probeStatusPill.classList.remove('hidden');
        setTimeout(() => elements.probeStatusPill.classList.add('hidden'), 2500);
      }
    } else {
      if (elements.probeStatusPill) {
        elements.probeStatusPill.textContent = `No more ${targetType} segments ahead`;
        elements.probeStatusPill.classList.remove('hidden');
        setTimeout(() => elements.probeStatusPill.classList.add('hidden'), 2000);
      }
    }
  }

  // ── Waveform Scrubber Interactivity ─────────────────────────────────────

  function setupWaveformInteractivity() {
    const wrap = elements.waveformTimelineWrap;
    if (!wrap) return;

    let isDragging = false;
    let cachedWrapRect = null;
    let seekDebounceTimer = null;
    let lastTargetSec = 0;

    const applySeekToEngine = (targetSec) => {
      state._lastDrawnWaveformBarIndex = -1;
      if (state.activeEngine === 'audio') {
        elements.audio.currentTime = targetSec;
      } else if (state.activeEngine === 'youtube' && state.ytPlayer && state.ytPlayer.seekTo) {
        state.ytPlayer.seekTo(targetSec, true);
      }
      updateProgress();
      if (state.experimentalSettings.enableVisualizer) {
        renderWaveformChart();
      }
    };

    const seekToPoint = (clientX, immediate = false) => {
      if (!cachedWrapRect) cachedWrapRect = wrap.getBoundingClientRect();
      const pct = Math.max(0, Math.min(1, (clientX - cachedWrapRect.left) / cachedWrapRect.width));

      let totalDur = 0;
      if (state.activeEngine === 'audio' && elements.audio.duration && isFinite(elements.audio.duration)) {
        totalDur = elements.audio.duration;
      } else if (state.activeEngine === 'youtube' && state.ytPlayer && state.ytPlayer.getDuration) {
        totalDur = state.ytPlayer.getDuration();
      } else if (state.episodeTimeline.duration > 0) {
        totalDur = state.episodeTimeline.duration;
      }

      if (totalDur > 0) {
        const targetSec = pct * totalDur;
        lastTargetSec = targetSec;

        // Visual update is immediate for fluid UI response:
        const progressOverlay = document.getElementById('waveform-progress-overlay');
        const playheadLine = document.getElementById('waveform-playhead-line');
        if (progressOverlay) progressOverlay.style.width = `${pct * 100}%`;
        if (playheadLine) playheadLine.style.left = `${pct * 100}%`;
        if (elements.currentTimeLabel) elements.currentTimeLabel.textContent = formatTime(targetSec);
        if (elements.seekBar) {
          elements.seekBar.value = pct * 100;
          elements.seekBar.style.setProperty('--seek-pct', `${pct * 100}%`);
        }

        if (immediate) {
          clearTimeout(seekDebounceTimer);
          seekDebounceTimer = null;
          applySeekToEngine(targetSec);
        } else {
          // Debounce continuous drag to prevent Range-request network flood and stalled decoding
          clearTimeout(seekDebounceTimer);
          seekDebounceTimer = setTimeout(() => {
            applySeekToEngine(lastTargetSec);
          }, 120);
        }
      }
    };

    wrap.addEventListener('mousedown', (e) => {
      if (e.target && (e.target.id === 'total-duration' || e.target.id === 'current-time')) return;
      isDragging = true;
      cachedWrapRect = wrap.getBoundingClientRect();
      // Single tap / initial click jumps directly!
      seekToPoint(e.clientX, true);
    });

    window.addEventListener('mousemove', (e) => {
      if (isDragging) seekToPoint(e.clientX, false);
    });

    window.addEventListener('mouseup', () => {
      if (isDragging) {
        isDragging = false;
        clearTimeout(seekDebounceTimer);
        applySeekToEngine(lastTargetSec);
      }
      cachedWrapRect = null;
    });

    // Touch events
    wrap.addEventListener('touchstart', (e) => {
      if (e.target && (e.target.id === 'total-duration' || e.target.id === 'current-time')) return;
      if (e.touches && e.touches[0]) {
        isDragging = true;
        cachedWrapRect = wrap.getBoundingClientRect();
        // Single tap jumps directly!
        seekToPoint(e.touches[0].clientX, true);
      }
    }, { passive: false });

    wrap.addEventListener('touchmove', (e) => {
      if (isDragging && e.touches && e.touches[0]) {
        if (e.cancelable) e.preventDefault(); // Prevents vertical page scroll while scrubbing waveform
        seekToPoint(e.touches[0].clientX, false);
      }
    }, { passive: false });

    wrap.addEventListener('touchend', () => {
      if (isDragging) {
        isDragging = false;
        clearTimeout(seekDebounceTimer);
        applySeekToEngine(lastTargetSec);
      }
      cachedWrapRect = null;
    });

    // Hover tooltip: Cache bounding rect on enter, clear on leave
    let hoverWrapRect = null;
    wrap.addEventListener('mouseenter', () => {
      hoverWrapRect = wrap.getBoundingClientRect();
    });

    wrap.addEventListener('mousemove', (e) => {
      if (!hoverWrapRect) hoverWrapRect = wrap.getBoundingClientRect();
      const pct = Math.max(0, Math.min(1, (e.clientX - hoverWrapRect.left) / hoverWrapRect.width));

      if (elements.waveformHoverCursor) {
        elements.waveformHoverCursor.style.left = `${pct * 100}%`;
      }

      if (elements.waveformTooltip) {
        const dur = state.episodeTimeline.duration || (elements.audio ? elements.audio.duration : 0) || 0;
        const hoverSec = pct * dur;
        const segments = state.episodeTimeline.segments || [];

        // Only compute speech/music label if Audio Classifier is active in settings
        const showClassifier = Boolean(state.experimentalSettings && state.experimentalSettings.enableAudioClassifier);
        const matchSeg = showClassifier ? segments.find(s => hoverSec >= s.start && hoverSec <= s.end) : null;
        const typeLabel = matchSeg ? (matchSeg.type === 'music' ? '🎵 Music' : '🎙️ Talk') : '';

        elements.waveformTooltip.textContent = `${formatTime(hoverSec)}${typeLabel ? ' · ' + typeLabel : ''}`;
        elements.waveformTooltip.style.left = `${pct * 100}%`;
        elements.waveformTooltip.classList.remove('hidden');
      }
    });

    wrap.addEventListener('mouseleave', () => {
      hoverWrapRect = null;
      if (elements.waveformTooltip) {
        elements.waveformTooltip.classList.add('hidden');
      }
    });

    function wireDoubleTapJumpButton(btn, targetType) {
      if (!btn) return;
      let clickTimer = null;
      let lastTapTime = 0;

      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();

        const now = Date.now();
        const diff = now - lastTapTime;

        if (diff > 0 && diff < 280) {
          // Double Tap detected: cancel single-tap jump and toggle auto-skip
          clearTimeout(clickTimer);
          clickTimer = null;
          lastTapTime = 0;

          state.experimentalSettings.autoSkipSpeech = !state.experimentalSettings.autoSkipSpeech;
          saveExperimentalSettings();
          syncExperimentalUI();

          const active = state.experimentalSettings.autoSkipSpeech;
          showToast(active ? '⚡ auto-skip talk enabled' : 'auto-skip talk disabled');
          return;
        }

        // Potential single tap: wait 280ms before firing jump
        lastTapTime = now;
        clearTimeout(clickTimer);
        clickTimer = setTimeout(() => {
          jumpToNextSegment(targetType);
          clickTimer = null;
          lastTapTime = 0;
        }, 280);
      });
    }

    wireDoubleTapJumpButton(elements.btnJumpSpeech, 'speech');
    wireDoubleTapJumpButton(elements.btnJumpMusic, 'music');

    // Resize observer / window resize for responsive canvas
    window.addEventListener('resize', () => {
      renderWaveformChart();
    });
  }

  // ── Hook into audio engine ──────────────────────────────────────────────

  function hookVisualizerToAudio() {
    setupWaveformInteractivity();

    const audio = elements.audio;
    audio.addEventListener('loadedmetadata', () => {
      if (audio.duration && state.currentEpisode && !document.hidden && state.isTabActive) {
        initOrLoadEpisodeTimeline(state.currentEpisode, audio.duration);
      }
    });

    audio.addEventListener('durationchange', () => {
      if (audio.duration && state.currentEpisode && !document.hidden && state.isTabActive) {        
        initOrLoadEpisodeTimeline(state.currentEpisode, audio.duration);
      }
    });
  }

if (document.readyState === 'loading') {
    // Programmatically activate non-blocking stylesheets (Zero CSP violations)
    document.addEventListener('DOMContentLoaded', () => {
      const fontLink = document.getElementById('google-fonts-link');
      if (fontLink) fontLink.media = 'all';

      const styleLink = document.getElementById('app-style-link');
      if (styleLink) styleLink.media = 'all';
    });

    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
