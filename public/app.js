/**
 * Podcast Pulse - Main Application Logic
 * Pure Client-side JS with Cloudflare Workers API backend integration
 */

(function () {
  'use strict';

  // State
  const STORAGE_KEYS = {
    FEEDS: 'podcast_pulse_feeds',
    POSITION: 'podcast_pulse_last_position',
    SETTINGS: 'podcast_pulse_settings'
  };

  const DEFAULT_FEEDS = [
    'https://feeds.simplecast.com/54521442', // Syntax FM
    'https://changelog.com/podcast/feed'     // The Changelog
  ];

  let state = {
    feeds: [],           // List of RSS feed URLs
    feedMetadata: {},    // Map of feedUrl -> feed object
    allEpisodes: [],     // Aggregated episodes
    filteredEpisodes: [],// Displayed episodes
    currentEpisode: null,// Currently playing episode
    playbackSpeed: 1.0,  // Audio playback rate
    sortOrder: 'newest', // 'newest' | 'oldest'
    searchQuery: '',
    sleepTimer: {
      active: false,
      minutes: 0,
      endTime: null,
      intervalId: null,
      fadeout: true,
      initialVolume: 1.0
    }
  };

  // DOM Elements
  const elements = {
    // Tabs & Panels
    tabs: document.querySelectorAll('.nav-tab'),
    panels: document.querySelectorAll('.tab-panel'),
    feedCount: document.getElementById('feed-count'),

    // Toolbar & Search
    searchInput: document.getElementById('search-input'),
    sortOrderSelect: document.getElementById('sort-order'),
    btnOpenAddModal: document.getElementById('btn-open-add-modal'),
    btnRefreshAll: document.getElementById('btn-refresh-all'),
    statusBanner: document.getElementById('status-banner'),

    // Content Lists
    timelineList: document.getElementById('timeline-list'),
    feedsGrid: document.getElementById('feeds-grid'),
    btnEmptyAdd: document.getElementById('btn-empty-add'),

    // Settings & OPML
    opmlFileInput: document.getElementById('opml-file-input'),
    btnExportOpml: document.getElementById('btn-export-opml'),
    btnLoadDefaults: document.getElementById('btn-load-defaults'),
    btnClearStorage: document.getElementById('btn-clear-storage'),

    // Add Feed Modal
    addModal: document.getElementById('add-modal'),
    feedUrlInput: document.getElementById('feed-url-input'),
    btnCloseAdd: document.getElementById('btn-close-add'),
    btnCancelAdd: document.getElementById('btn-cancel-add'),
    btnSubmitFeed: document.getElementById('btn-submit-feed'),

    // Sleep Timer Modal
    sleepModal: document.getElementById('sleep-modal'),
    btnCloseSleep: document.getElementById('btn-close-sleep'),
    btnOpenSleep: document.getElementById('btn-open-sleep'),
    sleepBadge: document.getElementById('sleep-badge'),
    timerBtns: document.querySelectorAll('.timer-btn'),
    fadeoutCheck: document.getElementById('fadeout-check'),

    // Sticky Audio Player
    audio: document.getElementById('audio-engine'),
    playerArtwork: document.getElementById('player-artwork'),
    playerTitle: document.getElementById('player-title'),
    playerPodcast: document.getElementById('player-podcast'),
    btnPlayToggle: document.getElementById('btn-play-toggle'),
    iconPlay: document.querySelector('.icon-play'),
    iconPause: document.querySelector('.icon-pause'),
    btnPrev15: document.getElementById('btn-prev-15'),
    btnNext15: document.getElementById('btn-next-15'),
    currentTimeLabel: document.getElementById('current-time'),
    totalDurationLabel: document.getElementById('total-duration'),
    seekBar: document.getElementById('seek-bar'),
    btnSpeedToggle: document.getElementById('btn-speed-toggle')
  };

  // --- INITIALIZATION ---
  function init() {
    loadFeedsFromStorage();
    setupEventListeners();
    setupAudioEngine();
    
    if (state.feeds.length > 0) {
      refreshAllFeeds();
    } else {
      renderTimeline();
    }
  }

  // --- STORAGE ---
  function loadFeedsFromStorage() {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.FEEDS);
      state.feeds = saved ? JSON.parse(saved) : [];
      updateFeedCountUI();
    } catch (e) {
      console.error('Failed to load feeds from localStorage', e);
      state.feeds = [];
    }
  }

  function saveFeedsToStorage() {
    try {
      localStorage.setItem(STORAGE_KEYS.FEEDS, JSON.stringify(state.feeds));
      updateFeedCountUI();
    } catch (e) {
      console.error('Failed to save feeds to localStorage', e);
    }
  }

  function updateFeedCountUI() {
    if (elements.feedCount) {
      elements.feedCount.textContent = state.feeds.length;
    }
  }

  // --- FEED FETCHING & AGGREGATION ---
  async function refreshAllFeeds() {
    if (state.feeds.length === 0) {
      renderTimeline();
      return;
    }

    showStatus('Refreshing feeds...');
    state.allEpisodes = [];
    state.feedMetadata = {};

    const fetchPromises = state.feeds.map(url => fetchSingleFeed(url));
    await Promise.allSettled(fetchPromises);

    hideStatus();
    processAndSortEpisodes();
    renderTimeline();
    renderFeedsGrid();
  }

  async function fetchSingleFeed(url) {
    try {
      const apiUrl = `/api/feed?url=${encodeURIComponent(url)}`;
      const response = await fetch(apiUrl);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const feedData = await response.json();
      if (feedData.error) throw new Error(feedData.error);

      state.feedMetadata[url] = {
        title: feedData.title,
        artwork: feedData.artwork,
        episodesCount: feedData.episodesCount,
        description: feedData.description
      };

      if (Array.isArray(feedData.episodes)) {
        state.allEpisodes.push(...feedData.episodes);
      }

      return feedData;
    } catch (err) {
      console.warn(`Error loading feed (${url}):`, err.message);
      state.feedMetadata[url] = {
        title: 'Error Loading Feed',
        artwork: '',
        episodesCount: 0,
        error: err.message
      };
      return null;
    }
  }

  function processAndSortEpisodes() {
    let list = [...state.allEpisodes];

    // Filter by search
    if (state.searchQuery) {
      const q = state.searchQuery.toLowerCase();
      list = list.filter(ep => 
        ep.title.toLowerCase().includes(q) || 
        ep.podcastTitle.toLowerCase().includes(q) ||
        (ep.description && ep.description.toLowerCase().includes(q))
      );
    }

    // Sort order
    if (state.sortOrder === 'newest') {
      list.sort((a, b) => b.timestamp - a.timestamp);
    } else {
      list.sort((a, b) => a.timestamp - b.timestamp);
    }

    state.filteredEpisodes = list;
  }

  // --- UI RENDERERS ---
  function renderTimeline() {
    const container = elements.timelineList;
    container.innerHTML = '';

    if (state.feeds.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">🎙️</div>
          <h3>No podcast feeds added yet</h3>
          <p>Add an RSS feed URL or import an OPML file to start listening.</p>
          <button class="btn btn-primary" id="btn-empty-add-trigger">Add Your First Feed</button>
        </div>
      `;
      document.getElementById('btn-empty-add-trigger')?.addEventListener('click', openAddModal);
      return;
    }

    if (state.filteredEpisodes.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">🔍</div>
          <h3>No episodes found</h3>
          <p>Try clearing your search query or refreshing your feeds.</p>
        </div>
      `;
      return;
    }

    state.filteredEpisodes.forEach(ep => {
      const isPlaying = state.currentEpisode && state.currentEpisode.guid === ep.guid;

      const card = document.createElement('div');
      card.className = `episode-card ${isPlaying ? 'playing' : ''}`;
      card.dataset.guid = ep.guid;

      const formattedDate = ep.timestamp 
        ? new Date(ep.timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
        : 'Unknown date';

      card.innerHTML = `
        <img class="episode-artwork" src="${ep.artwork || 'data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'50\' height=\'50\' viewBox=\'0 0 24 24\' fill=\'none\' stroke=\'%23666\' stroke-width=\'2\'%3E%3Cpath d=\'M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z\'/%3E%3C/svg%3E'}" alt="" loading="lazy">
        <div class="episode-details">
          <div class="episode-podcast-name">${escapeHtml(ep.podcastTitle)}</div>
          <div class="episode-title">${escapeHtml(ep.title)}</div>
          <div class="episode-desc">${escapeHtml(ep.description || '')}</div>
          <div class="episode-meta">
            <span>📅 ${formattedDate}</span>
            ${ep.duration ? `<span>⏱️ ${escapeHtml(ep.duration)}</span>` : ''}
          </div>
        </div>
        <button class="btn-play-ep" title="${isPlaying && !elements.audio.paused ? 'Pause' : 'Play'}">
          ${isPlaying && !elements.audio.paused 
            ? `<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>`
            : `<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>`
          }
        </button>
      `;

      card.querySelector('.btn-play-ep').addEventListener('click', (e) => {
        e.stopPropagation();
        toggleEpisodePlayback(ep);
      });

      container.appendChild(card);
    });
  }

  function renderFeedsGrid() {
    const grid = elements.feedsGrid;
    grid.innerHTML = '';

    if (state.feeds.length === 0) {
      grid.innerHTML = `<p style="color: var(--text-muted);">No subscriptions yet.</p>`;
      return;
    }

    state.feeds.forEach(url => {
      const meta = state.feedMetadata[url] || {};
      const card = document.createElement('div');
      card.className = 'feed-card';

      card.innerHTML = `
        <div class="feed-header">
          <img class="feed-art" src="${meta.artwork || 'data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'50\' height=\'50\' viewBox=\'0 0 24 24\' fill=\'none\' stroke=\'%23666\' stroke-width=\'2\'%3E%3Cpath d=\'M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z\'/%3E%3C/svg%3E'}" alt="">
          <div class="feed-info">
            <h4>${escapeHtml(meta.title || url)}</h4>
            <p>${meta.episodesCount !== undefined ? `${meta.episodesCount} episodes` : 'Loading...'}</p>
          </div>
        </div>
        <div class="feed-actions">
          <button class="btn btn-danger btn-sm btn-remove-feed">Remove</button>
        </div>
      `;

      card.querySelector('.btn-remove-feed').addEventListener('click', () => {
        removeFeed(url);
      });

      grid.appendChild(card);
    });
  }

  // --- AUDIO ENGINE & PLAYBACK ---
  function setupAudioEngine() {
    const audio = elements.audio;

    audio.addEventListener('timeupdate', updateProgress);
    audio.addEventListener('loadedmetadata', updateDuration);
    audio.addEventListener('ended', onEpisodeEnded);
    audio.addEventListener('play', () => updatePlayerUI(true));
    audio.addEventListener('pause', () => updatePlayerUI(false));

    elements.seekBar.addEventListener('input', () => {
      if (audio.duration) {
        audio.currentTime = (elements.seekBar.value / 100) * audio.duration;
      }
    });

    elements.btnPlayToggle.addEventListener('click', () => {
      if (!state.currentEpisode) {
        if (state.filteredEpisodes.length > 0) {
          playEpisode(state.filteredEpisodes[0]);
        }
        return;
      }

      if (audio.paused) {
        audio.play();
      } else {
        audio.pause();
      }
    });

    elements.btnPrev15.addEventListener('click', () => {
      audio.currentTime = Math.max(0, audio.currentTime - 15);
    });

    elements.btnNext15.addEventListener('click', () => {
      if (audio.duration) {
        audio.currentTime = Math.min(audio.duration, audio.currentTime + 15);
      }
    });

    elements.btnSpeedToggle.addEventListener('click', cyclePlaybackSpeed);

    // Setup MediaSession API for lock screen controls
    if ('mediaSession' in navigator) {
      navigator.mediaSession.setActionHandler('play', () => audio.play());
      navigator.mediaSession.setActionHandler('pause', () => audio.pause());
      navigator.mediaSession.setActionHandler('seekbackward', () => {
        audio.currentTime = Math.max(0, audio.currentTime - 15);
      });
      navigator.mediaSession.setActionHandler('seekforward', () => {
        if (audio.duration) audio.currentTime = Math.min(audio.duration, audio.currentTime + 15);
      });
    }
  }

  function toggleEpisodePlayback(episode) {
    if (state.currentEpisode && state.currentEpisode.guid === episode.guid) {
      if (elements.audio.paused) {
        elements.audio.play();
      } else {
        elements.audio.pause();
      }
    } else {
      playEpisode(episode);
    }
  }

  function playEpisode(episode) {
    state.currentEpisode = episode;
    const audio = elements.audio;

    audio.src = episode.audioUrl;
    audio.playbackRate = state.playbackSpeed;
    audio.play().catch(e => console.warn('Autoplay blocked:', e));

    elements.playerTitle.textContent = episode.title;
    elements.playerPodcast.textContent = episode.podcastTitle;
    if (episode.artwork) {
      elements.playerArtwork.src = episode.artwork;
    }

    // MediaSession update
    if ('mediaSession' in navigator) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: episode.title,
        artist: episode.podcastTitle,
        artwork: episode.artwork ? [{ src: episode.artwork, sizes: '512x512', type: 'image/png' }] : []
      });
    }

    renderTimeline();
  }

  function updateProgress() {
    const audio = elements.audio;
    if (!audio.duration) return;

    const current = audio.currentTime;
    const total = audio.duration;

    elements.currentTimeLabel.textContent = formatTime(current);
    elements.seekBar.value = (current / total) * 100;

    // Check Sleep Timer Fadeout
    if (state.sleepTimer.active && state.sleepTimer.fadeout && state.sleepTimer.endTime) {
      const remainingSec = Math.max(0, (state.sleepTimer.endTime - Date.now()) / 1000);
      if (remainingSec <= 30 && remainingSec > 0) {
        audio.volume = Math.max(0, remainingSec / 30 * state.sleepTimer.initialVolume);
      }
    }
  }

  function updateDuration() {
    elements.totalDurationLabel.textContent = formatTime(elements.audio.duration);
  }

  function onEpisodeEnded() {
    // Check if sleep timer set to end of episode
    if (state.sleepTimer.active && state.sleepTimer.minutes === 'end') {
      stopSleepTimer();
      elements.audio.pause();
      return;
    }

    // Continuous Playback: Play next episode in list
    if (state.currentEpisode) {
      const idx = state.filteredEpisodes.findIndex(e => e.guid === state.currentEpisode.guid);
      if (idx !== -1 && idx + 1 < state.filteredEpisodes.length) {
        playEpisode(state.filteredEpisodes[idx + 1]);
      }
    }
  }

  function updatePlayerUI(isPlaying) {
    if (isPlaying) {
      elements.iconPlay.classList.add('hidden');
      elements.iconPause.classList.remove('hidden');
    } else {
      elements.iconPlay.classList.remove('hidden');
      elements.iconPause.classList.add('hidden');
    }
    renderTimeline();
  }

  function cyclePlaybackSpeed() {
    const speeds = [1.0, 1.25, 1.5, 2.0, 0.8];
    let nextIdx = speeds.indexOf(state.playbackSpeed) + 1;
    if (nextIdx >= speeds.length) nextIdx = 0;

    state.playbackSpeed = speeds[nextIdx];
    elements.audio.playbackRate = state.playbackSpeed;
    elements.btnSpeedToggle.textContent = `${state.playbackSpeed}x`;
  }

  // --- SLEEP TIMER ---
  function startSleepTimer(minutes) {
    stopSleepTimer();

    if (minutes === 0) return;

    state.sleepTimer.active = true;
    state.sleepTimer.minutes = minutes;
    state.sleepTimer.initialVolume = elements.audio.volume || 1.0;

    if (minutes !== 'end') {
      const ms = minutes * 60 * 1000;
      state.sleepTimer.endTime = Date.now() + ms;

      state.sleepTimer.intervalId = setInterval(() => {
        const remaining = Math.max(0, state.sleepTimer.endTime - Date.now());
        if (remaining <= 0) {
          elements.audio.pause();
          elements.audio.volume = state.sleepTimer.initialVolume; // reset volume
          stopSleepTimer();
        }
      }, 1000);
    }

    elements.sleepBadge.classList.remove('hidden');
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
    elements.sleepBadge.classList.add('hidden');
    closeSleepModal();
  }

  // --- FEED MANAGEMENT & OPML ---
  function addFeed(url) {
    const cleanUrl = url.trim();
    if (!cleanUrl) return;

    if (!state.feeds.includes(cleanUrl)) {
      state.feeds.push(cleanUrl);
      saveFeedsToStorage();
      closeAddModal();
      refreshAllFeeds();
    } else {
      alert('This feed is already in your subscriptions.');
    }
  }

  function removeFeed(url) {
    state.feeds = state.feeds.filter(f => f !== url);
    delete state.feedMetadata[url];
    saveFeedsToStorage();
    processAndSortEpisodes();
    renderTimeline();
    renderFeedsGrid();
  }

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
          addedCount++;
        }
      });

      if (addedCount > 0) {
        saveFeedsToStorage();
        refreshAllFeeds();
        alert(`Successfully imported ${addedCount} podcast feeds!`);
      } else {
        alert('No new podcast RSS feeds found in this OPML file.');
      }
    };
    reader.readAsText(file);
  }

  function exportOpml() {
    let xml = `<?xml version="1.0" encoding="UTF-8"?>\n<opml version="2.0">\n  <head>\n    <title>Podcast Pulse Export</title>\n  </head>\n  <body>\n`;
    
    state.feeds.forEach(url => {
      const meta = state.feedMetadata[url] || {};
      const title = meta.title ? escapeHtml(meta.title) : 'Podcast';
      xml += `    <outline type="rss" text="${title}" title="${title}" xmlUrl="${escapeHtml(url)}"/>\n`;
    });

    xml += `  </body>\n</opml>`;

    const blob = new Blob([xml], { type: 'text/xml' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'podcast_subscriptions.opml';
    a.click();
  }

  // --- EVENT LISTENERS & NAVIGATION ---
  function setupEventListeners() {
    // Navigation Tabs
    elements.tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        const targetTab = tab.dataset.tab;
        elements.tabs.forEach(t => t.classList.remove('active'));
        elements.panels.forEach(p => p.classList.remove('active'));

        tab.classList.add('active');
        document.getElementById(`panel-${targetTab}`).classList.add('active');
      });
    });

    // Search & Sort
    elements.searchInput.addEventListener('input', (e) => {
      state.searchQuery = e.target.value;
      processAndSortEpisodes();
      renderTimeline();
    });

    elements.sortOrderSelect.addEventListener('change', (e) => {
      state.sortOrder = e.target.value;
      processAndSortEpisodes();
      renderTimeline();
    });

    // Toolbar buttons
    elements.btnOpenAddModal.addEventListener('click', openAddModal);
    elements.btnRefreshAll.addEventListener('click', refreshAllFeeds);

    // Add Feed Modal
    elements.btnCloseAdd.addEventListener('click', closeAddModal);
    elements.btnCancelAdd.addEventListener('click', closeAddModal);
    elements.btnSubmitFeed.addEventListener('click', () => addFeed(elements.feedUrlInput.value));

    // Sleep Modal
    elements.btnOpenSleep.addEventListener('click', openSleepModal);
    elements.btnCloseSleep.addEventListener('click', closeSleepModal);
    elements.timerBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const val = btn.dataset.minutes;
        startSleepTimer(val === 'end' ? 'end' : parseInt(val, 10));
      });
    });
    elements.fadeoutCheck.addEventListener('change', (e) => {
      state.sleepTimer.fadeout = e.target.checked;
    });

    // Settings
    elements.opmlFileInput.addEventListener('change', (e) => {
      if (e.target.files.length > 0) {
        importOpml(e.target.files[0]);
      }
    });

    elements.btnExportOpml.addEventListener('click', exportOpml);

    elements.btnLoadDefaults.addEventListener('click', () => {
      DEFAULT_FEEDS.forEach(url => {
        if (!state.feeds.includes(url)) state.feeds.push(url);
      });
      saveFeedsToStorage();
      refreshAllFeeds();
    });

    elements.btnClearStorage.addEventListener('click', () => {
      if (confirm('Are you sure you want to clear all feeds and listening state?')) {
        localStorage.clear();
        state.feeds = [];
        state.feedMetadata = {};
        state.allEpisodes = [];
        state.filteredEpisodes = [];
        state.currentEpisode = null;
        elements.audio.pause();
        updateFeedCountUI();
        renderTimeline();
        renderFeedsGrid();
      }
    });
  }

  // Modals helpers
  function openAddModal() {
    elements.addModal.classList.remove('hidden');
    elements.feedUrlInput.focus();
  }

  function closeAddModal() {
    elements.addModal.classList.add('hidden');
    elements.feedUrlInput.value = '';
  }

  function openSleepModal() {
    elements.sleepModal.classList.remove('hidden');
  }

  function closeSleepModal() {
    elements.sleepModal.classList.add('hidden');
  }

  // Helpers
  function showStatus(msg) {
    elements.statusBanner.textContent = msg;
    elements.statusBanner.classList.remove('hidden');
  }

  function hideStatus() {
    elements.statusBanner.classList.add('hidden');
  }

  function formatTime(seconds) {
    if (!seconds || isNaN(seconds)) return '0:00';
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);

    const secStr = secs < 10 ? `0${secs}` : `${secs}`;
    if (hrs > 0) {
      const minStr = mins < 10 ? `0${mins}` : `${mins}`;
      return `${hrs}:${minStr}:${secStr}`;
    }
    return `${mins}:${secStr}`;
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // Boot
  document.addEventListener('DOMContentLoaded', init);
})();
