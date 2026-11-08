(function (root) {
  'use strict';

  function cloneRegions(regions) {
    return (regions || []).map(function (r) {
      return {
        id: r.id || ('reg-' + Math.random().toString(36).slice(2, 9)),
        sourceStart: Math.max(0, Math.round(Number(r.sourceStart) || 0)),
        sourceEnd: Math.max(0, Math.round(Number(r.sourceEnd) || 0)),
        fadeInSamples: Math.max(0, Math.round(Number(r.fadeInSamples) || 0)),
        fadeOutSamples: Math.max(0, Math.round(Number(r.fadeOutSamples) || 0)),
        gain: r.gain === undefined ? 1 : Number(r.gain),
        label: r.label || ''
      };
    }).filter(function (r) {
      return r.sourceEnd > r.sourceStart;
    });
  }

  function findZeroCrossing(samples, targetSample, maxRadius) {
    const len = samples ? samples.length : 0;
    if (!len) return Math.max(0, targetSample);
    const center = Math.max(1, Math.min(len - 2, Math.round(targetSample)));
    const radius = Math.max(1, Math.min(2048, Math.round(maxRadius || 256)));
    let bestIdx = center;
    let bestVal = Math.abs(samples[center]);

    for (let offset = 0; offset <= radius; offset++) {
      const left = center - offset;
      const right = center + offset;
      if (left >= 1) {
        const s0 = samples[left - 1];
        const s1 = samples[left];
        if ((s0 <= 0 && s1 >= 0) || (s0 >= 0 && s1 <= 0)) {
          return Math.abs(s0) < Math.abs(s1) ? left - 1 : left;
        }
        if (Math.abs(s1) < bestVal) {
          bestVal = Math.abs(s1);
          bestIdx = left;
        }
      }
      if (right < len - 1) {
        const r0 = samples[right];
        const r1 = samples[right + 1];
        if ((r0 <= 0 && r1 >= 0) || (r0 >= 0 && r1 <= 0)) {
          return Math.abs(r0) < Math.abs(r1) ? right : right + 1;
        }
        if (Math.abs(r0) < bestVal) {
          bestVal = Math.abs(r0);
          bestIdx = right;
        }
      }
    }
    return bestIdx;
  }

  function createEdl(totalSamples, sampleRate, referenceChannel) {
    const rate = Math.max(8000, Math.round(Number(sampleRate) || 48000));
    const total = Math.max(0, Math.round(Number(totalSamples) || 0));
    const defaultFade = Math.round(rate * 0.006);
    let regions = total > 0 ? [{
      id: 'reg-initial',
      sourceStart: 0,
      sourceEnd: total,
      fadeInSamples: 0,
      fadeOutSamples: 0,
      gain: 1,
      label: 'Full Take'
    }] : [];

    const undoStack = [];
    const redoStack = [];

    function pushUndo() {
      undoStack.push(cloneRegions(regions));
      if (undoStack.length > 200) undoStack.shift();
      redoStack.length = 0;
    }

    function getRegions() {
      let timelineCursor = 0;
      return regions.map(function (r, idx) {
        const len = r.sourceEnd - r.sourceStart;
        const item = {
          index: idx,
          id: r.id,
          sourceStart: r.sourceStart,
          sourceEnd: r.sourceEnd,
          lengthSamples: len,
          timelineStart: timelineCursor,
          timelineEnd: timelineCursor + len,
          fadeInSamples: r.fadeInSamples,
          fadeOutSamples: r.fadeOutSamples,
          gain: r.gain,
          label: r.label
        };
        timelineCursor += len;
        return item;
      });
    }

    function getTotalOutputSamples() {
      return regions.reduce(function (acc, r) {
        return acc + (r.sourceEnd - r.sourceStart);
      }, 0);
    }

    function timelineToSource(timelineSample) {
      const t = Math.max(0, Math.round(timelineSample));
      const mapped = getRegions();
      for (let i = 0; i < mapped.length; i++) {
        const reg = mapped[i];
        if (t >= reg.timelineStart && t <= reg.timelineEnd) {
          return {
            regionIndex: i,
            region: reg,
            sourceSample: reg.sourceStart + (t - reg.timelineStart)
          };
        }
      }
      if (mapped.length > 0) {
        const last = mapped[mapped.length - 1];
        return {
          regionIndex: mapped.length - 1,
          region: last,
          sourceSample: last.sourceEnd
        };
      }
      return null;
    }

    function splitAtTimeline(timelineSample) {
      const loc = timelineToSource(timelineSample);
      if (!loc) return false;
      const reg = regions[loc.regionIndex];
      const minSegment = Math.max(64, defaultFade * 2);
      let splitSource = loc.sourceSample;
      if (referenceChannel && referenceChannel.length) {
        splitSource = findZeroCrossing(referenceChannel, splitSource, Math.round(rate * 0.005));
      }
      if (splitSource - reg.sourceStart < minSegment || reg.sourceEnd - splitSource < minSegment) {
        return false;
      }
      pushUndo();
      const left = {
        id: 'reg-' + Math.random().toString(36).slice(2, 9),
        sourceStart: reg.sourceStart,
        sourceEnd: splitSource,
        fadeInSamples: reg.fadeInSamples,
        fadeOutSamples: defaultFade,
        gain: reg.gain,
        label: reg.label
      };
      const right = {
        id: 'reg-' + Math.random().toString(36).slice(2, 9),
        sourceStart: splitSource,
        sourceEnd: reg.sourceEnd,
        fadeInSamples: defaultFade,
        fadeOutSamples: reg.fadeOutSamples,
        gain: reg.gain,
        label: reg.label
      };
      regions.splice(loc.regionIndex, 1, left, right);
      return true;
    }

    function rippleDeleteRange(timelineStartSample, timelineEndSample) {
      const start = Math.max(0, Math.min(timelineStartSample, timelineEndSample));
      const end = Math.min(getTotalOutputSamples(), Math.max(timelineStartSample, timelineEndSample));
      if (end - start < 1) return false;

      pushUndo();
      const mapped = getRegions();
      const next = [];

      for (let i = 0; i < mapped.length; i++) {
        const reg = mapped[i];
        if (reg.timelineEnd <= start || reg.timelineStart >= end) {
          next.push({
            id: reg.id,
            sourceStart: reg.sourceStart,
            sourceEnd: reg.sourceEnd,
            fadeInSamples: reg.fadeInSamples,
            fadeOutSamples: reg.fadeOutSamples,
            gain: reg.gain,
            label: reg.label
          });
          continue;
        }
        if (reg.timelineStart < start) {
          const leftLen = start - reg.timelineStart;
          let cutPoint = reg.sourceStart + leftLen;
          if (referenceChannel && referenceChannel.length) {
            cutPoint = findZeroCrossing(referenceChannel, cutPoint, Math.round(rate * 0.004));
          }
          if (cutPoint > reg.sourceStart) {
            next.push({
              id: 'reg-' + Math.random().toString(36).slice(2, 9),
              sourceStart: reg.sourceStart,
              sourceEnd: cutPoint,
              fadeInSamples: reg.fadeInSamples,
              fadeOutSamples: defaultFade,
              gain: reg.gain,
              label: reg.label
            });
          }
        }
        if (reg.timelineEnd > end) {
          const rightOffset = end - reg.timelineStart;
          let resumePoint = reg.sourceStart + rightOffset;
          if (referenceChannel && referenceChannel.length) {
            resumePoint = findZeroCrossing(referenceChannel, resumePoint, Math.round(rate * 0.004));
          }
          if (reg.sourceEnd > resumePoint) {
            next.push({
              id: 'reg-' + Math.random().toString(36).slice(2, 9),
              sourceStart: resumePoint,
              sourceEnd: reg.sourceEnd,
              fadeInSamples: defaultFade,
              fadeOutSamples: reg.fadeOutSamples,
              gain: reg.gain,
              label: reg.label
            });
          }
        }
      }

      regions = next;
      return true;
    }

    function deleteRegionByIndex(idx) {
      if (idx < 0 || idx >= regions.length) return false;
      pushUndo();
      regions.splice(idx, 1);
      return true;
    }

    function trimRegion(idx, newSourceStart, newSourceEnd) {
      if (idx < 0 || idx >= regions.length) return false;
      const reg = regions[idx];
      const s = Math.max(0, Math.min(total, Math.round(newSourceStart)));
      const e = Math.max(0, Math.min(total, Math.round(newSourceEnd)));
      if (e - s < 64) return false;
      pushUndo();
      reg.sourceStart = s;
      reg.sourceEnd = e;
      return true;
    }

    function setRegionFades(idx, fadeInSamples, fadeOutSamples) {
      if (idx < 0 || idx >= regions.length) return false;
      pushUndo();
      const reg = regions[idx];
      const len = reg.sourceEnd - reg.sourceStart;
      reg.fadeInSamples = Math.max(0, Math.min(Math.floor(len / 2), Math.round(fadeInSamples)));
      reg.fadeOutSamples = Math.max(0, Math.min(Math.floor(len / 2), Math.round(fadeOutSamples)));
      return true;
    }

    function applyKeptSourceIntervals(keptIntervals) {
      const cleaned = cloneRegions((keptIntervals || []).map(function (iv) {
        return {
          sourceStart: iv.sourceStart,
          sourceEnd: iv.sourceEnd,
          fadeInSamples: defaultFade,
          fadeOutSamples: defaultFade,
          gain: 1,
          label: iv.label || ''
        };
      }));
      if (!cleaned.length) return false;
      pushUndo();
      regions = cleaned;
      return true;
    }

    function undo() {
      if (!undoStack.length) return false;
      redoStack.push(cloneRegions(regions));
      regions = undoStack.pop();
      return true;
    }

    function redo() {
      if (!redoStack.length) return false;
      undoStack.push(cloneRegions(regions));
      regions = redoStack.pop();
      return true;
    }

    function canUndo() {
      return undoStack.length > 0;
    }

    function canRedo() {
      return redoStack.length > 0;
    }

    return {
      sampleRate: rate,
      totalSourceSamples: total,
      getRegions: getRegions,
      getTotalOutputSamples: getTotalOutputSamples,
      timelineToSource: timelineToSource,
      splitAtTimeline: splitAtTimeline,
      rippleDeleteRange: rippleDeleteRange,
      deleteRegionByIndex: deleteRegionByIndex,
      trimRegion: trimRegion,
      setRegionFades: setRegionFades,
      applyKeptSourceIntervals: applyKeptSourceIntervals,
      undo: undo,
      redo: redo,
      canUndo: canUndo,
      canRedo: canRedo
    };
  }

  function renderEdlChannels(sourceChannels, edl, sampleRate, crossfadeMs) {
    const channels = sourceChannels && sourceChannels.length ? sourceChannels : [new Float32Array(0)];
    const numChannels = channels.length;
    const rate = Math.max(8000, Math.round(Number(sampleRate) || edl.sampleRate || 48000));
    const regs = edl.getRegions();
    const xfadeSamples = Math.max(0, Math.round(((crossfadeMs === undefined ? 6 : crossfadeMs) / 1000) * rate));

    if (!regs.length) {
      return channels.map(function () { return new Float32Array(0); });
    }

    const totalLen = edl.getTotalOutputSamples();
    const outChannels = [];
    for (let c = 0; c < numChannels; c++) {
      outChannels.push(new Float32Array(totalLen));
    }

    let writePos = 0;
    for (let rIdx = 0; rIdx < regs.length; rIdx++) {
      const reg = regs[rIdx];
      const len = reg.lengthSamples;
      const gain = reg.gain === undefined ? 1 : reg.gain;
      const fadeIn = Math.max(reg.fadeInSamples || 0, rIdx > 0 ? xfadeSamples : 0);
      const fadeOut = Math.max(reg.fadeOutSamples || 0, rIdx < regs.length - 1 ? xfadeSamples : 0);

      for (let c = 0; c < numChannels; c++) {
        const src = channels[c];
        const dst = outChannels[c];
        for (let i = 0; i < len; i++) {
          let sample = (src[reg.sourceStart + i] || 0) * gain;
          if (fadeIn > 0 && i < fadeIn) {
            sample *= 0.5 * (1 - Math.cos(Math.PI * (i / fadeIn)));
          }
          if (fadeOut > 0 && i >= len - fadeOut) {
            const rem = len - 1 - i;
            sample *= 0.5 * (1 - Math.cos(Math.PI * (rem / fadeOut)));
          }
          dst[writePos + i] = sample;
        }
      }
      writePos += len;
    }

    return outChannels;
  }

  function detectSilenceCandidates(samples, sampleRate, options) {
    const opts = options || {};
    const thresholdDb = opts.thresholdDb !== undefined ? Number(opts.thresholdDb) : -38;
    const minSilenceMs = opts.minSilenceMs !== undefined ? Number(opts.minSilenceMs) : 450;
    const padMs = opts.padMs !== undefined ? Number(opts.padMs) : 80;
    const thresholdAmp = Math.pow(10, thresholdDb / 20);
    const frameSamples = Math.max(64, Math.round(sampleRate * 0.02));
    const minFrames = Math.max(1, Math.ceil((minSilenceMs / 1000) / 0.02));
    const padSamples = Math.round((padMs / 1000) * sampleRate);

    const silences = [];
    let runStartFrame = -1;
    let frameCount = Math.floor(samples.length / frameSamples);

    for (let f = 0; f < frameCount; f++) {
      const offset = f * frameSamples;
      let sum = 0;
      for (let i = 0; i < frameSamples; i++) {
        const v = samples[offset + i];
        sum += v * v;
      }
      const rms = Math.sqrt(sum / frameSamples);
      if (rms < thresholdAmp) {
        if (runStartFrame === -1) runStartFrame = f;
      } else if (runStartFrame !== -1) {
        const runLen = f - runStartFrame;
        if (runLen >= minFrames) {
          const s = Math.min(samples.length, runStartFrame * frameSamples + padSamples);
          const e = Math.max(s, f * frameSamples - padSamples);
          if (e - s > frameSamples) {
            silences.push({ sourceStart: s, sourceEnd: e });
          }
        }
        runStartFrame = -1;
      }
    }

    if (runStartFrame !== -1 && (frameCount - runStartFrame) >= minFrames) {
      const s = Math.min(samples.length, runStartFrame * frameSamples + padSamples);
      const e = Math.max(s, frameCount * frameSamples - padSamples);
      if (e - s > frameSamples) {
        silences.push({ sourceStart: s, sourceEnd: e });
      }
    }

    return silences;
  }

  function invertRemovedToKept(totalSamples, removedRanges) {
    const sorted = (removedRanges || []).slice().sort(function (a, b) {
      return a.sourceStart - b.sourceStart;
    });
    const kept = [];
    let cursor = 0;
    for (let i = 0; i < sorted.length; i++) {
      const r = sorted[i];
      const s = Math.max(cursor, Math.min(totalSamples, r.sourceStart));
      const e = Math.max(s, Math.min(totalSamples, r.sourceEnd));
      if (s > cursor) {
        kept.push({ sourceStart: cursor, sourceEnd: s });
      }
      cursor = Math.max(cursor, e);
    }
    if (cursor < totalSamples) {
      kept.push({ sourceStart: cursor, sourceEnd: totalSamples });
    }
    return kept;
  }

  const api = {
    findZeroCrossing: findZeroCrossing,
    createEdl: createEdl,
    renderEdlChannels: renderEdlChannels,
    detectSilenceCandidates: detectSilenceCandidates,
    invertRemovedToKept: invertRemovedToKept
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  root.StudioEdl = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
