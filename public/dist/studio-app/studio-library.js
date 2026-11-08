(function (root) {
  'use strict';

  function createAudioContext(rate) {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    return new Ctx({ sampleRate: rate || 48000 });
  }

  function createOfflineContext(channels, length, rate) {
    const Ctx = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    return new Ctx(channels, length, rate);
  }

  async function generateLofiIntro(sampleRate) {
    const rate = sampleRate || 48000;
    const dur = 10;
    const totalSamples = Math.round(dur * rate);
    const ctx = createOfflineContext(2, totalSamples, rate);

    const chords = [
      [261.63, 329.63, 392.00, 493.88],
      [220.00, 261.63, 329.63, 392.00],
      [174.61, 220.00, 261.63, 329.63],
      [196.00, 246.94, 293.66, 392.00]
    ];

    const chordLen = 2.4;
    chords.forEach(function (notes, ci) {
      const t0 = ci * chordLen + 0.2;
      notes.forEach(function (freq) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const filter = ctx.createBiquadFilter();

        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, t0);

        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(1400, t0);
        filter.frequency.exponentialRampToValueAtTime(600, t0 + chordLen);

        gain.gain.setValueAtTime(0.0001, t0);
        gain.gain.linearRampToValueAtTime(0.06, t0 + 0.08);
        gain.gain.exponentialRampToValueAtTime(0.0001, t0 + chordLen);

        osc.connect(filter);
        filter.connect(gain);
        gain.connect(ctx.destination);

        osc.start(t0);
        osc.stop(t0 + chordLen);
      });
    });

    const beatInterval = 0.6;
    const beatCount = Math.floor((dur - 0.5) / beatInterval);
    for (let b = 0; b < beatCount; b++) {
      const tb = 0.2 + b * beatInterval;
      if (b % 2 === 0) {
        const kickOsc = ctx.createOscillator();
        const kickGain = ctx.createGain();
        kickOsc.type = 'sine';
        kickOsc.frequency.setValueAtTime(120, tb);
        kickOsc.frequency.exponentialRampToValueAtTime(42, tb + 0.16);
        kickGain.gain.setValueAtTime(0.35, tb);
        kickGain.gain.exponentialRampToValueAtTime(0.0001, tb + 0.22);
        kickOsc.connect(kickGain);
        kickGain.connect(ctx.destination);
        kickOsc.start(tb);
        kickOsc.stop(tb + 0.25);
      } else {
        const snareBuffer = ctx.createBuffer(1, Math.round(rate * 0.14), rate);
        const sData = snareBuffer.getChannelData(0);
        for (let i = 0; i < sData.length; i++) {
          sData[i] = (Math.random() * 2 - 1) * Math.exp(-i / (rate * 0.04));
        }
        const snareSrc = ctx.createBufferSource();
        snareSrc.buffer = snareBuffer;
        const sFilter = ctx.createBiquadFilter();
        sFilter.type = 'highpass';
        sFilter.frequency.setValueAtTime(1800, tb);
        const sGain = ctx.createGain();
        sGain.gain.setValueAtTime(0.18, tb);
        sGain.gain.exponentialRampToValueAtTime(0.0001, tb + 0.14);
        snareSrc.connect(sFilter);
        sFilter.connect(sGain);
        sGain.connect(ctx.destination);
        snareSrc.start(tb);
      }
    }

    const crackleBuffer = ctx.createBuffer(2, totalSamples, rate);
    for (let ch = 0; ch < 2; ch++) {
      const data = crackleBuffer.getChannelData(ch);
      for (let i = 0; i < totalSamples; i++) {
        if (Math.random() < 0.0018) {
          data[i] = (Math.random() * 2 - 1) * 0.035;
        }
      }
    }
    const crackleSrc = ctx.createBufferSource();
    crackleSrc.buffer = crackleBuffer;
    crackleSrc.connect(ctx.destination);
    crackleSrc.start(0);

    return ctx.startRendering();
  }

  async function generateTechMinimal(sampleRate) {
    const rate = sampleRate || 48000;
    const dur = 8;
    const totalSamples = Math.round(dur * rate);
    const ctx = createOfflineContext(2, totalSamples, rate);

    const bassNotes = [55.00, 55.00, 65.41, 49.00];
    const step = 0.5;
    const steps = Math.floor(dur / step);

    for (let s = 0; s < steps; s++) {
      const ts = s * step;
      const bFreq = bassNotes[Math.floor(s / 4) % bassNotes.length];

      const bOsc = ctx.createOscillator();
      const bGain = ctx.createGain();
      bOsc.type = 'sawtooth';
      bOsc.frequency.setValueAtTime(bFreq, ts);

      const bFilt = ctx.createBiquadFilter();
      bFilt.type = 'lowpass';
      bFilt.frequency.setValueAtTime(280, ts);

      bGain.gain.setValueAtTime(0.24, ts);
      bGain.gain.exponentialRampToValueAtTime(0.001, ts + 0.38);

      bOsc.connect(bFilt);
      bFilt.connect(bGain);
      bGain.connect(ctx.destination);
      bOsc.start(ts);
      bOsc.stop(ts + 0.4);

      if (s % 2 === 1) {
        const pOsc = ctx.createOscillator();
        const pGain = ctx.createGain();
        pOsc.type = 'sine';
        pOsc.frequency.setValueAtTime(440 * (s % 3 + 1), ts + 0.25);
        pGain.gain.setValueAtTime(0.08, ts + 0.25);
        pGain.gain.exponentialRampToValueAtTime(0.0001, ts + 0.45);
        pOsc.connect(pGain);
        pGain.connect(ctx.destination);
        pOsc.start(ts + 0.25);
        pOsc.stop(ts + 0.48);
      }
    }

    return ctx.startRendering();
  }

  async function generateAcousticStory(sampleRate) {
    const rate = sampleRate || 48000;
    const dur = 9;
    const totalSamples = Math.round(dur * rate);
    const ctx = createOfflineContext(2, totalSamples, rate);

    const arpeggios = [
      261.63, 329.63, 392.00, 523.25,
      220.00, 261.63, 329.63, 440.00,
      174.61, 220.00, 261.63, 349.23,
      196.00, 246.94, 293.66, 392.00
    ];

    const noteDur = 0.28;
    for (let i = 0; i < arpeggios.length * 2; i++) {
      const freq = arpeggios[i % arpeggios.length];
      const tn = i * noteDur;
      if (tn + 0.8 > dur) break;

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, tn);

      gain.gain.setValueAtTime(0.0001, tn);
      gain.gain.linearRampToValueAtTime(0.12, tn + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, tn + 0.75);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(tn);
      osc.stop(tn + 0.8);
    }

    return ctx.startRendering();
  }

  async function generateAmbientOutro(sampleRate) {
    const rate = sampleRate || 48000;
    const dur = 7;
    const totalSamples = Math.round(dur * rate);
    const ctx = createOfflineContext(2, totalSamples, rate);

    const padNotes = [130.81, 164.81, 196.00, 246.94, 293.66];
    padNotes.forEach(function (freq) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const filt = ctx.createBiquadFilter();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, 0);

      filt.type = 'lowpass';
      filt.frequency.setValueAtTime(450, 0);
      filt.frequency.linearRampToValueAtTime(850, 3);
      filt.frequency.linearRampToValueAtTime(200, dur);

      gain.gain.setValueAtTime(0.0001, 0);
      gain.gain.linearRampToValueAtTime(0.07, 2.5);
      gain.gain.linearRampToValueAtTime(0.0001, dur);

      osc.connect(filt);
      filt.connect(gain);
      gain.connect(ctx.destination);
      osc.start(0);
      osc.stop(dur);
    });

    return ctx.startRendering();
  }

  async function generateWhoosh(sampleRate) {
    const rate = sampleRate || 48000;
    const dur = 1.2;
    const totalSamples = Math.round(dur * rate);
    const ctx = createOfflineContext(2, totalSamples, rate);

    const noiseBuffer = ctx.createBuffer(2, totalSamples, rate);
    for (let ch = 0; ch < 2; ch++) {
      const data = noiseBuffer.getChannelData(ch);
      for (let i = 0; i < totalSamples; i++) {
        data[i] = Math.random() * 2 - 1;
      }
    }

    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer;

    const filt = ctx.createBiquadFilter();
    filt.type = 'bandpass';
    filt.Q.setValueAtTime(2.2, 0);
    filt.frequency.setValueAtTime(220, 0);
    filt.frequency.exponentialRampToValueAtTime(2800, 0.6);
    filt.frequency.exponentialRampToValueAtTime(320, 1.15);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, 0);
    gain.gain.linearRampToValueAtTime(0.38, 0.55);
    gain.gain.exponentialRampToValueAtTime(0.0001, 1.18);

    src.connect(filt);
    filt.connect(gain);
    gain.connect(ctx.destination);
    src.start(0);
    src.stop(dur);

    return ctx.startRendering();
  }

  async function generateChime(sampleRate) {
    const rate = sampleRate || 48000;
    const dur = 2.4;
    const totalSamples = Math.round(dur * rate);
    const ctx = createOfflineContext(2, totalSamples, rate);

    const partials = [
      { freq: 880, gain: 0.18 },
      { freq: 1760, gain: 0.12 },
      { freq: 2640, gain: 0.08 },
      { freq: 3520, gain: 0.05 }
    ];

    partials.forEach(function (p) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(p.freq, 0);

      gain.gain.setValueAtTime(p.gain, 0);
      gain.gain.exponentialRampToValueAtTime(0.0001, dur);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(0);
      osc.stop(dur);
    });

    return ctx.startRendering();
  }

  async function generateSparkle(sampleRate) {
    const rate = sampleRate || 48000;
    const dur = 1.6;
    const totalSamples = Math.round(dur * rate);
    const ctx = createOfflineContext(2, totalSamples, rate);

    const notes = [587.33, 659.25, 880.00, 1046.50, 1174.66, 1318.51];
    notes.forEach(function (freq, i) {
      const tn = i * 0.12;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, tn);

      gain.gain.setValueAtTime(0.0001, tn);
      gain.gain.linearRampToValueAtTime(0.14, tn + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, tn + 0.6);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(tn);
      osc.stop(tn + 0.65);
    });

    return ctx.startRendering();
  }

  async function generateBleep(sampleRate) {
    const rate = sampleRate || 48000;
    const dur = 0.8;
    const totalSamples = Math.round(dur * rate);
    const ctx = createOfflineContext(2, totalSamples, rate);

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(1000, 0);

    gain.gain.setValueAtTime(0.0001, 0);
    gain.gain.linearRampToValueAtTime(0.24, 0.01);
    gain.gain.setValueAtTime(0.24, 0.72);
    gain.gain.linearRampToValueAtTime(0.0001, 0.79);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(0);
    osc.stop(dur);

    return ctx.startRendering();
  }

  async function generateSubDrop(sampleRate) {
    const rate = sampleRate || 48000;
    const dur = 1.8;
    const totalSamples = Math.round(dur * rate);
    const ctx = createOfflineContext(2, totalSamples, rate);

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(95, 0);
    osc.frequency.exponentialRampToValueAtTime(32, 1.4);

    gain.gain.setValueAtTime(0.42, 0);
    gain.gain.exponentialRampToValueAtTime(0.0001, 1.75);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(0);
    osc.stop(dur);

    return ctx.startRendering();
  }

  const ASSETS = [
    {
      id: 'asset-lofi-intro',
      category: 'music',
      title: 'Lo-Fi Podcast Intro',
      desc: 'Warm chords, vinyl crackle & mellow groove',
      duration: 10.0,
      generate: generateLofiIntro
    },
    {
      id: 'asset-tech-pulse',
      category: 'music',
      title: 'Tech Minimal Pulse',
      desc: 'Sub-bass line & subtle digital rhythm',
      duration: 8.0,
      generate: generateTechMinimal
    },
    {
      id: 'asset-acoustic-story',
      category: 'music',
      title: 'Acoustic Storyteller',
      desc: 'Gentle arpeggio chords for thoughtful talks',
      duration: 9.0,
      generate: generateAcousticStory
    },
    {
      id: 'asset-ambient-outro',
      category: 'music',
      title: 'Ambient Outro Pad',
      desc: 'Soft decaying chord swell for smooth fadeouts',
      duration: 7.0,
      generate: generateAmbientOutro
    },
    {
      id: 'asset-sfx-whoosh',
      category: 'sfx',
      title: 'Transition Whoosh',
      desc: 'Air sweep for topic & chapter transitions',
      duration: 1.2,
      generate: generateWhoosh
    },
    {
      id: 'asset-sfx-chime',
      category: 'sfx',
      title: 'Broadcast Bell',
      desc: 'Crystal FM chime for key points and sponsors',
      duration: 2.4,
      generate: generateChime
    },
    {
      id: 'asset-sfx-sparkle',
      category: 'sfx',
      title: 'Digital Sparkle',
      desc: 'Bright rising pentatonic chime',
      duration: 1.6,
      generate: generateSparkle
    },
    {
      id: 'asset-sfx-bleep',
      category: 'sfx',
      title: 'Censor Bleep (1 kHz)',
      desc: 'Classic broadcast tone for comical censors',
      duration: 0.8,
      generate: generateBleep
    },
    {
      id: 'asset-sfx-subdrop',
      category: 'sfx',
      title: 'Cinematic Sub Drop',
      desc: 'Deep 95 Hz to 32 Hz impact for emphasis',
      duration: 1.8,
      generate: generateSubDrop
    }
  ];

  const api = {
    ASSETS: ASSETS,
    getAssets: function () {
      return ASSETS.slice();
    },
    getAssetById: function (id) {
      return ASSETS.find(function (a) { return a.id === id; }) || null;
    },
    renderAssetBuffer: async function (id, sampleRate) {
      const a = ASSETS.find(function (item) { return item.id === id; });
      if (!a) throw new Error('Asset not found: ' + id);
      return a.generate(sampleRate || 48000);
    }
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  root.StudioLibrary = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
