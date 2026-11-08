(function () {
  'use strict';

  function computeGoertzelPower(samples, startIdx, length, targetFreq, sampleRate) {
    const k = Math.round((0.5 + (length * targetFreq) / sampleRate));
    const omega = (2 * Math.PI * k) / length;
    const coeff = 2 * Math.cos(omega);
    let q0 = 0;
    let q1 = 0;
    let q2 = 0;
    const end = Math.min(samples.length, startIdx + length);
    for (let i = startIdx; i < end; i++) {
      q0 = coeff * q1 - q2 + samples[i];
      q2 = q1;
      q1 = q0;
    }
    return q1 * q1 + q2 * q2 - q1 * q2 * coeff;
  }

  async function analyzeCreatorAudioBuffer(arrayBuffer, peakCount = 120) {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) {
      return { durationSeconds: 0, waveformPeaks: [], chapters: [] };
    }

    const ctx = new AudioCtx();
    try {
      const audioBuffer = await ctx.decodeAudioData(arrayBuffer.slice(0));
      const durationSeconds = audioBuffer.duration || 0;
      const sampleRate = audioBuffer.sampleRate || 44100;
      const channelData = audioBuffer.getChannelData(0);
      const totalSamples = channelData.length;

      const samplesPerBar = Math.max(1, Math.floor(totalSamples / peakCount));
      const rawPeaks = new Array(peakCount).fill(0);
      let maxPeak = 0.0001;

      for (let b = 0; b < peakCount; b++) {
        const start = b * samplesPerBar;
        const end = Math.min(totalSamples, start + samplesPerBar);
        const stride = Math.max(1, Math.floor((end - start) / 512));
        let sumSq = 0;
        let count = 0;
        for (let i = start; i < end; i += stride) {
          const val = channelData[i];
          sumSq += val * val;
          count++;
        }
        const rms = count > 0 ? Math.sqrt(sumSq / count) : 0;
        rawPeaks[b] = rms;
        if (rms > maxPeak) maxPeak = rms;
      }

      const waveformPeaks = rawPeaks.map(p => Number(Math.min(1, Math.max(0.03, p / maxPeak)).toFixed(3)));

      const windowSec = 5;
      const windowSamples = windowSec * sampleRate;
      const totalWindows = Math.max(1, Math.floor(totalSamples / windowSamples));
      const windowLabels = [];

      for (let w = 0; w < totalWindows; w++) {
        const wStart = w * windowSamples;
        const frameLen = Math.min(2048, totalSamples - wStart);
        if (frameLen < 256) break;

        const speechPower =
          computeGoertzelPower(channelData, wStart, frameLen, 400, sampleRate) +
          computeGoertzelPower(channelData, wStart, frameLen, 1000, sampleRate) +
          computeGoertzelPower(channelData, wStart, frameLen, 2200, sampleRate);

        const musicEdgePower =
          computeGoertzelPower(channelData, wStart, frameLen, 80, sampleRate) +
          computeGoertzelPower(channelData, wStart, frameLen, 5500, sampleRate) +
          computeGoertzelPower(channelData, wStart, frameLen, 8000, sampleRate);

        const label = speechPower >= musicEdgePower * 1.15 ? 'talk' : 'music';
        windowLabels.push({
          startTime: w * windowSec,
          type: label
        });
      }

      const chapters = [];
      let currentType = null;
      let segmentCounter = 1;
      for (let i = 0; i < windowLabels.length; i++) {
        const item = windowLabels[i];
        if (item.type !== currentType) {
          if (chapters.length > 0 && item.startTime - chapters[chapters.length - 1].startTime < 15) {
            continue;
          }
          currentType = item.type;
          chapters.push({
            startTime: item.startTime,
            title: currentType === 'talk' ? `talk ⏭ (${segmentCounter})` : `music ⏭ (${segmentCounter})`,
            kind: currentType
          });
          segmentCounter++;
        }
      }

      return {
        durationSeconds: Number(durationSeconds.toFixed(2)),
        waveformPeaks,
        chapters
      };
    } finally {
      if (typeof ctx.close === 'function') {
        await ctx.close().catch(() => {});
      }
    }
  }

  async function uploadCreatorEpisode({ showSlug, title, description, audioFile, transcriptVtt, customChapters, sessionToken }) {
    if (!showSlug || !title || !audioFile) {
      throw new Error('showSlug, title, and audioFile are required');
    }

    const authHeaders = {
      'Content-Type': 'application/json'
    };
    if (sessionToken) {
      authHeaders['X-Session-Token'] = sessionToken;
    }

    const arrayBuffer = await audioFile.arrayBuffer();
    const analysis = await analyzeCreatorAudioBuffer(arrayBuffer, 120);

    const ticketRes = await fetch('/api/studio/upload', {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        showSlug,
        filename: audioFile.name,
        contentType: audioFile.type || 'audio/mpeg',
        byteSize: arrayBuffer.byteLength
      })
    });

    if (!ticketRes.ok) {
      const errBody = await ticketRes.json().catch(() => ({}));
      throw new Error(errBody.error || `Failed to obtain upload ticket (${ticketRes.status})`);
    }

    const { ticket } = await ticketRes.json();

    const putRes = await fetch(ticket.uploadUrl, {
      method: 'PUT',
      headers: ticket.headers || { 'Content-Type': audioFile.type || 'audio/mpeg' },
      body: arrayBuffer
    });

    if (!putRes.ok) {
      const errBody = await putRes.json().catch(() => ({}));
      throw new Error(errBody.error || `Failed to upload audio to R2 (${putRes.status})`);
    }

    const uploadReceipt = await putRes.json();
    const finalChapters = Array.isArray(customChapters) && customChapters.length > 0
      ? customChapters
      : analysis.chapters;

    const epRes = await fetch('/api/studio/episodes', {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        showSlug,
        title,
        description: description || '',
        audio_key: uploadReceipt.objectKey,
        audio_content_type: uploadReceipt.contentType,
        audio_byte_size: uploadReceipt.byteSize,
        duration_seconds: analysis.durationSeconds,
        waveform_peaks: analysis.waveformPeaks,
        chapters: finalChapters,
        transcript_vtt: transcriptVtt || null
      })
    });

    if (!epRes.ok) {
      const errBody = await epRes.json().catch(() => ({}));
      throw new Error(errBody.error || `Failed to save episode metadata (${epRes.status})`);
    }

    const { episode } = await epRes.json();
    return {
      episode,
      analysis,
      uploadReceipt
    };
  }

  window.AnypodStudio = {
    analyzeCreatorAudioBuffer,
    uploadCreatorEpisode
  };
})();
