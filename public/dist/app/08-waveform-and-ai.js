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

  // Check localStorage cache (v4 prefix for calibrated FFT classifier)
  const cacheKey = 'anypod_timeline_v4_' + episode.guid;
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
  const cacheKey = 'anypod_timeline_v4_' + episode.guid;

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

  // TIER 2: Check Cloudflare D1 Community Cache
  try {
    if (elements.probeStatusPill) {
      elements.probeStatusPill.textContent = 'Checking community...';
      elements.probeStatusPill.classList.remove('hidden');
    }

    const res = await fetch(`/api/community-transcripts?guid=${encodeURIComponent(episode.guid)}`);
    if (res.ok) {
      const data = await res.json();
      if (data.found && data.bars && data.bars.length > 0) {
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
  const cacheKey = 'anypod_timeline_v4_' + episode.guid;

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
// spectral flux, energy variance, and speech/music distribution.

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

  const NUM_PROBES = 24;
  const CHUNK_SIZE = 49152; // 48 KB
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

    const barsPerProbe = Math.ceil(state.episodeTimeline.bars.length / NUM_PROBES);

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
            const analysis = analyzePcmSnippet(channel, audioBuffer.sampleRate);

            const startSec = Math.round((p / NUM_PROBES) * duration);
            const meta = analysis._meta || {};
            console.log(`[AudioClassifier] Probe ${p + 1}/${NUM_PROBES} (~${Math.floor(startSec / 60)}:${String(startSec % 60).padStart(2, '0')}) -> ${analysis.type.toUpperCase()}`, {
              type: analysis.type,
              override: meta.override || 'none',
              musicScore: meta.musicScore,
              speechScore: meta.speechScore,
              bassRatio: meta.bassRatio ? Number(meta.bassRatio.toFixed(3)) : 0,
              speechCoreRatio: meta.speechCoreRatio ? Number(meta.speechCoreRatio.toFixed(3)) : 0,
              highRatio: meta.highRatio ? Number(meta.highRatio.toFixed(3)) : 0,
              dynamicRange: meta.dynamicRange ? Number(meta.dynamicRange.toFixed(3)) : 0,
              harmonicRatio: meta.harmonicRatio ? Number(meta.harmonicRatio.toFixed(3)) : 0,
              flatness: meta.flatness ? Number(meta.flatness.toFixed(3)) : 0,
              rolloffHz: meta.rolloffHz ? Math.round(meta.rolloffHz) : 0,
              centroidHz: meta.centroid ? Math.round(meta.centroid) : 0
            });

            const startBarIdx = p * barsPerProbe;
            const endBarIdx = Math.min(state.episodeTimeline.bars.length, startBarIdx + barsPerProbe);

            for (let b = startBarIdx; b < endBarIdx; b++) {
              if (state.episodeTimeline.bars[b]) {
                state.episodeTimeline.bars[b].type = analysis.type;
                state.episodeTimeline.bars[b].height = Math.max(0.2, analysis.energy);
              }
            }
            renderWaveformChart();
          }
        }
      } catch (err) {
        if (signal.aborted) return;
      }

      await new Promise(r => setTimeout(r, 60));
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
      storage.setItem('anypod_timeline_v4_' + episode.guid, JSON.stringify({
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

// ── PCM Spectral & Energy Analyzer (FFT-based) ───────────────────────────
// Computes a power-spectrum via a compact DFT over evenly-spaced windows,
// then derives: spectral centroid, flatness (Wiener entropy), rolloff, and
// sub-band energy ratios.  Much more reliable than pure time-domain ZCR.

function _fftPowerSpectrum(samples, sampleRate) {
  // Use a power-of-2 window for speed.  Take the first 4096 samples max.
  const N = Math.min(4096, samples.length);
  const N2 = N >> 1;            // number of useful magnitude bins
  const real = new Float32Array(N);
  const imag = new Float32Array(N);

  // Hann window
  for (let i = 0; i < N; i++) {
    const hann = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N);
    real[i] = samples[i] * hann;
  }

  // Cooley-Tukey in-place radix-2 DIT FFT
  // Bit-reversal permutation
  let j = 0;
  for (let i = 1; i < N; i++) {
    let bit = N >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [real[i], real[j]] = [real[j], real[i]];
      [imag[i], imag[j]] = [imag[j], imag[i]];
    }
  }

  // FFT butterfly
  for (let len = 2; len <= N; len <<= 1) {
    const ang = (2 * Math.PI) / len;
    const wRe = Math.cos(ang);
    const wIm = -Math.sin(ang);
    for (let i = 0; i < N; i += len) {
      let uRe = 1, uIm = 0;
      for (let k = 0; k < (len >> 1); k++) {
        const a = i + k;
        const b = a + (len >> 1);
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

  // Power spectrum (magnitude² normalised)
  const mag = new Float32Array(N2);
  const binHz = sampleRate / N;
  for (let i = 0; i < N2; i++) {
    mag[i] = real[i] * real[i] + imag[i] * imag[i];
  }
  return { mag, binHz, N2 };
}

function analyzePcmSnippet(samples, sampleRate) {
  const len = samples.length;
  if (len === 0) return { type: 'speech', energy: 0.1 };

  // ── 1. Time-domain RMS ───────────────────────────────────────────────────
  let sumSq = 0;
  for (let i = 0; i < len; i++) sumSq += samples[i] * samples[i];
  const rms = Math.sqrt(sumSq / len);
  if (rms < 0.008) return { type: 'silence', energy: 0.05 };

  // ── 2. Median-based dynamic range (robust to broadcast compression) ──────
  // min/max is fooled by heavily compressed broadcast audio (like NPR).
  // Compute per-window RMS, sort, use 10th-pct vs 90th-pct spread instead.
  const winSize = Math.floor(sampleRate * 0.08); // 80ms windows
  const numWins = Math.max(2, Math.floor(len / winSize));
  const winRmsArr = new Float32Array(numWins);
  for (let w = 0; w < numWins; w++) {
    let wSq = 0;
    const off = w * winSize;
    for (let j = 0; j < winSize && off + j < len; j++) {
      const s = samples[off + j]; wSq += s * s;
    }
    winRmsArr[w] = Math.sqrt(wSq / winSize);
  }
  winRmsArr.sort();
  const p10 = winRmsArr[Math.floor(numWins * 0.10)];
  const p90 = winRmsArr[Math.floor(numWins * 0.90)];
  const dynamicRange = (p90 - p10) / (rms + 1e-6);
  // speech: dynamicRange typically 0.6-2.5; music (compressed): 0.1-0.8

  // ── 3. FFT spectral analysis ──────────────────────────────────────────────
  const { mag, binHz, N2 } = _fftPowerSpectrum(samples, sampleRate);
  const EPS = 1e-12;

  let totalPower = 0, weightedFreqSum = 0, logSum = 0;
  // Sub-bands (Hz):  deep-bass | bass | low-mid | speech-core | presence | air
  //                  <80       | <300 | <1000   | <4000       | <8000    | rest
  let eDeep = 0, eSub = 0, eLow = 0, eSpeech = 0, eHigh = 0, eAir = 0;

  for (let i = 1; i < N2; i++) {
    const hz = i * binHz;
    const p  = mag[i] + EPS;
    totalPower      += p;
    weightedFreqSum += hz * p;
    logSum          += Math.log(p);
    if      (hz < 80)   eDeep   += p;
    else if (hz < 300)  eSub    += p;
    else if (hz < 1000) eLow    += p;
    else if (hz < 4000) eSpeech += p;
    else if (hz < 8000) eHigh   += p;
    else                eAir    += p;
  }

  const centroid       = weightedFreqSum / (totalPower + EPS);
  const geoMean        = Math.exp(logSum / N2);
  const arithMean      = totalPower / N2;
  const flatness       = geoMean / (arithMean + EPS);  // 0 = pure tone, ~1 = noise

  // Sub-band ratios
  const speechCoreRatio = eSpeech / (totalPower + EPS);
  const highRatio       = (eHigh + eAir) / (totalPower + EPS);
  const bassRatio       = (eDeep + eSub) / (totalPower + EPS);   // deep+sub bass
  const lowMidRatio     = eLow / (totalPower + EPS);

  // Spectral rolloff (85th percentile)
  let rolloffHz = binHz, cumPow = 0;
  const rolloffTarget = 0.85 * totalPower;
  for (let i = 1; i < N2; i++) {
    cumPow += mag[i];
    if (cumPow >= rolloffTarget) { rolloffHz = i * binHz; break; }
  }

  // ── 4. Spectral variance (spread around centroid) ────────────────────────
  // Speech has tight formant peaks → low variance relative to centroid.
  // Music (especially broadband electronic) has higher variance.
  let varSum = 0;
  for (let i = 1; i < N2; i++) {
    const hz = i * binHz;
    const p  = mag[i] + EPS;
    varSum += p * (hz - centroid) * (hz - centroid);
  }
  const spectralVar = Math.sqrt(varSum / (totalPower + EPS)); // Hz std-dev

  // ── 5. Harmonic comb detection (periodicity → music) ────────────────────
  // Scan for evenly-spaced magnitude peaks in the bass-to-mid range
  // (kick drum harmonics, bass notes, synth fundamentals).
  // Count how many of the expected harmonics show up above threshold.
  let harmonicScore = 0;
  const fundamental = Math.max(50, centroid * 0.15);  // rough fundamental guess
  const harmThresh  = (totalPower / N2) * 3;          // 3× mean power
  let harmChecked = 0;
  for (let h = 1; h <= 8; h++) {
    const hHz = fundamental * h;
    if (hHz > sampleRate / 2) break;
    const bin = Math.round(hHz / binHz);
    if (bin > 0 && bin < N2) {
      harmChecked++;
      // Check bin ±2 for a peak
      const peakPow = Math.max(mag[Math.max(0, bin - 2)], mag[bin], mag[Math.min(N2 - 1, bin + 2)]);
      if (peakPow > harmThresh) harmonicScore++;
    }
  }
  const harmonicRatio = harmChecked > 0 ? harmonicScore / harmChecked : 0;  // 0-1

  // ── 6. Hard override rules (single conditions strong enough to decide) ────
  //
  // HARD MUSIC: bass + treble simultaneously = impossible for speech
  const hasBass    = bassRatio > 0.12;
  const hasTreble  = highRatio > 0.10;
  const hasMidFill = (eLow + eSpeech) / (totalPower + EPS) > 0.30;
  // If energy is spread across bass, mid, AND treble → music, period
  if (hasBass && hasTreble && hasMidFill) {
    return {
      type: 'music',
      energy: Math.min(1.0, Math.max(0.15, rms * 5)),
      _meta: { rms, dynamicRange, centroid, flatness, rolloffHz, speechCoreRatio, highRatio, bassRatio, harmonicRatio, musicScore: 99, speechScore: 0, override: 'broadband' }
    };
  }

  // HARD SPEECH: near-zero sub-bass + narrow rolloff = almost certainly speech
  if (bassRatio < 0.04 && rolloffHz < 4000 && dynamicRange > 0.7) {
    return {
      type: 'speech',
      energy: Math.min(1.0, Math.max(0.15, rms * 5)),
      _meta: { rms, dynamicRange, centroid, flatness, rolloffHz, speechCoreRatio, highRatio, bassRatio, harmonicRatio, musicScore: 0, speechScore: 99, override: 'narrowband' }
    };
  }

  // ── 7. Scored classification ──────────────────────────────────────────────

  let musicScore = 0;

  // Bass presence — still a music indicator but less dominant
  // (lowered thresholds to avoid false‑music on spoken audio)
  if (bassRatio > 0.30)                                 musicScore += 3;
  else if (bassRatio > 0.18)                            musicScore += 2;
  else if (bassRatio > 0.10)                            musicScore += 1;



  // Harmonic periodicity — very reliable music indicator
  if (harmonicRatio > 0.6)                              musicScore += 3;
  else if (harmonicRatio > 0.4)                         musicScore += 2;
  else if (harmonicRatio > 0.25)                        musicScore += 1;

  // Sustained high-frequency content
  if (highRatio > 0.20)                                 musicScore += 2;
  else if (highRatio > 0.10)                            musicScore += 1;

  // Rolloff covers most of the audible spectrum
  if (rolloffHz > 6000)                                 musicScore += 2;
  else if (rolloffHz > 4500)                            musicScore += 1;

  // Spectral flatness: broad harmonic content
  if (flatness > 0.08)                                  musicScore += 2;
  else if (flatness > 0.04)                             musicScore += 1;

  // Spectral spread (std-dev around centroid) — broadband = music
  if (spectralVar > 2500)                               musicScore += 2;
  else if (spectralVar > 1500)                          musicScore += 1;

  // Compressed DR — only counts when combined with other music signals
  if (dynamicRange < 0.4)                               musicScore += 1;

  let speechScore = 0;

  // Speech‑core score – give it weight even when bass is present,
  // because spoken audio often contains low‑frequency rumble.
  if (speechCoreRatio > 0.55)                           speechScore += 4;
  else if (speechCoreRatio > 0.40)                      speechScore += 2;
  else if (speechCoreRatio > 0.25)                      speechScore += 1;

  // High dynamic range → pauses between words/sentences
  if (dynamicRange > 1.2)                               speechScore += 3;
  else if (dynamicRange > 0.8)                          speechScore += 1;

  // Very low sub-bass confirms voice
  if (bassRatio < 0.04)                                 speechScore += 3;
  else if (bassRatio < 0.08)                            speechScore += 1;

  // Rolloff in voice band
  if (rolloffHz < 3500)                                 speechScore += 2;
  else if (rolloffHz < 5000)                            speechScore += 1;

  // Centroid in voice formant range
  if (centroid > 200 && centroid < 2500)                speechScore += 1;

  // Require music to win clearly
  const isMusic = musicScore >= 6 && musicScore > speechScore + 2;

  return {
    type: isMusic ? 'music' : 'speech',
    energy: Math.min(1.0, Math.max(0.15, rms * 5)),
    _meta: { rms, dynamicRange, centroid, flatness, rolloffHz, speechCoreRatio, highRatio, bassRatio, harmonicRatio, spectralVar, musicScore, speechScore }
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
