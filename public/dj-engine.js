/**
 * Anypod DJ Studio Engine (Traktor Pro Inspired)
 * Dual-deck architecture supporting both Web Audio API (EQ, Color Filter, Gain, VU Analyser)
 * AND YouTube IFrame API playback for YouTube playlists & songs.
 */
(function (global) {
  'use strict';

  const DECKS = ['A', 'B'];
  const EQ_BANDS = { low: 0, mid: 1, high: 2 };
  const HOT_CUE_COUNT = 4;
  const CUE_STORE = 'anypod_dj_cues';

  const memStore = {};
  const store = {
    get(k) {
      try { return localStorage.getItem(k); } catch (_) { return memStore[k] || null; }
    },
    set(k, v) {
      try { localStorage.setItem(k, v); } catch (_) { memStore[k] = v; }
    }
  };

  function extractYouTubeId(url) {
    if (!url) return null;
    const str = String(url);
    const m = str.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([\w-]{11})/i);
    return m ? m[1] : null;
  }

  class DJMixer {
    constructor() {
      const Ctx = global.AudioContext || global.webkitAudioContext;
      this.ctx = new Ctx({ latencyHint: 'playback' });
      this.listeners = {};
      this.crossfade = 0.5;
      this.channelVolumes = { A: 1.0, B: 1.0 };
      this.channelGains = { A: 0, B: 0 };
      this.activeEngines = { A: 'audio', B: 'audio' };

      // Master Compressor
      this.master = this.ctx.createDynamicsCompressor();
      this.master.threshold.value = -16;
      this.master.knee.value = 24;
      this.master.ratio.value = 4;
      this.master.attack.value = 0.005;
      this.master.release.value = 0.25;

      // Master Analyser for Master VU meter
      this.masterAnalyser = this.ctx.createAnalyser();
      this.masterAnalyser.fftSize = 64;
      this.masterAnalyser.smoothingTimeConstant = 0.8;

      this.master.connect(this.masterAnalyser);
      this.masterAnalyser.connect(this.ctx.destination);

      this.decks = {};
      DECKS.forEach((id) => this._buildDeck(id));
      this.setCrossfader(0.5, true);

      // AudioContext lifecycle auto-resume
      const resume = () => {
        if (this.ctx && this.ctx.state !== 'running') {
          this.ctx.resume().catch(() => {});
        }
      };
      document.addEventListener('visibilitychange', resume);
      document.addEventListener('pointerdown', resume, { once: true });
      this.ctx.addEventListener('statechange', () => {
        this._emit('context', this.ctx.state);
        if (this.ctx.state !== 'running' && DECKS.some((d) => this.isPlaying(d))) resume();
      });
      this._resume = resume;

      // Real-time animation loop for VU meters & YouTube time tracking
      this._startMeteringLoop();
    }

    _buildDeck(id) {
      const audio = new Audio();
      audio.crossOrigin = 'anonymous';
      audio.preload = 'auto';
      audio.preservesPitch = true;
      audio.setAttribute('playsinline', '');

      let src = null;
      try {
        src = this.ctx.createMediaElementSource(audio);
      } catch (err) {
        console.warn(`[dj-engine] createMediaElementSource for deck ${id}:`, err);
      }

      // Pre-Gain node (Gain knob)
      const gainPre = this.ctx.createGain();
      gainPre.gain.value = 1.0;

      // 3-Band Equalizer
      const low = this.ctx.createBiquadFilter();
      low.type = 'lowshelf';
      low.frequency.value = 300;

      const mid = this.ctx.createBiquadFilter();
      mid.type = 'peaking';
      mid.frequency.value = 1200;
      mid.Q.value = 0.8;

      const high = this.ctx.createBiquadFilter();
      high.type = 'highshelf';
      high.frequency.value = 3500;

      // DJ Sound Color Filter (LPF/HPF combo)
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'allpass';
      filter.frequency.value = 1000;

      // Channel Volume Fader
      const gainVol = this.ctx.createGain();
      gainVol.gain.value = 1.0;

      // Crossfader gain
      const gainCross = this.ctx.createGain();
      gainCross.gain.value = 0.707;

      // Deck Analyser for Deck VU meter
      const analyser = this.ctx.createAnalyser();
      analyser.fftSize = 64;
      analyser.smoothingTimeConstant = 0.8;

      if (src) {
        src.connect(gainPre);
        gainPre.connect(low);
        low.connect(mid);
        mid.connect(high);
        high.connect(filter);
        filter.connect(gainVol);
        gainVol.connect(gainCross);
        gainCross.connect(analyser);
        analyser.connect(this.master);
      }

      const deck = {
        id,
        audio,
        src,
        gainPre,
        eq: [low, mid, high],
        filter,
        gainVol,
        gainCross,
        analyser,
        meta: null,
        cues: [null, null, null, null],
        ytPlayer: null,
        ytReady: false,
        ytVideoId: null,
        engine: 'audio', // 'audio' | 'youtube'
        loop: { active: false, start: 0, end: 0 }
      };

      audio.addEventListener('timeupdate', () => {
        if (deck.engine === 'audio') {
          // Check active loop
          if (deck.loop.active && deck.loop.end > deck.loop.start && audio.currentTime >= deck.loop.end) {
            audio.currentTime = deck.loop.start;
          }
          this._emit('time', { deck: id, currentTime: audio.currentTime, duration: audio.duration || 0 });
        }
      });
      audio.addEventListener('play', () => {
        if (deck.engine === 'audio') this._emit('state', { deck: id, playing: true });
      });
      audio.addEventListener('pause', () => {
        if (deck.engine === 'audio') this._emit('state', { deck: id, playing: false });
      });
      audio.addEventListener('ended', () => {
        if (deck.engine === 'audio') this._emit('state', { deck: id, playing: false, ended: true });
      });
      audio.addEventListener('loadedmetadata', () => {
        if (deck.engine === 'audio') this._emit('loaded', { deck: id, duration: audio.duration });
      });
      audio.addEventListener('error', () => {
        if (deck.engine === 'audio') this._emit('error', { deck: id });
      });

      this.decks[id] = deck;
    }

    on(evt, fn) { (this.listeners[evt] = this.listeners[evt] || []).push(fn); }
    _emit(evt, data) { (this.listeners[evt] || []).forEach((fn) => fn(data)); }

    _resolveUrl(url) {
      try {
        const u = new URL(url, location.href);
        if (u.origin === location.origin || u.protocol === 'blob:') return u.href;
        return '/api/audio-proxy?url=' + encodeURIComponent(u.href);
      } catch (_) { return url; }
    }

    /**
     * Loads a track into Deck A or B.
     * Intelligently routes between HTML5 Audio and YouTube Iframe Engine.
     */
    loadTrack(deckId, track) {
      const d = this.decks[deckId];
      if (!d) return;

      const rawUrl = track.audioUrl || track.url || '';
      const ytId = track.videoId || extractYouTubeId(rawUrl);
      const isYt = !!track.isYouTube || !!ytId;

      d.meta = Object.assign({
        title: track.title || 'Untitled Track',
        podcastTitle: track.podcastTitle || track.author || '',
        artwork: track.artwork || '',
        duration: track.duration || 0,
        bpm: track.bpm || 126,
        key: track.key || '8m',
        url: rawUrl,
        isYouTube: isYt,
        videoId: ytId
      }, track);

      d.cues = this._loadCues(d.meta.url || d.meta.guid || d.meta.title);
      d.loop.active = false;

      if (isYt && ytId) {
        // Switch Deck to YouTube Engine
        d.audio.pause();
        d.engine = 'youtube';
        this.activeEngines[deckId] = 'youtube';
        d.ytVideoId = ytId;
        this._initOrLoadYouTubePlayer(deckId, ytId);
      } else {
        // Switch Deck to HTML5 Audio Engine
        if (d.ytPlayer && typeof d.ytPlayer.pauseVideo === 'function') {
          try { d.ytPlayer.pauseVideo(); } catch (_) {}
        }
        d.engine = 'audio';
        this.activeEngines[deckId] = 'audio';
        d.audio.pause();
        d.audio.src = this._resolveUrl(rawUrl);
        d.audio.load();

        // Fallback: If proxy fails (404/502), fall back to direct stream URL
        const onProxyError = () => {
          d.audio.removeEventListener('error', onProxyError);
          if (d.audio.src && d.audio.src.includes('/api/audio-proxy') && rawUrl) {
            console.warn(`[dj-engine] Audio proxy failed on deck ${deckId}, falling back to direct URL:`, rawUrl);
            d.audio.src = rawUrl;
            d.audio.load();
          }
        };
        d.audio.addEventListener('error', onProxyError, { once: true });

        // Offline Cache: Check Cache API (anypod-audio-v1) for downloaded audio files
        if ('caches' in window && rawUrl) {
          caches.open('anypod-audio-v1').then(async (cache) => {
            const match = await cache.match(rawUrl);
            if (match) {
              const blob = await match.blob();
              const blobUrl = URL.createObjectURL(blob);
              if (d.meta && d.meta.url === rawUrl) {
                d.audio.src = blobUrl;
                d.audio.load();
              }
            }
          }).catch(() => {});
        }
      }

      this._setMediaSession(d);
      this._emit('track', { deck: deckId, meta: d.meta, cues: d.cues.slice(), engine: d.engine });
    }

    _initOrLoadYouTubePlayer(deckId, videoId) {
      const d = this.decks[deckId];
      const containerId = `yt-embed-${deckId.toLowerCase()}`;

      const applyVolume = () => {
        if (d.ytPlayer && typeof d.ytPlayer.setVolume === 'function') {
          const combinedVol = Math.round(this._getDeckEffectiveVolume(deckId) * 100);
          d.ytPlayer.setVolume(Math.min(100, Math.max(0, combinedVol)));
        }
      };

      if (d.ytPlayer && d.ytReady && typeof d.ytPlayer.loadVideoById === 'function') {
        try {
          d.ytPlayer.loadVideoById(videoId, 0);
          applyVolume();
          this._emit('loaded', { deck: deckId, duration: d.meta.duration || 180 });
          return;
        } catch (_) {}
      }

      const createPlayer = () => {
        if (!global.YT || !global.YT.Player) return;
        const cont = document.getElementById(containerId);
        if (!cont) return;

        d.ytPlayer = new global.YT.Player(containerId, {
          height: '100%',
          width: '100%',
          videoId: videoId,
          playerVars: {
            autoplay: 0,
            controls: 0,
            disablekb: 1,
            fs: 0,
            modestbranding: 1,
            playsinline: 1,
            rel: 0
          },
          events: {
            onReady: (event) => {
              d.ytReady = true;
              applyVolume();
              const dur = d.ytPlayer.getDuration ? d.ytPlayer.getDuration() : (d.meta.duration || 180);
              this._emit('loaded', { deck: deckId, duration: dur });
            },
            onStateChange: (event) => {
              const state = event.data;
              const isPlaying = state === global.YT.PlayerState.PLAYING;
              this._emit('state', { deck: deckId, playing: isPlaying });
            }
          }
        });
      };

      if (global.YT && global.YT.Player) {
        createPlayer();
      } else {
        const checkYt = setInterval(() => {
          if (global.YT && global.YT.Player) {
            clearInterval(checkYt);
            createPlayer();
          }
        }, 100);
        setTimeout(() => clearInterval(checkYt), 8000);
      }
    }

    _getDeckEffectiveVolume(deckId) {
      const x = this.crossfade;
      const xGain = deckId === 'A'
        ? Math.cos(x * Math.PI / 2)
        : Math.cos((1 - x) * Math.PI / 2);
      const chVol = this.channelVolumes[deckId] ?? 1.0;
      const gainPre = Math.pow(10, (this.channelGains[deckId] || 0) / 20);
      return Math.min(1.0, Math.max(0.0, xGain * chVol * gainPre));
    }

    async play(deckId) {
      await this._resume();
      const d = this.decks[deckId];
      if (d.engine === 'youtube') {
        if (d.ytPlayer && typeof d.ytPlayer.playVideo === 'function') {
          d.ytPlayer.playVideo();
          this._emit('state', { deck: deckId, playing: true });
        }
      } else {
        return d.audio.play().catch(() => {});
      }
    }

    pause(deckId) {
      const d = this.decks[deckId];
      if (d.engine === 'youtube') {
        if (d.ytPlayer && typeof d.ytPlayer.pauseVideo === 'function') {
          d.ytPlayer.pauseVideo();
          this._emit('state', { deck: deckId, playing: false });
        }
      } else {
        d.audio.pause();
      }
    }

    toggle(deckId) {
      return this.isPlaying(deckId) ? this.pause(deckId) : this.play(deckId);
    }

    isPlaying(deckId) {
      const d = this.decks[deckId];
      if (!d) return false;
      if (d.engine === 'youtube') {
        return d.ytPlayer && typeof d.ytPlayer.getPlayerState === 'function' && d.ytPlayer.getPlayerState() === 1;
      }
      return !d.audio.paused;
    }

    seek(deckId, seconds) {
      const d = this.decks[deckId];
      const target = Math.max(0, seconds);
      if (d.engine === 'youtube') {
        if (d.ytPlayer && typeof d.ytPlayer.seekTo === 'function') {
          d.ytPlayer.seekTo(target, true);
        }
      } else {
        if (isFinite(target)) d.audio.currentTime = target;
      }
    }

    setPlaybackRate(deckId, rate, keepPitch = true) {
      const r = Math.min(2.0, Math.max(0.5, rate));
      const d = this.decks[deckId];
      if (d.engine === 'youtube') {
        if (d.ytPlayer && typeof d.ytPlayer.setPlaybackRate === 'function') {
          d.ytPlayer.setPlaybackRate(r);
        }
      } else {
        d.audio.preservesPitch = keepPitch;
        d.audio.playbackRate = r;
      }
    }

    /**
     * Gain Knob (-12dB to +12dB)
     */
    setGain(deckId, dB) {
      const clamped = Math.max(-12, Math.min(12, dB));
      this.channelGains[deckId] = clamped;
      const d = this.decks[deckId];
      const gainVal = Math.pow(10, clamped / 20);
      d.gainPre.gain.setTargetAtTime(gainVal, this.ctx.currentTime, 0.015);

      if (d.engine === 'youtube' && d.ytPlayer) {
        const combinedVol = Math.round(this._getDeckEffectiveVolume(deckId) * 100);
        d.ytPlayer.setVolume(Math.min(100, Math.max(0, combinedVol)));
      }
    }

    /**
     * 3-Band EQ: band 'low' | 'mid' | 'high', dB: -24 .. +12
     */
    setEQ(deckId, band, dB) {
      const d = this.decks[deckId];
      const node = d.eq[EQ_BANDS[band]];
      if (!node) return;
      const target = Math.max(-24, Math.min(12, dB));
      node.gain.setTargetAtTime(target, this.ctx.currentTime, 0.015);
    }

    /**
     * Traktor Sound Color Filter:
     * -1.0 = full Low-Pass (dark/muffled)
     *  0.0 = off / transparent
     * +1.0 = full High-Pass (thin/sizzle)
     */
    setFilter(deckId, val) {
      const d = this.decks[deckId];
      const f = d.filter;
      const t = this.ctx.currentTime;
      const norm = Math.max(-1, Math.min(1, val));

      if (Math.abs(norm) < 0.04) {
        f.type = 'allpass';
        f.frequency.setTargetAtTime(1000, t, 0.02);
      } else if (norm < 0) {
        // Low-pass filter (sweeps down from 20kHz to 200Hz)
        f.type = 'lowpass';
        const freq = 200 + (1 + norm) * 19800;
        f.frequency.setTargetAtTime(Math.max(100, freq), t, 0.02);
        f.Q.setTargetAtTime(1.2, t, 0.02);
      } else {
        // High-pass filter (sweeps up from 20Hz to 8kHz)
        f.type = 'highpass';
        const freq = 20 + norm * 7980;
        f.frequency.setTargetAtTime(Math.min(12000, freq), t, 0.02);
        f.Q.setTargetAtTime(1.2, t, 0.02);
      }
    }

    /**
     * Channel Volume Fader: 0.0 to 1.0
     */
    setVolume(deckId, val) {
      const v = Math.max(0, Math.min(1, val));
      this.channelVolumes[deckId] = v;
      const d = this.decks[deckId];
      d.gainVol.gain.setTargetAtTime(v, this.ctx.currentTime, 0.01);

      if (d.engine === 'youtube' && d.ytPlayer) {
        const combinedVol = Math.round(this._getDeckEffectiveVolume(deckId) * 100);
        d.ytPlayer.setVolume(Math.min(100, Math.max(0, combinedVol)));
      }
    }

    /**
     * Crossfader: 0.0 = Deck A, 0.5 = Center, 1.0 = Deck B
     */
    setCrossfader(x, immediate = false) {
      this.crossfade = Math.min(1, Math.max(0, x));
      const gA = Math.cos(this.crossfade * Math.PI / 2);
      const gB = Math.cos((1 - this.crossfade) * Math.PI / 2);
      const t = this.ctx.currentTime;
      const tc = immediate ? 0.001 : 0.015;

      this.decks.A.gainCross.gain.setTargetAtTime(gA, t, tc);
      this.decks.B.gainCross.gain.setTargetAtTime(gB, t, tc);

      // Adjust YouTube player volumes if either deck is running YouTube
      ['A', 'B'].forEach((id) => {
        const d = this.decks[id];
        if (d.engine === 'youtube' && d.ytPlayer && typeof d.ytPlayer.setVolume === 'function') {
          const combinedVol = Math.round(this._getDeckEffectiveVolume(id) * 100);
          d.ytPlayer.setVolume(Math.min(100, Math.max(0, combinedVol)));
        }
      });
    }

    // ---- Hot cues ----
    setHotCue(deckId, i) {
      const d = this.decks[deckId];
      if (i < 0 || i >= HOT_CUE_COUNT || !d.meta) return;
      const cur = this.getCurrentTime(deckId);
      d.cues[i] = cur;
      this._saveCues(d.meta.url || d.meta.guid || d.meta.title, d.cues);
      this._emit('cues', { deck: deckId, cues: d.cues.slice() });
    }

    triggerHotCue(deckId, i) {
      const d = this.decks[deckId];
      const target = d.cues[i];
      if (typeof target === 'number' && isFinite(target)) {
        this.seek(deckId, target);
      }
    }

    clearHotCue(deckId, i) {
      const d = this.decks[deckId];
      if (!d.meta) return;
      d.cues[i] = null;
      this._saveCues(d.meta.url || d.meta.guid || d.meta.title, d.cues);
      this._emit('cues', { deck: deckId, cues: d.cues.slice() });
    }

    getCurrentTime(deckId) {
      const d = this.decks[deckId];
      if (d.engine === 'youtube' && d.ytPlayer && typeof d.ytPlayer.getCurrentTime === 'function') {
        return d.ytPlayer.getCurrentTime() || 0;
      }
      return d.audio.currentTime || 0;
    }

    getDuration(deckId) {
      const d = this.decks[deckId];
      if (d.engine === 'youtube' && d.ytPlayer && typeof d.ytPlayer.getDuration === 'function') {
        return d.ytPlayer.getDuration() || (d.meta?.duration || 0);
      }
      return d.audio.duration || (d.meta?.duration || 0);
    }

    _loadCues(key) {
      try {
        const all = JSON.parse(store.get(CUE_STORE) || '{}');
        return Array.isArray(all[key]) ? all[key] : [null, null, null, null];
      } catch (_) { return [null, null, null, null]; }
    }

    _saveCues(key, cues) {
      try {
        const all = JSON.parse(store.get(CUE_STORE) || '{}');
        all[key] = cues;
        const keys = Object.keys(all);
        if (keys.length > 300) delete all[keys[0]];
        store.set(CUE_STORE, JSON.stringify(all));
      } catch (_) {}
    }

    _setMediaSession(d) {
      if (!('mediaSession' in navigator)) return;
      try {
        const origin = window.location.origin;
        const art = d.meta.artwork;
        const fallback192 = new URL('/icon-192.png', origin).href;
        const fallback512 = new URL('/icon-512.png', origin).href;
        const resolvedArt = art ? new URL(art, origin).href : fallback512;

        const artworkList = [
          { src: fallback192, sizes: '96x96', type: 'image/png' },
          { src: fallback192, sizes: '128x128', type: 'image/png' },
          { src: fallback192, sizes: '192x192', type: 'image/png' },
          { src: resolvedArt, sizes: '256x256' },
          { src: resolvedArt, sizes: '384x384' },
          { src: resolvedArt, sizes: '512x512' },
          { src: fallback512, sizes: '512x512', type: 'image/png' }
        ];

        navigator.mediaSession.metadata = new MediaMetadata({
          title: d.meta.title || 'Anypod DJ',
          artist: d.meta.podcastTitle || 'Traktor Pro DJ',
          album: 'Anypod DJ Mixer',
          artwork: artworkList
        });

        navigator.mediaSession.playbackState = 'playing';
      } catch (_) {}
    }

    _startMeteringLoop() {
      const dataA = new Uint8Array(32);
      const dataB = new Uint8Array(32);
      const dataM = new Uint8Array(32);

      const tick = () => {
        // 1. YouTube periodic timeupdate fallback
        DECKS.forEach((id) => {
          const d = this.decks[id];
          if (d.engine === 'youtube' && this.isPlaying(id)) {
            const cur = this.getCurrentTime(id);
            const dur = this.getDuration(id);
            this._emit('time', { deck: id, currentTime: cur, duration: dur });
          }
        });

        // 2. VU Meter Levels
        let lvlA = 0;
        let lvlB = 0;
        let lvlM = 0;

        if (this.decks.A.engine === 'audio') {
          this.decks.A.analyser.getByteFrequencyData(dataA);
          lvlA = dataA.reduce((sum, v) => sum + v, 0) / (dataA.length * 255);
        } else if (this.isPlaying('A')) {
          lvlA = this._getDeckEffectiveVolume('A') * (0.6 + Math.random() * 0.35);
        }

        if (this.decks.B.engine === 'audio') {
          this.decks.B.analyser.getByteFrequencyData(dataB);
          lvlB = dataB.reduce((sum, v) => sum + v, 0) / (dataB.length * 255);
        } else if (this.isPlaying('B')) {
          lvlB = this._getDeckEffectiveVolume('B') * (0.6 + Math.random() * 0.35);
        }

        this.masterAnalyser.getByteFrequencyData(dataM);
        lvlM = Math.max(lvlA, lvlB);

        this._emit('levels', { A: lvlA, B: lvlB, master: lvlM });

        requestAnimationFrame(tick);
      };

      requestAnimationFrame(tick);
    }
  }

  global.DJMixer = DJMixer;
})(window);
