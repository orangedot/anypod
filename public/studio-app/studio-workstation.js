(function (root) {
  'use strict';

  let previewSource = null;
  let previewCtx = null;
  let isDemoSeeded = false;

  function fmtTimecode(sec) {
    const s = Math.max(0, Number(sec) || 0);
    const m = Math.floor(s / 60);
    const rem = s - m * 60;
    const wholeSec = Math.floor(rem);
    const tenths = Math.floor((rem - wholeSec) * 10);
    return (m < 10 ? '0' : '') + m + ':' + (wholeSec < 10 ? '0' : '') + wholeSec + '.' + tenths;
  }

  async function ensureDemoProject(timeline) {
    if (!timeline || isDemoSeeded) return;
    const tracks = timeline.getTracks();
    const hasAnyClips = tracks.some(function (t) { return t.clips.length > 0; });
    if (hasAnyClips) return;

    isDemoSeeded = true;
    try {
      const Ctx = window.OfflineAudioContext || window.webkitOfflineAudioContext;
      const rate = 48000;
      const voiceDur = 6.4;
      const offCtx = new Ctx(2, Math.round(rate * voiceDur), rate);

      const phrases = [
        { freq: 165, start: 0.2, dur: 1.4 },
        { freq: 175, start: 1.8, dur: 1.8 },
        { freq: 155, start: 3.8, dur: 2.2 }
      ];

      phrases.forEach(function (ph) {
        const osc = offCtx.createOscillator();
        const g = offCtx.createGain();
        const f = offCtx.createBiquadFilter();

        osc.type = 'triangle';
        osc.frequency.setValueAtTime(ph.freq, ph.start);
        osc.frequency.exponentialRampToValueAtTime(ph.freq * 0.96, ph.start + ph.dur);

        f.type = 'lowpass';
        f.frequency.setValueAtTime(1100, ph.start);

        g.gain.setValueAtTime(0.0001, ph.start);
        g.gain.linearRampToValueAtTime(0.28, ph.start + 0.08);
        g.gain.setValueAtTime(0.28, ph.start + ph.dur - 0.1);
        g.gain.linearRampToValueAtTime(0.0001, ph.start + ph.dur);

        osc.connect(f);
        f.connect(g);
        g.connect(offCtx.destination);
        osc.start(ph.start);
        osc.stop(ph.start + ph.dur);
      });

      const voiceBuf = await offCtx.startRendering();
      timeline.addClip('track-voice', voiceBuf, 'Host Intro (Episode 4)', 0.4);

      if (window.StudioLibrary) {
        const musicBuf = await window.StudioLibrary.renderAssetBuffer('asset-lofi-intro', rate);
        timeline.addClip('track-music', musicBuf, 'Lo-Fi Intro Bed', 0.0);

        const whooshBuf = await window.StudioLibrary.renderAssetBuffer('asset-sfx-whoosh', rate);
        timeline.addClip('track-sfx', whooshBuf, 'Intro Sweep', 6.0);
      }

      timeline.addChapter(0.0, '01: Welcome & Overview');
      timeline.addChapter(6.2, '02: Main Discussion');
    } catch (_) {}
  }

  function renderWorkstationHtml(state, h) {
    const maxMin = Math.round((state.plan.maxRecordingSeconds || 1800) / 60);

    const recoveryBanner = state.cutter.recoverableSession
      ? '<div class="st-card" id="st-recovery-card"><div class="st-card-head"><div><h3 class="st-card-title">Unsaved recording found</h3><p class="st-card-sub">Recovered ' + state.cutter.recoverableSession.chunkCount + ' chunks (' + h.fmtMb(state.cutter.recoverableSession.totalBytes) + ') from crash-safe storage.</p></div>' +
        '<div class="st-actions"><button type="button" class="st-btn st-btn-primary" id="st-btn-recover-session">Recover take</button><button type="button" class="st-btn" id="st-btn-discard-session">Discard</button></div></div></div>'
      : '';

    const tl = state.timeline;
    const isPlaying = tl ? tl.getIsPlaying() : false;
    const playhead = tl ? tl.getPlayhead() : 0;
    const duration = tl ? tl.getDuration() : 10;
    const autoDucking = tl ? tl.getAutoDucking() : true;
    const zoom = tl ? tl.getZoom() : 55;

    return h.pageHeader(
      'Podcast Audio Studio',
      'Multi-track timeline · In-browser punch-in recording · Non-destructive editing · Smart voice ducking · ITU-R BS.1770 LUFS mastering',
      '<span class="st-chip st-chip-accent">' + h.esc(state.plan.label) + ' plan · max ' + maxMin + ' min take</span>'
    ) +
    '<div class="st-content">' +
    recoveryBanner +
    '<div class="st-card">' +
    '<div class="st-card-head"><div><h3 class="st-card-title">1. Studio Microphone Capture</h3><p class="st-card-sub">Punch-in records directly onto the Host Voice track at the current timeline playhead.</p></div>' +
    '<div class="st-actions">' +
    '<select class="st-select" id="st-mic-select" style="width:200px"><option value="default">Default Microphone</option></select>' +
    '<button type="button" class="st-btn st-btn-primary" id="st-btn-punch-rec">● Record Voice</button>' +
    '<button type="button" class="st-btn" id="st-btn-punch-stop" disabled>■ Stop</button>' +
    '<label class="st-btn" style="cursor:pointer">Import audio to track<input type="file" id="st-tl-file-input" accept="audio/*,.wav,.mp3,.m4a" hidden></label>' +
    '<button type="button" class="st-btn" id="st-btn-open-library">+ Podcast Sound Library</button>' +
    '</div></div>' +
    '<div class="st-grid st-grid-3">' +
    '<div class="st-cost-box"><span class="st-stat-label">Live Level Meter</span><div class="st-progress" style="height:10px;margin-top:6px"><div class="st-progress-fill" id="st-meter-bar" style="width:0%"></div></div><span class="st-ep-sub" id="st-meter-text">-90.0 dB · Ready</span></div>' +
    '<div class="st-cost-box"><span class="st-stat-label">Recording Elapsed</span><span class="st-cost-amount" id="st-rec-timer">0:00</span><span class="st-ep-sub">Crash-safe chunks saved every 1s</span></div>' +
    '<div class="st-cost-box"><span class="st-stat-label">Voice Auto-Ducking</span><span class="st-ep-title" id="st-duck-status">' + (autoDucking ? 'Active (-12 dB on speech)' : 'Disabled') + '</span><span class="st-ep-sub">Attenuates music bed when host speaks</span></div>' +
    '</div></div>' +
    '<div class="st-timeline-wrap">' +
    '<div class="st-timeline-toolbar">' +
    '<div class="st-transport">' +
    '<button type="button" class="st-btn-play" id="st-btn-tl-play" title="Play / Pause (Space)">' +
    (isPlaying ? '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg>' : '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><polygon points="6,4 20,12 6,20"/></svg>') +
    '</button>' +
    '<button type="button" class="st-btn st-btn-sm" id="st-btn-tl-rewind" title="Return to start (Home)">⏮</button>' +
    '<span class="st-timecode" id="st-timecode-display">' + fmtTimecode(playhead) + ' / ' + fmtTimecode(duration) + '</span>' +
    '</div>' +
    '<div class="st-actions">' +
    '<button type="button" class="st-btn st-btn-sm" id="st-btn-tl-split" title="Split selected clip at playhead (S)">Split (S)</button>' +
    '<button type="button" class="st-btn st-btn-sm" id="st-btn-tl-dup" title="Duplicate selected clip (Cmd+D)">Duplicate</button>' +
    '<button type="button" class="st-btn st-btn-sm" id="st-btn-tl-del" title="Delete selected clip (Del)">Delete</button>' +
    '<button type="button" class="st-btn st-btn-sm" id="st-btn-tl-chapter" title="Add chapter marker at playhead (C)">+ Chapter (C)</button>' +
    '<button type="button" class="st-btn st-btn-sm' + (autoDucking ? ' st-btn-primary' : '') + '" id="st-btn-tl-duck">Auto-Duck ' + (autoDucking ? 'ON' : 'OFF') + '</button>' +
    '<div style="display:inline-flex;align-items:center;gap:4px;margin-left:6px">' +
    '<span class="st-ep-sub">Zoom</span>' +
    '<button type="button" class="st-btn st-btn-sm" id="st-btn-zoom-out" style="width:26px;padding:0">−</button>' +
    '<button type="button" class="st-btn st-btn-sm" id="st-btn-zoom-in" style="width:26px;padding:0">+</button>' +
    '</div></div></div>' +
    '<div class="st-timeline-stage" id="st-timeline-stage">' +
    '<div class="st-stage-left">' +
    '<div class="st-stage-corner">Tracks</div>' +
    '<div id="st-track-headers"></div>' +
    '</div>' +
    '<div class="st-stage-scroll" id="st-stage-scroll">' +
    '<div class="st-timeline-ruler-wrap" id="st-ruler-wrap">' +
    '<div class="st-timeline-ruler" id="st-timeline-ruler"></div>' +
    '</div>' +
    '<div id="st-track-lanes" style="position:relative"></div>' +
    '<div class="st-timeline-playhead" id="st-tl-playhead"><div class="st-playhead-cap"></div></div>' +
    '</div></div></div>' +
    '<div class="st-card">' +
    '<div class="st-card-head"><div><h3 class="st-card-title">2. Loudness Mastering & Publish</h3><p class="st-card-sub">Mixdown renders all tracks with auto-ducking, normalizes to -16 LUFS (-1.0 dBTP ceiling), extracts chapters and populates the Publish tab.</p></div>' +
    '<div class="st-actions">' +
    '<select class="st-select" id="st-tl-export-format" style="width:160px"><option value="mp3">MP3 (128 kbps)</option><option value="wav">WAV (16-bit PCM)</option></select>' +
    '<button type="button" class="st-btn" id="st-btn-tl-download">Download master mix</button>' +
    '<button type="button" class="st-btn st-btn-primary" id="st-btn-tl-publish">Send to Publish →</button>' +
    '</div></div>' +
    '<span class="st-ep-sub" id="st-tl-export-status">Ready to master</span>' +
    '</div></div>';
  }

  function bindWorkstation(state, h) {
    const tl = state.timeline;
    if (!tl) return;

    const stageScroll = document.getElementById('st-stage-scroll');
    const rulerWrap = document.getElementById('st-ruler-wrap');
    const playheadEl = document.getElementById('st-tl-playhead');
    const timecodeEl = document.getElementById('st-timecode-display');
    const playBtn = document.getElementById('st-btn-tl-play');
    const rewindBtn = document.getElementById('st-btn-tl-rewind');
    const headersEl = document.getElementById('st-track-headers');
    const lanesEl = document.getElementById('st-track-lanes');
    const rulerEl = document.getElementById('st-timeline-ruler');

    function renderStage() {
      if (!headersEl || !lanesEl || !rulerEl) return;
      const zoom = tl.getZoom();
      const dur = tl.getDuration();
      const stageW = Math.max(700, Math.ceil(dur * zoom + 120));

      rulerEl.style.width = stageW + 'px';
      lanesEl.style.width = stageW + 'px';

      let ticksHtml = '';
      const stepSec = zoom >= 100 ? 2 : (zoom >= 40 ? 5 : 10);
      for (let t = 0; t <= dur; t += stepSec) {
        const x = Math.round(t * zoom);
        ticksHtml += '<div class="st-ruler-tick" style="left:' + x + 'px"><span>' + fmtTimecode(t) + '</span></div>';
      }

      const chapters = tl.getChapters();
      chapters.forEach(function (ch) {
        const cx = Math.round(ch.time * zoom);
        ticksHtml += '<div class="st-ch-flag" data-ch-id="' + h.esc(ch.id) + '" style="left:' + cx + 'px" title="Click to edit chapter">' +
          '<svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></svg>' +
          '<span>' + h.esc(ch.title) + '</span></div>';
      });
      rulerEl.innerHTML = ticksHtml;

      const tracks = tl.getTracks();
      const selectedClipId = tl.getSelectedClipId();

      let headsHtml = '';
      let lanesHtml = '';

      tracks.forEach(function (t) {
        const isMuted = t.muted;
        const isSolo = t.solo;

        headsHtml += '<div class="st-track-head" data-track-id="' + h.esc(t.id) + '">' +
          '<div class="st-track-title-row">' +
          '<div style="display:flex;align-items:center;gap:6px">' +
          '<span class="st-track-badge" style="background:' + t.color + '22;color:' + t.color + '">' + t.type + '</span>' +
          '<span class="st-track-name" title="' + h.esc(t.name) + '">' + h.esc(t.name) + '</span>' +
          '</div></div>' +
          '<div class="st-track-controls">' +
          '<button type="button" class="st-track-btn-mute' + (isMuted ? ' active' : '') + '" data-track-mute="' + h.esc(t.id) + '" title="Mute track">M</button>' +
          '<button type="button" class="st-track-btn-solo' + (isSolo ? ' active' : '') + '" data-track-solo="' + h.esc(t.id) + '" title="Solo track">S</button>' +
          '<input type="range" class="st-vol-slider" data-track-vol="' + h.esc(t.id) + '" min="0" max="1.5" step="0.05" value="' + t.volume + '" title="Track volume">' +
          '</div></div>';

        let clipsHtml = '';
        t.clips.forEach(function (c) {
          const left = Math.round(c.start * zoom);
          const width = Math.max(28, Math.round(c.duration * zoom));
          const isSel = c.id === selectedClipId;

          clipsHtml += '<div class="st-clip-block' + (isSel ? ' selected' : '') + '" data-clip-id="' + h.esc(c.id) + '" data-track-id="' + h.esc(t.id) + '" style="left:' + left + 'px;width:' + width + 'px">' +
            '<div class="st-clip-handle st-clip-handle-l" data-handle="left"></div>' +
            '<div class="st-clip-head"><span>' + h.esc(c.name) + '</span><span>' + h.fmtDuration(c.duration) + '</span></div>' +
            '<div class="st-clip-wave"><canvas class="st-clip-canvas" data-canvas-clip="' + h.esc(c.id) + '" height="44"></canvas></div>' +
            '<div class="st-clip-handle st-clip-handle-r" data-handle="right"></div>' +
            '</div>';
        });

        lanesHtml += '<div class="st-track-lane" data-lane-track-id="' + h.esc(t.id) + '">' + clipsHtml + '</div>';
      });

      headersEl.innerHTML = headsHtml;
      lanesEl.innerHTML = lanesHtml;

      tracks.forEach(function (t) {
        t.clips.forEach(function (c) {
          drawClipPeaks(c, t.color);
        });
      });

      updatePlayheadUI(tl.getPlayhead());
    }

    function drawClipPeaks(clip, color) {
      const cvs = document.querySelector('[data-canvas-clip="' + clip.id + '"]');
      if (!cvs || !clip.peaks || !clip.peaks.length) return;
      const rect = cvs.getBoundingClientRect();
      const w = Math.max(20, Math.floor(rect.width));
      const h = Math.max(20, Math.floor(rect.height || 44));
      cvs.width = w * (window.devicePixelRatio || 1);
      cvs.height = h * (window.devicePixelRatio || 1);

      const ctx = cvs.getContext('2d');
      ctx.scale(window.devicePixelRatio || 1, window.devicePixelRatio || 1);
      ctx.clearRect(0, 0, w, h);

      const barCount = Math.min(clip.peaks.length, Math.floor(w / 3));
      const barW = Math.max(1.5, (w / barCount) - 1);
      const mid = h / 2;

      ctx.fillStyle = color || '#e5a967';
      for (let i = 0; i < barCount; i++) {
        const peakIdx = Math.floor((i / barCount) * clip.peaks.length);
        const amp = clip.peaks[peakIdx] || 0.05;
        const barH = Math.max(2, amp * (h * 0.82));
        ctx.fillRect(i * (barW + 1), mid - barH / 2, barW, barH);
      }
    }

    function updatePlayheadUI(sec) {
      if (!playheadEl) return;
      const zoom = tl.getZoom();
      const x = Math.round(sec * zoom);
      playheadEl.style.left = x + 'px';
      if (timecodeEl) {
        timecodeEl.textContent = fmtTimecode(sec) + ' / ' + fmtTimecode(tl.getDuration());
      }
    }

    api.renderStage = renderStage;
    updatePlayheadUI(tl.getPlayhead());
    renderStage();

    if (playBtn) {
      playBtn.addEventListener('click', function () {
        tl.togglePlay();
        const playing = tl.getIsPlaying();
        playBtn.innerHTML = playing
          ? '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg>'
          : '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><polygon points="6,4 20,12 6,20"/></svg>';
      });
    }

    if (rewindBtn) {
      rewindBtn.addEventListener('click', function () {
        tl.seek(0);
        if (stageScroll) stageScroll.scrollLeft = 0;
      });
    }

    if (rulerWrap) {
      let isScrubbing = false;

      function scrubFromEvent(e) {
        const rect = rulerEl.getBoundingClientRect();
        const clientX = e.clientX;
        const offsetX = Math.max(0, clientX - rect.left);
        const sec = offsetX / Math.max(1, tl.getZoom());
        tl.seek(sec);
      }

      rulerWrap.addEventListener('mousedown', function (e) {
        if (e.target.closest('.st-ch-flag')) return;
        isScrubbing = true;
        scrubFromEvent(e);
      });

      window.addEventListener('mousemove', function (e) {
        if (isScrubbing) scrubFromEvent(e);
      });

      window.addEventListener('mouseup', function () {
        isScrubbing = false;
      });
    }

    document.addEventListener('click', function (e) {
      const chFlag = e.target.closest('.st-ch-flag');
      if (chFlag) {
        const chId = chFlag.dataset.chId;
        const ch = tl.getChapters().find(function (c) { return c.id === chId; });
        if (ch) openChapterDialog(ch);
      }
    });

    let activeDrag = null;

    lanesEl.addEventListener('mousedown', function (e) {
      const handleEl = e.target.closest('.st-clip-handle');
      const clipEl = e.target.closest('.st-clip-block');
      if (!clipEl) return;

      const clipId = clipEl.dataset.clipId;
      const trackId = clipEl.dataset.trackId;
      const match = tl.findClip(clipId);
      if (!match) return;

      tl.setSelectedClipId(clipId);
      tl.setSelectedTrackId(trackId);
      renderStage();

      const zoom = tl.getZoom();
      const startX = e.clientX;
      const initialStart = match.clip.start;
      const initialOffset = match.clip.offset;
      const initialDur = match.clip.duration;

      if (handleEl) {
        const handleType = handleEl.dataset.handle;
        activeDrag = {
          type: 'trim',
          handle: handleType,
          clipId: clipId,
          startX: startX,
          initialStart: initialStart,
          initialOffset: initialOffset,
          initialDur: initialDur,
          zoom: zoom
        };
      } else {
        activeDrag = {
          type: 'move',
          clipId: clipId,
          trackId: trackId,
          startX: startX,
          initialStart: initialStart,
          zoom: zoom
        };
      }
      e.preventDefault();
    });

    window.addEventListener('mousemove', function (e) {
      if (!activeDrag) return;
      const deltaX = e.clientX - activeDrag.startX;
      const deltaSec = deltaX / activeDrag.zoom;

      if (activeDrag.type === 'move') {
        const newStart = Math.max(0, activeDrag.initialStart + deltaSec);
        const match = tl.findClip(activeDrag.clipId);
        if (match) {
          match.clip.start = newStart;
          const clipEl = document.querySelector('[data-clip-id="' + activeDrag.clipId + '"]');
          if (clipEl) clipEl.style.left = Math.round(newStart * activeDrag.zoom) + 'px';
        }
      } else if (activeDrag.type === 'trim') {
        const match = tl.findClip(activeDrag.clipId);
        if (!match) return;
        const c = match.clip;

        if (activeDrag.handle === 'left') {
          const actualDelta = Math.max(-activeDrag.initialOffset, Math.min(activeDrag.initialDur - 0.1, deltaSec));
          c.start = Math.max(0, activeDrag.initialStart + actualDelta);
          c.offset = activeDrag.initialOffset + actualDelta;
          c.duration = activeDrag.initialDur - actualDelta;
        } else {
          const maxExtension = c.sourceDuration - (activeDrag.initialOffset + activeDrag.initialDur);
          const actualDelta = Math.max(-(activeDrag.initialDur - 0.1), Math.min(maxExtension, deltaSec));
          c.duration = activeDrag.initialDur + actualDelta;
        }
        const clipEl = document.querySelector('[data-clip-id="' + activeDrag.clipId + '"]');
        if (clipEl) {
          clipEl.style.left = Math.round(c.start * activeDrag.zoom) + 'px';
          clipEl.style.width = Math.max(28, Math.round(c.duration * activeDrag.zoom)) + 'px';
        }
      }
    });

    window.addEventListener('mouseup', function () {
      if (activeDrag) {
        activeDrag = null;
        renderStage();
      }
    });

    headersEl.addEventListener('click', function (e) {
      const muteBtn = e.target.closest('[data-track-mute]');
      if (muteBtn) {
        const tId = muteBtn.dataset.trackMute;
        const t = tl.getTracks().find(function (item) { return item.id === tId; });
        if (t) {
          t.muted = !t.muted;
          muteBtn.classList.toggle('active', t.muted);
          tl.pause();
          renderStage();
        }
        return;
      }

      const soloBtn = e.target.closest('[data-track-solo]');
      if (soloBtn) {
        const tId = soloBtn.dataset.trackSolo;
        const t = tl.getTracks().find(function (item) { return item.id === tId; });
        if (t) {
          t.solo = !t.solo;
          soloBtn.classList.toggle('active', t.solo);
          tl.pause();
          renderStage();
        }
      }
    });

    headersEl.addEventListener('input', function (e) {
      const volIn = e.target.closest('[data-track-vol]');
      if (volIn) {
        const tId = volIn.dataset.trackVol;
        const t = tl.getTracks().find(function (item) { return item.id === tId; });
        if (t) {
          t.volume = Math.max(0, Math.min(1.5, Number(volIn.value) || 1.0));
        }
      }
    });

    const splitBtn = document.getElementById('st-btn-tl-split');
    if (splitBtn) {
      splitBtn.addEventListener('click', function () {
        const selId = tl.getSelectedClipId();
        if (!selId) {
          h.toast('Click a clip to select it first');
          return;
        }
        const didSplit = tl.splitClipAtTime(selId, tl.getPlayhead());
        if (didSplit) {
          renderStage();
          h.toast('Clip split at playhead');
        } else {
          h.toast('Playhead must be inside the clip to split');
        }
      });
    }

    const dupBtn = document.getElementById('st-btn-tl-dup');
    if (dupBtn) {
      dupBtn.addEventListener('click', function () {
        const selId = tl.getSelectedClipId();
        if (!selId) {
          h.toast('Click a clip to select it first');
          return;
        }
        tl.duplicateClip(selId);
        renderStage();
        h.toast('Clip duplicated');
      });
    }

    const delBtn = document.getElementById('st-btn-tl-del');
    if (delBtn) {
      delBtn.addEventListener('click', function () {
        const selId = tl.getSelectedClipId();
        if (!selId) {
          h.toast('Click a clip to select it first');
          return;
        }
        tl.removeClip(selId);
        renderStage();
        h.toast('Clip deleted');
      });
    }

    const chBtn = document.getElementById('st-btn-tl-chapter');
    if (chBtn) {
      chBtn.addEventListener('click', function () {
        const ch = tl.addChapter(tl.getPlayhead(), 'Chapter ' + (tl.getChapters().length + 1));
        renderStage();
        openChapterDialog(ch);
      });
    }

    const duckBtn = document.getElementById('st-btn-tl-duck');
    if (duckBtn) {
      duckBtn.addEventListener('click', function () {
        const next = !tl.getAutoDucking();
        tl.setAutoDucking(next);
        duckBtn.classList.toggle('st-btn-primary', next);
        duckBtn.textContent = 'Auto-Duck ' + (next ? 'ON' : 'OFF');
        const st = document.getElementById('st-duck-status');
        if (st) st.textContent = next ? 'Active (-12 dB on speech)' : 'Disabled';
        h.toast('Voice auto-ducking ' + (next ? 'enabled' : 'disabled'));
      });
    }

    const zoomInBtn = document.getElementById('st-btn-zoom-in');
    const zoomOutBtn = document.getElementById('st-btn-zoom-out');
    if (zoomInBtn) {
      zoomInBtn.addEventListener('click', function () {
        tl.setZoom(tl.getZoom() * 1.35);
        renderStage();
      });
    }
    if (zoomOutBtn) {
      zoomOutBtn.addEventListener('click', function () {
        tl.setZoom(tl.getZoom() / 1.35);
        renderStage();
      });
    }

    const libBtn = document.getElementById('st-btn-open-library');
    if (libBtn) {
      libBtn.addEventListener('click', function () {
        openLibraryModal(tl, h, renderStage);
      });
    }

    const fileInput = document.getElementById('st-tl-file-input');
    if (fileInput) {
      fileInput.addEventListener('change', async function () {
        if (!fileInput.files || !fileInput.files[0]) return;
        const f = fileInput.files[0];
        try {
          const ab = await f.arrayBuffer();
          const Ctx = window.AudioContext || window.webkitAudioContext;
          const aCtx = new Ctx();
          const buf = await aCtx.decodeAudioData(ab);
          tl.addClip('track-voice', buf, f.name.replace(/\.[^/.]+$/, ''), tl.getPlayhead());
          renderStage();
          h.toast('Imported audio onto Voice track');
        } catch (err) {
          h.toast('Could not decode audio: ' + err.message);
        }
      });
    }

    const recBtn = document.getElementById('st-btn-punch-rec');
    const stopBtn = document.getElementById('st-btn-punch-stop');
    let punchStartTime = 0;

    if (recBtn) {
      recBtn.addEventListener('click', async function () {
        try {
          const micSel = document.getElementById('st-mic-select');
          const deviceId = micSel ? micSel.value : 'default';
          const meterBar = document.getElementById('st-meter-bar');
          const meterText = document.getElementById('st-meter-text');
          const timerEl = document.getElementById('st-rec-timer');
          const maxSec = state.plan.maxRecordingSeconds || 1800;

          punchStartTime = tl.getPlayhead();

          state.cutter.recorder = window.StudioRecorder.createLiveRecorder({
            onMeter: function (m) {
              const pct = Math.max(0, Math.min(100, Math.round(((m.db + 60) / 60) * 100)));
              if (meterBar) meterBar.style.width = pct + '%';
              if (meterText) {
                meterText.textContent = m.db.toFixed(1) + ' dB' + (m.clipped ? ' · CLIP WARNING' : ' · Clean');
              }
              if (timerEl) timerEl.textContent = h.fmtDuration(m.elapsedSeconds);
              if (m.elapsedSeconds >= maxSec) {
                stopBtn.click();
              }
            }
          });

          await state.cutter.recorder.start(deviceId);
          recBtn.disabled = true;
          stopBtn.disabled = false;
          h.toast('Recording voice at ' + fmtTimecode(punchStartTime));
        } catch (err) {
          h.toast('Microphone error: ' + err.message);
        }
      });
    }

    if (stopBtn) {
      stopBtn.addEventListener('click', async function () {
        if (!state.cutter.recorder) return;
        stopBtn.disabled = true;
        recBtn.disabled = false;
        try {
          const assembled = await state.cutter.recorder.stop();
          if (assembled && assembled.bytes && assembled.bytes.byteLength > 0) {
            const Ctx = window.AudioContext || window.webkitAudioContext;
            const aCtx = new Ctx();
            const decoded = await aCtx.decodeAudioData(assembled.bytes.buffer);
            tl.addClip('track-voice', decoded, 'Voice Take ' + fmtTimecode(punchStartTime), punchStartTime);
            await state.cutter.recorder.crashStore.clearSession(assembled.meta.id);
            renderStage();
            h.toast('Take added to Voice track');
          }
        } catch (err) {
          h.toast('Could not decode recording: ' + err.message);
        }
      });
    }

    if (window.StudioRecorder) {
      window.StudioRecorder.listAudioInputs().then(function (inputs) {
        const sel = document.getElementById('st-mic-select');
        if (!sel || !inputs.length) return;
        sel.innerHTML = inputs.map(function (d) {
          return '<option value="' + h.esc(d.deviceId) + '">' + h.esc(d.label) + '</option>';
        }).join('');
      });
    }

    const downloadBtn = document.getElementById('st-btn-tl-download');
    const publishBtn = document.getElementById('st-btn-tl-publish');
    const statusEl = document.getElementById('st-tl-export-status');

    async function masterMixdown() {
      if (statusEl) statusEl.textContent = 'Rendering multi-track audio graph...';
      const renderedBuffer = await tl.renderMasterBuffer();

      if (statusEl) statusEl.textContent = 'Applying ITU-R BS.1770-4 -16 LUFS broadcast loudness...';
      const chs = [
        new Float32Array(renderedBuffer.getChannelData(0)),
        new Float32Array(renderedBuffer.numberOfChannels > 1 ? renderedBuffer.getChannelData(1) : renderedBuffer.getChannelData(0))
      ];

      const norm = window.StudioLoudness.normalizeBuffer(chs, renderedBuffer.sampleRate, {
        targetLufs: -16,
        ceilingDbtp: -1.0
      });

      const fmtSel = document.getElementById('st-tl-export-format');
      const fmt = fmtSel ? fmtSel.value : 'mp3';

      if (statusEl) statusEl.textContent = 'Encoding ' + fmt.toUpperCase() + '...';
      let fileBytes = null;
      let mime = 'audio/mpeg';
      let ext = 'mp3';

      if (fmt === 'mp3') {
        fileBytes = await window.StudioEncoder.encodeMp3(norm.channels, renderedBuffer.sampleRate, 128);
      } else {
        fileBytes = window.StudioEncoder.encodeWavPcm16(norm.channels, renderedBuffer.sampleRate);
        mime = 'audio/wav';
        ext = 'wav';
      }

      const file = new File([fileBytes], 'podcast-master-' + Date.now() + '.' + ext, { type: mime });
      if (statusEl) {
        statusEl.textContent = 'Mastered: -16.0 LUFS · Peak: -1.0 dBTP · ' + h.fmtDuration(file.size / (16000)) + ' · ' + tl.getChapters().length + ' chapters';
      }
      return { file: file, chapters: tl.exportChaptersJson(), duration: renderedBuffer.duration };
    }

    if (downloadBtn) {
      downloadBtn.addEventListener('click', async function () {
        try {
          downloadBtn.disabled = true;
          const res = await masterMixdown();
          const url = URL.createObjectURL(res.file);
          const a = document.createElement('a');
          a.href = url;
          a.download = res.file.name;
          document.body.appendChild(a);
          a.click();
          a.remove();
          setTimeout(function () { URL.revokeObjectURL(url); }, 5000);
          h.toast('Master mix downloaded');
        } catch (err) {
          h.toast('Mastering failed: ' + err.message);
        } finally {
          downloadBtn.disabled = false;
        }
      });
    }

    if (publishBtn) {
      publishBtn.addEventListener('click', async function () {
        try {
          publishBtn.disabled = true;
          const res = await masterMixdown();
          state.file = res.file;
          state.previewUrl = URL.createObjectURL(res.file);
          state.analysis = {
            durationSeconds: res.duration,
            waveformPeaks: Array.from(StudioTimeline.computeBufferPeaks(await decodeFileToBuffer(res.file), 120)),
            chapters: res.chapters.map(function (c) {
              return { title: c.title, startTime: c.startTime };
            })
          };
          h.navigate('publish');
          h.toast('Master mix & chapters sent to Publish');
        } catch (err) {
          h.toast('Could not send to publish: ' + err.message);
        } finally {
          publishBtn.disabled = false;
        }
      });
    }
  }

  async function decodeFileToBuffer(file) {
    const ab = await file.arrayBuffer();
    const Ctx = window.AudioContext || window.webkitAudioContext;
    const aCtx = new Ctx();
    return aCtx.decodeAudioData(ab);
  }

  function openLibraryModal(tl, h, onAdded) {
    const dlg = document.getElementById('st-library-dialog');
    const list = document.getElementById('st-library-list');
    if (!dlg || !list || !window.StudioLibrary) return;

    const assets = window.StudioLibrary.getAssets();
    list.innerHTML = assets.map(function (a) {
      return '<div class="st-asset-card" data-asset-id="' + h.esc(a.id) + '">' +
        '<div class="st-asset-meta">' +
        '<span class="st-asset-title">' +
        '<span class="st-track-badge" style="background:' + (a.category === 'music' ? '#6bc4a622;color:#6bc4a6' : '#a78bfa22;color:#a78bfa') + '">' + a.category + '</span>' +
        h.esc(a.title) +
        '<span class="st-ep-sub" style="margin-left:auto">' + a.duration + 's</span>' +
        '</span>' +
        '<span class="st-asset-desc">' + h.esc(a.desc) + '</span>' +
        '</div>' +
        '<div class="st-actions">' +
        '<button type="button" class="st-btn st-btn-sm" data-preview-asset="' + h.esc(a.id) + '">Preview ▶</button>' +
        '<button type="button" class="st-btn st-btn-sm st-btn-primary" data-add-asset="' + h.esc(a.id) + '">+ Add</button>' +
        '</div></div>';
    }).join('');

    list.onclick = async function (e) {
      const prevBtn = e.target.closest('[data-preview-asset]');
      if (prevBtn) {
        const aId = prevBtn.dataset.previewAsset;
        playAssetPreview(aId);
        return;
      }

      const addBtn = e.target.closest('[data-add-asset]');
      if (addBtn) {
        const aId = addBtn.dataset.addAsset;
        const asset = window.StudioLibrary.getAssetById(aId);
        if (!asset) return;
        addBtn.disabled = true;
        try {
          const buf = await window.StudioLibrary.renderAssetBuffer(aId, 48000);
          const targetTrack = asset.category === 'music' ? 'track-music' : 'track-sfx';
          tl.addClip(targetTrack, buf, asset.title, tl.getPlayhead());
          dlg.close();
          stopPreview();
          if (typeof onAdded === 'function') onAdded();
          h.toast('Added "' + asset.title + '" to timeline');
        } catch (err) {
          h.toast('Could not render asset: ' + err.message);
        } finally {
          addBtn.disabled = false;
        }
      }
    };

    dlg.showModal();
  }

  async function playAssetPreview(assetId) {
    stopPreview();
    try {
      const buf = await window.StudioLibrary.renderAssetBuffer(assetId, 48000);
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!previewCtx) previewCtx = new Ctx();
      if (previewCtx.state === 'suspended') previewCtx.resume();
      previewSource = previewCtx.createBufferSource();
      previewSource.buffer = buf;
      previewSource.connect(previewCtx.destination);
      previewSource.start(0);
    } catch (_) {}
  }

  function stopPreview() {
    if (previewSource) {
      try {
        previewSource.stop();
        previewSource.disconnect();
      } catch (_) {}
      previewSource = null;
    }
  }

  function openChapterDialog(ch) {
    const dlg = document.getElementById('st-chapter-dialog');
    const form = document.getElementById('st-chapter-form');
    const titleIn = document.getElementById('st-chapter-title-input');
    const timeIn = document.getElementById('st-chapter-time-input');
    const idIn = document.getElementById('st-chapter-id-input');
    const delBtn = document.getElementById('st-chapter-delete-btn');
    if (!dlg || !form || !titleIn || !timeIn) return;

    idIn.value = ch.id;
    titleIn.value = ch.title;
    timeIn.value = Math.round(ch.time * 10) / 10;

    delBtn.onclick = function () {
      if (root.StudioWorkstation._timeline) {
        root.StudioWorkstation._timeline.removeChapter(ch.id);
      }
      dlg.close();
    };

    form.onsubmit = function (e) {
      e.preventDefault();
      if (root.StudioWorkstation._timeline) {
        root.StudioWorkstation._timeline.updateChapter(ch.id, titleIn.value.trim(), Number(timeIn.value));
      }
      dlg.close();
    };

    dlg.showModal();
  }

  const api = {
    ensureDemoProject: ensureDemoProject,
    renderWorkstationHtml: renderWorkstationHtml,
    bindWorkstation: bindWorkstation,
    openLibraryModal: openLibraryModal,
    _timeline: null
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  root.StudioWorkstation = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
