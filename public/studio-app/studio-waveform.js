(function (root) {
  'use strict';

  function computeRenderedPeaks(samples, bucketCount) {
    const count = Math.max(32, Math.min(2048, bucketCount || 320));
    const out = new Float32Array(count);
    if (!samples || !samples.length) return out;
    const step = Math.max(1, Math.floor(samples.length / count));
    let maxVal = 0.001;

    for (let b = 0; b < count; b++) {
      const start = b * step;
      const end = Math.min(samples.length, start + step);
      let peak = 0;
      const stride = Math.max(1, Math.floor((end - start) / 64));
      for (let i = start; i < end; i += stride) {
        const a = Math.abs(samples[i]);
        if (a > peak) peak = a;
      }
      out[b] = peak;
      if (peak > maxVal) maxVal = peak;
    }

    for (let b = 0; b < count; b++) {
      out[b] = Math.min(1, Math.max(0.03, out[b] / maxVal));
    }
    return out;
  }

  function createWaveformEditor(canvas, options) {
    const opts = options || {};
    const onSeek = typeof opts.onSeek === 'function' ? opts.onSeek : function () {};
    const onSelectionChange = typeof opts.onSelectionChange === 'function' ? opts.onSelectionChange : function () {};

    let peaks = new Float32Array(0);
    let totalSamples = 0;
    let sampleRate = 48000;
    let playheadSample = 0;
    let selectionStart = null;
    let selectionEnd = null;
    let regions = [];
    let zoom = 1;
    let scrollRatio = 0;
    let dragging = false;
    let dragAnchorSample = 0;

    function getVisibleSampleRange() {
      const visLen = Math.max(1, Math.round(totalSamples / Math.max(1, zoom)));
      const maxStart = Math.max(0, totalSamples - visLen);
      const start = Math.round(maxStart * Math.max(0, Math.min(1, scrollRatio)));
      return { start: start, end: start + visLen, length: visLen };
    }

    function clientXToSample(clientX) {
      const rect = canvas.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / Math.max(1, rect.width)));
      const range = getVisibleSampleRange();
      return Math.round(range.start + ratio * range.length);
    }

    function draw() {
      if (!canvas) return;
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      const w = Math.max(200, Math.floor(rect.width));
      const h = Math.max(80, Math.floor(rect.height));
      if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
        canvas.width = w * dpr;
        canvas.height = h * dpr;
      }
      const ctx = canvas.getContext('2d');
      ctx.save();
      ctx.scale(dpr, dpr);

      ctx.fillStyle = '#151a24';
      ctx.fillRect(0, 0, w, h);

      if (!totalSamples || !peaks.length) {
        ctx.fillStyle = '#667085';
        ctx.font = '12px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('Record or load audio to open the non-destructive waveform cutter', w / 2, h / 2 + 4);
        ctx.restore();
        return;
      }

      const range = getVisibleSampleRange();

      if (selectionStart !== null && selectionEnd !== null && selectionEnd !== selectionStart) {
        const s0 = Math.min(selectionStart, selectionEnd);
        const s1 = Math.max(selectionStart, selectionEnd);
        const x0 = ((s0 - range.start) / range.length) * w;
        const x1 = ((s1 - range.start) / range.length) * w;
        ctx.fillStyle = 'rgba(229, 169, 103, 0.22)';
        ctx.fillRect(Math.max(0, x0), 0, Math.min(w, x1) - Math.max(0, x0), h);
      }

      const barCount = Math.min(peaks.length, Math.floor(w / 3));
      const barWidth = Math.max(1.5, (w / barCount) - 1);
      const midY = h / 2;

      for (let i = 0; i < barCount; i++) {
        const samplePos = range.start + (i / barCount) * range.length;
        const peakIdx = Math.min(peaks.length - 1, Math.max(0, Math.floor((samplePos / totalSamples) * peaks.length)));
        const amp = peaks[peakIdx] || 0.04;
        const barH = Math.max(3, amp * (h * 0.78));
        const x = (i / barCount) * w;
        ctx.fillStyle = samplePos <= playheadSample ? '#e5a967' : '#6bc4a6';
        ctx.fillRect(x, midY - barH / 2, barWidth, barH);
      }

      ctx.strokeStyle = 'rgba(255, 255, 255, 0.24)';
      ctx.lineWidth = 1;
      for (let r = 0; r < regions.length; r++) {
        const reg = regions[r];
        if (reg.timelineStart > range.start && reg.timelineStart < range.end) {
          const rx = ((reg.timelineStart - range.start) / range.length) * w;
          ctx.beginPath();
          ctx.moveTo(rx, 0);
          ctx.lineTo(rx, h);
          ctx.stroke();
        }
      }

      if (playheadSample >= range.start && playheadSample <= range.end) {
        const px = ((playheadSample - range.start) / range.length) * w;
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(px, 0);
        ctx.lineTo(px, h);
        ctx.stroke();
      }

      ctx.restore();
    }

    canvas.addEventListener('mousedown', function (e) {
      if (!totalSamples) return;
      dragging = true;
      dragAnchorSample = clientXToSample(e.clientX);
      selectionStart = dragAnchorSample;
      selectionEnd = dragAnchorSample;
      playheadSample = dragAnchorSample;
      onSeek(playheadSample / sampleRate);
      onSelectionChange(null);
      draw();
    });

    window.addEventListener('mousemove', function (e) {
      if (!dragging || !totalSamples) return;
      const cur = clientXToSample(e.clientX);
      selectionEnd = cur;
      if (Math.abs(selectionEnd - selectionStart) > Math.round(sampleRate * 0.03)) {
        onSelectionChange({
          startSample: Math.min(selectionStart, selectionEnd),
          endSample: Math.max(selectionStart, selectionEnd)
        });
      }
      draw();
    });

    window.addEventListener('mouseup', function () {
      if (!dragging) return;
      dragging = false;
      if (selectionStart !== null && selectionEnd !== null && Math.abs(selectionEnd - selectionStart) <= Math.round(sampleRate * 0.03)) {
        selectionStart = null;
        selectionEnd = null;
        onSelectionChange(null);
        draw();
      }
    });

    return {
      setData: function (renderedChannel, rate, edlRegions) {
        sampleRate = rate || 48000;
        totalSamples = renderedChannel ? renderedChannel.length : 0;
        peaks = computeRenderedPeaks(renderedChannel, 360);
        regions = edlRegions || [];
        if (playheadSample > totalSamples) playheadSample = totalSamples;
        draw();
      },
      setPlayheadSeconds: function (sec) {
        playheadSample = Math.max(0, Math.min(totalSamples, Math.round(sec * sampleRate)));
        draw();
      },
      getPlayheadSample: function () {
        return playheadSample;
      },
      getSelection: function () {
        if (selectionStart === null || selectionEnd === null || selectionStart === selectionEnd) return null;
        return {
          startSample: Math.min(selectionStart, selectionEnd),
          endSample: Math.max(selectionStart, selectionEnd)
        };
      },
      clearSelection: function () {
        selectionStart = null;
        selectionEnd = null;
        onSelectionChange(null);
        draw();
      },
      setZoom: function (z) {
        zoom = Math.max(1, Math.min(16, Number(z) || 1));
        draw();
      },
      draw: draw
    };
  }

  const api = {
    computeRenderedPeaks: computeRenderedPeaks,
    createWaveformEditor: createWaveformEditor
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  root.StudioWaveform = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
