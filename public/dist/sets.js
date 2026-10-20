(function () {
  'use strict';

  const Shared = window.AnypodShared || {};

  // ───────────────────────────────────────────────────────────────────
  // 0. YOUTUBE & URL HELPERS
  // ───────────────────────────────────────────────────────────────────
  function extractYouTubeId(url) {
    if (!url) return null;
    const str = String(url);
    const m = str.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|shorts\/|watch\?v=|watch\?.+&v=))([\w-]{11})/i);
    return m ? m[1] : null;
  }

  function isYouTubeShortUrl(url) {
    return Boolean(url && String(url).includes('/shorts/'));
  }

  function showToast(msg) {
    const t = document.getElementById('sets-toast');
    if (!t) return;
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(t._timer);
    t._timer = setTimeout(() => t.classList.remove('show'), 2300);
  }

  const createSynthBeat = (bpm, style) => {
    if (Shared.createSynthBeatBlobUrl) {
      const u = Shared.createSynthBeatBlobUrl(bpm, style);
      if (u) return u;
    }
    return 'https://cdn.freesound.org/previews/381/381382_1676145-lq.mp3';
  };

  // ───────────────────────────────────────────────────────────────────
  // 1. DATA PRESETS, SYNTH BEATS & 30-MINUTE WORKOUT TEMPLATES
  // ───────────────────────────────────────────────────────────────────
  const SAMPLE_BEATS = [
    {
      id: 'sample-909',
      title: '909 Deep Tech Beat (Offline Synth)',
      podcastTitle: 'Anypod DJ Tools',
      bpm: 128,
      style: 'house',
      sourceUrl: createSynthBeat(128, 'house'),
      startTimeSec: 0,
      endTimeSec: 20,
      loop: true,
      playbackMode: 'loop'
    },
    {
      id: 'sample-acid',
      title: 'Acid 303 Sprint Bassline',
      podcastTitle: 'Anypod DJ Tools',
      bpm: 134,
      style: 'acid',
      sourceUrl: createSynthBeat(134, 'acid'),
      startTimeSec: 0,
      endTimeSec: 20,
      loop: true,
      playbackMode: 'loop'
    },
    {
      id: 'sample-techno',
      title: 'Peak-Time Boxing Techno Drive',
      podcastTitle: 'Anypod DJ Tools',
      bpm: 138,
      style: 'techno',
      sourceUrl: createSynthBeat(138, 'techno'),
      startTimeSec: 0,
      endTimeSec: 30,
      loop: true,
      playbackMode: 'loop'
    },
    {
      id: 'sample-funk',
      title: 'Zone 2 Groove & Breakbeat',
      podcastTitle: 'Anypod DJ Tools',
      bpm: 122,
      style: 'house',
      sourceUrl: createSynthBeat(122, 'house'),
      startTimeSec: 0,
      endTimeSec: 30,
      loop: true,
      playbackMode: 'loop'
    }
  ];

  const TEMPLATES = {
    hiit30m: {
      id: 'tpl_hiit30m',
      title: '30-Min HIIT Sweat Session',
      sections: [
        {
          id: 'sec_h30_warm',
          name: 'Dynamic Warmup (3 Min)',
          repeatCount: 1,
          blocks: [
            { id: 'b_h30_w1', type: 'warmup', label: 'Light Jog, Arm Circles & Hip Openers', durationSec: 90, cueOverlay: 'beeps', audioSegment: SAMPLE_BEATS[3] },
            { id: 'b_h30_w2', type: 'warmup', label: 'High Knees & Bodyweight Squat Prep', durationSec: 90, cueOverlay: 'beeps', audioSegment: SAMPLE_BEATS[3] }
          ]
        },
        {
          id: 'sec_h30_main',
          name: 'HIIT Sweat Core (24 Min • 40s/20s)',
          repeatCount: 6,
          blocks: [
            { id: 'b_h30_1w', type: 'work', label: 'Burpee Broad Jumps / High Output', durationSec: 40, cueOverlay: 'beeps', audioSegment: SAMPLE_BEATS[1] },
            { id: 'b_h30_1r', type: 'rest', label: 'Breathe & Shake Out', durationSec: 20, cueOverlay: 'beeps' },
            { id: 'b_h30_2w', type: 'work', label: 'Alternating Reverse Lunge Drives', durationSec: 40, cueOverlay: 'beeps', audioSegment: SAMPLE_BEATS[0] },
            { id: 'b_h30_2r', type: 'rest', label: 'Active Recovery Walk', durationSec: 20, cueOverlay: 'beeps' },
            { id: 'b_h30_3w', type: 'work', label: 'Explosive Push-Ups / Shoulder Taps', durationSec: 40, cueOverlay: 'beeps', audioSegment: SAMPLE_BEATS[2] },
            { id: 'b_h30_3r', type: 'rest', label: 'Deep Nasal Breathing', durationSec: 20, cueOverlay: 'beeps' },
            { id: 'b_h30_4w', type: 'work', label: 'Mountain Climbers Sprint', durationSec: 40, cueOverlay: 'beeps', audioSegment: SAMPLE_BEATS[1] },
            { id: 'b_h30_4r', type: 'rest', label: 'Hydrate & Reset Next Round', durationSec: 20, cueOverlay: 'beeps' }
          ]
        },
        {
          id: 'sec_h30_cool',
          name: 'Decompression & Stretch (3 Min)',
          repeatCount: 1,
          blocks: [
            { id: 'b_h30_c1', type: 'cooldown', label: 'Slow Walk & Heart Rate Down-Regulation', durationSec: 90, cueOverlay: 'beeps' },
            { id: 'b_h30_c2', type: 'cooldown', label: 'Hamstring, Hip Flexor & Thoracic Stretch', durationSec: 90, cueOverlay: 'beeps' }
          ]
        }
      ]
    },
    emom30m: {
      id: 'tpl_emom30m',
      title: '30-Min EMOM Power Conditioning',
      sections: [
        {
          id: 'sec_e30_warm',
          name: 'Mobility & Activation (2 Min)',
          repeatCount: 1,
          blocks: [
            { id: 'b_e30_w', type: 'warmup', label: 'Inchworms, Kettlebell Halos & Glute Bridges', durationSec: 120, cueOverlay: 'beeps', audioSegment: SAMPLE_BEATS[3] }
          ]
        },
        {
          id: 'sec_e30_emom',
          name: 'Every Minute On The Minute (26 Rounds)',
          repeatCount: 26,
          blocks: [
            { id: 'b_e30_work', type: 'work', label: 'EMOM Target Reps (45s Power Window)', durationSec: 45, cueOverlay: 'beeps', audioSegment: SAMPLE_BEATS[0] },
            { id: 'b_e30_rest', type: 'rest', label: 'Top-of-Minute Transition', durationSec: 15, cueOverlay: 'beeps' }
          ]
        },
        {
          id: 'sec_e30_cool',
          name: 'Cooldown Breathwork (2 Min)',
          repeatCount: 1,
          blocks: [
            { id: 'b_e30_c', type: 'cooldown', label: 'Box Breathing & Floor Stretch', durationSec: 120, cueOverlay: 'beeps' }
          ]
        }
      ]
    },
    boxing30m: {
      id: 'tpl_boxing30m',
      title: '30-Min Championship Boxing / MMA Rounds',
      sections: [
        {
          id: 'sec_bx_warm',
          name: 'Jump Rope & Shadow Warmup (3 Min)',
          repeatCount: 1,
          blocks: [
            { id: 'b_bx_w1', type: 'warmup', label: 'Jump Rope Rhythm & Footwork Bounce', durationSec: 180, cueOverlay: 'beeps', audioSegment: SAMPLE_BEATS[3] }
          ]
        },
        {
          id: 'sec_bx_rounds',
          name: '6 Championship Rounds (3m Fight / 1m Corner)',
          repeatCount: 6,
          blocks: [
            { id: 'b_bx_fight', type: 'work', label: '3-Min Heavy Bag / Shadowboxing Combinations', durationSec: 150, cueOverlay: 'beeps', audioSegment: SAMPLE_BEATS[2] },
            { id: 'b_bx_burn', type: 'work', label: 'Final 30s Knockout Flurry (Non-Stop)', durationSec: 30, cueOverlay: 'beeps', audioSegment: SAMPLE_BEATS[1] },
            { id: 'b_bx_corner', type: 'rest', label: '1-Min Corner Recovery & Guard Check', durationSec: 60, cueOverlay: 'beeps' }
          ]
        },
        {
          id: 'sec_bx_cool',
          name: 'Core & Cooldown (3 Min)',
          repeatCount: 1,
          blocks: [
            { id: 'b_bx_c1', type: 'cooldown', label: 'Shoulder, Wrist & Neck Decompression', durationSec: 180, cueOverlay: 'beeps' }
          ]
        }
      ]
    },
    podcastRun30m: {
      id: 'tpl_podcastrun30m',
      title: '30-Min Podcast Zone-2 + Sprint Surges',
      sections: [
        {
          id: 'sec_pr_warm',
          name: 'Easy Ramp-Up Walk/Jog (3 Min)',
          repeatCount: 1,
          blocks: [
            { id: 'b_pr_w', type: 'warmup', label: 'Easy Stride & Cadence Check', durationSec: 180, cueOverlay: 'beeps', audioSegment: Object.assign({}, SAMPLE_BEATS[3], { playbackMode: 'flow', loop: false }) }
          ]
        },
        {
          id: 'sec_pr_main',
          name: '8x (2:30 Zone-2 Podcast Flow + 30s Surge)',
          repeatCount: 8,
          blocks: [
            { id: 'b_pr_z2', type: 'rest', label: 'Zone-2 Conversational Pace (Podcast Flow)', durationSec: 150, cueOverlay: 'beeps', audioSegment: Object.assign({}, SAMPLE_BEATS[3], { playbackMode: 'flow', loop: false }) },
            { id: 'b_pr_sp', type: 'work', label: '30s Fast Stride Surge (+Beat Overlay)', durationSec: 30, cueOverlay: 'beeps', audioSegment: SAMPLE_BEATS[1] }
          ]
        },
        {
          id: 'sec_pr_cool',
          name: 'Easy Walk Down (3 Min)',
          repeatCount: 1,
          blocks: [
            { id: 'b_pr_c', type: 'cooldown', label: 'Relaxed Cooldown Walk', durationSec: 180, cueOverlay: 'beeps' }
          ]
        }
      ]
    },
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
            { id: 'b_sq', type: 'work', label: 'Goblet Squats', durationSec: 45, cueOverlay: 'beeps', audioSegment: SAMPLE_BEATS[0] },
            { id: 'b_sq_r', type: 'rest', label: 'Transition', durationSec: 15, cueOverlay: 'beeps' },
            { id: 'b_pu', type: 'work', label: 'Push-Ups / Floor Press', durationSec: 45, cueOverlay: 'beeps', audioSegment: SAMPLE_BEATS[1] },
            { id: 'b_pu_r', type: 'rest', label: 'Transition', durationSec: 15, cueOverlay: 'beeps' },
            { id: 'b_kb', type: 'work', label: 'Kettlebell Swings', durationSec: 45, cueOverlay: 'beeps', audioSegment: SAMPLE_BEATS[2] },
            { id: 'b_kb_r', type: 'rest', label: 'Transition', durationSec: 15, cueOverlay: 'beeps' },
            { id: 'b_pl', type: 'work', label: 'Core Plank Hold', durationSec: 45, cueOverlay: 'beeps', audioSegment: SAMPLE_BEATS[0] },
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
    }
  };

  // ───────────────────────────────────────────────────────────────────
  // 2. TIMELINE COMPILER & MATH
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
            blockIndex: bIdx,
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

  function formatPreciseSec(s) {
    if (!s || isNaN(s) || s < 0) return '00:00.0';
    const mins = Math.floor(s / 60);
    const secs = (s % 60).toFixed(1);
    return `${mins < 10 ? '0' : ''}${mins}:${Number(secs) < 10 ? '0' : ''}${secs}`;
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
  // 3. HYBRID WORKOUT AUDIO & YOUTUBE LOOP ENGINE
  //    Supports:
  //    - Precision A-B Loops (startTimeSec -> endTimeSec)
  //    - Continuous Podcast/Mix Flow (remembers position across intervals)
  //    - YouTube / Shorts IFrame Player A-B Loops
  //    - 128 BPM Synth Beat Overlay (layers driving drums under podcasts)
  // ───────────────────────────────────────────────────────────────────
  class WorkoutAudioEngine {
    constructor() {
      this.ctx = null;
      this.masterGain = null;
      this.cueGain = null;
      this.beatOverlayGain = null;
      this.activeDeck = 'A';
      this.crossfadeVal = 0;
      this.beepsEnabled = true;
      this.voiceEnabled = true;
      this.beatOverlayEnabled = false;
      this.masterVolume = 0.92;
      this.broadcastChannel = null;

      // Track continuous playback positions by sourceUrl so podcasts resume seamlessly
      this.continuousPositions = {};
      this.currentBlock = null;

      // YouTube Player State for Workout View
      this.ytPlayer = null;
      this.ytReady = false;
      this.ytActiveVideoId = null;
      this.activeEngineType = 'audio'; // 'audio' | 'youtube'

      const makeAudio = () => {
        const a = new Audio();
        a.crossOrigin = 'anonymous';
        a.preload = 'auto';
        a.setAttribute('playsinline', '');
        return a;
      };

      this.decks = {
        A: { audio: makeAudio(), source: null, filter: null, gain: null, segment: null, isPrebuffered: false },
        B: { audio: makeAudio(), source: null, filter: null, gain: null, segment: null, isPrebuffered: false }
      };

      // Dedicated procedural drum overlay player for layering beats under spoken podcasts
      this.beatDeck = makeAudio();
      this.beatDeck.loop = true;
      this.beatDeck.src = createSynthBeat(128, 'house');

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
        this.cueGain.gain.setValueAtTime(0.95, this.ctx.currentTime);
        this.cueGain.connect(this.ctx.destination);

        this.beatOverlayGain = this.ctx.createGain();
        this.beatOverlayGain.gain.setValueAtTime(0.0, this.ctx.currentTime);
        this.beatOverlayGain.connect(this.ctx.destination);

        ['A', 'B'].forEach((id) => {
          const d = this.decks[id];
          try {
            d.source = this.ctx.createMediaElementSource(d.audio);
            d.filter = this.ctx.createBiquadFilter();
            d.filter.type = 'lowpass';
            d.filter.frequency.value = 18000;
            d.gain = this.ctx.createGain();
            d.source.connect(d.filter);
            d.filter.connect(d.gain);
            d.gain.connect(this.masterGain);
          } catch (err) {
            console.warn('[AudioEngine] MediaElementSource init:', err);
          }
        });

        try {
          const beatSrc = this.ctx.createMediaElementSource(this.beatDeck);
          beatSrc.connect(this.beatOverlayGain);
        } catch (_) {}

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

    updateBeatOverlayState(isRunning, blockType) {
      if (!this.ctx || !this.beatOverlayGain) return;
      const shouldPlayBeat = isRunning && this.beatOverlayEnabled && blockType === 'work';
      const now = this.ctx.currentTime;
      if (shouldPlayBeat) {
        if (this.beatDeck.paused) {
          this.beatDeck.play().catch(() => {});
        }
        this.beatOverlayGain.gain.setTargetAtTime(0.45, now, 0.08);
      } else {
        this.beatOverlayGain.gain.setTargetAtTime(0.0, now, 0.12);
        if (!isRunning && !this.beatDeck.paused) {
          this.beatDeck.pause();
        }
      }
    }

    saveActiveFlowPosition() {
      const active = this.decks[this.activeDeck];
      if (active && active.segment && active.segment.sourceUrl && active.segment.playbackMode === 'flow') {
        if (this.activeEngineType === 'youtube' && this.ytPlayer && typeof this.ytPlayer.getCurrentTime === 'function') {
          this.continuousPositions[active.segment.sourceUrl] = this.ytPlayer.getCurrentTime();
        } else if (active.audio && !isNaN(active.audio.currentTime)) {
          this.continuousPositions[active.segment.sourceUrl] = active.audio.currentTime;
        }
      }
    }

    async playBlock(block, crossfade = true) {
      await this.ensureContext();
      this.saveActiveFlowPosition();
      this.currentBlock = block;
      const seg = block.audioSegment;

      if (Shared.notifyWorkoutActive) {
        Shared.notifyWorkoutActive(block.label);
      } else {
        try {
          this.broadcastChannel?.postMessage({ type: 'WORKOUT_ACTIVE', label: block.label });
        } catch (_) {}
      }

      this.updateBeatOverlayState(true, block.type);

      const ytViewport = document.getElementById('player-yt-viewport');

      if (!seg || !seg.sourceUrl) {
        if (ytViewport) ytViewport.classList.remove('yt-visible');
        this.pauseYouTube();
        this.fadeDecksOut(crossfade ? 1.0 : 0.1);
        return;
      }

      const ytId = seg.videoId || extractYouTubeId(seg.sourceUrl);
      if (ytId) {
        // Play via YouTube / Shorts Engine
        this.activeEngineType = 'youtube';
        this.fadeDecksOut(0.2);
        if (ytViewport) {
          ytViewport.classList.add('yt-visible');
          ytViewport.classList.toggle('yt-shorts-mode', isYouTubeShortUrl(seg.sourceUrl));
        }
        const startSec = seg.playbackMode === 'flow' && this.continuousPositions[seg.sourceUrl] != null
          ? this.continuousPositions[seg.sourceUrl]
          : (seg.startTimeSec || 0);
        this.decks[this.activeDeck].segment = seg;
        this.playYouTubeSegment(ytId, startSec, block.type === 'rest' ? 40 : 100);
        return;
      }

      // Standard HTML5 / WebAudio Deck Engine
      this.activeEngineType = 'audio';
      if (ytViewport) ytViewport.classList.remove('yt-visible');
      this.pauseYouTube();

      const oldDeckId = this.activeDeck;
      const oldDeck = this.decks[oldDeckId];

      // If same source URL in 'flow' mode is already playing on active deck, keep it rolling smoothly!
      const streamUrl = this.resolveUrl(seg.sourceUrl);
      if (seg.playbackMode === 'flow' && oldDeck.segment && oldDeck.segment.sourceUrl === seg.sourceUrl && !oldDeck.audio.paused) {
        oldDeck.segment = seg;
        const now = this.ctx.currentTime;
        const isRest = block.type === 'rest' || block.type === 'cooldown';
        if (oldDeck.filter) {
          oldDeck.filter.frequency.setTargetAtTime(isRest ? 1400 : 18000, now, 0.25);
        }
        if (oldDeck.gain) {
          oldDeck.gain.gain.setTargetAtTime(isRest ? 0.55 : 1.0, now, 0.25);
        }
        return;
      }

      const targetDeckId = this.activeDeck === 'A' ? 'B' : 'A';
      const targetDeck = this.decks[targetDeckId];

      const desiredStart = seg.playbackMode === 'flow' && this.continuousPositions[seg.sourceUrl] != null
        ? this.continuousPositions[seg.sourceUrl]
        : (seg.startTimeSec || 0);

      if (!targetDeck.isPrebuffered || targetDeck.audio.src !== streamUrl) {
        targetDeck.audio.src = streamUrl;
        targetDeck.audio.currentTime = desiredStart;
        targetDeck.audio.load();
      } else if (Math.abs(targetDeck.audio.currentTime - desiredStart) > 1.2) {
        targetDeck.audio.currentTime = desiredStart;
      }

      // Native loop if no custom endTimeSec is set and mode is loop
      targetDeck.audio.loop = (seg.playbackMode !== 'flow') && !(seg.endTimeSec && seg.endTimeSec > (seg.startTimeSec || 0));
      targetDeck.segment = seg;
      targetDeck.isPrebuffered = false;

      if (targetDeck.filter && this.ctx) {
        const isRest = block.type === 'rest' || block.type === 'cooldown';
        targetDeck.filter.frequency.setTargetAtTime(isRest ? 1600 : 18000, this.ctx.currentTime, 0.15);
      }

      // Fallback if proxy fails
      const onProxyErr = () => {
        targetDeck.audio.removeEventListener('error', onProxyErr);
        if (targetDeck.audio.src.includes('/api/audio-proxy') && seg.sourceUrl) {
          targetDeck.audio.src = seg.sourceUrl;
          targetDeck.audio.load();
        }
      };
      targetDeck.audio.addEventListener('error', onProxyErr, { once: true });

      // Offline Cache API support
      if (seg.sourceUrl && Shared.matchOfflineAudioCache) {
        Shared.matchOfflineAudioCache(seg.sourceUrl).then((blobUrl) => {
          if (blobUrl && targetDeck.segment === seg) {
            targetDeck.audio.src = blobUrl;
            targetDeck.audio.currentTime = desiredStart;
            targetDeck.audio.play().catch(() => {});
          }
        }).catch(() => {});
      }

      try {
        await targetDeck.audio.play();
      } catch (err) {
        console.warn('[AudioEngine] Play failed:', err);
      }

      const targetVol = (block.type === 'rest' && seg.duckOnRest) ? 0.45 : 1.0;

      if (crossfade && this.ctx) {
        const t = this.ctx.currentTime;
        const dur = 1.2;

        if (targetDeckId === 'B') {
          this.decks.A.gain?.gain.setValueAtTime(1, t);
          this.decks.A.gain?.gain.linearRampToValueAtTime(0, t + dur);
          this.decks.B.gain?.gain.setValueAtTime(0, t);
          this.decks.B.gain?.gain.linearRampToValueAtTime(targetVol, t + dur);
        } else {
          this.decks.B.gain?.gain.setValueAtTime(1, t);
          this.decks.B.gain?.gain.linearRampToValueAtTime(0, t + dur);
          this.decks.A.gain?.gain.setValueAtTime(0, t);
          this.decks.A.gain?.gain.linearRampToValueAtTime(targetVol, t + dur);
        }

        this.activeDeck = targetDeckId;
        setTimeout(() => {
          if (this.activeDeck === targetDeckId) oldDeck.audio.pause();
        }, dur * 1000 + 80);
      } else {
        this.activeDeck = targetDeckId;
        this.setCrossfade(targetDeckId === 'A' ? 0 : 1, true);
        oldDeck.audio.pause();
      }
    }

    /**
     * Enforces tight A-B loop boundaries on every animation frame (both HTML5 Audio & YouTube Shorts/Videos).
     */
    checkLoopBoundaries() {
      const active = this.decks[this.activeDeck];
      const seg = active?.segment;
      if (!seg) return;

      const isLoopMode = seg.playbackMode !== 'flow' && seg.loop !== false;
      const startSec = Number(seg.startTimeSec) || 0;
      const endSec = Number(seg.endTimeSec) || 0;

      if (this.activeEngineType === 'youtube') {
        if (this.ytPlayer && this.ytReady && typeof this.ytPlayer.getCurrentTime === 'function') {
          const curT = this.ytPlayer.getCurrentTime();
          if (isLoopMode && endSec > startSec + 0.5 && curT >= endSec - 0.08) {
            this.ytPlayer.seekTo(startSec, true);
          }
        }
        return;
      }

      if (active && active.audio && !active.audio.paused) {
        const curT = active.audio.currentTime;
        if (isLoopMode && endSec > startSec + 0.4 && curT >= endSec - 0.06) {
          active.audio.currentTime = startSec;
          active.audio.play().catch(() => {});
        } else if (isLoopMode && endSec <= startSec && active.audio.duration && curT >= active.audio.duration - 0.08) {
          active.audio.currentTime = startSec;
          active.audio.play().catch(() => {});
        }
      }
    }

    getCurrentPlayheadInfo() {
      const active = this.decks[this.activeDeck];
      const seg = active?.segment;
      if (!seg) return { currentTime: 0, duration: 0, startSec: 0, endSec: 0 };

      const startSec = Number(seg.startTimeSec) || 0;
      let duration = 30;
      let currentTime = startSec;

      if (this.activeEngineType === 'youtube' && this.ytPlayer && this.ytReady) {
        currentTime = typeof this.ytPlayer.getCurrentTime === 'function' ? this.ytPlayer.getCurrentTime() : startSec;
        duration = typeof this.ytPlayer.getDuration === 'function' ? (this.ytPlayer.getDuration() || 60) : 60;
      } else if (active && active.audio) {
        currentTime = active.audio.currentTime || 0;
        duration = (active.audio.duration && isFinite(active.audio.duration)) ? active.audio.duration : Math.max(30, (seg.endTimeSec || 30));
      }

      const endSec = (seg.endTimeSec && seg.endTimeSec > startSec) ? seg.endTimeSec : duration;
      return { currentTime, duration, startSec, endSec };
    }

    playYouTubeSegment(videoId, startSec = 0, volume = 100) {
      if (this.ytPlayer && this.ytReady && typeof this.ytPlayer.loadVideoById === 'function') {
        if (this.ytActiveVideoId !== videoId) {
          this.ytActiveVideoId = videoId;
          this.ytPlayer.loadVideoById({ videoId, startSeconds: startSec });
        } else {
          this.ytPlayer.seekTo(startSec, true);
          this.ytPlayer.playVideo();
        }
        if (typeof this.ytPlayer.setVolume === 'function') this.ytPlayer.setVolume(volume);
        return;
      }

      const createYt = () => {
        if (!window.YT || !window.YT.Player) return;
        this.ytActiveVideoId = videoId;
        this.ytPlayer = new window.YT.Player('player-yt-slot', {
          width: '100%',
          height: '100%',
          videoId,
          playerVars: {
            autoplay: 1,
            controls: 0,
            disablekb: 1,
            fs: 0,
            modestbranding: 1,
            playsinline: 1,
            rel: 0,
            start: Math.floor(startSec)
          },
          events: {
            onReady: () => {
              this.ytReady = true;
              this.ytPlayer.setVolume(volume);
              this.ytPlayer.seekTo(startSec, true);
              this.ytPlayer.playVideo();
            },
            onStateChange: (e) => {
              if (e.data === window.YT.PlayerState.ENDED) {
                const seg = this.decks[this.activeDeck]?.segment;
                const s = Number(seg?.startTimeSec) || 0;
                this.ytPlayer.seekTo(s, true);
                this.ytPlayer.playVideo();
              }
            }
          }
        });
      };

      if (window.YT && window.YT.Player) {
        createYt();
      } else {
        const poll = setInterval(() => {
          if (window.YT && window.YT.Player) {
            clearInterval(poll);
            createYt();
          }
        }, 120);
        setTimeout(() => clearInterval(poll), 8000);
      }
    }

    pauseYouTube() {
      if (this.ytPlayer && this.ytReady && typeof this.ytPlayer.pauseVideo === 'function') {
        try { this.ytPlayer.pauseVideo(); } catch (_) {}
      }
    }

    prebuffer(segment) {
      if (!segment || !segment.sourceUrl || extractYouTubeId(segment.sourceUrl)) return;
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
      this.saveActiveFlowPosition();
      this.decks.A.audio.pause();
      this.decks.B.audio.pause();
      this.beatDeck.pause();
      this.pauseYouTube();
      try {
        this.broadcastChannel?.postMessage({ type: 'WORKOUT_PAUSED' });
      } catch (_) {}
    }

    resume() {
      const active = this.decks[this.activeDeck];
      if (this.activeEngineType === 'youtube') {
        if (this.ytPlayer && this.ytReady && typeof this.ytPlayer.playVideo === 'function') {
          this.ytPlayer.playVideo();
        }
      } else if (active.segment) {
        active.audio.play().catch(() => {});
      }
      if (this.currentBlock) {
        this.updateBeatOverlayState(true, this.currentBlock.type);
      }
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
      this.continuousPositions = {};
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
      const ducked = orig * 0.28;
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
  // 4. APPLICATION STATE & STORAGE (ROUTINES + LOOP CRATE)
  // ───────────────────────────────────────────────────────────────────
  const CRATE_STORAGE_KEY = 'anypod_loop_crate_v1';
  const SAVED_ROUTINES_KEY = 'anypod_saved_routines_v1';

  let loopCrate = (() => {
    try {
      const raw = localStorage.getItem(CRATE_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch (_) {}
    return SAMPLE_BEATS.map(b => Object.assign({}, b));
  })();

  function saveLoopCrate() {
    try {
      localStorage.setItem(CRATE_STORAGE_KEY, JSON.stringify(loopCrate));
    } catch (_) {}
    renderLoopCrate();
  }

  let savedRoutines = (() => {
    try {
      const raw = localStorage.getItem(SAVED_ROUTINES_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch (_) {}
    return [];
  })();

  function persistSavedRoutines() {
    try {
      localStorage.setItem(SAVED_ROUTINES_KEY, JSON.stringify(savedRoutines));
    } catch (_) {}
    renderSavedRoutinesChips();
  }

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

    return JSON.parse(JSON.stringify(TEMPLATES.hiit30m));
  })();

  let timeline = compileRoutine(routine);
  let totalSec = timeline.length ? timeline[timeline.length - 1].endOffsetSec : 0;

  let view = 'player'; // 'player' | 'builder' | 'studio'
  let state = 'idle';  // 'idle' | 'running' | 'paused' | 'completed'
  let currentIdx = 0;
  let elapsedSec = 0;

  let beepsOn = true;
  let voiceOn = true;
  let loopHoldActive = false;
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
    phaseFlash: document.getElementById('phase-flash-overlay'),
    ambientGlow: document.getElementById('ambient-beat-glow'),

    viewPlayer: document.getElementById('view-player'),
    viewBuilder: document.getElementById('view-builder'),
    viewStudio: document.getElementById('view-studio'),

    tabBtnPlayer: document.getElementById('tab-btn-player'),
    tabBtnBuilder: document.getElementById('tab-btn-builder'),
    tabBtnStudio: document.getElementById('tab-btn-studio'),

    btnToggleView: document.getElementById('btn-toggle-view'),
    viewToggleText: document.getElementById('view-toggle-text'),
    wakeBadge: document.getElementById('wake-badge'),

    btnToggleBeeps: document.getElementById('btn-toggle-beeps'),
    btnToggleVoice: document.getElementById('btn-toggle-voice'),
    btnOpenShare: document.getElementById('btn-open-share'),

    badgeType: document.getElementById('badge-interval-type'),
    badgePlaybackMode: document.getElementById('badge-playback-mode'),
    segmentedBar: document.getElementById('segmented-timeline-bar'),
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
    audioLoopRange: document.getElementById('audio-loop-range'),
    audioDjLink: document.getElementById('audio-dj-link'),
    btnEditActiveLoop: document.getElementById('btn-edit-active-loop'),
    playerLoopCanvas: document.getElementById('player-loop-canvas'),

    btnExtend30s: document.getElementById('btn-extend-30s'),
    btnRepeatInterval: document.getElementById('btn-repeat-interval'),
    btnLoopHold: document.getElementById('btn-loop-hold'),
    btnBeatOverlay: document.getElementById('btn-beat-overlay'),

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
    builderTotalSummary: document.getElementById('builder-total-summary'),
    btnSaveCustomRoutine: document.getElementById('btn-save-custom-routine'),
    savedRoutinesList: document.getElementById('saved-routines-list'),
    builderSectionsList: document.getElementById('builder-sections-list'),
    btnAddSection: document.getElementById('btn-add-section'),

    modalAudio: document.getElementById('modal-audio'),
    btnCloseAudioModal: document.getElementById('btn-close-audio-modal'),
    modalCrateLoopsList: document.getElementById('modal-crate-loops-list'),
    sampleBeatsList: document.getElementById('modal-sample-beats-list'),
    liveEpContainer: document.getElementById('modal-live-ep-container'),
    formDirectAudio: document.getElementById('form-direct-audio'),
    inputDirectUrl: document.getElementById('input-direct-url'),
    inputDirectTitle: document.getElementById('input-direct-title'),
    inputDirectStart: document.getElementById('input-direct-start'),
    inputDirectEnd: document.getElementById('input-direct-end'),

    modalShare: document.getElementById('modal-share'),
    btnCloseShareModal: document.getElementById('btn-close-share-modal'),
    inputShareUrl: document.getElementById('input-share-url'),
    btnCopyShare: document.getElementById('btn-copy-share'),
    btnDownloadJson: document.getElementById('btn-download-json')
  };

  // ───────────────────────────────────────────────────────────────────
  // 6. SCREEN WAKE LOCK & PHASE FLASH
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

  function triggerPhaseFlash(blockType) {
    if (!el.phaseFlash) return;
    const colorMap = {
      work: '#ef4444',
      rest: '#06b6d4',
      warmup: '#f59e0b',
      cooldown: '#10b981'
    };
    const c = colorMap[blockType] || '#ef4444';
    document.documentElement.style.setProperty('--active-phase-color', c);
    el.phaseFlash.style.backgroundColor = c;
    el.phaseFlash.classList.add('flash-active');
    setTimeout(() => {
      el.phaseFlash.classList.remove('flash-active');
    }, 80);
  }

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
      const artworkList = Shared.buildMediaSessionArtwork
        ? Shared.buildMediaSessionArtwork(art ? new URL(art, origin).href : '', origin)
        : [{ src: `${origin}/icon-512.png`, sizes: '512x512', type: 'image/png' }];

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
  // 8. RENDER PLAYER UI, SEGMENTED TIMELINE & LIVE LOOP WAVEFORM
  // ───────────────────────────────────────────────────────────────────
  let lastRenderedTimelineRef = null;

  function renderSegmentedTimeline() {
    if (!el.segmentedBar) return;
    if (lastRenderedTimelineRef !== timeline) {
      lastRenderedTimelineRef = timeline;
      el.segmentedBar.innerHTML = '';
      timeline.forEach((item, idx) => {
        const segEl = document.createElement('div');
        segEl.className = `seg-block seg-${item.block.type || 'work'}`;
        segEl.style.flexGrow = String(Math.max(1, item.block.durationSec));
        segEl.title = `${idx + 1}. ${item.block.label} (${formatTime(item.block.durationSec)})`;
        segEl.addEventListener('click', () => {
          switchInterval(idx, item.startOffsetSec);
        });
        el.segmentedBar.appendChild(segEl);
      });
    }

    const children = el.segmentedBar.children;
    for (let i = 0; i < children.length; i++) {
      children[i].classList.toggle('seg-completed', i < currentIdx);
      children[i].classList.toggle('seg-active', i === currentIdx);
    }
  }

  function renderPlayerLoopWaveform() {
    const canvas = el.playerLoopCanvas;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0) return;
    if (canvas.width !== Math.floor(rect.width)) {
      canvas.width = Math.floor(rect.width);
      canvas.height = Math.floor(rect.height || 28);
    }

    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    const cur = timeline[currentIdx];
    const seg = cur?.block?.audioSegment;
    if (!seg) return;

    const info = audioEngine.getCurrentPlayheadInfo();
    const dur = Math.max(1, info.duration);
    const inX = Math.max(0, Math.min(w, (info.startSec / dur) * w));
    const outX = Math.max(inX + 4, Math.min(w, (info.endSec / dur) * w));

    // Active loop region background
    ctx.fillStyle = seg.playbackMode === 'flow' ? 'rgba(6, 182, 212, 0.18)' : 'rgba(168, 85, 247, 0.22)';
    ctx.fillRect(inX, 0, outX - inX, h);

    // Procedural waveform bars
    const barCount = 56;
    const step = w / barCount;
    const seed = (seg.title || 'loop').split('').reduce((a, c) => a + c.charCodeAt(0), 17);
    for (let i = 0; i < barCount; i++) {
      const x = i * step;
      const inLoop = x >= inX && x <= outX;
      const amp = 0.25 + 0.65 * Math.abs(Math.sin((i + seed) * 0.43) * Math.cos(i * 0.19));
      const bh = Math.max(3, amp * (h - 6));
      ctx.fillStyle = inLoop ? (cur.block.type === 'work' ? '#f87171' : '#67e8f9') : '#374151';
      ctx.fillRect(x + 1, (h - bh) / 2, Math.max(2, step - 2), bh);
    }

    // Playhead needle
    const playX = Math.max(0, Math.min(w, (info.currentTime / dur) * w));
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(playX - 1, 0, 2.5, h);
  }

  function renderPlayer() {
    const cur = timeline[currentIdx];
    const nxt = timeline[currentIdx + 1];

    if (!cur) {
      el.displayCountdown.textContent = '00:00';
      return;
    }

    const bType = cur.block.type || 'work';
    renderSegmentedTimeline();

    // Update interval type badge & color classes
    el.badgeType.textContent = loopHoldActive ? `${bType.toUpperCase()} [HOLD]` : bType.toUpperCase();
    el.badgeType.className = `interval-type-badge badge-${bType}`;
    el.displayCountdown.className = `giant-digits digits-${bType}`;

    const seg = cur.block.audioSegment;
    if (el.badgePlaybackMode) {
      if (seg) {
        const isFlow = seg.playbackMode === 'flow';
        el.badgePlaybackMode.style.display = 'inline-flex';
        el.badgePlaybackMode.textContent = isFlow ? '🌊 FLOW MODE' : '🔁 A-B LOOP';
      } else {
        el.badgePlaybackMode.style.display = 'none';
      }
    }

    // Color theme styles
    const colorVar = `var(--${bType}-primary)`;
    el.intervalProgressFill.style.background = colorVar;
    el.intervalProgressFill.style.boxShadow = `0 0 14px ${colorVar}`;

    // Text labels
    el.labelRound.textContent = `Round ${cur.iteration} of ${cur.totalIterations} • Block ${currentIdx + 1}/${timeline.length}`;
    el.labelTotalTime.textContent = `Total: ${formatTime(elapsedSec)} / ${formatTime(totalSec)}`;
    el.labelIntervalName.textContent = cur.block.label;
    el.labelSectionName.textContent = cur.sectionName || 'Set';

    // Timing calculations
    const intervalDuration = cur.block.durationSec;
    const intervalElapsed = Math.max(0, Math.min(intervalDuration, elapsedSec - cur.startOffsetSec));
    const intervalRemaining = Math.max(0, intervalDuration - intervalElapsed);
    const intervalPct = intervalDuration > 0 ? (intervalElapsed / intervalDuration) * 100 : 0;
    const overallPct = totalSec > 0 ? (elapsedSec / totalSec) * 100 : 0;

    el.displayCountdown.textContent = formatTime(Math.ceil(intervalRemaining));
    el.intervalProgressFill.style.width = `${Math.min(100, intervalPct)}%`;
    el.labelIntervalPct.textContent = `${Math.round(intervalPct)}%`;

    el.labelOverallElapsed.textContent = formatTime(elapsedSec);
    el.labelOverallTotal.textContent = formatTime(totalSec);
    el.overallProgressFill.style.width = `${Math.min(100, overallPct)}%`;

    // Audio Segment & Loop Deck
    if (seg) {
      el.audioPill.style.display = 'flex';
      el.audioTitle.textContent = seg.title || 'Training Loop';
      if (seg.bpm) {
        el.audioBpm.style.display = 'inline-block';
        el.audioBpm.textContent = `${seg.bpm} BPM`;
      } else {
        el.audioBpm.style.display = 'none';
      }

      if (el.audioLoopRange) {
        const s = Number(seg.startTimeSec) || 0;
        const e = Number(seg.endTimeSec) || 0;
        if (seg.playbackMode === 'flow') {
          el.audioLoopRange.textContent = `Continuous Flow (from ${formatTime(s)})`;
        } else if (e > s) {
          el.audioLoopRange.textContent = `Loop ${formatTime(s)} → ${formatTime(e)} (${Math.round(e - s)}s)`;
        } else {
          el.audioLoopRange.textContent = `Seamless Loop`;
        }
      }

      if (seg.sourceUrl) {
        el.audioDjLink.href = `/dj.html?url=${encodeURIComponent(seg.sourceUrl)}`;
        el.audioDjLink.style.display = 'inline-flex';
      } else {
        el.audioDjLink.style.display = 'none';
      }
      renderPlayerLoopWaveform();
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
  // 9. WORKOUT LIFECYCLE CONTROLS & QUICK GYM ACTIONS
  // ───────────────────────────────────────────────────────────────────
  function switchInterval(newIdx, startSec) {
    if (newIdx >= timeline.length) {
      state = 'completed';
      releaseWakeLock();
      audioEngine.stop();
      triggerPhaseFlash('cooldown');
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

    triggerPhaseFlash(target.block.type);
    audioEngine.playBlock(target.block, true);
    if (voiceOn) {
      audioEngine.speak(`${target.block.type}. ${target.block.label}`);
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
    loopHoldActive = false;
    el.btnLoopHold?.classList.remove('active-hold');
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

  // Quick Gym Actions: +30s Extend, Repeat Interval, Loop Hold, Beat Overlay
  el.btnExtend30s?.addEventListener('click', () => {
    const cur = timeline[currentIdx];
    if (!cur) return;
    cur.block.durationSec += 30;
    for (let i = currentIdx; i < timeline.length; i++) {
      if (i > currentIdx) timeline[i].startOffsetSec += 30;
      timeline[i].endOffsetSec += 30;
    }
    totalSec += 30;
    renderPlayer();
    showToast('+30 Seconds added to current interval!');
  });

  el.btnRepeatInterval?.addEventListener('click', () => {
    const cur = timeline[currentIdx];
    if (!cur) return;
    elapsedSec = cur.startOffsetSec;
    lastBeepSec = -1;
    audioEngine.playBlock(cur.block, false);
    renderPlayer();
    showToast('Interval restarted!');
  });

  el.btnLoopHold?.addEventListener('click', () => {
    loopHoldActive = !loopHoldActive;
    el.btnLoopHold.classList.toggle('active-hold', loopHoldActive);
    renderPlayer();
    showToast(loopHoldActive ? '∞ Loop Hold ON: Timer frozen while audio loops' : 'Loop Hold OFF: Timer resumed');
  });

  el.btnBeatOverlay?.addEventListener('click', async () => {
    await audioEngine.ensureContext();
    audioEngine.beatOverlayEnabled = !audioEngine.beatOverlayEnabled;
    el.btnBeatOverlay.classList.toggle('active-beat', audioEngine.beatOverlayEnabled);
    const cur = timeline[currentIdx];
    audioEngine.updateBeatOverlayState(state === 'running', cur?.block?.type || 'work');
    showToast(audioEngine.beatOverlayEnabled ? '🥁 128 BPM Workout Beat Overlay ON' : 'Beat Overlay OFF');
  });

  // ───────────────────────────────────────────────────────────────────
  // 10. DRIFT-PROOF TICK LOOP + BPM PULSE & LOOP BOUNDARY ENFORCEMENT
  // ───────────────────────────────────────────────────────────────────
  function tickLoop(now) {
    // Always enforce A-B loop boundaries when workout is running
    if (state === 'running') {
      audioEngine.checkLoopBoundaries();

      const delta = (now - lastTimestamp) / 1000;
      lastTimestamp = now;

      if (!loopHoldActive) {
        elapsedSec += delta;
      }

      // Subtle BPM-synced visual scale pulse during running state
      const cur = timeline[currentIdx];
      const bpm = cur?.block?.audioSegment?.bpm || (cur?.block?.type === 'work' ? 128 : 90);
      const beatPeriod = 60 / bpm;
      const beatPhase = (now / 1000) % beatPeriod;
      const pulse = beatPhase < 0.12 ? 1.022 : 1.0;
      document.documentElement.style.setProperty('--beat-scale', String(pulse));

      if (!loopHoldActive && elapsedSec >= totalSec) {
        switchInterval(timeline.length);
      } else if (!loopHoldActive && cur) {
        if (elapsedSec >= cur.endOffsetSec) {
          switchInterval(currentIdx + 1, cur.endOffsetSec);
        } else {
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
      document.documentElement.style.setProperty('--beat-scale', '1');
    }

    // Also update Loop Studio preview if active
    tickStudioPreview();

    rafId = requestAnimationFrame(tickLoop);
  }

  // ───────────────────────────────────────────────────────────────────
  // 11. ROUTINE BUILDER RENDERING & SAVED ROUTINES MANAGER
  // ───────────────────────────────────────────────────────────────────
  function saveRoutine() {
    timeline = compileRoutine(routine);
    totalSec = timeline.length ? timeline[timeline.length - 1].endOffsetSec : 0;
    if (el.builderTotalSummary) {
      el.builderTotalSummary.textContent = `Total: ${formatTime(totalSec)} (${timeline.length} intervals)`;
    }
    try {
      localStorage.setItem('anypod_active_routine', JSON.stringify(routine));
    } catch (_) {}
  }

  function renderSavedRoutinesChips() {
    if (!el.savedRoutinesList) return;
    el.savedRoutinesList.innerHTML = '';
    if (savedRoutines.length === 0) {
      el.savedRoutinesList.innerHTML = '<span style="font-size:10px; color:#6b7280;">No custom saved workouts yet — click Save Routine to store your current setup.</span>';
      return;
    }
    savedRoutines.forEach((item, idx) => {
      const chip = document.createElement('div');
      chip.className = 'saved-routine-chip';
      chip.innerHTML = `
        <span class="saved-routine-load">${escapeHtml(item.title)}</span>
        <span class="saved-routine-del" data-delidx="${idx}" title="Delete Saved Routine">&times;</span>
      `;
      chip.querySelector('.saved-routine-load').addEventListener('click', () => {
        routine = JSON.parse(JSON.stringify(item));
        saveRoutine();
        reset();
        renderBuilder();
        showToast(`Loaded "${routine.title}"`);
      });
      chip.querySelector('.saved-routine-del').addEventListener('click', (e) => {
        e.stopPropagation();
        savedRoutines.splice(idx, 1);
        persistSavedRoutines();
      });
      el.savedRoutinesList.appendChild(chip);
    });
  }

  el.btnSaveCustomRoutine?.addEventListener('click', () => {
    const copy = JSON.parse(JSON.stringify(routine));
    copy.id = 'custom_' + Date.now();
    const existingIdx = savedRoutines.findIndex(r => r.title.toLowerCase() === copy.title.toLowerCase());
    if (existingIdx >= 0) {
      savedRoutines[existingIdx] = copy;
    } else {
      savedRoutines.unshift(copy);
    }
    persistSavedRoutines();
    showToast(`Saved "${copy.title}" to My Workouts!`);
  });

  function renderBuilder() {
    el.inputRoutineTitle.value = routine.title;
    if (el.builderTotalSummary) {
      el.builderTotalSummary.textContent = `Total: ${formatTime(totalSec)} (${timeline.length} intervals)`;
    }
    renderSavedRoutinesChips();
    el.builderSectionsList.innerHTML = '';

    routine.sections.forEach((section, sIdx) => {
      const card = document.createElement('div');
      card.className = 'section-card';

      const repeatOpts = [1, 2, 3, 4, 5, 6, 8, 10, 12, 15, 16, 20, 24, 26, 30]
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
          <span>Add Interval Block</span>
        </button>
      `;

      const blocksCont = card.querySelector(`#sblocks-${sIdx}`);
      section.blocks.forEach((block, bIdx) => {
        const bItem = document.createElement('div');
        bItem.className = `block-item type-${block.type}`;
        const seg = block.audioSegment;
        const isFlow = seg?.playbackMode === 'flow';
        const rangeStr = seg
          ? (isFlow
              ? `🌊 Flow (from ${formatTime(seg.startTimeSec || 0)})`
              : `🔁 Loop ${formatTime(seg.startTimeSec || 0)}→${formatTime(seg.endTimeSec || block.durationSec)}`)
          : '';

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
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="color: #ef4444; flex-shrink:0;"><circle cx="12" cy="12" r="10"></circle><circle cx="12" cy="12" r="3"></circle></svg>
              <span>${seg ? escapeHtml(seg.title) : '+ Attach Loop / Podcast / YT Short'}</span>
            </button>
            ${seg ? `
              <div class="block-loop-controls">
                <button type="button" class="badge-playback-mode ${isFlow ? 'mode-flow' : 'mode-loop'}" data-sidx="${sIdx}" data-bidx="${bIdx}" title="Click to toggle between A-B Loop and Continuous Flow">
                  ${rangeStr}
                </button>
                <button type="button" class="btn-clear-audio" data-sidx="${sIdx}" data-bidx="${bIdx}">Clear</button>
              </div>
            ` : ''}
          </div>
        `;
        blocksCont.appendChild(bItem);
      });

      el.builderSectionsList.appendChild(card);
    });
  }

  // ───────────────────────────────────────────────────────────────────
  // 12. LOOP STUDIO & CONTENT CREATOR VIEW (CLIPPER + AUTO-SLICER)
  // ───────────────────────────────────────────────────────────────────
  const studio = {
    source: {
      id: SAMPLE_BEATS[0].id,
      title: '909 Deep Tech Beat',
      podcastTitle: 'Anypod DJ Tools',
      sourceUrl: SAMPLE_BEATS[0].sourceUrl,
      duration: 30,
      bpm: 128,
      isYouTube: false,
      videoId: null
    },
    inSec: 0,
    outSec: 20,
    playheadSec: 0,
    isPlaying: false,
    audio: new Audio(),
    audioBuffer: null,
    peaks: [],
    ytPlayer: null,
    ytReady: false,
    dragMode: null, // 'in' | 'out' | 'region'
    dragStartX: 0,
    dragInitialIn: 0,
    dragInitialOut: 0
  };

  studio.audio.crossOrigin = 'anonymous';
  studio.audio.preload = 'auto';

  function generateSyntheticPeaks(title, count = 140) {
    const seed = (title || 'audio').split('').reduce((a, c) => a + c.charCodeAt(0), 31);
    const arr = [];
    for (let i = 0; i < count; i++) {
      const v = 0.2 + 0.75 * Math.abs(Math.sin((i + seed) * 0.37) * Math.cos(i * 0.13));
      arr.push(Math.min(1, v));
    }
    return arr;
  }

  studio.peaks = generateSyntheticPeaks(studio.source.title);

  async function loadSourceIntoStudio(item) {
    stopStudioPreview();
    const url = item.sourceUrl || item.audioUrl || item.url || '';
    const ytId = item.videoId || extractYouTubeId(url);
    const isYt = Boolean(ytId || item.isYouTube);
    const dur = Math.max(10, Number(item.durationSec || item.durSec || item.duration) || (isYt ? 180 : 60));

    studio.source = {
      id: item.id || item.guid || ('src_' + Date.now()),
      title: item.title || 'Custom Source',
      podcastTitle: item.podcastTitle || (isYt ? 'YouTube' : 'Anypod'),
      sourceUrl: url,
      duration: dur,
      bpm: item.bpm || 128,
      isYouTube: isYt,
      videoId: ytId
    };

    studio.inSec = Number(item.startTimeSec) || 0;
    studio.outSec = Number(item.endTimeSec) > studio.inSec
      ? Math.min(dur, Number(item.endTimeSec))
      : Math.min(dur, studio.inSec + 20);
    studio.playheadSec = studio.inSec;
    studio.peaks = generateSyntheticPeaks(studio.source.title);

    const badge = document.getElementById('studio-loaded-badge');
    const nameInput = document.getElementById('studio-loop-name');
    const bpmInput = document.getElementById('studio-loop-bpm');
    const ytPrev = document.getElementById('studio-yt-preview');

    if (badge) badge.textContent = studio.source.title;
    if (nameInput) nameInput.value = `${studio.source.title} (Loop)`;
    if (bpmInput) bpmInput.value = String(studio.source.bpm || 128);

    if (isYt && ytId) {
      if (ytPrev) ytPrev.classList.add('yt-visible');
      initStudioYouTube(ytId);
    } else {
      if (ytPrev) ytPrev.classList.remove('yt-visible');
      studio.audio.src = audioEngine.resolveUrl(url);
      studio.audio.load();
      studio.audio.addEventListener('loadedmetadata', () => {
        if (studio.audio.duration && isFinite(studio.audio.duration)) {
          studio.source.duration = studio.audio.duration;
          if (studio.outSec > studio.source.duration) {
            studio.outSec = Math.min(studio.source.duration, studio.inSec + 20);
          }
          renderStudioWaveform();
        }
      }, { once: true });

      // Attempt real WebAudio decode for accurate waveform peaks & WAV export
      decodeSourcePeaks(url);
    }

    renderStudioWaveform();
  }

  async function decodeSourcePeaks(url) {
    try {
      const fetchUrl = url.startsWith('blob:') || url.startsWith('data:')
        ? url
        : audioEngine.resolveUrl(url);
      const res = await fetch(fetchUrl);
      if (!res.ok) return;
      const buf = await res.arrayBuffer();
      const ctx = await audioEngine.ensureContext();
      const decoded = await ctx.decodeAudioData(buf);
      studio.audioBuffer = decoded;
      studio.source.duration = decoded.duration;
      const chan = decoded.getChannelData(0);
      const buckets = 140;
      const step = Math.floor(chan.length / buckets);
      const peaks = [];
      for (let i = 0; i < buckets; i++) {
        let max = 0;
        const start = i * step;
        for (let j = 0; j < step; j += 16) {
          const v = Math.abs(chan[start + j] || 0);
          if (v > max) max = v;
        }
        peaks.push(Math.max(0.08, Math.min(1, max)));
      }
      studio.peaks = peaks;
      renderStudioWaveform();
    } catch (_) {
      studio.audioBuffer = null;
    }
  }

  function initStudioYouTube(videoId) {
    if (studio.ytPlayer && studio.ytReady && typeof studio.ytPlayer.cueVideoById === 'function') {
      studio.ytPlayer.cueVideoById({ videoId, startSeconds: studio.inSec });
      return;
    }
    if (!window.YT || !window.YT.Player) return;
    studio.ytPlayer = new window.YT.Player('studio-yt-slot', {
      width: '100%',
      height: '100%',
      videoId,
      playerVars: { autoplay: 0, controls: 0, modestbranding: 1, playsinline: 1, rel: 0 },
      events: {
        onReady: () => {
          studio.ytReady = true;
          const d = studio.ytPlayer.getDuration ? studio.ytPlayer.getDuration() : 0;
          if (d > 0) {
            studio.source.duration = d;
            if (studio.outSec > d) studio.outSec = Math.min(d, studio.inSec + 20);
            renderStudioWaveform();
          }
        }
      }
    });
  }

  function renderStudioWaveform() {
    const canvas = document.getElementById('studio-waveform-canvas');
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    if (rect.width > 0 && canvas.width !== Math.floor(rect.width)) {
      canvas.width = Math.floor(rect.width);
      canvas.height = Math.floor(rect.height || 92);
    }
    const w = canvas.width || 500;
    const h = canvas.height || 92;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, w, h);

    const dur = Math.max(1, studio.source.duration);
    const inX = Math.max(0, Math.min(w, (studio.inSec / dur) * w));
    const outX = Math.max(inX + 6, Math.min(w, (studio.outSec / dur) * w));

    // Shaded active loop window
    ctx.fillStyle = 'rgba(168, 85, 247, 0.22)';
    ctx.fillRect(inX, 0, outX - inX, h);

    // Waveform bars
    const peaks = studio.peaks;
    const barW = w / peaks.length;
    for (let i = 0; i < peaks.length; i++) {
      const x = i * barW;
      const inside = x >= inX && x <= outX;
      const bh = Math.max(4, peaks[i] * (h - 18));
      ctx.fillStyle = inside ? '#c084fc' : '#3f3f46';
      ctx.fillRect(x + 1, (h - bh) / 2, Math.max(1.5, barW - 1.5), bh);
    }

    // [IN] Handle (Green)
    ctx.fillStyle = '#4ade80';
    ctx.fillRect(inX - 2, 0, 4, h);
    ctx.fillRect(inX - 2, 0, 14, 14);
    ctx.fillStyle = '#052e16';
    ctx.font = 'bold 9px monospace';
    ctx.fillText('IN', inX, 10);

    // [OUT] Handle (Pink)
    ctx.fillStyle = '#f472b6';
    ctx.fillRect(outX - 2, 0, 4, h);
    ctx.fillRect(outX - 16, h - 14, 18, 14);
    ctx.fillStyle = '#500724';
    ctx.fillText('OUT', outX - 15, h - 4);

    // Playhead
    const playX = Math.max(0, Math.min(w, (studio.playheadSec / dur) * w));
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(playX - 1, 0, 2, h);

    // Update numeric readouts
    const lblIn = document.getElementById('label-loop-in');
    const lblCur = document.getElementById('label-loop-cur');
    const lblOut = document.getElementById('label-loop-out');
    const lblLen = document.getElementById('label-loop-len');
    if (lblIn) lblIn.textContent = formatPreciseSec(studio.inSec);
    if (lblCur) lblCur.textContent = formatPreciseSec(studio.playheadSec);
    if (lblOut) lblOut.textContent = formatPreciseSec(studio.outSec);
    if (lblLen) lblLen.textContent = `${Math.max(0.5, studio.outSec - studio.inSec).toFixed(1)}s`;
  }

  // Interactive Pointer Dragging on Studio Waveform Canvas
  const waveBox = document.getElementById('studio-waveform-box');
  if (waveBox) {
    const getSecFromEvent = (e) => {
      const rect = waveBox.getBoundingClientRect();
      const relX = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
      return (relX / Math.max(1, rect.width)) * studio.source.duration;
    };

    waveBox.addEventListener('pointerdown', (e) => {
      const rect = waveBox.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const dur = Math.max(1, studio.source.duration);
      const inX = (studio.inSec / dur) * rect.width;
      const outX = (studio.outSec / dur) * rect.width;

      if (Math.abs(x - inX) <= 14) {
        studio.dragMode = 'in';
      } else if (Math.abs(x - outX) <= 14) {
        studio.dragMode = 'out';
      } else if (x > inX && x < outX) {
        studio.dragMode = 'region';
        studio.dragStartX = x;
        studio.dragInitialIn = studio.inSec;
        studio.dragInitialOut = studio.outSec;
      } else {
        const clickedSec = getSecFromEvent(e);
        const len = Math.max(2, studio.outSec - studio.inSec);
        studio.inSec = Math.max(0, Math.min(dur - len, clickedSec));
        studio.outSec = studio.inSec + len;
        studio.playheadSec = studio.inSec;
        seekStudioPreview(studio.inSec);
        renderStudioWaveform();
        return;
      }
      waveBox.setPointerCapture(e.pointerId);
    });

    waveBox.addEventListener('pointermove', (e) => {
      if (!studio.dragMode) return;
      const rect = waveBox.getBoundingClientRect();
      const dur = Math.max(1, studio.source.duration);
      const sec = getSecFromEvent(e);

      if (studio.dragMode === 'in') {
        studio.inSec = Math.max(0, Math.min(studio.outSec - 1, sec));
        studio.playheadSec = studio.inSec;
      } else if (studio.dragMode === 'out') {
        studio.outSec = Math.max(studio.inSec + 1, Math.min(dur, sec));
      } else if (studio.dragMode === 'region') {
        const dx = e.clientX - rect.left - studio.dragStartX;
        const dSec = (dx / Math.max(1, rect.width)) * dur;
        const len = studio.dragInitialOut - studio.dragInitialIn;
        const nextIn = Math.max(0, Math.min(dur - len, studio.dragInitialIn + dSec));
        studio.inSec = nextIn;
        studio.outSec = nextIn + len;
        studio.playheadSec = studio.inSec;
      }
      renderStudioWaveform();
    });

    waveBox.addEventListener('pointerup', () => {
      if (studio.dragMode) {
        studio.dragMode = null;
        if (studio.isPlaying) seekStudioPreview(studio.inSec);
      }
    });
  }

  function seekStudioPreview(sec) {
    studio.playheadSec = sec;
    if (studio.source.isYouTube && studio.ytPlayer && studio.ytReady) {
      studio.ytPlayer.seekTo(sec, true);
    } else {
      studio.audio.currentTime = sec;
    }
  }

  function toggleStudioPreview() {
    if (studio.isPlaying) {
      stopStudioPreview();
      return;
    }
    if (state === 'running') pause();
    studio.isPlaying = true;
    const btn = document.getElementById('btn-studio-preview');
    if (btn) btn.textContent = '⏸ Stop Preview';

    if (studio.source.isYouTube && studio.ytPlayer && studio.ytReady) {
      studio.ytPlayer.seekTo(studio.inSec, true);
      studio.ytPlayer.playVideo();
    } else {
      studio.audio.currentTime = studio.inSec;
      studio.audio.play().catch(() => {});
    }
  }

  function stopStudioPreview() {
    studio.isPlaying = false;
    const btn = document.getElementById('btn-studio-preview');
    if (btn) btn.textContent = '▶ Preview Loop';
    studio.audio.pause();
    if (studio.ytPlayer && studio.ytReady && typeof studio.ytPlayer.pauseVideo === 'function') {
      try { studio.ytPlayer.pauseVideo(); } catch (_) {}
    }
  }

  function tickStudioPreview() {
    if (!studio.isPlaying) return;
    if (studio.source.isYouTube && studio.ytPlayer && studio.ytReady && typeof studio.ytPlayer.getCurrentTime === 'function') {
      studio.playheadSec = studio.ytPlayer.getCurrentTime();
      if (studio.playheadSec >= studio.outSec - 0.08) {
        studio.ytPlayer.seekTo(studio.inSec, true);
      }
    } else if (!studio.audio.paused) {
      studio.playheadSec = studio.audio.currentTime;
      if (studio.playheadSec >= studio.outSec - 0.05) {
        studio.audio.currentTime = studio.inSec;
        studio.audio.play().catch(() => {});
      }
    }
    renderStudioWaveform();
  }

  function buildCurrentStudioLoopObject() {
    const nameInput = document.getElementById('studio-loop-name');
    const bpmInput = document.getElementById('studio-loop-bpm');
    const modeSelect = document.getElementById('studio-loop-mode');
    return {
      id: 'loop_' + Date.now(),
      title: (nameInput?.value || studio.source.title || 'Workout Loop').trim(),
      podcastTitle: studio.source.podcastTitle || 'Loop Studio',
      sourceUrl: studio.source.sourceUrl,
      videoId: studio.source.videoId || null,
      isYouTube: Boolean(studio.source.isYouTube),
      bpm: parseInt(bpmInput?.value, 10) || 128,
      startTimeSec: Number(studio.inSec.toFixed(1)),
      endTimeSec: Number(studio.outSec.toFixed(1)),
      loop: (modeSelect?.value || 'loop') === 'loop',
      playbackMode: modeSelect?.value || 'loop'
    };
  }

  // Render Studio Source Library (Podcasts, YT Playlists, Downloads, Synth Beats)
  function renderStudioLibrary(query = '') {
    const listEl = document.getElementById('studio-library-list');
    if (!listEl) return;
    listEl.innerHTML = '';

    const items = [];
    const seen = new Set();
    const pushItem = (ep, tag) => {
      if (!ep) return;
      const url = ep.audioUrl || ep.sourceUrl || ep.url;
      if (!url || seen.has(url)) return;
      seen.add(url);
      items.push({
        title: ep.title || 'Untitled Episode',
        podcastTitle: ep.podcastTitle || ep.author || tag,
        sourceUrl: url,
        durationSec: Shared.parseDurationSeconds ? Shared.parseDurationSeconds(ep.duration) : (Number(ep.duration) || 180),
        bpm: ep.bpm || 128
      });
    };

    const liveEp = Shared.getLastActiveEpisode ? Shared.getLastActiveEpisode() : null;
    if (liveEp) pushItem(liveEp, 'Live Player');

    const dlMap = Shared.getDownloadsMap ? Shared.getDownloadsMap() : {};
    Object.values(dlMap).forEach(ep => pushItem(ep, 'Offline Download'));

    try {
      const cached = JSON.parse(localStorage.getItem('anypod_cached_episodes') || '[]');
      if (Array.isArray(cached)) cached.slice(0, 80).forEach(ep => pushItem(ep, 'Library'));
    } catch (_) {}

    SAMPLE_BEATS.forEach(b => pushItem(b, 'Synth Beat'));

    const q = query.trim().toLowerCase();
    const filtered = q
      ? items.filter(i => i.title.toLowerCase().includes(q) || i.podcastTitle.toLowerCase().includes(q))
      : items;

    filtered.slice(0, 40).forEach(item => {
      const row = document.createElement('div');
      row.className = 'studio-track-row';
      row.innerHTML = `
        <div class="studio-track-meta">
          <div class="studio-track-title">${escapeHtml(item.title)}</div>
          <div class="studio-track-sub">${escapeHtml(item.podcastTitle)} • ${formatTime(item.durationSec)}</div>
        </div>
        <span class="btn-crate-mini">Load ✂️</span>
      `;
      row.addEventListener('click', () => {
        loadSourceIntoStudio(item);
        showToast(`Loaded "${item.title}" into Clipper`);
      });
      listEl.appendChild(row);
    });
  }

  function renderStudioBeatsList() {
    const cont = document.getElementById('studio-beats-list');
    if (!cont) return;
    cont.innerHTML = '';
    SAMPLE_BEATS.forEach(beat => {
      const row = document.createElement('div');
      row.className = 'studio-track-row';
      row.innerHTML = `
        <div class="studio-track-meta">
          <div class="studio-track-title">${escapeHtml(beat.title)}</div>
          <div class="studio-track-sub">${beat.bpm} BPM • Procedural Offline WAV</div>
        </div>
        <span class="btn-crate-mini">Load ✂️</span>
      `;
      row.addEventListener('click', () => {
        loadSourceIntoStudio(beat);
        showToast(`Loaded ${beat.title}`);
      });
      cont.appendChild(row);
    });
  }

  function renderLoopCrate() {
    const cont = document.getElementById('loop-crate-list');
    const countLbl = document.getElementById('crate-count-label');
    if (countLbl) countLbl.textContent = `${loopCrate.length} Loops`;
    if (!cont) return;
    cont.innerHTML = '';

    loopCrate.forEach((loop, idx) => {
      const card = document.createElement('div');
      card.className = 'crate-loop-card';
      const len = Math.max(1, (loop.endTimeSec || 20) - (loop.startTimeSec || 0));
      card.innerHTML = `
        <div class="crate-loop-top">
          <div>
            <div class="crate-loop-title">${escapeHtml(loop.title)}</div>
            <div class="crate-loop-meta">${loop.playbackMode === 'flow' ? '🌊 Flow' : `🔁 ${formatTime(loop.startTimeSec || 0)} → ${formatTime(loop.endTimeSec || 20)} (${Math.round(len)}s)`} • ${loop.bpm || 128} BPM</div>
          </div>
        </div>
        <div class="crate-loop-actions">
          <button type="button" class="btn-crate-mini" data-action="edit">✂️ Edit</button>
          <button type="button" class="btn-crate-mini" data-action="apply-work">⚡ Set All Work</button>
          <button type="button" class="btn-crate-mini" data-action="delete">🗑️</button>
        </div>
      `;

      card.querySelector('[data-action="edit"]').addEventListener('click', () => {
        loadSourceIntoStudio(loop);
        showToast(`Loaded "${loop.title}" into Clipper`);
      });

      card.querySelector('[data-action="apply-work"]').addEventListener('click', () => {
        applyLoopToAllWorkBlocks(loop);
      });

      card.querySelector('[data-action="delete"]').addEventListener('click', () => {
        loopCrate.splice(idx, 1);
        saveLoopCrate();
      });

      cont.appendChild(card);
    });
  }

  function applyLoopToAllWorkBlocks(loopObj) {
    routine.sections.forEach(sec => {
      sec.blocks.forEach(b => {
        if (b.type === 'work') {
          b.audioSegment = Object.assign({}, loopObj);
        }
      });
    });
    saveRoutine();
    renderBuilder();
    renderPlayer();
    showToast(`Applied "${loopObj.title}" to all WORK intervals!`);
  }

  // Export Sliced WAV Audio Loop from Studio
  async function exportStudioLoopAsWav() {
    const startSec = studio.inSec;
    const endSec = Math.max(startSec + 1, studio.outSec);
    const durSec = endSec - startSec;
    const sampleRate = 22050;
    const numSamples = Math.floor(sampleRate * durSec);
    const pcm = new Int16Array(numSamples);

    if (studio.audioBuffer) {
      const chan = studio.audioBuffer.getChannelData(0);
      const srcRate = studio.audioBuffer.sampleRate;
      for (let i = 0; i < numSamples; i++) {
        const srcIdx = Math.floor((startSec + i / sampleRate) * srcRate);
        const s = chan[srcIdx] || 0;
        pcm[i] = Math.max(-32767, Math.min(32767, Math.floor(s * 32767)));
      }
    } else {
      // Synthesize BPM beat slice fallback
      const bpm = parseInt(document.getElementById('studio-loop-bpm')?.value, 10) || 128;
      const beatSec = 60 / bpm;
      for (let i = 0; i < numSamples; i++) {
        const t = i / sampleRate;
        const beatFrac = ((t / beatSec) % 1);
        let sample = 0;
        if (beatFrac < 0.25) {
          const kt = beatFrac * beatSec;
          sample += Math.sin(2 * Math.PI * (150 * Math.exp(-kt * 30)) * kt) * Math.exp(-kt * 16) * 0.8;
        }
        pcm[i] = Math.max(-32767, Math.min(32767, Math.floor(sample * 28000)));
      }
    }

    const wavBuffer = new ArrayBuffer(44 + pcm.byteLength);
    const view = new DataView(wavBuffer);
    const writeStr = (off, str) => {
      for (let i = 0; i < str.length; i++) view.setUint8(off + i, str.charCodeAt(i));
    };
    writeStr(0, 'RIFF');
    view.setUint32(4, 36 + pcm.byteLength, true);
    writeStr(8, 'WAVE');
    writeStr(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    writeStr(36, 'data');
    view.setUint32(40, pcm.byteLength, true);
    new Uint8Array(wavBuffer, 44).set(new Uint8Array(pcm.buffer));

    const blob = new Blob([wavBuffer], { type: 'audio/wav' });
    const dl = document.createElement('a');
    dl.href = URL.createObjectURL(blob);
    const cleanName = (studio.source.title || 'workout_loop').toLowerCase().replace(/[^a-z0-9]+/g, '_');
    dl.download = `${cleanName}_${Math.round(startSec)}s_${Math.round(endSec)}s.wav`;
    document.body.appendChild(dl);
    dl.click();
    dl.remove();
    showToast('Downloaded sliced WAV training loop!');
  }

  // Sync Studio Loop to DJ Studio (dj.html) Hot Cues
  function syncStudioLoopToDjCues() {
    try {
      const raw = localStorage.getItem('anypod_dj_cues') || '{}';
      const cuesMap = JSON.parse(raw);
      const key = studio.source.sourceUrl || studio.source.title;
      const arr = Array.isArray(cuesMap[key]) ? cuesMap[key] : [null, null, null, null];
      arr[0] = Number(studio.inSec.toFixed(2));
      arr[1] = Number(studio.outSec.toFixed(2));
      cuesMap[key] = arr;
      localStorage.setItem('anypod_dj_cues', JSON.stringify(cuesMap));
      if (Shared.notifyStorageUpdated) Shared.notifyStorageUpdated();
      showToast('Synced IN/OUT cues to DJ Studio Hot Cues 1 & 2!');
    } catch (_) {}
  }

  // Auto-Slice Loaded Podcast / YouTube Video into a Complete 30-Minute Workout
  function generateAutoSlicedWorkout() {
    const totalMins = parseInt(document.getElementById('slicer-total-mins')?.value, 10) || 30;
    const splitStr = document.getElementById('slicer-interval-split')?.value || '40/20';
    const [workSec, restSec] = splitStr.split('/').map(n => parseInt(n, 10) || 30);
    const audioMode = document.getElementById('slicer-audio-mode')?.value || 'highlights';
    const restMode = document.getElementById('slicer-rest-mode')?.value || 'duck';

    const totalTargetSec = totalMins * 60;
    const warmupSec = totalMins >= 20 ? 180 : 60;
    const cooldownSec = totalMins >= 20 ? 180 : 60;
    const coreBudgetSec = Math.max(60, totalTargetSec - warmupSec - cooldownSec);
    const cycleSec = workSec + restSec;
    const rounds = Math.max(1, Math.round(coreBudgetSec / cycleSec));

    const srcDur = Math.max(60, studio.source.duration || 1800);
    const bpm = parseInt(document.getElementById('studio-loop-bpm')?.value, 10) || 128;

    let mainSection;

    if (audioMode === 'flow') {
      // Continuous Podcast/Mix Flow mode + Automatic Beat Overlay on Work
      audioEngine.beatOverlayEnabled = true;
      el.btnBeatOverlay?.classList.add('active-beat');

      const flowSeg = {
        id: 'flow_' + Date.now(),
        title: studio.source.title,
        podcastTitle: studio.source.podcastTitle,
        sourceUrl: studio.source.sourceUrl,
        videoId: studio.source.videoId,
        isYouTube: studio.source.isYouTube,
        bpm,
        startTimeSec: studio.inSec || 0,
        endTimeSec: srcDur,
        loop: false,
        playbackMode: 'flow',
        duckOnRest: restMode === 'duck'
      };

      mainSection = {
        id: 'sec_auto_flow',
        name: `Continuous Flow Intervals (${rounds} Rounds)`,
        repeatCount: rounds,
        blocks: [
          {
            id: 'b_af_work',
            type: 'work',
            label: `Work Interval + Beat Drive`,
            durationSec: workSec,
            cueOverlay: 'beeps',
            audioSegment: flowSeg
          },
          {
            id: 'b_af_rest',
            type: 'rest',
            label: restMode === 'duck' ? 'Active Recovery (Podcast Continues)' : 'Recovery Breather',
            durationSec: restSec,
            cueOverlay: 'beeps',
            audioSegment: restMode === 'duck' ? flowSeg : undefined
          }
        ]
      };
    } else {
      // Highlight Drops Mode: Extract distinct looped clips spaced across the source track
      const dropCount = Math.min(rounds, 8);
      const blocks = [];
      const usableSpan = Math.max(workSec, srcDur - studio.inSec - workSec);

      for (let i = 0; i < dropCount; i++) {
        const dropStart = Math.floor(studio.inSec + (usableSpan * (i / Math.max(1, dropCount))));
        const dropEnd = dropStart + Math.min(workSec, 45);
        const loopSeg = {
          id: `drop_${i}_${Date.now()}`,
          title: `${studio.source.title} [Drop #${i + 1}]`,
          podcastTitle: studio.source.podcastTitle,
          sourceUrl: studio.source.sourceUrl,
          videoId: studio.source.videoId,
          isYouTube: studio.source.isYouTube,
          bpm,
          startTimeSec: dropStart,
          endTimeSec: dropEnd,
          loop: true,
          playbackMode: 'loop'
        };

        blocks.push({
          id: `b_hd_w_${i}`,
          type: 'work',
          label: `High-Output Drop #${i + 1}`,
          durationSec: workSec,
          cueOverlay: 'beeps',
          audioSegment: loopSeg
        });
        blocks.push({
          id: `b_hd_r_${i}`,
          type: 'rest',
          label: 'Recovery & Reset',
          durationSec: restSec,
          cueOverlay: 'beeps',
          audioSegment: restMode === 'duck' ? Object.assign({}, loopSeg, { duckOnRest: true }) : undefined
        });
      }

      const sectionRepeats = Math.max(1, Math.round(rounds / dropCount));
      mainSection = {
        id: 'sec_auto_drops',
        name: `Sliced Highlight Loops (${rounds} Total Rounds)`,
        repeatCount: sectionRepeats,
        blocks
      };
    }

    routine = {
      id: 'auto_' + Date.now(),
      title: `${totalMins}-Min ${studio.source.title} Workout`,
      sections: [
        {
          id: 'sec_auto_warm',
          name: 'Warmup Prep',
          repeatCount: 1,
          blocks: [
            {
              id: 'b_aw_1',
              type: 'warmup',
              label: 'Dynamic Mobility & Heart-Rate Ramp',
              durationSec: warmupSec,
              cueOverlay: 'beeps',
              audioSegment: SAMPLE_BEATS[3]
            }
          ]
        },
        mainSection,
        {
          id: 'sec_auto_cool',
          name: 'Cooldown & Stretch',
          repeatCount: 1,
          blocks: [
            {
              id: 'b_ac_1',
              type: 'cooldown',
              label: 'Deep Breathing & Full-Body Decompression',
              durationSec: cooldownSec,
              cueOverlay: 'beeps'
            }
          ]
        }
      ]
    };

    saveRoutine();
    reset();
    switchTab('player');
    showToast(`Generated ${totalMins}-Minute Workout from "${studio.source.title}"!`);
  }

  // ───────────────────────────────────────────────────────────────────
  // 13. NAVIGATION & EVENT LISTENERS
  // ───────────────────────────────────────────────────────────────────
  function switchTab(targetTab) {
    stopStudioPreview();
    view = targetTab;

    el.viewPlayer.style.display = targetTab === 'player' ? 'flex' : 'none';
    el.viewBuilder.style.display = targetTab === 'builder' ? 'flex' : 'none';
    if (el.viewStudio) el.viewStudio.style.display = targetTab === 'studio' ? 'flex' : 'none';

    el.tabBtnPlayer?.classList.toggle('active', targetTab === 'player');
    el.tabBtnBuilder?.classList.toggle('active', targetTab === 'builder');
    el.tabBtnStudio?.classList.toggle('active', targetTab === 'studio');

    if (targetTab === 'builder') {
      renderBuilder();
    } else if (targetTab === 'studio') {
      renderStudioLibrary(document.getElementById('studio-library-search')?.value || '');
      renderStudioBeatsList();
      renderLoopCrate();
      setTimeout(() => renderStudioWaveform(), 30);
    } else {
      saveRoutine();
      renderPlayer();
    }
  }

  [el.tabBtnPlayer, el.tabBtnBuilder, el.tabBtnStudio].forEach(btn => {
    btn?.addEventListener('click', () => switchTab(btn.dataset.tab));
  });

  el.btnEditActiveLoop?.addEventListener('click', () => {
    const cur = timeline[currentIdx];
    if (cur?.block?.audioSegment) {
      loadSourceIntoStudio(cur.block.audioSegment);
    }
    switchTab('studio');
  });

  // Studio Controls Listeners
  document.querySelectorAll('.source-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.source-tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const tab = btn.dataset.srctab;
      document.getElementById('studio-src-library').style.display = tab === 'library' ? 'block' : 'none';
      document.getElementById('studio-src-url').style.display = tab === 'url' ? 'block' : 'none';
      document.getElementById('studio-src-local').style.display = tab === 'local' ? 'block' : 'none';
      document.getElementById('studio-src-beats').style.display = tab === 'beats' ? 'block' : 'none';
    });
  });

  document.getElementById('studio-library-search')?.addEventListener('input', (e) => {
    renderStudioLibrary(e.target.value);
  });

  document.getElementById('btn-studio-load-url')?.addEventListener('click', () => {
    const url = document.getElementById('studio-url-input')?.value?.trim();
    const title = document.getElementById('studio-url-title')?.value?.trim() || 'Custom Stream / Short';
    if (!url) return;
    loadSourceIntoStudio({
      title,
      podcastTitle: extractYouTubeId(url) ? 'YouTube / Shorts' : 'Direct Stream',
      sourceUrl: url,
      durationSec: isYouTubeShortUrl(url) ? 60 : 180
    });
    showToast(`Loaded URL into Clipper!`);
  });

  document.getElementById('studio-file-input')?.addEventListener('change', (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const blobUrl = URL.createObjectURL(file);
    loadSourceIntoStudio({
      title: file.name.replace(/\.[^.]+$/, ''),
      podcastTitle: 'Local File',
      sourceUrl: blobUrl,
      durationSec: 120
    });
    showToast(`Loaded local file "${file.name}"`);
  });

  document.querySelectorAll('.btn-loop-len').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.btn-loop-len').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const len = parseFloat(btn.dataset.looplen) || 20;
      studio.outSec = Math.min(studio.source.duration, studio.inSec + len);
      renderStudioWaveform();
    });
  });

  document.getElementById('btn-set-in')?.addEventListener('click', () => {
    studio.inSec = Math.max(0, Math.min(studio.outSec - 1, studio.playheadSec));
    renderStudioWaveform();
  });

  document.getElementById('btn-set-out')?.addEventListener('click', () => {
    if (studio.playheadSec > studio.inSec + 0.5) {
      studio.outSec = Math.min(studio.source.duration, studio.playheadSec);
      renderStudioWaveform();
    }
  });

  document.getElementById('btn-studio-preview')?.addEventListener('click', toggleStudioPreview);

  document.getElementById('btn-save-to-crate')?.addEventListener('click', () => {
    const loopObj = buildCurrentStudioLoopObject();
    loopCrate.unshift(loopObj);
    saveLoopCrate();
    showToast(`Saved "${loopObj.title}" to Loop Crate!`);
  });

  document.getElementById('btn-apply-all-work')?.addEventListener('click', () => {
    const loopObj = buildCurrentStudioLoopObject();
    loopCrate.unshift(loopObj);
    saveLoopCrate();
    applyLoopToAllWorkBlocks(loopObj);
  });

  document.getElementById('btn-export-wav')?.addEventListener('click', exportStudioLoopAsWav);
  document.getElementById('btn-sync-dj-cues')?.addEventListener('click', syncStudioLoopToDjCues);
  document.getElementById('btn-generate-30m-workout')?.addEventListener('click', generateAutoSlicedWorkout);

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

  // Preset Pickers
  document.querySelectorAll('.preset-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const key = btn.dataset.preset;
      if (TEMPLATES[key]) {
        routine = JSON.parse(JSON.stringify(TEMPLATES[key]));
        saveRoutine();
        reset();
        renderBuilder();
        showToast(`Loaded "${routine.title}"`);
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
        durationSec: 40,
        cueOverlay: 'beeps',
        audioSegment: SAMPLE_BEATS[0]
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

    const modeBtn = e.target.closest('.badge-playback-mode');
    if (modeBtn) {
      const sIdx = parseInt(modeBtn.dataset.sidx, 10);
      const bIdx = parseInt(modeBtn.dataset.bidx, 10);
      const seg = routine.sections[sIdx].blocks[bIdx].audioSegment;
      if (seg) {
        seg.playbackMode = seg.playbackMode === 'flow' ? 'loop' : 'flow';
        seg.loop = seg.playbackMode === 'loop';
        saveRoutine();
        renderBuilder();
      }
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
      repeatCount: 4,
      blocks: [
        { id: 'b_w_' + Date.now(), type: 'work', label: 'Max Effort', durationSec: 40, cueOverlay: 'beeps', audioSegment: SAMPLE_BEATS[0] },
        { id: 'b_r_' + Date.now(), type: 'rest', label: 'Transition / Rest', durationSec: 20, cueOverlay: 'beeps' }
      ]
    });
    saveRoutine();
    renderBuilder();
  });

  // ───────────────────────────────────────────────────────────────────
  // 14. AUDIO / LOOP ATTACHMENT MODAL
  // ───────────────────────────────────────────────────────────────────
  function openAudioModal() {
    // 0. Saved Custom Loops from Loop Crate
    if (el.modalCrateLoopsList) {
      el.modalCrateLoopsList.innerHTML = '';
      loopCrate.forEach(loop => {
        const d = document.createElement('div');
        d.className = 'modal-sample-item';
        d.innerHTML = `
          <div>
            <div class="sample-name" style="color:#d8b4fe;">${escapeHtml(loop.title)}</div>
            <div class="sample-sub">${loop.playbackMode === 'flow' ? '🌊 Continuous Flow' : `🔁 Loop ${formatTime(loop.startTimeSec || 0)} → ${formatTime(loop.endTimeSec || 20)}`} • ${loop.bpm || 128} BPM</div>
          </div>
          <span class="btn-sample-pick" style="color:#a855f7;">Select</span>
        `;
        d.addEventListener('click', () => {
          if (activeTargetBlock) {
            routine.sections[activeTargetBlock.sIdx].blocks[activeTargetBlock.bIdx].audioSegment = Object.assign({}, loop);
            saveRoutine();
            renderBuilder();
          }
          closeAudioModal();
        });
        el.modalCrateLoopsList.appendChild(d);
      });
    }

    // 1. Sample Beats
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
          routine.sections[activeTargetBlock.sIdx].blocks[activeTargetBlock.bIdx].audioSegment = Object.assign({}, beat);
          saveRoutine();
          renderBuilder();
        }
        closeAudioModal();
      });
      el.sampleBeatsList.appendChild(d);
    });

    // 2. Downloaded Episodes from app.js
    const downListEl = document.getElementById('modal-downloads-list');
    if (downListEl) {
      downListEl.innerHTML = '';
      const dMap = Shared.getDownloadsMap ? Shared.getDownloadsMap() : {};
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
                startTimeSec: 0,
                endTimeSec: 30,
                loop: true,
                playbackMode: 'loop'
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

    // 3. Live Episode from Main Anypod Player
    el.liveEpContainer.innerHTML = '';
    const liveEp = Shared.getLastActiveEpisode ? Shared.getLastActiveEpisode() : null;
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
            startTimeSec: 0,
            endTimeSec: 30,
            loop: true,
            playbackMode: 'flow'
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
    const title = el.inputDirectTitle.value.trim() || 'Custom Loop';
    const start = parseFloat(el.inputDirectStart.value) || 0;
    const end = parseFloat(el.inputDirectEnd?.value) || (start + 30);

    if (url && activeTargetBlock) {
      routine.sections[activeTargetBlock.sIdx].blocks[activeTargetBlock.bIdx].audioSegment = {
        id: 'url_' + Date.now(),
        title,
        podcastTitle: extractYouTubeId(url) ? 'YouTube / Shorts' : 'Direct Audio',
        sourceUrl: url,
        videoId: extractYouTubeId(url),
        isYouTube: Boolean(extractYouTubeId(url)),
        startTimeSec: start,
        endTimeSec: end > start ? end : start + 30,
        loop: true,
        playbackMode: 'loop'
      };
      saveRoutine();
      renderBuilder();
      closeAudioModal();
      el.inputDirectUrl.value = '';
      el.inputDirectTitle.value = '';
      el.inputDirectStart.value = '0';
      if (el.inputDirectEnd) el.inputDirectEnd.value = '30';
    }
  });

  // ───────────────────────────────────────────────────────────────────
  // 15. SHARE & EXPORT MODAL
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
  // 16. INITIAL RENDER & STORAGE BRIDGE
  // ───────────────────────────────────────────────────────────────────
  renderPlayer();
  renderBuilder();
  renderLoopCrate();
  rafId = requestAnimationFrame(tickLoop);

  if (Shared.initStorageBridge) {
    Shared.initStorageBridge({
      onUpdate: () => {
        if (el.modalAudio && el.modalAudio.style.display === 'flex') {
          openAudioModal();
        }
        if (view === 'studio') {
          renderStudioLibrary(document.getElementById('studio-library-search')?.value || '');
        }
      }
    });
  }
})();
