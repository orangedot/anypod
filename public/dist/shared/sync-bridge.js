/**
 * Anypod Shared Cross-Tab & Cross-Subdomain Sync Bridge
 * Manages BroadcastChannel ('anypod_storage_channel'), cross-origin storage-bridge.html iframe,
 * and active workout audio ducking notifications ('anypod_workout_sync').
 */
(function (root) {
    'use strict';

    const AnypodShared = root.AnypodShared = root.AnypodShared || {};

    let storageChannel = null;
    try {
        if ('BroadcastChannel' in window) {
            storageChannel = new BroadcastChannel('anypod_storage_channel');
        }
    } catch (_) {}

    let workoutChannel = null;
    try {
        if ('BroadcastChannel' in window) {
            workoutChannel = new BroadcastChannel('anypod_workout_sync');
        }
    } catch (_) {}

    /**
     * Broadcasts to other tabs on the same origin that Anypod storage has updated.
     */
    function notifyStorageUpdated() {
        if (storageChannel) {
            try {
                storageChannel.postMessage({ type: 'UPDATE_STORAGE', ts: Date.now() });
            } catch (_) {}
        }
    }

    /**
     * Initializes cross-tab (BroadcastChannel + storage event) and cross-subdomain
     * (storage-bridge.html iframe) listeners.
     *
     * @param {Object} options
     * @param {Function} [options.onUpdate] - Called when storage updates or bridge syncs data.
     * @param {Array<string>} [options.watchedKeys] - Keys to watch on window 'storage' event.
     * @param {boolean} [options.enableIframeBridge=true] - Whether to mount storage-bridge.html.
     */
    function initStorageBridge(options = {}) {
        const {
            onUpdate,
            watchedKeys = [
                'anypod_downloads',
                'anypod_cached_episodes',
                'anypod_cached_feeds',
                'anypod_cached_metadata',
                'anypod_feeds',
                'anypod_favorites',
                'anypod_playback_queue',
                'anypod_last_active_episode'
            ],
            enableIframeBridge = true
        } = options;

        const triggerUpdate = () => {
            if (typeof onUpdate === 'function') {
                onUpdate();
            }
        };

        // 1. Same-origin BroadcastChannel
        if (storageChannel) {
            storageChannel.addEventListener('message', (e) => {
                if (e.data && (e.data.type === 'UPDATE_STORAGE' || e.data.type === 'ANYPOD_STORAGE_UPDATED')) {
                    triggerUpdate();
                }
            });
        }

        // 2. Same-origin window 'storage' event
        window.addEventListener('storage', (e) => {
            if (!e.key || watchedKeys.includes(e.key)) {
                triggerUpdate();
            }
        });

        // 3. Cross-subdomain iframe bridge (e.g., dj.anypod.org / sets.anypod.org -> anypod.org)
        if (!enableIframeBridge) return;

        try {
            const isSubdomain = location.hostname.endsWith('.anypod.org') && location.hostname !== 'anypod.org';
            const bridgeOrigin = isSubdomain ? 'https://anypod.org' : '';
            const iframe = document.createElement('iframe');
            iframe.src = `${bridgeOrigin}/storage-bridge.html`;
            iframe.style.display = 'none';
            iframe.title = 'Storage Bridge';
            iframe.addEventListener('load', () => {
                try {
                    iframe.contentWindow?.postMessage({ type: 'ANYPOD_STORAGE_REQUEST' }, '*');
                } catch (_) {}
            });
            document.body.appendChild(iframe);

            window.addEventListener('message', (event) => {
                if (
                    event.data?.type === 'ANYPOD_STORAGE_READY' ||
                    event.data?.type === 'ANYPOD_STORAGE_RESPONSE' ||
                    event.data?.type === 'ANYPOD_STORAGE_UPDATE' ||
                    event.data?.type === 'ANYPOD_BRIDGE_DATA'
                ) {
                    const payload = event.data.payload;
                    if (payload && typeof payload === 'object') {
                        let hasNew = false;
                        Object.keys(payload).forEach((k) => {
                            const cur = localStorage.getItem(k);
                            if (payload[k] && cur !== payload[k]) {
                                try {
                                    localStorage.setItem(k, payload[k]);
                                    hasNew = true;
                                } catch (_) {}
                            }
                        });
                        if (hasNew) {
                            triggerUpdate();
                        }
                    }
                }
            });
        } catch (_) {}
    }

    /**
     * Broadcasts that a workout timer is actively playing audio (so DJ / podcast players can pause).
     * @param {string} [workoutLabel]
     */
    function notifyWorkoutActive(workoutLabel = '') {
        const ts = String(Date.now());
        if (workoutChannel) {
            try {
                workoutChannel.postMessage({
                    type: 'WORKOUT_ACTIVE',
                    workout: workoutLabel,
                    ts: Number(ts)
                });
            } catch (_) {}
        }
        try {
            localStorage.setItem('anypod_workout_active_ts', ts);
        } catch (_) {}
    }

    /**
     * Listens for workout active notifications across tabs.
     * @param {Object} options
     * @param {Function} options.onWorkoutActive - Callback invoked when workout starts/resumes.
     */
    function initWorkoutSync(options = {}) {
        const { onWorkoutActive } = options;
        if (typeof onWorkoutActive !== 'function') return;

        if (workoutChannel) {
            workoutChannel.addEventListener('message', (e) => {
                if (e.data && e.data.type === 'WORKOUT_ACTIVE') {
                    onWorkoutActive(e.data);
                }
            });
        }

        window.addEventListener('storage', (e) => {
            if (e.key === 'anypod_workout_active_ts' && e.newValue) {
                onWorkoutActive({ type: 'WORKOUT_ACTIVE', ts: Number(e.newValue) });
            }
        });
    }

    Object.assign(AnypodShared, {
        notifyStorageUpdated,
        initStorageBridge,
        notifyWorkoutActive,
        initWorkoutSync
    });
})(typeof window !== 'undefined' ? window : globalThis);
