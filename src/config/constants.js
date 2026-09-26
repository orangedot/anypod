/**
 * @file constants.js
 * @description Global configuration constants, icon SVG definitions, and starter curated feed catalogs.
 */

export const STORAGE_KEYS = {
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
  EXPERIMENTAL: 'anypod_experimental_settings'
};

export const IDB_CONFIG = {
  name: 'anypod_storage_db',
  version: 1,
  store: 'keyval'
};

export const TIMELINE_BAR_COUNT = 240;

export const CARD_ICONS = {
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

export const FALLBACK_ARTWORK = 'data:image/svg+xml,%3Csvg%20xmlns=%22http://www.w3.org/2000/svg%22%20width=%22100%22%20height=%22100%22%3E%3Crect%20width=%22100%25%22%20height=%22100%25%22%20fill=%22%2318181b%22/%3E%3C/svg%3E';

export const DEFAULT_STARTER_FEEDS = [
  'https://feeds.megaphone.fm/NATIONALAERONAUTICSANDSPACEADMINISTRATION8162188566',
  'https://podcasts.files.bbci.co.uk/w13xtvb6.rss',
  'https://feeds.simplecast.com/EmVW7VGp',
  'https://www.deutschlandfunk.de/forschung-aktuell-102.xml'
];

export const CURATED_SCIENCE_FEEDS = [
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
