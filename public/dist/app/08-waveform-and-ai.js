'use strict';

// ─────────────────────────────────────────────────────────────────────────
// SECTION 30 · Full-Episode Waveform & Speech/Music Timeline Chart
//
// 1. Interactive SoundCloud-style full-episode waveform canvas scrubber.
// 2. Background audio probe using HTTP Range requests + Web Audio API.
// 3. Classifies timeline segments into 🎙️ Speech (talking) vs 🎵 Music.
// 4. Color-coded timeline bars across the entire episode (0:00 to end).
// 5. Jump to next music / jump to next talk buttons.
// 6. Caches episode timeline analysis permanently in localStorage.
// ─────────────────────────────────────────────────────────────────────────

const TIMELINE_BAR_COUNT = 240;

function loadExperimentalSettings() {
  try {
    const raw = storage.getItem(STORAGE_KEYS.EXPERIMENTAL);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed.showJumpButtons !== undefined) {
        state.experimentalSettings.showJumpButtons = !!parsed.showJumpButtons;
      }
      if (parsed.autoSkipSpeech !== undefined){
        state.experimentalSettings.autoSkipSpeech = !!parsed.autoSkipSpeech;
      }
      if (parsed.enableAudioClassifier !== undefined) {
        state.experimentalSettings.enableAudioClassifier = !!parsed.enableAudioClassifier;
      }
      if (parsed.enableTranscript !== undefined) {
        state.experimentalSettings.enableTranscript = !!parsed.enableTranscript;
      }
      if (parsed.enableLiveTranscript !== undefined) {
        state.experimentalSettings.enableLiveTranscript = !!parsed.enableLiveTranscript;
      }
      if (parsed.enableVerboseDiagnostics !== undefined) {
        state.experimentalSettings.enableVerboseDiagnostics = !!parsed.enableVerboseDiagnostics;
      }
    }
  } catch (_) {}
  state.experimentalSettings.enableVisualizer = true;
  syncExperimentalUI();
}

function saveExperimentalSettings() {
  try {
    storage.setItem(STORAGE_KEYS.EXPERIMENTAL, JSON.stringify(state.experimentalSettings));
  } catch (_) {}
}

function syncExperimentalUI() {
  const es = state.experimentalSettings;
  const showButtons = !!es.showJumpButtons;
  const isVis = !!es.enableVisualizer;
  const isClass = !!es.enableAudioClassifier;
  const isTrans = !!es.enableTranscript;
  const isAutoSkip = !!es.autoSkipSpeech;
  const isLiveTrans = !!es.enableLiveTranscript;
  const isVerboseDiag = !!es.enableVerboseDiagnostics;

  const toggleJump = document.getElementById('toggle-jump-buttons');
  if (toggleJump) toggleJump.checked = showButtons;
  if (elements.toggleVisualizer) elements.toggleVisualizer.checked = isVis;
  if (elements.toggleClassifier) elements.toggleClassifier.checked = isClass;
  if (elements.toggleAutoSkip) elements.toggleAutoSkip.checked = !!es.autoSkipSpeech;
  if (elements.toggleTranscript) elements.toggleTranscript.checked = isTrans;
  if (elements.toggleLiveTranscript) elements.toggleLiveTranscript.checked = isLiveTrans;
  if (elements.toggleVerboseDiag) elements.toggleVerboseDiag.checked = isVerboseDiag;
  // Show live transcript row only when classifier is enabled (needs segment data)
  if (elements.rowLiveTranscript) {
    elements.rowLiveTranscript.style.display = isClass ? '' : 'none';
  }

  if (elements.btnPlayerTranscript) {
    elements.btnPlayerTranscript.style.display = isTrans ? '' : 'none';
  }
  const epTranscriptBtns = document.querySelectorAll('.btn-transcript-ep');
  epTranscriptBtns.forEach(btn => {
    btn.style.display = isTrans ? '' : 'none';
  });
  if (elements.tabBtnTranscript) {
    elements.tabBtnTranscript.style.display = isTrans ? '' : 'none';
  }
  if (!isTrans) {
    _hideLiveCaption(true);
    if (elements.showNotesModal && !elements.showNotesModal.classList.contains('hidden')) {
      if (elements.tabBtnTranscript && elements.tabBtnTranscript.classList.contains('active')) {
        switchShowNotesTab('notes');
      }
    }
  }

  const skipRow = document.getElementById('row-auto-skip');
  if (skipRow) skipRow.style.opacity = isClass ? '1' : '0.4';

  if (elements.timeScrubber) {
    elements.timeScrubber.classList.toggle('has-waveform', isVis);
    elements.timeScrubber.classList.toggle('has-classifier', isClass);
  }

  if (elements.waveformTimelineWrap) {
    elements.waveformTimelineWrap.style.display = isVis ? 'flex' : 'none';
  }
  if (elements.seekBar) {
    elements.seekBar.style.display = 'block';
  }

  if (elements.timelineLegend) {
    elements.timelineLegend.classList.toggle('hidden', !showButtons);
  }

  if (elements.btnJumpSpeech) {
    elements.btnJumpSpeech.classList.toggle('auto-skip-active', isAutoSkip);
  }
  if (elements.btnJumpMusic) {
    elements.btnJumpMusic.classList.toggle('auto-skip-active', isAutoSkip);
  }

  if (isVis) {
    renderWaveformChart();
  }
}

function setupExperimentalSettings() {
  const toggleJump = document.getElementById('toggle-jump-buttons');
  if (toggleJump) {
    toggleJump.addEventListener('change', () => {
      state.experimentalSettings.showJumpButtons = toggleJump.checked;
      saveExperimentalSettings();
      syncExperimentalUI();
    });
  }
  if (elements.toggleVisualizer) {
    elements.toggleVisualizer.addEventListener('change', () => {
      state.experimentalSettings.enableVisualizer = elements.toggleVisualizer.checked;
      saveExperimentalSettings();
      syncExperimentalUI();
      if (state.experimentalSettings.enableVisualizer && state.currentEpisode) {
        initOrLoadEpisodeTimeline(state.currentEpisode, state.episodeTimeline.duration);
      }
    });
  }
  if (elements.toggleClassifier) {
    elements.toggleClassifier.addEventListener('change', () => {
      state.experimentalSettings.enableAudioClassifier = elements.toggleClassifier.checked;
      if (!state.experimentalSettings.enableAudioClassifier) {
        state.experimentalSettings.autoSkipSpeech = false;
        if (elements.toggleAutoSkip) elements.toggleAutoSkip.checked = false;
      }
      saveExperimentalSettings();
      syncExperimentalUI();
      if (state.currentEpisode && state.experimentalSettings.enableAudioClassifier) {
        probeEpisodeAudio(state.currentEpisode, state.episodeTimeline.duration);
      } else if (!state.experimentalSettings.enableAudioClassifier) {
        renderWaveformChart();
      }
    });
  }
  if (elements.toggleAutoSkip) {
    elements.toggleAutoSkip.addEventListener('change', () => {
      state.experimentalSettings.autoSkipSpeech = elements.toggleAutoSkip.checked;
      saveExperimentalSettings();
    });
  }
  if (elements.toggleTranscript) {
    elements.toggleTranscript.addEventListener('change', () => {
      state.experimentalSettings.enableTranscript = elements.toggleTranscript.checked;
      saveExperimentalSettings();
      syncExperimentalUI();
    });
  }
  if (elements.toggleLiveTranscript) {
    elements.toggleLiveTranscript.addEventListener('change', () => {
      state.experimentalSettings.enableLiveTranscript = elements.toggleLiveTranscript.checked;
      saveExperimentalSettings();
      if (state.experimentalSettings.enableLiveTranscript) {
        liveTranscription.start();
      } else {
        liveTranscription.stop();
      }
    });
  }
  if (elements.toggleVerboseDiag) {
    elements.toggleVerboseDiag.addEventListener('change', () => {
      state.experimentalSettings.enableVerboseDiagnostics = elements.toggleVerboseDiag.checked;
      saveExperimentalSettings();
      showToast(state.experimentalSettings.enableVerboseDiagnostics ? 'Verbose diagnostic logs ON' : 'Verbose diagnostic logs OFF');
    });
  }
}

// ── Baseline Waveform Generator ─────────────────────────────────────────

function generateBaselineBars(guid, count) {
  const bars = [];
  let seed = 42;
  for (let c = 0; c < (guid || '').length; c++) {
    seed = (seed * 31 + guid.charCodeAt(c)) & 0x7fffffff;
  }
  const rand = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };

  // Realistic podcast pattern:
  // - Intro music first ~3%
  // - Discussion with natural conversational pauses
  // - Short music interlude mid-way
  // - Outro music last ~4%
  const midInterludeStart = 0.48;
  const midInterludeEnd = 0.51;

  for (let i = 0; i < count; i++) {
    const pos = i / count;
    const isIntro = pos < 0.035;
    const isOutro = pos > 0.955;
    const isMidMusic = pos >= midInterludeStart && pos <= midInterludeEnd;
    const isMusic = isIntro || isOutro || isMidMusic;

    // Natural speech envelope with high-resolution dynamics
    const speechEnvelope = 0.38 + Math.sin(pos * Math.PI) * 0.22;
    const cadence = Math.sin(i * 0.85) * 0.15;
    const microVariance = (rand() - 0.5) * 0.35;
    const height = isMusic
      ? Math.min(0.92, Math.max(0.35, 0.55 + Math.sin(i * 0.5) * 0.25))
      : Math.min(1.0, Math.max(0.12, speechEnvelope + cadence + microVariance));

    bars.push({
      height: parseFloat(height.toFixed(2)),
      type: isMusic ? 'music' : 'speech'
    });
  }
  return bars;
}

// ── Timeline Initialization & Rendering ─────────────────────────────────

function initOrLoadEpisodeTimeline(episode, duration) {
  if (!episode || !episode.guid) return;
  if (!state.experimentalSettings.enableVisualizer) return;
  const dur = (duration && duration > 0) ? duration : 1800; // fallback 30m if unknown
  renderChapterTicksOnWaveform();

  if (state.episodeTimeline.guid === episode.guid && state.episodeTimeline.bars.length > 0) {
    state.episodeTimeline.duration = dur;
    renderWaveformChart();
    return;
  }

  state.episodeTimeline.guid = episode.guid;
  state.episodeTimeline.duration = dur;

  // Check localStorage cache (v6 prefix for classical/acoustic + voice-over-music + 96-slice classifier)
  const cacheKey = 'anypod_timeline_v6_' + episode.guid;
  try {
    const cached = storage.getItem(cacheKey);
    if (cached) {
      const parsed = JSON.parse(cached);
      if (parsed.bars && parsed.bars.length > 0) {
        state.episodeTimeline.bars = parsed.bars;
        state.episodeTimeline.segments = parsed.segments || [];
        state.episodeTimeline.cues = parsed.cues || [];
        state.episodeTimeline.transcriptSource = (parsed.cues && parsed.cues.length > 0) ? (parsed.transcriptSource || 'Cache') : '';
        renderWaveformChart();
        return;
      }
    }
  } catch (_) {}

  // Generate initial baseline bars so scrubber is immediately interactive
  state.episodeTimeline.bars = generateBaselineBars(episode.guid, TIMELINE_BAR_COUNT);
  state.episodeTimeline.segments = deriveSegmentsFromBars(state.episodeTimeline.bars, dur);
  state.episodeTimeline.cues = [];
  state.episodeTimeline.transcriptSource = '';
  renderWaveformChart();

  // Cascading Free-Tier Pipeline: Tier 1 (RSS Transcript) -> Tier 2 (D1 Community Cache) -> Tier 3 (Client Probe)
  fetchTimelineFromPipeline(episode, dur);
}

// ── Cascading Free-Tier Pipeline ────────────────────────────────────────

async function fetchTimelineFromPipeline(episode, duration) {
  if (!episode || !episode.guid) return;
  const cacheKey = 'anypod_timeline_v6_' + episode.guid;

  // TIER 1: Check Podcasting 2.0 <podcast:transcript>
  if (episode.transcriptUrl) {
    if (elements.probeStatusPill) {
      elements.probeStatusPill.textContent = 'Reading transcript...';
      elements.probeStatusPill.classList.remove('hidden');
    }

    try {
      const proxyUrl = `/api/transcript-proxy?url=${encodeURIComponent(episode.transcriptUrl)}`;
      const res = await fetch(proxyUrl);
      if (res.ok) {
        const vttText = await res.text();
        const cues = parseVttOrSrtTimestamps(vttText);
        if (cues.length > 5) {
          const bars = deriveBarsFromCues(cues, duration, TIMELINE_BAR_COUNT);
          const segments = deriveSegmentsFromCues(cues, duration);

          state.episodeTimeline.bars = bars;
          state.episodeTimeline.segments = segments;
          state.episodeTimeline.cues = cues;
          state.episodeTimeline.transcriptSource = 'RSS';

          try {
            storage.setItem(cacheKey, JSON.stringify({ bars, segments, cues, transcriptSource: 'RSS' }));
          } catch (_) {}

          renderWaveformChart();

          // Seed community cache in D1
          saveTimelineToCommunityCache(episode, duration, bars, segments, 'transcript', episode.transcriptUrl);

          if (elements.probeStatusPill) {
            elements.probeStatusPill.textContent = '✓ RSS Transcript';
            setTimeout(() => {
              if (elements.probeStatusPill) elements.probeStatusPill.classList.add('hidden');
            }, 2500);
          }
          return;
        }
      }
    } catch (_) {
      // Fall through to Tier 2
    }
  }

  // TIER 2: Check Cloudflare D1 Community Cache (only accept transcript-backed entries, re-probe old probe entries)
  try {
    if (elements.probeStatusPill) {
      elements.probeStatusPill.textContent = 'Checking community...';
      elements.probeStatusPill.classList.remove('hidden');
    }

    const res = await fetch(`/api/community-transcripts?guid=${encodeURIComponent(episode.guid)}`);
    if (res.ok) {
      const data = await res.json();
      if (data.found && data.bars && data.bars.length > 0 && data.source === 'transcript') {
        state.episodeTimeline.bars = data.bars;
        state.episodeTimeline.segments = data.segments || [];

        try {
          storage.setItem(cacheKey, JSON.stringify({
            bars: data.bars,
            segments: data.segments || []
          }));
        } catch (_) {}

        renderWaveformChart();

        if (elements.probeStatusPill) {
          elements.probeStatusPill.textContent = '✓ Community Cached';
          setTimeout(() => {
            if (elements.probeStatusPill) elements.probeStatusPill.classList.add('hidden');
          }, 2500);
        }
        return;
      }
    }
  } catch (_) {
    // Fall through
  }

  // TIER 2.5: Free LRCLIB Lyrics API for YouTube songs & music tracks
  if (episode.isYouTube || episode.videoId || episode.guid?.startsWith('yt:') || !episode.transcriptUrl) {
    try {
      const lyricsFound = await fetchLyricsFromLrclib(episode, duration);
      if (lyricsFound) return;
    } catch (_) {}
  }

  // TIER 3: Fallback to Client-side Probing if Classifier is Enabled
  if (state.experimentalSettings.enableAudioClassifier) {
    probeEpisodeAudio(episode, duration);
  } else {
    if (elements.probeStatusPill) elements.probeStatusPill.classList.add('hidden');
  }
}

function parseMusicTrackInfo(title, podcastTitle = '') {
  if (!title) return { artist: '', track: '', query: '' };

  let clean = title
    .replace(/\s*[\(\[](?:official\s*(?:music\s*)?(?:video|audio|visualizer|lyric\s*video|lyrics|hd|4k|remaster(?:ed)?)|lyrics|audio|music\s*video|visualizer|remastered|live)[\)\]]/gi, '')
    .replace(/\s*[\(\[](?:feat\.|ft\.)[^\)\]]+[\)\]]/gi, '')
    .trim();

  const sepMatch = clean.match(/^([^-–—]+)\s*[-–—]\s*(.+)$/);
  if (sepMatch) {
    const artist = sepMatch[1].trim();
    const track = sepMatch[2].trim();
    return { artist, track, query: `${artist} ${track}` };
  }

  if (podcastTitle && !podcastTitle.toLowerCase().includes('playlist') && !podcastTitle.toLowerCase().includes('youtube')) {
    return { artist: podcastTitle.trim(), track: clean, query: `${podcastTitle} ${clean}` };
  }

  return { artist: '', track: clean, query: clean };
}

function parseLrcToCues(lrcText, totalDuration = 0) {
  if (!lrcText || typeof lrcText !== 'string') return [];
  const lines = lrcText.split(/\r?\n/);
  const rawCues = [];
  const lrcRegex = /\[(\d{1,2}):(\d{2})(?:\.(\d{2,3}))?\](.*)/;

  for (const line of lines) {
    const match = line.match(lrcRegex);
    if (match) {
      const min = parseInt(match[1], 10);
      const sec = parseInt(match[2], 10);
      const frac = match[3] ? (match[3].length === 2 ? parseInt(match[3], 10) / 100 : parseInt(match[3], 10) / 1000) : 0;
      const startTime = min * 60 + sec + frac;
      const text = match[4].trim();
      if (text) {
        rawCues.push({ start: startTime, text });
      }
    }
  }

  rawCues.sort((a, b) => a.start - b.start);

  const cues = [];
  for (let i = 0; i < rawCues.length; i++) {
    const current = rawCues[i];
    const nextStart = (i + 1 < rawCues.length) ? rawCues[i + 1].start : (totalDuration || current.start + 5);
    cues.push({
      start: current.start,
      end: Math.max(current.start + 1, nextStart),
      text: current.text
    });
  }

  return cues;
}

async function fetchLyricsFromLrclib(episode, duration) {
  if (!episode || !episode.title) return false;
  const cacheKey = 'anypod_timeline_v6_' + episode.guid;

  const { artist, track, query } = parseMusicTrackInfo(episode.title, episode.podcastTitle);
  if (!query && !track) return false;

  if (elements.probeStatusPill) {
    elements.probeStatusPill.textContent = 'Searching lyrics...';
    elements.probeStatusPill.classList.remove('hidden');
  }

  try {
    let data = null;

    // 1. Try exact get if artist and track are detected
    if (artist && track) {
      const durParam = duration && duration > 0 ? `&duration=${Math.round(duration)}` : '';
      const getUrl = `https://lrclib.net/api/get?artist_name=${encodeURIComponent(artist)}&track_name=${encodeURIComponent(track)}${durParam}`;
      const res = await fetch(getUrl);
      if (res.ok) {
        data = await res.json();
      }
    }

    // 2. If not found, try full-text search with strict duration verification
    if (!data || (!data.syncedLyrics && !data.plainLyrics)) {
      const searchUrl = `https://lrclib.net/api/search?q=${encodeURIComponent(query || episode.title)}`;
      const res = await fetch(searchUrl);
      if (res.ok) {
        const results = await res.json();
        if (Array.isArray(results) && results.length > 0) {
          // Filter candidates with valid lyrics
          const candidates = results.filter(r => r.syncedLyrics || r.plainLyrics);
          if (candidates.length > 0) {
            // If episode has duration, find candidate within +- 8 seconds tolerance
            if (duration && duration > 20) {
              data = candidates.find(r => r.duration && Math.abs(r.duration - duration) <= 8);
            }
            // If no duration match, only accept candidate if artist or track matches query terms
            if (!data && artist && track) {
              const artLower = artist.toLowerCase();
              const trkLower = track.toLowerCase();
              data = candidates.find(r => 
                (r.artistName && r.artistName.toLowerCase().includes(artLower)) &&
                (r.trackName && r.trackName.toLowerCase().includes(trkLower))
              );
            }
            // If still no confident match, do NOT grab a completely random song
          }
        }
      }
    }

    if (data && (data.syncedLyrics || data.plainLyrics)) {
      let cues = [];
      if (data.syncedLyrics) {
        cues = parseLrcToCues(data.syncedLyrics, duration);
      } else if (data.plainLyrics) {
        const plainLines = data.plainLyrics.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
        const lineDur = (duration && duration > 0) ? duration / Math.max(1, plainLines.length) : 4;
        cues = plainLines.map((text, idx) => ({
          start: Math.round(idx * lineDur * 10) / 10,
          end: Math.round((idx + 1) * lineDur * 10) / 10,
          text
        }));
      }

      if (cues.length > 0) {
        const bars = deriveBarsFromCues(cues, duration, TIMELINE_BAR_COUNT);
        const segments = deriveSegmentsFromCues(cues, duration);

        state.episodeTimeline.bars = bars;
        state.episodeTimeline.segments = segments;
        state.episodeTimeline.cues = cues;
        state.episodeTimeline.transcriptSource = data.syncedLyrics ? 'Lyrics (Synced)' : 'Lyrics';

        try {
          storage.setItem(cacheKey, JSON.stringify({
            bars,
            segments,
            cues,
            transcriptSource: state.episodeTimeline.transcriptSource
          }));
        } catch (_) {}

        renderWaveformChart();

        if (elements.probeStatusPill) {
          elements.probeStatusPill.textContent = data.syncedLyrics ? '✓ Synced Lyrics' : '✓ Lyrics';
          setTimeout(() => {
            if (elements.probeStatusPill) elements.probeStatusPill.classList.add('hidden');
          }, 2500);
        }

        if (elements.showNotesModal && !elements.showNotesModal.classList.contains('hidden') && elements.showTranscriptContent && !elements.showTranscriptContent.classList.contains('hidden')) {
          renderTranscriptView();
        }

        return true;
      }
    }
  } catch (err) {
    console.warn('[LRCLIB] Lyrics lookup failed:', err);
  } finally {
    if (elements.probeStatusPill && elements.probeStatusPill.textContent === 'Searching lyrics...') {
      elements.probeStatusPill.classList.add('hidden');
    }
  }

  return false;
}

function parseVttOrSrtTimestamps(text) {
  if (!text || typeof text !== 'string') return [];
  const cues = [];
  const timeRegex = /(?:(\d{1,2}):)?(\d{2}):(\d{2})[.,](\d{3})\s*-->\s*(?:(\d{1,2}):)?(\d{2}):(\d{2})[.,](\d{3})/;
  const blocks = text.split(/\r?\n\r?\n/);

  for (const block of blocks) {
    const lines = block.trim().split(/\r?\n/);
    if (lines.length < 2) continue;

    let timeLineIdx = -1;
    let match = null;

    for (let l = 0; l < lines.length; l++) {
      match = lines[l].match(timeRegex);
      if (match) {
        timeLineIdx = l;
        break;
      }
    }

    if (timeLineIdx !== -1 && match) {
      const startH = parseInt(match[1] || '0', 10);
      const startM = parseInt(match[2], 10);
      const startS = parseInt(match[3], 10);
      const startMs = parseInt(match[4], 10);
      const startSec = startH * 3600 + startM * 60 + startS + startMs / 1000;

      const endH = parseInt(match[5] || '0', 10);
      const endM = parseInt(match[6], 10);
      const endS = parseInt(match[7], 10);
      const endMs = parseInt(match[8], 10);
      const endSec = endH * 3600 + endM * 60 + endS + endMs / 1000;

      const textPayload = lines.slice(timeLineIdx + 1).join(' ').replace(/<[^>]+>/g, '').trim();

      if (endSec > startSec) {
        cues.push({
          start: startSec,
          end: endSec,
          text: textPayload,
          type: 'speech'
        });
      }
    }
  }
  return cues;
}

function deriveBarsFromCues(cues, duration, count) {
  const bars = [];
  const dur = duration > 0 ? duration : 1800;
  const barSec = dur / count;

  for (let i = 0; i < count; i++) {
    const bStart = i * barSec;
    const bEnd = (i + 1) * barSec;
    let speechDuration = 0;

    for (const cue of cues) {
      if (cue.end > bStart && cue.start < bEnd) {
        const overlap = Math.min(cue.end, bEnd) - Math.max(cue.start, bStart);
        if (overlap > 0) speechDuration += overlap;
      }
    }

    const speechRatio = speechDuration / barSec;
    const isSpeech = speechRatio > 0.2;
    const height = isSpeech ? Math.min(0.95, 0.4 + speechRatio * 0.5) : (i < 3 || i > count - 4 ? 0.65 : 0.28);
    bars.push({
      height: parseFloat(height.toFixed(2)),
      type: isSpeech ? 'speech' : 'music'
    });
  }
  return bars;
}

function deriveSegmentsFromCues(cues, duration) {
  if (!cues || cues.length === 0) return [];
  const consolidated = [];
  let cur = { start: cues[0].start, end: cues[0].end, type: 'speech' };

  for (let i = 1; i < cues.length; i++) {
    if (cues[i].start <= cur.end + 3.0) {
      cur.end = Math.max(cur.end, cues[i].end);
    } else {
      consolidated.push(cur);
      cur = { start: cues[i].start, end: cues[i].end, type: 'speech' };
    }
  }
  consolidated.push(cur);

  const fullTimeline = [];
  let lastEnd = 0;

  for (const seg of consolidated) {
    if (seg.start > lastEnd + 4.0) {
      fullTimeline.push({
        start: Math.round(lastEnd),
        end: Math.round(seg.start),
        type: 'music'
      });
    }
    fullTimeline.push({
      start: Math.round(seg.start),
      end: Math.round(seg.end),
      type: 'speech'
    });
    lastEnd = seg.end;
  }

  if (duration > lastEnd + 4.0) {
    fullTimeline.push({
      start: Math.round(lastEnd),
      end: Math.round(duration),
      type: 'music'
    });
  }

  return fullTimeline;
}

async function saveTimelineToCommunityCache(episode, duration, bars, segments, source, transcriptUrl) {
  if (!episode || !episode.guid) return;
  try {
    fetch('/api/community-transcripts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        episodeGuid: episode.guid,
        feedUrl: episode.feedUrl || '',
        duration: duration || 0,
        bars: bars || [],
        segments: segments || [],
        transcriptUrl: transcriptUrl || '',
        source: source || 'probe'
      })
    }).catch(() => {});
  } catch (_) {}
}

function deriveSegmentsFromBars(bars, duration) {
  if (!bars || bars.length === 0) return [];
  const segments = [];
  const barSec = duration / bars.length;
  let currentType = bars[0].type;
  let startSec = 0;

  for (let i = 1; i < bars.length; i++) {
    if (bars[i].type !== currentType) {
      segments.push({
        start: Math.round(startSec),
        end: Math.round(i * barSec),
        type: currentType
      });
      currentType = bars[i].type;
      startSec = i * barSec;
    }
  }
  segments.push({
    start: Math.round(startSec),
    end: Math.round(duration),
    type: currentType
  });

  return segments;
}

let _waveformRafId = null;

function renderWaveformChart() {
  // Battery Guard: skip canvas calculations and repaints when tab/screen is inactive
  if (!state.experimentalSettings.enableVisualizer || document.hidden || !state.isTabActive) {
    return;
  }

  // Prevent stacking duplicate animation frames during rapid updates
  if (_waveformRafId) cancelAnimationFrame(_waveformRafId);

  _waveformRafId = requestAnimationFrame(() => {
    _waveformRafId = null;

    const canvas = elements.episodeWaveformCanvas;
    const wrap = elements.waveformTimelineWrap;
    if (!canvas || !wrap) return;

    // Use cached/fixed 32px height instead of reading canvas.clientHeight (eliminates forced reflow)
    const w = wrap.clientWidth || 500;
    const h = 32; 
    const dpr = window.devicePixelRatio || 1;

    const targetWidth = Math.floor(w * dpr);
    const targetHeight = Math.floor(h * dpr);

    if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
      canvas.width = targetWidth;
      canvas.height = targetHeight;
    }

    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const bars = state.episodeTimeline.bars;
    if (!bars || bars.length === 0) return;

    // Calculate current playhead progress
    let curSec = 0;
    let totalDur = state.episodeTimeline.duration || 0;
    if (state.activeEngine === 'audio' && elements.audio) {
      curSec = elements.audio.currentTime || 0;
      if (!totalDur && elements.audio.duration && isFinite(elements.audio.duration)) {
        totalDur = elements.audio.duration;
      }
    } else if (state.activeEngine === 'youtube' && state.ytPlayer && state.ytPlayer.getCurrentTime) {
      curSec = state.ytPlayer.getCurrentTime() || 0;
      if (!totalDur && state.ytPlayer.getDuration) {
        totalDur = state.ytPlayer.getDuration();
      }
    }
    const curPct = (totalDur > 0) ? Math.min(1, Math.max(0, curSec / totalDur)) : (state.episodeTimeline.progressPct || 0);
    const playheadX = curPct * w;

    const barWidth = w / bars.length;
    const gap = 1.2;
    const drawWidth = Math.max(1.2, barWidth - gap);
    const showClassifier = !!state.experimentalSettings.enableAudioClassifier;

    // Detect light vs dark theme for contrast
    const isLight = document.documentElement.getAttribute('data-theme') === 'light' || 
                    (!document.documentElement.getAttribute('data-theme') && window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches);

    let activeModeAtPlayhead = 'speech';

    for (let i = 0; i < bars.length; i++) {
      const b = bars[i];
      const barH = Math.max(3, Math.round(b.height * (h - 2)));
      const x = i * barWidth + (gap / 2);
      const y = h - barH;

      const isPlayed = (x + drawWidth * 0.5) <= playheadX;
      if (isPlayed) {
        activeModeAtPlayhead = b.type || 'speech';
      }

      let color;
      if (showClassifier && b.type === 'music') {
        color = isPlayed ? '#a855f7' : (isLight ? 'rgba(168, 85, 247, 0.40)' : 'rgba(168, 85, 247, 0.35)');
      } else if (showClassifier && b.type === 'speech') {
        color = isPlayed ? '#f97316' : (isLight ? 'rgba(249, 115, 22, 0.40)' : 'rgba(249, 115, 22, 0.35)');
      } else {
        color = isPlayed ? '#f97316' : (isLight ? 'rgba(24, 24, 27, 0.22)' : 'rgba(255, 255, 255, 0.28)');
      }

      ctx.fillStyle = color;
      const r = Math.min(drawWidth / 2, 1.5);
      if (typeof ctx.roundRect === 'function') {
        ctx.beginPath();
        ctx.roundRect(x, y, drawWidth, barH, [r, r, 0, 0]);
        ctx.fill();
      } else {
        ctx.fillRect(x, y, drawWidth, barH);
      }
    }

    if (elements.btnJumpSpeech && elements.btnJumpMusic) {
      elements.btnJumpSpeech.classList.toggle('is-active-mode', activeModeAtPlayhead === 'speech');
      elements.btnJumpMusic.classList.toggle('is-active-mode', activeModeAtPlayhead === 'music');
    }
  });
}

// ── Live Caption Popup helpers ────────────────────────────────────────────
let _captionHideTimer = null;
let _captionDismissed = false;  // user manually closed it

function _showLiveCaption(text) {
  if (state.experimentalSettings.enableTranscript === false) return;
  console.log('[Caption] _showLiveCaption() called. dismissed=', _captionDismissed, ' text="' + text?.slice(0,50) + '"');
  if (_captionDismissed) {
    console.log('[Caption] ❌ dismissed by user, skipped.');
    return;
  }
  const popup   = elements.liveCaptionPopup;
  const textEl  = elements.liveCaptionText;
  console.log('[Caption] popup el=', popup, '  textEl=', textEl);
  if (!popup || !textEl) {
    console.warn('[Caption] ❌ DOM elements not found! liveCaptionPopup=', document.getElementById('live-caption-popup'));
    return;
  }

  textEl.textContent = text;
  popup.classList.remove('hidden');
  console.log('[Caption] ✅ caption shown. popup classes=', popup.className);

  // Auto-hide after 8 s of no new cues
  if (_captionHideTimer) clearTimeout(_captionHideTimer);
  _captionHideTimer = setTimeout(() => {
    if (popup) popup.classList.add('hidden');
  }, 8000);
}


function _hideLiveCaption(dismiss = false) {
  if (dismiss) _captionDismissed = true;
  if (_captionHideTimer) { clearTimeout(_captionHideTimer); _captionHideTimer = null; }
  if (elements.liveCaptionPopup) elements.liveCaptionPopup.classList.add('hidden');
}

// Wire the × close button (done once at startup)
// console.log('[Caption] Startup check — liveCaptionPopup=', elements.liveCaptionPopup, '  btnCloseCaption=', elements.btnCloseCaption);
if (elements.btnCloseCaption) {
  elements.btnCloseCaption.addEventListener('click', () => _hideLiveCaption(true));
} else {
  console.warn('[Caption] ⚠️ btnCloseCaption not found in DOM — caption popup may not work!');
}

// ── Live Transcription Engine (Cloudflare AI Whisper) ───────────────────
// Captures the podcast audio stream directly from the <audio> element
// using audio.captureStream() + MediaRecorder.
// Every CHUNK_SEC seconds the blob is POSTed to /api/transcribe which runs
// @cf/openai/whisper on Cloudflare AI and returns the transcript text.
// No microphone permission required.

const liveTranscription = (() => {
  const CHUNK_SEC  = 8;    // record 8 s at a time
  const MIME_TYPES = [     // prefer formats CF Whisper handles well
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/ogg;codecs=opus',
    'audio/mp4'
  ];

  let mediaRecorder = null;
  let audioStream   = null;
  let active        = false;
  let guidForSession = null;
  let chunkStart    = 0;   // audio.currentTime when this chunk started recording
  let chunkTimer    = null;

  // ── helpers ─────────────────────────────────────────────────────────────

  function _currentTime() {
    if (state.activeEngine === 'audio' && elements.audio) return elements.audio.currentTime || 0;
    return 0;
  }

  function _persistCues() {
    if (!guidForSession) return;
    try {
      const stored = JSON.parse(storage.getItem('anypod_live_cues_' + guidForSession) || '[]');
      const existingStarts = new Set(stored.map(c => c.start));
      const newCues = (state.episodeTimeline.cues || []).filter(c => c.live && !existingStarts.has(c.start));
      storage.setItem('anypod_live_cues_' + guidForSession, JSON.stringify([...stored, ...newCues]));
    } catch (_) {}
  }

  function _addCue(text, startSec, endSec) {
    console.log('[LiveTranscript] _addCue() text=', JSON.stringify(text?.slice(0, 60)));
    if (!text || !text.trim()) return;
    const trimmed = text.trim();
    const cues = state.episodeTimeline.cues;
    if (cues.length > 0 && cues[cues.length - 1].text === trimmed) {
      console.log('[LiveTranscript] _addCue() duplicate, skipped.');
      return;
    }
    cues.push({ start: Math.round(startSec), end: Math.round(endSec + 0.5), text: trimmed, live: true });
    console.log('[LiveTranscript] _addCue() ✅ cue added. total=', cues.length);
    if (state.experimentalSettings.enableTranscript) renderTranscriptView();
    _persistCues();
    _showLiveCaption(trimmed);
  }

  // POST recorded blob → /api/transcribe → add cue
  async function _sendChunk(blob, startSec, endSec) {
    if (!blob || blob.size < 500) {
      console.log('[LiveTranscript] chunk too small, skipping:', blob?.size, 'bytes');
      return;
    }

    // Skip sending chunks to Whisper if the audio classifier identifies this region as pure music!
    if (state.experimentalSettings.enableAudioClassifier && Array.isArray(state.episodeTimeline.bars) && state.episodeTimeline.bars.length > 0 && state.episodeTimeline.duration > 0) {
      const midSec = (startSec + endSec) * 0.5;
      const barIdx = Math.min(state.episodeTimeline.bars.length - 1, Math.max(0, Math.floor((midSec / state.episodeTimeline.duration) * state.episodeTimeline.bars.length)));
      if (state.episodeTimeline.bars[barIdx]?.type === 'music') {
        console.log(`[LiveTranscript] 🎵 Skipping Whisper transcription at ${midSec.toFixed(1)}s (classified as music)`);
        return;
      }
    }

    console.log(`[LiveTranscript] 📤 sending chunk ${blob.size} bytes  [${startSec.toFixed(1)}s → ${endSec.toFixed(1)}s]`);

    const lang = (state.currentEpisode && state.currentEpisode.language) || 'en';
    try {
      const res = await fetch('/api/transcribe', {
        method: 'POST',
        headers: {
          'Content-Type': blob.type || 'audio/webm',
          'X-Episode-Lang': lang
        },
        body: blob
      });

      const data = await res.json();
      console.log('[LiveTranscript] 📥 Whisper response:', data);

      if (!res.ok) {
        console.warn('[LiveTranscript] /api/transcribe error:', data.error);
        return;
      }

      const text = (data.text || '').trim();
      if (text) {
        _addCue(text, startSec, endSec);
      }
    } catch (e) {
      console.warn('[LiveTranscript] fetch /api/transcribe failed:', e.message);
    }
  }

  // Pick the best supported MIME type for MediaRecorder
  function _chooseMime() {
    for (const mime of MIME_TYPES) {
      if (MediaRecorder.isTypeSupported(mime)) return mime;
    }
    return '';   // browser default
  }

  // Start recording one CHUNK_SEC chunk from the audio element
  function _startChunk() {
    if (!active || !elements.audio || elements.audio.paused) return;

    // Capture the audio element stream
    let stream = audioStream;
    if (!stream) {
      try {
        stream = elements.audio.captureStream
          ? elements.audio.captureStream()
          : elements.audio.mozCaptureStream
            ? elements.audio.mozCaptureStream()
            : null;
      } catch (e) {
        console.warn('[LiveTranscript] captureStream() failed:', e.message);
      }
      if (!stream) {
        console.warn('[LiveTranscript] ❌ captureStream() not supported on this browser/OS.');
        if (elements.probeStatusPill) {
          elements.probeStatusPill.textContent = '⚠️ Live transcript not supported here';
          elements.probeStatusPill.classList.remove('hidden');
          setTimeout(() => elements.probeStatusPill?.classList.add('hidden'), 3000);
        }
        active = false;
        return;
      }
      audioStream = stream;
    }

    // Create new MediaRecorder for this chunk
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
      try { mediaRecorder.stop(); } catch (_) {}
    }

    const mime = _chooseMime();
    const chunks = [];
    const chunkStartTime = _currentTime();
    chunkStart = chunkStartTime;

    try {
      mediaRecorder = new MediaRecorder(stream, mime ? { mimeType: mime } : {});
    } catch (e) {
      console.warn('[LiveTranscript] MediaRecorder creation failed:', e.message);
      active = false;
      return;
    }

    mediaRecorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) chunks.push(e.data);
    };

    mediaRecorder.onstop = () => {
      const endTime = _currentTime();
      const blob = new Blob(chunks, { type: mime || 'audio/webm' });
      console.log(`[LiveTranscript] 🎙 chunk stopped. ${chunks.length} parts, ${blob.size} bytes`);
      _sendChunk(blob, chunkStart, endTime);

      // Schedule next chunk if still active & playing
      if (active && state.playbackStatus === 'playing') {
        chunkTimer = setTimeout(_startChunk, 200);
      }
    };

    mediaRecorder.onerror = (e) => {
      console.warn('[LiveTranscript] MediaRecorder error:', e.error?.message || e);
    };

    console.log(`[LiveTranscript] ▶ recording chunk, mime="${mime || 'default'}" duration=${CHUNK_SEC}s`);
    mediaRecorder.start();

    // Stop after CHUNK_SEC seconds to send to Whisper
    chunkTimer = setTimeout(() => {
      if (mediaRecorder && mediaRecorder.state === 'recording') {
        mediaRecorder.stop();
      }
    }, CHUNK_SEC * 1000);

    // Show pill
    if (elements.probeStatusPill) {
      elements.probeStatusPill.textContent = '🎙 Transcribing…';
      elements.probeStatusPill.classList.remove('hidden');
    }
  }

  function _stopRecording() {
    if (chunkTimer) { clearTimeout(chunkTimer); chunkTimer = null; }
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
      try { mediaRecorder.stop(); } catch (_) {}
    }
    mediaRecorder = null;
    // Don't release the stream — captureStream() is tied to the audio element
    audioStream = null;
    if (elements.probeStatusPill) elements.probeStatusPill.classList.add('hidden');
  }

  // ── Public API ───────────────────────────────────────────────────────────

  function start() {
    active = true;
    guidForSession = state.currentEpisode ? state.currentEpisode.guid : null;

    // Restore persisted cues from previous session
    if (guidForSession && state.episodeTimeline.cues.length === 0) {
      try {
        const stored = JSON.parse(storage.getItem('anypod_live_cues_' + guidForSession) || '[]');
        if (stored.length > 0) {
          state.episodeTimeline.cues = stored;
          if (state.experimentalSettings.enableTranscript) renderTranscriptView();
        }
      } catch (_) {}
    }

    if (state.playbackStatus === 'playing') _startChunk();
  }

  function stop() {
    active = false;
    _stopRecording();
  }

  function onPlayStateChange(isPlaying) {
    if (!active) return;
    if (isPlaying) {
      _startChunk();
    } else {
      _stopRecording();
    }
  }

  function onTimeUpdate(/* currentTime */) {
    // Nothing needed — chunk-based approach handles timing via stop/start
  }

  function onEpisodeChange(episode) {
    _stopRecording();
    audioStream = null;
    guidForSession = episode ? episode.guid : null;
    chunkStart = 0;

    // Load persisted cues for the new episode
    if (guidForSession && active) {
      try {
        const stored = JSON.parse(storage.getItem('anypod_live_cues_' + guidForSession) || '[]');
        if (stored.length > 0 && state.episodeTimeline.cues.length === 0) {
          state.episodeTimeline.cues = stored;
          if (state.experimentalSettings.enableTranscript) renderTranscriptView();
        }
      } catch (_) {}
    }

    if (active && state.playbackStatus === 'playing') {
      setTimeout(_startChunk, 600);
    }
  }

  return { start, stop, onPlayStateChange, onTimeUpdate, onEpisodeChange };
})();


// ── Background Audio Probing Engine ─────────────────────────────────────
// Samples points across the audio file using HTTP Range requests through
// /api/audio-proxy, decoding in a background AudioContext to measure
// multi-window spectral flux, 4Hz syllabic modulation, beat periodicity,
// and speech/music distribution.

let activeProbeAbortController = null;

async function probeEpisodeAudio(episode, duration) {
  if (!episode || !episode.audioUrl || episode.isYouTube) {
    if (elements.probeStatusPill) elements.probeStatusPill.classList.add('hidden');
    return;
  }
  // Do not run background probes if classifier is disabled or screen is already hidden
  if (!state.experimentalSettings.enableAudioClassifier || document.hidden || !state.isTabActive) {
    if (elements.probeStatusPill) elements.probeStatusPill.classList.add('hidden');
    return;
  }

  if (activeProbeAbortController) {
    activeProbeAbortController.abort();
  }
  activeProbeAbortController = new AbortController();
  const { signal } = activeProbeAbortController;

  state.episodeTimeline.isProbing = true;
  if (elements.probeStatusPill) {
    elements.probeStatusPill.textContent = 'Scanning spectrum...';
    elements.probeStatusPill.classList.remove('hidden');
  }

  // Use OfflineAudioContext: in-memory only, no OS audio channel lock
  const OfflineCtx = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  if (!OfflineCtx) {
    if (elements.probeStatusPill) elements.probeStatusPill.classList.add('hidden');
    state.episodeTimeline.isProbing = false;
    return;
  }

  // 48 HTTP Range probes x 2 sub-slices per decoded chunk = 96 timeline classification points.
  // Gives ~18s–25s chapter resolution on a 35–40m episode while keeping bandwidth tiny.
  const NUM_PROBES = 48;
  const SUB_SLICES = 2;
  const TOTAL_SLICES = NUM_PROBES * SUB_SLICES;
  const CHUNK_SIZE = 65536; // 64 KB (~3.5-4s of audio)
  let offlineCtx = null;

  try {
    offlineCtx = new OfflineCtx(1, 44100, 44100);

    let totalBytes = duration * 16000;
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

    const totalBars = state.episodeTimeline.bars.length;
    const sliceResults = new Array(TOTAL_SLICES).fill(null);

    for (let p = 0; p < NUM_PROBES; p++) {
      // Halt immediately if aborted, hidden, or tab goes inactive
      if (signal.aborted || document.hidden || !state.isTabActive) break;

      const probePos = p / NUM_PROBES;
      const startByte = Math.max(0, Math.floor(probePos * (totalBytes - CHUNK_SIZE - 2048)));
      const endByte = startByte + CHUNK_SIZE - 1;

      // Update scan progress bar (inside waveform area — visible in large player)
      const pct = Math.round((p / NUM_PROBES) * 100);
      const scanBar  = document.getElementById('scan-progress-bar');
      const scanFill = document.getElementById('scan-progress-fill');
      const scanLbl  = document.getElementById('scan-progress-label');
      if (scanBar)  scanBar.classList.remove('hidden');
      if (scanFill) scanFill.style.width = `${pct}%`;
      if (scanLbl)  scanLbl.textContent   = `Scanning ${pct}%`;

      if (elements.probeStatusPill) {
        elements.probeStatusPill.textContent = `Analyzing spectrum ${pct}%`;
      }

      try {
        const chunkRes = await fetch(`/api/audio-proxy?url=${encodeURIComponent(episode.audioUrl)}`, {
          headers: {
            Range: `bytes=${startByte}-${endByte}`
          },
          signal
        });

        if (chunkRes.ok || chunkRes.status === 206) {
          const buf = await chunkRes.arrayBuffer();
          let audioBuffer = null;

          try {
            audioBuffer = await offlineCtx.decodeAudioData(buf.slice(0));
          } catch (_) {}

          if (audioBuffer && audioBuffer.length > 0) {
            const channel = audioBuffer.getChannelData(0);
            const sr = audioBuffer.sampleRate;
            const halfLen = Math.floor(channel.length / SUB_SLICES);

            for (let s = 0; s < SUB_SLICES; s++) {
              const sliceIdx = p * SUB_SLICES + s;
              const subSamples = halfLen >= 8192
                ? channel.subarray(s * halfLen, (s + 1) * halfLen)
                : channel;

              const analysis = analyzePcmSnippet(subSamples, sr);
              sliceResults[sliceIdx] = analysis;

              const startBarIdx = Math.floor((sliceIdx / TOTAL_SLICES) * totalBars);
              const endBarIdx = Math.min(totalBars, Math.floor(((sliceIdx + 1) / TOTAL_SLICES) * totalBars));

              for (let b = startBarIdx; b < endBarIdx; b++) {
                if (state.episodeTimeline.bars[b]) {
                  state.episodeTimeline.bars[b].type = analysis.type;
                  state.episodeTimeline.bars[b].height = Math.max(0.2, analysis.energy);
                }
              }

              if (s === 0) {
                const startSec = Math.round((sliceIdx / TOTAL_SLICES) * duration);
                const meta = analysis._meta || {};
                console.log(`[AudioClassifier] Probe ${p + 1}/${NUM_PROBES} (~${Math.floor(startSec / 60)}:${String(startSec % 60).padStart(2, '0')}) -> ${analysis.type.toUpperCase()}`, {
                  type: analysis.type,
                  override: meta.override || 'none',
                  musicScore: meta.musicScore,
                  speechScore: meta.speechScore,
                  tonalCrest: meta.tonalCrest ? Number(meta.tonalCrest.toFixed(2)) : 0,
                  harmonicPeaks: meta.harmonicPeakCount || 0,
                  consonantBurst: meta.consonantBurstiness ? Number(meta.consonantBurstiness.toFixed(2)) : 0,
                  pitchStability: meta.pitchStability ? Number(meta.pitchStability.toFixed(2)) : 0,
                  subBassRatio: meta.subBassRatio ? Number(meta.subBassRatio.toFixed(3)) : 0,
                  syllabicMod: meta.syllabicMod ? Number(meta.syllabicMod.toFixed(3)) : 0,
                  beatRegularity: meta.beatRegularity ? Number(meta.beatRegularity.toFixed(3)) : 0,
                  pauseRatio: meta.pauseRatio ? Number(meta.pauseRatio.toFixed(3)) : 0
                });
              }
            }
            renderWaveformChart();
          }
        }
      } catch (err) {
        if (signal.aborted) return;
      }

      await new Promise(r => setTimeout(r, 35));
    }

    // ── Post-Probe Temporal Smoothing & Chapter Boundary Stabilization ──
    // Preserves genuine musical excerpts and spoken commentary (even 2-slice / ~35s chapters)
    // while removing isolated single-slice (15s) jitter.
    const validSlices = sliceResults.filter(Boolean);
    if (validSlices.length >= 12) {
      const musicCount = validSlices.filter(r => r.type === 'music').length;
      const musicFraction = musicCount / validSlices.length;

      for (let idx = 0; idx < TOTAL_SLICES; idx++) {
        const cur = sliceResults[idx];
        if (!cur) continue;
        const prev = idx > 0 ? sliceResults[idx - 1] : null;
        const next = idx + 1 < TOTAL_SLICES ? sliceResults[idx + 1] : null;

        // 1. Single-slice spike removal: if both immediate neighbors agree and `cur` disagrees
        // without an extreme override score, align with neighbors.
        if (idx > 0 && idx < TOTAL_SLICES - 1 && prev && next && prev.type === next.type && cur.type !== prev.type) {
          const curMargin = Math.abs((cur._meta?.musicScore || 0) - (cur._meta?.speechScore || 0));
          if (curMargin < 8) {
            cur.type = prev.type;
          }
        }
        // 2. Pure DJ Mix / Electronic Set stabilization (>86% music across 96 slices):
        // prevent brief vocal samples in techno tracks from splitting the mix into talk chapters
        else if (musicFraction >= 0.86 && cur.type === 'speech' && (cur._meta?.speechScore || 0) < 12) {
          cur.type = 'music';
        }
        // 3. Pure Talk Podcast stabilization (<12% music across 96 slices, excluding intro/outro):
        // prevent brief laughter or background hum from creating false mid-episode music chapters
        else if (musicFraction <= 0.12 && idx >= 4 && idx < TOTAL_SLICES - 4 && cur.type === 'music' && (cur._meta?.musicScore || 0) < 11) {
          cur.type = 'speech';
        }

        const startBarIdx = Math.floor((idx / TOTAL_SLICES) * totalBars);
        const endBarIdx = Math.min(totalBars, Math.floor(((idx + 1) / TOTAL_SLICES) * totalBars));
        for (let b = startBarIdx; b < endBarIdx; b++) {
          if (state.episodeTimeline.bars[b]) {
            state.episodeTimeline.bars[b].type = cur.type;
          }
        }
      }
      renderWaveformChart();
    }

    state.episodeTimeline.segments = deriveSegmentsFromBars(state.episodeTimeline.bars, duration);
    console.log(`[AudioClassifier] Episode analysis complete. Consolidated segments:`);
    if (console.table) {
      console.table(state.episodeTimeline.segments.map(s => ({
        type: s.type,
        start: `${Math.floor(s.start / 60)}:${String(s.start % 60).padStart(2, '0')}`,
        end: `${Math.floor(s.end / 60)}:${String(s.end % 60).padStart(2, '0')}`,
        duration: `${Math.round(s.end - s.start)}s`
      })));
    }

    // Hide scan progress bar
    const scanBarDone = document.getElementById('scan-progress-bar');
    const scanFillDone = document.getElementById('scan-progress-fill');
    if (scanFillDone) scanFillDone.style.width = '100%';
    setTimeout(() => {
      if (scanBarDone) scanBarDone.classList.add('hidden');
      if (scanFillDone) scanFillDone.style.width = '0%';
    }, 600);

    try {
      storage.setItem('anypod_timeline_v6_' + episode.guid, JSON.stringify({
        bars: state.episodeTimeline.bars,
        segments: state.episodeTimeline.segments
      }));
    } catch (_) {}

    saveTimelineToCommunityCache(episode, duration, state.episodeTimeline.bars, state.episodeTimeline.segments, 'probe');

    if (elements.probeStatusPill) {
      elements.probeStatusPill.textContent = '✓ Indexed for Community';
      setTimeout(() => {
        if (elements.probeStatusPill) elements.probeStatusPill.classList.add('hidden');
      }, 2500);
    }

  } catch (e) {
  } finally {
    // Ensure scan bar is hidden even on error
    const scanBarErr = document.getElementById('scan-progress-bar');
    if (scanBarErr) scanBarErr.classList.add('hidden');
    state.episodeTimeline.isProbing = false;
  }
}

// ── PCM Spectral, Harmonic Tonal Crest, Consonant Burst & Beat Analyzer ──
// Separates:
// 1. Electronic / Techno / Pop Music (<100Hz sub-bass + 96–171 BPM beat periodicity)
// 2. Classical / Orchestral / Acoustic Music (sustained harmonic overtone peaks
//    `tonalCrest` & `harmonicPeakCount` in 160–3600 Hz + high `pitchStability` + low sibilant burstiness)
// 3. Clean Speech & Low Voice Over Music ("Ducking") (3–6 Hz syllabic modulation +
//    high frame-to-frame sibilant/consonant burstiness `consonantBurstiness` in 2.4–7.5 kHz +
//    rapid formant pitch inflection).

function _fftMultiWindowPowerSpectrum(samples, sampleRate) {
  const N = 2048;
  const N2 = N >> 1;
  const binHz = sampleRate / N;
  const avgMag = new Float32Array(N2);

  if (samples.length < N) {
    return {
      mag: avgMag,
      binHz,
      N2,
      spectralFlux: 0,
      tonalCrest: 1,
      harmonicPeakCount: 0,
      consonantBurstiness: 0,
      pitchStability: 0.5
    };
  }

  // Sample up to 12 evenly spaced Hann windows across the decoded slice
  const maxWindows = 12;
  const numWindows = Math.min(maxWindows, Math.max(1, Math.floor(samples.length / N)));
  const stride = numWindows > 1 ? Math.floor((samples.length - N) / (numWindows - 1)) : 0;

  const real = new Float32Array(N);
  const imag = new Float32Array(N);
  let prevWindowMag = null;
  let fluxSum = 0;

  // Per-window tracking for:
  // - consonant/sibilant energy ratio (2400–7500 Hz vs 150–2400 Hz) to detect spoken consonants over music
  // - window spectral centroid & dominant mid-band bin to measure sustained musical pitch stability vs speech inflection
  const winConsonantRatios = [];
  const winCentroids = [];

  for (let w = 0; w < numWindows; w++) {
    const offset = w * stride;
    for (let i = 0; i < N; i++) {
      const hann = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N);
      real[i] = samples[offset + i] * hann;
      imag[i] = 0;
    }

    // Cooley-Tukey in-place radix-2 DIT FFT
    let j = 0;
    for (let i = 1; i < N; i++) {
      let bit = N >> 1;
      for (; j & bit; bit >>= 1) j ^= bit;
      j ^= bit;
      if (i < j) {
        const tr = real[i]; real[i] = real[j]; real[j] = tr;
        const ti = imag[i]; imag[i] = imag[j]; imag[j] = ti;
      }
    }

    for (let len = 2; len <= N; len <<= 1) {
      const ang = (2 * Math.PI) / len;
      const wRe = Math.cos(ang);
      const wIm = -Math.sin(ang);
      for (let i = 0; i < N; i += len) {
        let uRe = 1, uIm = 0;
        const half = len >> 1;
        for (let k = 0; k < half; k++) {
          const a = i + k;
          const b = a + half;
          const tRe = uRe * real[b] - uIm * imag[b];
          const tIm = uRe * imag[b] + uIm * real[b];
          real[b] = real[a] - tRe;
          imag[b] = imag[a] - tIm;
          real[a] += tRe;
          imag[a] += tIm;
          const tmp = uRe * wRe - uIm * wIm;
          uIm = uRe * wIm + uIm * wRe;
          uRe = tmp;
        }
      }
    }

    const curMag = new Float32Array(N2);
    let winPow = 1e-12;
    let bodyPow = 1e-12; // 140–2400 Hz (vocal/instrument body)
    let sibPow = 0;      // 2400–7500 Hz (sibilants/fricatives s, t, k, sh, f)
    let wFreqSum = 0;

    for (let i = 1; i < N2; i++) {
      const p = real[i] * real[i] + imag[i] * imag[i];
      curMag[i] = p;
      avgMag[i] += p / numWindows;
      winPow += p;

      const hz = i * binHz;
      wFreqSum += hz * p;
      if (hz >= 140 && hz < 2400) bodyPow += p;
      else if (hz >= 2400 && hz <= 7500) sibPow += p;
    }

    // Only include non-silent windows in frame-to-frame variance stats
    if (winPow > 1e-6) {
      winConsonantRatios.push(sibPow / bodyPow);
      winCentroids.push(wFreqSum / winPow);
    }

    // Spectral flux between consecutive windows (normalized)
    if (prevWindowMag) {
      let diffSq = 0;
      for (let i = 1; i < N2; i++) {
        const d = (curMag[i] / winPow) - prevWindowMag[i];
        diffSq += d * d;
      }
      fluxSum += Math.sqrt(diffSq);
    }
    prevWindowMag = new Float32Array(N2);
    for (let i = 1; i < N2; i++) prevWindowMag[i] = curMag[i] / winPow;
  }

  const spectralFlux = numWindows > 1 ? fluxSum / (numWindows - 1) : 0;

  // ── A. Harmonic Tonal Crest & Narrow Overtone Peak Count (160–3600 Hz) ──
  // Classical strings, woodwinds (bassoon, clarinet, oboe, flute), piano, brass, and
  // tonal synths produce sharp stationary harmonic spikes in the time-averaged spectrum
  // where a single bin (or 2-bin peak) towers 4x–25x above its local ±6-bin neighborhood.
  // Spoken voice glides continuously in pitch (formants are broad mounds, not narrow spikes).
  const minBin = Math.max(3, Math.floor(160 / binHz));
  const maxBin = Math.min(N2 - 7, Math.ceil(3600 / binHz));
  let harmonicPeakCount = 0;
  let peakRatioSum = 0;
  let maxPeakRatio = 1;

  for (let i = minBin; i <= maxBin; i++) {
    const p = avgMag[i];
    // Check if local maximum (allowing 1-bin neighbor sharing for bin-straddling tones)
    if (p > avgMag[i - 1] && p >= avgMag[i + 1]) {
      // Compute local background excluding the immediate ±1 peak bins
      let surrSum = 0;
      let surrCount = 0;
      for (let k = -6; k <= 6; k++) {
        if (k >= -1 && k <= 1) continue;
        surrSum += avgMag[i + k];
        surrCount++;
      }
      const surrAvg = (surrSum / surrCount) + 1e-12;
      const ratio = p / surrAvg;
      if (ratio > maxPeakRatio) maxPeakRatio = ratio;
      if (ratio >= 4.2) {
        harmonicPeakCount++;
        peakRatioSum += Math.min(25, ratio);
      }
    }
  }
  const tonalCrest = harmonicPeakCount > 0
    ? (peakRatioSum / harmonicPeakCount)
    : Math.min(4.0, maxPeakRatio);

  // ── B. Consonant / Sibilance Burstiness Across Windows ──
  // When someone speaks (even a quiet/low voice over classical music), every word injects
  // brief unvoiced consonant bursts (s, t, k, ch, f) in 2.4–7.5 kHz, causing the
  // high-to-body ratio to jump erratically from window to window (high coefficient of variation).
  // Pure orchestral/classical/ambient music has smooth high-frequency evolution.
  let consonantBurstiness = 0;
  if (winConsonantRatios.length >= 3) {
    let meanR = 0;
    for (let i = 0; i < winConsonantRatios.length; i++) meanR += winConsonantRatios[i];
    meanR /= winConsonantRatios.length;
    let varR = 0;
    for (let i = 0; i < winConsonantRatios.length; i++) {
      const d = winConsonantRatios[i] - meanR;
      varR += d * d;
    }
    const stdR = Math.sqrt(varR / winConsonantRatios.length);
    consonantBurstiness = stdR / (meanR + 0.008);
  }

  // ── C. Pitch / Centroid Stability Across Windows ──
  // Sustained musical notes/chords keep a relatively stable spectral centroid across
  // 90ms windows (low relative jitter -> pitchStability near 1.0), whereas speech
  // alternates rapidly between low-centroid vowels and high-centroid fricatives.
  let pitchStability = 0.5;
  if (winCentroids.length >= 3) {
    let meanC = 0;
    for (let i = 0; i < winCentroids.length; i++) meanC += winCentroids[i];
    meanC /= winCentroids.length;
    let stepDiff = 0;
    for (let i = 1; i < winCentroids.length; i++) {
      stepDiff += Math.abs(winCentroids[i] - winCentroids[i - 1]);
    }
    const avgJumpRatio = (stepDiff / (winCentroids.length - 1)) / (meanC + 100);
    // avgJumpRatio ~0.05..0.18 in sustained classical/tonal music -> stability 0.65..0.90
    // avgJumpRatio ~0.30..0.75 in natural speech -> stability 0.10..0.40
    pitchStability = Math.max(0, Math.min(1, 1 - avgJumpRatio * 1.8));
  }

  return {
    mag: avgMag,
    binHz,
    N2,
    spectralFlux,
    tonalCrest,
    harmonicPeakCount,
    consonantBurstiness,
    pitchStability
  };
}

function analyzePcmSnippet(samples, sampleRate) {
  const len = samples.length;
  if (len === 0) return { type: 'speech', energy: 0.1 };

  // ── 1. Time-domain RMS ───────────────────────────────────────────────────
  let sumSq = 0;
  for (let i = 0; i < len; i++) sumSq += samples[i] * samples[i];
  const rms = Math.sqrt(sumSq / len);
  if (rms < 0.008) return { type: 'silence', energy: 0.05 };

  // ── 2. Fine-grained 25ms (40Hz) envelope for syllabic & beat analysis ────
  const envWin = Math.max(128, Math.floor(sampleRate * 0.025)); // 25ms = 40 frames/sec
  const numFrames = Math.floor(len / envWin);
  const env = new Float32Array(numFrames);
  let silentFrames = 0;

  for (let f = 0; f < numFrames; f++) {
    let fSq = 0;
    const off = f * envWin;
    for (let j = 0; j < envWin; j++) {
      const s = samples[off + j];
      fSq += s * s;
    }
    const fRms = Math.sqrt(fSq / envWin);
    env[f] = fRms;
    // Frame is a micro-pause (inter-word / inter-syllable gap) if < 18% of mean RMS
    if (fRms < rms * 0.18) silentFrames++;
  }

  const pauseRatio = numFrames > 0 ? silentFrames / numFrames : 0;

  // Dynamic range (10th to 90th percentile of envelope)
  const sortedEnv = Float32Array.from(env).sort();
  const p10 = sortedEnv[Math.floor(numFrames * 0.10)] || 0;
  const p90 = sortedEnv[Math.floor(numFrames * 0.90)] || 0;
  const dynamicRange = (p90 - p10) / (rms + 1e-6);

  // ── 3. 4Hz Syllabic Modulation vs Rhythmic Beat Periodicity ──────────────
  // Human speech has a universal syllable cadence peaking around 3–6 Hz, with
  // irregular micro-pauses. Techno / house / electronic music has strong periodic
  // autocorrelation at beat intervals (100–165 BPM = lags of 14 to 24 frames at 40Hz).
  let syllabicMod = 0;
  let beatRegularity = 0;

  if (numFrames >= 28) {
    let meanEnv = 0;
    for (let f = 0; f < numFrames; f++) meanEnv += env[f];
    meanEnv /= numFrames;

    const centered = new Float32Array(numFrames);
    let envVar = 1e-12;
    for (let f = 0; f < numFrames; f++) {
      centered[f] = env[f] - meanEnv;
      envVar += centered[f] * centered[f];
    }

    // Normalized autocorrelation at beat lags: 14..25 frames (0.35s..0.625s => 96..171 BPM)
    let maxBeatCorr = 0;
    for (let lag = 14; lag <= 25 && lag < numFrames - 6; lag++) {
      let corr = 0;
      const count = numFrames - lag;
      for (let f = 0; f < count; f++) {
        corr += centered[f] * centered[f + lag];
      }
      const normCorr = (corr / count) / (envVar / numFrames);
      if (normCorr > maxBeatCorr) maxBeatCorr = normCorr;
    }
    beatRegularity = Math.max(0, maxBeatCorr);

    // 3–6 Hz syllabic modulation energy via DFT of envelope at 3, 4, 5, 6 Hz
    let syllabicPow = 0;
    const frameRate = sampleRate / envWin; // ~40 Hz
    for (const modHz of [3, 4, 5, 6]) {
      let re = 0, im = 0;
      for (let f = 0; f < numFrames; f++) {
        const ang = (2 * Math.PI * modHz * f) / frameRate;
        re += centered[f] * Math.cos(ang);
        im -= centered[f] * Math.sin(ang);
      }
      syllabicPow += (re * re + im * im) / (numFrames * numFrames);
    }
    syllabicMod = Math.sqrt(syllabicPow) / (meanEnv + 1e-6);
  }

  // ── 4. Multi-window Welch FFT + Harmonic & Consonant Burst Analysis ──────
  const {
    mag,
    binHz,
    N2,
    tonalCrest,
    harmonicPeakCount,
    consonantBurstiness,
    pitchStability
  } = _fftMultiWindowPowerSpectrum(samples, sampleRate);
  const EPS = 1e-12;

  let totalPower = 0, weightedFreqSum = 0, logSum = 0;
  // Carefully separated frequency bands:
  // - eSubBass (<100 Hz): True sub-bass & kick fundamental (absent in clean speech)
  // - eVoiceFund (100–260 Hz): Male & female vocal fundamental F0 + cello/bassoon fundamental
  // - eLowMid (260–1000 Hz): First vowel formant F1 & warm orchestral/horn/piano body
  // - eSpeechCore (1000–3800 Hz): Vowel F2/F3 formants & string/woodwind overtones
  // - eHigh (3800–8500 Hz): Hi-hats, cymbals, synth fizz, vocal sibilance
  // - eAir (>8500 Hz): Ultra-high musical air & stereo percussion
  let eSubBass = 0, eVoiceFund = 0, eLowMid = 0, eSpeechCore = 0, eHigh = 0, eAir = 0;

  for (let i = 1; i < N2; i++) {
    const hz = i * binHz;
    const p  = mag[i] + EPS;
    totalPower      += p;
    weightedFreqSum += hz * p;
    logSum          += Math.log(p);
    if      (hz < 100)  eSubBass    += p;
    else if (hz < 260)  eVoiceFund  += p;
    else if (hz < 1000) eLowMid     += p;
    else if (hz < 3800) eSpeechCore += p;
    else if (hz < 8500) eHigh       += p;
    else                eAir        += p;
  }

  const centroid        = weightedFreqSum / (totalPower + EPS);
  const geoMean         = Math.exp(logSum / N2);
  const arithMean       = totalPower / N2;
  const flatness        = geoMean / (arithMean + EPS);

  const subBassRatio    = eSubBass / (totalPower + EPS);
  const voiceFundRatio  = eVoiceFund / (totalPower + EPS);
  const speechCoreRatio = (eLowMid * 0.4 + eSpeechCore) / (totalPower + EPS);
  const highRatio       = (eHigh + eAir) / (totalPower + EPS);
  const airRatio        = eAir / (totalPower + EPS);

  // Spectral rolloff (85th percentile)
  let rolloffHz = binHz, cumPow = 0;
  const rolloffTarget = 0.85 * totalPower;
  for (let i = 1; i < N2; i++) {
    cumPow += mag[i];
    if (cumPow >= rolloffTarget) { rolloffHz = i * binHz; break; }
  }

  // Spectral variance (spread around centroid)
  let varSum = 0;
  for (let i = 1; i < N2; i++) {
    const hz = i * binHz;
    const p  = mag[i] + EPS;
    varSum += p * (hz - centroid) * (hz - centroid);
  }
  const spectralVar = Math.sqrt(varSum / (totalPower + EPS));

  // ── 5. High-Confidence Override Rules ────────────────────────────────────
  //
  // A) TECHNO / ELECTRONIC / FULL-RANGE MUSIC OVERRIDE:
  // Strong sub-bass (<100Hz kick/sub) AND rhythmic beat regularity or continuous energy without speech pauses
  if (
    (subBassRatio > 0.14 && pauseRatio < 0.08 && consonantBurstiness < 0.85) ||
    (subBassRatio > 0.08 && highRatio > 0.12 && pauseRatio < 0.09 && consonantBurstiness < 0.80) ||
    (beatRegularity > 0.42 && pauseRatio < 0.10 && consonantBurstiness < 0.85)
  ) {
    return {
      type: 'music',
      energy: Math.min(1.0, Math.max(0.15, rms * 5)),
      _meta: { rms, dynamicRange, pauseRatio, syllabicMod, beatRegularity, tonalCrest, harmonicPeakCount, consonantBurstiness, pitchStability, centroid, flatness, rolloffHz, speechCoreRatio, highRatio, subBassRatio, musicScore: 99, speechScore: 0, override: 'techno_or_broadband_music' }
    };
  }

  // B) CLASSICAL / ORCHESTRAL / ACOUSTIC INSTRUMENTAL OVERRIDE:
  // Classical instruments (strings, woodwinds like bassoon/clarinet, piano, brass) often have
  // zero <100Hz sub-bass and rubato tempo, but exhibit sharp sustained harmonic peaks
  // (`tonalCrest >= 6.8` & `harmonicPeakCount >= 6`), high `pitchStability >= 0.62`,
  // and smooth sibilant evolution (`consonantBurstiness < 0.62`, `pauseRatio < 0.10`).
  if (
    tonalCrest >= 6.8 &&
    harmonicPeakCount >= 6 &&
    pitchStability >= 0.62 &&
    consonantBurstiness < 0.62 &&
    pauseRatio < 0.10
  ) {
    return {
      type: 'music',
      energy: Math.min(1.0, Math.max(0.15, rms * 5)),
      _meta: { rms, dynamicRange, pauseRatio, syllabicMod, beatRegularity, tonalCrest, harmonicPeakCount, consonantBurstiness, pitchStability, centroid, flatness, rolloffHz, speechCoreRatio, highRatio, subBassRatio, musicScore: 95, speechScore: 0, override: 'classical_or_harmonic_music' }
    };
  }

  // C) CLEAR SPEECH OR VOICE-OVER-MUSIC ("DUCKING") OVERRIDE:
  // 1. Clean studio speech: syllabic pauses (`pauseRatio >= 0.12`), low sub-bass, and consonant bursts
  // 2. Host speaking over background music ("ducking"): `pauseRatio` may be near 0 because the music bed
  //    fills the silences, but human articulation produces strong 3–6 Hz `syllabicMod` AND sharp
  //    frame-to-frame sibilant bursts (`consonantBurstiness >= 0.82`) with non-stationary pitch.
  if (
    (pauseRatio >= 0.12 && subBassRatio < 0.06 && dynamicRange > 0.75 && tonalCrest < 7.5) ||
    (consonantBurstiness >= 0.85 && syllabicMod >= 0.17 && pitchStability < 0.58 && subBassRatio < 0.12)
  ) {
    return {
      type: 'speech',
      energy: Math.min(1.0, Math.max(0.15, rms * 5)),
      _meta: { rms, dynamicRange, pauseRatio, syllabicMod, beatRegularity, tonalCrest, harmonicPeakCount, consonantBurstiness, pitchStability, centroid, flatness, rolloffHz, speechCoreRatio, highRatio, subBassRatio, musicScore: 0, speechScore: 99, override: pauseRatio >= 0.12 ? 'syllabic_speech' : 'voice_over_music_bed' }
    };
  }

  // ── 6. Calibrated Multi-Feature Scoring (Techno + Classical + Speech) ────
  let musicScore = 0;
  let speechScore = 0;

  // 1. Harmonic Tonal Crest & Sustained Overtone Peaks (crucial for Classical, Chamber, Jazz, Piano, Strings)
  if (tonalCrest >= 7.0 && harmonicPeakCount >= 5)      musicScore += 5;
  else if (tonalCrest >= 5.5 && harmonicPeakCount >= 4) musicScore += 3;
  else if (tonalCrest >= 4.6 && harmonicPeakCount >= 3) musicScore += 2;
  else if (tonalCrest < 3.8 && harmonicPeakCount <= 2)  speechScore += 2;

  // 2. Pitch / Centroid Stability vs Rapid Vocal Inflection
  if (pitchStability >= 0.68)                           musicScore += 3;
  else if (pitchStability >= 0.56)                      musicScore += 2;
  else if (pitchStability < 0.38)                       speechScore += 3;
  else if (pitchStability < 0.48)                       speechScore += 1;

  // 3. Consonant / Sibilance Burstiness (detects low voice speaking even over a quiet classical bed!)
  if (consonantBurstiness >= 0.80)                      speechScore += 4;
  else if (consonantBurstiness >= 0.58)                 speechScore += 3;
  else if (consonantBurstiness >= 0.42)                 speechScore += 1;
  else if (consonantBurstiness < 0.28)                  musicScore += 3;

  // 4. True sub-bass (<100 Hz) — 808/909 kicks, basslines, double-bass/timpani
  // Note: Do NOT award large speechScore just because subBassRatio is low (classical woodwinds/strings also have 0 sub-bass!)
  if (subBassRatio > 0.16)                              musicScore += 4;
  else if (subBassRatio > 0.09)                         musicScore += 3;
  else if (subBassRatio > 0.045)                        musicScore += 1;
  else if (subBassRatio < 0.025 && tonalCrest < 4.8)    speechScore += 2;

  // 5. Rhythmic beat regularity (autocorrelation at 96–171 BPM)
  if (beatRegularity > 0.35)                            musicScore += 4;
  else if (beatRegularity > 0.24)                       musicScore += 2;
  else if (beatRegularity > 0.16)                       musicScore += 1;

  // 6. Inter-syllable / inter-word micro-pauses
  if (pauseRatio >= 0.16)                               speechScore += 4;
  else if (pauseRatio >= 0.09)                          speechScore += 3;
  else if (pauseRatio >= 0.045)                         speechScore += 1;
  else if (pauseRatio < 0.02 && consonantBurstiness < 0.50) musicScore += 3; // Continuous musical texture without spoken sibilants

  // 7. Dynamic range & 4Hz syllabic modulation
  // Guarded by consonantBurstiness / tonalCrest so expressive rubato classical passages aren't mistaken for speech
  if (dynamicRange > 1.15 && tonalCrest < 5.5)          speechScore += 2;
  else if (dynamicRange < 0.45)                         musicScore += 2;

  if (syllabicMod > 0.20 && beatRegularity < 0.25 && consonantBurstiness >= 0.40) {
    speechScore += 3;
  } else if (syllabicMod < 0.10) {
    musicScore += 1;
  }

  // 8. High-frequency & air content
  if (highRatio > 0.18 || airRatio > 0.05)              musicScore += 2;
  else if (highRatio > 0.10)                            musicScore += 1;

  if (rolloffHz > 6200)                                 musicScore += 2;
  else if (rolloffHz < 3400 && tonalCrest < 5.0 && consonantBurstiness >= 0.38) {
    speechScore += 2;
  }

  // 9. Vocal formant concentration (only when accompanied by consonant bursts or speech pauses)
  if (speechCoreRatio > 0.45 && consonantBurstiness >= 0.42 && tonalCrest < 5.8) {
    speechScore += 2;
  }
  if (voiceFundRatio > 0.22 && subBassRatio < 0.05 && (pauseRatio >= 0.05 || consonantBurstiness >= 0.48) && tonalCrest < 5.8) {
    speechScore += 2; // Warm/low spoken voice (even over quiet background music)
  }

  const isMusic = musicScore >= 6 && musicScore > speechScore;

  return {
    type: isMusic ? 'music' : 'speech',
    energy: Math.min(1.0, Math.max(0.15, rms * 5)),
    _meta: {
      rms,
      dynamicRange,
      pauseRatio,
      syllabicMod,
      beatRegularity,
      tonalCrest,
      harmonicPeakCount,
      consonantBurstiness,
      pitchStability,
      centroid,
      flatness,
      rolloffHz,
      speechCoreRatio,
      highRatio,
      subBassRatio,
      spectralVar,
      musicScore,
      speechScore
    }
  };
}

// ── Segment Navigation (Jump to Music / Talk) ───────────────────────────

function jumpToNextSegment(targetType) {
  if (!state.currentEpisode) return;

  let curTime = 0;
  if (state.activeEngine === 'audio') {
    curTime = elements.audio.currentTime || 0;
  } else if (state.activeEngine === 'youtube' && state.ytPlayer && state.ytPlayer.getCurrentTime) {
    curTime = state.ytPlayer.getCurrentTime() || 0;
  }

  const segments = state.episodeTimeline.segments || [];
  // Find next segment of targetType after current time + 4 seconds
  const nextSeg = segments.find(s => s.type === targetType && s.start > curTime + 4);

  if (nextSeg) {
    if (state.activeEngine === 'audio') {
      elements.audio.currentTime = nextSeg.start;
    } else if (state.activeEngine === 'youtube' && state.ytPlayer && state.ytPlayer.seekTo) {
      state.ytPlayer.seekTo(nextSeg.start, true);
    }
    updateProgress();
    if (elements.probeStatusPill) {
      elements.probeStatusPill.textContent = `⏭ Jumped to ${targetType === 'music' ? 'Music 🎵' : 'Talk 🎙️'} (${formatTime(nextSeg.start)})`;
      elements.probeStatusPill.classList.remove('hidden');
      setTimeout(() => elements.probeStatusPill.classList.add('hidden'), 2500);
    }
  } else {
    if (elements.probeStatusPill) {
      elements.probeStatusPill.textContent = `No more ${targetType} segments ahead`;
      elements.probeStatusPill.classList.remove('hidden');
      setTimeout(() => elements.probeStatusPill.classList.add('hidden'), 2000);
    }
  }
}

// ── Waveform Scrubber Interactivity ─────────────────────────────────────

function setupWaveformInteractivity() {
  const wrap = elements.waveformTimelineWrap;
  if (!wrap) return;

  let isDragging = false;
  let cachedWrapRect = null;
  let seekDebounceTimer = null;
  let lastTargetSec = 0;

  const applySeekToEngine = (targetSec) => {
    state._lastDrawnWaveformBarIndex = -1;
    if (state.activeEngine === 'audio') {
      elements.audio.currentTime = targetSec;
    } else if (state.activeEngine === 'youtube' && state.ytPlayer && state.ytPlayer.seekTo) {
      state.ytPlayer.seekTo(targetSec, true);
    }
    updateProgress();
    if (state.experimentalSettings.enableVisualizer) {
      renderWaveformChart();
    }
  };

  const seekToPoint = (clientX, immediate = false) => {
    if (!cachedWrapRect) cachedWrapRect = wrap.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (clientX - cachedWrapRect.left) / cachedWrapRect.width));

    let totalDur = 0;
    if (state.activeEngine === 'audio' && elements.audio.duration && isFinite(elements.audio.duration)) {
      totalDur = elements.audio.duration;
    } else if (state.activeEngine === 'youtube' && state.ytPlayer && state.ytPlayer.getDuration) {
      totalDur = state.ytPlayer.getDuration();
    } else if (state.episodeTimeline.duration > 0) {
      totalDur = state.episodeTimeline.duration;
    }

    if (totalDur > 0) {
      const targetSec = pct * totalDur;
      lastTargetSec = targetSec;

      // Visual update is immediate for fluid UI response:
      const progressOverlay = document.getElementById('waveform-progress-overlay');
      const playheadLine = document.getElementById('waveform-playhead-line');
      if (progressOverlay) progressOverlay.style.width = `${pct * 100}%`;
      if (playheadLine) playheadLine.style.left = `${pct * 100}%`;
      if (elements.currentTimeLabel) elements.currentTimeLabel.textContent = formatTime(targetSec);
      if (elements.seekBar) {
        elements.seekBar.value = pct * 100;
        elements.seekBar.style.setProperty('--seek-pct', `${pct * 100}%`);
      }

      if (immediate) {
        clearTimeout(seekDebounceTimer);
        seekDebounceTimer = null;
        applySeekToEngine(targetSec);
      } else {
        // Debounce continuous drag to prevent Range-request network flood and stalled decoding
        clearTimeout(seekDebounceTimer);
        seekDebounceTimer = setTimeout(() => {
          applySeekToEngine(lastTargetSec);
        }, 120);
      }
    }
  };

  wrap.addEventListener('mousedown', (e) => {
    if (e.target && (e.target.id === 'total-duration' || e.target.id === 'current-time')) return;
    isDragging = true;
    cachedWrapRect = wrap.getBoundingClientRect();
    // Single tap / initial click jumps directly!
    seekToPoint(e.clientX, true);
  });

  window.addEventListener('mousemove', (e) => {
    if (isDragging) seekToPoint(e.clientX, false);
  });

  window.addEventListener('mouseup', () => {
    if (isDragging) {
      isDragging = false;
      clearTimeout(seekDebounceTimer);
      applySeekToEngine(lastTargetSec);
    }
    cachedWrapRect = null;
  });

  // Touch events
  wrap.addEventListener('touchstart', (e) => {
    if (e.target && (e.target.id === 'total-duration' || e.target.id === 'current-time')) return;
    if (e.touches && e.touches[0]) {
      isDragging = true;
      cachedWrapRect = wrap.getBoundingClientRect();
      // Single tap jumps directly!
      seekToPoint(e.touches[0].clientX, true);
    }
  }, { passive: false });

  wrap.addEventListener('touchmove', (e) => {
    if (isDragging && e.touches && e.touches[0]) {
      if (e.cancelable) e.preventDefault(); // Prevents vertical page scroll while scrubbing waveform
      seekToPoint(e.touches[0].clientX, false);
    }
  }, { passive: false });

  wrap.addEventListener('touchend', () => {
    if (isDragging) {
      isDragging = false;
      clearTimeout(seekDebounceTimer);
      applySeekToEngine(lastTargetSec);
    }
    cachedWrapRect = null;
  });

  // Hover tooltip: Cache bounding rect on enter, clear on leave
  let hoverWrapRect = null;
  wrap.addEventListener('mouseenter', () => {
    hoverWrapRect = wrap.getBoundingClientRect();
  });

  wrap.addEventListener('mousemove', (e) => {
    if (!hoverWrapRect) hoverWrapRect = wrap.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (e.clientX - hoverWrapRect.left) / hoverWrapRect.width));

    if (elements.waveformHoverCursor) {
      elements.waveformHoverCursor.style.left = `${pct * 100}%`;
    }

    if (elements.waveformTooltip) {
      const dur = state.episodeTimeline.duration || (elements.audio ? elements.audio.duration : 0) || 0;
      const hoverSec = pct * dur;
      const segments = state.episodeTimeline.segments || [];

      // Only compute speech/music label if Audio Classifier is active in settings
      const showClassifier = Boolean(state.experimentalSettings && state.experimentalSettings.enableAudioClassifier);
      const matchSeg = showClassifier ? segments.find(s => hoverSec >= s.start && hoverSec <= s.end) : null;
      const typeLabel = matchSeg ? (matchSeg.type === 'music' ? '🎵 Music' : '🎙️ Talk') : '';

      elements.waveformTooltip.textContent = `${formatTime(hoverSec)}${typeLabel ? ' · ' + typeLabel : ''}`;
      elements.waveformTooltip.style.left = `${pct * 100}%`;
      elements.waveformTooltip.classList.remove('hidden');
    }
  });

  wrap.addEventListener('mouseleave', () => {
    hoverWrapRect = null;
    if (elements.waveformTooltip) {
      elements.waveformTooltip.classList.add('hidden');
    }
  });

  function wireDoubleTapJumpButton(btn, targetType) {
    if (!btn) return;
    let clickTimer = null;
    let lastTapTime = 0;

    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();

      const now = Date.now();
      const diff = now - lastTapTime;

      if (diff > 0 && diff < 280) {
        // Double Tap detected: cancel single-tap jump and toggle auto-skip
        clearTimeout(clickTimer);
        clickTimer = null;
        lastTapTime = 0;

        state.experimentalSettings.autoSkipSpeech = !state.experimentalSettings.autoSkipSpeech;
        saveExperimentalSettings();
        syncExperimentalUI();

        const active = state.experimentalSettings.autoSkipSpeech;
        showToast(active ? '⚡ auto-skip talk enabled' : 'auto-skip talk disabled');
        return;
      }

      // Potential single tap: wait 280ms before firing jump
      lastTapTime = now;
      clearTimeout(clickTimer);
      clickTimer = setTimeout(() => {
        jumpToNextSegment(targetType);
        clickTimer = null;
        lastTapTime = 0;
      }, 280);
    });
  }

  wireDoubleTapJumpButton(elements.btnJumpSpeech, 'speech');
  wireDoubleTapJumpButton(elements.btnJumpMusic, 'music');

  // Resize observer / window resize for responsive canvas
  window.addEventListener('resize', () => {
    renderWaveformChart();
  });
}

// ── Hook into audio engine ──────────────────────────────────────────────

function hookVisualizerToAudio() {
  setupWaveformInteractivity();

  const audio = elements.audio;
  audio.addEventListener('loadedmetadata', () => {
    if (audio.duration && state.currentEpisode && !document.hidden && state.isTabActive) {
      initOrLoadEpisodeTimeline(state.currentEpisode, audio.duration);
    }
  });

  audio.addEventListener('durationchange', () => {
    if (audio.duration && state.currentEpisode && !document.hidden && state.isTabActive) {        
      initOrLoadEpisodeTimeline(state.currentEpisode, audio.duration);
    }
  });
}

if (document.readyState === 'loading') {
  // Programmatically activate non-blocking stylesheets (Zero CSP violations)
  document.addEventListener('DOMContentLoaded', () => {
    const fontLink = document.getElementById('google-fonts-link');
    if (fontLink) fontLink.media = 'all';

    const styleLink = document.getElementById('app-style-link');
    if (styleLink) styleLink.media = 'all';
  });

  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
