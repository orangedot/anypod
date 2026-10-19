/**
 * shared/storage.js — Shared Storage Layer (Resilient localStorage + IndexedDB Store)
 * Used across Anypod Main Player (app), DJ Studio (dj), and Workout Sequencer (sets).
 */
(function (global) {
  'use strict';

  const AnypodShared = (global.AnypodShared = global.AnypodShared || {});

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
    LAST_EPISODE: 'anypod_last_active_episode',
    DJ_CUES: 'anypod_dj_cues',
    SETS_ROUTINE: 'anypod_sets_routine_v1'
  };

  let _storageBlocked = false;
  const _memoryStore = {};

  const safeStorage = {
    getItem(key) {
      try {
        if (global.localStorage) {
          return global.localStorage.getItem(key);
        }
      } catch (_) {
        _storageBlocked = true;
      }
      return Object.prototype.hasOwnProperty.call(_memoryStore, key) ? _memoryStore[key] : null;
    },
    setItem(key, val) {
      const valStr = String(val);
      try {
        if (global.localStorage) {
          global.localStorage.setItem(key, valStr);
          return;
        }
      } catch (e) {
        if (e.name !== 'QuotaExceededError' && e.code !== 22) {
          _storageBlocked = true;
        }
      }
      _memoryStore[key] = valStr;
    },
    removeItem(key) {
      try {
        if (global.localStorage) {
          global.localStorage.removeItem(key);
          return;
        }
      } catch (_) {
        _storageBlocked = true;
      }
      delete _memoryStore[key];
    },
    clear() {
      try {
        if (global.localStorage) {
          global.localStorage.clear();
          return;
        }
      } catch (_) {
        _storageBlocked = true;
      }
      for (const k in _memoryStore) delete _memoryStore[k];
    }
  };

  // Test storage access once at startup
  try {
    const testKey = '__storage_test__';
    global.localStorage.setItem(testKey, '1');
    global.localStorage.removeItem(testKey);
  } catch (_) {
    _storageBlocked = true;
    console.warn('[anypod] Browser local storage access is restricted. Using memory store fallback.');
  }

  function isStorageBlocked() {
    return _storageBlocked;
  }

  // IndexedDB Persistent Store for large libraries (1,000+ items without 5MB quota limits)
  const idbStore = {
    _dbPromise: null,
    getDb() {
      if (this._dbPromise) return this._dbPromise;
      this._dbPromise = new Promise((resolve) => {
        if (typeof global === 'undefined' || !global.indexedDB) return resolve(null);
        try {
          const req = global.indexedDB.open('anypod_store_v1', 1);
          req.onupgradeneeded = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains('keyval')) {
              db.createObjectStore('keyval');
            }
          };
          req.onsuccess = (e) => resolve(e.target.result);
          req.onerror = () => resolve(null);
        } catch (_) {
          resolve(null);
        }
      });
      return this._dbPromise;
    },
    async get(key) {
      try {
        const db = await this.getDb();
        if (!db) return null;
        return new Promise((resolve) => {
          try {
            const tx = db.transaction('keyval', 'readonly');
            const store = tx.objectStore('keyval');
            const req = store.get(key);
            req.onsuccess = () => resolve(req.result || null);
            req.onerror = () => resolve(null);
          } catch (_) {
            resolve(null);
          }
        });
      } catch (_) {
        return null;
      }
    },
    async set(key, val) {
      try {
        const db = await this.getDb();
        if (!db) return;
        return new Promise((resolve) => {
          try {
            const tx = db.transaction('keyval', 'readwrite');
            const store = tx.objectStore('keyval');
            store.put(val, key);
            tx.oncomplete = () => resolve();
            tx.onerror = () => resolve();
          } catch (_) {
            resolve();
          }
        });
      } catch (_) {}
    }
  };

  function getJsonItem(key, fallback) {
    try {
      const raw = safeStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (_) {
      return fallback;
    }
  }

  function getDownloadsMap() {
    const map = getJsonItem(STORAGE_KEYS.DOWNLOADS, {});
    return map && typeof map === 'object' ? map : {};
  }

  function getLastActiveEpisode() {
    return getJsonItem(STORAGE_KEYS.LAST_EPISODE, null);
  }

  function getCachedFeeds() {
    const list = getJsonItem(STORAGE_KEYS.FEEDS, []);
    return Array.isArray(list) ? list : [];
  }

  function getCachedMetadata() {
    const meta = getJsonItem(STORAGE_KEYS.CACHED_METADATA, {});
    return meta && typeof meta === 'object' ? meta : {};
  }

  Object.assign(AnypodShared, {
    STORAGE_KEYS,
    safeStorage,
    isStorageBlocked,
    idbStore,
    getJsonItem,
    getDownloadsMap,
    getLastActiveEpisode,
    getCachedFeeds,
    getCachedMetadata
  });
})(window);
