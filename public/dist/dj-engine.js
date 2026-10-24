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
  const ANALYSIS_CACHE_KEY = 'anypod_dj_analysis_cache';

  // 12 Musical Pitch Classes & Camelot / Traktor OpenKey mappings
  const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

  const MAJOR_KEYS = [
    { note: 'C', camelot: '8B', openKey: '1d' },
    { note: 'Db', camelot: '3B', openKey: '8d' },
    { note: 'D', camelot: '10B', openKey: '3d' },
    { note: 'Eb', camelot: '5B', openKey: '10d' },
    { note: 'E', camelot: '12B', openKey: '5d' },
    { note: 'F', camelot: '7B', openKey: '12d' },
    { note: 'F#', camelot: '2B', openKey: '7d' },
    { note: 'G', camelot: '9B', openKey: '2d' },
    { note: 'Ab', camelot: '4B', openKey: '9d' },
    { note: 'A', camelot: '11B', openKey: '4d' },
    { note: 'Bb', camelot: '6B', openKey: '11d' },
    { note: 'B', camelot: '1B', openKey: '6d' }
  ];

  const MINOR_KEYS = [
    { note: 'Cm', camelot: '5A', openKey: '10m' },
    { note: 'C#m', camelot: '12A', openKey: '5m' },
    { note: 'Dm', camelot: '7A', openKey: '12m' },
    { note: 'Ebm', camelot: '2A', openKey: '7m' },
    { note: 'Em', camelot: '9A', openKey: '2m' },
    { note: 'Fm', camelot: '4A', openKey: '9m' },
    { note: 'F#m', camelot: '11A', openKey: '4m' },
    { note: 'Gm', camelot: '6A', openKey: '11m' },
    { note: 'G#m', camelot: '1A', openKey: '6m' },
    { note: 'Am', camelot: '8A', openKey: '1m' },
    { note: 'Bbm', camelot: '3A', openKey: '8m' },
    { note: 'Bm', camelot: '10A', openKey: '3m' }
  ];

  // Krumhansl-Schmuckler Key-Finding Profiles
  const MAJOR_PROFILE = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
  const MINOR_PROFILE = [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];

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

  /**
   * Vinyl Scratch Audio Synthesizer
   * Procedural pink-groove friction noise + velocity-tracked formant bandpass filter
   * and stylus tip resonance ring oscillator.
   */
  class VinylScratchAudio {
    constructor(ctx, destNode) {
      this.ctx = ctx;
      this.dest = destNode;

      // 1. Friction noise buffer (pink/brown noise characteristic of vinyl needle in runout)
      const bufLen = Math.min(this.ctx.sampleRate * 2, 96000);
      const noiseBuf = this.ctx.createBuffer(1, bufLen, this.ctx.sampleRate);
      const data = noiseBuf.getChannelData(0);
      let b0 = 0, b1 = 0, b2 = 0;
      for (let i = 0; i < bufLen; i++) {
        const white = Math.random() * 2 - 1;
        b0 = 0.99886 * b0 + white * 0.0555179;
        b1 = 0.99332 * b1 + white * 0.0750759;
        b2 = 0.96900 * b2 + white * 0.1538520;
        data[i] = (b0 + b1 + b2 + white * 0.5362) * 0.14;
      }

      this.noiseSource = this.ctx.createBufferSource();
      this.noiseSource.buffer = noiseBuf;
      this.noiseSource.loop = true;

      // 2. Resonant bandpass filter for the vinyl formant "wicky" tone (swept by hand speed)
      this.filter = this.ctx.createBiquadFilter();
      this.filter.type = 'bandpass';
      this.filter.frequency.value = 850;
      this.filter.Q.value = 4.2;

      // 3. Highpass to strip sub-rumble below 140Hz
      this.hpf = this.ctx.createBiquadFilter();
      this.hpf.type = 'highpass';
      this.hpf.frequency.value = 140;

      // 4. Scratch gain envelope
      this.gain = this.ctx.createGain();
      this.gain.gain.value = 0.0;

      // 5. Stylus tip resonance oscillator
      this.osc = this.ctx.createOscillator();
      this.osc.type = 'sawtooth';
      this.osc.frequency.value = 220;

      this.oscGain = this.ctx.createGain();
      this.oscGain.gain.value = 0.08;

      this.osc.connect(this.oscGain);
      this.oscGain.connect(this.filter);
      this.noiseSource.connect(this.filter);
      this.filter.connect(this.hpf);
      this.hpf.connect(this.gain);
      this.gain.connect(this.dest);

      try {
        this.noiseSource.start();
        this.osc.start();
      } catch (_) {}
    }

    update(velocity, isReverse) {
      if (!this.ctx || this.ctx.state !== 'running') return;
      const now = this.ctx.currentTime;
      const absV = Math.abs(velocity);

      if (absV < 0.03) {
        this.gain.gain.setTargetAtTime(0.0001, now, 0.02);
        return;
      }

      // Velocity scales resonant filter frequency between 350Hz and 3400Hz
      const targetFreq = Math.min(3400, Math.max(350, 600 + absV * 1100));
      this.filter.frequency.setTargetAtTime(targetFreq, now, 0.012);

      // Oscillator pitch shifts with velocity
      const targetOscFreq = Math.min(720, Math.max(90, 140 + absV * 220));
      this.osc.frequency.setTargetAtTime(targetOscFreq, now, 0.012);

      // Volume scales with velocity, with slight boost on reverse cuts
      const baseGain = isReverse ? 0.38 : 0.26;
      const targetGain = Math.min(0.65, Math.max(0.05, absV * baseGain));
      this.gain.gain.setTargetAtTime(targetGain, now, 0.015);
    }

    silence() {
      if (!this.ctx) return;
      this.gain.gain.setTargetAtTime(0.0001, this.ctx.currentTime, 0.025);
    }
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
      this.masterDeckId = null; // 'A' | 'B' | null (Master Clock)
      this.deckSync = { A: false, B: false };
      this.vinylMode = { A: true, B: true };
      this.snapEnabled = true;
      this.quantEnabled = true;

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

      // Master Output Stage
      this.masterOut = this.ctx.createGain();
      this.masterOut.gain.value = 0.85; // 85% default master volume
      this.masterAnalyser.connect(this.masterOut);

      // Headphone Cue / PFL Monitoring Bus
      this.pflEnabled = { A: false, B: false };
      this.cueMix = 0.0; // 0.0 = 100% Cue, 1.0 = 100% Master
      this.cueVolume = 0.85; // 85% default cue volume
      this.cueMode = 'stereo'; // 'stereo' | 'split' | 'multichannel'

      this.cueBus = this.ctx.createGain();
      this.cueBus.gain.value = 1.0;

      this.cueMixGain = this.ctx.createGain();
      this.cueMixGain.gain.value = 1.0; // Pure Cue initially

      this.masterCueGain = this.ctx.createGain();
      this.masterCueGain.gain.value = 0.0; // No Master initially

      this.headphoneBus = this.ctx.createGain();
      this.headphoneBus.gain.value = this.cueVolume;

      this.cueBus.connect(this.cueMixGain);
      this.master.connect(this.masterCueGain);
      this.cueMixGain.connect(this.headphoneBus);
      this.masterCueGain.connect(this.headphoneBus);

      // Audio Routing Nodes for Split & Multi-channel
      this.splitMerger = null;
      this.cueMonoGain = null;
      this.masterMonoGain = null;
      this.multiMerger = null;

      // Modular Audio FX Processors
      this.masterBpm = 128.0;
      this.reverbBuffer = this._createReverbImpulseResponse(2.5, 2.6);
      this.fxUnits = {
        '1': this._buildFXUnit1('A'),
        '2': this._buildFXUnit2('B')
      };

      this.decks = {};
      DECKS.forEach((id) => this._buildDeck(id));
      this.setCrossfader(0.5, true);
      this._updateFXDryWetMix('1');
      this._updateFXDryWetMix('2');
      this._updateFXTempo();
      this._updateAudioRouting();

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
      this._setupMediaSessionHandlers();
    }

    _createReverbImpulseResponse(durationSec = 2.4, decay = 2.8) {
      try {
        const rate = this.ctx.sampleRate;
        const length = Math.floor(rate * durationSec);
        const buffer = this.ctx.createBuffer(2, length, rate);
        const left = buffer.getChannelData(0);
        const right = buffer.getChannelData(1);

        for (let i = 0; i < length; i++) {
          const t = i / rate;
          const env = Math.exp(-decay * t);
          const damping = Math.exp(-t * 1.8);
          left[i] = (Math.random() * 2 - 1) * env * damping;
          right[i] = (Math.random() * 2 - 1) * env * damping;
        }
        return buffer;
      } catch (err) {
        console.warn('[dj-engine] failed to generate reverb impulse:', err);
        return null;
      }
    }

    _buildFXUnit1(deckId) {
      const ctx = this.ctx;
      const input = ctx.createGain();
      const output = ctx.createGain();
      const dryGain = ctx.createGain();
      const wetGain = ctx.createGain();

      input.connect(dryGain);
      dryGain.connect(output);

      // FX 1 Wet Chain: input -> DLY stage -> REV stage -> wetGain -> output
      const chainInput = ctx.createGain();
      input.connect(chainInput);

      // --- Delay (DLY): Tempo-synchronized feedback delay ---
      const dlyIn = ctx.createGain();
      const dlyOut = ctx.createGain();
      const dlySend = ctx.createGain();
      const dlyDirect = ctx.createGain();
      dlyDirect.gain.value = 1.0;
      const dlyWet = ctx.createGain();
      dlyWet.gain.value = 1.0;

      const delayNode = ctx.createDelay(5.0);
      const dlyFeedback = ctx.createGain();
      dlyFeedback.gain.value = 0.48; // Musical echo feedback
      const dlyFilter = ctx.createBiquadFilter();
      dlyFilter.type = 'lowpass';
      dlyFilter.frequency.value = 3800; // Analog tape damping

      chainInput.connect(dlyIn);
      dlyIn.connect(dlyDirect);
      dlyDirect.connect(dlyOut);

      dlyIn.connect(dlySend);
      dlySend.connect(delayNode);
      delayNode.connect(dlyFilter);
      dlyFilter.connect(dlyFeedback);
      dlyFeedback.connect(delayNode);
      dlyFilter.connect(dlyWet);
      dlyWet.connect(dlyOut);

      // Default: DLY active
      dlySend.gain.value = 1.0;

      // --- Reverb (REV): ConvolverNode impulse response for spatial transitions ---
      const revIn = ctx.createGain();
      const revOut = ctx.createGain();
      const revSend = ctx.createGain();
      const revDirect = ctx.createGain();
      revDirect.gain.value = 1.0;
      const revWet = ctx.createGain();
      revWet.gain.value = 0.85;

      const convolver = ctx.createConvolver();
      if (this.reverbBuffer) convolver.buffer = this.reverbBuffer;
      const revHPF = ctx.createBiquadFilter();
      revHPF.type = 'highpass';
      revHPF.frequency.value = 180;
      const revLPF = ctx.createBiquadFilter();
      revLPF.type = 'lowpass';
      revLPF.frequency.value = 7500;

      dlyOut.connect(revIn);
      revIn.connect(revDirect);
      revDirect.connect(revOut);

      revIn.connect(revSend);
      revSend.connect(revHPF);
      revHPF.connect(revLPF);
      revLPF.connect(convolver);
      convolver.connect(revWet);
      revWet.connect(revOut);

      // Default: REV inactive
      revSend.gain.value = 0.0;

      revOut.connect(wetGain);
      wetGain.connect(output);

      return {
        unitId: '1',
        deckId,
        input,
        output,
        dryGain,
        wetGain,
        dryWet: 20,
        enabled: true,
        effects: {
          delay: {
            active: true,
            subdivision: '3/4',
            node: delayNode,
            sendNode: dlySend,
            wetNode: dlyWet
          },
          reverb: {
            active: false,
            sendNode: revSend,
            wetNode: revWet,
            convolver
          }
        }
      };
    }

    _buildFXUnit2(deckId) {
      const ctx = this.ctx;
      const input = ctx.createGain();
      const output = ctx.createGain();
      const dryGain = ctx.createGain();
      const wetGain = ctx.createGain();

      input.connect(dryGain);
      dryGain.connect(output);

      // FX 2 Wet Chain: input -> FLT stage -> GATE stage -> wetGain -> output
      const chainInput = ctx.createGain();
      input.connect(chainInput);

      // --- Filter Sweep (FLT): Resonant bandpass filter modulated across spectrum ---
      const fltIn = ctx.createGain();
      const fltOut = ctx.createGain();
      const fltBypass = ctx.createGain();
      fltBypass.gain.value = 0.0;
      const fltActive = ctx.createGain();
      fltActive.gain.value = 1.0;

      const bpFilter = ctx.createBiquadFilter();
      bpFilter.type = 'bandpass';
      bpFilter.Q.value = 3.8;
      bpFilter.frequency.value = 1500;

      const fltMakeup = ctx.createGain();
      fltMakeup.gain.value = 2.0;

      const fltLfo = ctx.createOscillator();
      fltLfo.type = 'triangle';
      const fltLfoGain = ctx.createGain();
      fltLfoGain.gain.value = 1100; // Sweeps ~400Hz to ~2600Hz
      fltLfo.connect(fltLfoGain);
      fltLfoGain.connect(bpFilter.frequency);
      try { fltLfo.start(); } catch (_) {}

      chainInput.connect(fltIn);
      fltIn.connect(fltBypass);
      fltBypass.connect(fltOut);

      fltIn.connect(bpFilter);
      bpFilter.connect(fltMakeup);
      fltMakeup.connect(fltActive);
      fltActive.connect(fltOut);

      // --- Beat Gater (GATE): Square-wave LFO ducking volume to 1/8th or 1/16th notes ---
      const gateIn = ctx.createGain();
      const gateOut = ctx.createGain();
      const gateBypass = ctx.createGain();
      gateBypass.gain.value = 1.0;
      const gateActive = ctx.createGain();
      gateActive.gain.value = 0.0;
      const gateVca = ctx.createGain();
      gateVca.gain.value = 0.0;

      const gateLfo = ctx.createOscillator();
      gateLfo.type = 'square';
      const gateScale = ctx.createGain();
      gateScale.gain.value = 0.5;
      gateLfo.connect(gateScale);
      gateScale.connect(gateVca.gain);

      if (ctx.createConstantSource) {
        const constSource = ctx.createConstantSource();
        constSource.offset.value = 0.5;
        constSource.connect(gateVca.gain);
        try { constSource.start(); } catch (_) {}
      } else {
        gateVca.gain.value = 0.5;
      }
      try { gateLfo.start(); } catch (_) {}

      fltOut.connect(gateIn);
      gateIn.connect(gateBypass);
      gateBypass.connect(gateOut);

      gateIn.connect(gateVca);
      gateVca.connect(gateActive);
      gateActive.connect(gateOut);

      gateOut.connect(wetGain);
      wetGain.connect(output);

      return {
        unitId: '2',
        deckId,
        input,
        output,
        dryGain,
        wetGain,
        dryWet: 35,
        enabled: true,
        effects: {
          filter: {
            active: true,
            filterNode: bpFilter,
            lfoNode: fltLfo,
            bypassNode: fltBypass,
            activeNode: fltActive
          },
          gater: {
            active: false,
            rate: '1/8',
            lfoNode: gateLfo,
            bypassNode: gateBypass,
            activeNode: gateActive
          }
        }
      };
    }

    _updateFXDryWetMix(unitId) {
      const u = this.fxUnits[String(unitId)];
      if (!u) return;
      const now = this.ctx.currentTime;
      if (!u.enabled) {
        u.dryGain.gain.setTargetAtTime(1.0, now, 0.015);
        u.wetGain.gain.setTargetAtTime(0.0, now, 0.015);
        return;
      }
      const norm = Math.max(0, Math.min(100, u.dryWet)) / 100;
      // Equal-power crossfade between Dry and Wet paths
      const gDry = Math.cos(norm * Math.PI / 2);
      const gWet = Math.sin(norm * Math.PI / 2);
      u.dryGain.gain.setTargetAtTime(gDry, now, 0.015);
      u.wetGain.gain.setTargetAtTime(gWet, now, 0.015);
    }

    setBpm(bpm) {
      if (!bpm || bpm < 40 || bpm > 260) return;
      this.masterBpm = bpm;
      this._updateFXTempo();
    }

    _updateFXTempo() {
      const bpm = this.masterBpm || 128;
      const beatSec = 60 / bpm;
      const now = this.ctx.currentTime;

      // FX 1 Delay update
      const u1 = this.fxUnits['1'];
      if (u1 && u1.effects.delay && u1.effects.delay.node) {
        const sub = u1.effects.delay.subdivision || '3/4';
        let mult = 0.75;
        if (sub === '1/2') mult = 0.5;
        else if (sub === '1/1' || sub === '1') mult = 1.0;
        const dTime = Math.max(0.05, Math.min(4.0, beatSec * mult));
        u1.effects.delay.node.delayTime.setTargetAtTime(dTime, now, 0.05);
      }

      // FX 2 Filter & Gater update
      const u2 = this.fxUnits['2'];
      if (u2) {
        if (u2.effects.filter && u2.effects.filter.lfoNode) {
          // Resonant filter sweep across 2 bars (8 beats)
          const sweepFreq = Math.max(0.05, (bpm / 60) / 8);
          u2.effects.filter.lfoNode.frequency.setTargetAtTime(sweepFreq, now, 0.05);
        }
        if (u2.effects.gater && u2.effects.gater.lfoNode) {
          const rate = u2.effects.gater.rate || '1/8';
          const multiplier = rate === '1/16' ? 4 : 2;
          const gateFreq = (bpm / 60) * multiplier;
          u2.effects.gater.lfoNode.frequency.setTargetAtTime(gateFreq, now, 0.02);
        }
      }
    }

    setFXDryWet(unitId, pct) {
      const u = this.fxUnits[String(unitId)];
      if (!u) return;
      u.dryWet = Math.max(0, Math.min(100, parseFloat(pct) || 0));
      this._updateFXDryWetMix(String(unitId));
    }

    setFXEnabled(unitId, isEnabled) {
      const u = this.fxUnits[String(unitId)];
      if (!u) return;
      u.enabled = Boolean(isEnabled);
      this._updateFXDryWetMix(String(unitId));
    }

    setFXEffect(unitId, effectName, isActive) {
      const u = this.fxUnits[String(unitId)];
      if (!u || !u.effects[effectName]) return;
      u.effects[effectName].active = Boolean(isActive);
      const eff = u.effects[effectName];
      const now = this.ctx.currentTime;

      // Handle bypass/send nodes
      if (eff.sendNode) {
        eff.sendNode.gain.setTargetAtTime(eff.active ? 1.0 : 0.0, now, 0.02);
      }
      if (eff.bypassNode && eff.activeNode) {
        eff.bypassNode.gain.setTargetAtTime(eff.active ? 0.0 : 1.0, now, 0.02);
        eff.activeNode.gain.setTargetAtTime(eff.active ? 1.0 : 0.0, now, 0.02);
      }
      this._updateFXDryWetMix(String(unitId));
    }

    setFXParam(unitId, effectName, paramName, paramValue) {
      const u = this.fxUnits[String(unitId)];
      if (!u || !u.effects[effectName]) return;
      u.effects[effectName][paramName] = paramValue;
      this._updateFXTempo();
    }

    getFXParam(unitId, effectName, paramName) {
      const u = this.fxUnits[String(unitId)];
      if (!u || !u.effects[effectName]) return null;
      return u.effects[effectName][paramName] ?? null;
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

      // FX Unit routing: filter -> fxUnit -> gainVol
      const fx = id === 'A' ? this.fxUnits['1'] : this.fxUnits['2'];

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
        filter.connect(fx.input);
        fx.output.connect(gainVol);
        gainVol.connect(gainCross);
        gainCross.connect(analyser);
        analyser.connect(this.master);
      }

      // Headphone Cue / PFL tap (Pre-Volume Fader & Pre-Crossfader)
      const pflGain = this.ctx.createGain();
      pflGain.gain.value = 0.0;
      fx.output.connect(pflGain);
      pflGain.connect(this.cueBus);

      // Vinyl Scratch Audio Synthesizer (groove friction + formant filter)
      let scratchSynth = null;
      try {
        scratchSynth = new VinylScratchAudio(this.ctx, gainVol);
        scratchSynth.gain.connect(pflGain);
      } catch (err) {
        console.warn(`[dj-engine] failed to init VinylScratchAudio for deck ${id}:`, err);
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
        pflGain,
        scratchSynth,
        isScratching: false,
        wasPlayingBeforeScratch: false,
        isNudging: false,
        savedRateBeforeNudge: 1.0,
        meta: null,
        cues: [null, null, null, null],
        ytPlayer: null,
        ytReady: false,
        ytVideoId: null,
        engine: 'audio', // 'audio' | 'youtube'
        loop: { active: false, start: 0, end: 0, beats: 4 },
        playbackRate: 1.0,
        baseBpm: 128.0
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
        if (deck.engine === 'audio') {
          this._emit('state', { deck: id, playing: true });
          this._setMediaSession(deck, true);
        }
      });
      audio.addEventListener('playing', () => {
        if (deck.engine === 'audio') {
          this._setMediaSession(deck, true);
        }
      });
      audio.addEventListener('canplay', () => {
        if (deck.engine === 'audio' && !audio.paused) {
          this._setMediaSession(deck, true);
        }
      });
      audio.addEventListener('loadedmetadata', () => {
        if (deck.engine === 'audio') {
          this._emit('loaded', { deck: id, duration: audio.duration });
          this._setMediaSession(deck, true);
        }
      });
      audio.addEventListener('pause', () => {
        if (deck.engine === 'audio') {
          this._emit('state', { deck: id, playing: false });
          if (!this.isPlaying('A') && !this.isPlaying('B') && 'mediaSession' in navigator) {
            navigator.mediaSession.playbackState = 'paused';
          }
        }
      });
      audio.addEventListener('ended', () => {
        if (deck.engine === 'audio') {
          this._emit('state', { deck: id, playing: false, ended: true });
          if (!this.isPlaying('A') && !this.isPlaying('B') && 'mediaSession' in navigator) {
            navigator.mediaSession.playbackState = 'paused';
          }
        }
      });
      audio.addEventListener('error', () => {
        if (deck.engine === 'audio') {
          const rawUrl = deck.meta?.url;
          console.warn(`[dj-engine] Audio error on deck ${id}:`, audio.error?.message, audio.src);
          // If direct CDN stream failed with format or CORS error, try audio-proxy fallback once:
          if (rawUrl && !audio.src.includes('/api/audio-proxy') && !deck.hasTriedProxy) {
            deck.hasTriedProxy = true;
            console.log(`[dj-engine] Deck ${id} switching to /api/audio-proxy fallback`);
            audio.src = '/api/audio-proxy?url=' + encodeURIComponent(rawUrl);
            audio.play().catch(() => {});
            return;
          }
          console.warn(`[dj-engine] Deck ${id} stream unplayable.`);
          this._emit('error', { deck: id });
        }
      });

      this.decks[id] = deck;
    }

    on(evt, fn) { (this.listeners[evt] = this.listeners[evt] || []).push(fn); }
    _emit(evt, data) { (this.listeners[evt] || []).forEach((fn) => fn(data)); }

    _resolveUrl(url) {
      if (!url) return '';
      try {
        const u = new URL(url, location.href);
        return u.href;
      } catch (_) { return url; }
    }

    /**
     * Loads a track into Deck A or B.
     * Intelligently routes between HTML5 Audio and YouTube Iframe Engine.
     */
    loadTrack(deckId, track) {
      const d = this.decks[deckId];
      if (!d) return;

      d.hasTriedProxy = false;
      const rawUrl = track.audioUrl || track.url || '';
      const ytId = track.videoId || extractYouTubeId(rawUrl);
      const isYt = !!track.isYouTube || !!ytId;
      const trackKey = rawUrl || track.guid || ytId || track.title;

      const cached = this.getAnalysisFromCache(trackKey);
      const initialBpm = cached ? cached.bpm : (track.bpm || 126.0);
      const initialKey = cached ? (cached.camelot || cached.key) : (track.key || '8m');

      d.meta = Object.assign({
        title: track.title || 'Untitled Track',
        podcastTitle: track.podcastTitle || track.author || '',
        artwork: track.artwork || '',
        duration: track.duration || 0,
        bpm: initialBpm,
        key: initialKey,
        camelot: cached ? cached.camelot : (track.key || '8m'),
        url: rawUrl,
        isYouTube: isYt,
        videoId: ytId
      }, track);

      d.cues = this._loadCues(d.meta.url || d.meta.guid || d.meta.title);
      d.baseBpm = initialBpm;
      d.playbackRate = 1.0;
      d.loop.active = false;
      d.loop.beats = 4;
      this._emit('loop', { deck: deckId, active: false, beats: 4, start: 0, end: 0 });
      if (this.deckSync[deckId]) {
        this._syncDeckToMaster(deckId);
      }

      // If not cached, trigger automatic background analysis
      if (!cached) {
        this.analyzeTrack(d.meta, deckId);
      }

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

        // Offline Cache: Check Cache API (anypod-audio-v1) for downloaded audio files
        if ('caches' in window && rawUrl) {
          caches.open('anypod-audio-v1').then(async (cache) => {
            const match = await cache.match(rawUrl);
            if (match) {
              const blob = await match.blob();
              const blobUrl = URL.createObjectURL(blob);
              if (d.meta && d.meta.url === rawUrl) {
                d.audio.src = blobUrl;
              }
            }
          }).catch(() => {});
        }
      }

      this._setMediaSession(d);
      this._emit('track', { deck: deckId, meta: d.meta, cues: d.cues.slice(), engine: d.engine });
      if (cached) {
        this._emit('analyzed', {
          deckId,
          trackKey,
          track: d.meta,
          bpm: cached.bpm,
          key: cached.key,
          camelot: cached.camelot,
          openKey: cached.openKey,
          confidence: cached.confidence || 100
        });
      }
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
              if (isPlaying) {
                this._setMediaSession(d, true);
              } else if ((state === global.YT.PlayerState.PAUSED || state === global.YT.PlayerState.ENDED) && !this.isPlaying('A') && !this.isPlaying('B') && 'mediaSession' in navigator) {
                navigator.mediaSession.playbackState = 'paused';
              }
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
      if (this._resume) this._resume();
      const d = this.decks[deckId];
      if (!d) return;

      const otherId = deckId === 'A' ? 'B' : 'A';
      const refDeckId = (this.masterDeckId && this.masterDeckId !== deckId) ? this.masterDeckId : (this.isPlaying(otherId) ? otherId : null);

      if (this.quantEnabled && refDeckId && this.isPlaying(refDeckId)) {
        const refBpm = this.getDeckEffectiveBpm(refDeckId);
        const beatSec = 60 / refBpm;
        const refCur = this.getCurrentTime(refDeckId);
        const nextBeat = Math.ceil(refCur / beatSec) * beatSec;
        const waitMs = Math.max(0, (nextBeat - refCur) * 1000);
        if (waitMs > 20 && waitMs < (beatSec * 1000)) {
          setTimeout(() => {
            this._startPlaybackDirect(deckId);
          }, waitMs);
          return;
        }
      }
      return this._startPlaybackDirect(deckId);
    }

    _startPlaybackDirect(deckId) {
      const d = this.decks[deckId];
      if (!d) return;
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
      if (!d) return;
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
      if (!d) return;
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
      if (!d) return;
      d.playbackRate = r;
      if (d.isNudging) {
        d.savedRateBeforeNudge = r;
      }
      if (d.engine === 'youtube') {
        if (d.ytPlayer && typeof d.ytPlayer.setPlaybackRate === 'function') {
          d.ytPlayer.setPlaybackRate(r);
        }
      } else {
        d.audio.preservesPitch = keepPitch;
        d.audio.playbackRate = r;
      }
      this._emit('rate', { deck: deckId, rate: r, bpm: this.getDeckEffectiveBpm(deckId) });
      if (this.masterDeckId === deckId) {
        this._syncSlavedDecks();
      }
      if (d.loop.active) {
        const beatSec = 60 / this.getDeckEffectiveBpm(deckId);
        d.loop.end = d.loop.start + (beatSec * d.loop.beats);
      }
    }

    /**
     * Vinyl Mode Toggle (Scratch when active, Jog Pitch-Bend when inactive)
     */
    setVinylMode(deckId, active) {
      this.vinylMode[deckId] = !!active;
      this._emit('vinylMode', { deck: deckId, active: this.vinylMode[deckId] });
    }

    isVinylMode(deckId) {
      return !!this.vinylMode[deckId];
    }

    /**
     * Pitch Bend Nudge: Momentary ±5% tempo push/pull while button or key held
     * @param {'A'|'B'} deckId
     * @param {number} direction +1 (speed up 5%) or -1 (slow down 5%)
     */
    nudge(deckId, direction) {
      const d = this.decks[deckId];
      if (!d || d.isNudging) return;
      d.savedRateBeforeNudge = d.playbackRate || 1.0;
      d.isNudging = true;
      const factor = direction > 0 ? 1.05 : 0.95;
      const nudgedRate = Math.min(2.0, Math.max(0.5, d.savedRateBeforeNudge * factor));
      d.playbackRate = nudgedRate;

      if (d.engine === 'youtube') {
        if (d.ytPlayer && typeof d.ytPlayer.setPlaybackRate === 'function') {
          try { d.ytPlayer.setPlaybackRate(nudgedRate); } catch (_) {}
        }
      } else {
        d.audio.preservesPitch = false;
        d.audio.playbackRate = nudgedRate;
      }

      this._emit('nudge', {
        deck: deckId,
        nudging: true,
        direction,
        factor,
        rate: nudgedRate,
        originalRate: d.savedRateBeforeNudge
      });
    }

    /**
     * Release Pitch Bend Nudge: Restores exact original playback rate
     */
    releaseNudge(deckId) {
      const d = this.decks[deckId];
      if (!d || !d.isNudging) return;
      d.isNudging = false;
      const originalRate = d.savedRateBeforeNudge || 1.0;
      d.playbackRate = originalRate;

      if (d.engine === 'youtube') {
        if (d.ytPlayer && typeof d.ytPlayer.setPlaybackRate === 'function') {
          try { d.ytPlayer.setPlaybackRate(originalRate); } catch (_) {}
        }
      } else {
        d.audio.preservesPitch = true;
        d.audio.playbackRate = originalRate;
      }

      this._emit('nudge', {
        deck: deckId,
        nudging: false,
        rate: originalRate
      });
    }

    /**
     * Touch Jog Platter / Waveform Vinyl Scratch: Start
     */
    startScratch(deckId) {
      const d = this.decks[deckId];
      if (!d) return;
      if (this._resume) this._resume();
      d.isScratching = true;
      d.wasPlayingBeforeScratch = this.isPlaying(deckId);
      if (d.engine === 'audio') {
        d.audio.preservesPitch = false;
      }
      this._emit('scratch', { deck: deckId, scratching: true });
    }

    /**
     * Touch Jog Platter / Waveform Vinyl Scratch: Scrub
     * @param {'A'|'B'} deckId
     * @param {number} deltaSec audio offset difference in seconds
     * @param {number} velocity hand dragging velocity (signed, normalized to 1.0 = normal speed)
     */
    scratch(deckId, deltaSec, velocity = 0) {
      const d = this.decks[deckId];
      if (!d || !d.isScratching) return;
      const dur = this.getDuration(deckId) || 0;
      const cur = this.getCurrentTime(deckId);
      const newTime = Math.max(0, Math.min(dur || 99999, cur + deltaSec));

      const absV = Math.abs(velocity);
      if (d.engine === 'audio') {
        if (isFinite(newTime)) {
          d.audio.currentTime = newTime;
        }
        if (d.scratchSynth) {
          d.scratchSynth.update(velocity, velocity < 0);
        }
        if (velocity > 0.04) {
          // Forward scrub: pitch-bend audio track naturally with hand speed
          d.audio.playbackRate = Math.min(3.5, Math.max(0.15, absV));
          if (d.audio.paused) {
            d.audio.play().catch(() => {});
          }
        } else if (velocity < -0.04) {
          // Reverse cut: HTML5 audio cannot play backward, pause audio element;
          // procedural VinylScratchAudio renders resonant needle friction sound
          if (!d.audio.paused) {
            d.audio.pause();
          }
        } else {
          // Hand held still on vinyl (needle held in groove)
          if (!d.audio.paused) {
            d.audio.pause();
          }
        }
      } else {
        // YouTube engine
        if (d.ytPlayer && typeof d.ytPlayer.seekTo === 'function') {
          d.ytPlayer.seekTo(newTime, true);
        }
      }

      this._emit('time', { deck: deckId, currentTime: newTime, duration: dur });
      this._emit('scratch', { deck: deckId, scratching: true, velocity, time: newTime });
    }

    /**
     * Touch Jog Platter / Waveform Vinyl Scratch: End / Release
     */
    endScratch(deckId) {
      const d = this.decks[deckId];
      if (!d || !d.isScratching) return;
      d.isScratching = false;
      if (d.scratchSynth) {
        d.scratchSynth.silence();
      }

      if (d.engine === 'audio') {
        d.audio.preservesPitch = true;
        d.audio.playbackRate = d.playbackRate || 1.0;
        if (d.wasPlayingBeforeScratch) {
          d.audio.play().catch(() => {});
        } else {
          d.audio.pause();
        }
      } else {
        if (d.wasPlayingBeforeScratch && d.ytPlayer && typeof d.ytPlayer.playVideo === 'function') {
          d.ytPlayer.playVideo();
        } else if (!d.wasPlayingBeforeScratch && d.ytPlayer && typeof d.ytPlayer.pauseVideo === 'function') {
          d.ytPlayer.pauseVideo();
        }
      }

      this._emit('scratch', { deck: deckId, scratching: false });
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
      let cur = this.getCurrentTime(deckId);
      if (this.snapEnabled) {
        const beatSec = 60 / this.getDeckEffectiveBpm(deckId);
        cur = Math.round(cur / beatSec) * beatSec;
      }
      d.cues[i] = Math.max(0, cur);
      this._saveCues(d.meta.url || d.meta.guid || d.meta.title, d.cues);
      this._emit('cues', { deck: deckId, cues: d.cues.slice() });
    }

    triggerHotCue(deckId, i) {
      const d = this.decks[deckId];
      const target = d.cues[i];
      if (typeof target !== 'number' || !isFinite(target)) return;

      if (this.quantEnabled && this.isPlaying(deckId)) {
        const beatSec = 60 / this.getDeckEffectiveBpm(deckId);
        const cur = this.getCurrentTime(deckId);
        const nextBeat = Math.ceil(cur / beatSec) * beatSec;
        const waitMs = Math.max(0, (nextBeat - cur) * 1000);
        if (waitMs > 15 && waitMs < (beatSec * 1000)) {
          setTimeout(() => {
            this.seek(deckId, target);
          }, waitMs);
          return;
        }
      }
      this.seek(deckId, target);
    }

    clearHotCue(deckId, i) {
      const d = this.decks[deckId];
      if (!d.meta) return;
      d.cues[i] = null;
      this._saveCues(d.meta.url || d.meta.guid || d.meta.title, d.cues);
      this._emit('cues', { deck: deckId, cues: d.cues.slice() });
    }

    // ---- Loop Controls ----
    setLoopBeats(deckId, beats) {
      const d = this.decks[deckId];
      if (!d) return;
      const clamped = Math.min(32, Math.max(0.125, beats));
      d.loop.beats = clamped;
      if (d.loop.active) {
        const beatSec = 60 / this.getDeckEffectiveBpm(deckId);
        d.loop.end = d.loop.start + (beatSec * clamped);
        const cur = this.getCurrentTime(deckId);
        if (cur >= d.loop.end) {
          this.seek(deckId, d.loop.start);
        }
      }
      this._emit('loop', { deck: deckId, active: d.loop.active, beats: d.loop.beats, start: d.loop.start, end: d.loop.end });
    }

    halfLoop(deckId) {
      const d = this.decks[deckId];
      if (!d) return;
      this.setLoopBeats(deckId, d.loop.beats / 2);
    }

    doubleLoop(deckId) {
      const d = this.decks[deckId];
      if (!d) return;
      this.setLoopBeats(deckId, d.loop.beats * 2);
    }

    toggleLoop(deckId) {
      const d = this.decks[deckId];
      if (!d) return;
      d.loop.active = !d.loop.active;
      if (d.loop.active) {
        let cur = this.getCurrentTime(deckId);
        const beatSec = 60 / this.getDeckEffectiveBpm(deckId);
        if (this.snapEnabled) {
          cur = Math.round(cur / beatSec) * beatSec;
        }
        d.loop.start = Math.max(0, cur);
        d.loop.end = d.loop.start + (beatSec * d.loop.beats);
      }
      this._emit('loop', { deck: deckId, active: d.loop.active, beats: d.loop.beats, start: d.loop.start, end: d.loop.end });
    }

    // ---- Master, Sync & Quantize ----
    getDeckEffectiveBpm(deckId) {
      const d = this.decks[deckId];
      if (!d) return 128.0;
      const base = d.meta?.bpm || d.baseBpm || 128.0;
      return base * (d.playbackRate || 1.0);
    }

    getMasterEffectiveBpm() {
      if (this.masterDeckId && this.decks[this.masterDeckId]) {
        return this.getDeckEffectiveBpm(this.masterDeckId);
      }
      return this.masterBpm;
    }

    setMasterDeck(deckId) {
      if (this.masterDeckId === deckId) {
        this.masterDeckId = null;
      } else {
        this.masterDeckId = deckId;
        this.deckSync[deckId] = false;
        this._emit('sync', { deck: deckId, sync: false });
      }
      this._emit('masterDeck', { masterDeckId: this.masterDeckId });
      this._syncSlavedDecks();
    }

    setDeckSync(deckId, isSync) {
      if (this.masterDeckId === deckId && isSync) {
        this.masterDeckId = null;
        this._emit('masterDeck', { masterDeckId: null });
      }
      this.deckSync[deckId] = !!isSync;
      this._emit('sync', { deck: deckId, sync: this.deckSync[deckId] });
      if (this.deckSync[deckId]) {
        this._syncDeckToMaster(deckId);
      }
    }

    _syncDeckToMaster(deckId) {
      const d = this.decks[deckId];
      if (!d) return;
      const masterBpm = this.getMasterEffectiveBpm();
      const baseBpm = d.meta?.bpm || d.baseBpm || 128.0;
      const targetRate = Math.min(1.2, Math.max(0.8, masterBpm / baseBpm));
      this.setPlaybackRate(deckId, targetRate);

      if (this.quantEnabled && this.masterDeckId && this.masterDeckId !== deckId && this.isPlaying(this.masterDeckId) && this.isPlaying(deckId)) {
        const masterBeatSec = 60 / masterBpm;
        const masterCur = this.getCurrentTime(this.masterDeckId);
        const masterPhase = (masterCur % masterBeatSec) / masterBeatSec;

        const deckBeatSec = 60 / this.getDeckEffectiveBpm(deckId);
        const deckCur = this.getCurrentTime(deckId);
        const currentBeatIndex = Math.floor(deckCur / deckBeatSec);
        const alignedTime = (currentBeatIndex + masterPhase) * deckBeatSec;
        this.seek(deckId, alignedTime);
      }
    }

    _syncSlavedDecks() {
      DECKS.forEach((id) => {
        if (this.deckSync[id] && id !== this.masterDeckId) {
          this._syncDeckToMaster(id);
        }
      });
    }

    setSnapEnabled(val) {
      this.snapEnabled = !!val;
      this._emit('snap', { snap: this.snapEnabled });
    }

    setQuantEnabled(val) {
      this.quantEnabled = !!val;
      this._emit('quant', { quant: this.quantEnabled });
    }

    // ---- Headphone Cue / PFL & Audio Routing ----
    _updateAudioRouting() {
      try { this.masterOut.disconnect(); } catch (_) {}
      try { this.headphoneBus.disconnect(); } catch (_) {}
      if (this.splitMerger) {
        try { this.splitMerger.disconnect(); } catch (_) {}
      }
      if (this.multiMerger) {
        try { this.multiMerger.disconnect(); } catch (_) {}
      }

      const hasPfl = this.pflEnabled.A || this.pflEnabled.B;

      if (this.cueMode === 'split') {
        // --- SPLIT STEREO MODE (DJ Splitter Cable) ---
        // Left Channel (0) = Mono Headphone Cue Bus (PFL + Master blend)
        // Right Channel (1) = Mono Master Output (To dancefloor/speakers)
        if (!this.splitMerger) {
          this.splitMerger = this.ctx.createChannelMerger(2);
          this.cueMonoGain = this.ctx.createGain();
          this.masterMonoGain = this.ctx.createGain();
        }
        try { this.cueMonoGain.disconnect(); } catch (_) {}
        try { this.masterMonoGain.disconnect(); } catch (_) {}

        // Headphone Cue -> Left Channel (0)
        this.headphoneBus.connect(this.cueMonoGain);
        this.cueMonoGain.connect(this.splitMerger, 0, 0);

        // Master -> Right Channel (1)
        this.masterOut.connect(this.masterMonoGain);
        this.masterMonoGain.connect(this.splitMerger, 0, 1);

        this.splitMerger.connect(this.ctx.destination);
      } else if (this.cueMode === 'multichannel' && this.ctx.destination.maxChannelCount >= 4) {
        // --- 4-CHANNEL AUDIO INTERFACE ---
        // Channels 0, 1 = Master L/R
        // Channels 2, 3 = Headphone Cue L/R
        try {
          this.ctx.destination.channelCount = 4;
          this.ctx.destination.channelCountMode = 'explicit';
        } catch (_) {}

        if (!this.multiMerger) {
          this.multiMerger = this.ctx.createChannelMerger(4);
        }
        // Master Out -> Channels 0 & 1
        this.masterOut.connect(this.multiMerger, 0, 0);
        this.masterOut.connect(this.multiMerger, 0, 1);

        // Headphone Out -> Channels 2 & 3
        this.headphoneBus.connect(this.multiMerger, 0, 2);
        this.headphoneBus.connect(this.multiMerger, 0, 3);

        this.multiMerger.connect(this.ctx.destination);
      } else {
        // --- STANDARD STEREO MASTER OUT ---
        this.cueMode = 'stereo';
        this.masterOut.connect(this.ctx.destination);

        // In standard stereo mode (no splitter cable), if DJ activates PFL or dials in Cue Mix,
        // blend the headphone bus so they can audition with normal headphones
        if (hasPfl) {
          this.headphoneBus.connect(this.ctx.destination);
        }
      }

      this._emit('cueRouting', {
        mode: this.cueMode,
        cueMix: this.cueMix,
        cueVolume: this.cueVolume,
        maxChannels: this.ctx.destination.maxChannelCount || 2
      });
    }

    setPFL(deckId, isActive) {
      this.pflEnabled[deckId] = !!isActive;
      const d = this.decks[deckId];
      if (d && d.pflGain) {
        const val = this.pflEnabled[deckId] ? 1.0 : 0.0;
        d.pflGain.gain.setTargetAtTime(val, this.ctx.currentTime, 0.02);
      }
      this._updateAudioRouting();
      this._emit('pfl', { deck: deckId, active: this.pflEnabled[deckId] });
    }

    setCueMix(val) {
      const clamped = Math.max(0.0, Math.min(1.0, val));
      this.cueMix = clamped;
      const cueG = Math.cos(clamped * Math.PI / 2);
      const masterG = Math.sin(clamped * Math.PI / 2);
      this.cueMixGain.gain.setTargetAtTime(cueG, this.ctx.currentTime, 0.02);
      this.masterCueGain.gain.setTargetAtTime(masterG, this.ctx.currentTime, 0.02);
      this._emit('cueMix', { cueMix: clamped });
    }

    setCueVolume(val) {
      const clamped = Math.max(0.0, Math.min(1.0, val));
      this.cueVolume = clamped;
      this.headphoneBus.gain.setTargetAtTime(clamped, this.ctx.currentTime, 0.02);
      this._emit('cueVolume', { cueVolume: clamped });
    }

    setCueMode(mode) {
      this.cueMode = mode;
      this._updateAudioRouting();
    }

    cycleCueMode() {
      const maxCh = this.ctx.destination.maxChannelCount || 2;
      const modes = maxCh >= 4 ? ['stereo', 'split', 'multichannel'] : ['stereo', 'split'];
      const idx = modes.indexOf(this.cueMode);
      const nextMode = modes[(idx + 1) % modes.length];
      this.setCueMode(nextMode);
      return nextMode;
    }

    setMasterVolume(val) {
      const clamped = Math.max(0.0, Math.min(1.0, val));
      this.masterOut.gain.setTargetAtTime(clamped, this.ctx.currentTime, 0.02);
      this._emit('masterVolume', { volume: clamped });
    }

    // ---- Automatic BPM & Musical Key Detection Engine ----
    getAnalysisFromCache(key) {
      if (!key) return null;
      try {
        const raw = store.get(ANALYSIS_CACHE_KEY);
        if (!raw) return null;
        const cache = JSON.parse(raw);
        return cache[key] || null;
      } catch (_) { return null; }
    }

    saveAnalysisToCache(key, data) {
      if (!key || !data) return;
      try {
        const raw = store.get(ANALYSIS_CACHE_KEY);
        const cache = raw ? JSON.parse(raw) : {};
        cache[key] = {
          ...data,
          analyzedAt: Date.now()
        };
        store.set(ANALYSIS_CACHE_KEY, JSON.stringify(cache));
      } catch (_) {}
    }

    _extractMetadataBpmAndKey(title = '', podcastTitle = '') {
      const str = `${title} ${podcastTitle}`;
      let bpm = null;
      let key = null;

      // 1. Look for BPM pattern: e.g. "124 bpm", "(128BPM)", "130.5 BPM", "140bpm"
      const bpmMatch = str.match(/(?:^|\s|[([_-])(\d{2,3}(?:\.\d{1,2})?)\s*(?:bpm|beats)(?:$|\s|[)\]_-])/i);
      if (bpmMatch) {
        const val = parseFloat(bpmMatch[1]);
        if (val >= 60 && val <= 200) bpm = Math.round(val * 10) / 10;
      }

      // Helper to parse note + mode to Camelot / OpenKey
      const parseMusicalKey = (rawStr) => {
        if (!rawStr) return null;
        const clean = rawStr.replace(/^[\[\(:]+|[\]\)]+$/g, '').trim();
        const m = clean.match(/^([A-G][b#]?)\s*(m|min|minor|maj|major)?$/i);
        if (!m) return null;
        let root = m[1][0].toUpperCase() + (m[1][1] ? m[1][1].toLowerCase() : '');
        const mode = (m[2] || '').toLowerCase();
        const isMinor = mode.startsWith('m') && !mode.startsWith('maj');
        const minorAlias = { 'D#m': 'Ebm', 'A#m': 'Bbm', 'Gbm': 'F#m', 'Abm': 'G#m', 'Dbm': 'C#m' };
        const majorAlias = { 'C#': 'Db', 'D#': 'Eb', 'Gb': 'F#', 'G#': 'Ab', 'A#': 'Bb' };

        if (isMinor) {
          let n = root + 'm';
          if (minorAlias[n]) n = minorAlias[n];
          const k = MINOR_KEYS.find(x => x.note.toLowerCase() === n.toLowerCase());
          return k ? { name: k.note, camelot: k.camelot, openKey: k.openKey } : null;
        } else {
          let n = root;
          if (majorAlias[n]) n = majorAlias[n];
          const k = MAJOR_KEYS.find(x => x.note.toLowerCase() === n.toLowerCase());
          return k ? { name: k.note, camelot: k.camelot, openKey: k.openKey } : null;
        }
      };

      // 2. Look for Camelot Key pattern: e.g. "8A", "11B", "1A"
      const camelotMatch = str.match(/(?:^|\s|[([_/-])([1-9]|1[0-2])([AB])(?:$|\s|[)\]_/-])/i);
      if (camelotMatch) {
        const camCode = camelotMatch[1] + camelotMatch[2].toUpperCase();
        const item = MAJOR_KEYS.find(k => k.camelot === camCode) || MINOR_KEYS.find(k => k.camelot === camCode);
        if (item) {
          key = {
            name: item.note,
            camelot: item.camelot,
            openKey: item.openKey
          };
        }
      }

      // 3. Look for bracketed or parenthesized musical keys: [Fm], (Am), [C#m], [Eb min], [G major]
      if (!key) {
        const bracketMatch = str.match(/\[([A-G][b#]?(?:\s*(?:m|min|minor|maj|major))?)\]|\(([A-G][b#]?(?:\s*(?:m|min|minor|maj|major))?)\)/i);
        if (bracketMatch) {
          key = parseMusicalKey(bracketMatch[1] || bracketMatch[2]);
        }
      }

      // 4. Look for prefixed musical keys: "Key: Am", "in F minor", "Track Key C#m"
      if (!key) {
        const prefixMatch = str.match(/\b(?:key[:\s]+|in\s+)([A-G][b#]?(?:\s*(?:m|min|minor|maj|major))?)\b/i);
        if (prefixMatch) {
          key = parseMusicalKey(prefixMatch[1]);
        }
      }

      return { bpm, key };
    }

    _detectKeyFromPCM(pcm, sampleRate) {
      const chroma = new Float32Array(12);
      const N = Math.min(pcm.length, 32768); // ~3 seconds of representative audio
      const start = Math.floor(pcm.length * 0.1);

      // Goertzel discrete energy accumulation for MIDI 36..84 (C2 to C6)
      for (let midi = 36; midi <= 84; midi++) {
        const freq = 440 * Math.pow(2, (midi - 69) / 12);
        const pitchClass = midi % 12;
        const k = (2 * Math.PI * freq) / sampleRate;
        const coeff = 2 * Math.cos(k);
        let s_prev = 0, s_prev2 = 0;

        for (let n = 0; n < N; n++) {
          const s = pcm[start + n] + coeff * s_prev - s_prev2;
          s_prev2 = s_prev;
          s_prev = s;
        }
        const power = s_prev2 * s_prev2 + s_prev * s_prev - coeff * s_prev * s_prev2;
        chroma[pitchClass] += Math.sqrt(Math.max(0, power));
      }

      let sum = 0;
      for (let i = 0; i < 12; i++) sum += chroma[i];
      if (sum > 0) {
        for (let i = 0; i < 12; i++) chroma[i] /= sum;
      }

      function pearson(x, y) {
        let meanX = 0, meanY = 0;
        for (let i = 0; i < 12; i++) { meanX += x[i]; meanY += y[i]; }
        meanX /= 12; meanY /= 12;
        let num = 0, denX = 0, denY = 0;
        for (let i = 0; i < 12; i++) {
          const dx = x[i] - meanX;
          const dy = y[i] - meanY;
          num += dx * dy;
          denX += dx * dx;
          denY += dy * dy;
        }
        return denX && denY ? num / Math.sqrt(denX * denY) : 0;
      }

      let bestKey = { name: 'Am', key: 'Am', camelot: '8A', openKey: '1m', confidence: 60 };
      let bestScore = -Infinity;

      for (let tonic = 0; tonic < 12; tonic++) {
        const majRot = new Float32Array(12);
        const minRot = new Float32Array(12);
        for (let i = 0; i < 12; i++) {
          majRot[(i + tonic) % 12] = MAJOR_PROFILE[i];
          minRot[(i + tonic) % 12] = MINOR_PROFILE[i];
        }

        const scoreMaj = pearson(chroma, majRot);
        const scoreMin = pearson(chroma, minRot);

        if (scoreMaj > bestScore) {
          bestScore = scoreMaj;
          bestKey = {
            name: MAJOR_KEYS[tonic].note,
            key: MAJOR_KEYS[tonic].note,
            camelot: MAJOR_KEYS[tonic].camelot,
            openKey: MAJOR_KEYS[tonic].openKey,
            confidence: Math.round(Math.max(0, scoreMaj) * 100)
          };
        }
        if (scoreMin > bestScore) {
          bestScore = scoreMin;
          bestKey = {
            name: MINOR_KEYS[tonic].note,
            key: MINOR_KEYS[tonic].note,
            camelot: MINOR_KEYS[tonic].camelot,
            openKey: MINOR_KEYS[tonic].openKey,
            confidence: Math.round(Math.max(0, scoreMin) * 100)
          };
        }
      }
      return bestKey;
    }

    _detectBpmFromPCM(pcm, sampleRate) {
      // Step 1: Low-pass filter (160 Hz) to isolate kick drum transients
      const alpha = (2 * Math.PI * 160) / sampleRate;
      const filtered = new Float32Array(pcm.length);
      let y = 0;
      for (let i = 0; i < pcm.length; i++) {
        y += alpha * (pcm[i] - y);
        filtered[i] = y;
      }

      // Step 2: Energy envelope in 128-sample hops (~11.6ms resolution at 11025Hz, 86.13 Hz frame rate)
      const hopSize = 128;
      const winSize = 512;
      const numBlocks = Math.floor((filtered.length - winSize) / hopSize);
      if (numBlocks < 100) return { bpm: 126.0, confidence: 40 };

      const energy = new Float32Array(numBlocks);
      for (let b = 0; b < numBlocks; b++) {
        let sum = 0;
        const start = b * hopSize;
        for (let j = 0; j < winSize; j++) {
          const s = filtered[start + j];
          sum += s * s;
        }
        energy[b] = Math.sqrt(sum / winSize);
      }

      // Positive spectral flux
      const flux = new Float32Array(numBlocks);
      for (let b = 1; b < numBlocks; b++) {
        const diff = energy[b] - energy[b - 1];
        flux[b] = diff > 0 ? diff : 0;
      }

      // Dynamic thresholding (subtract local mean of 16 blocks)
      const onset = new Float32Array(numBlocks);
      const halfWin = 8;
      for (let b = halfWin; b < numBlocks - halfWin; b++) {
        let localMean = 0;
        for (let k = -halfWin; k <= halfWin; k++) {
          localMean += flux[b + k];
        }
        localMean /= (2 * halfWin + 1);
        onset[b] = Math.max(0, flux[b] - localMean);
      }

      const envRate = sampleRate / hopSize; // 86.13 Hz
      const minLag = Math.floor((60 * envRate) / 185);
      const maxLag = Math.ceil((60 * envRate) / 65);

      const ac = new Float32Array(maxLag + 2);
      let bestLag = 0;
      let bestVal = -Infinity;

      for (let lag = minLag; lag <= maxLag; lag++) {
        let sum = 0;
        const count = numBlocks - lag - halfWin * 2;
        for (let i = halfWin; i < halfWin + count; i++) {
          sum += onset[i] * onset[i + lag];
        }
        ac[lag] = sum / count;
        if (ac[lag] > bestVal) {
          bestVal = ac[lag];
          bestLag = lag;
        }
      }

      if (bestLag <= 0) return { bpm: 126.0, confidence: 40 };

      // Parabolic interpolation for sub-frame accuracy
      const y1 = ac[bestLag - 1] || 0;
      const y2 = ac[bestLag];
      const y3 = ac[bestLag + 1] || 0;
      const denom = 2 * (2 * y2 - y1 - y3);
      const delta = denom !== 0 ? (y1 - y3) / denom : 0;
      const exactLag = bestLag + delta;
      let rawBpm = (60 * envRate) / exactLag;

      // Octave checking
      const halfLag = Math.round(bestLag / 2);
      const doubleLag = Math.round(bestLag * 2);
      if (rawBpm < 85 && halfLag >= minLag && ac[halfLag] > 0.65 * bestVal) {
        rawBpm *= 2;
      } else if (rawBpm > 175 && doubleLag <= maxLag && ac[doubleLag] > 0.75 * bestVal) {
        rawBpm /= 2;
      }

      const conf = Math.min(100, Math.max(30, Math.round((bestVal / (ac[minLag] || 1)) * 45)));

      return {
        bpm: Math.round(rawBpm * 10) / 10,
        confidence: conf
      };
    }

    _analyzeAudioBuffer(audioBuffer) {
      const channel = audioBuffer.getChannelData(0);
      const origRate = audioBuffer.sampleRate;
      const targetRate = 11025;
      const step = Math.max(1, Math.round(origRate / targetRate));

      const startSec = Math.min(10, audioBuffer.duration * 0.1);
      const startSample = Math.floor(startSec * origRate);
      const maxDurationSec = Math.min(30, Math.max(5, audioBuffer.duration - startSec));
      const sliceLength = Math.floor(maxDurationSec * origRate);
      const downsampledLength = Math.floor(sliceLength / step);

      const pcm = new Float32Array(downsampledLength);
      for (let i = 0; i < downsampledLength; i++) {
        pcm[i] = channel[startSample + i * step] || 0;
      }

      const bpmResult = this._detectBpmFromPCM(pcm, targetRate);
      const keyResult = this._detectKeyFromPCM(pcm, targetRate);

      return {
        bpm: bpmResult.bpm,
        key: keyResult.name,
        camelot: keyResult.camelot,
        openKey: keyResult.openKey,
        confidence: Math.round((bpmResult.confidence + keyResult.confidence) / 2)
      };
    }

    async analyzeTrack(track, deckId = null, force = false) {
      if (!track) return null;
      const rawUrl = track.audioUrl || track.url || '';
      const trackKey = rawUrl || track.guid || track.videoId || track.title;

      // 1. Check local cache first (unless forced re-analysis requested)
      if (!force) {
        const cached = this.getAnalysisFromCache(trackKey);
        if (cached) {
          if (deckId && this.decks[deckId] && this.decks[deckId].meta) {
            const d = this.decks[deckId];
            d.baseBpm = cached.bpm;
            d.meta.bpm = cached.bpm;
            d.meta.key = cached.camelot || cached.key;
            d.meta.camelot = cached.camelot;
            if (this.masterDeckId === deckId) this._syncSlavedDecks();
            else if (this.deckSync[deckId]) this._syncDeckToMaster(deckId);
          }
          this._emit('analyzed', {
            deckId,
            trackKey,
            track,
            bpm: cached.bpm,
            key: cached.key,
            camelot: cached.camelot,
            openKey: cached.openKey,
            confidence: cached.confidence || 100
          });
          return cached;
        }
      }

      this._emit('analyzing', { deckId, trackKey, track });

      // 2. YouTube tracks: parse metadata or use fallback
      if (track.isYouTube) {
        const metaInfo = this._extractMetadataBpmAndKey(track.title, track.podcastTitle);
        const result = {
          bpm: metaInfo.bpm || track.bpm || 128.0,
          key: metaInfo.key?.name || track.key || 'Am',
          camelot: metaInfo.key?.camelot || '8A',
          openKey: metaInfo.key?.openKey || '1m',
          confidence: metaInfo.bpm ? 85 : 55
        };
        this.saveAnalysisToCache(trackKey, result);
        if (deckId && this.decks[deckId] && this.decks[deckId].meta) {
          const d = this.decks[deckId];
          d.baseBpm = result.bpm;
          d.meta.bpm = result.bpm;
          d.meta.key = result.camelot;
          d.meta.camelot = result.camelot;
          if (this.masterDeckId === deckId) this._syncSlavedDecks();
          else if (this.deckSync[deckId]) this._syncDeckToMaster(deckId);
        }
        this._emit('analyzed', { deckId, trackKey, track, ...result });
        return result;
      }

      // 3. Audio Streams / Podcasts / Samples: Fetch audio slice and decode
      try {
        let arrayBuffer = null;

        if ('caches' in window && rawUrl) {
          try {
            const cache = await caches.open('anypod-audio-v1');
            let match = await cache.match(rawUrl);
            if (!match) match = await cache.match(`/api/proxy?url=${encodeURIComponent(rawUrl)}`);
            if (match) {
              arrayBuffer = await match.arrayBuffer();
            }
          } catch (_) {}
        }

        if (!arrayBuffer && rawUrl) {
          const fetchUrl = this._resolveUrl(rawUrl);
          try {
            const res = await fetch(fetchUrl, {
              headers: { 'Range': 'bytes=0-2500000' }
            });
            if (res.ok || res.status === 206) {
              arrayBuffer = await res.arrayBuffer();
            }
          } catch (fetchErr) {
            if (rawUrl !== fetchUrl) {
              try {
                const directRes = await fetch(rawUrl, {
                  headers: { 'Range': 'bytes=0-2500000' }
                });
                if (directRes.ok || directRes.status === 206) {
                  arrayBuffer = await directRes.arrayBuffer();
                }
              } catch (_) {}
            }
          }
        }

        if (!arrayBuffer) throw new Error('Could not retrieve audio bytes for analysis');

        const audioBuffer = await this.ctx.decodeAudioData(arrayBuffer.slice(0));
        const analysis = this._analyzeAudioBuffer(audioBuffer);

        this.saveAnalysisToCache(trackKey, analysis);

        if (deckId && this.decks[deckId] && this.decks[deckId].meta) {
          const d = this.decks[deckId];
          d.baseBpm = analysis.bpm;
          d.meta.bpm = analysis.bpm;
          d.meta.key = analysis.camelot;
          d.meta.camelot = analysis.camelot;
          if (this.masterDeckId === deckId) this._syncSlavedDecks();
          else if (this.deckSync[deckId]) this._syncDeckToMaster(deckId);
        }

        this._emit('analyzed', {
          deckId,
          trackKey,
          track,
          ...analysis
        });
        return analysis;
      } catch (err) {
        console.warn('[dj-engine] Automatic audio analysis failed, fallback:', err);
        const fallback = {
          bpm: track.bpm || 126.0,
          key: track.key || 'Am',
          camelot: '8A',
          openKey: '1m',
          confidence: 40
        };
        this._emit('analyzed', { deckId, trackKey, track, ...fallback });
        return fallback;
      }
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

    _setMediaSession(d, forceReassert = false) {
      if (!('mediaSession' in navigator) || !d || !d.meta) return;
      try {
        const origin = window.location.origin;
        const art = d.meta.artwork;
        const fallback192 = new URL('/icon-192.png', origin).href;
        const fallback512 = new URL('/icon-512.png', origin).href;
        let resolvedArt = fallback512;
        if (art) {
          try {
            if (window.location.protocol === 'https:' && art.startsWith('http://')) {
              resolvedArt = new URL('/api/audio-proxy?url=' + encodeURIComponent(art), origin).href;
            } else {
              resolvedArt = new URL(art, origin).href;
            }
          } catch (_) {
            resolvedArt = fallback512;
          }
        }

        const isFallback = !art || resolvedArt === fallback512;
        const artworkList = !isFallback ? [
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

        navigator.mediaSession.metadata = new MediaMetadata({
          title: d.meta.title || `Deck ${d.id} Track`,
          artist: d.meta.podcastTitle || (d.meta.isYouTube ? 'YouTube' : 'DJ Anypod Studio'),
          album: `Deck ${d.id} • DJ Studio`,
          artwork: artworkList
        });

        navigator.mediaSession.playbackState = 'playing';

        const dur = this.getDuration(d.id);
        const cur = this.getCurrentTime(d.id);
        if (dur > 0 && isFinite(dur) && 'setPositionState' in navigator.mediaSession) {
          try {
            navigator.mediaSession.setPositionState({
              duration: Math.max(0.1, dur),
              playbackRate: d.playbackRate || 1.0,
              position: Math.min(Math.max(0, cur), dur)
            });
          } catch (_) {}
        }
      } catch (_) {}
    }

    _setupMediaSessionHandlers() {
      if (!('mediaSession' in navigator)) return;
      try {
        const getActiveDeck = () => {
          if (this.isPlaying('A')) return this.decks['A'];
          if (this.isPlaying('B')) return this.decks['B'];
          return this.decks['A']?.meta ? this.decks['A'] : this.decks['B'];
        };

        navigator.mediaSession.setActionHandler('play', () => {
          const d = getActiveDeck();
          if (d) this.play(d.id);
        });
        navigator.mediaSession.setActionHandler('pause', () => {
          if (this.isPlaying('A')) this.pause('A');
          if (this.isPlaying('B')) this.pause('B');
        });
        navigator.mediaSession.setActionHandler('seekbackward', (details) => {
          const d = getActiveDeck();
          if (!d) return;
          const skip = details?.seekOffset || 15;
          const cur = this.getCurrentTime(d.id);
          this.seek(d.id, Math.max(0, cur - skip));
        });
        navigator.mediaSession.setActionHandler('seekforward', (details) => {
          const d = getActiveDeck();
          if (!d) return;
          const skip = details?.seekOffset || 15;
          const cur = this.getCurrentTime(d.id);
          const dur = this.getDuration(d.id);
          this.seek(d.id, Math.min(dur || 99999, cur + skip));
        });
        navigator.mediaSession.setActionHandler('previoustrack', () => {
          const d = getActiveDeck();
          if (d) this.seek(d.id, 0);
        });
        navigator.mediaSession.setActionHandler('nexttrack', () => {
          if (this.isPlaying('A') && this.decks['B']?.meta) {
            this.play('B');
            this.setCrossfader(1.0);
          } else if (this.isPlaying('B') && this.decks['A']?.meta) {
            this.play('A');
            this.setCrossfader(0.0);
          }
        });
        navigator.mediaSession.setActionHandler('stop', () => {
          this.pause('A');
          this.pause('B');
        });
        navigator.mediaSession.setActionHandler('seekto', (details) => {
          const d = getActiveDeck();
          if (d && details?.seekTime !== undefined && !isNaN(details.seekTime)) {
            this.seek(d.id, details.seekTime);
          }
        });
      } catch (_) {}
    }

    _startMeteringLoop() {
      const dataA = new Uint8Array(32);
      const dataB = new Uint8Array(32);
      const dataM = new Uint8Array(32);
      let lastPosStateUpdate = 0;

      const tick = () => {
        // 1. High-precision loop wrapping (60 fps) across both audio and YouTube engines
        DECKS.forEach((id) => {
          const d = this.decks[id];
          if (this.isPlaying(id) && d.loop.active && d.loop.end > d.loop.start) {
            const cur = this.getCurrentTime(id);
            if (cur >= d.loop.end) {
              this.seek(id, d.loop.start);
            }
          }
        });

        // 2. YouTube periodic timeupdate fallback
        DECKS.forEach((id) => {
          const d = this.decks[id];
          if (d.engine === 'youtube' && this.isPlaying(id)) {
            const cur = this.getCurrentTime(id);
            const dur = this.getDuration(id);
            this._emit('time', { deck: id, currentTime: cur, duration: dur });
          }
        });

        // 2. Lock-screen Scrubber Telemetry
        const now = Date.now();
        if (now - lastPosStateUpdate > 2500 && 'mediaSession' in navigator && 'setPositionState' in navigator.mediaSession) {
          lastPosStateUpdate = now;
          const activeDeck = this.isPlaying('A') ? this.decks['A'] : (this.isPlaying('B') ? this.decks['B'] : null);
          if (activeDeck && activeDeck.meta) {
            const dur = this.getDuration(activeDeck.id);
            const cur = this.getCurrentTime(activeDeck.id);
            if (dur > 0 && isFinite(dur)) {
              try {
                navigator.mediaSession.setPositionState({
                  duration: Math.max(0.1, dur),
                  playbackRate: activeDeck.playbackRate || 1.0,
                  position: Math.min(Math.max(0, cur), dur)
                });
              } catch (_) {}
            }
          }
        }

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
