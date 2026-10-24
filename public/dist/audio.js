(function() {
      'use strict';

      // ─────────────────────────────────────────────────────────────────────────
      // 1. FEED & PLAYLIST CONFIGURATION (NO DEFAULT HARDCODED JSON)
      const DEFAULT_FEED_URL = 'https://www.deutschlandfunk.de/forschung-aktuell-104.xml';
      const DEFAULT_LIMIT = 100;

      // ─────────────────────────────────────────────────────────────────────────
      // 2. STATE & DOM ELEMENTS
      // ─────────────────────────────────────────────────────────────────────────
      let playlist = [];
      let currentIndex = 0;
      let sessionStartTime = Date.now();
      let sessionTimerInterval = null;
      let completedTracksCount = 0;
      let stallEventsCount = 0;
      let wakeLockSentinel = null;
      let isSeeking = false;
      let lastPositionUpdate = 0;
      let lastTimeupdateLog = 0;
      let logEventsArray = [];

      // Soak & Android lockscreen resilience state
      let userPaused = false;
      let advanceInFlight = false;
      let pauseRetryCount = 0;
      let lastRetryPos = 0;
      let fallbackProxyApplied = false;
      let pendingTransition = null;
      let autoSkipsCount = 0;
      let trackLoadStartTime = 0;
      let trackLoadTimeoutTimer = null;
      const transitions = [];
      const stats = {
        gapSumMs: 0,
        gapCount: 0,
        gapMaxMs: 0,
        lockLosses: 0,
        pauseRetries: 0,
        bgTransitions: 0
      };
      let feedMeta = { url: '', title: '', artwork: '' };

      const audio = document.getElementById('test-audio');
      const seekSlider = document.getElementById('seek-slider');
      const curTimeLabel = document.getElementById('label-cur-time');
      const durTimeLabel = document.getElementById('label-dur-time');
      const playPauseBtn = document.getElementById('btn-play-pause');
      const iconPlay = document.getElementById('icon-play');
      const iconPause = document.getElementById('icon-pause');
      const prevBtn = document.getElementById('btn-prev');
      const nextBtn = document.getElementById('btn-next');
      const streamUrlDisplay = document.getElementById('stream-url-display');
      const btnCopyUrl = document.getElementById('btn-copy-url');

      const toggleProxy = document.getElementById('toggle-proxy');
      const toggleLoop = document.getElementById('toggle-loop');
      const toggleWakeLock = document.getElementById('toggle-wakelock');

      const metricState = document.getElementById('metric-state');
      const metricBuffer = document.getElementById('metric-buffer');
      const metricVisibility = document.getElementById('metric-visibility');
      const metricWakeLock = document.getElementById('metric-wakelock');
      const metricSession = document.getElementById('metric-session');
      const metricCompleted = document.getElementById('metric-completed');
      const metricStalls = document.getElementById('metric-stalls');
      const metricAutoSkips = document.getElementById('metric-autoskips');
      const metricReadyState = document.getElementById('metric-readystate');
      const metricMediaSession = document.getElementById('metric-mediasession');
      const metricGap = document.getElementById('metric-gap');
      const metricRetries = document.getElementById('metric-retries');
      const metricLockLoss = document.getElementById('metric-lockloss');

      const logConsole = document.getElementById('log-console');
      const chkAutoscroll = document.getElementById('chk-autoscroll');
      const logCounter = document.getElementById('log-counter');
      const btnCopyLogs = document.getElementById('btn-copy-logs');
      const btnClearLogs = document.getElementById('btn-clear-logs');
      const btnDownloadLogs = document.getElementById('btn-download-logs');

      const inputFeedUrl = document.getElementById('input-feed-url');
      const inputFeedLimit = document.getElementById('input-feed-limit');
      const btnLoadFeed = document.getElementById('btn-load-feed');
      const feedStatusText = document.getElementById('feed-status-text');

      const CFG_INPUTS = {
        nearEndSec: document.getElementById('cfg-near-end-sec'),
        skipToEndSec: document.getElementById('cfg-skip-to-end'),
        maxPauseRetries: document.getElementById('cfg-max-retries'),
        retryDelayMs: document.getElementById('cfg-retry-delay'),
        reassertSec: document.getElementById('cfg-reassert-sec'),
        proxyFallbackAfter: document.getElementById('cfg-proxy-fallback'),
        heartbeatSec: document.getElementById('cfg-heartbeat-sec')
      };

      const playlistList = document.getElementById('playlist-list');
      const playlistCount = document.getElementById('playlist-count');
      const playlistJson = document.getElementById('playlist-json');
      const btnSavePlaylist = document.getElementById('btn-save-playlist');
      const btnResetPlaylist = document.getElementById('btn-reset-playlist');
      const toast = document.getElementById('toast');

      function readSetting(name) {
        const el = CFG_INPUTS[name];
        if (!el) return 0;
        return parseFloat(el.value) || 0;
      }

      function currentSettings() {
        const out = {};
        Object.keys(CFG_INPUTS).forEach(k => { out[k] = readSetting(k); });
        out.proxy = toggleProxy.checked;
        out.loop = toggleLoop.checked;
        out.wakeLock = toggleWakeLock.checked;
        return out;
      }

      function saveSettings() {
        try {
          localStorage.setItem('anypod_audio_soak_settings', JSON.stringify(currentSettings()));
        } catch (_) {}
      }

      function loadSettings() {
        try {
          const raw = localStorage.getItem('anypod_audio_soak_settings');
          if (!raw) return;
          const parsed = JSON.parse(raw);
          Object.keys(CFG_INPUTS).forEach(k => {
            if (parsed[k] !== undefined) CFG_INPUTS[k].value = parsed[k];
          });
          if (parsed.proxy !== undefined) toggleProxy.checked = !!parsed.proxy;
          if (parsed.loop !== undefined) toggleLoop.checked = !!parsed.loop;
          if (parsed.wakeLock !== undefined) toggleWakeLock.checked = !!parsed.wakeLock;
        } catch (_) {}
      }

      // ─────────────────────────────────────────────────────────────────────────
      // 3. LOGGING SUBSYSTEM
      // ─────────────────────────────────────────────────────────────────────────
      function formatTimestamp(d = new Date()) {
        const hh = String(d.getHours()).padStart(2, '0');
        const mm = String(d.getMinutes()).padStart(2, '0');
        const ss = String(d.getSeconds()).padStart(2, '0');
        const ms = String(d.getMilliseconds()).padStart(3, '0');
        return `${hh}:${mm}:${ss}.${ms}`;
      }

      function getElapsedSecString() {
        const sec = ((Date.now() - sessionStartTime) / 1000).toFixed(1);
        return `+${sec}s`;
      }

      function logEvent(type, message, tagClass = 'tag-event', tagLabel = 'EVENT') {
        const now = new Date();
        const ts = formatTimestamp(now);
        const elapsed = getElapsedSecString();
        const visTag = document.hidden ? 'BG' : 'FG';

        const rawLine = `[${ts}] [${elapsed}] [${visTag}] ${type}: ${message}`;
        logEventsArray.push(rawLine);
        if (logEventsArray.length > 1500) logEventsArray.shift();

        // DOM representation
        const row = document.createElement('div');
        row.className = 'log-entry';

        const tsSpan = document.createElement('span');
        tsSpan.className = 'log-ts';
        tsSpan.textContent = `[${ts}] [${elapsed}]`;

        const visSpan = document.createElement('span');
        visSpan.className = `log-tag ${document.hidden ? 'tag-bg' : 'tag-fg'}`;
        visSpan.textContent = visTag;

        const typeSpan = document.createElement('span');
        typeSpan.className = `log-tag ${tagClass}`;
        typeSpan.textContent = tagLabel;

        const msgSpan = document.createElement('span');
        msgSpan.className = 'log-msg';
        msgSpan.textContent = `${type}: ${message}`;

        row.appendChild(tsSpan);
        row.appendChild(visSpan);
        row.appendChild(typeSpan);
        row.appendChild(msgSpan);

        logConsole.appendChild(row);
        logCounter.textContent = `${logEventsArray.length} events logged`;

        if (chkAutoscroll.checked) {
          logConsole.scrollTop = logConsole.scrollHeight;
        }

        console.log(`[AudioTest] ${rawLine}`);
      }

      function showToast(msg) {
        toast.textContent = msg;
        toast.classList.add('show');
        clearTimeout(toast._timer);
        toast._timer = setTimeout(() => {
          toast.classList.remove('show');
        }, 2200);
      }

      // ─────────────────────────────────────────────────────────────────────────
      // 4. PLAYLIST & RESOLUTION
      // ─────────────────────────────────────────────────────────────────────────
      function updateSoakMetrics() {
        if (metricGap) {
          const avg = stats.gapCount ? Math.round(stats.gapSumMs / stats.gapCount) : 0;
          const last = transitions.length > 0 ? transitions[transitions.length - 1].gapMs : 0;
          metricGap.textContent = `${last}ms (avg ${avg}ms, max ${stats.gapMaxMs}ms)`;
        }
        if (metricRetries) metricRetries.textContent = String(stats.pauseRetries);
        if (metricLockLoss) metricLockLoss.textContent = String(stats.lockLosses);
        if (metricAutoSkips) metricAutoSkips.textContent = String(autoSkipsCount);
      }

      // ─────────────────────────────────────────────────────────────────────────
      // 4. FEED LOADER & PLAYLIST RESOLUTION (100 EPISODES FROM RSS)
      // ─────────────────────────────────────────────────────────────────────────
      async function loadFeedPlaylist(customUrl, customLimit) {
        const feedUrl = (customUrl || inputFeedUrl.value || DEFAULT_FEED_URL).trim();
        const limit = parseInt(customLimit || inputFeedLimit.value || DEFAULT_LIMIT, 10) || DEFAULT_LIMIT;

        feedStatusText.textContent = `Fetching feed via /api/feed?url=... (target: ${limit} episodes)`;
        feedStatusText.style.color = 'var(--accent)';
        logEvent('feed.load_start', `Fetching ${feedUrl} (limit ${limit})`, 'tag-event', 'FEED');

        try {
          const resp = await fetch(`/api/feed?url=${encodeURIComponent(feedUrl)}`);
          if (!resp.ok) {
            throw new Error(`Feed fetch failed with HTTP ${resp.status}`);
          }
          const data = await resp.json();
          const items = Array.isArray(data.episodes) ? data.episodes : [];
          if (items.length === 0) {
            throw new Error('Feed returned 0 episodes');
          }

          const channelArt = data.artwork || '/icon-512.png';
          feedMeta = {
            url: feedUrl,
            title: data.title || 'Unknown Feed',
            artwork: channelArt
          };

          const sliced = items.slice(0, limit);
          playlist = sliced.map((ep, idx) => ({
            title: ep.title || `Episode #${idx + 1}`,
            artist: ep.feedTitle || data.title || 'Forschung aktuell',
            url: ep.audioUrl,
            artwork: ep.artwork || channelArt,
            pubDate: ep.pubDate || ''
          })).filter(t => Boolean(t.url));

          currentIndex = 0;
          renderPlaylistUI();
          feedStatusText.textContent = `Loaded ${playlist.length} episodes from "${feedMeta.title}"`;
          feedStatusText.style.color = '#10b981';
          logEvent('feed.loaded', `Successfully loaded ${playlist.length} episodes (channel: "${feedMeta.title}")`, 'tag-event', 'FEED');
          showToast(`Feed loaded: ${playlist.length} tracks`);

          if (playlist.length > 0) {
            loadTrack(0, false, 'init');
          }
        } catch (err) {
          feedStatusText.textContent = `Error: ${err.message}`;
          feedStatusText.style.color = '#ef4444';
          logEvent('feed.error', err.message, 'tag-error', 'FEED_ERR');
          showToast(`Feed load error: ${err.message}`);
        }
      }

      function resolveStreamUrl(rawUrl, forceProxy = false) {
        if (!rawUrl) return '';
        const useProxy = forceProxy || toggleProxy.checked;
        if (useProxy) {
          return `${window.location.origin}/api/audio-proxy?url=${encodeURIComponent(rawUrl)}`;
        }
        return rawUrl;
      }

      function renderPlaylistUI() {
        playlistList.innerHTML = '';
        playlistCount.textContent = playlist.length;
        playlistJson.value = JSON.stringify(playlist, null, 2);

        playlist.forEach((item, idx) => {
          const div = document.createElement('div');
          div.className = `playlist-item ${idx === currentIndex ? 'active' : ''}`;
          div.setAttribute('role', 'button');
          div.tabIndex = 0;

          div.innerHTML = `
            <div class="item-meta">
              <span class="item-idx">${idx + 1}</span>
              <div class="item-texts">
                <div class="item-title">${escapeHtml(item.title || 'Untitled Track')}</div>
                <div class="item-artist">${escapeHtml(item.artist || 'Unknown Artist')}</div>
              </div>
            </div>
            ${idx === currentIndex ? '<span class="item-badge">Active</span>' : ''}
          `;

          div.addEventListener('click', () => {
            if (currentIndex !== idx || audio.paused) {
              loadTrack(idx, true, 'manual:click');
            }
          });

          playlistList.appendChild(div);
        });

        // Scroll active track into view
        const activeEl = playlistList.children[currentIndex];
        if (activeEl) {
          activeEl.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        }
      }

      function escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
      }

      // ─────────────────────────────────────────────────────────────────────────
      // 5. STALL & BUFFERING RECOVERY WATCHDOG (BACKGROUND RESILIENCE)
      // ─────────────────────────────────────────────────────────────────────────
      let stallRecoveryTimer = null;
      function clearStallRecoveryTimer() {
        if (stallRecoveryTimer) {
          clearTimeout(stallRecoveryTimer);
          stallRecoveryTimer = null;
        }
      }

      function handlePlaybackStall(reason) {
        if (userPaused || advanceInFlight) return;

        logEvent(`audio.${reason}`, `Socket ${reason}! Buffer ahead: ${metricBuffer.textContent}`, 'tag-error', 'STALL');

        if (stallRecoveryTimer) return; // watchdog already running

        stallRecoveryTimer = setTimeout(() => {
          stallRecoveryTimer = null;
          if (userPaused || advanceInFlight) return;

          // If still paused or starved of data in background
          if (audio.paused || audio.readyState < 3) {
            logEvent('stall.nudge', `Stream starved for 5s in background (${reason}, readyState=${audio.readyState}) -> kicking audio`, 'tag-wait', 'NUDGE');
            const p = audio.play();
            if (p !== undefined) {
              p.catch(e => logEvent('stall.nudge_err', e.message, 'tag-error', 'ERR'));
            }

            stallRecoveryTimer = setTimeout(() => {
              stallRecoveryTimer = null;
              if (userPaused || advanceInFlight) return;
              if (audio.paused || audio.readyState < 3) {
                logEvent('stall.timeout', `Stall persisted >11s without recovery -> Auto-skipping to keep playlist running`, 'tag-error', 'AUTOSKIP');
                advanceToNextTrack('stall_recovery_timeout');
              }
            }, 6000);
          }
        }, 5000);
      }

      // ─────────────────────────────────────────────────────────────────────────
      // 6. AUDIO ENGINE PLAYBACK & TRANSITION (LOCKSCREEN-RESILIENT)
      // ─────────────────────────────────────────────────────────────────────────
      function loadTrack(index, autoPlay = true, reason = 'manual') {
        if (index < 0 || index >= playlist.length) return;
        currentIndex = index;
        const track = playlist[currentIndex];
        fallbackProxyApplied = false;
        pauseRetryCount = 0;
        advanceInFlight = false;
        clearStallRecoveryTimer();

        document.getElementById('current-track-index').textContent = `Track ${currentIndex + 1} of ${playlist.length}`;
        document.getElementById('current-track-title').textContent = track.title || 'Untitled Track';
        document.getElementById('current-track-artist').textContent = track.artist || 'Unknown Artist';

        const streamUrl = resolveStreamUrl(track.url);
        streamUrlDisplay.textContent = streamUrl;
        streamUrlDisplay.title = streamUrl;

        logEvent('track.change', `Track ${currentIndex + 1}/${playlist.length} ("${track.title}") -> loading`, 'tag-event', 'TRACK');

        // CRITICAL FIX FOR ANDROID PIXEL LOCKSCREEN LOSS:
        // 1. Maintain MediaSession state *before* assigning audio.src so Android SystemUI never sees idle/unassociated state.
        if (autoPlay) {
          userPaused = false;
        }
        if ('mediaSession' in navigator) {
          navigator.mediaSession.playbackState = userPaused ? 'paused' : 'playing';
          if ('setPositionState' in navigator.mediaSession) {
            try {
              navigator.mediaSession.setPositionState({
                duration: 100,
                playbackRate: 1.0,
                position: 0
              });
            } catch (_) {}
          }
        }
        syncMediaSession(track, true, false);

        // 2. Assign audio.src without calling pause()
        audio.src = streamUrl;
        audio.load();

        trackLoadStartTime = Date.now();
        clearTimeout(trackLoadTimeoutTimer);

        // 3. Mark pending transition for gap timing
        pendingTransition = {
          idx: currentIndex + 1,
          reason,
          t0: Date.now(),
          vis: document.hidden ? 'BG' : 'FG'
        };

        // 4. Update UI
        renderPlaylistUI();
        updateProgress();

        // 5. Apply skip-to-end test mode if configured
        const skipSec = readSetting('skipToEndSec');
        if (skipSec > 0) {
          const onMeta = () => {
            audio.removeEventListener('loadedmetadata', onMeta);
            const lead = readSetting('nearEndSec');
            const totalLead = (lead > 0) ? (skipSec + lead) : skipSec;
            if (audio.duration && audio.duration > totalLead + 2) {
              const jumpTo = audio.duration - totalLead;
              audio.currentTime = jumpTo;
              if ('mediaSession' in navigator && 'setPositionState' in navigator.mediaSession) {
                try {
                  navigator.mediaSession.setPositionState({
                    duration: audio.duration,
                    playbackRate: audio.playbackRate || 1.0,
                    position: jumpTo
                  });
                } catch (_) {}
              }
              logEvent('soak.skiptoend', `Jumped track to ${jumpTo.toFixed(1)}s (leaves ${skipSec}s play window before ${lead}s nearend trigger)`, 'tag-wait', 'SKIP');
            }
          };
          audio.addEventListener('loadedmetadata', onMeta);
        }

        if (autoPlay) {
          userPaused = false;
          trackLoadTimeoutTimer = setTimeout(() => {
            if (advanceInFlight || userPaused) return;
            const isDead = audio.readyState === 0 || audio.networkState === HTMLMediaElement.NETWORK_NO_SOURCE || audio.networkState === 3;
            if (isDead) {
              autoSkipsCount++;
              updateSoakMetrics();
              logEvent('track.autoskip', `Track load stalled after 8s (networkState=${audio.networkState}, readyState=${audio.readyState}) -> Auto-skipping in 1.5s`, 'tag-error', 'AUTOSKIP');
              setTimeout(() => {
                advanceToNextTrack('network_3_timeout_skip');
              }, 1500);
            } else if (audio.readyState < 3 && !audio.ended) {
              handlePlaybackStall('load_timeout');
            }
          }, 8000);

          const playPromise = audio.play();
          if (playPromise !== undefined) {
            playPromise.then(() => {
              clearTimeout(trackLoadTimeoutTimer);
              logEvent('play.resolved', `Playback started for track ${currentIndex + 1}`, 'tag-event', 'PLAY');
              updateUIPlayState(true);
            }).catch(err => {
              logEvent('play.rejected', `Error: ${err.name} - ${err.message} (networkState=${audio.networkState})`, 'tag-error', 'ERR');
              updateUIPlayState(false);
              const isNetwork3 = audio.networkState === HTMLMediaElement.NETWORK_NO_SOURCE || audio.networkState === 3;
              if (isNetwork3 || err.name === 'NotSupportedError') {
                clearTimeout(trackLoadTimeoutTimer);
                autoSkipsCount++;
                updateSoakMetrics();
                logEvent('track.autoskip', `Playback rejected on unplayable source (networkState=${audio.networkState}) -> Auto-skipping in 1.5s`, 'tag-error', 'AUTOSKIP');
                setTimeout(() => {
                  advanceToNextTrack('network_3_play_error');
                }, 1500);
              }
            });
          }
        }
      }

      function advanceToNextTrack(reason = 'ended') {
        if (advanceInFlight) return;
        advanceInFlight = true;
        clearTimeout(trackLoadTimeoutTimer);
        clearStallRecoveryTimer();
        const nextIndex = currentIndex + 1;
        const loop = toggleLoop.checked;

        logEvent('track.advance', `Reason: ${reason}. Current: ${currentIndex + 1}, Loop: ${loop}`, 'tag-event', 'ADVANCE');

        if (nextIndex < playlist.length) {
          loadTrack(nextIndex, true, reason);
        } else if (loop && playlist.length > 0) {
          logEvent('track.loop', `Playlist end reached -> Looping to track 1`, 'tag-event', 'LOOP');
          loadTrack(0, true, 'loop');
        } else {
          advanceInFlight = false;
          logEvent('track.finished', `Playlist finished, stopped.`, 'tag-event', 'STOP');
          updateUIPlayState(false);
        }
      }

      function updateUIPlayState(isPlaying) {
        if (isPlaying) {
          iconPlay.style.display = 'none';
          iconPause.style.display = 'block';
          metricState.innerHTML = '<span class="status-dot dot-green"></span>PLAYING';
        } else {
          iconPlay.style.display = 'block';
          iconPause.style.display = 'none';
          metricState.innerHTML = '<span class="status-dot dot-amber"></span>PAUSED';
        }
      }

      // ─────────────────────────────────────────────────────────────────────────
      // 6. MEDIASESSION INTEGRATION & LOCKSCREEN METADATA (DEBOUNCED & ROBUST)
      // ─────────────────────────────────────────────────────────────────────────
      let mediaSessionDebounceTimer = null;
      let lastSyncedTrackUrl = '';

      function syncMediaSession(track, forceReassert = false, immediate = false) {
        if (!('mediaSession' in navigator) || !track) {
          if (metricMediaSession && !('mediaSession' in navigator)) {
            metricMediaSession.innerHTML = '<span class="status-dot dot-red"></span>Unsupported';
          }
          return;
        }

        const applySync = () => {
          try {
            const trackNeedsUpdate = !navigator.mediaSession.metadata || lastSyncedTrackUrl !== track.url || forceReassert;
            if (trackNeedsUpdate) {
              lastSyncedTrackUrl = track.url;
              const artworkUrl = track.artwork || '/icon-512.png';
              const resolvedArt = new URL(artworkUrl, window.location.origin).href;
              const fallback512 = new URL('/icon-512.png', window.location.origin).href;
              const fallback192 = new URL('/icon-192.png', window.location.origin).href;

              const isFallback = !resolvedArt || resolvedArt.endsWith('/icon-512.png');
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
                title: track.title || 'Diagnostic Track',
                artist: track.artist || 'Anypod Testbed',
                album: feedMeta.title || 'Anypod Feed Soak Test',
                artwork: artworkList
              });
            }

            // CRITICAL FOR ANDROID LOCKSCREEN: Never set playbackState to 'paused'
            // unless the user intentionally clicked Pause! Setting 'paused' during transitions
            // causes Android to immediately dismiss the lockscreen player and revoke background audio priority.
            const pbState = userPaused ? 'paused' : 'playing';
            navigator.mediaSession.playbackState = pbState;

            if (metricMediaSession) {
              metricMediaSession.innerHTML = pbState === 'playing'
                ? '<span class="status-dot dot-green"></span>Active (Playing)'
                : '<span class="status-dot dot-amber"></span>Active (Paused)';
            }

            // Reset position state for fresh track so Android never holds previous track's end state
            lastPositionUpdate = 0;
            if ('setPositionState' in navigator.mediaSession) {
              const durSec = (audio.duration && isFinite(audio.duration) && audio.duration > 0) ? audio.duration : 100;
              const curSec = (audio.currentTime && isFinite(audio.currentTime)) ? audio.currentTime : 0;
              try {
                navigator.mediaSession.setPositionState({
                  duration: Math.max(1, durSec),
                  playbackRate: audio.playbackRate || 1.0,
                  position: Math.min(curSec, durSec > 1 ? durSec - 0.1 : 0)
                });
              } catch (_) {}
            }

            if (forceReassert) {
              logEvent('mediasession.synced', `Title: "${track.title}", PlaybackState: ${pbState}, Force: ${forceReassert}`, 'tag-event', 'LOCK');
            }
          } catch (err) {
            if (metricMediaSession) metricMediaSession.innerHTML = '<span class="status-dot dot-red"></span>Error';
            logEvent('mediasession.error', `${err.name}: ${err.message}`, 'tag-error', 'ERR');
          }
        };

        if (immediate || forceReassert) {
          clearTimeout(mediaSessionDebounceTimer);
          applySync();
        } else {
          clearTimeout(mediaSessionDebounceTimer);
          mediaSessionDebounceTimer = setTimeout(applySync, 100);
        }
      }

      function setupMediaSessionHandlers() {
        if (!('mediaSession' in navigator)) return;

        navigator.mediaSession.setActionHandler('play', () => {
          logEvent('mediasession.action', 'play received from lock-screen');
          userPaused = false;
          audio.play().catch(() => {});
        });

        navigator.mediaSession.setActionHandler('pause', () => {
          logEvent('mediasession.action', 'pause received from lock-screen');
          userPaused = true;
          audio.pause();
        });

        navigator.mediaSession.setActionHandler('previoustrack', () => {
          logEvent('mediasession.action', 'previoustrack received');
          if (audio.currentTime > 4) {
            audio.currentTime = 0;
          } else {
            const prevIdx = currentIndex > 0 ? currentIndex - 1 : (toggleLoop.checked ? playlist.length - 1 : 0);
            loadTrack(prevIdx, true);
          }
        });

        navigator.mediaSession.setActionHandler('nexttrack', () => {
          logEvent('mediasession.action', 'nexttrack received from lock-screen');
          advanceToNextTrack('mediasession:nexttrack');
        });

        navigator.mediaSession.setActionHandler('seekforward', (details) => {
          const offset = details.seekOffset || 15;
          logEvent('mediasession.action', `seekforward +${offset}s`);
          if (audio.duration) audio.currentTime = Math.min(audio.duration, audio.currentTime + offset);
        });

        navigator.mediaSession.setActionHandler('seekbackward', (details) => {
          const offset = details.seekOffset || 15;
          logEvent('mediasession.action', `seekbackward -${offset}s`);
          audio.currentTime = Math.max(0, audio.currentTime - offset);
        });

        try {
          navigator.mediaSession.setActionHandler('seekto', (details) => {
            logEvent('mediasession.action', `seekto ${details.seekTime}s`);
            if (details.seekTime !== undefined) audio.currentTime = details.seekTime;
          });
        } catch (_) {}
      }

      // ─────────────────────────────────────────────────────────────────────────
      // 7. WAKE LOCK
      // ─────────────────────────────────────────────────────────────────────────
      async function requestWakeLock() {
        if (!('wakeLock' in navigator)) {
          metricWakeLock.textContent = 'Unsupported';
          logEvent('wakelock.unsupported', 'navigator.wakeLock not available on this device');
          return;
        }
        try {
          wakeLockSentinel = await navigator.wakeLock.request('screen');
          metricWakeLock.innerHTML = '<span class="status-dot dot-green"></span>Active (Screen On)';
          logEvent('wakelock.acquired', 'Screen WakeLock active');

          wakeLockSentinel.addEventListener('release', () => {
            logEvent('wakelock.released', 'Screen WakeLock released');
            if (!toggleWakeLock.checked) {
              metricWakeLock.textContent = 'Inactive';
            }
          });
        } catch (err) {
          metricWakeLock.innerHTML = '<span class="status-dot dot-red"></span>Error';
          logEvent('wakelock.error', `${err.name}: ${err.message}`, 'tag-error', 'ERR');
        }
      }

      function releaseWakeLock() {
        if (wakeLockSentinel) {
          wakeLockSentinel.release().catch(() => {});
          wakeLockSentinel = null;
        }
        metricWakeLock.textContent = 'Inactive';
        logEvent('wakelock.turned_off', 'WakeLock disabled by user toggle');
      }

      // ─────────────────────────────────────────────────────────────────────────
      // 8. AUDIO EVENT LISTENERS & LIFECYCLE TRACKING
      // ─────────────────────────────────────────────────────────────────────────
      function formatTime(sec) {
        if (isNaN(sec) || !isFinite(sec) || sec < 0) return '0:00';
        const m = Math.floor(sec / 60);
        const s = Math.floor(sec % 60);
        return `${m}:${s < 10 ? '0' : ''}${s}`;
      }

      function updateProgress() {
        const cur = audio.currentTime || 0;
        const dur = (audio.duration && isFinite(audio.duration)) ? audio.duration : 0;

        curTimeLabel.textContent = formatTime(cur);
        durTimeLabel.textContent = formatTime(dur);

        if (!isSeeking && dur > 0) {
          seekSlider.value = (cur / dur) * 100;
        }

        // Buffer calculation
        let aheadSec = 0;
        if (audio.buffered.length > 0) {
          for (let i = 0; i < audio.buffered.length; i++) {
            const start = audio.buffered.start(i);
            const end = audio.buffered.end(i);
            if (cur >= start && cur <= end) {
              aheadSec = Math.max(0, end - cur);
              break;
            }
          }
        }
        metricBuffer.textContent = `${aheadSec.toFixed(1)}s (ranges: ${audio.buffered.length})`;

        // Throttled MediaSession setPositionState
        if ('setPositionState' in navigator.mediaSession && dur > 0 && cur <= dur) {
          const now = Date.now();
          if (now - lastPositionUpdate >= 3000) {
            lastPositionUpdate = now;
            try {
              navigator.mediaSession.setPositionState({
                duration: Math.max(0.1, dur),
                playbackRate: audio.playbackRate || 1.0,
                position: cur
              });
            } catch (_) {}
          }
        }
      }

      // Audio Event Hooks
      audio.addEventListener('loadstart', () => {
        metricState.innerHTML = '<span class="status-dot dot-amber"></span>LOADING';
      });

      audio.addEventListener('loadedmetadata', () => {
        updateProgress();
      });

      audio.addEventListener('loadeddata', () => {});

      audio.addEventListener('canplay', () => {
        clearTimeout(trackLoadTimeoutTimer);
      });

      audio.addEventListener('canplaythrough', () => {});

      audio.addEventListener('play', () => {
        updateUIPlayState(true);
        if ('mediaSession' in navigator) {
          navigator.mediaSession.playbackState = 'playing';
          if (metricMediaSession) metricMediaSession.innerHTML = '<span class="status-dot dot-green"></span>Active (Playing)';
        }
      });

      audio.addEventListener('playing', () => {
        clearTimeout(trackLoadTimeoutTimer);
        clearStallRecoveryTimer();
        const cur = audio.currentTime.toFixed(2);
        logEvent('audio.playing', `Playback active at cur=${cur}s, readyState=${audio.readyState}`);
        updateUIPlayState(true);
        userPaused = false;

        // Transition gap stats
        if (pendingTransition) {
          const gap = Date.now() - pendingTransition.t0;
          const hadMeta = ('mediaSession' in navigator) ? !!navigator.mediaSession.metadata : false;
          const msState = ('mediaSession' in navigator) ? navigator.mediaSession.playbackState : 'n/a';
          transitions.push({ idx: pendingTransition.idx, reason: pendingTransition.reason, vis: pendingTransition.vis, gapMs: gap, meta: hadMeta, msState });
          if (transitions.length > 500) transitions.shift();
          stats.gapCount++;
          stats.gapSumMs += gap;
          stats.gapMaxMs = Math.max(stats.gapMaxMs, gap);
          if (pendingTransition.vis === 'BG') stats.bgTransitions++;
          logEvent('transition.done', `#${pendingTransition.idx} via ${pendingTransition.reason} (${pendingTransition.vis}) gap=${gap}ms meta=${hadMeta} msState=${msState}`, 'tag-event', 'TRANS');
          pendingTransition = null;
          updateSoakMetrics();
        }

        if ('mediaSession' in navigator) {
          navigator.mediaSession.playbackState = 'playing';
          if (metricMediaSession) metricMediaSession.innerHTML = '<span class="status-dot dot-green"></span>Active (Playing)';
        }
        setTimeout(() => {
          if (!audio.paused) pauseRetryCount = 0;
        }, 1500);
        lastRetryPos = audio.currentTime;
      });

      audio.addEventListener('pause', () => {
        // Guard spurious pause on track completion
        if (audio.ended) {
          logEvent('audio.pause', 'Ignored: track already ended (transitioning)', 'tag-wait', 'GUARD');
          return;
        }
        if (advanceInFlight || pendingTransition) {
          logEvent('audio.pause', 'Ignored: track transition in flight', 'tag-wait', 'GUARD');
          return;
        }
        if (audio.seeking) {
          logEvent('audio.pause', 'Ignored: audio currently seeking', 'tag-wait', 'GUARD');
          return;
        }

        const maxRetries = readSetting('maxPauseRetries');
        if (!userPaused && document.hidden && maxRetries > 0) {
          // If the element paused because buffer is not ready yet, wait for canplay
          if (audio.readyState < 3) {
            logEvent('audio.pause', `Ignored: awaiting buffer (readyState=${audio.readyState})`, 'tag-wait', 'GUARD');
            const onCanPlayResume = () => {
              audio.removeEventListener('canplay', onCanPlayResume);
              if (!userPaused && audio.paused) {
                audio.play().catch(() => {});
              }
            };
            audio.addEventListener('canplay', onCanPlayResume, { once: true });
            return;
          }

          if (pauseRetryCount < maxRetries) {
            pauseRetryCount++;
            stats.pauseRetries++;
            updateSoakMetrics();
            logEvent('audio.pause.spurious', `Unexpected BG pause at ${audio.currentTime.toFixed(2)}s -> retry ${pauseRetryCount}/${maxRetries}`, 'tag-wait', 'RETRY');
            if (pauseRetryCount > readSetting('proxyFallbackAfter') && toggleProxy.checked && !fallbackProxyApplied) {
              fallbackProxyApplied = true;
              logEvent('audio.proxy.fallback', 'Switching to proxy after repeated spurious pauses', 'tag-wait', 'RETRY');
              const pos = audio.currentTime;
              audio.src = resolveStreamUrl(playlist[currentIndex].url, true);
              audio.addEventListener('loadedmetadata', () => { try { audio.currentTime = pos; } catch (_) {} }, { once: true });
            }
            // Healthy backoff: gives Android audio hardware buffer time to settle without stutter
            const baseDelay = Math.max(600, readSetting('retryDelayMs') || 600);
            const delay = Math.min(2500, baseDelay + (pauseRetryCount * 250));
            setTimeout(() => {
              if (!userPaused && audio.paused) {
                audio.play().catch(err => logEvent('audio.retry.rejected', `${err.name}: ${err.message}`, 'tag-error', 'ERR'));
              }
            }, delay);
            return;
          } else {
            // Retries exceeded: Auto-skip to keep playlist alive rather than dying in silence
            logEvent('audio.pause.exhausted', `Exceeded ${maxRetries} pause retries -> Auto-advancing playlist`, 'tag-error', 'EXHAUSTED');
            pauseRetryCount = 0;
            advanceToNextTrack('pause_retries_exhausted');
            return;
          }
        }

        if (userPaused) {
          logEvent('audio.pause', `Paused at cur=${audio.currentTime.toFixed(2)}s (userPaused=true)`);
        }
        updateUIPlayState(false);
        if ('mediaSession' in navigator && userPaused) {
          navigator.mediaSession.playbackState = 'paused';
          if (metricMediaSession) metricMediaSession.innerHTML = '<span class="status-dot dot-amber"></span>Active (Paused)';
        }
      });

      audio.addEventListener('waiting', () => {
        metricState.innerHTML = '<span class="status-dot dot-amber"></span>BUFFERING';
        handlePlaybackStall('waiting');
      });

      audio.addEventListener('stalled', () => {
        stallEventsCount++;
        metricStalls.textContent = stallEventsCount;
        handlePlaybackStall('stalled');
      });

      audio.addEventListener('suspend', () => {});

      audio.addEventListener('emptied', () => {});

      audio.addEventListener('timeupdate', () => {
        updateProgress();
        if (!audio.paused && audio.currentTime > 0) {
          clearStallRecoveryTimer();
        }

        // Near-end watchdog: advance BEFORE the element reaches 'ended' so the
        // MediaSession never sees an ended/idle element (Android drops notification then).
        const lead = readSetting('nearEndSec');
        if (lead > 0 && !advanceInFlight && !userPaused) {
          const d = audio.duration;
          if (d && isFinite(d) && d > lead + 3 && d - audio.currentTime <= lead) {
            // Guard against advancing within the first 1.2s of a track starting or jumping
            if (Date.now() - trackLoadStartTime >= 1200) {
              completedTracksCount++;
              metricCompleted.textContent = `${completedTracksCount} tracks`;
              logEvent('watchdog.nearend', `Advancing ${(d - audio.currentTime).toFixed(1)}s before end (watchdog)`, 'tag-wait', 'NEAREND');
              advanceToNextTrack('nearend');
            }
          }
        }
      });

      audio.addEventListener('ended', () => {
        if (advanceInFlight) {
          logEvent('audio.ended', 'Ignored: advance already handled', 'tag-wait', 'GUARD');
          return;
        }
        completedTracksCount++;
        metricCompleted.textContent = `${completedTracksCount} tracks`;
        logEvent('audio.ended', `Track ${currentIndex + 1} completed naturally`, 'tag-event', 'ENDED');
        advanceToNextTrack('ended');
      });

      // Recovery watchdog for network pipeline errors (Code 2 / PIPELINE_ERROR_READ)
      let networkErrorRecoveries = 0;
      let isRecoveringNetwork = false;

      audio.addEventListener('error', (e) => {
        clearTimeout(trackLoadTimeoutTimer);
        const err = audio.error;
        const msg = err ? `Code ${err.code}: ${err.message}` : 'Unknown audio error';
        logEvent('audio.error', `${msg} (networkState=${audio.networkState})`, 'tag-error', 'ERROR');
        metricState.innerHTML = '<span class="status-dot dot-red"></span>ERROR';

        const isNetwork3 = audio.networkState === HTMLMediaElement.NETWORK_NO_SOURCE || audio.networkState === 3;
        const isSrcNotSupported = err && err.code === MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED;

        // Auto-skip unplayable tracks (Code 4 or networkState 3 / NETWORK_NO_SOURCE)
        if (isNetwork3 || isSrcNotSupported) {
          autoSkipsCount++;
          updateSoakMetrics();
          logEvent('track.autoskip', `Unplayable track (${msg}, networkState=${audio.networkState}) -> Auto-skipping in 1.5s`, 'tag-error', 'AUTOSKIP');
          setTimeout(() => {
            advanceToNextTrack('network_3_error_skip');
          }, 1500);
          return;
        }

        // Fix 2: Auto-recover transient CDN disconnects / FFmpegDemuxer read errors
        if (err && err.code === MediaError.MEDIA_ERR_NETWORK && !isRecoveringNetwork) {
          isRecoveringNetwork = true;
          networkErrorRecoveries++;
          const resumePos = Math.max(0, audio.currentTime || 0);
          const currentSrc = audio.src;

          logEvent('watchdog.recovery', `[Auto-Recovery #${networkErrorRecoveries}] CDN drop at ${resumePos.toFixed(2)}s. Re-binding stream...`, 'tag-wait', 'RECOVER');
          metricState.innerHTML = '<span class="status-dot dot-amber"></span>RECOVERING';

          setTimeout(() => {
            if (!currentSrc) {
              isRecoveringNetwork = false;
              return;
            }
            audio.src = currentSrc;
            audio.load();

            const onCanPlayResume = () => {
              audio.removeEventListener('canplay', onCanPlayResume);
              try {
                if (resumePos > 0) {
                  audio.currentTime = resumePos;
                }
              } catch (_) {}

              const resumePromise = audio.play();
              if (resumePromise !== undefined) {
                resumePromise.then(() => {
                  isRecoveringNetwork = false;
                  logEvent('watchdog.success', `Stream successfully recovered at ${resumePos.toFixed(2)}s`, 'tag-event', 'RECOVERED');
                  updateUIPlayState(true);
                  syncMediaSession(playlist[currentIndex], true);
                }).catch(playErr => {
                  isRecoveringNetwork = false;
                  logEvent('watchdog.failed', `Auto-play resume failed: ${playErr.name} - ${playErr.message}`, 'tag-error', 'ERR');
                  if (audio.networkState === HTMLMediaElement.NETWORK_NO_SOURCE || audio.networkState === 3) {
                    autoSkipsCount++;
                    updateSoakMetrics();
                    logEvent('track.autoskip', `Recovery failed (networkState=3) -> Auto-skipping in 1.5s`, 'tag-error', 'AUTOSKIP');
                    setTimeout(() => {
                      advanceToNextTrack('network_3_recovery_failed');
                    }, 1500);
                  }
                });
              } else {
                isRecoveringNetwork = false;
              }
            };

            audio.addEventListener('canplay', onCanPlayResume);
          }, 600);
        }
      });

      // ─────────────────────────────────────────────────────────────────────────
      // 9. BROWSER LIFECYCLE & VISIBILITY EVENTS
      // ─────────────────────────────────────────────────────────────────────────
      document.addEventListener('visibilitychange', () => {
        const isHidden = document.hidden;
        if (isHidden) {
          metricVisibility.innerHTML = '<span class="status-dot dot-amber"></span>Hidden (Screen Off)';
          logEvent('visibility.hidden', `Screen locked or user switched apps (${document.visibilityState})`, 'tag-bg', 'BG');
        } else {
          metricVisibility.innerHTML = '<span class="status-dot dot-green"></span>Visible';
          logEvent('visibility.visible', `Returned to foreground (${document.visibilityState})`, 'tag-fg', 'FG');
          // Re-acquire wakeLock if requested
          if (toggleWakeLock.checked && !wakeLockSentinel) {
            requestWakeLock();
          }
        }
      });

      window.addEventListener('pagehide', () => {
        logEvent('lifecycle.pagehide', 'Page hide event fired by mobile OS');
      });

      window.addEventListener('pageshow', () => {
        logEvent('lifecycle.pageshow', 'Page show event restored');
      });

      window.addEventListener('online', () => {
        logEvent('network.online', 'Device back online', 'tag-event', 'NET');
      });

      window.addEventListener('offline', () => {
        logEvent('network.offline', 'Device connection lost!', 'tag-error', 'OFFLINE');
      });

      // ─────────────────────────────────────────────────────────────────────────
      // 10. CONTROLS INTERACTION
      // ─────────────────────────────────────────────────────────────────────────
      playPauseBtn.addEventListener('click', () => {
        if (audio.paused) {
          userPaused = false;
          if (!audio.src) {
            loadTrack(currentIndex, true);
          } else {
            audio.play().catch(e => {
              logEvent('play.click_err', e.message, 'tag-error', 'ERR');
            });
          }
        } else {
          userPaused = true;
          clearStallRecoveryTimer();
          audio.pause();
        }
      });

      prevBtn.addEventListener('click', () => {
        if (audio.currentTime > 4) {
          audio.currentTime = 0;
        } else {
          const prevIdx = currentIndex > 0 ? currentIndex - 1 : (toggleLoop.checked ? playlist.length - 1 : 0);
          loadTrack(prevIdx, true);
        }
      });

      nextBtn.addEventListener('click', () => {
        advanceToNextTrack('manual:next_button');
      });

      seekSlider.addEventListener('input', () => {
        isSeeking = true;
        if (audio.duration) {
          const target = (seekSlider.value / 100) * audio.duration;
          curTimeLabel.textContent = formatTime(target);
        }
      });

      seekSlider.addEventListener('change', () => {
        isSeeking = false;
        if (audio.duration) {
          const target = (seekSlider.value / 100) * audio.duration;
          audio.currentTime = target;
          logEvent('seek.manual', `User scrubbed to ${target.toFixed(2)}s`);
        }
      });

      document.querySelectorAll('.speed-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
          document.querySelectorAll('.speed-btn').forEach(b => b.classList.remove('active'));
          e.target.classList.add('active');
          const speed = parseFloat(e.target.dataset.speed);
          audio.playbackRate = speed;
          logEvent('speed.changed', `Playback speed set to ${speed}x`);
        });
      });

      btnCopyUrl.addEventListener('click', () => {
        const streamUrl = streamUrlDisplay.textContent;
        if (!streamUrl || streamUrl === 'https://...') {
          showToast('No active stream URL');
          return;
        }
        navigator.clipboard.writeText(streamUrl).then(() => {
          showToast('Copied stream URL to clipboard');
          logEvent('clipboard.url_copied', streamUrl);
        }).catch(() => {
          window.prompt('Copy audio stream URL:', streamUrl);
        });
      });

      // Toggles
      toggleProxy.addEventListener('change', () => {
        const useProxy = toggleProxy.checked;
        logEvent('toggle.proxy', `Proxy mode: ${useProxy ? 'ENABLED (/api/audio-proxy)' : 'DISABLED (direct raw CDN)'}`);
        showToast(useProxy ? 'Audio Proxy: ON' : 'Audio Proxy: OFF');
        // Reload current track with new URL wrapper while preserving playback position
        if (playlist.length > 0) {
          const savedTime = audio.currentTime;
          const wasPlaying = !audio.paused;
          loadTrack(currentIndex, wasPlaying);
          if (savedTime > 1) {
            audio.addEventListener('loadedmetadata', function _onProxyRe() {
              audio.removeEventListener('loadedmetadata', _onProxyRe);
              audio.currentTime = savedTime;
            }, { once: true });
          }
        }
      });

      toggleLoop.addEventListener('change', () => {
        logEvent('toggle.loop', `Continuous loop: ${toggleLoop.checked ? 'ENABLED' : 'DISABLED'}`);
      });

      toggleWakeLock.addEventListener('change', () => {
        if (toggleWakeLock.checked) {
          requestWakeLock();
        } else {
          releaseWakeLock();
        }
      });

      // Diagnostics Log Actions
      btnCopyLogs.addEventListener('click', () => {
        const report = generateDiagnosticReport();
        navigator.clipboard.writeText(report).then(() => {
          showToast('Copied full diagnostic report to clipboard');
          logEvent('clipboard.logs_copied', `${logEventsArray.length} entries copied`);
        }).catch(() => {
          window.prompt('Copy diagnostic report:', report);
        });
      });

      btnClearLogs.addEventListener('click', () => {
        logEventsArray = [];
        logConsole.innerHTML = '';
        logCounter.textContent = '0 events logged';
        showToast('Logs cleared');
      });

      btnDownloadLogs.addEventListener('click', () => {
        const report = generateDiagnosticReport();
        const blob = new Blob([report], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `anypod-audio-diagnostic-${Date.now()}.txt`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        showToast('Downloaded log file');
      });

      function generateDiagnosticReport() {
        const track = playlist[currentIndex] || {};
        const dur = audio.duration || 0;
        const cur = audio.currentTime || 0;
        const bufferedSummary = [];
        for (let i = 0; i < audio.buffered.length; i++) {
          bufferedSummary.push(`[${audio.buffered.start(i).toFixed(2)}s - ${audio.buffered.end(i).toFixed(2)}s]`);
        }

        const avgGap = stats.gapCount ? Math.round(stats.gapSumMs / stats.gapCount) : 0;

        const header = [
          '====================================================',
          'ANYPOD BACKGROUND AUDIO SOAK TEST REPORT',
          `Generated: ${new Date().toISOString()}`,
          `Device User Agent: ${navigator.userAgent}`,
          `Platform: ${navigator.platform || 'unknown'}`,
          `Screen: ${window.screen.width}x${window.screen.height} (Orientation: ${window.screen.orientation?.type || 'unknown'})`,
          `Screen Visibility: ${document.visibilityState} (Hidden: ${document.hidden})`,
          `Network: Online=${navigator.onLine}, EffectiveType=${navigator.connection?.effectiveType || 'unknown'}, Downlink=${navigator.connection?.downlink || 'unknown'}Mbps`,
          `WakeLock Mode: ${toggleWakeLock.checked ? 'Enabled' : 'Disabled'} (Active: ${Boolean(wakeLockSentinel)})`,
          `Audio Proxy Mode: ${toggleProxy.checked ? 'Enabled (/api/audio-proxy)' : 'Disabled (Direct URL)'}`,
          `Continuous Loop: ${toggleLoop.checked ? 'Enabled' : 'Disabled'}`,
          '----------------------------------------------------',
          `Feed Source: ${feedMeta.url || 'none'} (title: "${feedMeta.title || 'none'}")`,
          `Total Episodes in Playlist: ${playlist.length}`,
          `Soak Configuration: ${JSON.stringify(currentSettings())}`,
          `Active Track Index: ${currentIndex + 1} of ${playlist.length}`,
          `Active Track Title: "${track.title || 'Untitled'}"`,
          `Active Track Artist: "${track.artist || 'Unknown'}"`,
          `Assigned audio.src: ${audio.src || 'none'}`,
          `MediaSession API: Supported=${'mediaSession' in navigator}, State=${('mediaSession' in navigator) ? navigator.mediaSession.playbackState : 'n/a'}`,
          `MediaSession Meta: Title="${navigator.mediaSession?.metadata?.title || 'none'}", Artist="${navigator.mediaSession?.metadata?.artist || 'none'}", ArtCount=${navigator.mediaSession?.metadata?.artwork?.length || 0}`,
          `Audio Position: ${cur.toFixed(2)}s / ${dur.toFixed(2)}s (${dur > 0 ? ((cur/dur)*100).toFixed(1) : 0}%)`,
          `Audio States: paused=${audio.paused}, ended=${audio.ended}, readyState=${audio.readyState}, networkState=${audio.networkState}`,
          `Buffered Ranges (${audio.buffered.length}): ${bufferedSummary.join(', ') || 'none'}`,
          `Network Recoveries: ${networkErrorRecoveries} | Buffer Stalls: ${stallEventsCount} | Auto Skips: ${autoSkipsCount} | Completed Tracks: ${completedTracksCount}`,
          `Spurious Pause Retries: ${stats.pauseRetries} | Lockscreen Loss Events: ${stats.lockLosses} | BG Transitions: ${stats.bgTransitions}`,
          `Transition Gap Stats: Avg=${avgGap}ms, Max=${stats.gapMaxMs}ms over ${stats.gapCount} transitions`,
          `Session Elapsed: ${((Date.now() - sessionStartTime)/1000).toFixed(1)}s`,
          '----------------------------------------------------',
          'TRANSITION AUDIT (Recent):',
          ...transitions.map(t => `  #${t.idx} reason=${t.reason} vis=${t.vis} gap=${t.gapMs}ms meta=${t.meta} msState=${t.msState}`),
          '====================================================',
          'CHRONOLOGICAL EVENT LOG:',
          ...logEventsArray,
          '====================================================',
          'END OF REPORT'
        ].join('\n');

        return header;
      }

      // Playlist JSON Editor
      btnSavePlaylist.addEventListener('click', () => {
        try {
          const parsed = JSON.parse(playlistJson.value);
          if (!Array.isArray(parsed) || parsed.length === 0) {
            alert('Playlist must be a non-empty array of track objects [{title, artist, url}].');
            return;
          }
          for (const item of parsed) {
            if (!item.url) {
              alert('Each track item must have a valid "url" field.');
              return;
            }
          }
          playlist = parsed;
          renderPlaylistUI();
          showToast('Playlist applied from JSON');
          logEvent('playlist.manual_json', `Applied ${playlist.length} tracks`);
          currentIndex = 0;
          loadTrack(0, false, 'json_save');
          document.getElementById('editor-details').open = false;
        } catch (err) {
          alert(`Invalid JSON format: ${err.message}`);
        }
      });

      btnResetPlaylist.addEventListener('click', () => {
        loadFeedPlaylist();
      });

      btnLoadFeed.addEventListener('click', () => {
        loadFeedPlaylist();
      });

      Object.keys(CFG_INPUTS).forEach(key => {
        const el = CFG_INPUTS[key];
        el.addEventListener('change', () => {
          saveSettings();
          logEvent('settings.changed', `${key}=${readSetting(key)}`, 'tag-event', 'CFG');
        });
      });

      // Session Timer Loop
      function startSessionTimer() {
        sessionTimerInterval = setInterval(() => {
          const elapsedMs = Date.now() - sessionStartTime;
          const totalSec = Math.floor(elapsedMs / 1000);
          const hh = String(Math.floor(totalSec / 3600)).padStart(2, '0');
          const mm = String(Math.floor((totalSec % 3600) / 60)).padStart(2, '0');
          const ss = String(totalSec % 60).padStart(2, '0');
          metricSession.textContent = `${hh}:${mm}:${ss}`;

          const states = ['0 (HAVE_NOTHING)', '1 (HAVE_METADATA)', '2 (HAVE_CURRENT_DATA)', '3 (HAVE_FUTURE_DATA)', '4 (HAVE_ENOUGH_DATA)'];
          metricReadyState.textContent = states[audio.readyState] || audio.readyState;
          updateSoakMetrics();
        }, 1000);
      }

      // Heartbeat & Lockscreen Reassert Loop
      function startHeartbeat() {
        let tick = 0;
        setInterval(() => {
          tick++;
          const reassertSec = readSetting('reassertSec');
          if (reassertSec > 0 && tick % reassertSec === 0 && !audio.paused && playlist[currentIndex] && ('mediaSession' in navigator)) {
            const hasMeta = !!navigator.mediaSession.metadata;
            const pb = navigator.mediaSession.playbackState;
            if (!hasMeta || pb !== 'playing') {
              stats.lockLosses++;
              updateSoakMetrics();
              logEvent('lockscreen.lost', `Detected lost state: meta=${hasMeta}, pbState=${pb}. Re-asserting...`, 'tag-error', 'LOCK_LOSS');
              syncMediaSession(playlist[currentIndex], true, true);
            }
          }

          const beatSec = readSetting('heartbeatSec');
          if (beatSec > 0 && tick % beatSec === 0) {
            const cur = audio.currentTime || 0;
            const dur = audio.duration || 0;
            const msState = ('mediaSession' in navigator) ? navigator.mediaSession.playbackState : 'n/a';
            const metaPresent = ('mediaSession' in navigator) ? !!navigator.mediaSession.metadata : false;
            logEvent('soak.heartbeat',
              `Track ${currentIndex + 1}/${playlist.length} | pos=${cur.toFixed(1)}/${dur.toFixed(1)}s | ` +
              `paused=${audio.paused} | rs=${audio.readyState} | done=${completedTracksCount} | ` +
              `lockLosses=${stats.lockLosses} | retries=${stats.pauseRetries} | msState=${msState} | meta=${metaPresent}`,
              'tag-fg', 'HEARTBEAT');
          }
        }, 1000);
      }

      // ─────────────────────────────────────────────────────────────────────────
      // 11. INITIALIZATION
      // ─────────────────────────────────────────────────────────────────────────
      async function init() {
        loadSettings();
        setupMediaSessionHandlers();
        startSessionTimer();
        startHeartbeat();

        logEvent('session.init', `Standalone testbed started. Target feed: ${DEFAULT_FEED_URL}. UA: ${navigator.userAgent.slice(0, 50)}...`);

        // Load 100 episodes from DLF RSS Feed
        await loadFeedPlaylist(DEFAULT_FEED_URL, DEFAULT_LIMIT);
      }

      init();
    })();
