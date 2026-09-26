/**
 * @file live-dsp.js
 * @description Real-time Web Audio DSP graph providing Dynamic Voice Boost (DynamicsCompressorNode)
 * and battery-throttled Silence Skipping (AnalyserNode).
 */

import { state, elements } from '../state/store.js';

let liveAudioCtx = null;
let liveAudioSource = null;
let liveCompressor = null;
let liveGainNode = null;
let liveAnalyser = null;
let liveTimeData = null;
let liveDspInterval = null;
let silenceDurationMs = 0;
let isAcceleratingSilence = false;

/**
 * Initializes the live Web Audio graph connected to the HTMLMediaElement.
 */
export function initLiveDspGraph() {
  if (liveAudioCtx || !elements.audio) return;
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    liveAudioCtx = new AudioCtx();

    liveAudioSource = liveAudioCtx.createMediaElementSource(elements.audio);
    liveCompressor = liveAudioCtx.createDynamicsCompressor();
    liveGainNode = liveAudioCtx.createGain();
    liveAnalyser = liveAudioCtx.createAnalyser();
    liveAnalyser.fftSize = 256;
    liveTimeData = new Float32Array(liveAnalyser.fftSize);

    // Studio Spoken-Word Voice Compressor curve
    liveCompressor.threshold.setValueAtTime(-24, liveAudioCtx.currentTime);
    liveCompressor.knee.setValueAtTime(30, liveAudioCtx.currentTime);
    liveCompressor.ratio.setValueAtTime(12, liveAudioCtx.currentTime);
    liveCompressor.attack.setValueAtTime(0.003, liveAudioCtx.currentTime);
    liveCompressor.release.setValueAtTime(0.25, liveAudioCtx.currentTime);

    updateDspRouting();
    startSilenceDetectionLoop();
  } catch (err) {
    console.warn('[anypod] live audio DSP init error:', err);
  }
}

/**
 * Updates node connections based on active settings (volume boost on/off).
 */
export function updateDspRouting() {
  if (!liveAudioCtx || !liveAudioSource) return;
  try {
    if (liveAudioCtx.state === 'suspended') {
      liveAudioCtx.resume().catch(() => {});
    }

    try { liveAudioSource.disconnect(); } catch (_) {}
    try { liveCompressor.disconnect(); } catch (_) {}
    try { liveGainNode.disconnect(); } catch (_) {}
    try { liveAnalyser.disconnect(); } catch (_) {}

    const isBoost = !!state.experimentalSettings.enableVolumeBoost;

    if (isBoost) {
      liveGainNode.gain.setValueAtTime(1.35, liveAudioCtx.currentTime);
      liveAudioSource.connect(liveCompressor);
      liveCompressor.connect(liveGainNode);
      liveGainNode.connect(liveAnalyser);
    } else {
      liveAudioSource.connect(liveAnalyser);
    }
    liveAnalyser.connect(liveAudioCtx.destination);
  } catch (err) {
    console.warn('[anypod] DSP routing error:', err);
  }
}

/**
 * Resumes suspended AudioContext on user gesture.
 */
export function resumeLiveDsp() {
  if (liveAudioCtx && liveAudioCtx.state === 'suspended') {
    liveAudioCtx.resume().catch(() => {});
  }
}

/**
 * Starts periodic silence detection loop, strictly throttled when tab is inactive.
 */
export function startSilenceDetectionLoop() {
  if (liveDspInterval) clearInterval(liveDspInterval);
  liveDspInterval = setInterval(() => {
    // Battery & background throttle: skip analysis if tab is inactive or not playing
    if (!state.isTabActive || state.playbackStatus !== 'playing' || state.activeEngine !== 'audio') {
      if (isAcceleratingSilence && elements.audio) {
        elements.audio.playbackRate = state.playbackSpeed || 1.0;
        isAcceleratingSilence = false;
      }
      return;
    }

    if (!state.experimentalSettings.enableSilenceSkip || !liveAnalyser || !liveTimeData) {
      if (isAcceleratingSilence && elements.audio) {
        elements.audio.playbackRate = state.playbackSpeed || 1.0;
        isAcceleratingSilence = false;
      }
      return;
    }

    liveAnalyser.getFloatTimeDomainData(liveTimeData);
    let sum = 0;
    for (let i = 0; i < liveTimeData.length; i++) {
      sum += liveTimeData[i] * liveTimeData[i];
    }
    const rms = Math.sqrt(sum / liveTimeData.length);

    if (rms < 0.015) {
      silenceDurationMs += 100;
      if (silenceDurationMs >= 350) {
        if (!isAcceleratingSilence && elements.audio) {
          isAcceleratingSilence = true;
          elements.audio.playbackRate = 3.0;
        }
      }
    } else {
      silenceDurationMs = 0;
      if (isAcceleratingSilence && elements.audio) {
        isAcceleratingSilence = false;
        elements.audio.playbackRate = state.playbackSpeed || 1.0;
      }
    }
  }, 100);
}
