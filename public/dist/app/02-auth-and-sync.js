'use strict';

// ─────────────────────────────────────────────────────────────────────────
// SECTION 7 · Auth & Session
// Two auth paths:
//   a) Magic link → ?session=TOKEN in URL → stored in localStorage.
//   b) Session cookie (set by /api/auth/send-link verify flow).
// getWebmailProvider — returns a deeplink to the user's inbox provider
//   so we can render an "Open Gmail / Outlook" button after sending a link.
// ─────────────────────────────────────────────────────────────────────────

function checkUrlSessionParam() {
  const urlParams = new URLSearchParams(window.location.search);
  const sessionParam = urlParams.get('session');
  if (sessionParam) {
    state.sessionToken = sessionParam;
    storage.setItem(STORAGE_KEYS.SESSION, sessionParam);
    window.history.replaceState({}, document.title, window.location.pathname);
  } else {
    state.sessionToken = storage.getItem(STORAGE_KEYS.SESSION) || storage.getItem('podcast_pulse_session_token') || '';
  }
  state.userEmail = storage.getItem(STORAGE_KEYS.USER_EMAIL) || '';
}

function applyBundledD1State(data) {
  if (!data) return;
  if (data.positions && typeof data.positions === 'object') {
    const merged = { ...state.playbackPositions };
    for (const [guid, rPos] of Object.entries(data.positions)) {
      const lPos = merged[guid];
      if (!lPos || (rPos.lastListenedAt || 0) >= (lPos.lastListenedAt || 0)) {
        merged[guid] = rPos;
      }
    }
    state.playbackPositions = merged;
    savePositionsToStorage();
    renderContinueShelf();
    updateFilterBadges();
  }
  if (Array.isArray(data.favorites)) {
    const map = new Map();
    (state.favorites || []).forEach(f => map.set(f.guid, f));
    data.favorites.forEach(rf => {
      if (!map.has(rf.guid)) {
        map.set(rf.guid, rf);
      } else {
        map.set(rf.guid, { ...map.get(rf.guid), ...rf });
      }
    });
    state.favorites = Array.from(map.values()).sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0));
    state.favoriteGuids = new Set(state.favorites.map(f => f.guid).filter(Boolean));
    if (typeof saveFavoritesToStorage === 'function') saveFavoritesToStorage();
    if (typeof updateFavoritesCountUI === 'function') updateFavoritesCountUI();
  }
}

async function checkAuth() {
  if (state.sessionToken) {
    elements.authModal.classList.add('hidden');
    updateSyncStatusUI('authenticated via magic session (cloud d1 synced)', state.userEmail, true);
    syncFeedsWithD1();
    return;
  }

  // Skip calling /api/sync/feeds if no session token and no session cookie exists (prevents 401 Worker calls for guests)
  const rawCookies = typeof document !== 'undefined' ? (document.cookie || '') : '';
  const hasSessionCookie = rawCookies.includes('podcast_session=') || rawCookies.includes('sessionid=');
  if (!hasSessionCookie) {
    elements.authModal.classList.add('hidden');
    updateSyncStatusUI('logged in as guest / local device storage', '', false);
    if (state.feeds.length > 0) {
      refreshAllFeeds();
    } else {
      renderTimeline();
    }
    return;
  }

  try {
    const res = await fetch('/api/sync/feeds?bundle=1', { credentials: 'include' });
    if (res.status === 401) {
      elements.authModal.classList.add('hidden');
      updateSyncStatusUI('logged in as guest / local device storage', '', false);
      if (state.feeds.length > 0) {
        refreshAllFeeds();
      } else {
        renderTimeline();
      }
      return;
    }
    if (res.ok) {
      const data = await res.json();
      elements.authModal.classList.add('hidden');
      if (data.sessionToken) {
        state.sessionToken = data.sessionToken;
        try {
          storage.setItem(STORAGE_KEYS.SESSION, data.sessionToken);
        } catch (_) {}
      }
      state.userEmail = data.userEmail || '';
      try {
        if (state.userEmail) storage.setItem(STORAGE_KEYS.USER_EMAIL, state.userEmail);
      } catch (_) {}
      updateSyncStatusUI('authenticated via session cookie (cloud d1 synced)', state.userEmail, true);
      if (Array.isArray(data.feeds) && data.feeds.length > 0) {
        state.feeds = data.feeds.map(f => f.feed_url);
        saveFeedsToStorage();
      }
      applyBundledD1State(data);
      await refreshAllFeeds();
      return;
    } else {
      console.warn('Sync server responded with', res.status);
      elements.authModal.classList.add('hidden');
      updateSyncStatusUI('cloud sync temporarily unavailable — listening offline', state.userEmail, !!state.sessionToken);
      if (!state.feeds || state.feeds.length === 0) {
        loadFeedsFromStorage();
      }
      loadCacheFromStorage();
      if (state.feeds.length > 0) {
        refreshAllFeeds();
      } else {
        renderTimeline();
      }
      return;
    }
  } catch (e) {
    console.warn('Auth check network error:', e);
    elements.authModal.classList.add('hidden');
    updateSyncStatusUI('cloud sync temporarily unavailable — listening offline', state.userEmail, !!state.sessionToken);
    if (!state.feeds || state.feeds.length === 0) {
      loadFeedsFromStorage();
    }
    loadCacheFromStorage();
    if (state.feeds.length > 0) {
      refreshAllFeeds();
    } else {
      renderTimeline();
    }
    return;
  }

  elements.authModal.classList.add('hidden');
  updateSyncStatusUI('logged in as guest / local device storage', '', false);
  if (state.feeds.length > 0) {
    refreshAllFeeds();
  } else {
    renderTimeline();
  }
}

function updateSyncStatusUI(statusText, email = '', isConnected = false) {
  if (elements.userSyncStatus) {
    elements.userSyncStatus.textContent = (statusText || '').toLowerCase();
  }
  if (elements.statusIndicator) {
    if (isConnected) {
      elements.statusIndicator.classList.add('online');
    } else {
      elements.statusIndicator.classList.remove('online');
    }
  }
  if (elements.userEmailLabel) {
    elements.userEmailLabel.textContent = (email || (isConnected ? 'logged in' : 'guest mode')).toLowerCase();
  }
  if (elements.btnAccountToggle) {
    elements.btnAccountToggle.textContent = isConnected ? 'sign out' : 'log in';
  }
  const cardDelete = document.getElementById('card-delete-account');
  if (cardDelete) {
    cardDelete.style.display = isConnected ? 'block' : 'none';
  }
}

function getWebmailProvider(email) {
  if (!email || !email.includes('@')) return null;
  const domain = email.split('@')[1].toLowerCase().trim();
  if (domain === 'gmail.com' || domain === 'googlemail.com') {
    return { name: 'Gmail', url: 'https://mail.google.com/' };
  }
  if (['outlook.com', 'hotmail.com', 'live.com', 'msn.com', 'outlook.de'].includes(domain)) {
    return { name: 'Outlook', url: 'https://outlook.live.com/mail/' };
  }
  if (domain === 'ue-germany.de') {
    return { name: 'Outlook (UE Germany)', url: 'https://outlook.office.com/mail/' };
  }
  if (['yahoo.com', 'ymail.com', 'yahoo.de', 'yahoo.fr', 'yahoo.co.uk'].includes(domain)) {
    return { name: 'Yahoo Mail', url: 'https://mail.yahoo.com/' };
  }
  if (['icloud.com', 'me.com', 'mac.com'].includes(domain)) {
    return { name: 'iCloud Mail', url: 'https://www.icloud.com/mail/' };
  }
  if (domain === 'proton.me' || domain === 'protonmail.com') {
    return { name: 'Proton Mail', url: 'https://mail.proton.me/' };
  }
  if (domain.startsWith('gmx.')) {
    return { name: 'GMX', url: 'https://www.gmx.net/' };
  }
  if (domain === 'web.de') {
    return { name: 'WEB.DE', url: 'https://web.de/' };
  }
  if (domain === 't-online.de') {
    return { name: 'Telekom Mail', url: 'https://email.t-online.de/' };
  }
  if (domain === 'posteo.de' || domain === 'posteo.net' || domain === 'posteo.org') {
    return { name: 'Posteo', url: 'https://posteo.de/' };
  }
  if (domain === 'mailbox.org') {
    return { name: 'mailbox.org', url: 'https://mailbox.org/' };
  }
  if (domain === 'freenet.de') {
    return { name: 'freenet Mail', url: 'https://email.freenet.de/' };
  }
  if (domain === 'zoho.com' || domain === 'zoho.eu') {
    return { name: 'Zoho Mail', url: 'https://mail.zoho.com/' };
  }
  if (domain === 'fastmail.com' || domain === 'fastmail.fm') {
    return { name: 'Fastmail', url: 'https://app.fastmail.com/' };
  }
  if (domain === 'ionos.de' || domain === 'ionos.com' || domain === 'online.de') {
    return { name: 'IONOS Webmail', url: 'https://mail.ionos.de/' };
  }
  return { name: domain, url: `https://${domain}` };
}

async function submitMagicAuth() {
  const email = elements.magicEmailInput.value.trim();
  if (!email || !email.includes('@')) return;

  elements.magicStatusMsg.style.display = 'block';
  elements.magicStatusMsg.style.color = '#a5b4fc';
  elements.magicStatusMsg.textContent = 'Sending sign-in link...';

  try {
    const res = await fetch('/api/auth/send-link', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, origin: window.location.origin })
    });

    let data = {};
    try {
      data = await res.json();
    } catch (e) {
      data = { error: `Server error (${res.status}). Please try again in a moment.` };
    }
    if (!res.ok || data.error) throw new Error(data.error || 'Failed to send link');

    const provider = getWebmailProvider(email);
    let content = '<div style="margin-top: 6px; line-height: 1.45;">';
    content += '<div style="color: #cbd5e1;">Sign-in link sent! Check your email inbox (and spam folder) to complete sign in.</div>';

    if (data.verifyUrl) {
      content += `<div style="margin-top: 10px;"><span style="color:#22c55e; font-weight: 600;">${escapeHtml(data.sandboxNotice || data.devNotice || 'Direct Login:')}</span> <a href="${escapeHtml(data.verifyUrl)}" style="color:#60a5fa; text-decoration:underline; font-weight: 500;">Click here to sign in instantly</a></div>`;
    }

    if (provider) {
      content += `<div style="margin-top: 12px;">
        <a href="${escapeHtml(provider.url)}" target="_blank" rel="noopener noreferrer" class="btn btn-primary" style="display: flex; align-items: center; justify-content: center; gap: 8px; text-decoration: none; padding: 9px 16px; font-size: 0.9rem; border-radius: 8px; font-weight: 600;">
          <span>Open ${escapeHtml(provider.name)}</span>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>
        </a>
      </div>`;
    }
    content += '</div>';
    elements.magicStatusMsg.innerHTML = content;
  } catch (e) {
    elements.magicStatusMsg.style.color = '#ef4444';
    elements.magicStatusMsg.textContent = `Error: ${e.message}`;
  }
}

// ─────────────────────────────────────────────────────────────────────────
// SECTION 8 · Cloud Sync (Cloudflare D1)
// API endpoints: /api/sync/feeds (GET/POST/DELETE), /api/sync/position
// Auth header: X-Session-Token (magic link) or session cookie.
// syncFeedsWithD1 — pulls remote feeds + positions on login/startup.
// ─────────────────────────────────────────────────────────────────────────

async function syncFeedsWithD1() {
  showStatus('syncing feeds & playback state with cloud d1...');
  try {
    const headers = {};
    if (state.sessionToken) headers['X-Session-Token'] = state.sessionToken;

    const res = await fetch('/api/sync/feeds?bundle=1', { headers, credentials: 'include' });

    if (res.status === 401) {
      console.warn('D1 sync returned 401. Preserving offline session & library.');
      updateSyncStatusUI('cloud sync temporarily unavailable — listening offline', state.userEmail, !!state.sessionToken);
      if (!state.feeds || state.feeds.length === 0) {
        loadFeedsFromStorage();
      }
      loadCacheFromStorage();
      if (state.feeds && state.feeds.length > 0) {
        refreshAllFeeds();
      } else {
        renderTimeline();
      }
      return;
    }

    if (!res.ok) {
      console.warn('D1 sync HTTP error:', res.status);
      updateSyncStatusUI('cloud sync temporarily unavailable — listening offline', state.userEmail, true);
      if (!state.feeds || state.feeds.length === 0) {
        loadFeedsFromStorage();
      }
      loadCacheFromStorage();
      if (state.feeds && state.feeds.length > 0) {
        refreshAllFeeds();
      } else {
        renderTimeline();
      }
      return;
    }

    const data = await res.json();
    if (data.sessionToken && !state.sessionToken) {
      state.sessionToken = data.sessionToken;
      try {
        storage.setItem(STORAGE_KEYS.SESSION, data.sessionToken);
      } catch (_) {}
    }
    if (data.userEmail) {
      state.userEmail = data.userEmail;
      try {
        storage.setItem(STORAGE_KEYS.USER_EMAIL, data.userEmail);
      } catch (_) {}
    }
    updateSyncStatusUI('cloud d1 synced', state.userEmail, true);

    const remoteFeeds = Array.isArray(data.feeds) ? data.feeds : [];
    if (remoteFeeds.length > 0 || !state.feeds || state.feeds.length === 0) {
      state.feeds = remoteFeeds.map(f => f.feed_url);
      saveFeedsToStorage();
    }

    applyBundledD1State(data);
    await refreshAllFeeds();

  } catch (err) {
    console.warn('D1 sync warning:', err);
    updateSyncStatusUI('cloud sync temporarily unavailable — listening offline', state.userEmail, true);
    if (!state.feeds || state.feeds.length === 0) {
      loadFeedsFromStorage();
    }
    loadCacheFromStorage();
    if (state.feeds && state.feeds.length > 0) {
      refreshAllFeeds();
    } else {
      renderTimeline();
    }
  } finally {
    hideStatus();
  }
}

async function saveFeedToD1(feedUrl, title = '', artwork = '') {
  try {
    const headers = { 'Content-Type': 'application/json' };
    if (state.sessionToken) headers['X-Session-Token'] = state.sessionToken;
    await fetch('/api/sync/feeds', {
      method: 'POST',
      headers,
      credentials: 'include',
      body: JSON.stringify({ feedUrl, title, artwork })
    });
  } catch (e) {}
}

async function removeFeedFromD1(feedUrl) {
  try {
    const headers = { 'Content-Type': 'application/json' };
    if (state.sessionToken) headers['X-Session-Token'] = state.sessionToken;
    await fetch('/api/sync/feeds', {
      method: 'DELETE',
      headers,
      credentials: 'include',
      body: JSON.stringify({ feedUrl })
    });
  } catch (e) {}
}

// ─────────────────────────────────────────────────────────────────────────
// SECTION 9 · Playback Position Sync
// state.playbackPositions: { [guid]: { position, completed, lastListenedAt } }
// Saved locally every 8 s and immediately on pause/skip/completion.
// Also synced to/from Cloudflare D1 via /api/sync/position.
// ─────────────────────────────────────────────────────────────────────────

function savePositionsToStorage() {
  try {
    storage.setItem(STORAGE_KEYS.POSITIONS, JSON.stringify(state.playbackPositions));
    if (state.currentEpisode) {
      storage.setItem(STORAGE_KEYS.LAST_EPISODE, JSON.stringify(state.currentEpisode));
    }
  } catch (e) {}
}

function loadPositionsFromStorage() {
  try {
    const saved = storage.getItem(STORAGE_KEYS.POSITIONS);
    if (saved) {
      state.playbackPositions = JSON.parse(saved);
    }
  } catch (e) {}
}

function restoreLastActiveEpisode() {
  try {
    const raw = storage.getItem(STORAGE_KEYS.LAST_EPISODE);
    if (!raw) return;
    const lastEp = JSON.parse(raw);
    if (!lastEp || !lastEp.guid) return;

    state.currentEpisode = lastEp;
    state.playbackStatus = 'paused';
    
    if (elements.playerTitle) elements.playerTitle.textContent = lastEp.title || '';
    if (elements.playerPodcast) elements.playerPodcast.textContent = lastEp.podcastTitle || '';
    if (elements.playerArtwork) {
      elements.playerArtwork.src = lastEp.artwork || FALLBACK_ARTWORK;
    }
    if (elements.miniTitle) elements.miniTitle.textContent = lastEp.title || '';
    if (elements.miniPodcast) elements.miniPodcast.textContent = lastEp.podcastTitle || '';
    if (elements.miniArtwork) {
      elements.miniArtwork.src = lastEp.artwork || FALLBACK_ARTWORK;
    }

    if (elements.playerBar) {
      elements.playerBar.classList.add('active-episode');
    }
    document.body.classList.add('has-active-episode');

    const savedPos = state.playbackPositions[lastEp.guid];
    const curSec = (savedPos && savedPos.position) ? savedPos.position : 0;
    let durSec = 0;
    if (lastEp.duration && typeof parseDurationSeconds === 'function') {
      durSec = parseDurationSeconds(lastEp.duration);
    }
    if (elements.currentTimeLabel) elements.currentTimeLabel.textContent = formatTime(curSec);
    if (elements.totalDurationLabel && durSec > 0) elements.totalDurationLabel.textContent = formatTime(durSec);

    // Pre-load audio stream & set seek point so hitting play instantly starts audio
    if (lastEp.audioUrl && elements.audio) {
      state.activeEngine = 'audio';
      let streamUrl = lastEp.audioUrl;
      const isDownloaded = !!(state.downloadedEpisodes && state.downloadedEpisodes[lastEp.guid]);
      if (isDownloaded) {
        streamUrl = `${streamUrl}${streamUrl.includes('?') ? '&' : '?'}offline=1`;
      } else if (window.location.protocol === 'https:' && streamUrl.startsWith('http://')) {
        streamUrl = `/api/audio-proxy?url=${encodeURIComponent(streamUrl)}`;
      }
      state.pendingStartTime = curSec > 0 ? curSec : null;
      elements.audio.src = streamUrl;
      elements.audio.playbackRate = state.playbackSpeed || 1.0;
      elements.audio.preload = 'metadata';
    }

    const savedCollapsed = storage.getItem('anypod_player_collapsed');
    const shouldCollapse = savedCollapsed === 'true';
    setPlayerCollapsed(shouldCollapse, false);
    syncMediaSession(lastEp);
    syncPlaybackButtons();
    updatePlayerFavButton();

    // Render waveform
    state.episodeTimeline.guid = lastEp.guid;
    state.episodeTimeline.duration = durSec || 1800;
    state.episodeTimeline.progressPct = (durSec > 0 && curSec > 0) ? (curSec / durSec) : 0;
    setTimeout(() => {
      initOrLoadEpisodeTimeline(lastEp, durSec || 1800);
      renderWaveformChart();
    }, 50);
    setTimeout(() => {
      renderWaveformChart();
    }, 250);
  } catch (_) {}
}

async function loadPlaybackPositionsFromD1() {
  try {
    const headers = {};
    if (state.sessionToken) headers['X-Session-Token'] = state.sessionToken;
    const res = await fetch('/api/sync/position', { headers, credentials: 'include' });
    if (res.ok) {
      const data = await res.json();
      const remotePositions = data.positions || {};

      // Merge smartly: only let D1 overwrite if remote timestamp is newer
      const merged = { ...state.playbackPositions };
      for (const [guid, rPos] of Object.entries(remotePositions)) {
        const lPos = merged[guid];
        if (!lPos || (rPos.lastListenedAt || 0) >= (lPos.lastListenedAt || 0)) {
          merged[guid] = rPos;
        }
      }
      state.playbackPositions = merged;
      savePositionsToStorage();
    }
  } catch (e) {}
  renderContinueShelf();
  updateFilterBadges();
}

let _lastCloudSyncTime = 0;
let _lastSyncedGuid = null;
let _lastSyncedPos = -1;

async function savePlaybackPositionToD1(episodeGuid, positionSeconds, completed = false, immediate = false) {
  if (!episodeGuid) return;

  // 1. Instant local storage update (instant crash-proofing, zero network)
  state.playbackPositions[episodeGuid] = {
    position: positionSeconds,
    completed: completed ? 1 : 0,
    lastListenedAt: Math.floor(Date.now() / 1000)
  };
  savePositionsToStorage();

  // 2. Only update UI DOM when screen is visible (without re-rendering DOM tree every 8s)
  if (!document.hidden) {
    if (completed) {
      renderContinueShelf();
      updateFilterBadges();
    } else if (typeof updateCardPlaybackProgress === 'function') {
      updateCardPlaybackProgress(episodeGuid, positionSeconds);
    }
  }

  if (!state.sessionToken) return;

  // 3. Throttle remote HTTP sync:
  // - If completed: always sync immediately
  // - If immediate (pause, pagehide, tab hidden): sync if progress advanced >= 3s or different episode
  // - Periodic: only sync once every 60s
  const now = Date.now();
  const posDiff = Math.abs(positionSeconds - _lastSyncedPos);
  const isDifferentEpisode = _lastSyncedGuid !== episodeGuid;

  if (!completed) {
    if (immediate) {
      if (!isDifferentEpisode && posDiff < 3) {
        return; // No meaningful progress since last sync
      }
    } else if (now - _lastCloudSyncTime < 60000) {
      return; // Periodic interval hasn't reached 60s
    }
  }

  _lastCloudSyncTime = now;
  _lastSyncedGuid = episodeGuid;
  _lastSyncedPos = completed ? -1 : positionSeconds;

  try {
    const headers = { 'Content-Type': 'application/json' };
    if (state.sessionToken) headers['X-Session-Token'] = state.sessionToken;
    await fetch('/api/sync/position', {
      method: 'POST',
      headers,
      credentials: 'include',
      keepalive: true,
      body: JSON.stringify({ episodeGuid, positionSeconds, completed })
    });
  } catch (_) {}
}

// ─────────────────────────────────────────────────────────────────────────
// SECTION 10 · Feed Storage & Cache
// state.feeds — ordered array of RSS feed URLs (strings).
// state.feedMetadata — { [feedUrl]: { title, artwork, episodesCount, … } }
// state.allEpisodes — flat array of all episodes across all feeds.
// Cache is capped at 2000 episodes to avoid localStorage quota issues.
// ─────────────────────────────────────────────────────────────────────────

function loadFeedsFromStorage() {
  try {
    const saved = storage.getItem(STORAGE_KEYS.FEEDS) || storage.getItem('podcast_pulse_feeds');
    state.feeds = saved ? JSON.parse(saved) : [];
    updateFeedCountUI();
  } catch (e) {
    state.feeds = [];
  }
  loadMutedFeedsFromStorage();
}

function loadMutedFeedsFromStorage() {
  try {
    const saved = storage.getItem(STORAGE_KEYS.MUTED_FEEDS);
    state.mutedFeeds = saved ? JSON.parse(saved) : [];
    if (!Array.isArray(state.mutedFeeds)) state.mutedFeeds = [];
  } catch (e) {
    state.mutedFeeds = [];
  }
}

function saveMutedFeedsToStorage() {
  try {
    storage.setItem(STORAGE_KEYS.MUTED_FEEDS, JSON.stringify(state.mutedFeeds));
  } catch (e) {}
}

function isFeedMuted(url) {
  return Array.isArray(state.mutedFeeds) && state.mutedFeeds.includes(url);
}

function toggleMuteFeed(url) {
  if (!url) return;
  if (isFeedMuted(url)) {
    state.mutedFeeds = state.mutedFeeds.filter(u => u !== url);
  } else {
    if (!state.mutedFeeds.includes(url)) {
      state.mutedFeeds.push(url);
    }
  }
  saveMutedFeedsToStorage();
  processAndSortEpisodes();
  renderTimeline();
  renderFeedsGrid();
  if (state.activeFeedDetailUrl === url) {
    renderFeedDetail(url);
  }
}

function saveFeedsToStorage() {
  try {
    storage.setItem(STORAGE_KEYS.FEEDS, JSON.stringify(state.feeds));
    updateFeedCountUI();
  } catch (e) {}
}

function updateFeedCountUI() {
  if (elements.feedCount) {
    elements.feedCount.textContent = state.feeds.length;
  }
  updateDockVisibility();
}

function updateDockVisibility() {
  if (!elements.bottomActionDock) return;
  const isTimelineActive = elements.tabTimeline && elements.tabTimeline.classList.contains('active');
  const isDetailActive = !!state.activeFeedDetailUrl;
  const hasEpisodes = state.allEpisodes && state.allEpisodes.length > 0;

  if ((isTimelineActive || isDetailActive) && hasEpisodes) {
    elements.bottomActionDock.classList.remove('dock-hidden');
  } else {
    elements.bottomActionDock.classList.add('dock-hidden');
  }
}

// IndexedDB Persistent Store for large libraries (1,000+ items without 5MB quota limits)
const idbStore = window.AnypodShared.idbStore;

function loadCacheFromStorage() {
  // 1. Fast synchronous load from localStorage for instant initial paint (0ms delay)
  try {
    const cachedEps = storage.getItem(STORAGE_KEYS.CACHED_EPISODES);
    const cachedMeta = storage.getItem(STORAGE_KEYS.CACHED_METADATA);
    if (cachedEps) {
      state.allEpisodes = JSON.parse(cachedEps);
    }
    if (cachedMeta) {
      state.feedMetadata = JSON.parse(cachedMeta);
    }
    if (state.allEpisodes && state.allEpisodes.length > 0) {
      processAndSortEpisodes();
      renderTimeline();
      renderContinueShelf();
      renderFeedsGrid();
    }
  } catch (e) {}

  // 2. Asynchronous deep hydration from IndexedDB (handles full 1,000+ episode libraries)
  idbStore.get(STORAGE_KEYS.CACHED_EPISODES).then(idbEps => {
    if (Array.isArray(idbEps) && idbEps.length > 0) {
      const currentCount = state.allEpisodes ? state.allEpisodes.length : 0;
      if (idbEps.length >= currentCount) {
        state.allEpisodes = idbEps;
        processAndSortEpisodes();
        renderTimeline();
        renderContinueShelf();
        renderFeedsGrid();
        if (state.activeFeedDetailUrl && typeof renderFeedDetail === 'function') {
          renderFeedDetail(state.activeFeedDetailUrl);
        }
      }
    }
  }).catch(() => {});

  idbStore.get(STORAGE_KEYS.CACHED_METADATA).then(idbMeta => {
    if (idbMeta && typeof idbMeta === 'object') {
      state.feedMetadata = { ...idbMeta, ...state.feedMetadata };
    }
  }).catch(() => {});
}

function saveCacheToStorage() {
  if (!state.allEpisodes || state.allEpisodes.length === 0) return;

  // 1. Save full, unbounded episodes & metadata to IndexedDB (safe from 5MB quota)
  idbStore.set(STORAGE_KEYS.CACHED_EPISODES, state.allEpisodes).catch(() => {});
  if (state.feedMetadata) {
    idbStore.set(STORAGE_KEYS.CACHED_METADATA, state.feedMetadata).catch(() => {});
  }

  // 2. Save lean/compact slice to localStorage for synchronous 0ms startup
  try {
    const leanEps = state.allEpisodes.slice(0, 1500).map(ep => ({
      guid: ep.guid,
      videoId: ep.videoId,
      title: ep.title,
      podcastTitle: ep.podcastTitle,
      artwork: ep.artwork,
      audioUrl: ep.audioUrl,
      duration: ep.duration,
      pubDate: ep.pubDate,
      timestamp: ep.timestamp,
      isYouTube: ep.isYouTube,
      feedUrl: ep.feedUrl,
      description: (ep.description || '').slice(0, 200)
    }));
    storage.setItem(STORAGE_KEYS.CACHED_EPISODES, JSON.stringify(leanEps));
    if (state.feedMetadata) {
      storage.setItem(STORAGE_KEYS.CACHED_METADATA, JSON.stringify(state.feedMetadata));
    }
  } catch (e) {
    // If localStorage is full, IndexedDB already holds the complete dataset
  }
}

