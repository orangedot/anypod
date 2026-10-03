/**
 * Anypod DJ engine: two decks -> 3-band EQ -> deck gain (equal-power crossfade)
 * -> master compressor -> destination.
 * Standalone: does not touch the main app's audio pipeline.
 */
(function (global) {
  'use strict';

  const DECKS = ['A', 'B'];
  const EQ_BANDS = { low: 0, mid: 1, high: 2 };
  const HOT_CUE_COUNT = 3;
  const CUE_STORE = 'anypod_dj_cues';

  // localStorage may be blocked; fall back to memory.
  const memStore = {};
  const store = {
    get(k) {
      try { return localStorage.getItem(k); } catch (_) { return memStore[k] || null; }
    },
    set(k, v) {
      try { localStorage.setItem(k, v); } catch (_) { memStore[k] = v; }
    }
  };

  class DJMixer {
    constructor() {
      const Ctx = global.AudioContext || global.webkitAudioContext;
      this.ctx = new Ctx({ latencyHint: 'playback' });
      this.listeners = {};
      this.crossfade = 0.5;

      // Master: compressor evens out loud music vs. quiet podcasts.
      this.master = this.ctx.createDynamicsCompressor();
      this.master.threshold.value = -18;
      this.master.knee.value = 20;
      this.master.ratio.value = 4;
      this.master.attack.value = 0.005;
      this.master.release.value = 0.25;
      this.master.connect(this.ctx.destination);

      this.decks = {};
      DECKS.forEach((id) => this._buildDeck(id));
      this.setCrossfader(0.5, true);

      const resume = () => {
        if (this.ctx.state !== 'running') this.ctx.resume().catch(() => {});
      };
      document.addEventListener('visibilitychange', resume);
      this.ctx.addEventListener('statechange', () => {
        this._emit('context', this.ctx.state);
        // Re-resume if the OS suspended us while something is playing.
        if (this.ctx.state !== 'running' && DECKS.some((d) => !this.decks[d].audio.paused)) resume();
      });
      this._resume = resume;
    }

    _buildDeck(id) {
      const audio = new Audio();
      audio.crossOrigin = 'anonymous';
      audio.preload = 'auto';
      audio.preservesPitch = true;
      audio.setAttribute('playsinline', '');

      const src = this.ctx.createMediaElementSource(audio);
      const low = this.ctx.createBiquadFilter();
      const mid = this.ctx.createBiquadFilter();
      const high = this.ctx.createBiquadFilter();
      low.type = 'lowshelf';  low.frequency.value = 320;
      mid.type = 'peaking';   mid.frequency.value = 1000; mid.Q.value = 0.7;
      high.type = 'highshelf'; high.frequency.value = 3200;
      const gain = this.ctx.createGain();

      src.connect(low); low.connect(mid); mid.connect(high); high.connect(gain);
      gain.connect(this.master);

      const deck = { id, audio, src, eq: [low, mid, high], gain, meta: null, cues: [] };
      audio.addEventListener('timeupdate', () => this._emit('time', { deck: id, currentTime: audio.currentTime, duration: audio.duration || 0 }));
      audio.addEventListener('play', () => this._emit('state', { deck: id, playing: true }));
      audio.addEventListener('pause', () => this._emit('state', { deck: id, playing: false }));
      audio.addEventListener('ended', () => this._emit('state', { deck: id, playing: false, ended: true }));
      audio.addEventListener('loadedmetadata', () => this._emit('loaded', { deck: id, duration: audio.duration }));
      audio.addEventListener('error', () => this._emit('error', { deck: id }));
      this.decks[id] = deck;
    }

    on(evt, fn) { (this.listeners[evt] = this.listeners[evt] || []).push(fn); }
    _emit(evt, data) { (this.listeners[evt] || []).forEach((fn) => fn(data)); }

    /** Cross-origin audio needs CORS for Web Audio; route through the proxy. */
    _resolveUrl(url) {
      try {
        const u = new URL(url, location.href);
        if (u.origin === location.origin || u.protocol === 'blob:') return u.href;
        return '/api/audio-proxy?url=' + encodeURIComponent(u.href);
      } catch (_) { return url; }
    }

    loadTrack(deck, url, meta = {}) {
      const d = this.decks[deck];
      d.audio.pause();
      d.meta = Object.assign({ title: 'Untitled', url }, meta);
      d.audio.src = this._resolveUrl(url);
      d.audio.load();
      d.cues = this._loadCues(url);
      this._setMediaSession(d);
      this._emit('track', { deck, meta: d.meta, cues: d.cues.slice() });
    }

    async play(deck) {
      await this._resume();
      return this.decks[deck].audio.play().catch(() => {});
    }
    pause(deck) { this.decks[deck].audio.pause(); }
    toggle(deck) {
      return this.decks[deck].audio.paused ? this.play(deck) : this.pause(deck);
    }

    seek(deck, seconds) {
      const a = this.decks[deck].audio;
      if (isFinite(seconds)) a.currentTime = Math.max(0, seconds);
    }

    /** rate: 0.5-1.5. keepPitch=false gives vinyl-style pitch shift. */
    setPlaybackRate(deck, rate, keepPitch = true) {
      const a = this.decks[deck].audio;
      a.preservesPitch = keepPitch;
      a.playbackRate = Math.min(2, Math.max(0.25, rate));
    }

    /** band: 'low'|'mid'|'high', dB -24..+12 (kill at minimum). */
    setEQ(deck, band, dB) {
      const node = this.decks[deck].eq[EQ_BANDS[band]];
      if (!node) return;
      node.gain.setTargetAtTime(Math.max(-24, Math.min(12, dB)), this.ctx.currentTime, 0.015);
    }

    /** x: 0 = full A, 1 = full B. Equal-power curve keeps loudness constant. */
    setCrossfader(x, immediate) {
      this.crossfade = Math.min(1, Math.max(0, x));
      const gA = Math.cos(this.crossfade * Math.PI / 2);
      const gB = Math.cos((1 - this.crossfade) * Math.PI / 2);
      const t = this.ctx.currentTime;
      const tc = immediate ? 0.001 : 0.01;
      this.decks.A.gain.gain.setTargetAtTime(gA, t, tc);
      this.decks.B.gain.gain.setTargetAtTime(gB, t, tc);
    }

    // ---- Hot cues ----
    setHotCue(deck, i) {
      const d = this.decks[deck];
      if (i < 0 || i >= HOT_CUE_COUNT || !d.meta) return;
      d.cues[i] = d.audio.currentTime;
      this._saveCues(d.meta.url, d.cues);
      this._emit('cues', { deck, cues: d.cues.slice() });
    }

    triggerHotCue(deck, i) {
      const d = this.decks[deck];
      const t = d.cues[i];
      if (typeof t === 'number' && isFinite(t)) d.audio.currentTime = t;
    }

    clearHotCue(deck, i) {
      const d = this.decks[deck];
      if (!d.meta) return;
      d.cues[i] = null;
      this._saveCues(d.meta.url, d.cues);
      this._emit('cues', { deck, cues: d.cues.slice() });
    }

    _loadCues(url) {
      try {
        const all = JSON.parse(store.get(CUE_STORE) || '{}');
        return Array.isArray(all[url]) ? all[url] : [];
      } catch (_) { return []; }
    }
    _saveCues(url, cues) {
      try {
        const all = JSON.parse(store.get(CUE_STORE) || '{}');
        all[url] = cues;
        const keys = Object.keys(all);
        if (keys.length > 200) delete all[keys[0]];
        store.set(CUE_STORE, JSON.stringify(all));
      } catch (_) { /* ignore */ }
    }

    _setMediaSession(d) {
      if (!('mediaSession' in navigator)) return;
      try {
        navigator.mediaSession.metadata = new MediaMetadata({
          title: d.meta.title || 'Anypod DJ',
          artist: d.meta.artist || 'Anypod DJ',
          artwork: d.meta.artwork ? [{ src: d.meta.artwork }] : []
        });
        navigator.mediaSession.setActionHandler('play', () => this.play(d.id));
        navigator.mediaSession.setActionHandler('pause', () => this.pause(d.id));
      } catch (_) { /* ignore */ }
    }

    getState(deck) {
      const a = this.decks[deck].audio;
      return { playing: !a.paused, currentTime: a.currentTime, duration: a.duration || 0, meta: this.decks[deck].meta, cues: this.decks[deck].cues.slice() };
    }
  }

  global.DJMixer = DJMixer;
})(window);
