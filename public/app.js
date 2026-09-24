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

  const STORAGE_KEYS = {
    FEEDS: 'anypod_feeds',
    MUTED_FEEDS: 'anypod_muted_feeds',
    SESSION: 'anypod_session_token',
    CACHED_EPISODES: 'anypod_cached_episodes',
    CACHED_METADATA: 'anypod_cached_metadata',
    POSITIONS: 'anypod_playback_positions',
    THEME: 'anypod_theme',
    QUEUE: 'anypod_playback_queue',
    DOWNLOADS: 'anypod_downloads',
    FAVORITES: 'anypod_favorites',
    EXPERIMENTAL: 'anypod_experimental_settings'
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
    BELL: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path><path d="M13.73 21a2 2 0 0 1-3.46 0"></path></svg>'
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
    { title: "Ologies with Alie Ward", feed: "https://feeds.alieward.com/ologies", lang: "en", badge: "EN • Nature", topic: "nature" },
    { title: "Nature Podcast", feed: "https://feeds.acast.com/public/shows/nature", lang: "en", badge: "EN • Research", topic: "science" },
    { title: "StarTalk Radio", feed: "https://feeds.megaphone.fm/STARTALKRADIO", lang: "en", badge: "EN • Space", topic: "space" },
    { title: "Science Friday", feed: "https://feeds.simplecast.com/82FI3hdh", lang: "en", badge: "EN • Science", topic: "science" },
    { title: "TED Climate", feed: "https://feeds.feedburner.com/tedtalks_audio", lang: "en", badge: "EN • Climate", topic: "climate" },
    { title: "Costing the Earth (BBC)", feed: "https://podcasts.files.bbci.co.uk/b006r4wn.rss", lang: "en", badge: "EN • Ecology", topic: "climate" },
    { title: "BBC Earth Podcast", feed: "https://podcasts.files.bbci.co.uk/p0761w1w.rss", lang: "en", badge: "EN • Planet", topic: "nature" },
    { title: "Future Ecologies", feed: "https://feeds.pacificcontent.com/future-ecologies", lang: "en", badge: "EN • Ecology", topic: "nature" },
    { title: "Mongabay Newscast", feed: "https://mongabay.libsyn.com/rss", lang: "en", badge: "EN • Forests", topic: "nature" },
    { title: "Living on Earth (PRI)", feed: "https://www.loe.org/loe.rss", lang: "en", badge: "EN • Environment", topic: "climate" },
    { title: "Short Wave (NPR)", feed: "https://feeds.npr.org/510351/podcast.xml", lang: "en", badge: "EN • Science", topic: "science" },
    { title: "Huberman Lab", feed: "https://feeds.megaphone.fm/hubermanlab", lang: "en", badge: "EN • Biology", topic: "science" },
    { title: "Planetary Radio", feed: "https://www.omnycontent.com/d/playlist/064e4324-4f01-443b-8519-ae5c00e199d3/3d03ca4f-4d3a-4dd8-bc6b-ae600078dc1e/f76a5960-911e-45fa-8f19-ae600078dc2f/podcast.rss", lang: "en", badge: "EN • Space", topic: "space" },
    { title: "The Infinite Monkey Cage (BBC)", feed: "https://podcasts.files.bbci.co.uk/b00snr0w.rss", lang: "en", badge: "EN • Science", topic: "science" },
    { title: "Quanta Science Podcast", feed: "https://api.quantamagazine.org/feed/podcast/", lang: "en", badge: "EN • Physics", topic: "science" },
    { title: "Outrage + Optimism", feed: "https://feeds.acast.com/public/shows/outrage-and-optimism", lang: "en", badge: "EN • Climate", topic: "climate" },
    { title: "CrowdScience (BBC)", feed: "https://podcasts.files.bbci.co.uk/p04r5rpm.rss", lang: "en", badge: "EN • Global", topic: "science" },
    { title: "Climate One", feed: "https://feeds.megaphone.fm/climateone", lang: "en", badge: "EN • Climate", topic: "climate" },
    { title: "Volts (Clean Energy)", feed: "https://api.substack.com/feed/podcast/101899.rss", lang: "en", badge: "EN • Energy", topic: "climate" },
    { title: "Gastropod", feed: "https://feeds.simplecast.com/1B-hW7gq", lang: "en", badge: "EN • Food Sci", topic: "science" },
    { title: "The Energy Gang", feed: "https://feeds.megaphone.fm/energygang", lang: "en", badge: "EN • Energy", topic: "climate" },

    // --- German (DE) ---
    { title: "Forschung aktuell (DLF)", feed: "https://www.deutschlandfunk.de/forschung-aktuell-102.xml", lang: "de", badge: "DE • Wissen", topic: "science" },
    { title: "ARD Klima-Update", feed: "https://www.ndr.de/nachrichten/info/podcast4696.xml", lang: "de", badge: "DE • Klima", topic: "climate" },
    { title: "ZEIT WISSEN: Woher weißt du das?", feed: "https://feeds.simplecast.com/NM3_bR51", lang: "de", badge: "DE • Wissen", topic: "science" },
    { title: "Terra X Podcast (ZDF)", feed: "https://terra-x-der-podcast.podigee.io/feed/mp3", lang: "de", badge: "DE • Natur", topic: "nature" },
    { title: "radiowissen (Bayern 2)", feed: "https://feeds.br.de/radiowissen/feed.xml", lang: "de", badge: "DE • Wissen", topic: "science" },
    { title: "Synapsen (NDR Info)", feed: "https://www.ndr.de/nachrichten/info/podcast5054.xml", lang: "de", badge: "DE • Forschung", topic: "science" },
    { title: "Spektrum der Wissenschaft", feed: "https://detektor.fm/feeds/spektrum-podcast", lang: "de", badge: "DE • Natur", topic: "nature" },
    { title: "Das Klima (IPCC)", feed: "https://dasklima.podigee.io/feed/mp3", lang: "de", badge: "DE • Klima", topic: "climate" },
    { title: "Quarks Science-Cops (WDR)", feed: "https://kinder.wdr.de/radio/quarks/science-cops-podcast-100.podcast", lang: "de", badge: "DE • Fakten", topic: "science" },
    { title: "Gradmesser (Tagesspiegel)", feed: "https://gradmesser.podigee.io/feed/mp3", lang: "de", badge: "DE • Klima", topic: "climate" },
    { title: "Sternengeschichten", feed: "https://sternengeschichten.podigee.io/feed/mp3", lang: "de", badge: "DE • Raumfahrt", topic: "space" },
    { title: "Mission Klima (NDR Info)", feed: "https://www.ndr.de/nachrichten/info/podcast5200.xml", lang: "de", badge: "DE • Lösungen", topic: "climate" },

    // --- French (FR) ---
    { title: "La Terre au carré (France Inter)", feed: "https://radiofrance-podcast.net/podcast09/rss_10078.xml", lang: "fr", badge: "FR • Écologie", topic: "nature" },
    { title: "La Science, CQFD (France Culture)", feed: "https://radiofrance-podcast.net/podcast09/rss_10076.xml", lang: "fr", badge: "FR • Sciences", topic: "science" },
    { title: "Chaleur Humaine (Le Monde)", feed: "https://feeds.acast.com/public/shows/chaleur-humaine", lang: "fr", badge: "FR • Climat", topic: "climate" },
    { title: "Sixième Science (20 Minutes)", feed: "https://feeds.acast.com/public/shows/sixieme-science", lang: "fr", badge: "FR • Sciences", topic: "science" },
    { title: "Baleine sous gravillon", feed: "https://feeds.acast.com/public/shows/baleine-sous-gravillon", lang: "fr", badge: "FR • Vivant", topic: "nature" },
    { title: "Sur les épaules de Darwin", feed: "https://radiofrance-podcast.net/podcast09/rss_11553.xml", lang: "fr", badge: "FR • Évolution", topic: "nature" },

    // --- Spanish (ES) ---
    { title: "Coffee Break: Señal y Ruido", feed: "https://feeds.ivoox.com/feed_fg_f1172991_filtro_1.xml", lang: "es", badge: "ES • Cosmos", topic: "space" },
    { title: "Materia Oscura", feed: "https://feeds.ivoox.com/feed_fg_f1772652_filtro_1.xml", lang: "es", badge: "ES • Ciencia", topic: "science" },
    { title: "Planeta Océano", feed: "https://feeds.ivoox.com/feed_fg_f11132140_filtro_1.xml", lang: "es", badge: "ES • Océanos", topic: "nature" },
    { title: "A Hombros de Gigantes (RNE)", feed: "https://api.rtve.es/api/programas/1850/audios.rss", lang: "es", badge: "ES • Divulgación", topic: "science" },
    { title: "Catástrofe Ultravioleta", feed: "https://feeds.feedburner.com/catastrofeultravioleta", lang: "es", badge: "ES • Ciencia", topic: "science" },

    // --- Multilingual Worldwide (IT / SV) ---
    { title: "Radio3 Scienza (Rai)", feed: "https://www.raiplaysound.it/programmi/radio3scienza.xml", lang: "it", badge: "IT • Scienza", topic: "science" },
    { title: "Vetenskapsradion Klotet (SR)", feed: "https://api.sr.se/api/rss/pod/3966", lang: "sv", badge: "SV • Miljö & Klimat", topic: "climate" }
  ];

  // Helper to build curated science starter suggestions HTML
  function buildStarterSuggestionsHTML(activeFilter = 'all') {
    const filters = [
      { id: 'all', label: 'All (50)' },
      { id: 'en', label: 'English (25)' },
      { id: 'de', label: 'Deutsch (12)' },
      { id: 'fr', label: 'Français (6)' },
      { id: 'es', label: 'Español (5)' },
      { id: 'other', label: 'Global / Other (2)' },
      { id: 'climate', label: '🌱 Climate & Planet' },
      { id: 'science', label: '🔬 Science' },
      { id: 'space', label: '🚀 Space' }
    ];

    const filterPillsHTML = filters.map(f => `
      <button type="button" class="starter-filter-pill ${f.id === activeFilter ? 'active' : ''}" data-filter="${f.id}">${f.label}</button>
    `).join('');

    const filtered = CURATED_SCIENCE_FEEDS.filter(item => {
      if (activeFilter === 'all') return true;
      if (activeFilter === 'other') return item.lang === 'it' || item.lang === 'sv';
      if (activeFilter === 'climate' || activeFilter === 'science' || activeFilter === 'space' || activeFilter === 'nature') {
        return item.topic === activeFilter;
      }
      return item.lang === activeFilter;
    });

    const chipsHTML = filtered.map(item => {
      const isSubbed = state.feeds.includes(item.feed);
      return `
        <div class="starter-suggestion-chip" data-feed="${escapeHtml(item.feed)}" data-title="${escapeHtml(item.title)}">
          <span class="starter-chip-badge">${escapeHtml(item.badge)}</span>
          <span class="starter-chip-name" title="Click to view episodes &amp; prelisten">${escapeHtml(item.title)}</span>
          <button type="button" class="starter-chip-preview-btn" title="View episodes &amp; prelisten">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
            <span>Prelisten</span>
          </button>
          <button type="button" class="starter-chip-add ${isSubbed ? 'subscribed' : ''}" ${isSubbed ? 'disabled' : ''}>
            ${isSubbed ? 'Subscribed' : '+ Follow'}
          </button>
        </div>
      `;
    }).join('');

    return `
      <div class="starter-suggestions-section">
        <div class="starter-suggestions-title">Discover Science, Planet &amp; Climate shows worldwide (50 curated shows)</div>
        <div class="starter-filters-row">
          ${filterPillsHTML}
        </div>
        <div class="starter-suggestions-grid">
          ${chipsHTML}
        </div>
      </div>
    `;
  }

  function wireStarterSuggestionsEvents(container) {
    if (!container) return;

    const filterPills = container.querySelectorAll('.starter-filter-pill');
    filterPills.forEach(pill => {
      pill.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const filter = pill.dataset.filter || 'all';
        const section = container.querySelector('.starter-suggestions-section');
        if (section) {
          const newWrapper = document.createElement('div');
          newWrapper.innerHTML = buildStarterSuggestionsHTML(filter);
          const newSection = newWrapper.firstElementChild;
          section.replaceWith(newSection);
          wireStarterSuggestionsEvents(container);
        }
      });
    });

    const chips = container.querySelectorAll('.starter-suggestion-chip');
    chips.forEach(chip => {
      const feedUrl = chip.dataset.feed;
      if (!feedUrl) return;

      const addBtn = chip.querySelector('.starter-chip-add');
      if (addBtn) {
        addBtn.addEventListener('click', async (e) => {
          e.preventDefault();
          e.stopPropagation();
          if (state.feeds.includes(feedUrl)) {
            showStatus('Already in your podcast library');
            return;
          }
          addBtn.textContent = 'Adding...';
          try {
            await addFeed(feedUrl, chip.dataset.title || '');
            addBtn.textContent = 'Subscribed';
            addBtn.classList.add('subscribed');
            addBtn.disabled = true;
            showStatus('Subscribed! Added to your library');
          } catch (err) {
            console.error('Error adding feed:', err);
            addBtn.textContent = '+ Follow';
          }
        });
      }

      const openPreview = (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (elements.addModal && !elements.addModal.classList.contains('hidden')) {
          closeAddModal();
        }
        openFeedDetail(feedUrl);
      };

      const previewBtn = chip.querySelector('.starter-chip-preview-btn');
      if (previewBtn) previewBtn.addEventListener('click', openPreview);

      const nameEl = chip.querySelector('.starter-chip-name');
      if (nameEl) nameEl.addEventListener('click', openPreview);
    });
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
      enableVisualizer: false,
      enableAudioClassifier: false,
      autoSkipSpeech: false
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
    tabFavorites: document.getElementById('tab-favorites'),
    tabDownloads: document.getElementById('tab-downloads'),
    tabSettings: document.getElementById('tab-settings'),
    panelFeeds: document.getElementById('panel-feeds'),
    panelTimeline: document.getElementById('panel-timeline'),
    panelFavorites: document.getElementById('panel-favorites'),
    panelDownloads: document.getElementById('panel-downloads'),
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
    tabBtnNotes: document.getElementById('tab-btn-notes'),
    tabBtnTranscript: document.getElementById('tab-btn-transcript'),
    transcriptSourcePill: document.getElementById('transcript-source-pill'),
    showTranscriptContent: document.getElementById('show-transcript-content'),
    transcriptSearchInput: document.getElementById('transcript-search-input'),
    transcriptFileInput: document.getElementById('transcript-file-input'),
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
      } else if (targetTab === 'favorites') {
        if (elements.searchInput) elements.searchInput.placeholder = 'Search favorite episodes...';
        renderFavorites();
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
        } else if (['timeline', 'feeds', 'favorites', 'downloads', 'settings'].includes(raw)) {
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
    } else if (['timeline', 'feeds', 'favorites', 'downloads', 'settings'].includes(hash)) {
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
    loadFavoritesFromStorage();
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
        await syncFavoritesWithD1();
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
      await syncFavoritesWithD1();
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

  function updatePlayerFavButton() {
    if (!elements.btnPlayerFav) return;
    const current = state.currentEpisode;
    if (!current) {
      elements.btnPlayerFav.classList.remove('is-favorited');
      return;
    }
    const isFav = isEpisodeFavorited(current.guid);
    elements.btnPlayerFav.classList.toggle('is-favorited', isFav);
    elements.btnPlayerFav.title = isFav ? 'Remove from favorites' : 'Add to favorites';
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
    let list = [...(state.favorites || [])];
    const q = (state.searchQuery || '').trim().toLowerCase();
    if (q) {
      list = list.filter(item => {
        return (item.title || '').toLowerCase().includes(q) ||
               (item.podcastTitle || '').toLowerCase().includes(q);
      });
    }

    elements.favoritesEpisodesList.innerHTML = '';

    if (list.length === 0) {
      elements.favoritesEpisodesList.innerHTML = q
        ? `<div class="empty-state" style="grid-column: 1 / -1; padding: 2.5rem 1rem; text-align: center;"><p style="color: var(--text-muted); font-size: 0.9rem;">No favorite episodes match "${escapeHtml(state.searchQuery)}".</p></div>`
        : `<div class="empty-state" style="grid-column: 1 / -1; padding: 2.5rem 1rem; text-align: center;"><p style="color: var(--text-muted); font-size: 0.9rem;">No favorite episodes yet. Click the heart icon on any episode to save it here.</p></div>`;
      return;
    }

    const frag = document.createDocumentFragment();
    list.forEach(item => {
      const matched = (state.allEpisodes || []).find(e => e.guid === item.guid);
      const ep = matched ? { ...matched, ...item } : { ...item };
      const card = createEpisodeCard(ep);
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

    wireStarterSuggestionsEvents(elements.timelineList);
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
                <button type="button" class="category-chip" data-category="Science">Science</button>
                <button type="button" class="category-chip" data-category="Climate">Climate &amp; Planet</button>
                <button type="button" class="category-chip" data-category="Earth Nature">Earth &amp; Nature</button>
                <button type="button" class="category-chip" data-category="Space Astronomy">Space &amp; Astronomy</button>
                <button type="button" class="category-chip" data-category="Oceans Marine">Oceans &amp; Marine</button>
                <button type="button" class="category-chip" data-category="Physics Quantum">Physics &amp; Quantum</button>
                <button type="button" class="category-chip" data-category="Neuroscience Mind">Neuroscience &amp; Mind</button>
                <button type="button" class="category-chip" data-category="Biology Genetics">Biology &amp; Genetics</button>
                <button type="button" class="category-chip" data-category="Clean Energy">Clean Tech &amp; Energy</button>
                <button type="button" class="category-chip" data-category="Ecology Forests">Ecology &amp; Forests</button>
                <button type="button" class="category-chip" data-category="Weather Atmosphere">Weather &amp; Atmosphere</button>
                <button type="button" class="category-chip" data-category="Paleontology Fossils">Paleontology &amp; Fossils</button>
                <button type="button" class="category-chip" data-category="Medicine Health">Medicine &amp; Health</button>
                <button type="button" class="category-chip" data-category="AI Tech">Artificial Intelligence</button>
                <button type="button" class="category-chip" data-category="History Science">History of Science</button>
                <button type="button" class="category-chip" data-category="Archaeology Ancient">Archaeology &amp; Ancient</button>
                <button type="button" class="category-chip" data-category="Math Logic">Math &amp; Logic</button>
                <button type="button" class="category-chip" data-category="Agriculture Food">Agriculture &amp; Food</button>
                <button type="button" class="category-chip" data-category="Tech Robotics">Technology &amp; Robots</button>
                <button type="button" class="category-chip" data-category="Wildlife Zoology">Wildlife &amp; Zoology</button>
                <button type="button" class="category-chip" data-category="Chemistry Materials">Chemistry &amp; Materials</button>
                <button type="button" class="category-chip" data-category="Philosophy Science">Philosophy of Science</button>
                <button type="button" class="category-chip" data-category="Wissen DE">Wissen (DE)</button>
                <button type="button" class="category-chip" data-category="Sciences FR">Sciences &amp; Climat (FR)</button>
                <button type="button" class="category-chip" data-category="Ciencia ES">Ciencia y Naturaleza (ES)</button>
              </div>
            </div>
            <div id="empty-quick-results" class="quick-results-container"></div>
          </div>
          <div class="empty-actions">
            <button class="btn btn-secondary" id="btn-empty-opml-trigger">Import OPML File</button>
          </div>
          ${buildStarterSuggestionsHTML('all')}
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
      const speechSegs = segments.filter(s => s.type === 'speech');
      const musicSegs = segments.filter(s => s.type === 'music');

      cuesList.innerHTML = `
        <div class="transcript-empty-state">
          <div style="font-size: 2.2rem; margin-bottom: 0.75rem;">🎙️</div>
          <h4>No Official Text Transcript in RSS</h4>
          <p>This podcast feed doesn't publish an official WebVTT/SRT transcript track. However, Anypod analyzed the audio spectrum into <strong>${speechSegs.length} talking sections</strong> and <strong>${musicSegs.length} music sections</strong>.</p>
          ${segments.length > 0 ? `
            <div class="transcript-segment-pills">
              ${segments.slice(0, 16).map(s => `
                <button type="button" class="segment-jump-pill ${s.type === 'music' ? 'is-music' : 'is-speech'}" data-seconds="${s.start}">
                  <span>${s.type === 'music' ? '🎵 Music' : '🎙️ Talk'} · ${formatTime(s.start)}</span>
                </button>
              `).join('')}
            </div>
          ` : ''}
          <div style="margin-top: 1.5rem; font-size: 0.8rem; color: var(--text-muted);">
            Have an external transcript file? Use the <strong>Upload VTT/SRT</strong> button above to load it!
          </div>
        </div>
      `;

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

    switchShowNotesTab(defaultTab);
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
        <img class="episode-artwork" src="${ep.artwork || FALLBACK_ARTWORK}" alt="" loading="lazy" onerror="this.onerror=null;this.src='${FALLBACK_ARTWORK}';">
        <div class="episode-header-info">
          <div class="episode-podcast-name">${ep.isYouTube ? 'YouTube' : highlightText(ep.podcastTitle, state.searchQuery)}</div>
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
          ${favBtnHtml}
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

    wireStarterSuggestionsEvents(elements.feedsGrid);
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
                <button type="button" class="category-chip" data-category="Science">Science</button>
                <button type="button" class="category-chip" data-category="Climate">Climate &amp; Planet</button>
                <button type="button" class="category-chip" data-category="Earth Nature">Earth &amp; Nature</button>
                <button type="button" class="category-chip" data-category="Space Astronomy">Space &amp; Astronomy</button>
                <button type="button" class="category-chip" data-category="Oceans Marine">Oceans &amp; Marine</button>
                <button type="button" class="category-chip" data-category="Physics Quantum">Physics &amp; Quantum</button>
                <button type="button" class="category-chip" data-category="Neuroscience Mind">Neuroscience &amp; Mind</button>
                <button type="button" class="category-chip" data-category="Biology Genetics">Biology &amp; Genetics</button>
                <button type="button" class="category-chip" data-category="Clean Energy">Clean Tech &amp; Energy</button>
                <button type="button" class="category-chip" data-category="Ecology Forests">Ecology &amp; Forests</button>
                <button type="button" class="category-chip" data-category="Weather Atmosphere">Weather &amp; Atmosphere</button>
                <button type="button" class="category-chip" data-category="Paleontology Fossils">Paleontology &amp; Fossils</button>
                <button type="button" class="category-chip" data-category="Medicine Health">Medicine &amp; Health</button>
                <button type="button" class="category-chip" data-category="AI Tech">Artificial Intelligence</button>
                <button type="button" class="category-chip" data-category="History Science">History of Science</button>
                <button type="button" class="category-chip" data-category="Archaeology Ancient">Archaeology &amp; Ancient</button>
                <button type="button" class="category-chip" data-category="Math Logic">Math &amp; Logic</button>
                <button type="button" class="category-chip" data-category="Agriculture Food">Agriculture &amp; Food</button>
                <button type="button" class="category-chip" data-category="Tech Robotics">Technology &amp; Robots</button>
                <button type="button" class="category-chip" data-category="Wildlife Zoology">Wildlife &amp; Zoology</button>
                <button type="button" class="category-chip" data-category="Chemistry Materials">Chemistry &amp; Materials</button>
                <button type="button" class="category-chip" data-category="Philosophy Science">Philosophy of Science</button>
                <button type="button" class="category-chip" data-category="Wissen DE">Wissen (DE)</button>
                <button type="button" class="category-chip" data-category="Sciences FR">Sciences &amp; Climat (FR)</button>
                <button type="button" class="category-chip" data-category="Ciencia ES">Ciencia y Naturaleza (ES)</button>
              </div>
            </div>
            <div id="feeds-empty-quick-results" class="quick-results-container"></div>
          </div>
          <div class="empty-actions">
            <button class="btn btn-secondary" id="btn-feeds-empty-opml">Import OPML File</button>
          </div>
          ${buildStarterSuggestionsHTML('all')}
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
    updatePlayerFavButton();

    setPlayerCollapsed(false, false);
    initOrLoadEpisodeTimeline(episode, (episode.duration ? parseDurationSeconds(episode.duration) : 0));

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
      if (elements.waveformProgressOverlay) {
        elements.waveformProgressOverlay.style.width = `${pct}%`;
      }
      if (elements.waveformPlayheadLine) {
        elements.waveformPlayheadLine.style.left = `${pct}%`;
      }
      if (elements.waveformTimelineWrap) {
        elements.waveformTimelineWrap.setAttribute('aria-valuenow', Math.round(pct));
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
        if (state.episodeTimeline.guid !== state.currentEpisode.guid || !state.episodeTimeline.duration || state.episodeTimeline.duration <= 0) {
          initOrLoadEpisodeTimeline(state.currentEpisode, dur);
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
    updatePlayerFavButton();
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
              localStorage.removeItem('anypod_session_token');
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

    if (elements.btnOpenQueue) elements.btnOpenQueue.addEventListener('click', openQueueModal);
    if (elements.btnCloseQueue) elements.btnCloseQueue.addEventListener('click', closeQueueModal);
    if (elements.btnClearQueue) elements.btnClearQueue.addEventListener('click', clearQueue);
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
    if (elements.playerTrackInfo) elements.playerTrackInfo.addEventListener('click', () => openShowNotes(null, 'notes'));
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
    if (elements.transcriptSearchInput) {
      elements.transcriptSearchInput.addEventListener('input', (e) => {
        renderTranscriptView(e.target.value);
      });
    }
    if (elements.transcriptFileInput) {
      elements.transcriptFileInput.addEventListener('change', (e) => {
        const file = e.target.files && e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (evt) => {
          const text = evt.target.result;
          const cues = parseVttOrSrtTimestamps(text);
          if (cues.length > 0) {
            state.episodeTimeline.cues = cues;
            state.episodeTimeline.transcriptSource = 'Upload';
            const dur = (elements.audio && elements.audio.duration) ? elements.audio.duration : state.episodeTimeline.duration;
            state.episodeTimeline.bars = deriveBarsFromCues(cues, dur, TIMELINE_BAR_COUNT);
            state.episodeTimeline.segments = deriveSegmentsFromCues(cues, dur);

            if (state.currentEpisode) {
              try {
                localStorage.setItem('anypod_timeline_' + state.currentEpisode.guid, JSON.stringify({
                  bars: state.episodeTimeline.bars,
                  segments: state.episodeTimeline.segments,
                  cues: cues,
                  transcriptSource: 'Upload'
                }));
              } catch (_) {}
              saveTimelineToCommunityCache(state.currentEpisode, dur, state.episodeTimeline.bars, state.episodeTimeline.segments, 'upload');
            }

            renderWaveformChart();
            renderTranscriptView();
          }
        };
        reader.readAsText(file);
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
        const searchTerms = ["NASA's Curious Universe", "The Climate Question", "Radiolab", "Forschung aktuell"];
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
    if (!elements.podcastSearchQuery.value.trim() && elements.searchDirectoryResults) {
      elements.searchDirectoryResults.innerHTML = buildStarterSuggestionsHTML('all');
      wireStarterSuggestionsEvents(elements.searchDirectoryResults);
    }
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
  // SECTION 30 · Full-Episode Waveform & Speech/Music Timeline Chart
  //
  // 1. Interactive SoundCloud-style full-episode waveform canvas scrubber.
  // 2. Background audio probe using HTTP Range requests + Web Audio API.
  // 3. Classifies timeline segments into 🎙️ Speech (talking) vs 🎵 Music.
  // 4. Color-coded timeline bars across the entire episode (0:00 to end).
  // 5. Jump to next music / jump to next talk buttons.
  // 6. Caches episode timeline analysis permanently in localStorage.
  // ─────────────────────────────────────────────────────────────────────────

  const TIMELINE_BAR_COUNT = 85;

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
    const isVis = !!es.enableVisualizer;
    const isClass = !!es.enableAudioClassifier;

    if (elements.toggleVisualizer) elements.toggleVisualizer.checked = isVis;
    if (elements.toggleClassifier) elements.toggleClassifier.checked = isClass;
    if (elements.toggleAutoSkip) elements.toggleAutoSkip.checked = !!es.autoSkipSpeech;

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
      elements.seekBar.style.display = isVis ? 'none' : 'block';
    }
    if (elements.timelineLegend) {
      elements.timelineLegend.style.display = (isVis && isClass) ? 'flex' : 'none';
    }

    if (isVis) {
      renderWaveformChart();
    }
  }

  function setupExperimentalSettings() {
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
  }

  // ── Baseline Waveform Generator ─────────────────────────────────────────

  function generateBaselineBars(guid, count) {
    const bars = [];
    // Pseudo-random deterministic seed from episode GUID
    let seed = 42;
    for (let c = 0; c < (guid || '').length; c++) {
      seed = (seed * 31 + guid.charCodeAt(c)) & 0x7fffffff;
    }
    const rand = () => {
      seed = (seed * 16807) % 2147483647;
      return (seed - 1) / 2147483646;
    };

    for (let i = 0; i < count; i++) {
      const pos = i / count;
      // Typical podcast profile: intro music, steady discussion, outro music
      const isIntro = pos < 0.05;
      const isOutro = pos > 0.94;
      const defaultType = (isIntro || isOutro) ? 'music' : 'speech';
      // Energy contour
      const baseAmp = 0.35 + Math.sin(pos * Math.PI) * 0.25;
      const noise = (rand() - 0.5) * 0.35;
      const height = Math.min(1.0, Math.max(0.15, baseAmp + noise));

      bars.push({
        height: parseFloat(height.toFixed(2)),
        type: defaultType
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

    // Check localStorage cache
    const cacheKey = 'anypod_timeline_' + episode.guid;
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
    const cacheKey = 'anypod_timeline_' + episode.guid;

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

  function renderWaveformChart() {
    if (!state.experimentalSettings.enableVisualizer) return;
    const canvas = elements.episodeWaveformCanvas;
    const wrap = elements.waveformTimelineWrap;
    if (!canvas || !wrap) return;

    const rect = wrap.getBoundingClientRect();
    const w = rect.width || wrap.offsetWidth || 500;
    const h = 38;
    const dpr = window.devicePixelRatio || 1;

    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);

    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, h);

    const bars = state.episodeTimeline.bars;
    if (!bars || bars.length === 0) return;

    const barWidth = w / bars.length;
    const gap = Math.max(1, Math.floor(barWidth * 0.25));
    const drawWidth = Math.max(1.5, barWidth - gap);
    const showClassifier = !!state.experimentalSettings.enableAudioClassifier;

    for (let i = 0; i < bars.length; i++) {
      const b = bars[i];
      const barH = Math.max(3, b.height * (h - 6));
      const x = i * barWidth + (gap / 2);
      const y = (h - barH) / 2;

      // Color coding: Speech = Orange, Music = Vibrant Purple
      if (showClassifier && b.type === 'music') {
        ctx.fillStyle = '#a855f7'; // Purple/Violet
      } else if (showClassifier && b.type === 'speech') {
        ctx.fillStyle = '#f97316'; // Podcast Orange
      } else {
        ctx.fillStyle = '#f97316'; // Standard single-color waveform
      }

      // Draw rounded bar
      if (typeof ctx.roundRect === 'function') {
        ctx.beginPath();
        ctx.roundRect(x, y, drawWidth, barH, 2);
        ctx.fill();
      } else {
        ctx.fillRect(x, y, drawWidth, barH);
      }
    }
  }

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
    if (!state.experimentalSettings.enableAudioClassifier) {
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

    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) {
      if (elements.probeStatusPill) elements.probeStatusPill.classList.add('hidden');
      return;
    }

    const audioCtx = new AudioCtx();
    const NUM_PROBES = 24;
    const CHUNK_SIZE = 49152; // 48 KB

    try {
      // Step 1: Probe HEAD for Content-Length to calculate byte positions
      let totalBytes = duration * 16000; // default 128kbps estimate
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
        if (signal.aborted) break;

        const probePos = p / NUM_PROBES;
        const startByte = Math.max(0, Math.floor(probePos * (totalBytes - CHUNK_SIZE - 2048)));
        const endByte = startByte + CHUNK_SIZE - 1;

        if (elements.probeStatusPill) {
          elements.probeStatusPill.textContent = `Analyzing spectrum ${Math.round((p / NUM_PROBES) * 100)}%`;
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
              audioBuffer = await audioCtx.decodeAudioData(buf.slice(0));
            } catch (_) {
              // Raw MP3 byte slice missing sync header in WebKit; continue with heuristic
            }

            if (audioBuffer && audioBuffer.length > 0) {
              const channel = audioBuffer.getChannelData(0);
              const analysis = analyzePcmSnippet(channel, audioBuffer.sampleRate);

              // Update corresponding timeline bars
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

        // Brief delay so probe doesn't monopolize network bandwidth
        await new Promise(r => setTimeout(r, 60));
      }

      // Finalize segments
      state.episodeTimeline.segments = deriveSegmentsFromBars(state.episodeTimeline.bars, duration);

      // Save to localStorage cache
      try {
        localStorage.setItem('anypod_timeline_' + episode.guid, JSON.stringify({
          bars: state.episodeTimeline.bars,
          segments: state.episodeTimeline.segments
        }));
      } catch (_) {}

      // Seed community cache in D1 for all users
      saveTimelineToCommunityCache(episode, duration, state.episodeTimeline.bars, state.episodeTimeline.segments, 'probe');

      if (elements.probeStatusPill) {
        elements.probeStatusPill.textContent = '✓ Indexed for Community';
        setTimeout(() => {
          if (elements.probeStatusPill) elements.probeStatusPill.classList.add('hidden');
        }, 2500);
      }

    } catch (e) {
      // Aborted or finished
    } finally {
      state.episodeTimeline.isProbing = false;
      try { audioCtx.close(); } catch (_) {}
    }
  }

  // ── PCM Spectral & Energy Analyzer ──────────────────────────────────────

  function analyzePcmSnippet(samples, sampleRate) {
    const len = samples.length;
    let sumSq = 0;
    let zeroCrossings = 0;
    let hfDiffSum = 0;

    for (let i = 0; i < len; i++) {
      const s = samples[i];
      sumSq += s * s;
      if (i > 0) {
        if ((samples[i] >= 0 && samples[i - 1] < 0) || (samples[i] < 0 && samples[i - 1] >= 0)) {
          zeroCrossings++;
        }
        hfDiffSum += Math.abs(s - samples[i - 1]);
      }
    }

    const rms = Math.sqrt(sumSq / len);
    const zcr = zeroCrossings / len;
    const hfRatio = hfDiffSum / (sumSq + 0.0001);

    // Frame-to-frame dynamic variance (speech has frequent pause gaps, music has steady compression)
    const windowSize = Math.floor(sampleRate * 0.1); // 100ms
    const numWindows = Math.floor(len / windowSize);
    let minWinRms = 1.0;
    let maxWinRms = 0.0;

    for (let w = 0; w < numWindows; w++) {
      let winSum = 0;
      const offset = w * windowSize;
      for (let j = 0; j < windowSize; j++) {
        const s = samples[offset + j];
        winSum += s * s;
      }
      const winRms = Math.sqrt(winSum / windowSize);
      if (winRms < minWinRms) minWinRms = winRms;
      if (winRms > maxWinRms) maxWinRms = winRms;
    }

    const crestFactor = (maxWinRms - minWinRms) / (rms + 0.0001);

    // Classification heuristic:
    // Music: continuous sustained energy (low crest variance), rich high frequencies, higher overall RMS
    // Speech: high pause-to-peak variance, mid-range dominant
    const isSilence = rms < 0.015;
    const isMusic = !isSilence && (crestFactor < 1.4 || hfRatio > 1.8) && rms > 0.04;

    return {
      type: isSilence ? 'speech' : (isMusic ? 'music' : 'speech'),
      energy: Math.min(1.0, Math.max(0.2, rms * 4))
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

    const seekToPoint = (clientX) => {
      const rect = wrap.getBoundingClientRect();
      const pct = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));

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
        if (state.activeEngine === 'audio') {
          elements.audio.currentTime = targetSec;
        } else if (state.activeEngine === 'youtube' && state.ytPlayer && state.ytPlayer.seekTo) {
          state.ytPlayer.seekTo(targetSec, true);
        }
        updateProgress();
      }
    };

    wrap.addEventListener('mousedown', (e) => {
      isDragging = true;
      seekToPoint(e.clientX);
    });

    window.addEventListener('mousemove', (e) => {
      if (isDragging) {
        seekToPoint(e.clientX);
      }
    });

    window.addEventListener('mouseup', () => {
      isDragging = false;
    });

    // Touch events for mobile
    wrap.addEventListener('touchstart', (e) => {
      if (e.touches && e.touches[0]) {
        isDragging = true;
        seekToPoint(e.touches[0].clientX);
      }
    }, { passive: true });

    wrap.addEventListener('touchmove', (e) => {
      if (isDragging && e.touches && e.touches[0]) {
        seekToPoint(e.touches[0].clientX);
      }
    }, { passive: true });

    wrap.addEventListener('touchend', () => {
      isDragging = false;
    });

    // Hover tooltip with segment classification
    wrap.addEventListener('mousemove', (e) => {
      const rect = wrap.getBoundingClientRect();
      const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));

      if (elements.waveformHoverCursor) {
        elements.waveformHoverCursor.style.left = `${pct * 100}%`;
      }

      if (elements.waveformTooltip) {
        const dur = state.episodeTimeline.duration || (elements.audio ? elements.audio.duration : 0) || 0;
        const hoverSec = pct * dur;

        // Find segment type at hover point
        const segments = state.episodeTimeline.segments || [];
        const matchSeg = segments.find(s => hoverSec >= s.start && hoverSec <= s.end);
        const typeLabel = matchSeg ? (matchSeg.type === 'music' ? '🎵 Music' : '🎙️ Talk') : '';

        elements.waveformTooltip.textContent = `${formatTime(hoverSec)}${typeLabel ? ' · ' + typeLabel : ''}`;
        elements.waveformTooltip.style.left = `${pct * 100}%`;
        elements.waveformTooltip.classList.remove('hidden');
      }
    });

    wrap.addEventListener('mouseleave', () => {
      if (elements.waveformTooltip) {
        elements.waveformTooltip.classList.add('hidden');
      }
    });

    // Jump buttons
    if (elements.btnJumpSpeech) {
      elements.btnJumpSpeech.addEventListener('click', () => jumpToNextSegment('speech'));
    }
    if (elements.btnJumpMusic) {
      elements.btnJumpMusic.addEventListener('click', () => jumpToNextSegment('music'));
    }

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
      if (audio.duration && state.currentEpisode) {
        initOrLoadEpisodeTimeline(state.currentEpisode, audio.duration);
      }
    });

    audio.addEventListener('durationchange', () => {
      if (audio.duration && state.currentEpisode) {
        initOrLoadEpisodeTimeline(state.currentEpisode, audio.duration);
      }
    });
  }

  document.addEventListener('DOMContentLoaded', init);
})();
