/**
 * @file spectrum.js
 * @description Background HTTP Range audio probing and spectral analyzer.
 */

import { state } from '../state/store.js';

let activeProbeAbortController = null;

/**
 * Samples points across an audio file using HTTP Range requests through
 * /api/audio-proxy, decoding in a background AudioContext to measure
 * spectral energy variance and waveform distribution.
 *
 * @param {object} episode - Episode object with audioUrl.
 * @param {number} duration - Episode duration in seconds.
 */
export async function probeEpisodeAudio(episode, duration) {
  if (!episode || !episode.audioUrl || episode.isYouTube) {
    return;
  }
  if (!state.experimentalSettings.enableAudioClassifier && !state.experimentalSettings.enableVisualizer) {
    return;
  }

  if (activeProbeAbortController) {
    activeProbeAbortController.abort();
  }
  activeProbeAbortController = new AbortController();
  const { signal } = activeProbeAbortController;

  state.episodeTimeline.isProbing = true;

  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx) {
    state.episodeTimeline.isProbing = false;
    return;
  }

  const audioCtx = new AudioCtx();
  const NUM_PROBES = 24;
  const CHUNK_SIZE = 49152; // 48 KB

  try {
    let totalBytes = duration * 16000; // default 128kbps estimate
    try {
      const headRes = await fetch(`/api/audio-proxy?url=${encodeURIComponent(episode.audioUrl)}`, {
        method: 'HEAD',
        signal
      });
      const cl = headRes.headers.get('content-length');
      if (cl && parseInt(cl, 10) > 100000) {
        totalBytes = parseInt(cl, 10);
      }
    } catch (_) {}

    const barsPerProbe = Math.ceil((state.episodeTimeline.bars.length || 100) / NUM_PROBES);

    for (let p = 0; p < NUM_PROBES; p++) {
      if (signal.aborted) break;

      const probePos = p / NUM_PROBES;
      const startByte = Math.max(0, Math.floor(probePos * (totalBytes - CHUNK_SIZE - 2048)));
      const endByte = startByte + CHUNK_SIZE - 1;

      try {
        const rangeRes = await fetch(`/api/audio-proxy?url=${encodeURIComponent(episode.audioUrl)}`, {
          headers: { Range: `bytes=${startByte}-${endByte}` },
          signal
        });
        if (!rangeRes.ok && rangeRes.status !== 206) continue;

        const arrayBuf = await rangeRes.arrayBuffer();
        if (signal.aborted) break;

        const audioBuf = await audioCtx.decodeAudioData(arrayBuf);
        const channelData = audioBuf.getChannelData(0);

        let sumSquares = 0;
        let zeroCrossings = 0;
        const step = Math.max(1, Math.floor(channelData.length / 1000));
        for (let i = 0; i < channelData.length; i += step) {
          sumSquares += channelData[i] * channelData[i];
          if (i > 0 && ((channelData[i] >= 0 && channelData[i - step] < 0) || (channelData[i] < 0 && channelData[i - step] >= 0))) {
            zeroCrossings++;
          }
        }
        const rms = Math.sqrt(sumSquares / (channelData.length / step));
        const zcr = zeroCrossings / (channelData.length / step);

        const isMusic = zcr > 0.12 && rms > 0.08;
        const targetType = isMusic ? 'music' : 'speech';

        const barStart = p * barsPerProbe;
        const barEnd = Math.min(state.episodeTimeline.bars.length, barStart + barsPerProbe);
        for (let b = barStart; b < barEnd; b++) {
          if (state.episodeTimeline.bars[b]) {
            state.episodeTimeline.bars[b].type = targetType;
          }
        }
      } catch (_) {
        // Skip unparseable chunk
      }
    }
  } catch (_) {
    // Aborted or fetch failed
  } finally {
    state.episodeTimeline.isProbing = false;
    try { audioCtx.close(); } catch (_) {}
  }
}
