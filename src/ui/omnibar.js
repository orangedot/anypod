/**
 * @file omnibar.js
 * @description Unified Omnibar Search & Quick-Add handler.
 * Supports:
 *  - 0ms local filtering of subscribed shows & downloaded episodes
 *  - Debounced (450ms) global podcast directory discovery via /api/search-directory
 *  - Direct RSS/XML paste detection with instant subscribe button
 *  - Keyboard shortcut Cmd/Ctrl + K
 */

import { state } from '../state/store.js';
import { elements } from './dom.js';

let directoryDebounceTimer = null;
let directoryAbortController = null;

/**
 * Initializes the unified omnibar search and dropdown interactions.
 * @param {object} callbacks - Actions to execute on item click/subscribe.
 * @param {Function} callbacks.onSubscribe - (feedUrl, title, artwork) => Promise<void>
 * @param {Function} callbacks.onSelectEpisode - (episode) => void
 * @param {Function} callbacks.onFilterChange - (query) => void
 */
export function setupOmnibar({ onSubscribe, onSelectEpisode, onFilterChange } = {}) {
  const input = elements.omnibar || document.getElementById('omnibar');
  const dropdown = document.getElementById('omnibar-dropdown');
  const clearBtn = elements.btnClearSearch || document.getElementById('btn-clear-search');
  const wrap = elements.searchBarWrap || document.getElementById('search-bar-wrap');

  if (!input) return;

  // Global Shortcut: Cmd/Ctrl + K
  document.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) {
      e.preventDefault();
      input.focus();
      input.select();
    }
  });

  // Close dropdown on outside click or Escape
  document.addEventListener('click', (e) => {
    if (dropdown && !dropdown.contains(e.target) && e.target !== input) {
      dropdown.classList.add('hidden');
    }
  });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (dropdown) dropdown.classList.add('hidden');
      input.blur();
    }
  });

  input.addEventListener('input', () => {
    const val = input.value.trim();
    const hasText = !!val;

    if (clearBtn) clearBtn.classList.toggle('hidden', !hasText);
    if (wrap) wrap.classList.toggle('has-text', hasText);

    state.searchQuery = val;
    if (onFilterChange) onFilterChange(val);

    if (!val) {
      if (dropdown) dropdown.classList.add('hidden');
      return;
    }

    renderOmnibarResults(val, dropdown, { onSubscribe, onSelectEpisode });
  });

  if (clearBtn) {
    clearBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      input.value = '';
      state.searchQuery = '';
      clearBtn.classList.add('hidden');
      if (wrap) wrap.classList.remove('has-text');
      if (dropdown) dropdown.classList.add('hidden');
      if (onFilterChange) onFilterChange('');
      input.focus();
    });
  }
}

/**
 * Checks if input is an RSS/Podcast feed URL.
 */
function isFeedUrl(str) {
  const s = str.toLowerCase();
  return s.startsWith('http://') || s.startsWith('https://') || s.endsWith('.xml') || s.endsWith('.rss');
}

/**
 * Renders unified results inside the omnibar dropdown.
 */
function renderOmnibarResults(query, dropdown, { onSubscribe, onSelectEpisode } = {}) {
  if (!dropdown) return;
  dropdown.innerHTML = '';
  dropdown.classList.remove('hidden');

  const lowerQuery = query.toLowerCase();

  // 1. Direct RSS Feed URL detected
  if (isFeedUrl(query)) {
    const actionBtn = document.createElement('button');
    actionBtn.type = 'button';
    actionBtn.className = 'omnibar-action-btn';
    actionBtn.innerHTML = `
      <span>➕ Subscribe directly to this feed</span>
      <span style="opacity: 0.7; font-size: 0.75rem;">RSS / XML</span>
    `;
    actionBtn.addEventListener('click', async () => {
      if (onSubscribe) await onSubscribe(query);
      dropdown.classList.add('hidden');
    });
    dropdown.appendChild(actionBtn);
    return;
  }

  // 2. Section: In Your Library (0ms local filter)
  const localFeeds = (state.feeds || []).filter(url => {
    const meta = state.feedMetadata[url] || {};
    return (meta.title && meta.title.toLowerCase().includes(lowerQuery)) ||
           url.toLowerCase().includes(lowerQuery);
  });

  const localEpisodes = (state.allEpisodes || []).filter(ep => {
    return (ep.title && ep.title.toLowerCase().includes(lowerQuery)) ||
           (ep.podcastTitle && ep.podcastTitle.toLowerCase().includes(lowerQuery));
  }).slice(0, 5);

  if (localFeeds.length > 0 || localEpisodes.length > 0) {
    const libTitle = document.createElement('div');
    libTitle.className = 'omnibar-section-title';
    libTitle.textContent = 'In Your Library';
    dropdown.appendChild(libTitle);

    // Render matching podcasts
    localFeeds.forEach(feedUrl => {
      const meta = state.feedMetadata[feedUrl] || {};
      const item = document.createElement('div');
      item.className = 'omnibar-item';
      item.innerHTML = `
        <div class="omnibar-item-left">
          <img src="${meta.artwork || ''}" class="omnibar-item-artwork">
          <div class="omnibar-item-info">
            <div class="omnibar-item-title">${meta.title || feedUrl}</div>
            <div class="omnibar-item-subtitle">Subscribed Podcast</div>
          </div>
        </div>
      `;
      dropdown.appendChild(item);
    });

    // Render matching episodes
    localEpisodes.forEach(ep => {
      const item = document.createElement('div');
      item.className = 'omnibar-item';
      item.innerHTML = `
        <div class="omnibar-item-left">
          <img src="${ep.artworkUrl || ''}" class="omnibar-item-artwork">
          <div class="omnibar-item-info">
            <div class="omnibar-item-title">${ep.title}</div>
            <div class="omnibar-item-subtitle">${ep.podcastTitle}</div>
          </div>
        </div>
      `;
      item.addEventListener('click', () => {
        if (onSelectEpisode) onSelectEpisode(ep);
        dropdown.classList.add('hidden');
      });
      dropdown.appendChild(item);
    });
  }

  // 3. Section: Discover New Shows (Debounced 450ms)
  if (query.length >= 2) {
    const discTitle = document.createElement('div');
    discTitle.className = 'omnibar-section-title';
    discTitle.textContent = 'Discover New Shows';
    dropdown.appendChild(discTitle);

    const discContainer = document.createElement('div');
    discContainer.className = 'omnibar-disc-container';
    discContainer.innerHTML = '<div style="padding: 0.5rem; font-size: 0.78rem; opacity: 0.6;">Searching directory...</div>';
    dropdown.appendChild(discContainer);

    if (directoryDebounceTimer) clearTimeout(directoryDebounceTimer);
    directoryDebounceTimer = setTimeout(async () => {
      if (directoryAbortController) {
        directoryAbortController.abort();
      }
      directoryAbortController = new AbortController();

      try {
        const res = await fetch(`/api/search-directory?term=${encodeURIComponent(query)}&limit=8`, {
          signal: directoryAbortController.signal
        });
        if (!res.ok) throw new Error('Search failed');
        const data = await res.json();
        const results = (data.results || []).filter(r => r.feedUrl);

        discContainer.innerHTML = '';
        if (results.length === 0) {
          discContainer.innerHTML = '<div style="padding: 0.5rem; font-size: 0.78rem; opacity: 0.6;">No directory matches found.</div>';
          return;
        }

        results.slice(0, 6).forEach(pod => {
          const isSubscribed = (state.feeds || []).includes(pod.feedUrl);
          const item = document.createElement('div');
          item.className = 'omnibar-item';
          item.innerHTML = `
            <div class="omnibar-item-left">
              <img src="${pod.artworkUrl100 || pod.artworkUrl60 || ''}" class="omnibar-item-artwork">
              <div class="omnibar-item-info">
                <div class="omnibar-item-title">${pod.collectionName || pod.trackName}</div>
                <div class="omnibar-item-subtitle">${pod.artistName || 'Podcast'}</div>
              </div>
            </div>
            <button type="button" class="omnibar-follow-btn" ${isSubscribed ? 'disabled' : ''}>
              ${isSubscribed ? 'Subscribed' : '+ Follow'}
            </button>
          `;
          const followBtn = item.querySelector('.omnibar-follow-btn');
          followBtn.addEventListener('click', async (e) => {
            e.stopPropagation();
            followBtn.disabled = true;
            followBtn.textContent = 'Adding...';
            if (onSubscribe) await onSubscribe(pod.feedUrl, pod.collectionName, pod.artworkUrl100);
            followBtn.textContent = 'Subscribed';
          });
          discContainer.appendChild(item);
        });
      } catch (err) {
        if (err.name !== 'AbortError') {
          discContainer.innerHTML = '<div style="padding: 0.5rem; font-size: 0.78rem; opacity: 0.6;">Unable to load directory results.</div>';
        }
      }
    }, 450);
  }
}
