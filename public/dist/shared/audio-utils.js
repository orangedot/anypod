/**
 * Anypod Shared Audio & Media Utilities
 * Provides offline audio cache matching, audio proxy URL resolution,
 * MediaSession artwork formatting, and procedural WebAudio synth beat generation.
 */
(function (root) {
    'use strict';

    const AnypodShared = root.AnypodShared = root.AnypodShared || {};

    const OFFLINE_AUDIO_CACHE_NAME = 'anypod-audio-v1';

    /**
     * Resolves an audio stream URL through the /api/proxy endpoint when needed.
     * @param {string} url
     * @param {boolean} [forceProxy=false]
     * @returns {string}
     */
    function resolveAudioProxyUrl(url, forceProxy = false) {
        if (!url || typeof url !== 'string') return '';
        if (url.startsWith('blob:') || url.startsWith('data:') || url.startsWith('/api/proxy')) {
            return url;
        }
        if (forceProxy) {
            return `/api/proxy?url=${encodeURIComponent(url)}`;
        }
        return url;
    }

    /**
     * Checks the Cache Storage ('anypod-audio-v1') for an offline cached audio Response
     * matching either the direct URL or its proxied URL, and returns a Blob object URL if found.
     *
     * @param {string} url - Original audio URL
     * @returns {Promise<string|null>} Blob URL or null if not cached
     */
    async function matchOfflineAudioCache(url) {
        if (!url || !('caches' in window)) return null;
        try {
            const cache = await caches.open(OFFLINE_AUDIO_CACHE_NAME);
            const proxiedUrl = `/api/proxy?url=${encodeURIComponent(url)}`;
            let cachedRes = await cache.match(proxiedUrl);
            if (!cachedRes) {
                cachedRes = await cache.match(url);
            }
            if (cachedRes) {
                const blob = await cachedRes.blob();
                return URL.createObjectURL(blob);
            }
        } catch (err) {
            console.warn('[AnypodShared] Cache read error:', err);
        }
        return null;
    }

    /**
     * Builds a standard MediaSession artwork array with fallback to Anypod icons.
     * @param {string} [artworkUrl]
     * @param {string} [origin]
     * @returns {Array<{src: string, sizes: string, type: string}>}
     */
    function buildMediaSessionArtwork(artworkUrl, origin = window.location.origin) {
        if (artworkUrl && typeof artworkUrl === 'string' && artworkUrl.startsWith('http')) {
            return [
                { src: artworkUrl, sizes: '96x96', type: 'image/png' },
                { src: artworkUrl, sizes: '128x128', type: 'image/png' },
                { src: artworkUrl, sizes: '192x192', type: 'image/png' },
                { src: artworkUrl, sizes: '256x256', type: 'image/png' },
                { src: artworkUrl, sizes: '384x384', type: 'image/png' },
                { src: artworkUrl, sizes: '512x512', type: 'image/png' }
            ];
        }
        return [
            { src: `${origin}/icons/icon-192.png`, sizes: '192x192', type: 'image/png' },
            { src: `${origin}/icons/icon-512.png`, sizes: '512x512', type: 'image/png' }
        ];
    }

    /**
     * Procedurally generates a 4-bar rhythmic WAV loop at the specified BPM and style
     * and returns a Blob URL suitable for <audio> playback.
     *
     * @param {number} [bpm=128]
     * @param {'house'|'acid'|'techno'|'break'|'ambient'} [style='house']
     * @returns {string} Blob URL
     */
    function createSynthBeatBlobUrl(bpm = 128, style = 'house') {
        try {
            const sampleRate = 22050;
            const beatSec = 60 / bpm;
            const totalBars = 4;
            const totalSec = beatSec * 4 * totalBars;
            const totalSamples = Math.floor(sampleRate * totalSec);
            const buffer = new Int16Array(totalSamples);

            for (let i = 0; i < totalSamples; i++) {
                const t = i / sampleRate;
                const beatIndex = (t / beatSec) % 4;
                const beatFraction = beatIndex % 1;
                let sample = 0;

                // Kick drum on every beat (4/4)
                if (beatFraction < 0.25) {
                    const kickT = beatFraction * beatSec;
                    const kickFreq = 150 * Math.exp(-kickT * 32);
                    const kickEnv = Math.exp(-kickT * 18);
                    sample += Math.sin(2 * Math.PI * kickFreq * kickT) * kickEnv * 0.7;
                }

                // Snare / clap on beats 2 & 4
                const beatNum = Math.floor(beatIndex);
                if ((beatNum === 1 || beatNum === 3) && beatFraction < 0.3) {
                    const snareT = beatFraction * beatSec;
                    const noise = (Math.random() * 2 - 1) * Math.exp(-snareT * 22);
                    sample += noise * 0.4;
                }

                // Hi-hat on offbeats
                const offbeat = ((beatIndex + 0.5) % 1);
                if (offbeat < 0.15) {
                    const hatT = offbeat * beatSec;
                    sample += (Math.random() * 2 - 1) * Math.exp(-hatT * 40) * 0.25;
                }

                // Bassline pulse
                if (style === 'acid' || style === 'techno') {
                    const noteFreq = [55, 65.4, 73.4, 82.4][Math.floor(t / (beatSec / 2)) % 4];
                    const bassEnv = Math.exp(-(beatFraction % 0.5) * 8);
                    sample += Math.sin(2 * Math.PI * noteFreq * t) * bassEnv * 0.35;
                }

                buffer[i] = Math.max(-32767, Math.min(32767, Math.floor(sample * 28000)));
            }

            const wavBuffer = new ArrayBuffer(44 + buffer.byteLength);
            const view = new DataView(wavBuffer);
            const writeStr = (offset, str) => {
                for (let j = 0; j < str.length; j++) view.setUint8(offset + j, str.charCodeAt(j));
            };

            writeStr(0, 'RIFF');
            view.setUint32(4, 36 + buffer.byteLength, true);
            writeStr(8, 'WAVE');
            writeStr(12, 'fmt ');
            view.setUint32(16, 16, true);
            view.setUint16(20, 1, true); // PCM
            view.setUint16(22, 1, true); // Mono
            view.setUint32(24, sampleRate, true);
            view.setUint32(28, sampleRate * 2, true);
            view.setUint16(32, 2, true);
            view.setUint16(34, 16, true);
            writeStr(36, 'data');
            view.setUint32(40, buffer.byteLength, true);

            new Uint8Array(wavBuffer, 44).set(new Uint8Array(buffer.buffer));
            const blob = new Blob([wavBuffer], { type: 'audio/wav' });
            return URL.createObjectURL(blob);
        } catch (_) {
            return '';
        }
    }

    Object.assign(AnypodShared, {
        OFFLINE_AUDIO_CACHE_NAME,
        resolveAudioProxyUrl,
        matchOfflineAudioCache,
        buildMediaSessionArtwork,
        createSynthBeatBlobUrl
    });
})(typeof window !== 'undefined' ? window : globalThis);
