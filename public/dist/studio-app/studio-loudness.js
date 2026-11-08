(function (root) {
  'use strict';

  function computeShelfBiquad(sampleRate, f0, gainDb, Q) {
    const A = Math.pow(10, gainDb / 40);
    const w0 = (2 * Math.PI * f0) / sampleRate;
    const cosw0 = Math.cos(w0);
    const sinw0 = Math.sin(w0);
    const alpha = (sinw0 / 2) * Math.sqrt((A + 1 / A) * (1 / Q - 1) + 2);
    const sqrtA2alpha = 2 * Math.sqrt(A) * alpha;

    const b0 = A * ((A + 1) + (A - 1) * cosw0 + sqrtA2alpha);
    const b1 = -2 * A * ((A - 1) + (A + 1) * cosw0);
    const b2 = A * ((A + 1) + (A - 1) * cosw0 - sqrtA2alpha);
    const a0 = (A + 1) - (A - 1) * cosw0 + sqrtA2alpha;
    const a1 = 2 * ((A - 1) - (A + 1) * cosw0);
    const a2 = (A + 1) - (A - 1) * cosw0 - sqrtA2alpha;

    return {
      b0: b0 / a0,
      b1: b1 / a0,
      b2: b2 / a0,
      a1: a1 / a0,
      a2: a2 / a0
    };
  }

  function computeHighpassBiquad(sampleRate, f0, Q) {
    const w0 = (2 * Math.PI * f0) / sampleRate;
    const cosw0 = Math.cos(w0);
    const sinw0 = Math.sin(w0);
    const alpha = sinw0 / (2 * Q);

    const b0 = (1 + cosw0) / 2;
    const b1 = -(1 + cosw0);
    const b2 = (1 + cosw0) / 2;
    const a0 = 1 + alpha;
    const a1 = -2 * cosw0;
    const a2 = 1 - alpha;

    return {
      b0: b0 / a0,
      b1: b1 / a0,
      b2: b2 / a0,
      a1: a1 / a0,
      a2: a2 / a0
    };
  }

  function getKWeightCoeffs(sampleRate) {
    if (Math.round(sampleRate) === 48000) {
      return {
        stage1: {
          b0: 1.53512485958697,
          b1: -2.69169618940638,
          b2: 1.19839281085285,
          a1: -1.69065929318241,
          a2: 0.73248077421585
        },
        stage2: {
          b0: 1.0,
          b1: -2.0,
          b2: 1.0,
          a1: -1.99004745483398,
          a2: 0.99007225036621
        }
      };
    }
    return {
      stage1: computeShelfBiquad(sampleRate, 1681.974450955533, 3.999843853973347, 0.7071752369554196),
      stage2: computeHighpassBiquad(sampleRate, 38.13547087602444, 0.5003270373238773)
    };
  }

  function applyBiquad(samples, coeffs) {
    const out = new Float32Array(samples.length);
    const b0 = coeffs.b0;
    const b1 = coeffs.b1;
    const b2 = coeffs.b2;
    const a1 = coeffs.a1;
    const a2 = coeffs.a2;
    let x1 = 0;
    let x2 = 0;
    let y1 = 0;
    let y2 = 0;

    for (let i = 0; i < samples.length; i++) {
      const x0 = samples[i];
      const y0 = b0 * x0 + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
      out[i] = y0;
      x2 = x1;
      x1 = x0;
      y2 = y1;
      y1 = y0;
    }
    return out;
  }

  function measureIntegratedLufs(channels, sampleRate) {
    const chList = channels && channels.length ? channels : [new Float32Array(0)];
    const numChannels = chList.length;
    const len = chList[0].length;
    if (!len) {
      return { lufs: -70, peakLinear: 0, peakDbtp: -100 };
    }

    const coeffs = getKWeightCoeffs(sampleRate);
    const filtered = [];
    let peakLinear = 0;

    for (let c = 0; c < numChannels; c++) {
      const src = chList[c];
      for (let i = 0; i < src.length; i++) {
        const abs = Math.abs(src[i]);
        if (abs > peakLinear) peakLinear = abs;
      }
      const s1 = applyBiquad(src, coeffs.stage1);
      const s2 = applyBiquad(s1, coeffs.stage2);
      filtered.push(s2);
    }

    const blockSamples = Math.max(1, Math.round(0.4 * sampleRate));
    const stepSamples = Math.max(1, Math.round(0.1 * sampleRate));
    const blockEnergies = [];

    if (len < blockSamples) {
      let sum = 0;
      for (let c = 0; c < numChannels; c++) {
        let chSum = 0;
        const f = filtered[c];
        for (let i = 0; i < len; i++) {
          chSum += f[i] * f[i];
        }
        sum += chSum / len;
      }
      const lufsSingle = sum > 0 ? -0.691 + 10 * Math.log10(sum) : -70;
      const peakDbtpSingle = peakLinear > 0 ? 20 * Math.log10(peakLinear) : -100;
      return { lufs: lufsSingle, peakLinear: peakLinear, peakDbtp: peakDbtpSingle };
    }

    for (let start = 0; start + blockSamples <= len; start += stepSamples) {
      let blockSum = 0;
      for (let c = 0; c < numChannels; c++) {
        const f = filtered[c];
        let sq = 0;
        for (let i = start; i < start + blockSamples; i++) {
          const v = f[i];
          sq += v * v;
        }
        blockSum += sq / blockSamples;
      }
      blockEnergies.push(blockSum);
    }

    const absGateLinear = Math.pow(10, (-70 + 0.691) / 10);
    const gatedAbs = blockEnergies.filter(function (z) { return z > absGateLinear; });
    if (!gatedAbs.length) {
      return {
        lufs: -70,
        peakLinear: peakLinear,
        peakDbtp: peakLinear > 0 ? 20 * Math.log10(peakLinear) : -100
      };
    }

    const meanAbs = gatedAbs.reduce(function (a, b) { return a + b; }, 0) / gatedAbs.length;
    const relGateThresholdLufs = -0.691 + 10 * Math.log10(meanAbs) - 10;
    const relGateLinear = Math.pow(10, (relGateThresholdLufs + 0.691) / 10);

    const gatedRel = gatedAbs.filter(function (z) { return z > relGateLinear; });
    const finalSet = gatedRel.length ? gatedRel : gatedAbs;
    const finalMean = finalSet.reduce(function (a, b) { return a + b; }, 0) / finalSet.length;
    const integratedLufs = finalMean > 0 ? -0.691 + 10 * Math.log10(finalMean) : -70;
    const peakDbtp = peakLinear > 0 ? 20 * Math.log10(peakLinear) : -100;

    return {
      lufs: Number(integratedLufs.toFixed(2)),
      peakLinear: peakLinear,
      peakDbtp: Number(peakDbtp.toFixed(2))
    };
  }

  function normalizeChannelsToTargetLufs(channels, sampleRate, options) {
    const opts = options || {};
    const numChannels = channels.length;
    const defaultTarget = numChannels === 1 ? -19 : -16;
    const targetLufs = opts.targetLufs !== undefined ? Number(opts.targetLufs) : defaultTarget;
    const ceilingDbtp = opts.ceilingDbtp !== undefined ? Number(opts.ceilingDbtp) : -1.0;
    const ceilingLinear = Math.pow(10, ceilingDbtp / 20);

    const measured = measureIntegratedLufs(channels, sampleRate);
    if (measured.lufs <= -65 || measured.peakLinear === 0) {
      return {
        channels: channels,
        inputLufs: measured.lufs,
        outputLufs: measured.lufs,
        gainDb: 0,
        peakDbtp: measured.peakDbtp
      };
    }

    const desiredGainDb = Math.max(-24, Math.min(24, targetLufs - measured.lufs));
    const desiredGainLinear = Math.pow(10, desiredGainDb / 20);
    const outChannels = [];
    let postPeak = 0;

    for (let c = 0; c < numChannels; c++) {
      const src = channels[c];
      const dst = new Float32Array(src.length);
      for (let i = 0; i < src.length; i++) {
        let s = src[i] * desiredGainLinear;
        if (Math.abs(s) > ceilingLinear) {
          const sign = s < 0 ? -1 : 1;
          const excess = Math.abs(s) - ceilingLinear;
          s = sign * (ceilingLinear + (1 - ceilingLinear) * Math.tanh(excess / Math.max(0.01, 1 - ceilingLinear)));
          if (Math.abs(s) > ceilingLinear) {
            s = sign * ceilingLinear;
          }
        }
        if (Math.abs(s) > postPeak) postPeak = Math.abs(s);
        dst[i] = s;
      }
      outChannels.push(dst);
    }

    const postMeasured = measureIntegratedLufs(outChannels, sampleRate);
    return {
      channels: outChannels,
      inputLufs: measured.lufs,
      outputLufs: postMeasured.lufs,
      gainDb: Number(desiredGainDb.toFixed(2)),
      peakDbtp: postMeasured.peakDbtp
    };
  }

  const api = {
    measureIntegratedLufs: measureIntegratedLufs,
    normalizeChannelsToTargetLufs: normalizeChannelsToTargetLufs
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  root.StudioLoudness = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
