'use strict';

// ─────────────────────────────────────────────────────────────────────────
// SECTION 21 · Audio Engine
// Sets up all <audio> element event listeners, the seek bar, the
// position-save interval (every 8 s), MediaSession API integration,
// and YouTube poll interval (every 500 ms for progress updates).
// ─────────────────────────────────────────────────────────────────────────

let _isProxyFallbackInProgress = false;
let _advanceUnplayableTimer = null;

function handleUnplayableTrackInQueue() {
  if (_advanceUnplayableTimer) return;
  if ((state.queue && state.queue.length > 0) || state.autoplayEnabled) {
    logPlayerDiagnostic('audio.advance_unplayable', `Track failed to load: "${state.currentEpisode?.title || ''}" -> Auto-advancing to next track`);
    console.warn('[Anypod] Track unplayable. Auto-advancing playlist in 1.5s...');
    _advanceUnplayableTimer = setTimeout(() => {
      _advanceUnplayableTimer = null;
      playNextEpisode();
    }, 1500);
  }
}

function triggerAudioProxyFallback(reason) {
  if (_isProxyFallbackInProgress) return;
  if (!state.currentEpisode || !state.currentEpisode.audioUrl) return;
  if (elements.audio && elements.audio.src && elements.audio.src.includes('/api/audio-proxy')) return;

  _isProxyFallbackInProgress = true;
  state.playbackStatus = 'loading';
  syncPlaybackButtons();

  const proxySrc = `/api/audio-proxy?url=${encodeURIComponent(state.currentEpisode.audioUrl)}`;
  window.__ANYPOD_CURRENT_STREAM_URL = proxySrc;
  logPlayerDiagnostic('audio.error_proxy_fallback', `${reason}. Switching to proxy URL`);
  console.log('[Anypod Audio Stream URL (Proxy Fallback)]:', proxySrc);

  const savedTime = state.pendingStartTime || (elements.audio ? elements.audio.currentTime : 0) || 0;
  if (elements.audio) {
    elements.audio.src = proxySrc;
    if (savedTime > 1) {
      try { elements.audio.currentTime = savedTime; } catch (_) {}
      elements.audio.addEventListener('loadedmetadata', () => {
        if (savedTime > 1 && Math.abs(elements.audio.currentTime - savedTime) > 2) {
          elements.audio.currentTime = savedTime;
        }
      }, { once: true });
    } else {
      try { elements.audio.currentTime = 0; } catch (_) {}
    }

    elements.audio.playbackRate = state.playbackSpeed || 1.0;
    const playPromise = elements.audio.play();
    if (playPromise !== undefined) {
      playPromise.then(() => {
        _isProxyFallbackInProgress = false;
        state.playbackStatus = 'playing';
        syncPlaybackButtons();
        syncMediaSession(state.currentEpisode, true);
      }).catch(err => {
        _isProxyFallbackInProgress = false;
        if (err && err.name === 'AbortError') return;
        state.playbackStatus = 'paused';
        syncPlaybackButtons();
        logPlayerDiagnostic('audio.play_failed_after_fallback', err?.message || 'Playback blocked');
        handleUnplayableTrackInQueue();
      });
    }
  }
}

function setupAudioEngines() {
  const audio = elements.audio;

  const applyPendingAudioSeek = () => {
    if (state.pendingStartTime === null || state.pendingStartTime === undefined || state.pendingStartTime <= 1) return;
    const target = state.pendingStartTime;
    try {
      if (elements.audio.seekable && elements.audio.seekable.length > 0) {
        elements.audio.currentTime = target;
        state.pendingStartTime = null;
      } else if (elements.audio.duration && elements.audio.duration > 0 && isFinite(elements.audio.duration)) {
        elements.audio.currentTime = Math.min(target, elements.audio.duration);
        state.pendingStartTime = null;
      } else if (elements.audio.readyState >= 1) {
        elements.audio.currentTime = target;
        state.pendingStartTime = null;
      }
    } catch (_) {}
  };

  function triggerEpisodeEnd(reason = 'ended') {
    if (state._episodeEndedTriggered) return;
    // Stale event guard: If a track started less than 1.5s ago, ANY end event (even 'ended')
    // belongs to the prior track and must be ignored.
    if (state._trackStartTime && (Date.now() - state._trackStartTime < 1500)) {
      logPlayerDiagnostic('audio.end_ignored', `Ignored premature ${reason} within 1.5s of track start`, true);
      if (state.activeEngine === 'audio' && elements.audio && !state._userIntentionalPause) {
        setTimeout(() => {
          if (state.activeEngine === 'audio' && !state._userIntentionalPause && (state.playbackStatus === 'loading' || state.playbackStatus === 'playing') && elements.audio && elements.audio.paused) {
            logPlayerDiagnostic('audio.resume_after_prior_ended', `Resuming play for incoming track after prior EOF`, true);
            elements.audio.play().then(() => {
              state.playbackStatus = 'playing';
              syncPlaybackButtons();
            }).catch(() => {});
          }
        }, 150);
      }
      return;
    }
    // For synthetic / watchdog / near-end reasons: enforce strict 4.0s startup grace period and status === 'playing'
    if (reason !== 'event: ended') {
      if (state.playbackStatus === 'loading') return;
      if (state._trackStartTime && (Date.now() - state._trackStartTime < 4000)) return;
    }
    state._episodeEndedTriggered = true;
    if (state.activeEngine === 'audio') {
      logPlayerDiagnostic('audio.ended', `Track finished (${reason}): "${state.currentEpisode?.title || ''}" -> Advancing queue`);
      state.playbackStatus = 'loading';
      syncPlaybackButtons();
      onEpisodeEnded();
    }
  }

  function checkEpisodeEndWatchdog() {
    if (state.activeEngine !== 'audio' || !elements.audio || !state.currentEpisode) return;
    if (state._episodeEndedTriggered) return;
    // CRITICAL: Watchdog must NEVER run while loading a new track or paused.
    if (state.playbackStatus !== 'playing') return;
    if (elements.audio.paused) return;
    if (elements.audio.readyState < 2) return;
    // Stale currentTime guard: ensure track has been playing for at least 4 seconds
    if (state._trackStartTime && (Date.now() - state._trackStartTime < 4000)) return;

    const audio = elements.audio;
    const cur = audio.currentTime || 0;
    if (cur < 2.0) return;

    const rawDur = audio.duration;
    const dur = (rawDur && isFinite(rawDur) && rawDur > 0)
      ? rawDur
      : (state.currentEpisode.duration ? parseDurationSeconds(state.currentEpisode.duration) : 0);

    // If track is > 5s and currentTime is within 0.75s of the end (or past it):
    if (dur > 5 && cur >= Math.max(1, dur - 0.75)) {
      triggerEpisodeEnd('watchdog: near-end');
    }
  }

  function checkYouTubeEndWatchdog() {
    if (state.activeEngine !== 'youtube' || !state.ytPlayer || !state.currentEpisode) return;
    if (state._episodeEndedTriggered) return;
    if (state.playbackStatus !== 'playing') return;
    if (state._trackStartTime && (Date.now() - state._trackStartTime < 4000)) return;

    let cur = 0;
    let dur = 0;
    try {
      if (typeof state.ytPlayer.getCurrentTime === 'function') cur = state.ytPlayer.getCurrentTime() || 0;
      if (typeof state.ytPlayer.getDuration === 'function') dur = state.ytPlayer.getDuration() || 0;
    } catch (_) {}

    if (cur < 2.0) return;
    if (dur > 5 && cur >= Math.max(1, dur - 0.75)) {
      state._episodeEndedTriggered = true;
      logPlayerDiagnostic('youtube.watchdog_ended', `Watchdog detected track end at cur=${cur.toFixed(1)}s/${dur.toFixed(1)}s -> Advancing queue`);
      state.playbackStatus = 'loading';
      syncPlaybackButtons();
      onEpisodeEnded();
    }
  }

  audio.addEventListener('timeupdate', () => {
    if (state.activeEngine === 'audio') {
      updateProgress();
      checkEpisodeEndWatchdog();
      const cur = audio.currentTime || 0;
      if (cur > 2.5 && state._audioSpuriousPauseRetries > 0) {
        state._audioSpuriousPauseRetries = 0;
      }
    }
  });

  audio.addEventListener('loadedmetadata', () => {
    applyPendingAudioSeek();
    if (state.activeEngine === 'audio') {
      updateDuration();
      if (state.currentEpisode) {
        syncMediaSession(state.currentEpisode, false);
      }
      if (!state._userIntentionalPause && (state.playbackStatus === 'loading' || state.playbackStatus === 'playing') && audio.paused) {
        audio.play().then(() => {
          state.playbackStatus = 'playing';
          syncPlaybackButtons();
        }).catch(() => {});
      }
    }
  });

  audio.addEventListener('ended', () => {
    if (state.activeEngine === 'audio') {
      triggerEpisodeEnd('event: ended');
    }
  });

  audio.addEventListener('loadstart', () => {
    // Only set loading if audio is actively playing or attempting to play,
    // so restoring a paused episode on reload keeps the paused state intact!
    if (state.activeEngine === 'audio' && state.currentEpisode && (!audio.paused || state.playbackStatus === 'playing')) {
      state.playbackStatus = 'loading';
      syncPlaybackButtons();
    }
  });

  audio.addEventListener('waiting', () => {
    if (state.activeEngine === 'audio') {
      const cur = audio.currentTime || 0;
      const rawDur = audio.duration;
      const dur = (rawDur && isFinite(rawDur) && rawDur > 0)
        ? rawDur
        : (state.currentEpisode?.duration ? parseDurationSeconds(state.currentEpisode.duration) : 0);
      if (state.playbackStatus === 'playing' && (!state._trackStartTime || Date.now() - state._trackStartTime >= 4000) && cur > 2.0 && dur > 5 && cur >= Math.max(1, dur - 2.5)) {
        triggerEpisodeEnd('waiting-near-end');
        return;
      }
      logPlayerDiagnostic('audio.waiting', `Buffering at cur=${cur.toFixed(2)}s`, true);
      state.playbackStatus = 'loading';
      syncPlaybackButtons();
    }
  });

  audio.addEventListener('canplay', () => {
    applyPendingAudioSeek();
    if (state.activeEngine === 'audio') {
      logPlayerDiagnostic('audio.canplay', `ReadyState: ${audio.readyState}, paused: ${audio.paused}`, true);
      if (!audio.paused) {
        state.playbackStatus = 'playing';
        syncPlaybackButtons();
        if (state.currentEpisode) {
          syncMediaSession(state.currentEpisode, false);
        }
      } else if (state.playbackStatus === 'loading' || state.playbackStatus === 'playing') {
        audio.play().then(() => {
          state.playbackStatus = 'playing';
          syncPlaybackButtons();
          if (state.currentEpisode) {
            syncMediaSession(state.currentEpisode, false);
          }
        }).catch(() => {});
      }
    }
  });

  audio.addEventListener('playing', () => {
    applyPendingAudioSeek();
    if (state.activeEngine === 'audio') {
      const curTime = audio.currentTime || 0;
      logPlayerDiagnostic('audio.playing', `Playback active at cur=${curTime.toFixed(2)}s`, true);
      state.playbackStatus = 'playing';
      syncPlaybackButtons();

      if (state.currentEpisode) {
        state._nowPlayingActiveGuid = state.currentEpisode.guid;
        // Reassert playbackState and positionState without re-instantiating redundant MediaMetadata objects
        syncMediaSession(state.currentEpisode, false);

        if ('mediaSession' in navigator) {
          navigator.mediaSession.playbackState = 'playing';
        }
      }
    }
  });

  audio.addEventListener('play', () => {
    if (state.activeEngine === 'audio') {
      logPlayerDiagnostic('audio.play', `Play triggered (paused=${audio.paused}, status=${state.playbackStatus})`, true);
      if (state.playbackStatus !== 'playing') {
        state.playbackStatus = 'loading';
      }
      syncPlaybackButtons();
      if (state.currentEpisode) {
        syncMediaSession(state.currentEpisode, false);
      }
      liveTranscription.onPlayStateChange(true);
    }
  });

  audio.addEventListener('pause', () => {
    if (state.activeEngine === 'audio') {
      // 4. CRITICAL: Ignore browser pause events triggered by track completion (audio.ended)
      // or by elements.audio.src reassignments during track transitions (loading)
      if (audio.ended || state.playbackStatus === 'loading' || state._episodeEndedTriggered) {
        logPlayerDiagnostic('audio.pause_ignored', `Ignored transition pause (ended=${audio.ended}, loading=${state.playbackStatus === 'loading'}, endedTriggered=${state._episodeEndedTriggered})`, true);
        if (!state._userIntentionalPause && (state.playbackStatus === 'loading' || state.playbackStatus === 'playing')) {
          setTimeout(() => {
            if (state.activeEngine === 'audio' && !state._userIntentionalPause && (state.playbackStatus === 'loading' || state.playbackStatus === 'playing') && elements.audio && elements.audio.paused) {
              logPlayerDiagnostic('audio.resume_after_transition_pause', `Auto-reasserting audio.play() after transition pause`, true);
              elements.audio.play().then(() => {
                state.playbackStatus = 'playing';
                syncPlaybackButtons();
              }).catch(() => {});
            }
          }, 150);
        }
        return;
      }

      const cur = audio.currentTime || 0;
      const rawDur = audio.duration;
      const dur = (rawDur && isFinite(rawDur) && rawDur > 0)
        ? rawDur
        : (state.currentEpisode?.duration ? parseDurationSeconds(state.currentEpisode.duration) : 0);
      if (state.playbackStatus === 'playing' && (!state._trackStartTime || Date.now() - state._trackStartTime >= 4000) && cur > 2.0 && dur > 5 && cur >= Math.max(1, dur - 1.5)) {
        triggerEpisodeEnd('pause-near-end');
        return;
      }

      // Spurious background pause guard:
      // On mobile Android/iOS, switching tracks in the background can cause transient pauses
      // during initial buffer allocation and AudioTrack binding when the user did NOT intentionally pause!
      const isStartupPhase = cur <= 3.0 || (state._trackStartTime && (Date.now() - state._trackStartTime < 12000));
      if (document.hidden && !state._userIntentionalPause && isStartupPhase && (state._audioSpuriousPauseRetries || 0) < 8) {
        state._audioSpuriousPauseRetries = (state._audioSpuriousPauseRetries || 0) + 1;
        logPlayerDiagnostic('audio.spurious_pause', `Ignored background/startup pause at cur=${cur.toFixed(2)}s (retry ${state._audioSpuriousPauseRetries}/8)`);

        // If we have retried 5 times on direct CDN and keep getting background pauses, fall back to audio proxy
        if (state._audioSpuriousPauseRetries >= 5 && typeof triggerAudioProxyFallback === 'function' && !elements.audio.src.includes('/api/audio-proxy') && state.currentEpisode?.audioUrl) {
          triggerAudioProxyFallback(`Spurious background pauses (${state._audioSpuriousPauseRetries} retries)`);
          return;
        }

        setTimeout(() => {
          if (state.activeEngine === 'audio' && !state._userIntentionalPause && elements.audio && elements.audio.paused) {
            logPlayerDiagnostic('audio.retry_play', `Auto-reasserting audio.play() (attempt ${state._audioSpuriousPauseRetries})`);
            elements.audio.play().then(() => {
              state.playbackStatus = 'playing';
              syncPlaybackButtons();
            }).catch(err => {
              logPlayerDiagnostic('audio.retry_play_failed', err?.message || 'blocked');
            });
          }
        }, 120);
        return;
      }

      state.playbackStatus = 'paused';
      syncPlaybackButtons();
      syncMediaSession(state.currentEpisode, false);
      liveTranscription.onPlayStateChange(false);
      logPlayerDiagnostic('audio.pause', `Audio paused at cur=${cur.toFixed(2)}s (userIntentional=${Boolean(state._userIntentionalPause)})`);

      if (state.currentEpisode && audio.currentTime > 2) {
        savePlaybackPositionToD1(state.currentEpisode.guid, audio.currentTime, false);
      }
    }
  });

  let _stalledRetryCount = 0;
  let _stalledRetryTimer = null;

  audio.addEventListener('stalled', () => {
    if (state.activeEngine !== 'audio') return;
    const cur = audio.currentTime || 0;
    const rawDur = audio.duration;
    const dur = (rawDur && isFinite(rawDur) && rawDur > 0)
      ? rawDur
      : (state.currentEpisode?.duration ? parseDurationSeconds(state.currentEpisode.duration) : 0);
    if (state.playbackStatus === 'playing' && (!state._trackStartTime || Date.now() - state._trackStartTime >= 4000) && cur > 2.0 && dur > 5 && cur >= Math.max(1, dur - 2.5)) {
      triggerEpisodeEnd('stalled-near-end');
      return;
    }
    // CRITICAL: On mobile (iOS Safari & Android Chrome), browsers fire 'stalled' normally
    // whenever the audio buffer reaches capacity and pauses downloading network chunks.
    // 1. If tab is in background (screen locked / pocket), NEVER touch the audio element.
    // Calling audio.load() while hidden causes mobile OS autoplay policies to kill playback.
    if (document.hidden) return;

    // 2. If the user paused or track ended, do nothing
    if (audio.paused || audio.ended) return;

    // 3. If the audio already has enough buffered data to keep playing, this is a normal network pause
    if (audio.readyState >= 3) return;

    // Only if playback has actually halted waiting for data do we show loading
    state.playbackStatus = 'loading';
    syncPlaybackButtons();

    if (_stalledRetryTimer) return; // already retrying
    _stalledRetryCount = 0;

    const attemptResume = () => {
      if (state.activeEngine !== 'audio' || state.playbackStatus !== 'loading' || document.hidden || audio.paused) {
        if (_stalledRetryTimer) { clearTimeout(_stalledRetryTimer); _stalledRetryTimer = null; }
        return;
      }

      if (_stalledRetryCount >= 3) {
        // After repeated failed attempts, fall back to audio proxy URL
        if (state.currentEpisode && elements.audio.src && !elements.audio.src.includes('/api/audio-proxy')) {
          const proxySrc = `/api/audio-proxy?url=${encodeURIComponent(state.currentEpisode.audioUrl)}`;
          window.__ANYPOD_CURRENT_STREAM_URL = proxySrc;
          console.log('[Anypod Audio Stream URL (Proxy Fallback)]:', proxySrc);
          const savedTime = audio.currentTime;
          elements.audio.src = proxySrc;
          if (savedTime > 1) elements.audio.currentTime = savedTime;
          elements.audio.playbackRate = state.playbackSpeed || 1.0;
          const playPromise = elements.audio.play();
          if (playPromise !== undefined) {
            playPromise.then(() => {
              state.playbackStatus = 'playing';
              syncPlaybackButtons();
            }).catch(err => {
              if (err && err.name === 'AbortError') return;
              state.playbackStatus = 'paused';
              syncPlaybackButtons();
            });
          }
        }
        _stalledRetryCount = 0;
        _stalledRetryTimer = null;
        return;
      }

      _stalledRetryCount++;
      // Do NOT call audio.load() here! Calling load() dumps the hardware buffer.
      // Simply attempt to resume playback gently:
      audio.play().catch(() => {});
      _stalledRetryTimer = setTimeout(attemptResume, 2000);
    };

    _stalledRetryTimer = setTimeout(attemptResume, 3000);
  });

  // Clear stall retry on successful play or forward playback
  audio.addEventListener('playing', () => {
    _stalledRetryCount = 0;
    if (_stalledRetryTimer) { clearTimeout(_stalledRetryTimer); _stalledRetryTimer = null; }
  });

  audio.addEventListener('timeupdate', () => {
    if (_stalledRetryTimer && !audio.paused && audio.readyState >= 3) {
      _stalledRetryCount = 0;
      clearTimeout(_stalledRetryTimer);
      _stalledRetryTimer = null;
    }
  });

  audio.addEventListener('error', () => {
    if (state.activeEngine === 'audio') {
      const err = elements.audio.error;
      const isNetworkErr = err && err.code === MediaError.MEDIA_ERR_NETWORK;
      const savedTime = elements.audio.currentTime || 0;

      // 1. If not already proxied, fall back to /api/audio-proxy immediately
      if (state.currentEpisode && elements.audio.src && !elements.audio.src.includes('/api/audio-proxy')) {
        triggerAudioProxyFallback(`Code ${err?.code || 'unknown'}: ${err?.message || ''}`);
        return;
      }

      // 2. If already proxied and encountered a transient network drop (Code 2), reload and resume seamlessly
      if (isNetworkErr && state.currentEpisode && elements.audio.src) {
        state.playbackStatus = 'loading';
        syncPlaybackButtons();
        logPlayerDiagnostic('audio.reconnect_watchdog', `Transient disconnect at ${savedTime.toFixed(1)}s. Re-binding stream`);
        console.warn(`[Anypod Audio Watchdog] Stream disconnect at ${savedTime.toFixed(1)}s. Auto-reconnecting...`);
        const currentSrc = elements.audio.src;
        setTimeout(() => {
          elements.audio.src = currentSrc;
          if (savedTime > 1) {
            try { elements.audio.currentTime = savedTime; } catch (_) {}
            elements.audio.addEventListener('loadedmetadata', () => {
              if (savedTime > 1 && Math.abs(elements.audio.currentTime - savedTime) > 2) {
                elements.audio.currentTime = savedTime;
              }
            }, { once: true });
          }
          elements.audio.playbackRate = state.playbackSpeed || 1.0;
          const playPromise = elements.audio.play();
          if (playPromise !== undefined) {
            playPromise.then(() => {
              state.playbackStatus = 'playing';
              syncPlaybackButtons();
              syncMediaSession(state.currentEpisode, true);
            }).catch(err => {
              if (err && err.name === 'AbortError') return;
              state.playbackStatus = 'paused';
              syncPlaybackButtons();
              handleUnplayableTrackInQueue();
            });
          }
        }, 500);
        return;
      }

      state.playbackStatus = 'paused';
      syncPlaybackButtons();
      handleUnplayableTrackInQueue();
    }
  });

  let seekBarDebounce = null;
  const updateSeekBarVisual = (pct) => {
    elements.seekBar.style.setProperty('--seek-pct', `${pct * 100}%`);
    state._lastDrawnWaveformBarIndex = -1;
    let total = elements.audio?.duration || 0;
    if (total > 0 && elements.currentTimeLabel) {
      elements.currentTimeLabel.textContent = formatTime(pct * total);
    }
    const progressOverlay = document.getElementById('waveform-progress-overlay');
    const playheadLine = document.getElementById('waveform-playhead-line');
    if (progressOverlay) progressOverlay.style.width = `${pct * 100}%`;
    if (playheadLine) playheadLine.style.left = `${pct * 100}%`;
  };

  const commitAudioSeek = (pct) => {
    if (state.activeEngine === 'audio' && audio.duration && isFinite(audio.duration)) {
      audio.currentTime = pct * audio.duration;
    } else if (state.activeEngine === 'youtube' && state.ytPlayer && state.ytPlayer.getDuration) {
      const dur = state.ytPlayer.getDuration();
      if (dur) state.ytPlayer.seekTo(pct * dur, true);
    }
    updateProgress();
    if (state.experimentalSettings.enableVisualizer) {
      renderWaveformChart();
    }
  };

  elements.seekBar.addEventListener('input', () => {
    const pct = elements.seekBar.value / 100;
    updateSeekBarVisual(pct);
    clearTimeout(seekBarDebounce);
    seekBarDebounce = setTimeout(() => {
      commitAudioSeek(pct);
    }, 120);
  });
  elements.seekBar.addEventListener('change', () => {
    clearTimeout(seekBarDebounce);
    const pct = elements.seekBar.value / 100;
    commitAudioSeek(pct);
  });

  const miniProgBar = document.querySelector('.mini-progress-bar');
  if (miniProgBar) {
    let touchStartX = 0;
    let touchStartY = 0;
    let isTouchScrolling = false;

    // Detect touch gesture intention: if finger moves > 8px in any direction, it's a scroll!
    miniProgBar.addEventListener('touchstart', (e) => {
      if (e.touches && e.touches[0]) {
        touchStartX = e.touches[0].clientX;
        touchStartY = e.touches[0].clientY;
        isTouchScrolling = false;
      }
    }, { passive: true });

    miniProgBar.addEventListener('touchmove', (e) => {
      if (e.touches && e.touches[0]) {
        const deltaX = Math.abs(e.touches[0].clientX - touchStartX);
        const deltaY = Math.abs(e.touches[0].clientY - touchStartY);
        if (deltaX > 8 || deltaY > 8) {
          isTouchScrolling = true;
        }
      }
    }, { passive: true });

    miniProgBar.addEventListener('click', (e) => {
      e.stopPropagation();

      // 1. Guard against active page scroll or scroll-drag
      if (isTouchScrolling || document.body.classList.contains('is-scrolling')) {
        isTouchScrolling = false;
        return;
      }

      // 2. Only scrub if an episode is actually loaded
      if (!state.currentEpisode) return;

      const rect = miniProgBar.getBoundingClientRect();
      if (rect.width <= 0) return;
      const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));

      if (state.activeEngine === 'audio' && elements.audio && elements.audio.duration) {
        elements.audio.currentTime = pct * elements.audio.duration;
      } else if (state.activeEngine === 'youtube' && state.ytPlayer && state.ytPlayer.getDuration) {
        state.ytPlayer.seekTo(pct * state.ytPlayer.getDuration(), true);
      }
      updateProgress();
    });
  }

  setInterval(() => {
    if (state.currentEpisode && isEnginePlaying()) {
      let currentPos = 0;
      if (state.activeEngine === 'audio') {
        currentPos = elements.audio.currentTime || 0;
      } else if (state.activeEngine === 'youtube' && state.ytPlayer && state.ytPlayer.getCurrentTime) {
        currentPos = state.ytPlayer.getCurrentTime() || 0;
      }
      if (currentPos > 3) {
        savePlaybackPositionToD1(state.currentEpisode.guid, currentPos);
      }
    }
  }, 8000);

  setInterval(() => {
    if (state.activeEngine === 'audio' && isEnginePlaying()) {
      checkEpisodeEndWatchdog();
    } else if (state.activeEngine === 'youtube' && isEnginePlaying() && state.ytPlayer && state.ytPlayer.getCurrentTime) {
      updateProgress();
      updateDuration();
      checkYouTubeEndWatchdog();
    }
  }, 1000);

  elements.btnPlayToggle.addEventListener('click', () => {
    if (!state.currentEpisode) {
      if (state.filteredEpisodes.length > 0) {
        toggleEpisodePlayback(state.filteredEpisodes[0]);
      }
      return;
    }
    toggleEpisodePlayback(state.currentEpisode);
  });

  elements.btnPrev15.addEventListener('click', () => {
    if (state.activeEngine === 'audio') {
      audio.currentTime = Math.max(0, audio.currentTime - 15);
    } else if (state.activeEngine === 'youtube' && state.ytPlayer && state.ytPlayer.getCurrentTime) {
      const cur = state.ytPlayer.getCurrentTime();
      state.ytPlayer.seekTo(Math.max(0, cur - 15), true);
    }
  });

  elements.btnNext15.addEventListener('click', () => {
    if (state.activeEngine === 'audio' && audio.duration) {
      audio.currentTime = Math.min(audio.duration, audio.currentTime + 15);
    } else if (state.activeEngine === 'youtube' && state.ytPlayer && state.ytPlayer.getCurrentTime) {
      const cur = state.ytPlayer.getCurrentTime();
      const dur = state.ytPlayer.getDuration();
      state.ytPlayer.seekTo(Math.min(dur, cur + 15), true);
    }
  });

  elements.btnSpeedToggle.addEventListener('click', cyclePlaybackSpeed);

  if ('mediaSession' in navigator) {
    const setHandler = (action, handler) => {
      try {
        navigator.mediaSession.setActionHandler(action, handler);
      } catch (_) {}
    };

    setHandler('play', () => playCurrentEngine());
    setHandler('pause', () => pauseCurrentEngine());
    setHandler('seekbackward', (details) => {
      const skipTime = details?.seekOffset || 15;
      if (state.activeEngine === 'audio' && elements.audio) {
        elements.audio.currentTime = Math.max(0, elements.audio.currentTime - skipTime);
      } else if (state.activeEngine === 'youtube' && state.ytPlayer && state.ytPlayer.getCurrentTime) {
        const cur = state.ytPlayer.getCurrentTime();
        state.ytPlayer.seekTo(Math.max(0, cur - skipTime), true);
      }
      updateProgress();
    });
    setHandler('seekforward', (details) => {
      const skipTime = details?.seekOffset || 15;
      if (state.activeEngine === 'audio' && elements.audio && elements.audio.duration) {
        elements.audio.currentTime = Math.min(elements.audio.duration, elements.audio.currentTime + skipTime);
      } else if (state.activeEngine === 'youtube' && state.ytPlayer && state.ytPlayer.getCurrentTime) {
        const cur = state.ytPlayer.getCurrentTime();
        const dur = state.ytPlayer.getDuration();
        state.ytPlayer.seekTo(Math.min(dur, cur + skipTime), true);
      }
      updateProgress();
    });
    setHandler('previoustrack', () => {
      if (state.activeEngine === 'audio' && elements.audio) {
        elements.audio.currentTime = 0;
      } else if (state.activeEngine === 'youtube' && state.ytPlayer && state.ytPlayer.seekTo) {
        state.ytPlayer.seekTo(0, true);
      }
      updateProgress();
    });
    // Handles lock-screen / Bluetooth headphone next track button:
    setHandler('nexttrack', () => {
      onEpisodeEnded();
    });
    setHandler('seekto', (details) => {
      if (details && details.seekTime !== undefined && !isNaN(details.seekTime)) {
        seekToExactTime(details.seekTime);
      }
    });
    setHandler('stop', () => {
      pauseCurrentEngine();
      state.playbackStatus = 'idle';
      syncPlaybackButtons();
    });
  }
}

// ─────────────────────────────────────────────────────────────────────────
// SECTION 22 · Playback Control
// Core playback logic: start/pause/resume/skip episodes, track progress,
// auto-advance queue. Handles both <audio> and YouTube engines.
// Key functions: toggleEpisodePlayback, playEpisode, playNextEpisode,
// onEpisodeEnded, skipToNextEpisode, updateProgress, updateDuration.
// ─────────────────────────────────────────────────────────────────────────

function isEnginePlaying() {
  if (state.activeEngine === 'audio') {
    return !elements.audio.paused;
  } else if (state.activeEngine === 'youtube' && state.ytPlayer && state.ytPlayer.getPlayerState) {
    return state.ytPlayer.getPlayerState() === YT.PlayerState.PLAYING;
  }
  return false;
}

function playCurrentEngine() {
  state._userIntentionalPause = false;
  state._ytSpuriousPauseRetries = 0;
  if (state.activeEngine === 'audio' && elements.audio) {
    // 1. Resume suspended Web Audio context if waking up from sleep
    if (typeof liveAudioCtx !== 'undefined' && liveAudioCtx && liveAudioCtx.state === 'suspended') {
      liveAudioCtx.resume().catch(() => {});
    }

    // 2. Play with stream auto-recovery
    const playPromise = elements.audio.play();
    if (playPromise !== undefined) {
      playPromise.catch(err => {
        console.warn('[anypod] Playback interrupted on wakeup, recovering stream:', err);

        // If the network socket dropped during sleep, reload the stream source
        if (state.currentEpisode && elements.audio.networkState === HTMLMediaElement.NETWORK_NO_SOURCE) {
          const currentPos = elements.audio.currentTime || 0;
          state.pendingStartTime = currentPos > 0 ? currentPos : null;
          elements.audio.load();
          elements.audio.play().catch(() => {
            state.playbackStatus = 'paused';
            syncPlaybackButtons();
          });
        } else {
          state.playbackStatus = 'paused';
          syncPlaybackButtons();
        }
      });
    }
  } else if (state.activeEngine === 'youtube' && state.ytPlayer) {
    state.ytPlayer.playVideo();
  }
}

function pauseCurrentEngine() {
  state._userIntentionalPause = true;
  if (state.activeEngine === 'audio') {
    elements.audio.pause();
  } else if (state.activeEngine === 'youtube' && state.ytPlayer) {
    state.ytPlayer.pauseVideo();
  }
}

function toggleEpisodePlayback(episode, context = null) {
  if (state.currentEpisode && state.currentEpisode.guid === episode.guid) {
    if (state.playbackStatus === 'playing' || state.playbackStatus === 'loading') {        
      state.playbackStatus = 'paused';
      syncPlaybackButtons();
      pauseCurrentEngine();
    } else {
      state.playbackStatus = 'loading';
      syncPlaybackButtons();
      playCurrentEngine();
    }
  } else {
    state.currentEpisode = episode;
    state.playbackStatus = 'loading';
    syncPlaybackButtons();
    playEpisode(episode, null, context);
  }
}

function playEpisode(episode, overrideStartTime, context = null) {
  state._userIntentionalPause = false;
  state._ytSpuriousPauseRetries = 0;
  state._audioSpuriousPauseRetries = 0;
  state._episodeEndedTriggered = false;
  state._nowPlayingActiveGuid = null;
  state._trackStartTime = Date.now();
  state.currentEpisode = episode;
  state.playbackStatus = 'loading';

  liveTranscription.onEpisodeChange(episode);
  // Reset caption popup for the new episode
  _captionDismissed = false;
  _hideLiveCaption(false);
  syncPlaybackButtons();

  if (context && Array.isArray(context.items)) {
    state.playbackContext = {
      type: context.type || 'timeline',
      id: context.id || '',
      title: context.title || 'Timeline',
      items: context.items
    };
  } else if (!state.playbackContext || !state.playbackContext.items || state.playbackContext.items.length === 0) {
    state.playbackContext = {
      type: state.searchQuery ? 'search' : state.filterMode,
      id: '',
      title: state.searchQuery ? `Search: "${state.searchQuery}"` : 'Timeline',
      items: state.filteredEpisodes
    };
  }

  if (state.ytPlayer && state.ytPlayer.stopVideo) {
    state.ytPlayer.stopVideo();
  }

  const savedPos = state.playbackPositions[episode.guid];
  let startTime = 0;
  const epDur = episode.duration ? parseDurationSeconds(episode.duration) : 0;
  const isCompleted = savedPos && (savedPos.completed === true || savedPos.completed === 1);
  const isNearEnd = savedPos && epDur > 10 && savedPos.position >= epDur - 5;

  if (typeof overrideStartTime === 'number') {
    startTime = overrideStartTime;
  } else if (savedPos && savedPos.position > 1 && !isCompleted && !isNearEnd) {
    startTime = savedPos.position;
  } else {
    startTime = 0;
  }

  state.playbackPositions[episode.guid] = {
    position: startTime || 0,
    completed: false,
    lastListenedAt: Math.floor(Date.now() / 1000)
  };
  savePositionsToStorage();

  if (isEpisodeQueued(episode.guid)) {
    state.queue = state.queue.filter(q => q.guid !== episode.guid);
    saveQueueToStorage();
    updateQueueUI();
  }

  if (episode.isYouTube || episode.videoId || episode.playlistId) {
    // 1. Stop native audio element completely so YouTube iframe has exclusive audio focus
    if (elements.audio) {
      elements.audio.pause();
      elements.audio.removeAttribute('src');
    }

    state.activeEngine = 'youtube';
    syncMediaSession(episode, true);
    logPlayerDiagnostic('youtube.play_start', `Starting YouTube playback: "${episode.title}" (videoId=${episode.videoId || episode.playlistId || 'unknown'})`);

    if (state.ytPlayer && typeof state.ytPlayer.loadVideoById === 'function') {
      if (episode.videoId) {
        state.ytPlayer.loadVideoById(episode.videoId, startTime || 0);
      } else if (episode.isYouTubePlaylist && episode.playlistId) {
        state.ytPlayer.loadPlaylist({
          list: episode.playlistId,
          listType: 'playlist'
        });
      }
      if (state.ytPlayer.playVideo) state.ytPlayer.playVideo();
      if (state.ytPlayer.setPlaybackRate) state.ytPlayer.setPlaybackRate(state.playbackSpeed);
    } else if (window.YT && window.YT.Player) {
      const container = document.getElementById('yt-player-container');
      if (container) {
        container.innerHTML = '<div id="yt-player"></div>';
      }
      const playerConfig = {
        height: '120',
        width: '200',
        playerVars: {
          autoplay: 1,
          controls: 0,
          playsinline: 1,
          enablejsapi: 1,
          origin: window.location.origin
        },
        events: {
          onReady: (event) => {
            state.ytReady = true;
            if (startTime > 0 && event.target.seekTo) {
              event.target.seekTo(startTime, true);
            }
            if (event.target.playVideo) event.target.playVideo();
            if (event.target.setPlaybackRate) event.target.setPlaybackRate(state.playbackSpeed);
          },
          onStateChange: handleYouTubeStateChange,
          onError: handleYouTubeError
        }
      };

      if (episode.videoId) {
        playerConfig.videoId = episode.videoId;
        if (startTime > 0) {
          playerConfig.playerVars.start = Math.floor(startTime);
        }
      } else if (episode.isYouTubePlaylist && episode.playlistId) {
        playerConfig.playerVars.listType = 'playlist';
        playerConfig.playerVars.list = episode.playlistId;
      }

      state.ytPlayer = new YT.Player('yt-player', playerConfig);
    } else {
      state.pendingYouTubePlay = { episode, startTime };
      if (!document.querySelector('script[src*="youtube.com/iframe_api"]')) {
        const s = document.createElement('script');
        s.src = 'https://www.youtube.com/iframe_api';
        document.head.appendChild(s);
      }
    }
  } else {
    state.activeEngine = 'audio';
    if (elements.audio) {
      elements.audio.loop = false;
    }
    let streamUrl = episode.audioUrl;
    const isDownloaded = !!state.downloadedEpisodes[episode.guid];
    if (isDownloaded) {
      streamUrl = `${streamUrl}${streamUrl.includes('?') ? '&' : '?'}offline=1`;
    } else if (window.location.protocol === 'https:' && streamUrl.startsWith('http://')) {
      streamUrl = `/api/audio-proxy?url=${encodeURIComponent(streamUrl)}`;
    }

    window.__ANYPOD_CURRENT_STREAM_URL = streamUrl;
    window.__ANYPOD_CURRENT_EPISODE = episode;
    console.log('[Anypod Audio Stream URL]:', streamUrl);

    if (typeof liveAudioCtx !== 'undefined' && liveAudioCtx && liveAudioCtx.state === 'suspended') {
      liveAudioCtx.resume().catch(() => {});
    }
    _isProxyFallbackInProgress = false;
    state.pendingStartTime = (startTime > 1) ? startTime : null;
    // CRITICAL: Synchronize MediaSession BEFORE reassigning audio.src!
    // On mobile Android/iOS, if the tab is hidden (lockscreen playback),
    // swapping audio.src resets the decoder. If MediaSession already holds the
    // new track metadata and playbackState is 'playing', Android's NotificationManager
    // maintains the existing lockscreen player continuously instead of tearing it down!
    syncMediaSession(episode, true);

    elements.audio.src = streamUrl;
    // Do NOT call audio.load() here! Calling load() while hidden resets the user activation token and halts background playback
    elements.audio.playbackRate = state.playbackSpeed || 1.0;

    logPlayerDiagnostic('audio.play_start', `Starting "${episode.title}" via ${streamUrl.startsWith('/api/') ? 'proxy' : 'direct CDN'}`);
    const playPromise = elements.audio.play();
    if (playPromise !== undefined) {
      playPromise.then(() => {
        logPlayerDiagnostic('audio.play_promise_resolved', `Playback active for "${episode.title}"`, true);
      }).catch((err) => {
        logPlayerDiagnostic('audio.play_rejected', `${err?.name}: ${err?.message || ''}`);
        if (err && err.name === 'AbortError') {
          // CRITICAL: On background track advance, browser media pipeline resets can cause transient AbortError.
          // Retry play() after 150ms so background playback does not stall!
          setTimeout(() => {
            if (state.activeEngine === 'audio' && !state._userIntentionalPause && elements.audio && elements.audio.paused) {
              logPlayerDiagnostic('audio.abort_retry', `Retrying audio.play() after AbortError for "${episode.title}"`, true);
              elements.audio.play().then(() => {
                state.playbackStatus = 'playing';
                syncPlaybackButtons();
              }).catch(retryErr => {
                if (retryErr && retryErr.name === 'AbortError') return;
                logPlayerDiagnostic('audio.abort_retry_failed', retryErr?.message || 'blocked', true);
                if (!elements.audio.src.includes('/api/audio-proxy') && episode.audioUrl) {
                  triggerAudioProxyFallback(`AbortError retry failed (${retryErr?.message || 'blocked'})`);
                }
              });
            }
          }, 150);
          return;
        }
        // Direct play was rejected or blocked.
        // On modern mobile browsers (iOS/Android), direct audio play() can fail if user activation was lost
        // or during lockscreen transitions. Only fall back to audio proxy if this is genuinely a network/CORS error,
        // not an AbortError or transient mobile lockscreen pause.
        if (elements.audio.error && !elements.audio.src.includes('/api/audio-proxy') && episode.audioUrl) {
          triggerAudioProxyFallback(`Direct play error (${elements.audio.error?.code || err?.name || 'error'})`);
          return;
        }
        if (state.playbackStatus === 'loading') return;
        state.playbackStatus = 'paused';
        syncPlaybackButtons();
      });
    }
  }

  if (elements.playerTitle) elements.playerTitle.textContent = episode.title;
  if (elements.playerPodcast) elements.playerPodcast.textContent = episode.podcastTitle;
  if (elements.playerArtwork) {
    elements.playerArtwork.src = episode.artwork || FALLBACK_ARTWORK;
    elements.playerArtwork.onerror = () => {
      elements.playerArtwork.onerror = null;
      elements.playerArtwork.src = FALLBACK_ARTWORK;
    };
  }

  if (elements.miniTitle) elements.miniTitle.textContent = episode.title;
  if (elements.miniPodcast) elements.miniPodcast.textContent = episode.podcastTitle;
  if (elements.miniArtwork) {
    elements.miniArtwork.src = episode.artwork || FALLBACK_ARTWORK;
    elements.miniArtwork.onerror = () => {
      elements.miniArtwork.onerror = null;
      elements.miniArtwork.src = FALLBACK_ARTWORK;
    };
  }

  if (elements.playerBar) {
    elements.playerBar.classList.add('active-episode');
  }
  document.body.classList.add('has-active-episode');
  updatePlayerFavButton();
  syncPlaybackButtons();
  updateAutoplayButtonUI();
  updateShuffleButtonUI();
  loadEpisodeChapters(episode);

  if (!document.hidden) {
    renderContinueShelf();
    updateFilterBadges();
    setPlayerCollapsed(false, false);
    initOrLoadEpisodeTimeline(episode, (episode.duration ? parseDurationSeconds(episode.duration) : 0));
  }
}

const _activeYtPaginations = new Set();

/**
 * Lazily streams the full YouTube playlist in the background without UI lag.
 */
async function startYouTubeBackgroundPaging(playlistId, feedUrl, initialToken) {
  if (!playlistId) return;
  if (_activeYtPaginations.has(playlistId)) return;
  _activeYtPaginations.add(playlistId);

  const totalExpected = state.feedMetadata[feedUrl]?.episodesCount || 0;
  const currentTotal = state.allEpisodes ? state.allEpisodes.filter(e => e.feedUrl === feedUrl).length : 0;
  if (totalExpected > 0 && currentTotal >= totalExpected) {
    _activeYtPaginations.delete(playlistId);
    return;
  }

  let nextToken = initialToken || state.feedMetadata[feedUrl]?.nextToken || null;
  let isFirstBatch = !nextToken;

  try {
    while (nextToken || isFirstBatch) {
      // 500ms delay protects against rate limits & keeps the UI responsive
      await new Promise(r => setTimeout(r, 500));

      // Abort if user removed this feed and is not viewing it in detail preview
      if (!state.feeds.includes(feedUrl) && state.activeFeedDetailUrl !== feedUrl) break;

      const apiUrl = nextToken
        ? `/api/feed?batch=1&playlistId=${encodeURIComponent(playlistId)}&continuation=${encodeURIComponent(nextToken)}`
        : `/api/feed?batch=1&playlistId=${encodeURIComponent(playlistId)}`;

      isFirstBatch = false;

      let res = null;
      let retryCount = 0;
      const maxRetries = 3;

      while (retryCount <= maxRetries) {
        try {
          res = await fetch(apiUrl);
          if (res.ok) break;

          // Retry on 503 (Cloudflare worker temporarily unavailable / CPU spike), 429 (Rate limit), 524 (Timeout)
          if ((res.status === 503 || res.status === 429 || res.status === 524) && retryCount < maxRetries) {
            retryCount++;
            const backoffMs = Math.min(1000 * Math.pow(2, retryCount), 8000);
            console.warn(`[YouTube Hydration] Got HTTP ${res.status}, retrying in ${backoffMs}ms (attempt ${retryCount}/${maxRetries})...`);
            if (state.activeFeedDetailUrl === feedUrl) {
              const badge = document.getElementById('feed-episodes-badge');
              if (badge) {
                const currentEps = state.allEpisodes.filter(e => e.feedUrl === feedUrl);
                const expected = state.feedMetadata[feedUrl]?.episodesCount || currentEps.length;
                badge.textContent = `${currentEps.length} / ${expected} episodes (retrying in ${Math.round(backoffMs / 1000)}s...)`;
              }
            }
            await new Promise(r => setTimeout(r, backoffMs));
            continue;
          }
        } catch (netErr) {
          if (retryCount < maxRetries) {
            retryCount++;
            const backoffMs = Math.min(1000 * Math.pow(2, retryCount), 8000);
            console.warn(`[YouTube Hydration] Network error, retrying in ${backoffMs}ms:`, netErr);
            await new Promise(r => setTimeout(r, backoffMs));
            continue;
          }
        }
        break;
      }

      if (!res || !res.ok) {
        console.warn(`[YouTube Hydration] Batch request stopped with HTTP ${res ? res.status : 'NetworkError'}.`);
        break;
      }

      const batch = await res.json();
      if (!batch.episodes || batch.episodes.length === 0) {
        nextToken = batch.nextToken || null;
        if (state.feedMetadata[feedUrl]) {
          state.feedMetadata[feedUrl].nextToken = nextToken;
        }
        if (!nextToken) break;
        continue;
      }

      // Deduplicate against state.allEpisodes
      const currentGuids = new Set(state.allEpisodes.map(e => e.guid));
      let addedAny = false;

      for (const ep of batch.episodes) {
        if (!currentGuids.has(ep.guid)) {
          currentGuids.add(ep.guid);
          ep.feedUrl = feedUrl;
          if (state.feedMetadata[feedUrl]?.title) {
            ep.podcastTitle = state.feedMetadata[feedUrl].title;
          }
          state.allEpisodes.push(ep);
          addedAny = true;
        }
      }

      nextToken = batch.nextToken || null;
      if (state.feedMetadata[feedUrl]) {
        state.feedMetadata[feedUrl].nextToken = nextToken;
      }

      if (addedAny) {
        saveCacheToStorage();
        processAndSortEpisodes();
        renderTimeline();
        // Keep Feed Detail view up to date while user is browsing this feed
        if (state.activeFeedDetailUrl === feedUrl && typeof renderFeedDetail === 'function') {
          renderFeedDetail(feedUrl);
        }
      }

      const currentEpCount = state.allEpisodes ? state.allEpisodes.filter(e => e.feedUrl === feedUrl).length : 0;
      const targetEpCount = state.feedMetadata[feedUrl]?.episodesCount || 0;
      if (targetEpCount > 0 && currentEpCount >= targetEpCount) {
        break;
      }
    }
  } catch (err) {
    console.warn('[YouTube Hydration] Paging stopped:', err);
  } finally {
    _activeYtPaginations.delete(playlistId);
    if (state.activeFeedDetailUrl === feedUrl && typeof renderFeedDetail === 'function') {
      renderFeedDetail(feedUrl);
    }
  }
}

function updatePlaylistCountBadges(feedUrl, loadedCount, expectedTotal) {
  // Target any badge displaying episode count for this feed
  const badges = document.querySelectorAll(`[data-feed-badge="${feedUrl}"], .feed-item[data-url="${feedUrl}"] .feed-count`);

  badges.forEach(badge => {
    if (expectedTotal && loadedCount < expectedTotal) {
      badge.textContent = `${loadedCount} / ${expectedTotal} ep (syncing...)`;
      badge.classList.add('is-syncing');
    } else {
      badge.textContent = `${loadedCount} episodes`;
      badge.classList.remove('is-syncing');
    }
  });
}

let _lastPositionStateUpdate = 0;

function updateProgress() {
  let current = 0;
  let total = 0;

  if (state.activeEngine === 'audio') {
    current = elements.audio.currentTime || 0;
    total = elements.audio.duration || 0;
  } else if (state.activeEngine === 'youtube' && state.ytPlayer && state.ytPlayer.getCurrentTime) {
    current = state.ytPlayer.getCurrentTime() || 0;
    total = state.ytPlayer.getDuration() || 0;
  }

  // 1. Lock-screen MediaSession scrubber: throttled so OS doesn't receive redundant IPC spam
  const now = Date.now();
  if ('mediaSession' in navigator && 'setPositionState' in navigator.mediaSession && total > 0 && isFinite(total)) {
    if (now - _lastPositionStateUpdate > 3000) {
      _lastPositionStateUpdate = now;
      const accelerating = typeof isAcceleratingSilence !== 'undefined' && isAcceleratingSilence;
      try {
        navigator.mediaSession.setPositionState({
          duration: Math.max(0.1, total),
          playbackRate: (accelerating ? 2.5 : (state.playbackSpeed || 1.0)),
          position: Math.min(Math.max(0, current), total)
        });
      } catch (_) {}
    }
  }

  // 2. Sleep timer volume fadeout (keeps working in background)
  if (state.sleepTimer.active && state.sleepTimer.fadeout && state.sleepTimer.endTime) {
    const remainingSec = Math.max(0, (state.sleepTimer.endTime - Date.now()) / 1000);
    if (remainingSec <= 30 && remainingSec > 0) {
      if (state.activeEngine === 'audio') {
        elements.audio.volume = Math.max(0, (remainingSec / 30) * state.sleepTimer.initialVolume);
      } else if (state.activeEngine === 'youtube' && state.ytPlayer) {
        state.ytPlayer.setVolume(Math.max(0, (remainingSec / 30) * 100));
      }
    }
  }

  // 3. BATTERY GUARD: If phone is locked or tab is hidden, skip all DOM layout queries & visual repaints
  if (document.hidden || !state.isTabActive) {
    return;
  }

  updateActiveChapter(current);

  const currentInt = Math.floor(current);
  if (updateProgress._lastDomSync !== currentInt) {
    updateProgress._lastDomSync = currentInt;

    if (elements.currentTimeLabel) {
      elements.currentTimeLabel.textContent = formatTime(current);
    }
    if (elements.totalDurationLabel) {
      if (total > 0 && state.showRemainingTime && total > current) {
        elements.totalDurationLabel.textContent = `-${formatTime(total - current)}`;
      } else if (total > 0) {
        elements.totalDurationLabel.textContent = formatTime(total);
      } else {
        elements.totalDurationLabel.textContent = '0:00';
      }
    }

    if (state.currentEpisode) {
      const activeCards = document.querySelectorAll(`.episode-card[data-guid="${CSS.escape(state.currentEpisode.guid)}"]`);
      const cardPct = total > 0 ? (current / total) * 100 : 0;
      activeCards.forEach(card => {
        let track = card.querySelector('.ep-progress-track');
        let fill = card.querySelector('.ep-progress-fill');
        if (!track && current > 2) {
          track = document.createElement('div');
          track.className = 'ep-progress-track';
          track.title = 'Click or scrub to resume at any point';
          fill = document.createElement('div');
          fill.className = 'ep-progress-fill';
          track.appendChild(fill);
          const footer = card.querySelector('.episode-footer');
          if (footer) {
            card.insertBefore(track, footer);
            setupProgressTrackInteractivity(track, card, state.currentEpisode);
          }
        }
        if (fill) {
          fill.style.width = `${Math.min(100, Math.max(1, cardPct))}%`;
        }
        let resumeBadge = card.querySelector('.ep-resume-time');
        if (!resumeBadge && current > 2) {
          const meta = card.querySelector('.episode-meta');
          if (meta) {
            resumeBadge = document.createElement('span');
            resumeBadge.className = 'ep-resume-time';
            resumeBadge.title = 'Click to resume playback';
            meta.appendChild(resumeBadge);
            resumeBadge.addEventListener('click', (e) => {
              e.stopPropagation();
              toggleEpisodePlayback(state.currentEpisode);
            });
          }
        }
        if (resumeBadge) {
          resumeBadge.textContent = `• Resumes at ${formatTime(current)}`;
        }
      });
    }
  }

  if (total > 0) {
    const pct = (current / total) * 100;
    if (elements.seekBar) {
      elements.seekBar.value = pct;
      elements.seekBar.style.setProperty('--seek-pct', `${pct}%`);
    }
    if (elements.miniProgressFill) {
      elements.miniProgressFill.style.width = `${pct}%`;
    }
    if (elements.waveformPlayheadLine) {
      elements.waveformPlayheadLine.style.left = `${pct}%`;
    }
    if (elements.waveformTimelineWrap) {
      elements.waveformTimelineWrap.setAttribute('aria-valuenow', Math.round(pct));
    }

    const dur = state.episodeTimeline.duration || total || 0;
    const progressRatio = dur > 0 ? (current / dur) : (pct / 100);
    state.episodeTimeline.progressPct = progressRatio;

    const barCount = (state.episodeTimeline.bars && state.episodeTimeline.bars.length) || 85;
    const curBarIdx = Math.floor(progressRatio * barCount);
    
    if (state._lastDrawnWaveformBarIndex !== curBarIdx) {
      state._lastDrawnWaveformBarIndex = curBarIdx;
      if (state.experimentalSettings.enableVisualizer) {
        renderWaveformChart();
      }
    }

    if (state.experimentalSettings.autoSkipSpeech && isEnginePlaying()) {
      const segments = state.episodeTimeline.segments || [];
      const currentSegment = segments.find(s => current >= s.start && current < s.end);

      if (currentSegment && currentSegment.type === 'speech') {
        if (!state._autoSkipTimer) {
          state._autoSkipTimer = setTimeout(() => {
            if (state.experimentalSettings.autoSkipSpeech && isEnginePlaying()) {
              jumpToNextSegment('music');
              showToast('⚡ skipped talk section');
            }
            state._autoSkipTimer = null;
          }, 1500);
        }
      } else if (state._autoSkipTimer) {
        clearTimeout(state._autoSkipTimer);
        state._autoSkipTimer = null;
      }
    }

    // Live transcript cue karaoke highlight & auto-scroll
    if (elements.showTranscriptContent && !elements.showTranscriptContent.classList.contains('hidden')) {
      const cueEls = elements.transcriptCuesList ? elements.transcriptCuesList.querySelectorAll('.transcript-cue') : [];
      cueEls.forEach(el => {
        const start = parseFloat(el.dataset.start);
        const end = parseFloat(el.dataset.end);
        const isActive = current >= start && current <= end;
        if (isActive !== el.classList.contains('is-active')) {
          el.classList.toggle('is-active', isActive);
          if (isActive) {
            el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
          }
        }
      });
    }

    // Live transcription: notify on time update (throttled to ~2s)
    if (state.experimentalSettings.enableLiveTranscript) {
      const nowMs = Date.now();
      if (!updateProgress._lastLiveTick || nowMs - updateProgress._lastLiveTick > 2000) {
        updateProgress._lastLiveTick = nowMs;
        liveTranscription.onTimeUpdate(current);
      }
    }
  }
}

function updateDuration() {
  let dur = 0;
  if (state.activeEngine === 'audio') {
    dur = elements.audio.duration;
  } else if (state.activeEngine === 'youtube' && state.ytPlayer && state.ytPlayer.getDuration) {
    dur = state.ytPlayer.getDuration();
  }
  if (dur && isFinite(dur) && dur > 0) {
    const formatted = formatTime(dur);
    elements.totalDurationLabel.textContent = formatted;
    if (state.currentEpisode) {
      state.currentEpisode.duration = formatted;
      const matchAll = state.allEpisodes.find(e => e.guid === state.currentEpisode.guid);
      if (matchAll) matchAll.duration = formatted;
      const matchFiltered = state.filteredEpisodes.find(e => e.guid === state.currentEpisode.guid);
      if (matchFiltered) matchFiltered.duration = formatted;
      const card = document.querySelector(`.episode-card[data-guid="${CSS.escape(state.currentEpisode.guid)}"]`);
      if (card) {
        const durBadge = card.querySelector('.episode-duration');
        if (durBadge && (!durBadge.textContent || durBadge.textContent === '0:00')) {
          durBadge.textContent = formatted;
        }
      }
      if (state.episodeTimeline.guid !== state.currentEpisode.guid || !state.episodeTimeline.duration || state.episodeTimeline.duration <= 0) {
        if (!document.hidden && state.isTabActive) {
          initOrLoadEpisodeTimeline(state.currentEpisode, dur);
        }
      }
    }
  }
}

function playNextEpisode() {
  let nextEp = null;

  // 1. Manual user queue always takes priority
  if (state.queue && state.queue.length > 0) {
    if (document.hidden && state.activeEngine === 'audio') {
      // Only if device is playing audio in the background:
      // skip YouTube tracks to avoid mobile browser iframe autoplay block.
      const audioIdx = state.queue.findIndex(ep => !ep.isYouTube && !ep.videoId && !ep.playlistId);
      if (audioIdx !== -1) {
        nextEp = state.queue.splice(audioIdx, 1)[0];
        saveQueueToStorage();
        updateQueueUI();
      } else {
        logPlayerDiagnostic('audio.bg_yt_skipped', `Skipped background YouTube queue tracks to avoid mobile audio freeze`);
      }
    } else {
      nextEp = state.queue.shift();
      saveQueueToStorage();
      updateQueueUI();
    }
  }
  
  if (!nextEp && state.autoplayEnabled) {
    // 2. Only pull auto-play candidate if autoplay is enabled
    const autoList = getAutoQueueEpisodes(1);
    if (autoList.length > 0) {
      nextEp = autoList[0];
    }
  }

  // 3. Play next or stop engine completely
  if (nextEp) {
    const isYt = Boolean(nextEp.isYouTube || nextEp.videoId || nextEp.playlistId);
    logPlayerDiagnostic(isYt ? 'youtube.advance_next' : 'audio.advance_next', `Advancing queue to: "${nextEp.title}" (engine=${isYt ? 'youtube' : 'audio'}, autoplay=${Boolean(state.autoplayEnabled)}, queueLeft=${state.queue?.length || 0})`);
    playEpisode(nextEp, null, state.playbackContext);
    if (!document.hidden) {
      processAndSortEpisodes();
      renderTimeline();
      renderContinueShelf();
      if (state.activeFeedDetailUrl) {
        renderFeedDetail(state.activeFeedDetailUrl);
      }
    }
  } else {
    state.playbackStatus = 'idle';
    pauseCurrentEngine();
    syncPlaybackButtons();
  }
}

function onEpisodeEnded() {
  if (state.currentEpisode) {
    savePlaybackPositionToD1(state.currentEpisode.guid, 0, true);
  }

  if (state.sleepTimer.active) {
    if (state.sleepTimer.minutes === 'end') {
      stopSleepTimer();
      pauseCurrentEngine();
      return;
    }
    if (state.sleepTimer.minutes === 'end-queue') {
      if (!state.queue || state.queue.length === 0) {
        stopSleepTimer();
        pauseCurrentEngine();
        return;
      }
    }
  }

  playNextEpisode();
}

function skipToNextEpisode(markCompleted = false) {
  if (!state.currentEpisode) return;
  state._episodeEndedTriggered = false;
  const curEp = state.currentEpisode;
  if (markCompleted) {
    savePlaybackPositionToD1(curEp.guid, 0, true);
    if (isEpisodeQueued(curEp.guid)) {
      removeFromQueue(curEp.guid);
    }
  } else {
    let curPos = 0;
    if (state.activeEngine === 'audio' && elements.audio) {
      curPos = elements.audio.currentTime || 0;
    } else if (state.activeEngine === 'youtube' && state.ytPlayer && state.ytPlayer.getCurrentTime) {
      curPos = state.ytPlayer.getCurrentTime() || 0;
    }
    if (curPos > 2) {
      savePlaybackPositionToD1(curEp.guid, curPos, false);
    }
  }
  renderContinueShelf();
  playNextEpisode();
}

// ─────────────────────────────────────────────────────────────────────────
// SECTION 23 · Player UI Sync
// syncPlaybackButtons keeps play/pause icons, episode cards, and mini
// player in sync with state.playbackStatus.
// ─────────────────────────────────────────────────────────────────────────
function updateAutoplayButtonUI() {
  const btn = elements.btnAutoplayToggle || document.getElementById('btn-autoplay-toggle');
  if (!btn) return;

  const isEnabled = state.autoplayEnabled === true;
  btn.classList.toggle('active', isEnabled);
  btn.setAttribute('aria-pressed', String(isEnabled));
  btn.title = isEnabled
    ? `Autoplay ON (${state.playbackContext?.title || 'Timeline'})`
    : 'Autoplay OFF';
}

function updateShuffleButtonUI() {
  const btn = elements.btnPlayerShuffle || document.getElementById('btn-player-shuffle');
  if (btn) {
    const isShuffle = state.isShuffle === true;
    btn.classList.toggle('active', isShuffle);
    btn.setAttribute('aria-pressed', String(isShuffle));
    btn.title = isShuffle ? 'Shuffle Playback (ON)' : 'Shuffle Playback (OFF)';
  }
  const feedShuffleBtn = document.getElementById('btn-feed-shuffle');
  if (feedShuffleBtn) {
    const isShuffle = state.isShuffle === true;
    feedShuffleBtn.classList.toggle('is-active', isShuffle);
    feedShuffleBtn.setAttribute('aria-pressed', String(isShuffle));
    feedShuffleBtn.title = isShuffle ? 'Shuffle mode ON (click to disable)' : 'Shuffle mode OFF (click to enable)';
  }
  const chk = document.getElementById('chk-feed-shuffle');
  if (chk) {
    chk.checked = state.isShuffle === true;
  }
}

function toggleShuffle() {
  state.isShuffle = !state.isShuffle;
  storage.setItem(STORAGE_KEYS.SHUFFLE, String(state.isShuffle));
  updateShuffleButtonUI();
  showToast(state.isShuffle ? 'Shuffle mode ON' : 'Shuffle mode OFF');
  if (elements.queueModal && !elements.queueModal.classList.contains('hidden')) {
    renderQueueModalContent();
  }
}

function syncMediaSession(episode, forceReassert = false) {
  if (!('mediaSession' in navigator) || !episode) return;

  try {
    const feedMeta = (state.feedMetadata && episode.feedUrl) ? state.feedMetadata[episode.feedUrl] : null;
    let rawArt = episode.artwork || episode.image || (feedMeta && (feedMeta.artwork || feedMeta.image)) || '';

    if (!rawArt && typeof FALLBACK_ARTWORK !== 'undefined') {
      rawArt = FALLBACK_ARTWORK;
    }

    let resolvedArt = '';
    const isSvg = rawArt && (rawArt.includes('data:image/svg') || rawArt.endsWith('.svg') || rawArt.includes('.svg?'));
    if (rawArt && !rawArt.startsWith('data:') && !isSvg) {
      try {
        if (window.location.protocol === 'https:' && rawArt.startsWith('http://')) {
          resolvedArt = new URL(`/api/audio-proxy?url=${encodeURIComponent(rawArt)}`, window.location.origin).href;
        } else {
          resolvedArt = new URL(rawArt, window.location.origin).href;
        }
      } catch (_) {
        resolvedArt = '';
      }
    }

    const artworkList = [];
    if (resolvedArt && !isSvg) {
      // Multi-resolution episode artwork: omit 'type' to let Chromium & iOS inspect magic bytes
      // and decode JPEG, PNG, or WebP regardless of CDN params or headers
      artworkList.push(
        { src: resolvedArt, sizes: '96x96' },
        { src: resolvedArt, sizes: '128x128' },
        { src: resolvedArt, sizes: '192x192' },
        { src: resolvedArt, sizes: '256x256' },
        { src: resolvedArt, sizes: '384x384' },
        { src: resolvedArt, sizes: '512x512' }
      );
    } else {
      // Fallback to local PWA icons ONLY when no episode/podcast artwork is available
      artworkList.push(
        { src: new URL('/icon-512.png', window.location.origin).href, sizes: '512x512', type: 'image/png' },
        { src: new URL('/icon-192.png', window.location.origin).href, sizes: '192x192', type: 'image/png' }
      );
    }

    const titleStr = episode.title || 'Untitled Episode';
    const artistStr = episode.podcastTitle || 'Podcast';

    document.title = `${titleStr} • ${artistStr} — anypod`;

    // Debounce MediaMetadata: Only instantiate a new MediaMetadata object when the episode actually changes,
    // on forceReassert (e.g. chapter artwork change), or if metadata is uninitialized.
    const metadataNeedsUpdate = !navigator.mediaSession.metadata || state._mediaSessionGuid !== episode.guid || forceReassert;

    if (metadataNeedsUpdate) {
      state._mediaSessionGuid = episode.guid;
      navigator.mediaSession.metadata = new MediaMetadata({
        title: titleStr,
        artist: artistStr,
        album: artistStr,
        artwork: artworkList
      });
      logPlayerDiagnostic('mediasession.synced', `Title: "${titleStr}", Artist: "${artistStr}", ArtCount: ${artworkList.length}`, true);
    }

    // Maintain playing state during transitions to keep lockscreen alive
    if (state.playbackStatus === 'paused') {
      navigator.mediaSession.playbackState = 'paused';
    } else {
      navigator.mediaSession.playbackState = 'playing';
    }

    // Always reset or update positionState immediately so Android lockscreen never holds
    // the previous track's end-of-track (position == duration) state, which causes OS dismissal!
    if ('setPositionState' in navigator.mediaSession) {
      let durSec = 0;
      let curSec = 0;

      if (state.activeEngine === 'audio' && elements.audio) {
        if (elements.audio.duration && isFinite(elements.audio.duration) && elements.audio.duration > 0) {
          durSec = elements.audio.duration;
        } else if (episode.duration) {
          durSec = parseDurationSeconds(episode.duration);
        }
        curSec = elements.audio.currentTime || 0;
      } else if (state.activeEngine === 'youtube' && state.ytPlayer) {
        if (typeof state.ytPlayer.getDuration === 'function') {
          const yd = state.ytPlayer.getDuration();
          if (yd && isFinite(yd) && yd > 0) durSec = yd;
        }
        if (typeof state.ytPlayer.getCurrentTime === 'function') {
          curSec = state.ytPlayer.getCurrentTime() || 0;
        }
        if (!durSec && episode.duration) {
          durSec = parseDurationSeconds(episode.duration);
        }
      }

      if (durSec > 0 && isFinite(durSec) && curSec >= 0) {
        const now = Date.now();
        if (now - _lastPositionStateUpdate >= 2500 || forceReassert) {
          _lastPositionStateUpdate = now;
          try {
            navigator.mediaSession.setPositionState({
              duration: Math.max(0.1, durSec),
              playbackRate: state.playbackSpeed || 1.0,
              position: Math.min(curSec, durSec)
            });
          } catch (_) {}
        }
      } else if (forceReassert) {
        try {
          navigator.mediaSession.setPositionState({
            duration: 1.0,
            playbackRate: state.playbackSpeed || 1.0,
            position: 0
          });
        } catch (_) {}
      }
    }
  } catch (err) {
    console.warn('[Anypod MediaSession] sync failed:', err);
  }
}

function syncPlaybackButtons() {
  const isPlaying = state.playbackStatus === 'playing';
  const isLoading = state.playbackStatus === 'loading';

  if (elements.iconPlay && elements.iconPause && elements.iconSpinner) {
    if (isLoading) {
      elements.iconPlay.classList.add('hidden');
      elements.iconPause.classList.add('hidden');
      elements.iconSpinner.classList.remove('hidden');
    } else if (isPlaying) {
      elements.iconPlay.classList.add('hidden');
      elements.iconPause.classList.remove('hidden');
      elements.iconSpinner.classList.add('hidden');
    } else {
      elements.iconPlay.classList.remove('hidden');
      elements.iconPause.classList.add('hidden');
      elements.iconSpinner.classList.add('hidden');
    }
  }

  if ('mediaSession' in navigator) {
    navigator.mediaSession.playbackState = (isPlaying || isLoading) 
      ? 'playing' 
      : (state.playbackStatus === 'paused' ? 'paused' : 'none');
  }

  if (elements.miniIconPlay && elements.miniIconPause && elements.miniIconSpinner) {
    if (isLoading) {
      elements.miniIconPlay.classList.add('hidden');
      elements.miniIconPause.classList.add('hidden');
      elements.miniIconSpinner.classList.remove('hidden');
    } else if (isPlaying) {
      elements.miniIconPlay.classList.add('hidden');
      elements.miniIconPause.classList.remove('hidden');
      elements.miniIconSpinner.classList.add('hidden');
    } else {
      elements.miniIconPlay.classList.remove('hidden');
      elements.miniIconPause.classList.add('hidden');
      elements.miniIconSpinner.classList.add('hidden');
    }
  }

  // if (elements.showNotesModal && !elements.showNotesModal.classList.contains('hidden') && state.currentEpisode) {
  //   syncShowNotesPlayButton(state.currentEpisode);
  // }
  if (elements.showNotesModal && !elements.showNotesModal.classList.contains('hidden') && state.activeNotesEpisode) {
    syncShowNotesPlayButton(state.activeNotesEpisode);
  }

  const cards = document.querySelectorAll('.episode-card');
  cards.forEach(card => {
    const guid = card.dataset.guid;
    const btn = card.querySelector('.btn-play-ep');
    if (!btn) return;

    const isThisActive = state.currentEpisode && state.currentEpisode.guid === guid && state.playbackStatus !== 'idle';
    
    if (isThisActive) {
      card.classList.add('playing');
      if (isLoading) {
        btn.innerHTML = CARD_ICONS.SPINNER;
        btn.title = 'Loading...';
      } else if (isPlaying) {
        btn.innerHTML = CARD_ICONS.PAUSE;
        btn.title = 'Pause';
      } else {
        btn.innerHTML = CARD_ICONS.PLAY;
        btn.title = 'Play';
      }
    } else {
      card.classList.remove('playing');
      btn.innerHTML = CARD_ICONS.PLAY;
      btn.title = 'Play';
    }
  });

  const recentRows = document.querySelectorAll('.recent-ep-row');
  recentRows.forEach(row => {
    const guid = row.dataset.guid;
    const btn = row.querySelector('.btn-recent-play');
    if (!btn) return;
    if (state.currentEpisode && state.currentEpisode.guid === guid) {
      row.classList.add('active');
      if (isLoading) {
        btn.innerHTML = `<span class="spinner" style="width: 10px; height: 10px;"></span>`;
        btn.classList.remove('is-playing');
      } else if (isPlaying) {
        btn.innerHTML = `<svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>`;
        btn.classList.add('is-playing');
      } else {
        btn.innerHTML = `<svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>`;
        btn.classList.remove('is-playing');
      }
    } else {
      row.classList.remove('active');
      btn.innerHTML = `<svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>`;
      btn.classList.remove('is-playing');
    }
  });
}

function updatePlayerUI(isPlaying) {
  state.playbackStatus = isPlaying ? 'playing' : 'paused';
  syncPlaybackButtons();
  updatePlayerFavButton();
  updateQueueUI();
}
function setPlayerCollapsed(collapsed, save = true) {
  if (collapsed) {
    // console.log('[Anypod Debug] Player MINIMIZED (collapsed = true). Triggered by:', new Error().stack);
    document.body.classList.add('has-mini-player');
    document.body.classList.remove('has-full-player');
    if (elements.btnCollapsePlayer) elements.btnCollapsePlayer.setAttribute('aria-expanded', 'false');
    if (elements.miniToggle) elements.miniToggle.setAttribute('aria-expanded', 'false');
  } else {
    // console.log('[Anypod Debug] Player EXPANDED (collapsed = false).');
    // Cooldown timer to prevent background reflows from immediately re-collapsing
    state._lastPlayerExpandTime = Date.now();
    document.body.classList.remove('has-mini-player');
    document.body.classList.add('has-full-player');
    if (elements.btnCollapsePlayer) elements.btnCollapsePlayer.setAttribute('aria-expanded', 'true');
    if (elements.miniToggle) elements.miniToggle.setAttribute('aria-expanded', 'true');
    requestAnimationFrame(() => renderWaveformChart());
    setTimeout(() => renderWaveformChart(), 350);
  }
  if (save) {
    try {
      storage.setItem('anypod_player_collapsed', collapsed ? 'true' : 'false');
    } catch (e) {}
  }
}

function cyclePlaybackSpeed() {
  const speeds = [1.0, 1.25, 1.5, 2.0, 0.8];
  let nextIdx = speeds.indexOf(state.playbackSpeed) + 1;
  if (nextIdx >= speeds.length) nextIdx = 0;

  state.playbackSpeed = speeds[nextIdx];
  
  if (state.activeEngine === 'audio') {
    elements.audio.playbackRate = state.playbackSpeed;
  } else if (state.activeEngine === 'youtube' && state.ytPlayer && state.ytPlayer.setPlaybackRate) {
    state.ytPlayer.setPlaybackRate(state.playbackSpeed);
  }

  elements.btnSpeedToggle.textContent = `${state.playbackSpeed}x`;
}

// ─────────────────────────────────────────────────────────────────────────
// SECTION 24 · Sleep Timer
// Pauses playback after a set duration, with optional volume fadeout.
// ─────────────────────────────────────────────────────────────────────────

function updateSleepTimerUI() {
  const isActive = Boolean(state.sleepTimer && state.sleepTimer.active);
  const currentMin = state.sleepTimer ? state.sleepTimer.minutes : 0;

  elements.timerBtns.forEach(btn => {
    const val = btn.dataset.minutes;
    if (val === '0') {
      btn.classList.toggle('is-inactive', !isActive);
      return;
    }
    const isThisActive = isActive && (
      val === String(currentMin) ||
      (val === 'end' && currentMin === 'end') ||
      (val === 'end-queue' && currentMin === 'end-queue')
    );
    btn.classList.toggle('active', Boolean(isThisActive));
  });

  const statusEl = document.getElementById('sleep-status-text');
  if (statusEl) {
    if (isActive) {
      if (state.sleepTimer.endTime) {
        const remainingSec = Math.max(0, Math.round((state.sleepTimer.endTime - Date.now()) / 1000));
        const remainingMin = Math.ceil(remainingSec / 60);
        statusEl.innerHTML = `<span style="color: var(--primary); font-weight: 600;">● Active:</span> stops in <strong>${remainingMin} min</strong> (${formatTime(remainingSec)})`;
      } else if (currentMin === 'end') {
        statusEl.innerHTML = `<span style="color: var(--primary); font-weight: 600;">● Active:</span> stops at <strong>end of current episode</strong>`;
      } else if (currentMin === 'end-queue') {
        statusEl.innerHTML = `<span style="color: var(--primary); font-weight: 600;">● Active:</span> stops at <strong>end of queue</strong>`;
      }
    } else {
      statusEl.textContent = 'Automatically stop audio playback after specified time:';
    }
  }

  if (elements.sleepBadge) {
    if (isActive) {
      elements.sleepBadge.classList.remove('hidden');
      if (state.sleepTimer.endTime) {
        const remainingMin = Math.max(1, Math.ceil((state.sleepTimer.endTime - Date.now()) / 60000));
        elements.sleepBadge.textContent = `${remainingMin}m`;
      } else {
        elements.sleepBadge.textContent = '✓';
      }
    } else {
      elements.sleepBadge.classList.add('hidden');
      elements.sleepBadge.textContent = '';
    }
  }
}

function startSleepTimer(minutes) {
  if (state.sleepTimer.intervalId) {
    clearInterval(state.sleepTimer.intervalId);
  }

  if (minutes === 0 || minutes === '0') {
    stopSleepTimer();
    return;
  }

  state.sleepTimer.active = true;
  state.sleepTimer.minutes = minutes;
  state.sleepTimer.initialVolume = elements.audio.volume || 1.0;

  if (minutes !== 'end' && minutes !== 'end-queue') {
    const ms = minutes * 60 * 1000;
    state.sleepTimer.endTime = Date.now() + ms;

    state.sleepTimer.intervalId = setInterval(() => {
      const remaining = Math.max(0, state.sleepTimer.endTime - Date.now());
      if (remaining <= 0) {
        pauseCurrentEngine();
        elements.audio.volume = state.sleepTimer.initialVolume;
        stopSleepTimer();
      } else {
        updateSleepTimerUI();
      }
    }, 1000);
  } else {
    state.sleepTimer.endTime = null;
  }

  updateSleepTimerUI();
  closeSleepModal();
}

function stopSleepTimer() {
  if (state.sleepTimer.intervalId) {
    clearInterval(state.sleepTimer.intervalId);
  }
  state.sleepTimer = {
    active: false,
    minutes: 0,
    endTime: null,
    intervalId: null,
    fadeout: true,
    initialVolume: 1.0
  };
  updateSleepTimerUI();
  closeSleepModal();
}

// ─────────────────────────────────────────────────────────────────────────
// SECTION 25 · Feed Management
// addFeed, promptRemoveFeed, purgeOrphanedDownloads, removeFeed
// ─────────────────────────────────────────────────────────────────────────

async function addFeed(url, title = '', artwork = '') {
  const cleanUrl = url.trim();
  if (!cleanUrl) return false;

  if (!state.feeds.includes(cleanUrl)) {
    state.feeds.push(cleanUrl);
    saveFeedsToStorage();
    try {
      await saveFeedToD1(cleanUrl, title, artwork);
    } catch (_) {}

    // Fetch ONLY the newly subscribed feed instead of re-fetching the entire library
    showStatus(`Adding ${title || 'podcast'}...`);
    const incoming = [];
    const updatedMeta = { ...state.feedMetadata };
    await fetchSingleFeed(cleanUrl, incoming, updatedMeta, { force: true });
    if (incoming.length > 0) {
      const existingGuids = new Set(state.allEpisodes.map(e => e.guid).filter(Boolean));
      const newBatch = incoming.filter(ep => ep && ep.guid && !existingGuids.has(ep.guid));
      state.allEpisodes = [...newBatch, ...state.allEpisodes];
    }
    state.feedMetadata = updatedMeta;
    saveCacheToStorage();
    processAndSortEpisodes();
    renderTimeline(true);
    renderFeedsGrid();
    updateFeedCountUI();
    showStatus(`Added ${updatedMeta[cleanUrl]?.title || title || 'podcast'}`);
    setTimeout(hideStatus, 2500);

    if (elements.feedUrlInput && elements.feedUrlInput.value.trim() === cleanUrl) {
      elements.feedUrlInput.value = '';
    }
    return true;
  } else {
    showStatus('This podcast is already in your subscriptions');
    return true;
  }
}

function openConfirmDialog({ title, message, actionLabel = 'Confirm', onConfirm }) {
  state.confirmModalAction = onConfirm;
  const titleEl = elements.confirmModal?.querySelector('h2');
  if (titleEl && title) titleEl.textContent = title;
  if (elements.confirmModalMsg && message) elements.confirmModalMsg.textContent = message;
  if (elements.btnConfirmDelete && actionLabel) elements.btnConfirmDelete.textContent = actionLabel;
  if (elements.confirmModal) elements.confirmModal.classList.remove('hidden');
}

function promptRemoveFeed(url) {
  state.feedToDelete = url;
  state.confirmModalAction = null;
  const meta = state.feedMetadata[url] || {};
  const title = meta.title || 'this podcast';
  openConfirmDialog({
    title: 'Remove from Library',
    message: `Do you want to unsubscribe from "${title}"?`,
    actionLabel: 'Remove',
    onConfirm: () => {
      removeFeed(url);
      state.feedToDelete = null;
    }
  });
}

function purgeOrphanedDownloads() {
  if (!state.feeds || !state.downloadedEpisodes) return;
  const activeFeedSet = new Set(state.feeds);
  const activeGuidSet = new Set(state.allEpisodes.map(e => e.guid));
  let changed = false;
  for (const [guid, dl] of Object.entries(state.downloadedEpisodes)) {
    const isFeedMissing = dl.feedUrl && !activeFeedSet.has(dl.feedUrl);
    const isGuidMissing = state.allEpisodes.length > 0 && !activeGuidSet.has(guid);
    const isAllFeedsGone = state.feeds.length === 0;
    if (isAllFeedsGone || isFeedMissing || (!dl.feedUrl && isGuidMissing)) {
      if ('caches' in window) {
        try {
          caches.open('anypod-audio-v1').then(cache => cache.delete(dl.audioUrl)).catch(() => {});
        } catch (e) {}
      }
      delete state.downloadedEpisodes[guid];
      changed = true;
    }
  }
  if (changed) {
    saveDownloadsToStorage();
  }
}

function removeFeed(url) {
  if (state.activeFeedDetailUrl === url) {
    state.activeFeedDetailUrl = null;
    if (elements.panelFeedDetail) elements.panelFeedDetail.classList.remove('active');
    const feedsTab = document.getElementById('tab-feeds');
    const feedsPanel = document.getElementById('panel-feeds');
    elements.tabs.forEach(t => t.classList.remove('active'));
    elements.panels.forEach(p => p.classList.remove('active'));
    if (feedsTab) feedsTab.classList.add('active');
    if (feedsPanel) feedsPanel.classList.add('active');
  }

  const epsToRemove = state.allEpisodes.filter(ep => ep.feedUrl === url);
  const guidsToRemove = new Set(epsToRemove.map(ep => ep.guid));
  let downloadsChanged = false;
  for (const [guid, dl] of Object.entries(state.downloadedEpisodes)) {
    if (guidsToRemove.has(guid) || dl.feedUrl === url) {
      if ('caches' in window) {
        try {
          caches.open('anypod-audio-v1').then(cache => cache.delete(dl.audioUrl)).catch(() => {});
        } catch (e) {}
      }
      delete state.downloadedEpisodes[guid];
      downloadsChanged = true;
    }
  }
  if (downloadsChanged) {
    saveDownloadsToStorage();
  }

  state.allEpisodes = state.allEpisodes.filter(ep => ep.feedUrl !== url);
  state.feeds = state.feeds.filter(f => f !== url);
  if (state.mutedFeeds) {
    state.mutedFeeds = state.mutedFeeds.filter(f => f !== url);
    saveMutedFeedsToStorage();
  }
  delete state.feedMetadata[url];
  saveFeedsToStorage();
  saveCacheToStorage();
  removeFeedFromD1(url);
  processAndSortEpisodes();
  if (state.feeds.length === 0) {
    navigateTo('discover');
  } else {
    renderTimeline();
    renderFeedsGrid();
  }
}

// ─────────────────────────────────────────────────────────────────────────
// SECTION 26 · OPML Import / Export
// ─────────────────────────────────────────────────────────────────────────

function importOpml(file) {
  const reader = new FileReader();
  reader.onload = (e) => {
    const xmlText = e.target.result;
    const parser = new DOMParser();
    const doc = parser.parseFromString(xmlText, 'text/xml');
    const outlines = doc.querySelectorAll('outline[xmlUrl], outline[xmlurl]');

    let addedCount = 0;
    outlines.forEach(node => {
      const feedUrl = node.getAttribute('xmlUrl') || node.getAttribute('xmlurl');
      if (feedUrl && !state.feeds.includes(feedUrl)) {
        state.feeds.push(feedUrl);
        saveFeedToD1(feedUrl, node.getAttribute('text') || '');
        addedCount++;
      }
    });

    if (addedCount > 0) {
      saveFeedsToStorage();
      refreshAllFeeds();
      alert(`Successfully imported ${addedCount} podcast feeds!`);
    } else {
      alert('No new podcast feeds found in this OPML file.');
    }
  };
  reader.readAsText(file);
}

function exportOpml() {
  let xml = `<?xml version="1.0" encoding="UTF-8"?>\n<opml version="2.0">\n  <head>\n    <title>Anypod Export</title>\n  </head>\n  <body>\n`;
  
  state.feeds.forEach(url => {
    const meta = state.feedMetadata[url] || {};
    const title = meta.title ? escapeHtml(meta.title) : 'Podcast';
    xml += `    <outline type="rss" text="${title}" title="${title}" xmlUrl="${escapeHtml(url)}"/>\n`;
  });

  xml += `  </body>\n</opml>`;

  const blob = new Blob([xml], { type: 'text/xml' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'anypod_subscriptions.opml';
  a.click();
}

