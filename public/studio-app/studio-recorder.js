(function (root) {
  'use strict';

  const DB_NAME = 'anypod_studio_crash_store_v1';
  const STORE_META = 'sessions';
  const STORE_CHUNKS = 'chunks';

  function createMemoryCrashStore() {
    const sessions = new Map();
    const chunks = new Map();

    return {
      backend: 'memory',
      startSession: async function (meta) {
        const id = (meta && meta.id) || ('rec-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7));
        const record = {
          id: id,
          startedAt: Date.now(),
          updatedAt: Date.now(),
          sampleRate: (meta && meta.sampleRate) || 48000,
          mimeType: (meta && meta.mimeType) || 'audio/webm',
          chunkCount: 0,
          totalBytes: 0,
          status: 'recording'
        };
        sessions.set(id, record);
        chunks.set(id, []);
        return record;
      },
      appendChunk: async function (sessionId, chunkBytes, index) {
        const s = sessions.get(sessionId);
        if (!s) throw new Error('Session not found: ' + sessionId);
        const bytes = chunkBytes instanceof Uint8Array ? chunkBytes : new Uint8Array(chunkBytes);
        const list = chunks.get(sessionId) || [];
        list.push({ index: index !== undefined ? index : list.length, bytes: bytes, savedAt: Date.now() });
        chunks.set(sessionId, list);
        s.chunkCount = list.length;
        s.totalBytes += bytes.byteLength;
        s.updatedAt = Date.now();
        return s;
      },
      markCompleted: async function (sessionId) {
        const s = sessions.get(sessionId);
        if (s) {
          s.status = 'completed';
          s.updatedAt = Date.now();
        }
        return s;
      },
      getRecoverableSession: async function () {
        let latest = null;
        sessions.forEach(function (val) {
          if (val.chunkCount > 0 && (!latest || val.updatedAt > latest.updatedAt)) {
            latest = val;
          }
        });
        return latest;
      },
      assembleSessionBytes: async function (sessionId) {
        const s = sessions.get(sessionId);
        const list = (chunks.get(sessionId) || []).slice().sort(function (a, b) { return a.index - b.index; });
        const total = list.reduce(function (acc, c) { return acc + c.bytes.byteLength; }, 0);
        const out = new Uint8Array(total);
        let offset = 0;
        for (let i = 0; i < list.length; i++) {
          out.set(list[i].bytes, offset);
          offset += list[i].bytes.byteLength;
        }
        return { meta: s || null, bytes: out };
      },
      clearSession: async function (sessionId) {
        sessions.delete(sessionId);
        chunks.delete(sessionId);
      },
      clearAll: async function () {
        sessions.clear();
        chunks.clear();
      }
    };
  }

  function openIdb() {
    return new Promise(function (resolve, reject) {
      if (typeof indexedDB === 'undefined') {
        reject(new Error('IndexedDB unavailable'));
        return;
      }
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = function (e) {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(STORE_META)) {
          db.createObjectStore(STORE_META, { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains(STORE_CHUNKS)) {
          const cs = db.createObjectStore(STORE_CHUNKS, { keyPath: 'key' });
          cs.createIndex('sessionId', 'sessionId', { unique: false });
        }
      };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error); };
    });
  }

  function createIndexedDbCrashStore() {
    return {
      backend: 'indexeddb',
      startSession: async function (meta) {
        const db = await openIdb();
        const id = (meta && meta.id) || ('rec-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7));
        const record = {
          id: id,
          startedAt: Date.now(),
          updatedAt: Date.now(),
          sampleRate: (meta && meta.sampleRate) || 48000,
          mimeType: (meta && meta.mimeType) || 'audio/webm',
          chunkCount: 0,
          totalBytes: 0,
          status: 'recording'
        };
        await new Promise(function (resolve, reject) {
          const tx = db.transaction([STORE_META], 'readwrite');
          tx.objectStore(STORE_META).put(record);
          tx.oncomplete = function () { resolve(); };
          tx.onerror = function () { reject(tx.error); };
        });
        return record;
      },
      appendChunk: async function (sessionId, chunkBytes, index) {
        const db = await openIdb();
        const bytes = chunkBytes instanceof Uint8Array ? chunkBytes : new Uint8Array(chunkBytes);
        return new Promise(function (resolve, reject) {
          const tx = db.transaction([STORE_META, STORE_CHUNKS], 'readwrite');
          const metaStore = tx.objectStore(STORE_META);
          const chunkStore = tx.objectStore(STORE_CHUNKS);
          const getReq = metaStore.get(sessionId);
          getReq.onsuccess = function () {
            const s = getReq.result;
            if (!s) {
              reject(new Error('Session not found'));
              return;
            }
            const idx = index !== undefined ? index : s.chunkCount;
            chunkStore.put({
              key: sessionId + ':' + String(idx).padStart(6, '0'),
              sessionId: sessionId,
              index: idx,
              bytes: bytes,
              savedAt: Date.now()
            });
            s.chunkCount += 1;
            s.totalBytes += bytes.byteLength;
            s.updatedAt = Date.now();
            metaStore.put(s);
            tx.oncomplete = function () { resolve(s); };
          };
          tx.onerror = function () { reject(tx.error); };
        });
      },
      markCompleted: async function (sessionId) {
        const db = await openIdb();
        return new Promise(function (resolve, reject) {
          const tx = db.transaction([STORE_META], 'readwrite');
          const store = tx.objectStore(STORE_META);
          const getReq = store.get(sessionId);
          getReq.onsuccess = function () {
            const s = getReq.result;
            if (s) {
              s.status = 'completed';
              s.updatedAt = Date.now();
              store.put(s);
            }
            tx.oncomplete = function () { resolve(s); };
          };
          tx.onerror = function () { reject(tx.error); };
        });
      },
      getRecoverableSession: async function () {
        const db = await openIdb();
        return new Promise(function (resolve, reject) {
          const tx = db.transaction([STORE_META], 'readonly');
          const req = tx.objectStore(STORE_META).getAll();
          req.onsuccess = function () {
            const all = req.result || [];
            let latest = null;
            for (let i = 0; i < all.length; i++) {
              const item = all[i];
              if (item.chunkCount > 0 && (!latest || item.updatedAt > latest.updatedAt)) {
                latest = item;
              }
            }
            resolve(latest);
          };
          req.onerror = function () { reject(req.error); };
        });
      },
      assembleSessionBytes: async function (sessionId) {
        const db = await openIdb();
        return new Promise(function (resolve, reject) {
          const tx = db.transaction([STORE_META, STORE_CHUNKS], 'readonly');
          const metaReq = tx.objectStore(STORE_META).get(sessionId);
          const idx = tx.objectStore(STORE_CHUNKS).index('sessionId');
          const chunksReq = idx.getAll(sessionId);
          tx.oncomplete = function () {
            const meta = metaReq.result || null;
            const list = (chunksReq.result || []).slice().sort(function (a, b) { return a.index - b.index; });
            const total = list.reduce(function (acc, c) { return acc + c.bytes.byteLength; }, 0);
            const out = new Uint8Array(total);
            let offset = 0;
            for (let i = 0; i < list.length; i++) {
              const b = list[i].bytes instanceof Uint8Array ? list[i].bytes : new Uint8Array(list[i].bytes);
              out.set(b, offset);
              offset += b.byteLength;
            }
            resolve({ meta: meta, bytes: out });
          };
          tx.onerror = function () { reject(tx.error); };
        });
      },
      clearSession: async function (sessionId) {
        const db = await openIdb();
        return new Promise(function (resolve, reject) {
          const tx = db.transaction([STORE_META, STORE_CHUNKS], 'readwrite');
          tx.objectStore(STORE_META).delete(sessionId);
          const chunkStore = tx.objectStore(STORE_CHUNKS);
          const idx = chunkStore.index('sessionId');
          const req = idx.openKeyCursor(IDBKeyRange.only(sessionId));
          req.onsuccess = function () {
            const cursor = req.result;
            if (cursor) {
              chunkStore.delete(cursor.primaryKey);
              cursor.continue();
            }
          };
          tx.oncomplete = function () { resolve(); };
          tx.onerror = function () { reject(tx.error); };
        });
      },
      clearAll: async function () {
        const db = await openIdb();
        return new Promise(function (resolve, reject) {
          const tx = db.transaction([STORE_META, STORE_CHUNKS], 'readwrite');
          tx.objectStore(STORE_META).clear();
          tx.objectStore(STORE_CHUNKS).clear();
          tx.oncomplete = function () { resolve(); };
          tx.onerror = function () { reject(tx.error); };
        });
      }
    };
  }

  function createDefaultCrashStore() {
    if (typeof indexedDB !== 'undefined') {
      return createIndexedDbCrashStore();
    }
    return createMemoryCrashStore();
  }

  function listAudioInputs() {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
      return Promise.resolve([]);
    }
    return navigator.mediaDevices.enumerateDevices().then(function (devices) {
      return devices.filter(function (d) { return d.kind === 'audioinput'; }).map(function (d, i) {
        return {
          deviceId: d.deviceId || 'default',
          label: d.label || ('Microphone ' + (i + 1))
        };
      });
    }).catch(function () { return []; });
  }

  function pickSupportedMimeType() {
    if (typeof MediaRecorder === 'undefined' || !MediaRecorder.isTypeSupported) {
      return '';
    }
    const candidates = [
      'audio/webm;codecs=opus',
      'audio/webm',
      'audio/mp4',
      'audio/ogg;codecs=opus'
    ];
    for (let i = 0; i < candidates.length; i++) {
      if (MediaRecorder.isTypeSupported(candidates[i])) return candidates[i];
    }
    return '';
  }

  function createLiveRecorder(options) {
    const opts = options || {};
    const store = opts.crashStore || createDefaultCrashStore();
    const onMeter = typeof opts.onMeter === 'function' ? opts.onMeter : function () {};
    const onChunkSaved = typeof opts.onChunkSaved === 'function' ? opts.onChunkSaved : function () {};

    let mediaStream = null;
    let audioCtx = null;
    let analyser = null;
    let mediaRecorder = null;
    let meterTimer = null;
    let activeSession = null;
    let chunkIndex = 0;
    let startedAtMs = 0;

    async function start(deviceId) {
      const audioConstraints = {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
        channelCount: 1
      };
      if (deviceId && deviceId !== 'default') {
        audioConstraints.deviceId = { exact: deviceId };
      }

      mediaStream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints, video: false });
      const AudioCtx = root.AudioContext || root.webkitAudioContext;
      audioCtx = new AudioCtx();
      const source = audioCtx.createMediaStreamSource(mediaStream);
      analyser = audioCtx.createAnalyser();
      analyser.fftSize = 1024;
      source.connect(analyser);

      const mimeType = pickSupportedMimeType();
      activeSession = await store.startSession({
        sampleRate: audioCtx.sampleRate || 48000,
        mimeType: mimeType || 'audio/webm'
      });
      chunkIndex = 0;
      startedAtMs = Date.now();

      const recOptions = mimeType ? { mimeType: mimeType, audioBitsPerSecond: 192000 } : { audioBitsPerSecond: 192000 };
      mediaRecorder = new MediaRecorder(mediaStream, recOptions);

      mediaRecorder.ondataavailable = function (ev) {
        if (ev.data && ev.data.size > 0 && activeSession) {
          const idx = chunkIndex++;
          ev.data.arrayBuffer().then(function (buf) {
            return store.appendChunk(activeSession.id, new Uint8Array(buf), idx);
          }).then(function (updated) {
            onChunkSaved(updated);
          }).catch(function () {});
        }
      };

      const timeDomain = new Float32Array(analyser.fftSize);
      meterTimer = setInterval(function () {
        if (!analyser) return;
        analyser.getFloatTimeDomainData(timeDomain);
        let sum = 0;
        let peak = 0;
        for (let i = 0; i < timeDomain.length; i++) {
          const v = timeDomain[i];
          const a = Math.abs(v);
          sum += v * v;
          if (a > peak) peak = a;
        }
        const rms = Math.sqrt(sum / timeDomain.length);
        const db = rms > 0.00001 ? 20 * Math.log10(rms) : -90;
        onMeter({
          rms: rms,
          peak: peak,
          db: db,
          clipped: peak >= 0.985,
          elapsedSeconds: (Date.now() - startedAtMs) / 1000
        });
      }, 60);

      mediaRecorder.start(1000);
      return activeSession;
    }

    function stop() {
      return new Promise(function (resolve, reject) {
        if (meterTimer) {
          clearInterval(meterTimer);
          meterTimer = null;
        }
        if (!mediaRecorder || mediaRecorder.state === 'inactive') {
          resolve(null);
          return;
        }
        const sessionId = activeSession ? activeSession.id : null;
        mediaRecorder.onstop = function () {
          if (mediaStream) {
            mediaStream.getTracks().forEach(function (t) { t.stop(); });
            mediaStream = null;
          }
          if (audioCtx && typeof audioCtx.close === 'function') {
            audioCtx.close().catch(function () {});
            audioCtx = null;
          }
          if (!sessionId) {
            resolve(null);
            return;
          }
          setTimeout(function () {
            store.markCompleted(sessionId).then(function () {
              return store.assembleSessionBytes(sessionId);
            }).then(function (assembled) {
              resolve(assembled);
            }).catch(reject);
          }, 120);
        };
        mediaRecorder.stop();
      });
    }

    return {
      start: start,
      stop: stop,
      crashStore: store
    };
  }

  const api = {
    createMemoryCrashStore: createMemoryCrashStore,
    createIndexedDbCrashStore: createIndexedDbCrashStore,
    createDefaultCrashStore: createDefaultCrashStore,
    listAudioInputs: listAudioInputs,
    createLiveRecorder: createLiveRecorder
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  root.StudioRecorder = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
