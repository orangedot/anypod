(function () {
  'use strict';

  const Shared = window.AnypodShared || {};

  // ───────────────────────────────────────────────────────────────────
  // 1. DATA PRESETS & TEMPLATES
  // ───────────────────────────────────────────────────────────────────
  const SAMPLE_BEATS = [
    {
      id: 'sample-909',
      title: '909 Deep Tech Beat',
      podcastTitle: 'Anypod DJ Tools',
      bpm: 128,
      sourceUrl: 'https://cdn.freesound.org/previews/381/381382_1676145-lq.mp3',
      startTimeSec: 0
    },
    {
      id: 'sample-funk',
      title: 'Funk Breakbeat & Bassline',
      podcastTitle: 'Anypod DJ Tools',
      bpm: 124,
      sourceUrl: 'https://cdn.freesound.org/previews/242/242857_4284968-lq.mp3',
      startTimeSec: 0
    },
    {
      id: 'sample-acid',
      title: 'Acid Resonance Bassline',
      podcastTitle: 'Anypod DJ Tools',
      bpm: 130,
      sourceUrl: 'https://cdn.freesound.org/previews/450/450621_649468-lq.mp3',
      startTimeSec: 0
    },
    {
      id: 'sample-vocal',
      title: 'Hypnotic Vocal FX Stems',
      podcastTitle: 'Anypod DJ Tools',
      bpm: 126,
      sourceUrl: 'https://cdn.freesound.org/previews/173/173859_321967-lq.mp3',
      startTimeSec: 0
    }
  ];

  const TEMPLATES = {
    tabata: {
      id: 'tpl_tabata',
      title: 'Classic 4-Min Tabata',
      sections: [
        {
          id: 'sec_warm',
          name: 'Warmup',
          repeatCount: 1,
          blocks: [
            { id: 'b_w1', type: 'warmup', label: 'Light Jog & Arm Swings', durationSec: 30, cueOverlay: 'beeps' }
          ]
        },
        {
          id: 'sec_tabata',
          name: 'Tabata Work / Rest Cycle',
          repeatCount: 8,
          blocks: [
            {
              id: 'b_t_work',
              type: 'work',
              label: 'Sprint / Burpees (100%)',
              durationSec: 20,
              cueOverlay: 'beeps',
              audioSegment: SAMPLE_BEATS[0]
            },
            { id: 'b_t_rest', type: 'rest', label: 'Catch Breath & Shake Out', durationSec: 10, cueOverlay: 'beeps' }
          ]
        },
        {
          id: 'sec_cool',
          name: 'Cooldown',
          repeatCount: 1,
          blocks: [
            { id: 'b_c1', type: 'cooldown', label: 'Walk & Deep Breathing', durationSec: 30, cueOverlay: 'beeps' }
          ]
        }
      ]
    },
    circuit5x5: {
      id: 'tpl_circuit',
      title: '5x5 Functional Circuit',
      sections: [
        {
          id: 'sec_c_w',
          name: 'Dynamic Warmup',
          repeatCount: 1,
          blocks: [
            { id: 'b_cw1', type: 'warmup', label: 'Jumping Jacks & Joint Rotations', durationSec: 60, cueOverlay: 'beeps' }
          ]
        },
        {
          id: 'sec_c_main',
          name: 'Strength Circuit',
          repeatCount: 5,
          blocks: [
            { id: 'b_sq', type: 'work', label: 'Goblet Squats', durationSec: 45, cueOverlay: 'beeps' },
            { id: 'b_sq_r', type: 'rest', label: 'Transition', durationSec: 15, cueOverlay: 'beeps' },
            { id: 'b_pu', type: 'work', label: 'Push-Ups / Floor Press', durationSec: 45, cueOverlay: 'beeps' },
            { id: 'b_pu_r', type: 'rest', label: 'Transition', durationSec: 15, cueOverlay: 'beeps' },
            { id: 'b_kb', type: 'work', label: 'Kettlebell Swings', durationSec: 45, cueOverlay: 'beeps' },
            { id: 'b_kb_r', type: 'rest', label: 'Transition', durationSec: 15, cueOverlay: 'beeps' },
            { id: 'b_pl', type: 'work', label: 'Core Plank Hold', durationSec: 45, cueOverlay: 'beeps' },
            { id: 'b_pl_r', type: 'rest', label: 'Round Recovery', durationSec: 45, cueOverlay: 'beeps' }
          ]
        },
        {
          id: 'sec_c_cool',
          name: 'Cooldown',
          repeatCount: 1,
          blocks: [
            { id: 'b_cc1', type: 'cooldown', label: 'Hamstring & Spine Stretch', durationSec: 60, cueOverlay: 'beeps' }
          ]
        }
      ]
    },
    hiit1min: {
      id: 'tpl_hiit',
      title: '1-Minute HIIT Sprints',
      sections: [
        {
          id: 'sec_h_w',
          name: 'Warmup Jog',
          repeatCount: 1,
          blocks: [
            { id: 'b_hw', type: 'warmup', label: 'Zone 2 Jog', durationSec: 90, cueOverlay: 'beeps' }
          ]
        },
        {
          id: 'sec_h_sprints',
          name: 'Sprint / Float Blocks',
          repeatCount: 8,
          blocks: [
            {
              id: 'b_hs',
              type: 'work',
              label: 'All-Out Sprint',
              durationSec: 60,
              cueOverlay: 'beeps',
              audioSegment: SAMPLE_BEATS[1]
            },
            { id: 'b_hr', type: 'rest', label: 'Active Walk Recovery', durationSec: 60, cueOverlay: 'beeps' }
          ]
        },
        {
          id: 'sec_h_cool',
          name: 'Cooldown',
          repeatCount: 1,
          blocks: [
            { id: 'b_hc', type: 'cooldown', label: 'Normalizing Walk', durationSec: 90, cueOverlay: 'beeps' }
          ]
        }
      ]
    }
  };

  // ───────────────────────────────────────────────────────────────────
  // 2. TIMELINE COMPILER & MATH (DELEGATES TO AnypodShared)
  // ───────────────────────────────────────────────────────────────────
  function compileRoutine(routine) {
    if (!routine || !Array.isArray(routine.sections)) return [];
    const timeline = [];
    let offset = 0;

    routine.sections.forEach((section, sIdx) => {
      const repeats = Math.max(1, Math.floor(section.repeatCount || 1));
      const blocks = Array.isArray(section.blocks) ? section.blocks : [];

      for (let iter = 1; iter <= repeats; iter++) {
        blocks.forEach((block, bIdx) => {
          const dur = Math.max(1, Math.round(block.durationSec || 0));
          timeline.push({
            id: `${section.id}_s${sIdx}_r${iter}_b${bIdx}`,
            sectionIndex: sIdx,
            sectionName: section.name,
            iteration: iter,
            totalIterations: repeats,
            block: Object.assign({}, block, { durationSec: dur }),
            startOffsetSec: offset,
            endOffsetSec: offset + dur
          });
          offset += dur;
        });
      }
    });
    return timeline;
  }

  function formatTime(s) {
    if (Shared.formatTime) return Shared.formatTime(s, true);
    if (!s || isNaN(s) || s < 0) return '00:00';
    const sec = Math.floor(s);
    const m = Math.floor(sec / 60);
    const remSec = sec % 60;
    return (m < 10 ? '0' : '') + m + ':' + (remSec < 10 ? '0' : '') + remSec;
  }

  function escapeHtml(str) {
    if (Shared.escapeHtml) return Shared.escapeHtml(str);
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // ───────────────────────────────────────────────────────────────────
  // 3. NATIVE WEB AUDIO ENGINE (DUAL DECK + SYNTHESIZED CUES)
  // ───────────────────────────────────────────────────────────────────
  class WorkoutAudioEngine {
    constructor() {
      this.ctx = null;
      this.masterGain = null;
      this.cueGain = null;
      this.activeDeck = 'A';
      this.crossfadeVal = 0;
      this.beepsEnabled = true;
      this.voiceEnabled = true;
      this.masterVolume = 0.9;
      this.broadcastChannel = null;

      const makeAudio = () => {
        const a = new Audio();
        a.crossOrigin = 'anonymous';
        a.preload = 'auto';
        a.setAttribute('playsinline', '');
        return a;
      };

      this.decks = {
        A: { audio: makeAudio(), source: null, gain: null, segment: null, isPrebuffered: false },
        B: { audio: makeAudio(), source: null, gain: null, segment: null, isPrebuffered: false }
      };

      try {
        if ('BroadcastChannel' in window) {
          this.broadcastChannel = new BroadcastChannel('anypod_workout_sync');
        }
      } catch (_) {}
    }

    async ensureContext() {
      if (!this.ctx) {
        const Ctx = window.AudioContext || window.webkitAudioContext;
        this.ctx = new Ctx({ latencyHint: 'playback' });

        this.masterGain = this.ctx.createGain();
        this.masterGain.gain.setValueAtTime(this.masterVolume, this.ctx.currentTime);
        this.masterGain.connect(this.ctx.destination);

        this.cueGain = this.ctx.createGain();
        this.cueGain.gain.setValueAtTime(0.9, this.ctx.currentTime);
        this.cueGain.connect(this.ctx.destination);

        ['A', 'B'].forEach((id) => {
          const d = this.decks[id];
          try {
            d.source = this.ctx.createMediaElementSource(d.audio);
            d.gain = this.ctx.createGain();
            d.source.connect(d.gain);
            d.gain.connect(this.masterGain);
          } catch (err) {
            console.warn('[AudioEngine] MediaElementSource init:', err);
          }
        });

        this.setCrossfade(0, true);
      }

      if (this.ctx.state === 'suspended') {
        await this.ctx.resume().catch(() => {});
      }
      return this.ctx;
    }

    resolveUrl(url) {
      if (!url) return '';
      try {
        const u = new URL(url, location.href);
        if (u.origin === location.origin || u.protocol === 'blob:' || u.protocol === 'data:') {
          return u.href;
        }
        return '/api/audio-proxy?url=' + encodeURIComponent(u.href);
      } catch (_) {
        return url;
      }
    }

    setCrossfade(x, immediate = false) {
      this.crossfadeVal = Math.max(0, Math.min(1, x));
      if (!this.ctx) return;
      const gA = Math.cos(this.crossfadeVal * Math.PI / 2);
      const gB = Math.sin(this.crossfadeVal * Math.PI / 2);
      const t = this.ctx.currentTime;
      const tc = immediate ? 0.005 : 0.05;
      if (this.decks.A.gain) this.decks.A.gain.gain.setTargetAtTime(gA, t, tc);
      if (this.decks.B.gain) this.decks.B.gain.gain.setTargetAtTime(gB, t, tc);
    }

    async playBlock(block, crossfade = true) {
      await this.ensureContext();
      const seg = block.audioSegment;

      if (Shared.notifyWorkoutActive) {
        Shared.notifyWorkoutActive(block.label);
      } else {
        try {
          this.broadcastChannel?.postMessage({ type: 'WORKOUT_ACTIVE', label: block.label });
        } catch (_) {}
      }

      if (!seg || !seg.sourceUrl) {
        this.fadeDecksOut(crossfade ? 1.5 : 0.1);
        return;
      }

      const targetDeckId = this.activeDeck === 'A' ? 'B' : 'A';
      const oldDeckId = this.activeDeck;
      const targetDeck = this.decks[targetDeckId];
      const oldDeck = this.decks[oldDeckId];

      const streamUrl = this.resolveUrl(seg.sourceUrl);

      if (!targetDeck.isPrebuffered || targetDeck.audio.src !== streamUrl) {
        targetDeck.audio.src = streamUrl;
        targetDeck.audio.currentTime = seg.startTimeSec || 0;
        targetDeck.audio.load();
      } else if (seg.startTimeSec && Math.abs(targetDeck.audio.currentTime - seg.startTimeSec) > 1.5) {
        targetDeck.audio.currentTime = seg.startTimeSec;
      }

      targetDeck.segment = seg;
      targetDeck.isPrebuffered = false;

      // Fallback if proxy fails (404/502)
      const onProxyErr = () => {
        targetDeck.audio.removeEventListener('error', onProxyErr);
        if (targetDeck.audio.src.includes('/api/audio-proxy') && seg.sourceUrl) {
          console.warn('[sets-audio] Proxy error, falling back to direct stream:', seg.sourceUrl);
          targetDeck.audio.src = seg.sourceUrl;
          targetDeck.audio.load();
        }
      };
      targetDeck.audio.addEventListener('error', onProxyErr, { once: true });

      // Offline Cache API support via AnypodShared
      if (seg.sourceUrl) {
        if (Shared.matchOfflineAudioCache) {
          Shared.matchOfflineAudioCache(seg.sourceUrl).then((blobUrl) => {
            if (blobUrl) {
              targetDeck.audio.src = blobUrl;
              targetDeck.audio.load();
            }
          }).catch(() => {});
        } else if ('caches' in window) {
          caches.open('anypod-audio-v1').then(async (c) => {
            const match = await c.match(seg.sourceUrl);
            if (match) {
              const b = await match.blob();
              targetDeck.audio.src = URL.createObjectURL(b);
              targetDeck.audio.load();
            }
          }).catch(() => {});
        }
      }

      try {
        await targetDeck.audio.play();
      } catch (err) {
        console.warn('[AudioEngine] Play failed:', err);
      }

      if (crossfade && this.ctx) {
        const t = this.ctx.currentTime;
        const dur = 2.0;

        if (targetDeckId === 'B') {
          this.decks.A.gain?.gain.setValueAtTime(1, t);
          this.decks.A.gain?.gain.linearRampToValueAtTime(0, t + dur);
          this.decks.B.gain?.gain.setValueAtTime(0, t);
          this.decks.B.gain?.gain.linearRampToValueAtTime(1, t + dur);
        } else {
          this.decks.B.gain?.gain.setValueAtTime(1, t);
          this.decks.B.gain?.gain.linearRampToValueAtTime(0, t + dur);
          this.decks.A.gain?.gain.setValueAtTime(0, t);
          this.decks.A.gain?.gain.linearRampToValueAtTime(1, t + dur);
        }

        this.activeDeck = targetDeckId;
        setTimeout(() => {
          if (this.activeDeck === targetDeckId) oldDeck.audio.pause();
        }, dur * 1000 + 100);
      } else {
        this.activeDeck = targetDeckId;
        this.setCrossfade(targetDeckId === 'A' ? 0 : 1, true);
        oldDeck.audio.pause();
      }
    }

    prebuffer(segment) {
      if (!segment || !segment.sourceUrl) return;
      const nextId = this.activeDeck === 'A' ? 'B' : 'A';
      const d = this.decks[nextId];
      const url = this.resolveUrl(segment.sourceUrl);
      if (d.audio.src !== url || !d.isPrebuffered) {
        d.audio.src = url;
        d.audio.currentTime = segment.startTimeSec || 0;
        d.audio.load();
        d.segment = segment;
        d.isPrebuffered = true;
      }
    }

    pause() {
      this.decks.A.audio.pause();
      this.decks.B.audio.pause();
      try {
        this.broadcastChannel?.postMessage({ type: 'WORKOUT_PAUSED' });
      } catch (_) {}
    }

    resume() {
      const active = this.decks[this.activeDeck];
      if (active.segment) active.audio.play().catch(() => {});
      if (Shared.notifyWorkoutActive) {
        Shared.notifyWorkoutActive();
      } else {
        try {
          this.broadcastChannel?.postMessage({ type: 'WORKOUT_ACTIVE' });
        } catch (_) {}
      }
    }

    stop() {
      this.pause();
      this.decks.A.audio.currentTime = 0;
      this.decks.B.audio.currentTime = 0;
      try {
        this.broadcastChannel?.postMessage({ type: 'WORKOUT_STOPPED' });
      } catch (_) {}
    }

    fadeDecksOut(duration = 1.0) {
      if (!this.ctx) return;
      const t = this.ctx.currentTime;
      this.decks.A.gain?.gain.linearRampToValueAtTime(0.0001, t + duration);
      this.decks.B.gain?.gain.linearRampToValueAtTime(0.0001, t + duration);
      setTimeout(() => {
        this.decks.A.audio.pause();
        this.decks.B.audio.pause();
      }, duration * 1000 + 50);
    }

    playBeep(freq = 440, dur = 0.15, isGo = false) {
      if (!this.beepsEnabled) return;
      this.ensureContext().then(() => {
        if (!this.ctx || !this.cueGain) return;
        const osc = this.ctx.createOscillator();
        const g = this.ctx.createGain();

        osc.type = isGo ? 'triangle' : 'sine';
        osc.frequency.setValueAtTime(freq, this.ctx.currentTime);

        const now = this.ctx.currentTime;
        const vol = isGo ? 0.95 : 0.75;

        g.gain.setValueAtTime(0.001, now);
        g.gain.linearRampToValueAtTime(vol, now + 0.015);
        g.gain.exponentialRampToValueAtTime(0.0001, now + dur);

        osc.connect(g);
        g.connect(this.cueGain);

        this.duckMusic(dur + 0.08);

        osc.start(now);
        osc.stop(now + dur);
        osc.onended = () => { osc.disconnect(); g.disconnect(); };
      });
    }

    triggerTick(secRem) {
      if (secRem === 3 || secRem === 2 || secRem === 1) {
        this.playBeep(440, 0.13, false);
      } else if (secRem === 0) {
        this.playBeep(880, 0.35, true);
      }
    }

    duckMusic(durSec = 0.25) {
      if (!this.ctx || !this.masterGain) return;
      const now = this.ctx.currentTime;
      const orig = this.masterVolume;
      const ducked = orig * 0.3;
      this.masterGain.gain.setValueAtTime(orig, now);
      this.masterGain.gain.linearRampToValueAtTime(ducked, now + 0.02);
      this.masterGain.gain.setValueAtTime(ducked, now + durSec);
      this.masterGain.gain.linearRampToValueAtTime(orig, now + durSec + 0.15);
    }

    speak(text) {
      if (!this.voiceEnabled || !('speechSynthesis' in window)) return;
      try {
        window.speechSynthesis.cancel();
        const u = new SpeechSynthesisUtterance(text);
        u.rate = 1.15;
        u.volume = 0.95;
        window.speechSynthesis.speak(u);
      } catch (_) {}
    }
  }

  const audioEngine = new WorkoutAudioEngine();

  // ───────────────────────────────────────────────────────────────────
  // 4. APPLICATION STATE & CONTROLLER
  // ───────────────────────────────────────────────────────────────────
  let routine = (() => {
    try {
      if (location.hash && location.hash.includes('routine=')) {
        const b64 = location.hash.split('routine=')[1].split('&')[0];
        const parsed = JSON.parse(decodeURIComponent(atob(b64)));
        if (parsed && parsed.sections) return parsed;
      }
    } catch (_) {}

    try {
      const saved = localStorage.getItem('anypod_active_routine');
      if (saved) return JSON.parse(saved);
    } catch (_) {}

    return TEMPLATES.tabata;
  })();

  let timeline = compileRoutine(routine);
  let totalSec = timeline.length ? timeline[timeline.length - 1].endOffsetSec : 0;

  let view = 'player'; // 'player' | 'builder'
  let state = 'idle';  // 'idle' | 'running' | 'paused' | 'completed'
  let currentIdx = 0;
  let elapsedSec = 0;

  let beepsOn = true;
  let voiceOn = true;
  let wakeLockSentinel = null;

  let activeTargetBlock = null;
  let rafId = null;
  let lastTimestamp = 0;
  let lastBeepSec = -1;
  let prebufferedIdx = -1;

  // ───────────────────────────────────────────────────────────────────
  // 5. DOM ELEMENTS CACHE
  // ───────────────────────────────────────────────────────────────────
  const el = {
    viewPlayer: document.getElementById('view-player'),
    viewBuilder: document.getElementById('view-builder'),
    btnToggleView: document.getElementById('btn-toggle-view'),
    viewToggleText: document.getElementById('view-toggle-text'),
    wakeBadge: document.getElementById('wake-badge'),

    btnToggleBeeps: document.getElementById('btn-toggle-beeps'),
    btnToggleVoice: document.getElementById('btn-toggle-voice'),
    btnOpenShare: document.getElementById('btn-open-share'),

    badgeType: document.getElementById('badge-interval-type'),
    labelRound: document.getElementById('label-round-progress'),
    labelTotalTime: document.getElementById('label-total-time'),
    labelIntervalName: document.getElementById('label-interval-name'),
    displayCountdown: document.getElementById('display-giant-countdown'),

    intervalProgressFill: document.getElementById('interval-progress-fill'),
    labelSectionName: document.getElementById('label-section-name'),
    labelIntervalPct: document.getElementById('label-interval-pct'),

    audioPill: document.getElementById('audio-cue-pill'),
    audioTitle: document.getElementById('audio-cue-title'),
    audioBpm: document.getElementById('audio-cue-bpm'),
    audioDjLink: document.getElementById('audio-dj-link'),

    upNextRow: document.getElementById('up-next-row'),
    upNextLabel: document.getElementById('up-next-label'),
    upNextDuration: document.getElementById('up-next-duration'),

    btnReset: document.getElementById('btn-reset'),
    btnSkipPrev: document.getElementById('btn-skip-prev'),
    btnPlayPause: document.getElementById('btn-play-pause'),
    iconPlay: document.getElementById('icon-play'),
    iconPause: document.getElementById('icon-pause'),
    btnSkipNext: document.getElementById('btn-skip-next'),

    labelOverallElapsed: document.getElementById('label-overall-elapsed'),
    labelOverallTotal: document.getElementById('label-overall-total'),
    overallProgressFill: document.getElementById('overall-progress-fill'),

    inputRoutineTitle: document.getElementById('input-routine-title'),
    builderSectionsList: document.getElementById('builder-sections-list'),
    btnAddSection: document.getElementById('btn-add-section'),

    modalAudio: document.getElementById('modal-audio'),
    btnCloseAudioModal: document.getElementById('btn-close-audio-modal'),
    sampleBeatsList: document.getElementById('modal-sample-beats-list'),
    liveEpContainer: document.getElementById('modal-live-ep-container'),
    formDirectAudio: document.getElementById('form-direct-audio'),
    inputDirectUrl: document.getElementById('input-direct-url'),
    inputDirectTitle: document.getElementById('input-direct-title'),
    inputDirectStart: document.getElementById('input-direct-start'),

    modalShare: document.getElementById('modal-share'),
    btnCloseShareModal: document.getElementById('btn-close-share-modal'),
    inputShareUrl: document.getElementById('input-share-url'),
    btnCopyShare: document.getElementById('btn-copy-share'),
    btnDownloadJson: document.getElementById('btn-download-json')
  };

  // ───────────────────────────────────────────────────────────────────
  // 6. SCREEN WAKE LOCK API
  // ───────────────────────────────────────────────────────────────────
  async function requestWakeLock() {
    try {
      if ('wakeLock' in navigator && !wakeLockSentinel) {
        wakeLockSentinel = await navigator.wakeLock.request('screen');
        el.wakeBadge.style.display = 'flex';
        wakeLockSentinel.addEventListener('release', () => {
          wakeLockSentinel = null;
          el.wakeBadge.style.display = 'none';
        });
      }
    } catch (_) {}
  }

  function releaseWakeLock() {
    if (wakeLockSentinel) {
      wakeLockSentinel.release().catch(() => {});
      wakeLockSentinel = null;
      el.wakeBadge.style.display = 'none';
    }
  }

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && state === 'running') {
      requestWakeLock();
    }
  });

  // ───────────────────────────────────────────────────────────────────
  // 7. MEDIA SESSION API
  // ───────────────────────────────────────────────────────────────────
  function updateMediaSession() {
    if (!('mediaSession' in navigator)) return;
    const cur = timeline[currentIdx];
    const nxt = timeline[currentIdx + 1];

    if (cur) {
      const origin = window.location.origin;
      const art = cur.block.audioSegment?.artwork;
      let artworkList;
      if (Shared.buildMediaSessionArtwork) {
        artworkList = Shared.buildMediaSessionArtwork(art ? new URL(art, origin).href : '', origin);
      } else {
        const fallback192 = new URL('/icon-192.png', origin).href;
        const fallback512 = new URL('/icon-512.png', origin).href;
        const resolvedArt = art ? new URL(art, origin).href : fallback512;
        const isFallback = !art || resolvedArt === fallback512;
        artworkList = !isFallback ? [
          { src: resolvedArt, sizes: '96x96' },
          { src: resolvedArt, sizes: '128x128' },
          { src: resolvedArt, sizes: '192x192' },
          { src: resolvedArt, sizes: '256x256' },
          { src: resolvedArt, sizes: '384x384' },
          { src: resolvedArt, sizes: '512x512' }
        ] : [
          { src: fallback192, sizes: '192x192', type: 'image/png' },
          { src: fallback512, sizes: '512x512', type: 'image/png' }
        ];
      }

      navigator.mediaSession.metadata = new MediaMetadata({
        title: `${cur.block.label} [${cur.iteration}/${cur.totalIterations}]`,
        artist: `Anypod Sets • ${cur.block.type.toUpperCase()}`,
        album: `${routine.title} (Next: ${nxt ? nxt.block.label : 'Done'})`,
        artwork: artworkList
      });
    }
    navigator.mediaSession.playbackState = state === 'running' ? 'playing' : 'paused';
  }

  try {
    if ('mediaSession' in navigator) {
      navigator.mediaSession.setActionHandler('play', () => play());
      navigator.mediaSession.setActionHandler('pause', () => pause());
      navigator.mediaSession.setActionHandler('nexttrack', () => skipNext());
      navigator.mediaSession.setActionHandler('previoustrack', () => skipPrev());
    }
  } catch (_) {}

  // ───────────────────────────────────────────────────────────────────
  // 8. RENDER PLAYER UI
  // ───────────────────────────────────────────────────────────────────
  function renderPlayer() {
    const cur = timeline[currentIdx];
    const nxt = timeline[currentIdx + 1];

    if (!cur) {
      el.displayCountdown.textContent = '00:00';
      return;
    }

    const bType = cur.block.type || 'work';

    // Update interval type badge & color classes
    el.badgeType.textContent = bType.toUpperCase();
    el.badgeType.className = `interval-type-badge badge-${bType}`;
    el.displayCountdown.className = `giant-digits digits-${bType}`;

    // Color theme styles
    const colorVar = `var(--${bType}-primary)`;
    el.intervalProgressFill.style.background = colorVar;
    el.intervalProgressFill.style.boxShadow = `0 0 14px ${colorVar}`;

    // Text labels
    el.labelRound.textContent = `Round ${cur.iteration} of ${cur.totalIterations}`;
    el.labelTotalTime.textContent = `Total: ${formatTime(elapsedSec)} / ${formatTime(totalSec)}`;
    el.labelIntervalName.textContent = cur.block.label;
    el.labelSectionName.textContent = cur.sectionName || 'Set';

    // Timing calculations
    const intervalDuration = cur.block.durationSec;
    const intervalElapsed = Math.max(0, Math.min(intervalDuration, elapsedSec - cur.startOffsetSec));
    const intervalRemaining = Math.max(0, intervalDuration - intervalElapsed);
    const intervalPct = intervalDuration > 0 ? (intervalElapsed / intervalDuration) * 100 : 0;
    const overallPct = totalSec > 0 ? (elapsedSec / totalSec) * 100 : 0;

    el.displayCountdown.textContent = formatTime(intervalRemaining);
    el.intervalProgressFill.style.width = `${Math.min(100, intervalPct)}%`;
    el.labelIntervalPct.textContent = `${Math.round(intervalPct)}%`;

    el.labelOverallElapsed.textContent = formatTime(elapsedSec);
    el.labelOverallTotal.textContent = formatTime(totalSec);
    el.overallProgressFill.style.width = `${Math.min(100, overallPct)}%`;

    // Audio Segment Pill
    if (cur.block.audioSegment) {
      el.audioPill.style.display = 'inline-flex';
      el.audioTitle.textContent = cur.block.audioSegment.title;
      if (cur.block.audioSegment.bpm) {
        el.audioBpm.style.display = 'inline-block';
        el.audioBpm.textContent = `${cur.block.audioSegment.bpm} BPM`;
      } else {
        el.audioBpm.style.display = 'none';
      }
      if (cur.block.audioSegment.sourceUrl) {
        el.audioDjLink.href = `/dj.html?url=${encodeURIComponent(cur.block.audioSegment.sourceUrl)}`;
        el.audioDjLink.style.display = 'inline-flex';
      } else {
        el.audioDjLink.style.display = 'none';
      }
    } else {
      el.audioPill.style.display = 'none';
    }

    // Up Next Preview
    if (nxt) {
      el.upNextRow.style.display = 'flex';
      el.upNextLabel.textContent = nxt.block.label;
      el.upNextDuration.textContent = `(${formatTime(nxt.block.durationSec)})`;
    } else {
      el.upNextRow.style.display = 'none';
    }

    // Play / Pause Button State
    if (state === 'running') {
      el.btnPlayPause.className = 'btn-gym-primary state-running';
      el.iconPlay.style.display = 'none';
      el.iconPause.style.display = 'block';
    } else {
      el.btnPlayPause.className = 'btn-gym-primary state-idle';
      el.iconPlay.style.display = 'block';
      el.iconPause.style.display = 'none';
    }
  }

  // ───────────────────────────────────────────────────────────────────
  // 9. WORKOUT LIFECYCLE CONTROLS
  // ───────────────────────────────────────────────────────────────────
  function switchInterval(newIdx, startSec) {
    if (newIdx >= timeline.length) {
      // Completed
      state = 'completed';
      releaseWakeLock();
      audioEngine.stop();
      if (voiceOn) audioEngine.speak('Workout complete! Awesome work!');
      renderPlayer();
      updateMediaSession();
      return;
    }

    const target = timeline[newIdx];
    currentIdx = newIdx;
    prebufferedIdx = -1;
    lastBeepSec = -1;
    elapsedSec = typeof startSec === 'number' ? startSec : target.startOffsetSec;

    audioEngine.playBlock(target.block, true);
    if (voiceOn && target.block.cueOverlay === 'voice') {
      audioEngine.speak(target.block.label);
    }

    renderPlayer();
    updateMediaSession();
  }

  async function play() {
    await audioEngine.ensureContext();
    await requestWakeLock();

    if (state === 'idle' || state === 'completed') {
      switchInterval(0, 0);
    } else {
      audioEngine.resume();
    }
    state = 'running';
    lastTimestamp = performance.now();
    renderPlayer();
    updateMediaSession();
  }

  function pause() {
    state = 'paused';
    releaseWakeLock();
    audioEngine.pause();
    renderPlayer();
    updateMediaSession();
  }

  function togglePlay() {
    if (state === 'running') pause();
    else play();
  }

  function reset() {
    pause();
    audioEngine.stop();
    state = 'idle';
    currentIdx = 0;
    elapsedSec = 0;
    prebufferedIdx = -1;
    lastBeepSec = -1;
    renderPlayer();
    updateMediaSession();
  }

  function skipNext() {
    if (currentIdx + 1 < timeline.length) {
      switchInterval(currentIdx + 1);
    } else {
      reset();
    }
  }

  function skipPrev() {
    const cur = timeline[currentIdx];
    const intervalElapsed = cur ? elapsedSec - cur.startOffsetSec : 0;
    if (intervalElapsed > 3) {
      if (cur) elapsedSec = cur.startOffsetSec;
      renderPlayer();
    } else if (currentIdx > 0) {
      switchInterval(currentIdx - 1);
    } else {
      reset();
    }
  }

  // ───────────────────────────────────────────────────────────────────
  // 10. DRIFT-PROOF TICK LOOP (performance.now)
  // ───────────────────────────────────────────────────────────────────
  function tickLoop(now) {
    if (state === 'running') {
      const delta = (now - lastTimestamp) / 1000;
      lastTimestamp = now;

      elapsedSec += delta;

      if (elapsedSec >= totalSec) {
        switchInterval(timeline.length);
      } else {
        const cur = timeline[currentIdx];
        if (cur && elapsedSec >= cur.endOffsetSec) {
          switchInterval(currentIdx + 1, cur.endOffsetSec);
        } else if (cur) {
          const rem = Math.ceil(cur.endOffsetSec - elapsedSec);

          // Countdown Beeps (3, 2, 1, 0)
          if (rem <= 3 && rem >= 0 && rem !== lastBeepSec) {
            lastBeepSec = rem;
            if (beepsOn && cur.block.cueOverlay === 'beeps') {
              audioEngine.triggerTick(rem);
            }
          }

          // Prebuffer upcoming interval 5s ahead
          const nxt = timeline[currentIdx + 1];
          if (rem <= 5 && nxt && prebufferedIdx !== currentIdx + 1) {
            prebufferedIdx = currentIdx + 1;
            audioEngine.prebuffer(nxt.block.audioSegment);
          }
        }
      }

      renderPlayer();
    } else {
      lastTimestamp = now;
    }

    rafId = requestAnimationFrame(tickLoop);
  }
  rafId = requestAnimationFrame(tickLoop);

  // ───────────────────────────────────────────────────────────────────
  // 11. ROUTINE BUILDER RENDERING & INTERACTION
  // ───────────────────────────────────────────────────────────────────
  function saveRoutine() {
    timeline = compileRoutine(routine);
    totalSec = timeline.length ? timeline[timeline.length - 1].endOffsetSec : 0;
    try {
      localStorage.setItem('anypod_active_routine', JSON.stringify(routine));
    } catch (_) {}
  }

  function renderBuilder() {
    el.inputRoutineTitle.value = routine.title;
    el.builderSectionsList.innerHTML = '';

    routine.sections.forEach((section, sIdx) => {
      const card = document.createElement('div');
      card.className = 'section-card';

      const repeatOpts = [1, 2, 3, 4, 5, 6, 8, 10, 12, 16, 20]
        .map(n => `<option value="${n}" ${section.repeatCount === n ? 'selected' : ''}>${n}x</option>`)
        .join('');

      card.innerHTML = `
        <div class="section-card-header">
          <input type="text" class="input-section-title" value="${escapeHtml(section.name)}" data-sidx="${sIdx}" placeholder="Section Name">
          <div class="repeat-selector">
            <span>Repeat:</span>
            <select class="repeat-select" data-sidx="${sIdx}">
              ${repeatOpts}
            </select>
          </div>
          ${routine.sections.length > 1 ? `
            <button type="button" class="btn-delete-section" data-sidx="${sIdx}" title="Delete Section">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18"></path><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path></svg>
            </button>
          ` : ''}
        </div>
        <div class="section-blocks-container" id="sblocks-${sIdx}"></div>
        <button type="button" class="btn-add-block" data-sidx="${sIdx}">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
          <span>Add Block</span>
        </button>
      `;

      const blocksCont = card.querySelector(`#sblocks-${sIdx}`);
      section.blocks.forEach((block, bIdx) => {
        const bItem = document.createElement('div');
        bItem.className = `block-item type-${block.type}`;

        bItem.innerHTML = `
          <div class="block-main-row">
            <select class="select-block-type" data-sidx="${sIdx}" data-bidx="${bIdx}">
              <option value="work" ${block.type === 'work' ? 'selected' : ''}>Work</option>
              <option value="rest" ${block.type === 'rest' ? 'selected' : ''}>Rest</option>
              <option value="warmup" ${block.type === 'warmup' ? 'selected' : ''}>Warmup</option>
              <option value="cooldown" ${block.type === 'cooldown' ? 'selected' : ''}>Cooldown</option>
            </select>
            <input type="text" class="input-block-label" value="${escapeHtml(block.label)}" data-sidx="${sIdx}" data-bidx="${bIdx}" placeholder="Label">
            <div class="duration-input-wrap">
              <input type="number" class="input-duration" min="1" max="3600" value="${block.durationSec}" data-sidx="${sIdx}" data-bidx="${bIdx}">
              <span class="duration-unit">sec</span>
            </div>
            <button type="button" class="btn-delete-block" data-sidx="${sIdx}" data-bidx="${bIdx}" title="Remove Block">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
            </button>
          </div>
          <div class="block-audio-row">
            <button type="button" class="btn-attach-audio" data-sidx="${sIdx}" data-bidx="${bIdx}">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="color: #ef4444;"><circle cx="12" cy="12" r="10"></circle><circle cx="12" cy="12" r="3"></circle></svg>
              <span>${block.audioSegment ? escapeHtml(block.audioSegment.title) : '+ Attach Audio / DJ Beat'}</span>
            </button>
            ${block.audioSegment ? `
              <button type="button" class="btn-clear-audio" data-sidx="${sIdx}" data-bidx="${bIdx}">Clear</button>
            ` : ''}
          </div>
        `;
        blocksCont.appendChild(bItem);
      });

      el.builderSectionsList.appendChild(card);
    });
  }

  // ───────────────────────────────────────────────────────────────────
  // 12. EVENT LISTENERS
  // ───────────────────────────────────────────────────────────────────

  // Play / Pause / Reset / Skips
  el.btnPlayPause.addEventListener('click', togglePlay);
  el.btnReset.addEventListener('click', reset);
  el.btnSkipNext.addEventListener('click', skipNext);
  el.btnSkipPrev.addEventListener('click', skipPrev);

  // Sound Toggles
  el.btnToggleBeeps.addEventListener('click', () => {
    beepsOn = !beepsOn;
    audioEngine.beepsEnabled = beepsOn;
    el.btnToggleBeeps.classList.toggle('active', beepsOn);
  });

  el.btnToggleVoice.addEventListener('click', () => {
    voiceOn = !voiceOn;
    audioEngine.voiceEnabled = voiceOn;
    el.btnToggleVoice.classList.toggle('active', voiceOn);
  });

  // View Switcher (Workout vs Builder)
  el.btnToggleView.addEventListener('click', () => {
    if (view === 'player') {
      view = 'builder';
      el.viewPlayer.style.display = 'none';
      el.viewBuilder.style.display = 'flex';
      el.btnToggleView.classList.add('active');
      el.viewToggleText.textContent = 'Workout';
      renderBuilder();
    } else {
      view = 'player';
      el.viewPlayer.style.display = 'flex';
      el.viewBuilder.style.display = 'none';
      el.btnToggleView.classList.remove('active');
      el.viewToggleText.textContent = 'Edit Routine';
      saveRoutine();
      renderPlayer();
    }
  });

  // Preset Pickers
  document.querySelectorAll('.preset-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const key = btn.dataset.preset;
      if (TEMPLATES[key]) {
        routine = JSON.parse(JSON.stringify(TEMPLATES[key]));
        saveRoutine();
        reset();
        renderBuilder();
      }
    });
  });

  // Title Change
  el.inputRoutineTitle.addEventListener('input', (e) => {
    routine.title = e.target.value;
    saveRoutine();
  });

  // Builder Event Delegation
  el.builderSectionsList.addEventListener('input', (e) => {
    const sIdx = parseInt(e.target.dataset.sidx, 10);
    const bIdx = parseInt(e.target.dataset.bidx, 10);

    if (e.target.classList.contains('input-section-title')) {
      routine.sections[sIdx].name = e.target.value;
      saveRoutine();
    } else if (e.target.classList.contains('input-block-label')) {
      routine.sections[sIdx].blocks[bIdx].label = e.target.value;
      saveRoutine();
    } else if (e.target.classList.contains('input-duration')) {
      routine.sections[sIdx].blocks[bIdx].durationSec = Math.max(1, parseInt(e.target.value, 10) || 1);
      saveRoutine();
    }
  });

  el.builderSectionsList.addEventListener('change', (e) => {
    const sIdx = parseInt(e.target.dataset.sidx, 10);
    const bIdx = parseInt(e.target.dataset.bidx, 10);

    if (e.target.classList.contains('repeat-select')) {
      routine.sections[sIdx].repeatCount = parseInt(e.target.value, 10);
      saveRoutine();
    } else if (e.target.classList.contains('select-block-type')) {
      routine.sections[sIdx].blocks[bIdx].type = e.target.value;
      saveRoutine();
      renderBuilder();
    }
  });

  el.builderSectionsList.addEventListener('click', (e) => {
    const delSecBtn = e.target.closest('.btn-delete-section');
    if (delSecBtn) {
      const sIdx = parseInt(delSecBtn.dataset.sidx, 10);
      routine.sections.splice(sIdx, 1);
      saveRoutine();
      renderBuilder();
      return;
    }

    const delBlockBtn = e.target.closest('.btn-delete-block');
    if (delBlockBtn) {
      const sIdx = parseInt(delBlockBtn.dataset.sidx, 10);
      const bIdx = parseInt(delBlockBtn.dataset.bidx, 10);
      routine.sections[sIdx].blocks.splice(bIdx, 1);
      saveRoutine();
      renderBuilder();
      return;
    }

    const addBlockBtn = e.target.closest('.btn-add-block');
    if (addBlockBtn) {
      const sIdx = parseInt(addBlockBtn.dataset.sidx, 10);
      routine.sections[sIdx].blocks.push({
        id: 'b_' + Date.now(),
        type: 'work',
        label: 'Sprint Interval',
        durationSec: 30,
        cueOverlay: 'beeps'
      });
      saveRoutine();
      renderBuilder();
      return;
    }

    const attachBtn = e.target.closest('.btn-attach-audio');
    if (attachBtn) {
      const sIdx = parseInt(attachBtn.dataset.sidx, 10);
      const bIdx = parseInt(attachBtn.dataset.bidx, 10);
      activeTargetBlock = { sIdx, bIdx };
      openAudioModal();
      return;
    }

    const clearBtn = e.target.closest('.btn-clear-audio');
    if (clearBtn) {
      const sIdx = parseInt(clearBtn.dataset.sidx, 10);
      const bIdx = parseInt(clearBtn.dataset.bidx, 10);
      delete routine.sections[sIdx].blocks[bIdx].audioSegment;
      saveRoutine();
      renderBuilder();
    }
  });

  // Add Section
  el.btnAddSection.addEventListener('click', () => {
    routine.sections.push({
      id: 'sec_' + Date.now(),
      name: 'Circuit Block ' + (routine.sections.length + 1),
      repeatCount: 1,
      blocks: [
        { id: 'b_w_' + Date.now(), type: 'work', label: 'Max Effort', durationSec: 45, cueOverlay: 'beeps' },
        { id: 'b_r_' + Date.now(), type: 'rest', label: 'Transition / Rest', durationSec: 15, cueOverlay: 'beeps' }
      ]
    });
    saveRoutine();
    renderBuilder();
  });

  // ───────────────────────────────────────────────────────────────────
  // 13. AUDIO ATTACHMENT MODAL
  // ───────────────────────────────────────────────────────────────────
  function openAudioModal() {
    el.sampleBeatsList.innerHTML = '';
    SAMPLE_BEATS.forEach((beat) => {
      const d = document.createElement('div');
      d.className = 'modal-sample-item';
      d.innerHTML = `
        <div>
          <div class="sample-name">${beat.title}</div>
          <div class="sample-sub">${beat.podcastTitle} • ${beat.bpm} BPM</div>
        </div>
        <span class="btn-sample-pick">Select</span>
      `;
      d.addEventListener('click', () => {
        if (activeTargetBlock) {
          routine.sections[activeTargetBlock.sIdx].blocks[activeTargetBlock.bIdx].audioSegment = beat;
          saveRoutine();
          renderBuilder();
        }
        closeAudioModal();
      });
      el.sampleBeatsList.appendChild(d);
    });

    // Downloaded Episodes & Files from app.js via AnypodShared
    const downListEl = document.getElementById('modal-downloads-list');
    if (downListEl) {
      downListEl.innerHTML = '';
      const dMap = Shared.getDownloadsMap ? Shared.getDownloadsMap() : (() => {
        try { return JSON.parse(localStorage.getItem('anypod_downloads') || '{}'); } catch (_) { return {}; }
      })();
      const dList = Object.values(dMap);
      if (dList.length > 0) {
        dList.forEach(ep => {
          const dItem = document.createElement('div');
          dItem.className = 'modal-sample-item';
          dItem.innerHTML = `
            <div style="overflow: hidden; margin-right: 8px;">
              <div class="sample-name" style="color: #67e8f9;">${escapeHtml(ep.title)}</div>
              <div class="sample-sub">${escapeHtml(ep.podcastTitle || 'Downloaded')} • Offline</div>
            </div>
            <span class="btn-sample-pick" style="color: #06b6d4;">Select</span>
          `;
          dItem.addEventListener('click', () => {
            if (activeTargetBlock) {
              routine.sections[activeTargetBlock.sIdx].blocks[activeTargetBlock.bIdx].audioSegment = {
                id: ep.guid,
                title: ep.title,
                podcastTitle: ep.podcastTitle || 'Podcast',
                sourceUrl: ep.audioUrl,
                startTimeSec: 0
              };
              saveRoutine();
              renderBuilder();
            }
            closeAudioModal();
          });
          downListEl.appendChild(dItem);
        });
      } else {
        downListEl.innerHTML = '<div style="font-size: 11px; color: #6b7280; font-style: italic;">No downloaded episodes found in offline storage</div>';
      }
    }

    // Live Episode from Main Anypod Player via AnypodShared
    el.liveEpContainer.innerHTML = '';
    const liveEp = Shared.getLastActiveEpisode ? Shared.getLastActiveEpisode() : (() => {
      try {
        const raw = localStorage.getItem('anypod_last_active_episode');
        return raw ? JSON.parse(raw) : null;
      } catch (_) { return null; }
    })();

    if (liveEp && (liveEp.audioUrl || liveEp.url)) {
      const c = document.createElement('div');
      c.className = 'active-ep-card';
      c.innerHTML = `
        <div style="overflow: hidden; margin-right: 10px;">
          <div style="font-size: 12px; font-weight: 800; color: #67e8f9; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${escapeHtml(liveEp.title || 'Anypod Episode')}</div>
          <div style="font-size: 10px; color: #9ca3af; margin-top: 2px;">${escapeHtml(liveEp.podcastTitle || liveEp.author || 'Main Player')}</div>
        </div>
        <span style="font-size: 11px; font-weight: 800; color: #06b6d4; white-space: nowrap;">Use Episode</span>
      `;
      c.addEventListener('click', () => {
        if (activeTargetBlock) {
          routine.sections[activeTargetBlock.sIdx].blocks[activeTargetBlock.bIdx].audioSegment = {
            id: liveEp.guid || 'ep_' + Date.now(),
            title: liveEp.title || 'Anypod Episode',
            podcastTitle: liveEp.podcastTitle || 'Podcast',
            sourceUrl: liveEp.audioUrl || liveEp.url,
            startTimeSec: 0
          };
          saveRoutine();
          renderBuilder();
        }
        closeAudioModal();
      });
      el.liveEpContainer.appendChild(c);
    } else {
      el.liveEpContainer.innerHTML = '<div style="font-size: 12px; color: #6b7280; font-style: italic;">No active episode playing in main player</div>';
    }

    el.modalAudio.style.display = 'flex';
  }

  function closeAudioModal() {
    el.modalAudio.style.display = 'none';
    activeTargetBlock = null;
  }

  el.btnCloseAudioModal.addEventListener('click', closeAudioModal);

  el.formDirectAudio.addEventListener('submit', (e) => {
    e.preventDefault();
    const url = el.inputDirectUrl.value.trim();
    const title = el.inputDirectTitle.value.trim() || 'Custom Stream';
    const start = parseFloat(el.inputDirectStart.value) || 0;

    if (url && activeTargetBlock) {
      routine.sections[activeTargetBlock.sIdx].blocks[activeTargetBlock.bIdx].audioSegment = {
        id: 'url_' + Date.now(),
        title: title,
        podcastTitle: 'Direct Audio',
        sourceUrl: url,
        startTimeSec: start
      };
      saveRoutine();
      renderBuilder();
      closeAudioModal();
      el.inputDirectUrl.value = '';
      el.inputDirectTitle.value = '';
      el.inputDirectStart.value = '0';
    }
  });

  // ───────────────────────────────────────────────────────────────────
  // 14. SHARE & EXPORT MODAL
  // ───────────────────────────────────────────────────────────────────
  el.btnOpenShare.addEventListener('click', () => {
    try {
      const json = JSON.stringify(routine);
      const b64 = btoa(encodeURIComponent(json));
      el.inputShareUrl.value = location.origin + '/sets.html#routine=' + b64;
    } catch (_) {
      el.inputShareUrl.value = location.href;
    }
    el.modalShare.style.display = 'flex';
  });

  el.btnCloseShareModal.addEventListener('click', () => {
    el.modalShare.style.display = 'none';
  });

  el.btnCopyShare.addEventListener('click', () => {
    navigator.clipboard.writeText(el.inputShareUrl.value);
    el.btnCopyShare.textContent = 'Copied!';
    setTimeout(() => { el.btnCopyShare.textContent = 'Copy'; }, 2000);
  });

  el.btnDownloadJson.addEventListener('click', () => {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(routine, null, 2));
    const dl = document.createElement('a');
    dl.setAttribute('href', dataStr);
    dl.setAttribute('download', `${routine.title.toLowerCase().replace(/\s+/g, '_')}_routine.json`);
    document.body.appendChild(dl);
    dl.click();
    dl.remove();
  });

  // ───────────────────────────────────────────────────────────────────
  // 15. INITIAL RENDER
  // ───────────────────────────────────────────────────────────────────
  renderPlayer();
  renderBuilder();

  // ───────────────────────────────────────────────────────────────────
  // 16. STORAGE SYNC & CROSS-SUBDOMAIN BRIDGE (VIA AnypodShared)
  // ───────────────────────────────────────────────────────────────────
  if (Shared.initStorageBridge) {
    Shared.initStorageBridge({
      onUpdate: () => {
        if (el.modalAudio && el.modalAudio.style.display === 'flex') {
          openAudioModal();
        }
      }
    });
  }
})();
