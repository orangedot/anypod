/**
 * @file feeds-grid.js
 * @description Subscribed podcasts library grid & feed detail drill-down.
 */

import { state } from '../state/store.js';
import { elements } from './dom.js';

export function renderFeedsGrid() {
  const container = elements.feedsGrid || document.getElementById('feeds-grid');
  if (!container) return;

  const feeds = state.feeds || [];
  if (feeds.length === 0) {
    container.innerHTML = '<div style="text-align: center; padding: 3rem 1rem; opacity: 0.6;">No podcasts subscribed yet.</div>';
    return;
  }

  container.innerHTML = '';
  feeds.forEach(feedUrl => {
    const meta = state.feedMetadata[feedUrl] || {};
    const card = document.createElement('div');
    card.className = 'feed-card';
    card.innerHTML = `
      <img src="${meta.artwork || ''}" alt="" class="feed-artwork" onerror="this.style.display='none'">
      <div class="feed-info">
        <h4 class="feed-title">${meta.title || feedUrl}</h4>
        <p class="feed-desc">${meta.description || ''}</p>
      </div>
    `;
    container.appendChild(card);
  });
}
