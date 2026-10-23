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

// ── Shared Storage & Keys (Delegated to window.AnypodShared) ─────────────
const safeStorage = window.AnypodShared.safeStorage;
const storage = safeStorage;
const STORAGE_KEYS = window.AnypodShared.STORAGE_KEYS;

function isStorageBlocked() {
  return !!(window.AnypodShared && window.AnypodShared.isStorageBlocked && window.AnypodShared.isStorageBlocked());
}

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

// Canonical URL migrations for obsolete/moved RSS feed URLs
const CANONICAL_FEED_MIGRATIONS = {
  'https://feeds.simplecast.com/S-J-2z2f': 'https://feeds.simplecast.com/FO6kxYGj', // Ologies with Alie Ward
  'http://feeds.simplecast.com/S-J-2z2f': 'https://feeds.simplecast.com/FO6kxYGj',
  'https://feeds.simplecast.com/8Px3L_y8': 'https://feeds.simplecast.com/h18ZIZD_', // Science Friday
  'http://feeds.simplecast.com/8Px3L_y8': 'https://feeds.simplecast.com/h18ZIZD_',
  'https://feeds.acast.com/public/shows/bbc-earth-podcast': 'https://feeds.acast.com/public/shows/63fb67c5-f719-43f7-b264-390cd7edb120', // BBC Earth
  'https://www.planetary.org/feed/podcast': 'https://www.omnycontent.com/d/playlist/d95da206-8ee8-4ba5-ba8d-ad1200b4e5a4/cf13d5f5-6040-458d-ab5a-ad200189747d/b75c9f7f-4a63-438e-b506-ad2001897499/podcast.rss', // Planetary Radio
  'http://www.planetary.org/feed/podcast': 'https://www.omnycontent.com/d/playlist/d95da206-8ee8-4ba5-ba8d-ad1200b4e5a4/cf13d5f5-6040-458d-ab5a-ad200189747d/b75c9f7f-4a63-438e-b506-ad2001897499/podcast.rss',
  'https://detektor.fm/podcasts/spektrum-der-wissenschaft/feed': 'https://www.spektrum.de/blatt/d_sdwv_podcast_rss&id=851833', // Spektrum der Wissenschaft
  'https://api.quantamagazine.org/feed/podcast/': 'https://www.quantamagazine.org/feed/podcast/' // Quanta direct
};

// Curated 50 Science, Planet & Climate shows worldwide across multiple languages
const CURATED_SCIENCE_FEEDS = [
  // --- English (EN) ---
  { title: "NASA's Curious Universe", feed: "https://feeds.megaphone.fm/NATIONALAERONAUTICSANDSPACEADMINISTRATION8162188566", lang: "en", badge: "EN • Space", topic: "space" },
  { title: "Radiolab", feed: "https://feeds.simplecast.com/EmVW7VGp", lang: "en", badge: "EN • Science", topic: "science" },
  { title: "The Climate Question (BBC)", feed: "https://podcasts.files.bbci.co.uk/w13xtvb6.rss", lang: "en", badge: "EN • Climate", topic: "climate" },
  { title: "Science Vs", feed: "https://feeds.megaphone.fm/sciencevs", lang: "en", badge: "EN • Science", topic: "science" },
  { title: "Ologies with Alie Ward", feed: "https://feeds.simplecast.com/FO6kxYGj", lang: "en", badge: "EN • Nature", topic: "nature" },
  { title: "Nature Podcast", feed: "https://feeds.acast.com/public/shows/nature", lang: "en", badge: "EN • Research", topic: "science" },
  { title: "StarTalk Radio", feed: "https://feeds.simplecast.com/4T39_jAj", lang: "en", badge: "EN • Space", topic: "space" },
  { title: "Science Friday", feed: "https://feeds.simplecast.com/h18ZIZD_", lang: "en", badge: "EN • Science", topic: "science" },
  { title: "TED Climate", feed: "https://feeds.feedburner.com/tedtalks_audio", lang: "en", badge: "EN • Climate", topic: "climate" },
  { title: "Costing the Earth (BBC)", feed: "https://podcasts.files.bbci.co.uk/b006r4wn.rss", lang: "en", badge: "EN • Ecology", topic: "climate" },
  { title: "BBC Earth Podcast", feed: "https://feeds.acast.com/public/shows/63fb67c5-f719-43f7-b264-390cd7edb120", lang: "en", badge: "EN • Planet", topic: "nature" },
  { title: "Future Ecologies", feed: "https://feeds.captivate.fm/future-ecologies/", lang: "en", badge: "EN • Ecology", topic: "nature" },
  { title: "Mongabay Newscast", feed: "https://mongabay.libsyn.com/rss", lang: "en", badge: "EN • Forests", topic: "nature" },
  { title: "Living on Earth (PRI)", feed: "https://feeds.megaphone.fm/livingonearth", lang: "en", badge: "EN • Environment", topic: "climate" },
  { title: "Short Wave (NPR)", feed: "https://feeds.npr.org/510351/podcast.xml", lang: "en", badge: "EN • Science", topic: "science" },
  { title: "Huberman Lab", feed: "https://feeds.megaphone.fm/hubermanlab", lang: "en", badge: "EN • Biology", topic: "science" },
  { title: "Planetary Radio", feed: "https://www.omnycontent.com/d/playlist/d95da206-8ee8-4ba5-ba8d-ad1200b4e5a4/cf13d5f5-6040-458d-ab5a-ad200189747d/b75c9f7f-4a63-438e-b506-ad2001897499/podcast.rss", lang: "en", badge: "EN • Space", topic: "space" },
  { title: "The Infinite Monkey Cage (BBC)", feed: "https://podcasts.files.bbci.co.uk/b00snr0w.rss", lang: "en", badge: "EN • Science", topic: "science" },
  { title: "Quanta Science Podcast", feed: "https://www.quantamagazine.org/feed/podcast/", lang: "en", badge: "EN • Physics", topic: "science" },
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
  { title: "Spektrum der Wissenschaft", feed: "https://www.spektrum.de/blatt/d_sdwv_podcast_rss&id=851833", lang: "de", badge: "DE • Natur", topic: "nature" },
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

const CURATED_ARTWORK_STORAGE_KEY = 'anypod_curated_artwork_v1';
const _curatedArtworkCache = (() => {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(CURATED_ARTWORK_STORAGE_KEY) : null;
    return raw ? JSON.parse(raw) : {};
  } catch (_) {
    return {};
  }
})();

function saveCuratedArtworkCache() {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(CURATED_ARTWORK_STORAGE_KEY, JSON.stringify(_curatedArtworkCache));
    }
  } catch (_) {}
}

async function loadCuratedArtworks(container) {
  if (!container) return;
  const cards = container.querySelectorAll('.starter-show-card');
  if (!cards.length) return;

  const fetchCardArtwork = async (card) => {
    const feedUrl = card.dataset.feed;
    const title = card.dataset.title;
    const img = card.querySelector('.feed-art');
    if (!img || !feedUrl) return;

    // 1. Return from existing state or persistent localStorage cache (0 network requests!)
    if (state.feedMetadata[feedUrl]?.artwork) {
      let art = state.feedMetadata[feedUrl].artwork;
      if (typeof art === 'string' && art.includes('600x600bb')) {
        art = art.replace('600x600bb', '100x100bb');
      }
      img.src = art;
      return;
    }
    if (_curatedArtworkCache[feedUrl]) {
      let art = _curatedArtworkCache[feedUrl];
      if (typeof art === 'string' && art.includes('600x600bb')) {
        art = art.replace('600x600bb', '100x100bb');
      }
      img.src = art;
      return;
    }

    // 2. Fetch lightweight responsive artwork (100x100 ~6 KB) directly from iTunes Search API
    try {
      let artUrl = null;
      try {
        const res = await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(title)}&media=podcast&entity=podcast&limit=1`);
        if (res.ok) {
          const data = await res.json();
          if (data.results && data.results[0]) {
            artUrl = data.results[0].artworkUrl100 || data.results[0].artworkUrl60 || data.results[0].artworkUrl600;
          }
        }
      } catch (_) {}

      if (!artUrl) {
        try {
          const res = await fetch(`/api/search-directory?term=${encodeURIComponent(title)}&limit=1`);
          if (res.ok) {
            const data = await res.json();
            if (data.results && data.results[0]) {
              artUrl = data.results[0].artworkUrl100 || data.results[0].artworkUrl60 || data.results[0].artworkUrl600;
            }
          }
        } catch (_) {}
      }

      if (artUrl) {
        if (typeof artUrl === 'string' && artUrl.includes('600x600bb')) {
          artUrl = artUrl.replace('600x600bb', '100x100bb');
        }
        _curatedArtworkCache[feedUrl] = artUrl;
        img.src = artUrl;
        saveCuratedArtworkCache();
      }
    } catch (_) {}
  };

  // Lazy-load artwork as cards enter viewport (prevents bandwidth contention on page boot)
  if ('IntersectionObserver' in window) {
    const artObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        artObserver.unobserve(entry.target);
        fetchCardArtwork(entry.target);
      });
    }, { rootMargin: '200px' });

    cards.forEach(card => artObserver.observe(card));
  } else {
    for (const card of cards) {
      await fetchCardArtwork(card);
    }
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

  // 3. Paginated "Show All" or Auto-Load on Scroll
  container.querySelectorAll('.btn-starter-load-more').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const filter = btn.dataset.filter || 'all';
      const section = container.querySelector('.starter-suggestions-section') || container.querySelector('.discover-curated-section');
      if (section && typeof buildStarterSuggestionsHTML === 'function') {
        const temp = document.createElement('div');
        temp.innerHTML = buildStarterSuggestionsHTML(filter, 0); // 0 = all
        const newSection = temp.firstElementChild;
        if (newSection) {
          section.replaceWith(newSection);
          wireStarterSuggestionsEvents(container);
          if (typeof loadCuratedFeedEpisodes === 'function') {
            loadCuratedFeedEpisodes(newSection);
          }
        }
      }
    });

    if ('IntersectionObserver' in window) {
      const autoLoadObserver = new IntersectionObserver((entries) => {
        if (entries[0] && entries[0].isIntersecting) {
          autoLoadObserver.disconnect();
          btn.click();
        }
      }, { rootMargin: '300px' });
      autoLoadObserver.observe(btn);
    }
  });

  // 4. Load high-res cover art and the 3 real episodes for visible cards
  if (typeof loadCuratedArtworks === 'function') {
    loadCuratedArtworks(container);
  }
  loadCuratedFeedEpisodes(container);
}

// Helper to build curated science starter suggestions HTML
function buildStarterSuggestionsHTML(activeFilter = 'all', limit = 12) {
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

  const visibleItems = (limit > 0) ? filtered.slice(0, limit) : filtered;
  const hasMore = (limit > 0) && (filtered.length > limit);

  const chipsHTML = visibleItems.map((item, idx) => {
    const isSubbed = state.feeds.includes(item.feed);
    let art = item.artwork || (state.feedMetadata[item.feed] && state.feedMetadata[item.feed].artwork) || (_curatedArtworkCache && _curatedArtworkCache[item.feed]) || FALLBACK_ARTWORK;
    if (typeof art === 'string' && art.includes('600x600bb')) {
      art = art.replace('600x600bb', '100x100bb');
    }
    const allForFeed = (state.allEpisodes || []).filter(e => e.feedUrl === item.feed);
    const recentWidgetHtml = typeof buildRecentEpisodesWidget === 'function' ? buildRecentEpisodesWidget(allForFeed, item.feed) : '';
    const epCountText = allForFeed.length > 0 ? `${allForFeed.length} episodes` : (item.badge || item.lang.toUpperCase());
    const loadingAttr = 'loading="lazy" decoding="async"';

    return `
      <div class="feed-card starter-show-card" data-feed="${escapeHtml(item.feed)}" data-title="${escapeHtml(item.title)}">
        <div class="feed-header">
          <img class="feed-art" ${loadingAttr} width="48" height="48" src="${escapeHtml(art)}" alt="" onerror="this.onerror=null;this.src='${FALLBACK_ARTWORK}';">
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

  const paginationHTML = hasMore ? `
    <div class="starter-pagination-wrap" style="grid-column: 1 / -1; display: flex; justify-content: center; padding: 1rem 0;">
      <button type="button" class="btn btn-secondary btn-sm btn-starter-load-more" data-filter="${activeFilter}">
        show all ${filtered.length} shows (${filtered.length - limit} more)
      </button>
    </div>
  ` : '';

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
        ${paginationHTML}
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
  episodeChapters: [],
  currentChapter: null,
  playbackSpeed: 1.0,
  sortOrder: 'newest',
  isShuffle: storage.getItem('anypod_shuffle') === 'true',
  searchQuery: '',
  filterMode: 'unplayed',
  feedFilter: 'all',
  ytPlayer: null,
  ytReady: false,
  activeEngine: 'audio',
  playbackStatus: 'idle',
  _userIntentionalPause: false,
  _ytSpuriousPauseRetries: 0,
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
    enableLiveTranscript: false,
    enableVerboseDiagnostics: false
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
  _episodeEndedTriggered: false,
  _audioSpuriousPauseRetries: 0
};
window.state = state;

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
  tabBtnChapters: document.getElementById('tab-btn-chapters'),
  chaptersSourcePill: document.getElementById('chapters-source-pill'),
  showChaptersContent: document.getElementById('show-chapters-content'),
  chaptersList: document.getElementById('chapters-list'),
  chaptersSourceLabel: document.getElementById('chapters-source-label'),
  chaptersCountText: document.getElementById('chapters-count-text'),
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
  playerChapterBar: document.getElementById('player-chapter-bar'),
  playerChapterTitle: document.getElementById('player-chapter-title'),
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
  btnCopyStreamUrl: document.getElementById('btn-copy-stream-url'),
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
  waveformChapterTicks: document.getElementById('waveform-chapter-ticks'),
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
  toggleVerboseDiag: document.getElementById('toggle-verbose-diag'),
};
window.elements = elements;
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
    if (typeof liveDspInterval !== 'undefined' && liveDspInterval) {
      clearInterval(liveDspInterval);
      liveDspInterval = null;
    }
    if (typeof isAcceleratingSilence !== 'undefined' && isAcceleratingSilence && elements.audio) {
      elements.audio.playbackRate = state.playbackSpeed || 1.0;
      isAcceleratingSilence = false;
    }
  } else {
    // Tab/app became visible again — resync UI
    if (state.experimentalSettings && state.experimentalSettings.enableSilenceSkip && isEnginePlaying()) {
      if (typeof startLiveSilenceDetection === 'function') {
        startLiveSilenceDetection();
      }
    }
    if (typeof renderTimeline === 'function') {
      renderTimeline(true);
    }
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
    } else if (
      state.activeEngine === 'youtube' &&
      !state._userIntentionalPause &&
      (state.playbackStatus === 'playing' || state.playbackStatus === 'loading') &&
      state.ytPlayer &&
      typeof state.ytPlayer.getPlayerState === 'function' &&
      state.ytPlayer.getPlayerState() !== (window.YT ? YT.PlayerState.PLAYING : 1)
    ) {
      logPlayerDiagnostic('youtube.visibility_resume', 'Tab visible again, resuming paused YouTube playback');
      state.ytPlayer.playVideo();
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
// SECTION 3.5 · Player Diagnostics & Session Logger
// Records background state transitions, buffering holds, YouTube events,
// and network disconnects for easy one-tap copying from the Settings tab.
// ─────────────────────────────────────────────────────────────────────────
const playerDiagnosticLogs = [];
const MAX_DIAGNOSTIC_LOGS = 250;

function logPlayerDiagnostic(event, details = '', isVerbose = false) {
  if (isVerbose && !state.experimentalSettings?.enableVerboseDiagnostics) {
    return;
  }
  const ts = new Date().toTimeString().split(' ')[0] + '.' + String(Date.now() % 1000).padStart(3, '0');
  const bgTag = document.hidden ? '[BG]' : '[FG]';
  const logLine = `[${ts}] ${bgTag} ${event}: ${details}`;
  playerDiagnosticLogs.push(logLine);
  if (playerDiagnosticLogs.length > MAX_DIAGNOSTIC_LOGS) {
    playerDiagnosticLogs.shift();
  }
  updateSettingsTelemetryUI();
  if (state.experimentalSettings?.enableVerboseDiagnostics) {
    console.log(`[Anypod Diag] ${logLine}`);
  }
}

function updateSettingsTelemetryUI() {
  const elEngine = document.getElementById('diag-engine');
  const elStatus = document.getElementById('diag-status');
  const elTrack = document.getElementById('diag-track');
  const elBuffer = document.getElementById('diag-buffer');
  const elMs = document.getElementById('diag-mediasession');
  if (!elEngine) return;

  elEngine.textContent = state.activeEngine || 'idle';
  elStatus.textContent = state.playbackStatus || 'idle';
  elTrack.textContent = state.currentEpisode ? `${state.currentEpisode.title} (${state.currentEpisode.podcastTitle || ''})` : 'none';

  let ahead = 0;
  if (state.activeEngine === 'audio' && elements.audio && elements.audio.buffered.length > 0) {
    const cur = elements.audio.currentTime || 0;
    for (let i = 0; i < elements.audio.buffered.length; i++) {
      const start = elements.audio.buffered.start(i);
      const end = elements.audio.buffered.end(i);
      if (cur >= start && cur <= end) {
        ahead = Math.max(0, end - cur);
        break;
      }
    }
  }
  if (elBuffer) elBuffer.textContent = `${ahead.toFixed(1)}s`;
  if (elMs) elMs.textContent = ('mediaSession' in navigator) ? navigator.mediaSession.playbackState : 'unsupported';
}

function generatePlayerDiagnosticReport() {
  const ep = state.currentEpisode;
  let dur = 0;
  let cur = 0;
  const bufRanges = [];

  if (state.activeEngine === 'audio' && elements.audio) {
    dur = elements.audio.duration || 0;
    cur = elements.audio.currentTime || 0;
    for (let i = 0; i < elements.audio.buffered.length; i++) {
      bufRanges.push(`[${elements.audio.buffered.start(i).toFixed(1)}s - ${elements.audio.buffered.end(i).toFixed(1)}s]`);
    }
  } else if (state.activeEngine === 'youtube' && state.ytPlayer) {
    if (typeof state.ytPlayer.getDuration === 'function') dur = state.ytPlayer.getDuration() || 0;
    if (typeof state.ytPlayer.getCurrentTime === 'function') cur = state.ytPlayer.getCurrentTime() || 0;
  }

  const lines = [
    '====================================================',
    'ANYPOD LIVE PLAYER DIAGNOSTIC REPORT',
    `Generated: ${new Date().toISOString()}`,
    `User Agent: ${navigator.userAgent}`,
    `Visibility: ${document.visibilityState} (Hidden: ${document.hidden})`,
    `Active Engine: ${state.activeEngine}`,
    `Playback Status: ${state.playbackStatus}`,
    '----------------------------------------------------',
    `Episode Title: "${ep ? ep.title : 'none'}"`,
    `Episode Podcast: "${ep ? (ep.podcastTitle || '') : 'none'}"`,
    `Audio/Video URL: ${ep ? (ep.audioUrl || window.__ANYPOD_CURRENT_STREAM_URL || '') : 'none'}`,
    `Position: ${cur.toFixed(2)}s / ${dur.toFixed(2)}s`,
    `Buffered Ranges (${bufRanges.length}): ${bufRanges.join(', ') || 'n/a'}`,
    `MediaSession State: ${('mediaSession' in navigator) ? navigator.mediaSession.playbackState : 'unsupported'}`,
    `MediaSession Meta: ${('mediaSession' in navigator && navigator.mediaSession.metadata) ? `Title="${navigator.mediaSession.metadata.title}", Artist="${navigator.mediaSession.metadata.artist}", ArtworkCount=${navigator.mediaSession.metadata.artwork?.length || 0}` : 'none'}`,
    `User Intentional Pause: ${Boolean(state._userIntentionalPause)}`,
    `YT Spurious Pause Retries: ${state._ytSpuriousPauseRetries || 0}`,
    `Queue Length: ${state.queue.length}`,
    '====================================================',
    'CHRONOLOGICAL EVENT LOG (Last 250 entries):',
    ...(playerDiagnosticLogs.length > 0 ? playerDiagnosticLogs : ['(No player events recorded yet)']),
    '====================================================',
    'END OF REPORT'
  ];
  return lines.join('\n');
}

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
      logPlayerDiagnostic('youtube.buffering', 'YouTube player buffering', true);
    } else if (event.data === ytPlaying) {
      state._ytSpuriousPauseRetries = 0;
      state._userIntentionalPause = false;
      state.playbackStatus = 'playing';
      syncPlaybackButtons();
      const curTime = (state.ytPlayer && typeof state.ytPlayer.getCurrentTime === 'function') ? (state.ytPlayer.getCurrentTime() || 0) : 0;
      logPlayerDiagnostic('youtube.playing', `Playback active at cur=${curTime.toFixed(2)}s`, true);
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
      let cur = 0;
      let dur = 0;
      try {
        if (state.ytPlayer && typeof state.ytPlayer.getCurrentTime === 'function') cur = state.ytPlayer.getCurrentTime() || 0;
        if (state.ytPlayer && typeof state.ytPlayer.getDuration === 'function') dur = state.ytPlayer.getDuration() || 0;
      } catch (_) {}

      // 1. Check if pause occurred near the end of video (natural track completion)
      if (state.playbackStatus === 'playing' && (!state._trackStartTime || Date.now() - state._trackStartTime >= 4000) && cur > 2.0 && dur > 5 && cur >= Math.max(1, dur - 1.5)) {
        logPlayerDiagnostic('youtube.ended_near_end', `Near-end pause detected at cur=${cur.toFixed(1)}s/${dur.toFixed(1)}s -> Advancing queue`);
        state.playbackStatus = 'loading';
        syncPlaybackButtons();
        onEpisodeEnded();
        return;
      }

      // 2. Only guard the initial track transition (first 0.3s after changeover)
      // Never retry more than once per track, and never loop if track is already in progress
      const isStartupSpurious = !state._userIntentionalPause && state.playbackStatus === 'loading' && cur <= 0.3;

      if (isStartupSpurious && (state._ytSpuriousPauseRetries || 0) < 1) {
        state._ytSpuriousPauseRetries = 1;
        logPlayerDiagnostic('youtube.spurious_pause', `Ignored transition pause at cur=${cur.toFixed(2)}s -> Resuming once`);
        setTimeout(() => {
          if (state.activeEngine === 'youtube' && !state._userIntentionalPause && state.ytPlayer && typeof state.ytPlayer.playVideo === 'function') {
            state.ytPlayer.playVideo();
          }
        }, 300);
        return;
      }

      // 3. User intentional pause or normal pause
      state.playbackStatus = 'paused';
      syncPlaybackButtons();
      logPlayerDiagnostic('youtube.pause', `YouTube player paused at pos=${cur.toFixed(2)}s (userIntentional=${Boolean(state._userIntentionalPause)})`);
      if (state.currentEpisode && cur > 2 && typeof savePlaybackPositionToD1 === 'function') {
        savePlaybackPositionToD1(state.currentEpisode.guid, cur, false, true);
      }
    } else if (event.data === ytEnded) {
      // Guard against premature / delayed ended event from prior video during track transition:
      if (state._trackStartTime && (Date.now() - state._trackStartTime < 2000)) {
        logPlayerDiagnostic('youtube.end_ignored', `Ignored delayed ended event within 2.0s of video start`, true);
        return;
      }
      // Prevent Android OS from dropping background priority during changeovers:
      // Set playbackStatus = 'loading' rather than 'idle' while advancing
      state._ytSpuriousPauseRetries = 0;
      state.playbackStatus = 'loading';
      syncPlaybackButtons();
      logPlayerDiagnostic('youtube.ended', `Video finished naturally: "${state.currentEpisode?.title || ''}" -> Advancing queue`);
      onEpisodeEnded();
    } else if (event.data === ytCued) {
      logPlayerDiagnostic('youtube.cued', 'YouTube video cued -> Calling playVideo()', true);
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
    if (window.scrollY > 0) window.scrollTo(0, 0);
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
      if (window.scrollY > 0) window.scrollTo(0, 0);
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

  const saved = storage.getItem(STORAGE_KEYS.THEME) || 'system';
  applyTheme(saved);
  if (window.matchMedia) {
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
      const current = storage.getItem(STORAGE_KEYS.THEME) || 'system';
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
  storage.setItem(STORAGE_KEYS.THEME, theme);
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
  if (isStorageBlocked()) {
    elements.storagePermissionBanner.classList.remove('hidden');
  } else {
    elements.storagePermissionBanner.classList.add('hidden');
  }
}

