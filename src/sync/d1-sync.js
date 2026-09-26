/**
 * @file d1-sync.js
 * @description Cloudflare D1 synchronization for feeds, playback positions, favorites, and community spectrum data.
 */

import { STORAGE_KEYS } from '../config/constants.js';
import { state, elements } from '../state/store.js';
import { savePositionsToStorage, saveFavoritesToStorage } from '../utils/storage.js';
import { updateSyncStatusUI } from './auth.js';

export async function syncFeedsWithD1(callbacks = {}) {
  try {
    const headers = {};
    if (state.sessionToken) headers['X-Session-Token'] = state.sessionToken;

    const res = await fetch('/api/sync/feeds', {
      headers,
      credentials: 'include'
    });

    if (res.status === 401) {
      updateSyncStatusUI('guest mode / local device storage', '', false);
      if (callbacks.onFeedsUpdated) callbacks.onFeedsUpdated();
      return;
    }

    if (!res.ok) {
      console.warn('[anypod] D1 sync HTTP error:', res.status);
      updateSyncStatusUI('cloud sync temporarily unavailable — listening offline', state.userEmail, true);
      if (callbacks.onFeedsUpdated) callbacks.onFeedsUpdated();
      return;
    }

    const data = await res.json();
    if (data.userEmail) {
      state.userEmail = data.userEmail;
      try {
        localStorage.setItem(STORAGE_KEYS.USER_EMAIL, data.userEmail);
      } catch (_) {}
    }
    updateSyncStatusUI('cloud d1 synced', state.userEmail, true);

    const remoteFeeds = Array.isArray(data.feeds) ? data.feeds : [];
    if (remoteFeeds.length > 0 || !state.feeds || state.feeds.length === 0) {
      state.feeds = remoteFeeds.map(f => f.feed_url);
    }

    await loadPlaybackPositionsFromD1(callbacks.onPositionsLoaded);
    await syncFavoritesWithD1(callbacks.onFavoritesLoaded);
    if (callbacks.onFeedsUpdated) callbacks.onFeedsUpdated();

  } catch (err) {
    console.warn('[anypod] D1 sync warning:', err);
    updateSyncStatusUI('cloud sync temporarily unavailable — listening offline', state.userEmail, true);
    if (callbacks.onFeedsUpdated) callbacks.onFeedsUpdated();
  }
}

export async function saveFeedToD1(feedUrl, title = '', artwork = '') {
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

export async function removeFeedFromD1(feedUrl) {
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

export async function loadPlaybackPositionsFromD1(onLoadedCallback) {
  try {
    const headers = {};
    if (state.sessionToken) headers['X-Session-Token'] = state.sessionToken;
    const res = await fetch('/api/sync/position', { headers, credentials: 'include' });
    if (res.ok) {
      const data = await res.json();
      state.playbackPositions = data.positions || {};
      savePositionsToStorage();
    }
  } catch (e) {}
  if (onLoadedCallback) onLoadedCallback();
}

export async function savePlaybackPositionToD1(episodeGuid, positionSeconds, completed = false, onUpdatedCallback) {
  if (!episodeGuid) return;
  state.playbackPositions[episodeGuid] = {
    position: positionSeconds,
    completed: completed ? 1 : 0,
    lastListenedAt: Math.floor(Date.now() / 1000)
  };
  savePositionsToStorage();
  if (onUpdatedCallback) onUpdatedCallback();

  try {
    const headers = { 'Content-Type': 'application/json' };
    if (state.sessionToken) headers['X-Session-Token'] = state.sessionToken;
    await fetch('/api/sync/position', {
      method: 'POST',
      headers,
      credentials: 'include',
      body: JSON.stringify({ episodeGuid, positionSeconds, completed })
    });
  } catch (e) {}
}

export async function syncFavoritesWithD1(onLoadedCallback) {
  try {
    const headers = {};
    if (state.sessionToken) headers['X-Session-Token'] = state.sessionToken;
    const res = await fetch('/api/sync/favorites', { headers, credentials: 'include' });
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data.favorites)) {
        state.favorites = data.favorites;
        state.favoriteGuids = new Set(data.favorites.map(f => f.guid).filter(Boolean));
        saveFavoritesToStorage();
      }
    }
  } catch (e) {}
  if (onLoadedCallback) onLoadedCallback();
}

export async function saveFavoriteToD1(episode) {
  try {
    const headers = { 'Content-Type': 'application/json' };
    if (state.sessionToken) headers['X-Session-Token'] = state.sessionToken;
    await fetch('/api/sync/favorites', {
      method: 'POST',
      headers,
      credentials: 'include',
      body: JSON.stringify({
        episodeGuid: episode.guid,
        feedUrl: episode.feedUrl || '',
        title: episode.title || '',
        podcastTitle: episode.podcastTitle || '',
        artwork: episode.artwork || '',
        audioUrl: episode.audioUrl || '',
        duration: episode.duration || '',
        pubDate: episode.pubDate || ''
      })
    });
  } catch (e) {}
}

export async function removeFavoriteFromD1(episodeGuid) {
  try {
    const headers = { 'Content-Type': 'application/json' };
    if (state.sessionToken) headers['X-Session-Token'] = state.sessionToken;
    await fetch('/api/sync/favorites', {
      method: 'DELETE',
      headers,
      credentials: 'include',
      body: JSON.stringify({ episodeGuid })
    });
  } catch (e) {}
}

export async function saveTimelineToCommunityCache(episode, duration, bars, segments, source = 'probe', transcriptUrl = '') {
  try {
    await fetch('/api/community-transcripts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        guid: episode.guid,
        feedUrl: episode.feedUrl || '',
        duration: duration || 0,
        bars: bars,
        segments: segments,
        transcriptUrl: transcriptUrl || '',
        source: source
      })
    });
  } catch (_) {}
}
