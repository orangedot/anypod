'use strict';

// ─────────────────────────────────────────────────────────────────────────
// SECTION 18 · Timeline Rendering
// renderTimeline — main episode list (handles empty/onboarding state).
// appendTimelineBatch / setupSentinelObserver — infinite scroll via
// IntersectionObserver; loads 30 cards at a time.
// wireEmptyStateEvents — wires up the onboarding empty state UI.
// ─────────────────────────────────────────────────────────────────────────

function getTimelineEmptyStateHtml() {
  let emptyTitle = 'No episodes found';
  let emptyMsg = 'Try clearing your search query or refreshing your feeds.';
  if (state.filterMode === 'played') {
    emptyTitle = 'No played episodes';
    emptyMsg = 'Episodes you finish or mark as played will appear here.';
  } else if (state.filterMode === 'continue') {
    emptyTitle = 'No episodes in progress';
    emptyMsg = 'Episodes you start listening to will appear here.';
  } else if (state.filterMode === 'unplayed') {
    emptyTitle = 'All caught up';
    emptyMsg = 'You have listened to all episodes.';
  } else if (state.filterMode === 'downloaded') {
    emptyTitle = 'No downloaded episodes';
    emptyMsg = 'Episodes you download for offline listening will appear here.';
  }
  return `
    <div class="empty-state">
      <h3>${emptyTitle}</h3>
      <p>${emptyMsg}</p>
    </div>
  `;
}

function renderTimeline(preserveScroll = true) {
  // console.log('[Anypod Debug] renderTimeline called. preserveScroll:', preserveScroll, {
  //   scrollTopBeforeRender: elements.timelineList?.scrollTop,
  //   stack: new Error().stack.split('\n')[2] // Shows what triggered the render!
  // });

  updateDockVisibility();
  const container = elements.timelineList;
  if (!container) return;

  if (state.feeds.length === 0) {
    navigateTo('discover');
    return;
  }

  if (state.filteredEpisodes.length === 0) {
    container.innerHTML = getTimelineEmptyStateHtml();
    return;
  }

  if (preserveScroll) {
    const prevWindowScroll = window.scrollY;
    const prevScroll = container.scrollTop;
    const prevHeight = container.clientHeight;
    if (prevHeight > 0) container.style.minHeight = `${prevHeight}px`;

    const existingSentinel = document.getElementById('timeline-sentinel');
    if (existingSentinel) existingSentinel.remove();
    container.innerHTML = '';

    const timelineContext = {
      type: state.searchQuery ? 'search' : state.filterMode,
      id: state.searchQuery || state.filterMode,
      title: state.searchQuery ? `Search: "${state.searchQuery}"` : (state.filterMode === 'continue' ? 'Continue Listening' : 'Timeline'),
      items: state.filteredEpisodes
    };

    const total = Math.max(state.pageSize || 30, (state.timelinePage || 1) * (state.pageSize || 30));
    const batch = state.filteredEpisodes.slice(0, total);
    const frag = document.createDocumentFragment();
    batch.forEach((ep, idx) => frag.appendChild(createEpisodeCard(ep, timelineContext, idx)));
    container.appendChild(frag);

    if (total < state.filteredEpisodes.length) {
      const sentinel = document.createElement('div');
      sentinel.id = 'timeline-sentinel';
      sentinel.className = 'timeline-sentinel';
      container.appendChild(sentinel);
      setupSentinelObserver(sentinel);
    }
    if (container.scrollTop !== prevScroll) container.scrollTop = prevScroll;
    if (window.scrollY !== prevWindowScroll) window.scrollTo({ top: prevWindowScroll, behavior: 'instant' });
    requestAnimationFrame(() => {
      container.style.minHeight = '';
    });
    return;
  }

  container.innerHTML = '';
  state.timelinePage = 1;
  appendTimelineBatch();
}

function appendTimelineBatch() {
  const container = elements.timelineList;
  if (!container) return;

  const existingSentinel = document.getElementById('timeline-sentinel');
  if (existingSentinel) existingSentinel.remove();

  const start = (state.timelinePage - 1) * state.pageSize;
  const end = state.timelinePage * state.pageSize;
  const batch = state.filteredEpisodes.slice(start, end);

  const timelineContext = {
    type: state.searchQuery ? 'search' : state.filterMode,
    id: state.searchQuery || state.filterMode,
    title: state.searchQuery ? `Search: "${state.searchQuery}"` : (state.filterMode === 'continue' ? 'Continue Listening' : 'Timeline'),
    items: state.filteredEpisodes
  };

  const frag = document.createDocumentFragment();
  batch.forEach((ep, idx) => {
    frag.appendChild(createEpisodeCard(ep, timelineContext, start + idx));
  });
  container.appendChild(frag);

  if (end < state.filteredEpisodes.length) {
    const sentinel = document.createElement('div');
    sentinel.id = 'timeline-sentinel';
    sentinel.className = 'timeline-sentinel';
    container.appendChild(sentinel);
    setupSentinelObserver(sentinel);
  }
}

let sentinelObserver = null;

function setupSentinelObserver(sentinel) {
  if (sentinelObserver) sentinelObserver.disconnect();
  sentinelObserver = new IntersectionObserver((entries) => {
    if (entries[0] && entries[0].isIntersecting) {
      sentinelObserver.disconnect();
      state.timelinePage++;
      appendTimelineBatch();
    }
  }, { rootMargin: '400px' });
  sentinelObserver.observe(sentinel);
}

// ─────────────────────────────────────────────────────────────────────────
// SECTION 19 · Episode Cards
// createEpisodeCard — builds the full interactive episode card element.
// Show notes: formatShowNotesHtml, openShowNotes, closeShowNotes.
// Progress scrubbing: setupProgressTrackInteractivity.
// ─────────────────────────────────────────────────────────────────────────

function toggleMarkPlayed(ep) {
  const savedScrollY = window.scrollY;
  const current = state.playbackPositions[ep.guid];
  const isCompleted = current && (current.completed === 1 || current.completed === true);

  if (isCompleted) {
    savePlaybackPositionToD1(ep.guid, 0, false);
  } else {
    savePlaybackPositionToD1(ep.guid, 0, true);
    if (isEpisodeQueued(ep.guid)) {
      removeFromQueue(ep.guid);
    }
  }
  renderContinueShelf();

  const cards = document.querySelectorAll(`.episode-card[data-guid="${ep.guid}"]`);
  cards.forEach(card => {
    card.classList.toggle('is-played', !isCompleted);
    const checkBtn = card.querySelector('.btn-mark-played');
    if (checkBtn) {
      checkBtn.classList.toggle('is-completed', !isCompleted);
      checkBtn.innerHTML = !isCompleted ? CARD_ICONS.CHECK_FILLED : CARD_ICONS.CHECK;
      checkBtn.title = !isCompleted ? 'Mark as Unplayed' : 'Mark as Played';
    }
  });

  if (state.filterMode === 'unplayed' || state.filterMode === 'continue' || state.filterMode === 'played') {
    processAndSortEpisodes();
    renderTimeline(true);
  }

  // Ensure scroll position remains rock-solid after card removal
  requestAnimationFrame(() => {
    if (window.scrollY !== savedScrollY) {
      window.scrollTo({ top: savedScrollY, behavior: 'instant' });
    }
  });
}

function formatShowNotesHtml(rawInput) {
  if (!rawInput) return '<p>No show notes available for this episode.</p>';

  let processed = rawInput;
  const hasHtmlTags = /<\/?[a-z][\s\S]*>/i.test(processed);

  if (!hasHtmlTags) {
    processed = escapeHtml(processed);
    processed = processed.replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>');
    processed = processed.split(/\r?\n\r?\n/).map(p => `<p>${p.replace(/\r?\n/g, '<br>')}</p>`).join('');
  } else {
    const parser = new DOMParser();
    const doc = parser.parseFromString(`<div>${processed}</div>`, 'text/html');
    const container = doc.body.firstElementChild || doc.body;

    const dangerous = container.querySelectorAll('script, style, iframe, object, embed, form, input, button');
    dangerous.forEach(el => el.remove());

    const links = container.querySelectorAll('a');
    links.forEach(a => {
      a.setAttribute('target', '_blank');
      a.setAttribute('rel', 'noopener noreferrer');
    });

    processed = container.innerHTML;
  }

  processed = processed.replace(/\b(?:(\d{1,2}):)?([0-5]?\d):([0-5]\d)\b/g, (match, h, m, s) => {
    const hours = h ? parseInt(h, 10) : 0;
    const mins = parseInt(m, 10);
    const secs = parseInt(s, 10);
    const totalSec = (hours * 3600) + (mins * 60) + secs;
    return `<button type="button" class="note-timestamp" data-seconds="${totalSec}">${match}</button>`;
  });

  return processed;
}

function seekToExactTime(seconds) {
  if (state.activeEngine === 'audio' && elements.audio) {
    elements.audio.currentTime = seconds;
  } else if (state.activeEngine === 'youtube' && state.ytPlayer && state.ytPlayer.seekTo) {
    state.ytPlayer.seekTo(seconds, true);
  }
  updateProgress();
}

/**
 * Render an inline "Audio Analysis" section at the bottom of the show-notes
 * content pane. Called every time openShowNotes() populates the notes tab.
 *
 * Shows:
 *  - Segment chapter pills (only when a real analysis source exists)
 *  - Live-transcript cues inline (if any)
 *  - A nudge/link to Settings when the classifier/transcript is not enabled
 */
function _renderInlineAnalysisSection(container) {
  if (!container) return;
  // Remove previous section if present
  const prev = container.querySelector('.notes-analysis-section');
  if (prev) prev.remove();

  const segments  = state.episodeTimeline.segments || [];
  const cues      = state.episodeTimeline.cues || [];
  const src       = state.episodeTimeline.transcriptSource || '';
  const hasReal   = segments.length > 0 && !!src;
  const hasCues   = cues.length > 0;
  const isClassOn = !!state.experimentalSettings.enableAudioClassifier;
  const isLiveOn  = !!state.experimentalSettings.enableLiveTranscript;

  // Nothing to show and features are enabled (will populate once analysis runs)
  if (!hasReal && !hasCues && isClassOn) return;

  const section = document.createElement('div');
  section.className = 'notes-analysis-section';

  let innerHtml = '';

  if (hasReal || hasCues) {
    // ── Header pill ─────────────────────────────────────────────────────
    const sourcePillText = hasCues ? (src || 'live') : (src || 'probe');
    innerHtml += `
      <div class="analysis-header">
        <span>🔬 Audio Analysis</span>
        <span class="source-pill">${escapeHtml(sourcePillText)}</span>
      </div>
    `;

    // ── Segment chapter pills (only when real analysis) ─────────────────
    if (hasReal) {
      innerHtml += `<div class="transcript-segment-pills" style="justify-content:flex-start;">
        ${segments.slice(0, 20).map(s => `
          <button type="button" class="segment-jump-pill ${s.type === 'music' ? 'is-music' : 'is-speech'}" data-seconds="${s.start}">
            ${s.type === 'music' ? '🎵' : '🎙️'} ${formatTime(s.start)}
          </button>
        `).join('')}
      </div>`;
    }

    // ── Live cues preview (only when transcript is enabled) ──
    const isTransOn = state.experimentalSettings.enableTranscript !== false;
    if (hasCues && isTransOn) {
      const preview = cues.slice(-3);
      innerHtml += `
        <div style="margin-top:0.75rem; font-size:0.82rem; color:var(--text-secondary);">
          <strong style="color:var(--text-primary);">🎙 Live transcript</strong>
          ${preview.map(c => `<p style="margin:0.3rem 0 0; color:var(--text-primary);">"${escapeHtml(c.text)}"</p>`).join('')}
          ${cues.length > 3 ? `<button type="button" class="inline-link notes-open-transcript">see all ${cues.length} lines →</button>` : ''}
        </div>
      `;
    }
  } else {
    // Features are disabled — show a friendly nudge
    const isTransOn = state.experimentalSettings.enableTranscript !== false;
    innerHtml += `
      <div class="notes-enable-hint">
        <strong>🔬 Audio Analysis not active</strong><br>
        <button type="button" class="inline-link" id="inline-goto-settings">Enable Audio Classifier or ${isTransOn ? 'Live Transcript' : 'Interactive Transcripts'} in Experimental Settings →</button>
      </div>
    `;
  }

  section.innerHTML = innerHtml;
  container.appendChild(section);

  // Wire segment-jump clicks
  section.querySelectorAll('.segment-jump-pill').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const sec = parseFloat(btn.dataset.seconds);
      if (!isNaN(sec)) {
        seekToExactTime(sec);
        if (state.playbackStatus !== 'playing') resumeCurrentEngine();
      }
    });
  });

  // Wire "see all" → switch to transcript tab
  const seeAllBtn = section.querySelector('.notes-open-transcript');
  if (seeAllBtn) {
    seeAllBtn.addEventListener('click', () => switchShowNotesTab('transcript'));
  }

  // Wire settings deeplink
  const settingsBtn = section.querySelector('#inline-goto-settings');
  if (settingsBtn) {
    settingsBtn.addEventListener('click', (e) => {
      e.preventDefault();
      closeShowNotes();
      const settingsTab = document.getElementById('tab-settings');
      if (settingsTab) settingsTab.click();
    });
  }
}

function switchShowNotesTab(tab = 'notes') {
  if (state.experimentalSettings.enableTranscript === false && tab === 'transcript') {
    tab = 'notes';
  }
  const isNotes = tab === 'notes';
  const isChapters = tab === 'chapters';
  const isTranscript = tab === 'transcript';

  if (elements.tabBtnNotes) elements.tabBtnNotes.classList.toggle('active', isNotes);
  if (elements.tabBtnChapters) elements.tabBtnChapters.classList.toggle('active', isChapters);
  if (elements.tabBtnTranscript) {
    const isTransAllowed = state.experimentalSettings.enableTranscript !== false;
    elements.tabBtnTranscript.style.display = isTransAllowed ? '' : 'none';
    elements.tabBtnTranscript.classList.toggle('active', isTranscript);
    const isYt = !!(state.activeNotesEpisode?.isYouTube || state.activeNotesEpisode?.guid?.startsWith('yt:'));
    const span = elements.tabBtnTranscript.querySelector('span');
    if (span) span.textContent = isYt ? 'lyrics' : 'transcript';
  }

  if (elements.showNotesContent) elements.showNotesContent.classList.toggle('hidden', !isNotes);
  if (elements.showChaptersContent) elements.showChaptersContent.classList.toggle('hidden', !isChapters);
  if (elements.showTranscriptContent) elements.showTranscriptContent.classList.toggle('hidden', !isTranscript);

  if (isChapters) {
    renderChaptersTab();
  } else if (isTranscript) {
    if ((!state.episodeTimeline.cues || state.episodeTimeline.cues.length === 0) && state.activeNotesEpisode) {
      const ep = state.activeNotesEpisode;
      if (ep.isYouTube || ep.videoId || ep.guid?.startsWith('yt:')) {
        const dur = ep.duration ? parseDurationSeconds(ep.duration) : (state.episodeTimeline.duration || 0);
        fetchLyricsFromLrclib(ep, dur).then(found => {
          if (found) renderTranscriptView();
        });
      }
    }
    renderTranscriptView();
  }
}

function renderTranscriptView(filterText = '') {
  const cuesList = elements.transcriptCuesList;
  if (!cuesList) return;

  const cues = state.episodeTimeline.cues || [];
  const source = state.episodeTimeline.transcriptSource || (cues.length > 0 ? 'RSS' : '');

  if (elements.transcriptSourcePill) {
    if (source) {
      elements.transcriptSourcePill.textContent = source.toUpperCase();
      elements.transcriptSourcePill.classList.remove('hidden');
    } else {
      elements.transcriptSourcePill.classList.add('hidden');
    }
  }

  if (cues.length === 0) {
    const segments = state.episodeTimeline.segments || [];
    const hasRealAnalysis = segments.length > 0 && !!state.episodeTimeline.transcriptSource;
    const speechSegs = segments.filter(s => s.type === 'speech');
    const musicSegs  = segments.filter(s => s.type === 'music');

    const isLiveAvailable = !!(window.SpeechRecognition || window.webkitSpeechRecognition);
    const isLiveEnabled   = !!state.experimentalSettings.enableLiveTranscript;
    const isClassifierEnabled = !!state.experimentalSettings.enableAudioClassifier;

    // Segment pills — only visible when we have a real analysis (RSS, probe, community)
    const pillsHtml = hasRealAnalysis ? `
      <div class="transcript-segment-pills">
        ${segments.slice(0, 16).map(s => `
          <button type="button" class="segment-jump-pill ${s.type === 'music' ? 'is-music' : 'is-speech'}" data-seconds="${s.start}">
            <span>${s.type === 'music' ? '🎵 Music' : '🎙️ Talk'} · ${formatTime(s.start)}</span>
          </button>
        `).join('')}
      </div>
    ` : '';

    // Live transcription status box
    const liveHtml = isLiveAvailable ? `
      <div style="margin: 1rem 0; padding: 0.75rem 1rem; background: var(--bg-surface); border: 1px solid var(--border-light); border-radius: var(--radius-sm); font-size: 0.85rem;">
        ${isLiveEnabled
          ? `<strong>🎙 Live transcription is on</strong> — text appears here as you listen.`
          : `<strong>💡 Live Transcription available!</strong>
             <button type="button" class="inline-link" id="transcript-goto-settings">Enable it in Experimental Settings →</button>`
        }
      </div>
    ` : '';

    // Summary line
    let summaryHtml = '';
    if (hasRealAnalysis) {
      const src = state.episodeTimeline.transcriptSource;
      summaryHtml = `<p>Anypod's FFT classifier detected <strong>${speechSegs.length} speech</strong> and <strong>${musicSegs.length} music</strong> sections.<br><small style="color:var(--text-secondary)">source: ${escapeHtml(src)}</small></p>`;
    } else if (isClassifierEnabled) {
      summaryHtml = `<p>The audio classifier is active — open this episode to start analysis.</p>`;
    } else {
      summaryHtml = `<p>No transcript in RSS. <button type="button" class="inline-link" id="transcript-goto-settings">Enable Audio Classifier in Settings</button> or search online lyrics below.</p>`;
    }

    cuesList.innerHTML = `
      <div class="transcript-empty-state">
        <div style="font-size: 2.2rem; margin-bottom: 0.75rem;">🎵</div>
        <h4>No Lyrics or Transcript Found</h4>
        ${summaryHtml}
        <div style="margin-top: 1rem;">
          <button type="button" class="btn btn-secondary btn-sm" id="btn-fetch-lyrics">
            🎵 Search Lyrics on LRCLIB
          </button>
        </div>
        ${liveHtml}
        ${pillsHtml}
      </div>
    `;

    // Search lyrics button click
    const fetchLyricsBtn = cuesList.querySelector('#btn-fetch-lyrics');
    if (fetchLyricsBtn) {
      fetchLyricsBtn.addEventListener('click', async () => {
        fetchLyricsBtn.disabled = true;
        fetchLyricsBtn.textContent = 'Searching LRCLIB...';
        const ep = state.activeNotesEpisode || state.currentEpisode;
        const dur = ep?.duration ? parseDurationSeconds(ep.duration) : (state.episodeTimeline.duration || 0);
        const found = await fetchLyricsFromLrclib(ep, dur);
        if (found) {
          renderTranscriptView();
        } else {
          fetchLyricsBtn.textContent = 'No Lyrics Found on LRCLIB';
          setTimeout(() => {
            if (fetchLyricsBtn) {
              fetchLyricsBtn.disabled = false;
              fetchLyricsBtn.textContent = '🎵 Search Lyrics on LRCLIB';
            }
          }, 3000);
        }
      });
    }

    // Segment-jump clicks
    cuesList.querySelectorAll('.segment-jump-pill').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const sec = parseFloat(btn.dataset.seconds);
        if (!isNaN(sec)) {
          seekToExactTime(sec);
          if (state.playbackStatus !== 'playing') resumeCurrentEngine();
        }
      });
    });

    // Settings deeplink
    const gotoSettingsBtn = cuesList.querySelector('#transcript-goto-settings');
    if (gotoSettingsBtn) {
      gotoSettingsBtn.addEventListener('click', (e) => {
        e.preventDefault();
        closeShowNotes();
        // Switch to settings tab
        const settingsTab = document.getElementById('tab-settings');
        if (settingsTab) settingsTab.click();
      });
    }
    return;
  }


  const query = (filterText || '').toLowerCase().trim();
  const filteredCues = query
    ? cues.filter(c => c.text && c.text.toLowerCase().includes(query))
    : cues;

  if (filteredCues.length === 0) {
    cuesList.innerHTML = `
      <div class="transcript-empty-state">
        <p>No lines matching "<strong>${escapeHtml(filterText)}</strong>"</p>
      </div>
    `;
    return;
  }

  let currentSec = 0;
  if (state.activeEngine === 'audio' && elements.audio) {
    currentSec = elements.audio.currentTime || 0;
  } else if (state.activeEngine === 'youtube' && state.ytPlayer && state.ytPlayer.getCurrentTime) {
    currentSec = state.ytPlayer.getCurrentTime() || 0;
  }

  const cuesHtml = filteredCues.map((c, idx) => {
    const isActive = currentSec >= c.start && currentSec <= c.end;
    let textHtml = escapeHtml(c.text || '');
    if (query) {
      const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
      textHtml = textHtml.replace(regex, '<mark>$1</mark>');
    }

    return `
      <div class="transcript-cue ${isActive ? 'is-active' : ''}" data-start="${c.start}" data-end="${c.end}" id="transcript-cue-${idx}">
        <button type="button" class="transcript-cue-time" data-seconds="${c.start}" title="Jump to ${formatTime(c.start)}">
          ${formatTime(c.start)}
        </button>
        <div class="transcript-cue-text">${textHtml}</div>
      </div>
    `;
  }).join('');

  const ep = state.activeNotesEpisode || state.currentEpisode;
  const isYt = !!(ep?.isYouTube || ep?.guid?.startsWith('yt:'));
  const clearLyricsBar = isYt ? `
    <div style="display: flex; justify-content: flex-end; margin-bottom: 0.5rem; padding-bottom: 0.25rem;">
      <button type="button" class="inline-link" id="btn-clear-lyrics" style="font-size: 0.72rem; color: var(--text-muted, #94a3b8);">
        ✕ wrong lyrics? clear &amp; retry
      </button>
    </div>
  ` : '';

  cuesList.innerHTML = clearLyricsBar + cuesHtml;

  const btnClearLyrics = cuesList.querySelector('#btn-clear-lyrics');
  if (btnClearLyrics && ep) {
    btnClearLyrics.addEventListener('click', () => {
      const cacheKey = 'anypod_timeline_v4_' + ep.guid;
      try { storage.removeItem(cacheKey); } catch (_) {}
      state.episodeTimeline.cues = [];
      state.episodeTimeline.transcriptSource = '';
      renderWaveformChart();
      renderTranscriptView();
      showStatus('Lyrics cleared for this track');
    });
  }

  cuesList.querySelectorAll('.transcript-cue-time').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const sec = parseFloat(btn.dataset.seconds);
      if (!isNaN(sec)) {
        seekToExactTime(sec);
        if (state.playbackStatus !== 'playing') resumeCurrentEngine();
      }
    });
  });
}

function openShowNotes(targetEp, defaultTab = 'notes') {
  const ep = targetEp || state.currentEpisode;
  if (!ep || !elements.showNotesModal) return;

  state.activeNotesEpisode = ep;

  // 1. Artwork
  if (elements.showNotesArtwork || elements.showNotesArt) {
    const artEl = elements.showNotesArtwork || elements.showNotesArt;
    artEl.src = ep.artwork || FALLBACK_ARTWORK;
    artEl.onerror = () => {
      artEl.onerror = null;
      artEl.src = FALLBACK_ARTWORK;
    };
  }

  // 2. Clickable Podcast Feed Name (larger & links to full show detail)
  if (elements.showNotesPodcastTitle) {
    const showName = ep.playlistTitle || ep.podcastTitle || 'Podcast';
    elements.showNotesPodcastTitle.innerHTML = `
      <span>${escapeHtml(showName)}</span>
      <span class="podcast-link-arrow">→</span>
    `;
    elements.showNotesPodcastTitle.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      closeShowNotes();
      if (ep.feedUrl) {
        openFeedDetail(ep.feedUrl);
      }
    };
  }

  // 3. Episode Title
  if (elements.showNotesEpisodeTitle) {
    elements.showNotesEpisodeTitle.textContent = ep.title || 'Untitled Episode';
  }

  // 4. Centered Rich Meta: Artist • Track • Relative Date • Exact Date • Duration • Resume info
  if (elements.showNotesMeta) {
    const dateInput = ep.timestamp || ep.pubDate;
    const relDate = dateInput ? formatHumanRelativeDate(dateInput) : '';
    const fullDate = dateInput ? new Date(dateInput).toLocaleDateString(undefined, { 
      month: 'short', 
      day: 'numeric', 
      year: 'numeric' 
    }) : '';
    const dur = ep.duration ? formatEpisodeDuration(ep.duration) : '';
    
    const savedPos = state.playbackPositions[ep.guid];
    const hasProgress = savedPos && !savedPos.completed && savedPos.position > 2;
    const resumeStr = hasProgress ? `resumes at ${formatTime(savedPos.position)}` : '';

    // Extract music track info if available (e.g. from YouTube or music feeds)
    const musicInfo = parseMusicTrackInfo(ep.title || '', ep.podcastTitle || '');
    const musicParts = [];
    if (musicInfo.artist && musicInfo.track) {
      musicParts.push(`<span class="meta-music-artist" style="font-weight: 600; color: var(--text-primary, #fff);">🎤 ${escapeHtml(musicInfo.artist)}</span>`);
      musicParts.push(`<span class="meta-music-track" style="color: var(--accent, #3b82f6);">🎵 ${escapeHtml(musicInfo.track)}</span>`);
    }

    // Check description for Album / Year hints (common in music descriptions: "Album: ...", "Released: 2024")
    const descText = ep.content || ep.description || '';
    const albumMatch = descText.match(/\b(?:album|from the album)[:\s]+([^,\n\r\.\<]+)/i);
    const yearMatch = descText.match(/\b(?:released|release date|year|℗|©)[:\s]*(?:[a-z]+\s+\d{1,2},?\s+)?(19\d{2}|20\d{2})\b/i);
    if (albumMatch && albumMatch[1] && albumMatch[1].trim().length < 50) {
      musicParts.push(`<span class="meta-music-album">💿 ${escapeHtml(albumMatch[1].trim())}</span>`);
    }
    if (yearMatch && yearMatch[1]) {
      musicParts.push(`<span class="meta-music-year">📅 ${escapeHtml(yearMatch[1].trim())}</span>`);
    }

    const standardParts = [
      relDate ? `<span class="meta-rel-date">${escapeHtml(relDate)}</span>` : '',
      fullDate ? `<span class="meta-full-date">${escapeHtml(fullDate)}</span>` : '',
      dur ? `<span class="meta-dur">${escapeHtml(dur)}</span>` : '',
      resumeStr ? `<span class="meta-resume" style="color: var(--primary, #f97316);">${escapeHtml(resumeStr)}</span>` : ''
    ].filter(Boolean);

    const allRows = [];
    if (musicParts.length > 0) {
      allRows.push(`<div class="show-notes-music-row" style="margin-bottom: 0.25rem;">${musicParts.join('<span class="meta-sep" style="margin: 0 0.35rem; opacity: 0.5;">•</span>')}</div>`);
    }
    if (standardParts.length > 0) {
      allRows.push(`<div>${standardParts.join('<span class="meta-sep" style="margin: 0 0.35rem; opacity: 0.5;">•</span>')}</div>`);
    }

    elements.showNotesMeta.innerHTML = allRows.join('');
  }

  // 5. Notes Content (with lazy on-demand full HTML show-notes hydration if stripped during fast feed sync)
  const renderNotesHtmlIntoModal = (htmlContent) => {
    if (!elements.showNotesContent) return;
    elements.showNotesContent.innerHTML = formatShowNotesHtml(htmlContent);

    elements.showNotesContent.querySelectorAll('.note-timestamp').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const sec = parseFloat(btn.dataset.seconds);
        if (isNaN(sec)) return;
        if (state.currentEpisode && state.currentEpisode.guid === ep.guid) {
          seekToExactTime(sec);
          if (state.playbackStatus !== 'playing') resumeCurrentEngine();
        } else {
          playEpisode(ep);
          setTimeout(() => seekToExactTime(sec), 300);
        }
      });
    });

    _renderInlineAnalysisSection(elements.showNotesContent);
  };

  if (elements.showNotesContent) {
    const rawContent = ep.content || ep.description || '';
    renderNotesHtmlIntoModal(rawContent);

    // Lazy-load full HTML show-notes on demand if only the short summary was synced
    if (!ep.content && ep.feedUrl && ep.guid && !ep.isYouTube) {
      fetch(`/api/feed?url=${encodeURIComponent(ep.feedUrl)}&guid=${encodeURIComponent(ep.guid)}&fullContent=1`)
        .then(r => (r.ok ? r.json() : null))
        .then(data => {
          if (data && data.content && data.content.length > (ep.description || '').length) {
            ep.content = data.content;
            if (state.activeShowNotesEpisode && state.activeShowNotesEpisode.guid === ep.guid) {
              renderNotesHtmlIntoModal(ep.content);
              loadEpisodeChapters(ep);
            }
          }
        })
        .catch(() => {});
    }
  }


  // Wire main popup Play button
  if (elements.btnNotesPlay) {
    syncShowNotesPlayButton(ep);
    elements.btnNotesPlay.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      toggleEpisodePlayback(ep);
      syncShowNotesPlayButton(ep);
    };
  }

  loadEpisodeChapters(ep);
  switchShowNotesTab(defaultTab);
  elements.showNotesModal.classList.remove('hidden');
  window.history.pushState({ modal: 'showNotes' }, '', window.location.hash);
}

function closeShowNotes() {
  state.activeNotesEpisode = null;

  if (window.history.state && window.history.state.modal) {
    window.history.back();
  } else if (elements.showNotesModal) {
    elements.showNotesModal.classList.add('hidden');
  }
}

// ─────────────────────────────────────────────────────────────────────────
// PODCASTING 2.0 & FALLBACK CHAPTERS SUBSYSTEM
// ─────────────────────────────────────────────────────────────────────────

function extractChaptersFromShowNotes(rawText) {
  if (!rawText) return [];
  const chapters = [];
  const lines = rawText.split(/\r?\n/);
  const timeRegex = /\b(?:(\d{1,2}):)?([0-5]?\d):([0-5]\d)\b/;

  for (let line of lines) {
    const cleanLine = line.replace(/<[^>]+>/g, ' ').trim();
    const match = cleanLine.match(timeRegex);
    if (match) {
      const h = match[1] ? parseInt(match[1], 10) : 0;
      const m = parseInt(match[2], 10);
      const s = parseInt(match[3], 10);
      const totalSec = (h * 3600) + (m * 60) + s;

      let title = cleanLine.replace(match[0], '').replace(/^[\s\-–—:|.]+/, '').replace(/[\s\-–—:|.]+$/, '').trim();
      if (!title) title = `Chapter at ${match[0]}`;

      chapters.push({
        startTime: totalSec,
        title: title,
        img: '',
        url: '',
        source: 'show-notes'
      });
    }
  }

  chapters.sort((a, b) => a.startTime - b.startTime);
  const unique = [];
  for (const ch of chapters) {
    if (unique.length === 0 || unique[unique.length - 1].startTime !== ch.startTime) {
      unique.push(ch);
    }
  }
  return unique;
}

async function loadEpisodeChapters(episode) {
  if (!episode) return;
  state.episodeChapters = [];
  state.currentChapter = null;
  if (elements.playerChapterBar) elements.playerChapterBar.classList.add('hidden');

  let chapters = [];
  let source = '';

  // 1. TIER 1: Podcasting 2.0 <podcast:chapters> JSON
  if (episode.chaptersUrl) {
    try {
      const proxyUrl = `/api/chapters-proxy?url=${encodeURIComponent(episode.chaptersUrl)}`;
      const res = await fetch(proxyUrl);
      if (res.ok) {
        const json = await res.json();
        if (Array.isArray(json.chapters) && json.chapters.length > 0) {
          chapters = json.chapters.map((c, i) => {
            const start = typeof c.startTime === 'number' ? c.startTime : parseDurationSeconds(String(c.startTime || 0));
            const end = typeof c.endTime === 'number' ? c.endTime : (c.endTime ? parseDurationSeconds(String(c.endTime)) : 0);
            return {
              id: i,
              startTime: start,
              endTime: end,
              title: (c.title || `Chapter ${i + 1}`).trim(),
              img: c.img || '',
              url: c.url || '',
              source: 'podcast:chapters'
            };
          });
          source = 'Podcasting 2.0';
        }
      }
    } catch (err) {
      console.warn('[Chapters] Failed to fetch Podcasting 2.0 chapters:', err);
    }
  }

  // 2. TIER 2: Fallback to Show Notes Regex Timestamps
  if (!chapters.length) {
    const rawNotes = episode.content || episode.description || '';
    const fallbackChapters = extractChaptersFromShowNotes(rawNotes);
    if (fallbackChapters.length > 0) {
      chapters = fallbackChapters.map((c, i) => ({
        id: i,
        startTime: c.startTime,
        endTime: 0,
        title: c.title,
        img: '',
        url: '',
        source: 'show-notes'
      }));
      source = 'Show Notes';
    }
  }

  // 3. Compute chapter endTimes if not provided
  if (chapters.length > 0) {
    chapters.sort((a, b) => a.startTime - b.startTime);
    const totalDur = episode.duration ? parseDurationSeconds(episode.duration) : 0;
    for (let i = 0; i < chapters.length; i++) {
      if (!chapters[i].endTime || chapters[i].endTime <= chapters[i].startTime) {
        chapters[i].endTime = (i < chapters.length - 1) ? chapters[i + 1].startTime : totalDur;
      }
    }
  }

  state.episodeChapters = chapters;

  // 4. Update UI
  updateChaptersTabBadge(source);
  renderChaptersTab();
  renderChapterTicksOnWaveform();

  // 5. Assert current chapter
  const curTime = (state.activeEngine === 'audio' && elements.audio) ? (elements.audio.currentTime || 0) : 0;
  updateActiveChapter(curTime);
}

function updateChaptersTabBadge(source = '') {
  const hasChapters = state.episodeChapters.length > 0;
  if (elements.tabBtnChapters) {
    elements.tabBtnChapters.classList.toggle('hidden', !hasChapters);
  }
  if (elements.chaptersSourcePill) {
    if (hasChapters) {
      elements.chaptersSourcePill.textContent = `${state.episodeChapters.length}`;
      elements.chaptersSourcePill.classList.remove('hidden');
      elements.chaptersSourcePill.title = source ? `Source: ${source}` : '';
    } else {
      elements.chaptersSourcePill.classList.add('hidden');
    }
  }
  if (elements.chaptersSourceLabel && source) {
    elements.chaptersSourceLabel.textContent = source === 'Podcasting 2.0' ? '✨ Podcasting 2.0 Chapters' : '📝 Show Notes Timestamps';
  }
  if (elements.chaptersCountText) {
    elements.chaptersCountText.textContent = hasChapters ? `${state.episodeChapters.length} chapters` : '';
  }
}

function renderChaptersTab() {
  const listEl = elements.chaptersList;
  if (!listEl) return;
  listEl.innerHTML = '';

  const chapters = state.episodeChapters || [];
  if (!chapters.length) {
    listEl.innerHTML = '<div style="padding:1.5rem; text-align:center; color:var(--text-muted); font-size:0.85rem;">No chapters available for this episode.</div>';
    return;
  }

  chapters.forEach((ch, idx) => {
    const row = document.createElement('div');
    const isActive = state.currentChapter && state.currentChapter.startTime === ch.startTime;
    row.className = `chapter-row ${isActive ? 'is-active' : ''}`;
    row.dataset.index = idx;
    row.dataset.start = ch.startTime;

    const durText = (ch.endTime && ch.endTime > ch.startTime)
      ? `(${formatTime(ch.endTime - ch.startTime)})`
      : '';

    const thumbHtml = ch.img
      ? `<img class="chapter-thumb" src="${ch.img}" alt="" onerror="this.style.display='none'">`
      : '';

    const linkHtml = ch.url
      ? `<a href="${ch.url}" target="_blank" rel="noopener noreferrer" class="chapter-link-btn" title="Open chapter link" onclick="event.stopPropagation()">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>
         </a>`
      : '';

    row.innerHTML = `
      <div class="chapter-left">
        <span class="chapter-idx">${idx + 1}</span>
        ${thumbHtml}
        <div class="chapter-meta">
          <div class="chapter-title">${escapeHtml(ch.title)}</div>
          <div class="chapter-times">
            <span>${formatTime(ch.startTime)}</span>
            ${durText ? `<span>${durText}</span>` : ''}
            ${isActive ? '<span class="active-badge">playing</span>' : ''}
          </div>
        </div>
      </div>
      <div class="chapter-actions">
        ${linkHtml}
      </div>
    `;

    row.addEventListener('click', () => {
      seekToExactTime(ch.startTime);
      if (state.playbackStatus !== 'playing') resumeCurrentEngine();
    });

    listEl.appendChild(row);
  });
}

function renderChapterTicksOnWaveform() {
  const ticksWrap = elements.waveformChapterTicks;
  if (!ticksWrap) return;

  ticksWrap.innerHTML = '';
  const chapters = state.episodeChapters || [];
  const dur = (elements.audio?.duration && isFinite(elements.audio.duration) && elements.audio.duration > 0)
    ? elements.audio.duration
    : (state.episodeTimeline.duration || (state.currentEpisode?.duration ? parseDurationSeconds(state.currentEpisode.duration) : 0));

  if (!chapters.length || !dur) {
    ticksWrap.classList.add('hidden');
    return;
  }

  ticksWrap.classList.remove('hidden');
  chapters.forEach(ch => {
    if (ch.startTime > 0 && ch.startTime < dur) {
      const pct = (ch.startTime / dur) * 100;
      const tick = document.createElement('div');
      tick.className = 'waveform-chapter-tick';
      tick.style.left = `${pct}%`;
      tick.title = `${formatTime(ch.startTime)} - ${ch.title}`;
      ticksWrap.appendChild(tick);
    }
  });
}

function updateActiveChapter(currentTime) {
  if (!state.episodeChapters || state.episodeChapters.length === 0) {
    if (elements.playerChapterBar) elements.playerChapterBar.classList.add('hidden');
    return;
  }

  const cur = typeof currentTime === 'number' ? currentTime : (elements.audio?.currentTime || 0);
  const chapters = state.episodeChapters;
  let active = null;

  for (let i = chapters.length - 1; i >= 0; i--) {
    if (cur >= chapters[i].startTime) {
      active = chapters[i];
      break;
    }
  }
  if (!active) active = chapters[0];

  if (state.currentChapter !== active) {
    state.currentChapter = active;

    // 1. Update Player bar label
    if (elements.playerChapterBar && elements.playerChapterTitle) {
      elements.playerChapterTitle.textContent = active.title;
      elements.playerChapterBar.classList.remove('hidden');
    }

    // 2. Dynamic Chapter Artwork Swap
    if (active.img) {
      if (elements.playerArtwork) elements.playerArtwork.src = active.img;
      if (state.currentEpisode && state._activeChapterImg !== active.img) {
        state._activeChapterImg = active.img;
        syncMediaSession({ ...state.currentEpisode, artwork: active.img }, true);
      }
    } else if (state.currentEpisode) {
      if (elements.playerArtwork) elements.playerArtwork.src = state.currentEpisode.artwork || FALLBACK_ARTWORK;
      if (state._activeChapterImg) {
        state._activeChapterImg = null;
        syncMediaSession(state.currentEpisode, true);
      }
    }

    // 3. Highlight row in chapters list
    if (elements.chaptersList) {
      const rows = elements.chaptersList.querySelectorAll('.chapter-row');
      rows.forEach((r, idx) => {
        const isRowActive = (chapters[idx] && chapters[idx].startTime === active.startTime);
        r.classList.toggle('is-active', isRowActive);
        const badge = r.querySelector('.active-badge');
        if (isRowActive && !badge) {
          const times = r.querySelector('.chapter-times');
          if (times) {
            const b = document.createElement('span');
            b.className = 'active-badge';
            b.textContent = 'playing';
            times.appendChild(b);
          }
        } else if (!isRowActive && badge) {
          badge.remove();
        }
      });
    }
  }
}

function setupProgressTrackInteractivity(progressTrack, card, ep, context = null) {
  if (!progressTrack) return;
  let isDragging = false;
  let trackRect = null;

  const handleScrub = (clientX, commit) => {
    if (!trackRect) trackRect = progressTrack.getBoundingClientRect();
    if (trackRect.width <= 0) return;
    const ratio = Math.max(0, Math.min(1, (clientX - trackRect.left) / trackRect.width));
    const pct = Math.round(ratio * 100);
    const fillEl = progressTrack.querySelector('.ep-progress-fill');
    if (fillEl) fillEl.style.width = `${pct}%`;

    let totalDur = 0;
    if (state.currentEpisode && state.currentEpisode.guid === ep.guid) {
      if (state.activeEngine === 'audio' && elements.audio.duration && !isNaN(elements.audio.duration) && isFinite(elements.audio.duration)) {
        totalDur = elements.audio.duration;
      } else if (state.activeEngine === 'youtube' && state.ytPlayer && state.ytPlayer.getDuration) {
        totalDur = state.ytPlayer.getDuration() || 0;
      }
    }
    if (!totalDur && ep.duration) {
      totalDur = parseDurationSeconds(ep.duration);
    }

    if (totalDur > 0) {
      const targetTime = Math.round(ratio * totalDur);
      const resumeBadge = card.querySelector('.ep-resume-time');
      if (resumeBadge) resumeBadge.textContent = `• Resumes at ${formatTime(targetTime)}`;

      if (commit) {
        state.playbackPositions[ep.guid] = {
          position: targetTime,
          completed: false,
          lastListenedAt: Math.floor(Date.now() / 1000)
        };
        savePositionsToStorage();

        if (state.currentEpisode && state.currentEpisode.guid === ep.guid) {
          if (state.activeEngine === 'audio') {
            elements.audio.currentTime = targetTime;
            if (elements.audio.paused) {
              elements.audio.play().catch(() => {});
              state.playbackStatus = 'playing';
              syncPlaybackButtons();
            }
          } else if (state.activeEngine === 'youtube' && state.ytPlayer && state.ytPlayer.seekTo) {
            state.ytPlayer.seekTo(targetTime, true);
            state.ytPlayer.playVideo();
            state.playbackStatus = 'playing';
            syncPlaybackButtons();
          }
        } else {
          playEpisode(ep, targetTime, context);
        }
      }
    } else if (commit) {
      if (!state.currentEpisode || state.currentEpisode.guid !== ep.guid) {
        playEpisode(ep, null, context);
      } else if (state.activeEngine === 'audio' && elements.audio.paused) {
        elements.audio.play().catch(() => {});
        state.playbackStatus = 'playing';
        syncPlaybackButtons();
      } else if (state.activeEngine === 'youtube' && state.ytPlayer && state.ytPlayer.playVideo) {
        state.ytPlayer.playVideo();
        state.playbackStatus = 'playing';
        syncPlaybackButtons();
      }
    }
  };

  progressTrack.addEventListener('pointerdown', (e) => {
    e.stopPropagation();
    isDragging = true;
    trackRect = progressTrack.getBoundingClientRect();
    try { progressTrack.setPointerCapture(e.pointerId); } catch (_) {}
    handleScrub(e.clientX, false);
  });

  progressTrack.addEventListener('pointermove', (e) => {
    if (!isDragging) return;
    e.stopPropagation();
    handleScrub(e.clientX, false);
  });

  progressTrack.addEventListener('pointerup', (e) => {
    if (!isDragging) return;
    e.stopPropagation();
    isDragging = false;
    try { progressTrack.releasePointerCapture(e.pointerId); } catch (_) {}
    handleScrub(e.clientX, true);
    trackRect = null;
  });

  progressTrack.addEventListener('pointercancel', (e) => {
    if (!isDragging) return;
    isDragging = false;
    trackRect = null;
    try { progressTrack.releasePointerCapture(e.pointerId); } catch (_) {}
  });

  progressTrack.addEventListener('click', (e) => {
    e.stopPropagation();
  });
}

function createEpisodeCard(ep, context = null, cardIndex = 0) {
  const isCurrentlyActive = state.currentEpisode && state.currentEpisode.guid === ep.guid;
  const isPlaying = isCurrentlyActive && state.playbackStatus === 'playing';
  const isLoading = isCurrentlyActive && state.playbackStatus === 'loading';
  const isQueued = isEpisodeQueued(ep.guid);

  const savedPos = state.playbackPositions[ep.guid];
  const isCompleted = savedPos && (savedPos.completed === 1 || savedPos.completed === true);
  const hasProgress = (isCurrentlyActive || (savedPos && savedPos.position > 2)) && !isCompleted;
  const curPos = isCurrentlyActive ? ((state.activeEngine === 'audio' ? elements.audio.currentTime : (state.ytPlayer && state.ytPlayer.getCurrentTime ? state.ytPlayer.getCurrentTime() : 0)) || (savedPos ? savedPos.position : 0)) : (savedPos ? savedPos.position : 0);
  const resumeTimeStr = hasProgress ? `Resumes at ${formatTime(curPos)}` : '';

  let progressTrackHtml = '';
  if (hasProgress) {
    let durSec = 0;
    if (isCurrentlyActive) {
      if (state.activeEngine === 'audio' && elements.audio.duration && !isNaN(elements.audio.duration) && isFinite(elements.audio.duration)) {
        durSec = elements.audio.duration;
      } else if (state.activeEngine === 'youtube' && state.ytPlayer && state.ytPlayer.getDuration) {
        durSec = state.ytPlayer.getDuration();
      }
    }
    if (!durSec && ep.duration) {
      durSec = parseDurationSeconds(ep.duration);
    }
    let progressPct = 0;
    if (durSec > 0) {
      progressPct = Math.min(100, Math.max(1, Math.round((curPos / durSec) * 100)));
    } else {
      progressPct = 5;
    }
    progressTrackHtml = `<div class="ep-progress-track" title="Click or scrub to resume at any point"><div class="ep-progress-fill" style="width: ${progressPct}%"></div></div>`;
  }

  const card = document.createElement('div');
  card.className = `episode-card ${isCurrentlyActive ? 'playing' : ''} ${isCompleted ? 'is-played' : ''}`;
  card.dataset.guid = ep.guid;

  const dateInput = ep.timestamp || ep.pubDate;
  const humanDate = dateInput ? formatHumanRelativeDate(dateInput) : 'Unknown date';
  const fullDate = dateInput ? new Date(dateInput).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '';
  const formattedDuration = ep.duration ? formatEpisodeDuration(ep.duration) : '';

  let btnHtml = CARD_ICONS.PLAY;
  let btnTitle = 'Play';
  if (isLoading) {
    btnHtml = CARD_ICONS.SPINNER;
    btnTitle = 'Loading...';
  } else if (isPlaying) {
    btnHtml = CARD_ICONS.PAUSE;
    btnTitle = 'Pause';
  }

  const isDownloaded = !!state.downloadedEpisodes[ep.guid];
  const isDownloading = state.downloadingGuids.has(ep.guid);
  let dlIcon = CARD_ICONS.DOWNLOAD;
  let dlTitle = 'Download for offline';
  if (isDownloading) {
    dlIcon = CARD_ICONS.DOWNLOAD_SPINNER;
    dlTitle = 'Downloading...';
  } else if (isDownloaded) {
    dlIcon = CARD_ICONS.DOWNLOADED;
    dlTitle = 'Downloaded (Click to remove)';
  }

  const isFav = isEpisodeFavorited(ep.guid);
  const favBtnHtml = `
    <button class="btn-fav-ep ${isFav ? 'is-favorited' : ''}" title="${isFav ? 'Remove from favorites' : 'Add to favorites'}">
      ${isFav ? CARD_ICONS.HEART_FILLED : CARD_ICONS.HEART}
    </button>
  `;

  const downloadBtnHtml = ep.isYouTube ? '' : `
    <button class="btn-download-ep ${isDownloaded ? 'is-downloaded' : ''} ${isDownloading ? 'is-downloading' : ''}" title="${dlTitle}">
      ${dlIcon}
    </button>
  `;

  const isAboveTheFold = typeof cardIndex === 'number' && cardIndex < 4;
  card.innerHTML = `
    <div class="episode-card-top">
      <img class="episode-artwork" src="${ep.artwork || FALLBACK_ARTWORK}" alt="" ${isAboveTheFold ? 'loading="eager" fetchpriority="high"' : 'loading="lazy" decoding="async"'} width="52" height="52">
      <div class="episode-header-info">
        <div class="episode-podcast-name">${ep.isYouTube ? 'YouTube' : highlightText(ep.podcastTitle, state.searchQuery)}</div>
        <div class="episode-title">${highlightText(ep.title, state.searchQuery)}</div>
      </div>
    </div>
    ${(ep.description || ep.content) ? `<div class="episode-desc">${formatHighlightedDesc(ep.content || ep.description, state.searchQuery)} <span class="episode-desc-link">Notes & links →</span></div>` : ''}
    ${progressTrackHtml}
    <div class="episode-footer">
      <div class="episode-meta">
        <span title="${escapeHtml(fullDate)}" class="date-line" style="display:block;">${escapeHtml(humanDate)}</span>
        <span class="time-line" style="display:block;">
          ${formattedDuration ? `<span>${escapeHtml(formattedDuration)}</span>` : ''}
          ${resumeTimeStr ? `<span class="ep-resume-time" title="Click to resume playback">• ${resumeTimeStr}</span>` : ''}
        </span>
      </div>
      <div class="episode-card-actions" style="display:flex; gap:4px; flex-wrap:nowrap;">
        ${favBtnHtml}
        ${downloadBtnHtml}
        <button class="btn-transcript-ep" title="View Transcript" style="${state.experimentalSettings.enableTranscript === false ? 'display:none;' : ''}">
          ${CARD_ICONS.TRANSCRIPT}
        </button>
        <button class="btn-queue-ep ${isQueued ? 'is-queued' : ''}" title="${isQueued ? 'Remove from Up Next' : 'Add to Up Next'}">
          ${isQueued ? CARD_ICONS.QUEUE_ADDED : CARD_ICONS.QUEUE}
        </button>
        <button class="btn-share-ep" title="Share Episode">
          ${CARD_ICONS.SHARE}
        </button>
        <button class="btn-mark-played ${isCompleted ? 'is-completed' : ''}" title="${isCompleted ? 'Mark as Unplayed' : 'Mark as Played'}">
          ${isCompleted ? CARD_ICONS.CHECK_FILLED : CARD_ICONS.CHECK}
        </button>
        <button class="btn-play-ep" title="${btnTitle}">
          ${btnHtml}
        </button>
      </div>
    </div>
  `;

  const descEl = card.querySelector('.episode-desc');
  if (descEl) {
    descEl.addEventListener('click', (e) => {
      e.stopPropagation();
      openShowNotes(ep);
    });
  }

  const titleEl = card.querySelector('.episode-title');
  if (titleEl) {
    titleEl.addEventListener('click', (e) => {
      e.stopPropagation();
      openShowNotes(ep);
    });
  }

  const podNameEl = card.querySelector('.episode-podcast-name');
  if (podNameEl && ep.feedUrl) {
    podNameEl.addEventListener('click', (e) => {
      e.stopPropagation();
      openFeedDetail(ep.feedUrl);
    });
  }

  const favBtn = card.querySelector('.btn-fav-ep');
  if (favBtn) {
    favBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleFavoriteEpisode(ep);
    });
  }

  const dlBtn = card.querySelector('.btn-download-ep');
  if (dlBtn) {
    dlBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (state.downloadedEpisodes[ep.guid]) {
        removeDownloadedEpisode(ep.guid);
      } else {
        downloadEpisode(ep);
      }
    });
  }

  const transcriptBtn = card.querySelector('.btn-transcript-ep');
  if (transcriptBtn) {
    transcriptBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      openShowNotes(ep, 'transcript');
    });
  }

  card.querySelector('.btn-play-ep').addEventListener('click', (e) => {
    e.stopPropagation();
    toggleEpisodePlayback(ep, context);
  });

  card.querySelector('.btn-queue-ep').addEventListener('click', (e) => {
    e.stopPropagation();
    toggleEpisodeQueue(ep);
  });

  const shareBtn = card.querySelector('.btn-share-ep');
  if (shareBtn) {
    shareBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      shareEpisode(ep);
    });
  }

  card.querySelector('.btn-mark-played').addEventListener('click', (e) => {
    e.stopPropagation();
    toggleMarkPlayed(ep);
  });

  const progressTrack = card.querySelector('.ep-progress-track');
  if (progressTrack) {
    setupProgressTrackInteractivity(progressTrack, card, ep, context);
  }

  const resumeBadge = card.querySelector('.ep-resume-time');
  if (resumeBadge) {
    resumeBadge.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleEpisodePlayback(ep, context);
    });
  }

  return card;
}

let feedsSearchDebounceTimer = null;

// ─────────────────────────────────────────────────────────────────────────
// SECTION 20 · Feeds Grid & Feed Detail
// renderFeedsGrid — podcast library grid with per-feed episode widgets.
// openFeedDetail / renderFeedDetail — drills into a single podcast.
// ─────────────────────────────────────────────────────────────────────────

function wireFeedsEmptyStateEvents() {
  const quickForm = document.getElementById('feeds-empty-quick-form');
  const quickInput = document.getElementById('feeds-empty-quick-input');
  const quickSubmit = document.getElementById('btn-feeds-empty-quick-submit');
  const quickResults = document.getElementById('feeds-empty-quick-results');

  if (quickInput && quickForm) {
    const normalizeUrl = (str) => {
      let u = str.trim();
      if ((u.startsWith('www.') || u.includes('youtube.com/') || u.includes('youtu.be/')) && !u.startsWith('http://') && !u.startsWith('https://')) {
        u = 'https://' + u;
      }
      return u;
    };

    const isDirectUrl = (str) => {
      const u = str.trim().toLowerCase();
      return u.startsWith('http://') || u.startsWith('https://') || u.startsWith('www.') || u.includes('youtube.com/') || u.includes('youtu.be/');
    };

    quickInput.addEventListener('input', () => {
      const raw = quickInput.value.trim();
      if (quickSubmit) {
        quickSubmit.textContent = isDirectUrl(raw) ? 'Add Feed' : 'Search';
      }
      if (feedsSearchDebounceTimer) clearTimeout(feedsSearchDebounceTimer);
      if (!raw || raw.length < 3 || isDirectUrl(raw)) {
        if (quickResults) quickResults.innerHTML = '';
        return;
      }
      feedsSearchDebounceTimer = setTimeout(() => {
        if (quickResults) {
          searchPodcastDirectory(raw, quickResults);
        }
      }, 650);
    });

    quickForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const raw = quickInput.value.trim();
      if (!raw) return;

      if (isDirectUrl(raw)) {
        const val = normalizeUrl(raw);
        if (quickSubmit) {
          quickSubmit.textContent = 'adding...';
          quickSubmit.disabled = true;
        }
        try {
          const added = await addFeed(val);
          if (added) {
            const meta = state.feedMetadata[val] || {};
            if (meta.error) {
              showToast(`⚠️ Could not load feed: ${meta.error}`, 4000);
              if (quickSubmit) {
                quickSubmit.textContent = 'Add Feed';
                quickSubmit.disabled = false;
              }
            } else {
              quickInput.value = '';
              if (quickResults) quickResults.innerHTML = '';
              const feedTitle = meta.title || 'podcast';
              const count = meta.episodesCount || (state.allEpisodes ? state.allEpisodes.filter(ep => ep.feedUrl === val).length : 0);
              showToast(`✓ Subscribed to "${feedTitle}" (${count} episodes added)!`, 3500);
              if (quickSubmit) {
                quickSubmit.textContent = '✓ added';
                setTimeout(() => {
                  if (quickSubmit) {
                    quickSubmit.textContent = 'search / add';
                    quickSubmit.disabled = false;
                  }
                }, 2500);
              }
              renderFeedsGrid();
            }
          } else {
            if (quickSubmit) {
              quickSubmit.textContent = 'Add Feed';
              quickSubmit.disabled = false;
            }
          }
        } catch (err) {
          showToast(`⚠️ Error adding feed: ${err?.message || 'Network error'}`, 4000);
          if (quickSubmit) {
            quickSubmit.textContent = 'Add Feed';
            quickSubmit.disabled = false;
          }
        }
      } else {
        if (feedsSearchDebounceTimer) clearTimeout(feedsSearchDebounceTimer);
        if (quickResults) {
          searchPodcastDirectory(raw, quickResults);
        }
      }
    });
  }

  const catChips = document.querySelectorAll('#feeds-empty-category-chips .category-chip');
  catChips.forEach(chip => {
    chip.addEventListener('click', () => {
      const cat = chip.dataset.category;
      if (quickInput) quickInput.value = cat;
      if (quickResults) searchPodcastDirectory(cat, quickResults);
    });
  });

  document.getElementById('btn-feeds-empty-open-add')?.addEventListener('click', () => {
    openAddModal();
  });
  document.getElementById('btn-feeds-empty-opml')?.addEventListener('click', () => {
    elements.opmlFileInput?.click();
  });
  document.getElementById('btn-feeds-empty-defaults')?.addEventListener('click', () => {
    elements.btnLoadDefaults?.click();
  });

  wireStarterSuggestionsEvents(elements.feedsGrid);
}

const FEED_CATEGORIES = [
  { id: 'all', label: 'all podcasts', match: () => true },
  { id: 'audio', label: 'audio', match: (url) => !url.includes('youtube.com') && !url.includes('youtu.be') },
  { id: 'video', label: 'video / youtube', match: (url) => url.includes('youtube.com') || url.includes('youtu.be') },
  { id: 'news', label: 'news', match: (url, meta) => /news|nachrichten|politik|zeit|hintergrund|berichte|report|tagesschau|bbc|spiegel|echo/i.test(((meta.title || '') + ' ' + (meta.description || ''))) },
  { id: 'science', label: 'science', match: (url, meta) => /science|forschung|wissen|spektrum|nature|nasa|physik|biology|climate|klima|space|planet/i.test(((meta.title || '') + ' ' + (meta.description || ''))) },
  { id: 'doc', label: 'docs', match: (url, meta) => /doc|doku|story|geschichten|history|investigative|feature|crime|leben/i.test(((meta.title || '') + ' ' + (meta.description || ''))) },
  { id: 'music', label: 'music', match: (url, meta) => /music|techno|dj|sound|mix|beats|song|dance/i.test(((meta.title || '') + ' ' + (meta.description || ''))) },
  { id: 'tech', label: 'tech & ai', match: (url, meta) => /tech|technology|software|ai|computer|digital|code|gadget/i.test(((meta.title || '') + ' ' + (meta.description || ''))) }
];

function renderFeedsFilterChips() {
  if (!elements.feedsFilterChips) return;
  const active = state.feedFilter || 'all';

  // Compute counts for each category based on current saved feeds
  const visibleChips = FEED_CATEGORIES.map(cat => {
    const count = state.feeds.filter(url => {
      const meta = state.feedMetadata[url] || {};
      return cat.match(url, meta);
    }).length;
    return { ...cat, count };
  }).filter(c => c.id === 'all' || c.count > 0);

  elements.feedsFilterChips.innerHTML = visibleChips.map(c => `
    <button type="button" class="feed-filter-chip ${active === c.id ? 'active' : ''}" data-filter="${c.id}">
      <span>${escapeHtml(c.label)}</span>
      <span class="chip-count">(${c.count})</span>
    </button>
  `).join('');

  elements.feedsFilterChips.querySelectorAll('.feed-filter-chip').forEach(btn => {
    btn.addEventListener('click', () => {
      state.feedFilter = btn.dataset.filter;
      renderFeedsGrid();
    });
  });
}

const FEEDS_SORT_KEY = 'anypod_feeds_sort';
const isYouTubeFeedUrl = (url) => /youtube\.com|youtu\.be/i.test(url || '');

function getFeedsSortOrder() {
  return storage.getItem(FEEDS_SORT_KEY) || 'recent';
}

function sortFeedsForGrid(urls) {
  const order = getFeedsSortOrder();
  const addedIndex = new Map(state.feeds.map((u, i) => [u, i]));
  const titleOf = (u) => ((state.feedMetadata[u] || {}).title || u).toLowerCase();

  // One pass over all episodes → per-feed stats
  const stats = new Map();
  urls.forEach(u => stats.set(u, { lastPlayed: 0, newest: 0, unplayed: 0 }));
  state.allEpisodes.forEach(ep => {
    const s = stats.get(ep.feedUrl);
    if (!s) return;
    const ts = ep.timestamp || 0;
    if (ts > s.newest) s.newest = ts;
    const pos = state.playbackPositions[ep.guid];
    if (pos && pos.lastListenedAt) {
      // lastListenedAt may be stored in seconds or ms — normalise to ms
      const l = pos.lastListenedAt < 1e12 ? pos.lastListenedAt * 1000 : pos.lastListenedAt;
      if (l > s.lastPlayed) s.lastPlayed = l;
    }
    if (!pos || (!pos.completed && (!pos.position || pos.position <= 2))) s.unplayed++;
  });

  const byName = (a, b) => titleOf(a).localeCompare(titleOf(b));
  const sorted = [...urls];
  switch (order) {
    case 'newest':
      sorted.sort((a, b) => stats.get(b).newest - stats.get(a).newest || byName(a, b));
      break;
    case 'unplayed':
      sorted.sort((a, b) => stats.get(b).unplayed - stats.get(a).unplayed || byName(a, b));
      break;
    case 'name-asc':
      sorted.sort(byName);
      break;
    case 'name-desc':
      sorted.sort((a, b) => byName(b, a));
      break;
    case 'added-desc':
      sorted.sort((a, b) => addedIndex.get(b) - addedIndex.get(a));
      break;
    case 'added-asc':
      sorted.sort((a, b) => addedIndex.get(a) - addedIndex.get(b));
      break;
    case 'type':
      sorted.sort((a, b) => (isYouTubeFeedUrl(a) - isYouTubeFeedUrl(b)) || byName(a, b));
      break;
    case 'recent':
    default:
      // Last played first; never-played feeds fall back to newest episode
      sorted.sort((a, b) => {
        const sa = stats.get(a), sb = stats.get(b);
        if (sa.lastPlayed || sb.lastPlayed) return sb.lastPlayed - sa.lastPlayed;
        return sb.newest - sa.newest;
      });
  }
  return sorted;
}

function setupFeedsSortSelect() {
  const sel = document.getElementById('feeds-sort-order');
  if (!sel || sel.dataset.wired) return;
  sel.dataset.wired = '1';
  sel.value = getFeedsSortOrder();
  sel.addEventListener('change', () => {
    storage.setItem(FEEDS_SORT_KEY, sel.value);
    renderFeedsGrid();
  });
}

function renderFeedsGrid() {
  setupFeedsSortSelect();
  updateDockVisibility();
  const grid = elements.feedsGrid;
  grid.innerHTML = '';

  if (state.feeds.length === 0) {
    if (elements.feedsFilterBar) elements.feedsFilterBar.classList.add('hidden');
    navigateTo('discover');
    return;
  }

  if (elements.feedsFilterBar) {
    elements.feedsFilterBar.classList.remove('hidden');
    // renderFeedsFilterChips();
  }

  let feedsToRender = state.feeds;

  // Apply quick category filter
  if (state.feedFilter && state.feedFilter !== 'all') {
    const catObj = FEED_CATEGORIES.find(c => c.id === state.feedFilter);
    if (catObj) {
      feedsToRender = feedsToRender.filter(url => {
        const meta = state.feedMetadata[url] || {};
        return catObj.match(url, meta);
      });
    }
  }

  // Apply active search query filter
  if (state.searchQuery && elements.tabFeeds && elements.tabFeeds.classList.contains('active')) {
    const q = state.searchQuery.toLowerCase();
    feedsToRender = feedsToRender.filter(url => {
      const meta = state.feedMetadata[url] || {};
      return (meta.title && meta.title.toLowerCase().includes(q)) ||
             (meta.author && meta.author.toLowerCase().includes(q)) ||
             url.toLowerCase().includes(q);
    });
  }

  if (feedsToRender.length === 0) {
    grid.innerHTML = `
      <div class="empty-state">
        <h3>No matching podcasts</h3>
        <p>${state.searchQuery ? `No podcasts in your library match "${escapeHtml(state.searchQuery)}".` : 'No podcasts match the selected filter.'}</p>
      </div>
    `;
    return;
  }

  feedsToRender = sortFeedsForGrid(feedsToRender);

  feedsToRender.forEach(url => {
    const meta = state.feedMetadata[url] || {};
    const card = document.createElement('div');
    card.className = 'feed-card';

    const rawDesc = meta.description || '';
    const plainDesc = rawDesc.replace(/<[^>]*>?/gm, '').replace(/\s+/g, ' ').trim();

    const allForFeed = state.allEpisodes
      .filter(e => e.feedUrl === url)
      .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

    const inProgressEps = allForFeed.filter(ep => {
      const pos = state.playbackPositions[ep.guid];
      return pos && !pos.completed && pos.position > 2;
    });

    const unplayedEps = allForFeed.filter(ep => {
      const pos = state.playbackPositions[ep.guid];
      const isProg = inProgressEps.some(p => p.guid === ep.guid);
      return !isProg && (!pos || (!pos.completed && (!pos.position || pos.position <= 2)));
    });

    let feedEpisodes = [...inProgressEps, ...unplayedEps].slice(0, 3);
    const hasUnplayed = feedEpisodes.length > 0;
    if (feedEpisodes.length < 3) {
      const existingGuids = new Set(feedEpisodes.map(e => e.guid));
      const remaining = allForFeed.filter(e => !existingGuids.has(e.guid)).slice(0, 3 - feedEpisodes.length);
      feedEpisodes.push(...remaining);
    }

    const widgetHeader = hasUnplayed
      ? (inProgressEps.length > 0 ? 'Continue & up next' : 'Up next (unplayed)')
      : 'Caught up • Latest';

    let recentWidgetHtml = '';
    if (feedEpisodes.length > 0) {
      recentWidgetHtml = `
        <div class="feed-recent-widget">
          <div class="feed-recent-header">${widgetHeader}</div>
          <div class="feed-recent-list">
            ${feedEpisodes.map(ep => {
              const isCurrent = state.currentEpisode && state.currentEpisode.guid === ep.guid;
              const isEpPlaying = isCurrent && state.playbackStatus === 'playing';
              const pos = state.playbackPositions[ep.guid];
              const isCompleted = pos && (pos.completed === 1 || pos.completed === true);
              const isInProgress = pos && !isCompleted && pos.position > 2;
              let durStr = ep.duration ? formatDurationCompact(ep.duration) : '';
              if (isInProgress) {
                durStr = `Resume ${formatTime(pos.position)}`;
              } else if (isCompleted) {
                durStr = `✓ ${durStr}`;
              }
              return `
                <div class="recent-ep-row ${isCurrent ? 'active' : ''} ${isCompleted ? 'is-played' : ''} ${isInProgress ? 'is-in-progress' : ''}" data-guid="${escapeHtml(ep.guid)}" title="${escapeHtml(ep.title)}">
                  <button class="btn-recent-play ${isEpPlaying ? 'is-playing' : ''}" data-guid="${escapeHtml(ep.guid)}" aria-label="Play ${escapeHtml(ep.title)}">
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">${isEpPlaying ? '<rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect>' : '<polygon points="5 3 19 12 5 21 5 3"></polygon>'}</svg>
                  </button>
                  <span class="recent-ep-title">${highlightText(ep.title, state.searchQuery)}</span>
                  ${durStr ? `<span class="recent-ep-duration">${durStr}</span>` : ''}
                </div>
              `;
            }).join('')}
          </div>
        </div>
      `;
    }

    card.innerHTML = `
      <div class="feed-header">
        <img class="feed-art" loading="lazy" decoding="async" width="48" height="48" src="${meta.artwork || FALLBACK_ARTWORK}" alt="">
        <div class="feed-info">
          <h4>${highlightText(meta.title || url, state.searchQuery)}</h4>
          <p>${meta.error ? `<span style="color: #ef4444;">${escapeHtml(meta.error)}</span>` : `${meta.episodesCount || feedEpisodes.length} episodes`}${isFeedMuted(url) ? ' • <span style="color: var(--danger); font-weight: 500;">Muted</span>' : ''}</p>
        </div>
        <div class="feed-header-actions">
          <button class="btn-feed-share" title="Share podcast" aria-label="Share podcast">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"></path>
              <polyline points="16 6 12 2 8 6"></polyline>
              <line x1="12" y1="2" x2="12" y2="15"></line>
            </svg>
          </button>
          <button class="btn-feed-unsubscribe" title="Remove podcast" aria-label="Remove podcast">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="3 6 5 6 21 6"></polyline>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
            </svg>
          </button>
        </div>
      </div>
      ${plainDesc ? `<p class="feed-card-desc">${escapeHtml(plainDesc)}</p>` : ''}
      ${recentWidgetHtml}
    `;

    card.addEventListener('click', (e) => {
      if (e.target.closest('.feed-header-actions') || e.target.closest('.recent-ep-row')) return;
      openFeedDetail(url);
    });

    card.querySelector('.btn-feed-share')?.addEventListener('click', (e) => {
      e.stopPropagation();
      shareFeed(url, meta.title);
    });

    card.querySelector('.btn-feed-unsubscribe')?.addEventListener('click', (e) => {
      e.stopPropagation();
      promptRemoveFeed(url);
    });

    card.querySelectorAll('.recent-ep-row').forEach(row => {
      const guid = row.dataset.guid;
      const ep = feedEpisodes.find(item => item.guid === guid);
      if (!ep) return;
      row.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleEpisodePlayback(ep, {
          type: 'feed',
          id: url,
          title: meta.title || 'Podcast Show',
          items: allForFeed
        });
      });
    });

    grid.appendChild(card);
  });
}

function openFeedDetail(feedUrl) {
  navigateTo(null, feedUrl);
}

const previewLoadingSet = new Set();

function renderFeedDetail(feedUrl) {
  const isSubbed = state.feeds.includes(feedUrl);
  const isMuted = isFeedMuted(feedUrl);
  const meta = state.feedMetadata[feedUrl] || {};
  let episodes = state.allEpisodes.filter(e => e.feedUrl === feedUrl);
  const header = elements.feedDetailHeader;
  if (!header) return;

  const totalCount = episodes.length;
  const q = (state.searchQuery || '').trim().toLowerCase();
  if (q) {
    const terms = q.split(/\s+/).filter(Boolean);
    episodes = episodes.filter(ep => {
      const title = (ep.title || '').toLowerCase();
      const fullDesc = (ep.content || ep.description || '').toLowerCase();
      return terms.every(term => title.includes(term) || fullDesc.includes(term));
    });
  }

  // Filter by unplayed / played / all according to dock filterMode
  if (state.filterMode === 'unplayed') {
    episodes = episodes.filter(ep => {
      const pos = state.playbackPositions[ep.guid];
      return !pos || !pos.completed;
    });
  } else if (state.filterMode === 'played') {
    episodes = episodes.filter(ep => {
      const pos = state.playbackPositions[ep.guid];
      return pos && pos.completed;
    });
  }

  // Sort episodes according to dock sortOrder with played/listened episodes ordered last by default
  episodes.sort((a, b) => {
    // 1. Order played episodes last when viewing 'all' episodes
    if (state.filterMode === 'all') {
      const isPlayedA = !!(state.playbackPositions[a.guid]?.completed);
      const isPlayedB = !!(state.playbackPositions[b.guid]?.completed);
      if (isPlayedA !== isPlayedB) {
        return isPlayedA ? 1 : -1;
      }
    }

    // 2. Primary sort order within unplayed / played groups
    if (state.sortOrder === 'newest') {
      return (b.timestamp || 0) - (a.timestamp || 0);
    } else if (state.sortOrder === 'oldest') {
      return (a.timestamp || 0) - (b.timestamp || 0);
    } else if (state.sortOrder === 'title-asc') {
      return (a.title || '').localeCompare(b.title || '');
    } else if (state.sortOrder === 'title-desc') {
      return (b.title || '').localeCompare(a.title || '');
    } else if (state.sortOrder === 'duration-asc') {
      return parseDurationSeconds(a.duration) - parseDurationSeconds(b.duration);
    } else if (state.sortOrder === 'duration-desc') {
      return parseDurationSeconds(b.duration) - parseDurationSeconds(a.duration);
    }
    return 0;
  });

  const loadedCount = episodes.length;
  const expectedTotal = meta.episodesCount || totalCount;

  const isPaging = (typeof _activeYtPaginations !== 'undefined') && (
    (meta.playlistId && _activeYtPaginations.has(meta.playlistId)) ||
    (feedUrl.includes('list=') && _activeYtPaginations.has(feedUrl.split('list=')[1].split('&')[0]))
  );

  const isPartial = expectedTotal > 0 && totalCount < expectedTotal;

  const badgeText = q
    ? `${loadedCount} of ${totalCount} episodes`
    : (isPartial && isPaging)
      ? `${totalCount} / ${expectedTotal} episodes (syncing...)`
      : isPartial
        ? `${totalCount} / ${expectedTotal} episodes • Click to sync`
        : state.filterMode === 'unplayed' && loadedCount !== totalCount
          ? `${loadedCount} unplayed • ${totalCount} episodes`
          : state.filterMode === 'played' && loadedCount !== totalCount
            ? `${loadedCount} played • ${totalCount} episodes`
            : `${totalCount} episodes`;

  if (header.dataset.feedUrl !== feedUrl) {
    header.dataset.feedUrl = feedUrl;
    const prevView = state.navHistory[state.navHistory.length - 1];
    const backLabel = prevView?.feedUrl
      ? '← Back'
      : prevView?.tab
        ? `← ${prevView.tab.charAt(0).toUpperCase() + prevView.tab.slice(1)}`
        : '← Back';

    header.innerHTML = `
      <div class="feed-detail-top-nav">
        <div class="feed-detail-nav-row">
          <button class="feed-link-badge btn-back-nav" id="btn-feed-back">${escapeHtml(backLabel)}</button>
          <div class="feed-detail-sub-actions">
            ${isSubbed ? `
              <button class="feed-link-badge btn-feed-mute ${isMuted ? 'is-muted' : ''}" id="btn-feed-mute" title="${isMuted ? 'Unmute: show episodes in timeline' : 'Mute: hide episodes from timeline'}">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${isMuted ? '<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><line x1="23" y1="9" x2="17" y2="15"></line><line x1="17" y1="9" x2="23" y2="15"></line>' : '<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path>'}</svg>
                <span>${isMuted ? 'Muted' : 'Mute'}</span>
              </button>
            ` : ''}
            <button class="feed-link-badge btn-feed-action ${isSubbed ? 'is-subbed' : 'is-unsubbed'}" id="btn-feed-action">
              ${isSubbed ? `
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                <span>Unsubscribe</span>
              ` : `
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                <span>Follow Podcast</span>
              `}
            </button>
          </div>
        </div>
        <div class="feed-detail-top-actions">
          <button class="feed-link-badge btn-feed-play" id="btn-feed-play-all" title="Play episodes from this feed">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
            <span>Play</span>
          </button>
          <button class="feed-link-badge btn-feed-shuffle ${state.isShuffle ? 'is-active' : ''}" id="btn-feed-shuffle" title="Toggle shuffle mode" aria-pressed="${state.isShuffle ? 'true' : 'false'}">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 3 21 3 21 8"></polyline><line x1="4" y1="20" x2="21" y2="3"></line><polyline points="21 16 21 21 16 21"></polyline><line x1="15" y1="15" x2="21" y2="21"></line><line x1="4" y1="4" x2="9" y2="9"></line></svg>
            <span>Shuffle</span>
          </button>
        </div>
      </div>
      <div class="feed-detail-main">
        <img class="feed-detail-art" loading="lazy" decoding="async" width="48" height="48" src="${meta.artwork || FALLBACK_ARTWORK}" alt="">
        <div class="feed-detail-info">
          <div class="feed-detail-title">${escapeHtml(meta.title || 'Untitled Podcast')}</div>
          <div class="feed-detail-author">${escapeHtml(meta.author || '')}</div>
          ${meta.description ? `<div class="feed-detail-desc">${escapeHtml(meta.description)}</div>` : ''}
          <div class="feed-detail-links">
            ${meta.link ? `<a href="${escapeHtml(meta.link)}" target="_blank" rel="noopener noreferrer" class="feed-link-badge">Website</a>` : ''}
            <button class="feed-link-badge" id="btn-copy-link" title="Copy Podcast Link to Clipboard">Copy Link</button>
            <button class="feed-link-badge" id="btn-share-feed-link" title="Share Podcast">Share Feed</button>
            <button class="feed-link-badge" id="btn-copy-rss" title="Copy RSS Feed URL">Copy RSS</button>
            <button class="feed-link-badge" id="btn-refresh-feed-detail" title="Fetch latest metadata & tracks from source">↻ Refresh</button>
            <span class="feed-link-badge ${isPartial && !isPaging ? 'feed-sync-resumable' : ''}" id="feed-episodes-badge" style="cursor: ${isPartial && !isPaging ? 'pointer' : 'default'};" title="${isPartial && !isPaging ? 'Click to resume syncing remaining episodes' : isPaging ? 'Sync in progress' : ''}">${badgeText}</span>
            ${isSubbed && isMuted ? `<span class="feed-link-badge feed-muted-badge" style="cursor: default;">Timeline Muted</span>` : ''}
          </div>
        </div>
      </div>
    `;

    header.querySelector('#btn-feed-back').addEventListener('click', () => {
      navigateBack();
    });

    const refreshFeedBtn = header.querySelector('#btn-refresh-feed-detail');
    if (refreshFeedBtn) {
      refreshFeedBtn.addEventListener('click', async () => {
        showStatus('Refreshing feed metadata & tracks...');
        refreshFeedBtn.textContent = '↻ Syncing...';
        try {
          const incoming = [];
          const updatedMeta = { ...state.feedMetadata };
          await fetchSingleFeed(feedUrl, incoming, updatedMeta);
          if (incoming.length > 0) {
            const epMap = new Map();
            incoming.forEach(ep => { if (ep && ep.guid) epMap.set(ep.guid, ep); });
            state.allEpisodes.forEach(ep => {
              if (ep && ep.guid && !epMap.has(ep.guid) && state.feeds.includes(ep.feedUrl)) {
                epMap.set(ep.guid, ep);
              }
            });
            state.allEpisodes = Array.from(epMap.values());
            state.feedMetadata = updatedMeta;
            saveCacheToStorage();
            processAndSortEpisodes();
            header.dataset.feedUrl = '';
            renderFeedDetail(feedUrl);
            renderTimeline();
            showStatus('Feed updated with latest metadata!');
          } else {
            showStatus('Feed checked: up to date.');
          }
        } catch (err) {
          console.error('[Feed Refresh Error]:', err);
          showStatus('Failed to refresh feed.');
        } finally {
          if (refreshFeedBtn) refreshFeedBtn.textContent = '↻ Refresh';
          setTimeout(hideStatus, 2000);
        }
      });
    }

    const playAllBtn = header.querySelector('#btn-feed-play-all');
    if (playAllBtn) {
      playAllBtn.addEventListener('click', () => {
        if (episodes.length === 0) return;
        const feedContext = {
          type: 'feed',
          id: feedUrl,
          title: meta.title || 'Podcast Show',
          items: episodes
        };
        if (state.isShuffle) {
          const randIdx = Math.floor(Math.random() * episodes.length);
          playEpisode(episodes[randIdx], null, feedContext);
        } else {
          playEpisode(episodes[0], null, feedContext);
        }
      });
    }

    const btnShuffle = header.querySelector('#btn-feed-shuffle');
    if (btnShuffle) {
      btnShuffle.addEventListener('click', () => {
        toggleShuffle();
      });
    }

    const copyLinkBtn = header.querySelector('#btn-copy-link');
    if (copyLinkBtn) {
      copyLinkBtn.addEventListener('click', async () => {
        const shareUrl = `${window.location.origin}/?feed=${encodeURIComponent(feedUrl)}#feed=${encodeURIComponent(feedUrl)}`;
        try {
          await navigator.clipboard.writeText(shareUrl);
          copyLinkBtn.textContent = 'Copied!';
          showToast('Podcast link copied to clipboard');
          setTimeout(() => {
            if (copyLinkBtn) copyLinkBtn.textContent = 'Copy Link';
          }, 2000);
        } catch (_) {
          window.prompt('Copy podcast link:', shareUrl);
        }
      });
    }

    const shareFeedLink = header.querySelector('#btn-share-feed-link');
    if (shareFeedLink) {
      shareFeedLink.addEventListener('click', () => {
        shareFeed(feedUrl, meta.title);
      });
    }

    const muteBtn = header.querySelector('#btn-feed-mute');
    if (muteBtn) {
      muteBtn.addEventListener('click', () => {
        toggleMuteFeed(feedUrl);
      });
    }

    const actionBtn = header.querySelector('#btn-feed-action');
    if (actionBtn) {
      actionBtn.addEventListener('click', () => {
        if (state.feeds.includes(feedUrl)) {
          promptRemoveFeed(feedUrl);
        } else {
          addFeed(feedUrl, meta.title, meta.artwork);
          header.dataset.feedUrl = '';
          renderFeedDetail(feedUrl);
        }
      });
    }

    header.querySelector('#btn-copy-rss').addEventListener('click', () => {
      navigator.clipboard.writeText(feedUrl).then(() => {
        const btn = header.querySelector('#btn-copy-rss');
        if (btn) btn.textContent = 'Copied!';
        setTimeout(() => {
          if (btn) btn.textContent = 'Copy RSS';
        }, 2000);
      });
    });

    const epBadge = header.querySelector('#feed-episodes-badge');
    if (epBadge) {
      epBadge.addEventListener('click', () => {
        const currentMeta = state.feedMetadata[feedUrl] || {};
        const currentEps = state.allEpisodes.filter(e => e.feedUrl === feedUrl);
        const currentExpected = currentMeta.episodesCount || 0;
        const pId = currentMeta.playlistId || (feedUrl.includes('list=') ? feedUrl.split('list=')[1].split('&')[0] : null);
        const currentlyPaging = pId && _activeYtPaginations.has(pId);

        if (currentExpected && currentEps.length < currentExpected && !currentlyPaging && pId) {
          showToast('Resuming episode sync...');
          startYouTubeBackgroundPaging(pId, feedUrl, currentMeta.nextToken || null);
          renderFeedDetail(feedUrl);
        }
      });
    }
  } else {
    const btnShuffle = header.querySelector('#btn-feed-shuffle');
    if (btnShuffle) {
      btnShuffle.classList.toggle('is-active', state.isShuffle === true);
      btnShuffle.setAttribute('aria-pressed', String(state.isShuffle === true));
    }
    const chk = header.querySelector('#chk-feed-shuffle');
    if (chk) {
      chk.checked = state.isShuffle === true;
    }
    const badge = header.querySelector('#feed-episodes-badge');
    if (badge) {
      badge.textContent = badgeText;
      badge.style.cursor = isPartial && !isPaging ? 'pointer' : 'default';
      badge.title = isPartial && !isPaging ? 'Click to resume syncing remaining episodes' : isPaging ? 'Sync in progress' : '';
      if (isPartial && !isPaging) {
        badge.classList.add('feed-sync-resumable');
      } else {
        badge.classList.remove('feed-sync-resumable');
      }
    }
    const actionBtn = header.querySelector('#btn-feed-action');
    if (actionBtn) {
      actionBtn.className = `feed-link-badge btn-feed-action ${isSubbed ? 'is-subbed' : 'is-unsubbed'}`;
      actionBtn.innerHTML = isSubbed
        ? `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg><span>Unsubscribe</span>`
        : `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg><span>Follow Podcast</span>`;
    }
    const muteBtn = header.querySelector('#btn-feed-mute');
    if (muteBtn) {
      muteBtn.className = `feed-link-badge btn-feed-mute ${isMuted ? 'is-muted' : ''}`;
      muteBtn.title = isMuted ? 'Unmute: show episodes in timeline' : 'Mute: hide episodes from timeline';
      muteBtn.innerHTML = `
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${isMuted ? '<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><line x1="23" y1="9" x2="17" y2="15"></line><line x1="17" y1="9" x2="23" y2="15"></line>' : '<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path>'}</svg>
        <span>${isMuted ? 'Muted' : 'Mute'}</span>
      `;
    }
    const existingMutedBadge = header.querySelector('.feed-muted-badge');
    if (isSubbed && isMuted) {
      if (!existingMutedBadge) {
        const linksRow = header.querySelector('.feed-detail-links');
        if (linksRow) {
          const span = document.createElement('span');
          span.className = 'feed-link-badge feed-muted-badge';
          span.style.cursor = 'default';
          span.textContent = 'Timeline Muted';
          linksRow.appendChild(span);
        }
      }
    } else if (existingMutedBadge) {
      existingMutedBadge.remove();
    }
  }

  const list = elements.feedDetailEpisodes;
  if (!list) return;
  list.innerHTML = '';

  if (totalCount === 0) {
    if (!isSubbed && !previewLoadingSet.has(feedUrl)) {
      previewLoadingSet.add(feedUrl);
      list.innerHTML = `
        <div class="empty-state">
          <div class="spinner" style="margin: 0 auto 1.25rem auto; width: 32px; height: 32px; border: 3px solid var(--border-light); border-top-color: var(--text-primary); border-radius: 50%;"></div>
          <h3>Loading episodes preview...</h3>
          <p>Fetching episodes so you can listen before adding.</p>
        </div>
      `;
      fetchSingleFeed(feedUrl, state.allEpisodes, state.feedMetadata).then(res => {
        previewLoadingSet.delete(feedUrl);
        if (res) {
          header.dataset.feedUrl = '';
          renderFeedDetail(feedUrl);
        } else {
          list.innerHTML = `<div class="empty-state"><h3>Unable to load preview</h3><p>Could not fetch RSS feed for this podcast.</p></div>`;
        }
      }).catch(() => {
        previewLoadingSet.delete(feedUrl);
        list.innerHTML = `<div class="empty-state"><h3>Unable to load preview</h3><p>Could not fetch RSS feed for this podcast.</p></div>`;
      });
      return;
    }
    list.innerHTML = `<div class="empty-state"><h3>No episodes found for this podcast</h3></div>`;
    return;
  }

  if (episodes.length === 0) {
    list.innerHTML = `<div class="empty-state"><h3>No matching episodes</h3><p>No episodes in this podcast match "${escapeHtml(state.searchQuery)}".</p></div>`;
    return;
  }

  const feedContext = {
    type: 'feed',
    id: feedUrl,
    title: meta.title || 'Podcast Show',
    items: episodes
  };

  const frag = document.createDocumentFragment();
  episodes.forEach(ep => {
    frag.appendChild(createEpisodeCard(ep, feedContext));
  });
  list.appendChild(frag);
}

