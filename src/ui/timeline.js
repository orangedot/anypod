/**
 * @file timeline.js
 * @description Timeline rendering, batch pagination, and continue listening shelf.
 */

import { state } from '../state/store.js';
import { elements } from './dom.js';
import { createEpisodeCard } from './cards.js';

export function renderTimeline() {
  const container = elements.timelineList || document.getElementById('timeline-list');
  if (!container) return;

  const episodes = state.filteredEpisodes || [];
  if (episodes.length === 0) {
    container.innerHTML = '<div style="text-align: center; padding: 3rem 1rem; opacity: 0.6;">No episodes found.</div>';
    return;
  }

  container.innerHTML = '';
  const page = state.timelinePage || 1;
  const pageSize = state.pageSize || 30;
  const visible = episodes.slice(0, page * pageSize);

  const fragment = document.createDocumentFragment();
  visible.forEach(ep => {
    fragment.appendChild(createEpisodeCard(ep));
  });
  container.appendChild(fragment);
}
