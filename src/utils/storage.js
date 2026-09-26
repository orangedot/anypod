/**
 * @file storage.js
 * @description Asynchronous IndexedDB storage adapter with synchronous localStorage fallback,
 * feed persistence, queue persistence, favorites, and OPML import/export.
 */

import { STORAGE_KEYS, IDB_CONFIG } from '../config/constants.js';
import { state, elements } from '../state/store.js';
import { escapeHtml } from './formatters.js';

let _idbPromise = null;

/**
 * Returns a Promise resolving to the open IndexedDB instance, or null if unsupported.
 * @returns {Promise<IDBDatabase|null>}
 */
export function getIdbInstance() {
  if (!_idbPromise) {
    _idbPromise = new Promise((resolve) => {
      if (typeof indexedDB === 'undefined') {
        return resolve(null);
      }
      try {
        const req = indexedDB.open(IDB_CONFIG.name, IDB_CONFIG.version);
        req.onupgradeneeded = (e) => {
          const db = e.target.result;
          if (!db.objectStoreNames.contains(IDB_CONFIG.store)) {
            db.createObjectStore(IDB_CONFIG.store);
          }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(null);
      } catch (_) {
        resolve(null);
      }
    });
  }
  return _idbPromise;
}

/**
 * Asynchronously gets a value from IndexedDB with localStorage fallback.
 * @param {string} key
 * @returns {Promise<any>}
 */
export async function idbGet(key) {
  try {
    const db = await getIdbInstance();
    if (!db) {
      const item = localStorage.getItem(key);
      return item ? JSON.parse(item) : null;
    }
    return new Promise((resolve) => {
      const tx = db.transaction(IDB_CONFIG.store, 'readonly');
      const store = tx.objectStore(IDB_CONFIG.store);
      const req = store.get(key);
      req.onsuccess = () => resolve(req.result !== undefined ? req.result : null);
      req.onerror = () => resolve(null);
    });
  } catch (_) {
    try {
      const item = localStorage.getItem(key);
      return item ? JSON.parse(item) : null;
    } catch (_) {
      return null;
    }
  }
}

/**
 * Asynchronously stores a value in IndexedDB with localStorage fallback.
 * @param {string} key
 * @param {any} value
 * @returns {Promise<boolean>}
 */
export async function idbSet(key, value) {
  try {
    const db = await getIdbInstance();
    if (!db) {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    }
    return new Promise((resolve) => {
      const tx = db.transaction(IDB_CONFIG.store, 'readwrite');
      const store = tx.objectStore(IDB_CONFIG.store);
      store.put(value, key);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => {
        try { localStorage.setItem(key, JSON.stringify(value)); } catch (_) {}
        resolve(false);
      };
    });
  } catch (_) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (_) {
      return false;
    }
  }
}

/**
 * Asynchronously removes a key from IndexedDB and localStorage.
 * @param {string} key
 * @returns {Promise<void>}
 */
export async function idbDel(key) {
  try {
    const db = await getIdbInstance();
    if (db) {
      const tx = db.transaction(IDB_CONFIG.store, 'readwrite');
      tx.objectStore(IDB_CONFIG.store).delete(key);
    }
    localStorage.removeItem(key);
  } catch (_) {}
}

// ── Cache Storage ─────────────────────────────────────────────────────────

export async function loadCacheFromStorage(onLoadedCallback) {
  try {
    let cachedEps = await idbGet(STORAGE_KEYS.CACHED_EPISODES);
    let cachedMeta = await idbGet(STORAGE_KEYS.CACHED_METADATA);

    // Migration fallback from synchronous localStorage
    if (!cachedEps) {
      const rawLegacyEps = localStorage.getItem(STORAGE_KEYS.CACHED_EPISODES);
      if (rawLegacyEps) {
        try {
          cachedEps = JSON.parse(rawLegacyEps);
          idbSet(STORAGE_KEYS.CACHED_EPISODES, cachedEps);
          try { localStorage.removeItem(STORAGE_KEYS.CACHED_EPISODES); } catch (_) {}
        } catch (_) {}
      }
    }
    if (!cachedMeta) {
      const rawLegacyMeta = localStorage.getItem(STORAGE_KEYS.CACHED_METADATA);
      if (rawLegacyMeta) {
        try {
          cachedMeta = JSON.parse(rawLegacyMeta);
          idbSet(STORAGE_KEYS.CACHED_METADATA, cachedMeta);
          try { localStorage.removeItem(STORAGE_KEYS.CACHED_METADATA); } catch (_) {}
        } catch (_) {}
      }
    }

    if (cachedEps && Array.isArray(cachedEps)) {
      state.allEpisodes = cachedEps;
    }
    if (cachedMeta && typeof cachedMeta === 'object') {
      state.feedMetadata = cachedMeta;
    }

    if (onLoadedCallback) onLoadedCallback();
  } catch (e) {
    console.warn('[anypod] loadCacheFromStorage error:', e);
  }
}

export function saveCacheToStorage() {
  try {
    if (state.allEpisodes && state.allEpisodes.length > 0) {
      const trimmed = state.allEpisodes.slice(0, 2000);
      idbSet(STORAGE_KEYS.CACHED_EPISODES, trimmed);
    }
    if (state.feedMetadata) {
      idbSet(STORAGE_KEYS.CACHED_METADATA, state.feedMetadata);
    }
  } catch (e) {
    console.warn('[anypod] saveCacheToStorage error:', e);
  }
}

// ── Playback Positions ───────────────────────────────────────────────────

export async function loadPositionsFromStorage(onLoadedCallback) {
  try {
    let saved = await idbGet(STORAGE_KEYS.POSITIONS);
    if (!saved) {
      const raw = localStorage.getItem(STORAGE_KEYS.POSITIONS) || localStorage.getItem('podcast_pulse_positions');
      if (raw) {
        saved = JSON.parse(raw);
        idbSet(STORAGE_KEYS.POSITIONS, saved);
        try { localStorage.removeItem(STORAGE_KEYS.POSITIONS); } catch (_) {}
      }
    }
    if (saved && typeof saved === 'object') {
      state.playbackPositions = saved;
      if (onLoadedCallback) onLoadedCallback();
    }
  } catch (e) {}
}

export function savePositionsToStorage() {
  try {
    idbSet(STORAGE_KEYS.POSITIONS, state.playbackPositions);
  } catch (e) {}
}

// ── Feeds & Muted Feeds ──────────────────────────────────────────────────

export function loadFeedsFromStorage() {
  try {
    const saved = localStorage.getItem(STORAGE_KEYS.FEEDS) || localStorage.getItem('podcast_pulse_feeds');
    state.feeds = saved ? JSON.parse(saved) : [];
  } catch (e) {
    state.feeds = [];
  }
  loadMutedFeedsFromStorage();
}

export function saveFeedsToStorage() {
  try {
    localStorage.setItem(STORAGE_KEYS.FEEDS, JSON.stringify(state.feeds));
  } catch (e) {}
}

export function loadMutedFeedsFromStorage() {
  try {
    const saved = localStorage.getItem(STORAGE_KEYS.MUTED_FEEDS);
    state.mutedFeeds = saved ? JSON.parse(saved) : [];
    if (!Array.isArray(state.mutedFeeds)) state.mutedFeeds = [];
  } catch (e) {
    state.mutedFeeds = [];
  }
}

export function saveMutedFeedsToStorage() {
  try {
    localStorage.setItem(STORAGE_KEYS.MUTED_FEEDS, JSON.stringify(state.mutedFeeds));
  } catch (e) {}
}

export function isFeedMuted(url) {
  return Array.isArray(state.mutedFeeds) && state.mutedFeeds.includes(url);
}

// ── Queue Storage ────────────────────────────────────────────────────────

export function loadQueueFromStorage() {
  try {
    const stored = localStorage.getItem(STORAGE_KEYS.QUEUE);
    if (stored) {
      state.queue = JSON.parse(stored);
      if (!Array.isArray(state.queue)) state.queue = [];
    } else {
      state.queue = [];
    }
  } catch (e) {
    state.queue = [];
  }
}

export function saveQueueToStorage() {
  try {
    const minimal = state.queue.map(ep => ({
      guid: ep.guid,
      title: ep.title,
      podcastTitle: ep.podcastTitle,
      audioUrl: ep.audioUrl,
      duration: ep.duration,
      artwork: ep.artwork,
      pubDate: ep.pubDate,
      feedUrl: ep.feedUrl,
      isYouTube: ep.isYouTube,
      videoId: ep.videoId
    }));
    localStorage.setItem(STORAGE_KEYS.QUEUE, JSON.stringify(minimal));
  } catch (e) {}
}

export function isEpisodeQueued(guid) {
  return state.queue.some(ep => ep.guid === guid);
}

// ── Favorites Storage ────────────────────────────────────────────────────

export function loadFavoritesFromStorage() {
  try {
    const stored = localStorage.getItem(STORAGE_KEYS.FAVORITES);
    state.favorites = stored ? JSON.parse(stored) : [];
    if (!Array.isArray(state.favorites)) state.favorites = [];
    state.favoriteGuids = new Set(state.favorites.map(f => f.guid).filter(Boolean));
  } catch (e) {
    state.favorites = [];
    state.favoriteGuids = new Set();
  }
}

export function saveFavoritesToStorage() {
  try {
    localStorage.setItem(STORAGE_KEYS.FAVORITES, JSON.stringify(state.favorites));
  } catch (e) {}
}

// ── Downloads Storage ────────────────────────────────────────────────────

export function loadDownloadsFromStorage() {
  try {
    const stored = localStorage.getItem(STORAGE_KEYS.DOWNLOADS);
    state.downloadedEpisodes = stored ? JSON.parse(stored) : {};
    if (typeof state.downloadedEpisodes !== 'object' || state.downloadedEpisodes === null) {
      state.downloadedEpisodes = {};
    }
  } catch (e) {
    state.downloadedEpisodes = {};
  }
}

export function saveDownloadsToStorage() {
  try {
    localStorage.setItem(STORAGE_KEYS.DOWNLOADS, JSON.stringify(state.downloadedEpisodes));
  } catch (e) {}
}

// ── OPML Export ──────────────────────────────────────────────────────────

export function exportOpml() {
  let xml = `<?xml version="1.0" encoding="UTF-8"?>\n<opml version="2.0">\n  <head>\n    <title>anypod export</title>\n  </head>\n  <body>\n`;
  state.feeds.forEach(url => {
    const meta = state.feedMetadata[url] || {};
    const title = meta.title ? escapeHtml(meta.title) : 'podcast';
    xml += `    <outline type="rss" text="${title}" title="${title}" xmlUrl="${escapeHtml(url)}"/>\n`;
  });
  xml += `  </body>\n</opml>`;

  const blob = new Blob([xml], { type: 'text/xml' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'anypod_subscriptions.opml';
  a.click();
}
