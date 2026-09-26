/**
 * @file cards.js
 * @description Episode card DOM factory, scrub tracks, and show notes modal.
 */

import { state } from '../state/store.js';
import { elements } from './dom.js';
import { formatTime, formatEpisodeDuration, formatCompactDate, escapeHtml } from '../utils/formatters.js';

export function createEpisodeCard(ep) {
  const card = document.createElement('div');
  card.className = 'episode-card';
  card.dataset.guid = ep.guid;

  const pos = state.playbackPositions[ep.guid] || { position: 0, completed: false };
  const isPlaying = state.currentEpisode && state.currentEpisode.guid === ep.guid && state.playbackStatus === 'playing';
  const isCompleted = !!pos.completed;

  if (isPlaying) card.classList.add('is-active-playing');
  if (isCompleted) card.classList.add('is-played');

  const durStr = formatEpisodeDuration(ep.duration);
  const dateStr = formatCompactDate(ep.pubDate);

  card.innerHTML = `
    <div class="episode-main-row">
      <img class="episode-artwork" src="${ep.artworkUrl || ''}" alt="" loading="lazy" onerror="this.style.display='none'">
      <div class="episode-info">
        <h4 class="episode-title">${escapeHtml(ep.title || 'Untitled Episode')}</h4>
        <div class="episode-meta">
          <span class="podcast-title">${escapeHtml(ep.podcastTitle || '')}</span>
          ${dateStr ? `<span class="meta-dot">•</span><span class="episode-date">${dateStr}</span>` : ''}
          ${durStr ? `<span class="meta-dot">•</span><span class="episode-dur">${durStr}</span>` : ''}
        </div>
      </div>
      <button class="btn-card-play" aria-label="${isPlaying ? 'Pause' : 'Play'}">
        ${isPlaying ? '⏸' : '▶'}
      </button>
    </div>
  `;

  // Episode-card caching
  state._activeCardCache = card;
  return card;
}
