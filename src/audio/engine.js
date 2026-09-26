// app/src/audio/engine.js
// Central audio engine handling HTML5 <audio>, MediaSession integration, and event emission.

import { state } from "../state/store.js";
import { emitEvent } from "../utils/event.js";

let currentAudio = null;

/**
 * Setup audio engines (HTML5 <audio> and YouTube Iframe API) and attach event listeners.
 */
export function setupAudioEngines() {
  const audioEl = document.getElementById("audio-engine") || document.getElementById("audio-player");
  if (audioEl) {
    currentAudio = audioEl;
    try {
      audioEl.crossOrigin = "anonymous";
    } catch (_) {}

    // Forward playback events to our custom event system
    audioEl.addEventListener("play", () => emitPlaybackChanged());
    audioEl.addEventListener("pause", () => emitPlaybackChanged());
    audioEl.addEventListener("ended", onEpisodeEnded);
    audioEl.addEventListener("timeupdate", () => {
      emitEvent("anypod:timeUpdate", {
        currentTime: audioEl.currentTime || 0,
        duration: audioEl.duration || 0
      });
    });
  }

  setupMediaSession();
}

function emitPlaybackChanged() {
  const detail = {
    paused: currentAudio?.paused ?? true,
    currentTime: currentAudio?.currentTime ?? 0,
    duration: currentAudio?.duration ?? 0,
  };
  emitEvent("anypod:playbackStateChanged", detail);
  updateMediaSessionMetadata();
}

/** Play a given episode URL.
 * @param {string} url - Direct media URL or proxy URL.
 */
export function playEpisode(url) {
  if (!currentAudio) return;
  currentAudio.src = url;
  currentAudio.play().catch(() => {});
  emitPlaybackChanged();
}

export function pauseCurrentEngine() {
  currentAudio?.pause();
  emitPlaybackChanged();
}

export function resumeCurrentEngine() {
  currentAudio?.play().catch(() => {});
  emitPlaybackChanged();
}

export function toggleEpisodePlayback() {
  if (!currentAudio) return;
  if (currentAudio.paused) {
    resumeCurrentEngine();
  } else {
    pauseCurrentEngine();
  }
}

export function playNextEpisode(nextUrl) {
  if (!nextUrl) return;
  playEpisode(nextUrl);
}

export function onEpisodeEnded() {
  emitEvent("anypod:episodeEnded");
}

/** Setup MediaSession action handlers */
function setupMediaSession() {
  if (!("mediaSession" in navigator)) return;

  navigator.mediaSession.setActionHandler("play", () => {
    resumeCurrentEngine();
  });
  navigator.mediaSession.setActionHandler("pause", () => {
    pauseCurrentEngine();
  });
  navigator.mediaSession.setActionHandler("previoustrack", () => {
    if (currentAudio) {
      currentAudio.currentTime = Math.max(0, currentAudio.currentTime - 15);
    }
    emitEvent("anypod:prevTrack");
  });
  navigator.mediaSession.setActionHandler("nexttrack", () => {
    emitEvent("anypod:nextTrack");
    onEpisodeEnded();
  });
  navigator.mediaSession.setActionHandler("seekbackward", () => {
    if (currentAudio) {
      currentAudio.currentTime = Math.max(0, currentAudio.currentTime - 15);
    }
  });
  navigator.mediaSession.setActionHandler("seekforward", () => {
    if (currentAudio && currentAudio.duration) {
      currentAudio.currentTime = Math.min(currentAudio.duration, currentAudio.currentTime + 15);
    }
  });
}

/** Update MediaSession metadata based on current playback state. */
export function updateMediaSessionMetadata() {
  if (!("mediaSession" in navigator)) return;
  const ep = state?.currentEpisode;
  if (!ep) return;

  const title = ep.title || "";
  const artist = ep.podcastTitle || ep.artist || "anypod";
  const artwork = ep.artworkUrl ? [{ src: ep.artworkUrl, sizes: "512x512", type: "image/jpeg" }] : [];

  navigator.mediaSession.metadata = new MediaMetadata({
    title,
    artist,
    artwork
  });
}

// Export helper for external modules that need direct access to the audio element.
export function getAudioElement() {
  return currentAudio;
}
