'use strict';

// ─────────────────────────────────────────────────────────────────────────
// SECTION 11 · Queue ("Up Next")
// state.queue is an ordered array of episode objects.
// Persisted minimally (guid + playback fields only) to localStorage.
// Queue items are consumed by playNextEpisode (section 22).
// The queue modal supports drag-and-drop + touch reordering.
// ─────────────────────────────────────────────────────────────────────────

function loadQueueFromStorage() {
  try {
    const stored = storage.getItem(STORAGE_KEYS.QUEUE);
    if (stored) {
      state.queue = JSON.parse(stored);
      if (!Array.isArray(state.queue)) {
        state.queue = [];
      }
    } else {
      state.queue = [];
    }
  } catch (e) {
    state.queue = [];
  }
}

function saveQueueToStorage() {
  try {
    const minimalQueue = state.queue.map(ep => ({
      guid: ep.guid,
      title: ep.title,
      podcastTitle: ep.podcastTitle,
      audioUrl: ep.audioUrl,
      artwork: ep.artwork,
      duration: ep.duration,
      isYouTube: !!ep.isYouTube,
      videoId: ep.videoId,
      playlistId: ep.playlistId,
      feedUrl: ep.feedUrl,
      timestamp: ep.timestamp
    }));
    storage.setItem(STORAGE_KEYS.QUEUE, JSON.stringify(minimalQueue));
  } catch (e) {}
}

function isEpisodeQueued(guid) {
  if (!state.queue || !Array.isArray(state.queue)) return false;
  return state.queue.some(ep => ep.guid === guid);
}

function toggleEpisodeQueue(episode) {
  const idx = state.queue.findIndex(ep => ep.guid === episode.guid);
  if (idx !== -1) {
    state.queue.splice(idx, 1);
  } else {
    state.queue.push(episode);
  }
  saveQueueToStorage();
  updateQueueUI();
}

function removeFromQueue(guid) {
  state.queue = state.queue.filter(ep => ep.guid !== guid);
  saveQueueToStorage();
  updateQueueUI();
}

function clearQueue() {
  state.queue = [];
  saveQueueToStorage();
  updateQueueUI();
}

function updateQueueUI() {
  updatePlayerStatusBadges();
  const count = (state.queue && Array.isArray(state.queue)) ? state.queue.length : 0;
  if (elements.queueBadge) {
    if (count > 0) {
      elements.queueBadge.textContent = count;
      elements.queueBadge.classList.remove('hidden');
    } else {
      elements.queueBadge.classList.add('hidden');
    }
  }

  if (elements.miniOpenQueue) {
    if (count > 0) {
      elements.miniOpenQueue.classList.remove('hidden');
    } else {
      elements.miniOpenQueue.classList.add('hidden');
    }
  }

  if (elements.miniQueueDot) {
    if (count > 0) {
      elements.miniQueueDot.classList.remove('hidden');
    } else {
      elements.miniQueueDot.classList.add('hidden');
    }
  }

  if (elements.queueCountBadge) {
    elements.queueCountBadge.textContent = count === 1 ? '1 episode' : `${count} episodes`;
  }

  const cards = document.querySelectorAll('.episode-card');
  cards.forEach(card => {
    const guid = card.dataset.guid;
    const qBtn = card.querySelector('.btn-queue-ep');
    if (qBtn) {
      const inQueue = isEpisodeQueued(guid);
      if (inQueue) {
        qBtn.classList.add('is-queued');
        qBtn.innerHTML = CARD_ICONS.QUEUE_ADDED;
        qBtn.title = 'Remove from Up Next';
      } else {
        qBtn.classList.remove('is-queued');
        qBtn.innerHTML = CARD_ICONS.QUEUE;
        qBtn.title = 'Add to Up Next';
      }
    }
  });

  if (elements.queueModal && !elements.queueModal.classList.contains('hidden')) {
    renderQueueModalContent();
  }
}

function getAutoQueueEpisodes(limit = 10) {
  if (!state.currentEpisode) return [];
  const currentGuid = state.currentEpisode.guid;
  const queuedGuids = new Set((state.queue || []).map(ep => ep.guid));
  queuedGuids.add(currentGuid);

  const isCurrentYouTube = Boolean(state.currentEpisode.isYouTube || state.currentEpisode.videoId || state.currentEpisode.playlistId || state.activeEngine === 'youtube');

  // Engine Separation Guard:
  // 1. If currently playing native audio, keep autoplaying native audio (STRICTLY EXCLUDE YouTube to prevent cross-engine stalls).
  // 2. If currently playing YouTube, keep autoplaying YouTube videos seamlessly (stay within YouTube playlist/channel).
  const isCompatible = (ep) => {
    if (!ep || !ep.guid || queuedGuids.has(ep.guid)) return false;
    const isYt = Boolean(ep.isYouTube || ep.videoId || ep.playlistId);
    if (isCurrentYouTube) {
      return isYt;
    } else {
      return !isYt;
    }
  };

  // 0. Shuffle Mode: Random selection from current playback context or pool
  if (state.isShuffle) {
    let pool = [];
    if (state.playbackContext && Array.isArray(state.playbackContext.items) && state.playbackContext.items.length > 0) {
      pool = state.playbackContext.items.filter(isCompatible);
    } else if (state.currentEpisode.feedUrl) {
      pool = state.allEpisodes.filter(ep => ep.feedUrl === state.currentEpisode.feedUrl && isCompatible(ep));
    }
    if (pool.length === 0 && state.filteredEpisodes.length > 0) {
      pool = state.filteredEpisodes.filter(isCompatible);
    }
    if (pool.length === 0) {
      pool = state.allEpisodes.filter(isCompatible);
    }

    // If all unqueued items have been exhausted, fall back to any compatible track from context except currently playing
    if (pool.length === 0) {
      const fullList = (state.playbackContext?.items?.length) ? state.playbackContext.items : state.allEpisodes;
      pool = fullList.filter(ep => ep.guid !== currentGuid && isCompatible(ep));
    }

    const shuffled = [...pool];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled.slice(0, limit);
  }

  let candidates = [];

  const pushCandidates = (list) => {
    for (const ep of list) {
      if (candidates.length >= limit) break;
      if (isCompatible(ep) && !candidates.some(c => c.guid === ep.guid)) {
        candidates.push(ep);
      }
    }
  };

  // 1. Context-specific sequential queueing (e.g. from Feed detail, search, playlist)
  if (state.playbackContext && Array.isArray(state.playbackContext.items) && state.playbackContext.items.length > 0) {
    const ctxItems = state.playbackContext.items;
    const curIdx = ctxItems.findIndex(e => e.guid === currentGuid);
    if (curIdx !== -1 && curIdx + 1 < ctxItems.length) {
      pushCandidates(ctxItems.slice(curIdx + 1));
    }
  }

  // 2. Same Feed Continuation:
  // If the user is listening to an episode of a podcast show, prioritize remaining episodes from the SAME show!
  if (candidates.length < limit && state.currentEpisode.feedUrl) {
    const sameFeedEpisodes = state.allEpisodes.filter(ep => ep.feedUrl === state.currentEpisode.feedUrl);
    const curFeedIdx = sameFeedEpisodes.findIndex(e => e.guid === currentGuid);
    if (curFeedIdx !== -1 && curFeedIdx + 1 < sameFeedEpisodes.length) {
      pushCandidates(sameFeedEpisodes.slice(curFeedIdx + 1));
    }
    // If we're at the end of subsequent episodes in the feed, check for any other unplayed episodes in the same show
    if (candidates.length < limit) {
      const unplayedInFeed = sameFeedEpisodes.filter(ep => {
        const pos = state.playbackPositions[ep.guid];
        return !pos || !pos.completed;
      });
      pushCandidates(unplayedInFeed);
    }
  }

  // 3. Fallback: Continue list if in continue mode
  if (candidates.length < limit && state.filterMode === 'continue') {
    const continueList = state.allEpisodes.filter(ep => {
      const pos = state.playbackPositions[ep.guid];
      return (!pos || !pos.completed) && (pos && pos.position > 2);
    });
    const idx = continueList.findIndex(e => e.guid === currentGuid);
    if (idx !== -1) {
      pushCandidates(continueList.slice(idx + 1));
    } else {
      pushCandidates(continueList);
    }
  }

  // 4. Fallback: Filtered timeline list
  if (candidates.length < limit && state.filteredEpisodes.length > 0) {
    const idx = state.filteredEpisodes.findIndex(e => e.guid === currentGuid);
    if (idx !== -1) {
      pushCandidates(state.filteredEpisodes.slice(idx + 1));
    } else {
      pushCandidates(state.filteredEpisodes);
    }
  }

  // 5. Fallback: Global episodes list
  if (candidates.length < limit && state.allEpisodes.length > 0) {
    const allIdx = state.allEpisodes.findIndex(e => e.guid === currentGuid);
    if (allIdx !== -1) {
      pushCandidates(state.allEpisodes.slice(allIdx + 1));
    }
    if (candidates.length < limit) {
      pushCandidates(state.allEpisodes);
    }
  }

  return candidates.slice(0, limit);
}


function renderQueueModalContent() {
  if (!elements.queueNowPlayingContainer || !elements.queueItemsContainer) return;

  if (state.currentEpisode) {
    const cur = state.currentEpisode;
    elements.queueNowPlayingContainer.innerHTML = `
      <div class="queue-now-playing-card">
        <div class="queue-now-playing-label">now playing</div>
        <div class="queue-now-playing-row">
          <img class="queue-item-artwork" src="${escapeHtml(cur.artwork || FALLBACK_ARTWORK)}" alt="">
          <div class="queue-item-info">
            <div class="queue-item-title">${escapeHtml(cur.title)}</div>
            <div class="queue-item-meta">${cur.isYouTube ? 'YouTube' : escapeHtml(cur.podcastTitle)}</div>
          </div>
          <div class="queue-now-playing-indicator">
            <span></span><span></span><span></span>
          </div>
        </div>
      </div>
    `;
  } else {
    elements.queueNowPlayingContainer.innerHTML = '';
  }

  elements.queueItemsContainer.innerHTML = '';

  const hasManualQueue = state.queue && state.queue.length > 0;
  let draggedIndex = null;
  let cachedRowRects = new Map();

  if (hasManualQueue) {
    const manualHeader = document.createElement('div');
    manualHeader.className = 'queue-section-header';
    manualHeader.innerHTML = `<span>Up Next (${state.queue.length})</span>
    <button class="btn-text-subtle" id="btn-clear-queue">clear all</button>`;
  
    elements.queueItemsContainer.appendChild(manualHeader);

    manualHeader.querySelector('#btn-clear-queue')?.addEventListener('click', clearQueue);
    
    state.queue.forEach((ep, idx) => {
      const row = document.createElement('div');
      row.className = 'queue-item-row';
      row.dataset.guid = ep.guid;
      row.dataset.index = idx;
      row.draggable = true;
      row.innerHTML = `
        <span class="queue-drag-handle" title="Drag to reorder">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="5" r="1"></circle><circle cx="9" cy="12" r="1"></circle><circle cx="9" cy="19" r="1"></circle><circle cx="15" cy="5" r="1"></circle><circle cx="15" cy="12" r="1"></circle><circle cx="15" cy="19" r="1"></circle></svg>
        </span>
        <span class="queue-item-index">${idx + 1}</span>
        <img class="queue-item-artwork" src="${escapeHtml(ep.artwork || FALLBACK_ARTWORK)}" alt="">
        <div class="queue-item-info">
          <div class="queue-item-title">${escapeHtml(ep.title)}</div>
          <div class="queue-item-meta">${escapeHtml(ep.podcastTitle)}${ep.duration ? ` • ${escapeHtml(ep.duration)}` : ''}</div>
        </div>
        <div class="queue-item-actions">
          <button class="btn-queue-item-play" title="Play Now">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="6 4 20 12 6 20 6 4"></polygon></svg>
          </button>
          <button class="btn-queue-item-remove" title="Remove from Queue">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
          </button>
        </div>
      `;

      row.addEventListener('dragstart', (e) => {
        draggedIndex = idx;
        cachedRowRects.clear();
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', String(idx));
        setTimeout(() => row.classList.add('is-dragging'), 0);
      });

      row.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        let rect = cachedRowRects.get(row);
        if (!rect) {
          rect = row.getBoundingClientRect();
          cachedRowRects.set(row, rect);
        }
        const midY = rect.top + rect.height / 2;
        const isAbove = e.clientY < midY;
        row.classList.toggle('drag-over-above', isAbove);
        row.classList.toggle('drag-over-below', !isAbove);
      });

      row.addEventListener('dragleave', () => {
        row.classList.remove('drag-over-above', 'drag-over-below');
      });

      row.addEventListener('drop', (e) => {
        e.preventDefault();
        row.classList.remove('drag-over-above', 'drag-over-below');
        const fromIdx = draggedIndex !== null ? draggedIndex : parseInt(e.dataTransfer.getData('text/plain'), 10);
        const toIdx = idx;

        if (fromIdx !== null && !isNaN(fromIdx) && fromIdx !== toIdx) {
          const item = state.queue.splice(fromIdx, 1)[0];
          state.queue.splice(toIdx, 0, item);
          saveQueueToStorage();
          updateQueueUI();
          renderQueueModalContent();
        }
      });

      row.addEventListener('dragend', () => {
        row.classList.remove('is-dragging', 'drag-over-above', 'drag-over-below');
        draggedIndex = null;
        cachedRowRects.clear();
      });

      const handle = row.querySelector('.queue-drag-handle');
      if (handle) {
        let touchCurrentRow = null;

        handle.addEventListener('touchstart', () => {
          draggedIndex = idx;
          row.classList.add('is-dragging');
        }, { passive: true });

        handle.addEventListener('touchmove', (e) => {
          const touchY = e.touches[0].clientY;
          const target = document.elementFromPoint(e.touches[0].clientX, touchY);
          const targetRow = target ? target.closest('.queue-item-row') : null;
          if (targetRow && targetRow !== touchCurrentRow && targetRow !== row) {
            if (touchCurrentRow) touchCurrentRow.classList.remove('drag-over-above');
            touchCurrentRow = targetRow;
            targetRow.classList.add('drag-over-above');
          }
        }, { passive: true });

        handle.addEventListener('touchend', () => {
          row.classList.remove('is-dragging');
          if (touchCurrentRow && draggedIndex !== null) {
            touchCurrentRow.classList.remove('drag-over-above');
            const toIdx = parseInt(touchCurrentRow.dataset.index, 10);
            if (!isNaN(toIdx) && toIdx !== draggedIndex) {
              const item = state.queue.splice(draggedIndex, 1)[0];
              state.queue.splice(toIdx, 0, item);
              saveQueueToStorage();
              updateQueueUI();
              renderQueueModalContent();
            }
          }
          draggedIndex = null;
          touchCurrentRow = null;
        });
      }

      row.querySelector('.btn-queue-item-play').addEventListener('click', (e) => {
        e.stopPropagation();
        removeFromQueue(ep.guid);
        playEpisode(ep, null, state.playbackContext);
      });

      row.querySelector('.btn-queue-item-remove').addEventListener('click', (e) => {
        e.stopPropagation();
        removeFromQueue(ep.guid);
      });

      elements.queueItemsContainer.appendChild(row);
    });  
  }

  if (state.autoplayEnabled) {
    const autoEpisodes = getAutoQueueEpisodes(8);

    if (autoEpisodes.length > 0) {
      const ctxLabel = state.playbackContext?.title || 'Timeline';
      const autoHeader = document.createElement('div');
      autoHeader.className = 'queue-section-header auto-queue-header';
      autoHeader.style.marginTop = hasManualQueue ? '1.25rem' : '0.25rem';
      autoHeader.innerHTML = `
        <span>Autoplay Next</span>
        <span class="queue-context-badge">${escapeHtml(ctxLabel)}</span>
      `;
      elements.queueItemsContainer.appendChild(autoHeader);

      autoEpisodes.forEach((ep) => {
        const row = document.createElement('div');
        row.className = 'queue-item-row auto-queue-row';
        row.dataset.guid = ep.guid;
        row.innerHTML = `
          <span class="queue-item-index" style="color:var(--text-muted);">↳</span>
          <img class="queue-item-artwork" src="${escapeHtml(ep.artwork || FALLBACK_ARTWORK)}" alt="">
          <div class="queue-item-info">
            <div class="queue-item-title">${escapeHtml(ep.title)}</div>
            <div class="queue-item-meta">${escapeHtml(ep.podcastTitle)}${ep.duration ? ` • ${escapeHtml(ep.duration)}` : ''}</div>
          </div>
          <div class="queue-item-actions">
            <button class="btn-queue-item-add" title="Add to Up Next Queue">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
            </button>
            <button class="btn-queue-item-play" title="Play Now">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="6 4 20 12 6 20 6 4"></polygon></svg>
            </button>
          </div>
        `;

        row.querySelector('.btn-queue-item-add').addEventListener('click', (e) => {
          e.stopPropagation();
          toggleEpisodeQueue(ep);
        });

        row.querySelector('.btn-queue-item-play').addEventListener('click', (e) => {
          e.stopPropagation();
          playEpisode(ep, null, state.playbackContext);
        });

        elements.queueItemsContainer.appendChild(row);
      });
    }
  } else if (!hasManualQueue) {
    elements.queueItemsContainer.innerHTML = `
      <div class="queue-empty-box">
        <p>Queue is empty</p>
        <span>Autoplay is paused. Toggle Autoplay in player controls to automatically stream next episodes.</span>
      </div>
    `;
  }
}

function openQueueModal() {
  elements.queueModal.classList.remove('hidden');
  renderQueueModalContent();
  window.history.pushState({ modal: 'queue' }, '', window.location.hash);
}

function closeQueueModal() {
  if (window.history.state && window.history.state.modal) {
    window.history.back();
  } else if (elements.queueModal) {
    elements.queueModal.classList.add('hidden');
  }
}

// ─────────────────────────────────────────────────────────────────────────
// SECTION 11b · Favorites (Synced Starred Episodes)
// Persisted locally under STORAGE_KEYS.FAVORITES and synced with Cloud D1
// via /api/sync/favorites.
// ─────────────────────────────────────────────────────────────────────────

function loadFavoritesFromStorage() {
  try {
    const stored = storage.getItem(STORAGE_KEYS.FAVORITES);
    state.favorites = stored ? JSON.parse(stored) : [];
    if (!Array.isArray(state.favorites)) state.favorites = [];
    state.favoriteGuids = new Set(state.favorites.map(f => f.guid).filter(Boolean));
  } catch (e) {
    state.favorites = [];
    state.favoriteGuids = new Set();
  }
  updateFavoritesCountUI();
}

function saveFavoritesToStorage() {
  try {
    storage.setItem(STORAGE_KEYS.FAVORITES, JSON.stringify(state.favorites));
    updateFavoritesCountUI();
  } catch (e) {}
}

function updateFavoritesCountUI() {
  if (elements.favoritesHeaderCount) {
    const count = (state.favorites || []).length;
    elements.favoritesHeaderCount.textContent = `${count} ${count === 1 ? 'favorite' : 'favorites'}`;
  }
}

function isEpisodeFavorited(guid) {
  if (!guid) return false;
  return state.favoriteGuids && state.favoriteGuids.has(guid);
}

async function toggleFavoriteEpisode(ep) {
  if (!ep || !ep.guid) return;
  const isFav = isEpisodeFavorited(ep.guid);
  if (isFav) {
    state.favorites = (state.favorites || []).filter(f => f.guid !== ep.guid);
    state.favoriteGuids.delete(ep.guid);
    showStatus('Removed from favorites');
  } else {
    const favObj = {
      guid: ep.guid,
      feedUrl: ep.feedUrl || '',
      title: ep.title || 'Untitled Episode',
      podcastTitle: ep.podcastTitle || '',
      artwork: ep.artwork || '',
      audioUrl: ep.audioUrl || '',
      duration: ep.duration || '',
      pubDate: ep.pubDate || ep.timestamp || '',
      description: ep.description || '',
      addedAt: Date.now()
    };
    state.favorites = [favObj, ...(state.favorites || []).filter(f => f.guid !== ep.guid)];
    state.favoriteGuids.add(ep.guid);
    showStatus('Added to favorites');
  }

  saveFavoritesToStorage();
  updateEpisodeCardFavoriteState(ep.guid);
  updatePlayerFavButton();

  const activeTab = document.querySelector('.nav-tab.active')?.dataset.tab;
  if (activeTab === 'favorites') {
    renderFavorites();
  }

  syncFavoriteToD1(ep, !isFav);
}

function updateEpisodeCardFavoriteState(guid) {
  if (!guid) return;
  const isFav = isEpisodeFavorited(guid);
  document.querySelectorAll(`.episode-card[data-guid="${CSS.escape(guid)}"] .btn-fav-ep`).forEach(btn => {
    btn.classList.toggle('is-favorited', isFav);
    btn.innerHTML = isFav ? CARD_ICONS.HEART_FILLED : CARD_ICONS.HEART;
    btn.title = isFav ? 'Remove from favorites' : 'Add to favorites';
  });
}

function updatePlayerStatusBadges() {
  const current = state.currentEpisode;
  const isDownloaded = current && !!state.downloadedEpisodes[current.guid];
  const isFav = current && isEpisodeFavorited(current.guid);
  const isQueued = current && isEpisodeQueued(current.guid);

  const badgeContainers = [
    elements.playerStatusBadges || document.getElementById('player-status-badges'),
    elements.miniStatusBadges || document.getElementById('mini-status-badges')
  ];

  badgeContainers.forEach(container => {
    if (!container) return;
    const dlEl = container.querySelector('.badge-downloaded');
    const favEl = container.querySelector('.badge-fav');
    const queueEl = container.querySelector('.badge-queue');

    if (dlEl) dlEl.classList.toggle('hidden', !isDownloaded);
    if (favEl) favEl.classList.toggle('hidden', !isFav);
    if (queueEl) {
      if (container.id === 'mini-status-badges' || container.classList.contains('mini-status-badges')) {
        queueEl.classList.add('hidden');
      } else {
        queueEl.classList.toggle('hidden', !isQueued);
      }
    }
  });
}

function updatePlayerFavButton() {
  if (!elements.btnPlayerFav) return;
  const current = state.currentEpisode;
  if (!current) {
    elements.btnPlayerFav.classList.remove('is-favorited');
    updatePlayerStatusBadges();
    return;
  }
  const isFav = isEpisodeFavorited(current.guid);
  elements.btnPlayerFav.classList.toggle('is-favorited', isFav);
  elements.btnPlayerFav.title = isFav ? 'Remove from favorites' : 'Add to favorites';
  updatePlayerStatusBadges();
}

function showToast(message, duration = 2500) {
  let toast = document.getElementById('app-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'app-toast';
    toast.className = 'app-toast';
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(toast._timeout);
  toast._timeout = setTimeout(() => {
    toast.classList.remove('show');
  }, duration);
}

async function shareContent({ title, text, url }) {
  // 1. ALWAYS copy URL directly to clipboard first so the user has it immediately
  let copied = false;
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(url);
      copied = true;
      showToast('Link copied to clipboard');
    }
  } catch (_) {}

  // 2. On mobile / Web Share supporting devices, also open native OS share sheet (AirDrop, Messages, WhatsApp, etc.)
  if (navigator.share) {
    try {
      await navigator.share({
        title: title || 'Anypod',
        text: text || '',
        url: url || window.location.href
      });
      return;
    } catch (err) {
      if (err.name === 'AbortError') return;
    }
  }

  // 3. Fallback prompt if clipboard was blocked
  if (!copied) {
    try {
      window.prompt('Copy link:', url);
    } catch (_) {}
  }
}

function shareCurrentEpisode() {
  const ep = state.currentEpisode;
  if (!ep) {
    showToast('No active episode to share');
    return;
  }
  shareEpisode(ep);
}

function shareEpisode(ep) {
  if (!ep) return;
  const shareUrl = ep.feedUrl
    ? `${window.location.origin}/?feed=${encodeURIComponent(ep.feedUrl)}&guid=${encodeURIComponent(ep.guid || '')}#feed=${encodeURIComponent(ep.feedUrl)}`
    : (ep.audioUrl || window.location.href);
  shareContent({
    title: ep.title || 'Episode',
    text: `Listen to "${ep.title}" from ${ep.podcastTitle || 'Podcast'} on Anypod`,
    url: shareUrl
  });
}

function shareFeed(feedUrl, title) {
  if (!feedUrl) return;
  const shareUrl = `${window.location.origin}/?feed=${encodeURIComponent(feedUrl)}#feed=${encodeURIComponent(feedUrl)}`;
  shareContent({
    title: title || 'Podcast',
    text: `Listen to ${title || 'this podcast'} on Anypod`,
    url: shareUrl
  });
}

async function syncFavoritesWithD1() {
  try {
    const headers = {};
    if (state.sessionToken) headers['X-Session-Token'] = state.sessionToken;
    const res = await fetch('/api/sync/favorites', { headers, credentials: 'include' });
    if (res.ok) {
      const data = await res.json();
      const remoteFavs = data.favorites || [];
      const map = new Map();
      (state.favorites || []).forEach(f => map.set(f.guid, f));
      remoteFavs.forEach(rf => {
        if (!map.has(rf.guid)) {
          map.set(rf.guid, rf);
        } else {
          map.set(rf.guid, { ...map.get(rf.guid), ...rf });
        }
      });
      state.favorites = Array.from(map.values()).sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0));
      state.favoriteGuids = new Set(state.favorites.map(f => f.guid).filter(Boolean));
      saveFavoritesToStorage();
      updateFavoritesCountUI();
      if (document.querySelector('.nav-tab.active')?.dataset.tab === 'favorites') {
        renderFavorites();
      }
    }
  } catch (e) {}
}

async function syncFavoriteToD1(ep, isFavorite) {
  try {
    const headers = { 'Content-Type': 'application/json' };
    if (state.sessionToken) headers['X-Session-Token'] = state.sessionToken;
    await fetch('/api/sync/favorites', {
      method: 'POST',
      headers,
      credentials: 'include',
      body: JSON.stringify({
        episodeGuid: ep.guid,
        feedUrl: ep.feedUrl || '',
        title: ep.title || '',
        podcastTitle: ep.podcastTitle || '',
        artwork: ep.artwork || '',
        audioUrl: ep.audioUrl || '',
        duration: ep.duration || '',
        pubDate: ep.pubDate || ep.timestamp || '',
        isFavorite
      })
    });
  } catch (e) {}
}

function renderFavorites() {
  if (!elements.favoritesEpisodesList) return;
  if (!state.feeds || state.feeds.length === 0) {
    navigateTo('discover');
    return;
  }
  let list = [...(state.favorites || [])];
  const q = (state.searchQuery || '').trim().toLowerCase();
  if (q) {
    const terms = q.split(/\s+/).filter(Boolean);
    list = list.filter(item => {
      const title = (item.title || '').toLowerCase();
      const podTitle = (item.podcastTitle || '').toLowerCase();
      const fullDesc = (item.content || item.description || '').toLowerCase();
      return terms.every(term => title.includes(term) || podTitle.includes(term) || fullDesc.includes(term));
    });
  }

  elements.favoritesEpisodesList.innerHTML = '';

  if (list.length === 0) {
    elements.favoritesEpisodesList.innerHTML = q
      ? `<div class="empty-state" style="grid-column: 1 / -1; padding: 2.5rem 1rem; text-align: center;"><p style="color: var(--text-muted); font-size: 0.9rem;">No favorite episodes match "${escapeHtml(state.searchQuery)}".</p></div>`
      : `<div class="empty-state" style="grid-column: 1 / -1; padding: 2.5rem 1rem; text-align: center;"><p style="color: var(--text-muted); font-size: 0.9rem;">No favorite episodes yet. Click the heart icon on any episode to save it here.</p></div>`;
    return;
  }

  const favContext = {
    type: 'favorites',
    id: 'favorites',
    title: 'Favorites',
    items: list
  };

  const frag = document.createDocumentFragment();
  list.forEach(item => {
    const matched = (state.allEpisodes || []).find(e => e.guid === item.guid);
    const ep = matched ? { ...matched, ...item } : { ...item };
    const card = createEpisodeCard(ep, favContext);
    frag.appendChild(card);
  });
  elements.favoritesEpisodesList.appendChild(frag);
}

// ─────────────────────────────────────────────────────────────────────────
// SECTION 12 · Downloads (Offline Listening)
// Episodes are cached in the Cache API under 'anypod-audio-v1'.
// Metadata (guid, size, title…) is tracked in state.downloadedEpisodes
// and persisted to localStorage under STORAGE_KEYS.DOWNLOADS.
// downloadEpisode — fetches audio, falls back to /api/audio-proxy on CORS.
// ─────────────────────────────────────────────────────────────────────────

function loadDownloadsFromStorage() {
  try {
    const stored = storage.getItem(STORAGE_KEYS.DOWNLOADS) || storage.getItem('podcast_pulse_downloads');
    state.downloadedEpisodes = stored ? JSON.parse(stored) : {};
  } catch (e) {
    state.downloadedEpisodes = {};
  }
}

function saveDownloadsToStorage() {
  try {
    storage.setItem(STORAGE_KEYS.DOWNLOADS, JSON.stringify(state.downloadedEpisodes));
    updateDownloadedCountUI();
  } catch (e) {}
}


const formatBytes = window.AnypodShared.formatBytes;

function updateDownloadedCountUI() {
  updatePlayerStatusBadges();
  const list = Object.values(state.downloadedEpisodes || {});
  const count = list.length;
  if (elements.downloadedCount) {
    elements.downloadedCount.textContent = count;
  }
  if (elements.offlineStorageCount) {
    const totalBytes = list.reduce((sum, item) => sum + (item.size || 0), 0);
    elements.offlineStorageCount.textContent = `${count} ${count === 1 ? 'episode' : 'episodes'} (${formatBytes(totalBytes)})`;
  }
  renderOfflineStorageSettings();
}

function renderOfflineStorageSettings() {
  if (!elements.offlineEpisodesList) return;
  purgeOrphanedDownloads();
  let list = Object.values(state.downloadedEpisodes || {});
  const q = (state.searchQuery || '').trim().toLowerCase();
  if (q) {
    const terms = q.split(/\s+/).filter(Boolean);
    list = list.filter(item => {
      const title = (item.title || '').toLowerCase();
      const podTitle = (item.podcastTitle || '').toLowerCase();
      const fullDesc = (item.content || item.description || '').toLowerCase();
      return terms.every(term => title.includes(term) || podTitle.includes(term) || fullDesc.includes(term));
    });
  }

  elements.offlineEpisodesList.innerHTML = '';

  if (list.length === 0) {
    elements.offlineEpisodesList.innerHTML = q
      ? `<div class="empty-state" style="grid-column: 1 / -1; padding: 2.5rem 1rem; text-align: center;"><p style="color: var(--text-muted); font-size: 0.9rem;">No downloaded episodes match "${escapeHtml(state.searchQuery)}".</p></div>`
      : '<div class="empty-state" style="grid-column: 1 / -1; padding: 2.5rem 1rem; text-align: center;"><p style="color: var(--text-muted); font-size: 0.9rem;">No episodes downloaded for offline listening yet.</p></div>';
    return;
  }

  list.forEach(item => {
    const matched = (state.allEpisodes || []).find(e => e.guid === item.guid);
    const ep = matched ? { ...matched, size: item.size } : { ...item };
    const card = createEpisodeCard(ep);
    elements.offlineEpisodesList.appendChild(card);
  });
}

function notifyServiceWorkerAudioCache() {
  if (navigator.serviceWorker && navigator.serviceWorker.controller) {
    navigator.serviceWorker.controller.postMessage({ type: 'SYNC_AUDIO_CACHE' });
  }
}

async function downloadEpisode(ep) {
  if (!ep || !ep.audioUrl) return;
  if (state.downloadingGuids.has(ep.guid)) return;

  state.downloadingGuids.add(ep.guid);
  updateEpisodeCardDownloadState(ep.guid);

  try {
    let response = null;
    try {
      response = await fetch(ep.audioUrl, { mode: 'cors' });
      if (!response.ok) response = null;
    } catch (e) {
      response = null;
    }

    if (!response) {
      const proxyUrl = `/api/audio-proxy?url=${encodeURIComponent(ep.audioUrl)}`;
      response = await fetch(proxyUrl);
    }

    if (!response || !response.ok) {
      throw new Error('Unable to download audio stream');
    }

    const blob = await response.blob();
    const approxSize = blob.size || 0;

    if ('caches' in window) {
      const audioCache = await caches.open('anypod-audio-v1');
      const headers = new Headers();
      headers.set('Content-Type', blob.type || 'audio/mpeg');
      headers.set('Content-Length', String(blob.size));
      headers.set('Accept-Ranges', 'bytes');
      const cacheResponse = new Response(blob, {
        status: 200,
        statusText: 'OK',
        headers: headers
      });
      await audioCache.put(ep.audioUrl, cacheResponse);
      notifyServiceWorkerAudioCache();
    }

    state.downloadedEpisodes[ep.guid] = {
      guid: ep.guid,
      feedUrl: ep.feedUrl,
      audioUrl: ep.audioUrl,
      title: ep.title,
      podcastTitle: ep.podcastTitle,
      artwork: ep.artwork,
      duration: ep.duration,
      timestamp: ep.timestamp,
      size: approxSize,
      downloadedAt: Date.now()
    };

    saveDownloadsToStorage();
  } catch (err) {
    alert(`Download failed: ${err.message || 'Network error'}`);
  } finally {
    state.downloadingGuids.delete(ep.guid);
    updateEpisodeCardDownloadState(ep.guid);
    if (state.filterMode === 'downloaded') {
      processAndSortEpisodes();
      renderTimeline();
    }
  }
}

async function removeDownloadedEpisode(guid) {
  const ep = state.downloadedEpisodes[guid];
  if (ep && 'caches' in window) {
    try {
      const audioCache = await caches.open('anypod-audio-v1');
      await audioCache.delete(ep.audioUrl);
      notifyServiceWorkerAudioCache();
    } catch (e) {}
  }
  delete state.downloadedEpisodes[guid];
  saveDownloadsToStorage();
  updateEpisodeCardDownloadState(guid);
  if (state.filterMode === 'downloaded') {
    processAndSortEpisodes();
    renderTimeline(true);
  }
}

async function clearAllDownloads() {
  if ('caches' in window) {
    try {
      await caches.delete('anypod-audio-v1');
      notifyServiceWorkerAudioCache();
    } catch (e) {}
  }
  state.downloadedEpisodes = {};
  saveDownloadsToStorage();
  document.querySelectorAll('.btn-download-ep').forEach(btn => {
    btn.classList.remove('is-downloaded', 'is-downloading');
    btn.innerHTML = CARD_ICONS.DOWNLOAD;
    btn.title = 'Download for offline';
  });
  if (state.filterMode === 'downloaded') {
    processAndSortEpisodes();
    renderTimeline(false);
  }
}

function updateEpisodeCardDownloadState(guid) {
  const isDownloaded = !!state.downloadedEpisodes[guid];
  const isDownloading = state.downloadingGuids.has(guid);
  const cards = document.querySelectorAll(`.episode-card[data-guid="${guid}"]`);

  cards.forEach(card => {
    const btn = card.querySelector('.btn-download-ep');
    if (!btn) return;
    btn.classList.toggle('is-downloaded', isDownloaded);
    btn.classList.toggle('is-downloading', isDownloading);
    if (isDownloading) {
      btn.innerHTML = CARD_ICONS.DOWNLOAD_SPINNER;
      btn.title = 'Downloading...';
    } else if (isDownloaded) {
      btn.innerHTML = CARD_ICONS.DOWNLOADED;
      btn.title = 'Downloaded (Click to remove)';
    } else {
      btn.innerHTML = CARD_ICONS.DOWNLOAD;
      btn.title = 'Download for offline';
    }
  });
}

// ─────────────────────────────────────────────────────────────────────────
// SECTION 13 · Service Worker & Network
// initServiceWorker — registers sw.js for offline caching.
// setupNetworkListeners — online/offline badge + resize → shelf rerender.
// ─────────────────────────────────────────────────────────────────────────

function initServiceWorker() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  }
}

function setupNetworkListeners() {
  const updateStatus = () => {
    if (!elements.offlineBadge) return;
    if (navigator.onLine) {
      elements.offlineBadge.classList.add('hidden');
    } else {
      elements.offlineBadge.classList.remove('hidden');
    }
  };
  window.addEventListener('online', updateStatus);
  window.addEventListener('offline', updateStatus);
  window.addEventListener('resize', () => {
    if (state.continueCollapsed && state.allEpisodes.length > 0) {
      renderContinueShelf();
    }
  });
  updateStatus();
}

