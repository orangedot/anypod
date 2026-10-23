/**
 * generate_discover_shell.js
 *
 * Generates a pre-rendered static HTML shell for Anypod's Discover view.
 * Injected into public/dist/index.html during production build (scripts/build.js).
 * Pre-renders all 7 multi-genre carousels for instant LCP (<0.2s) and 0 layout shift.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const FALLBACK_ARTWORK = 'data:image/svg+xml,%3Csvg%20xmlns=%22http://www.w3.org/2000/svg%22%20width=%22100%22%20height=%22100%22%3E%3Crect%20width=%22100%25%22%20height=%22100%25%22%20fill=%22%2318181b%22/%3E%3C/svg%3E';

// Read CURATED_CATEGORIES from catalogs/index.json
let CURATED_CATEGORIES = [];
try {
  const indexPath = path.join(rootDir, 'public', 'catalogs', 'index.json');
  if (fs.existsSync(indexPath)) {
    CURATED_CATEGORIES = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
  }
} catch (err) {
  console.warn('⚠️ Could not load catalogs/index.json:', err.message);
}

export function generateDiscoverShellHtml() {
  const profile = {
    title: 'Curious Explorer',
    narrative: 'Welcome to Anypod! We have prepared curated discovery shelves spanning planetary science, democracy & free press, technology, history, and human stories.',
    vibes: [
      { label: '🔬 Science & Cosmos', target: 'shelf-science' },
      { label: '🏛️ Democracy & Press', target: 'shelf-democracy' },
      { label: '💻 Tech & AI', target: 'shelf-technology' },
      { label: '🏺 History & Ideas', target: 'shelf-history' }
    ],
    stats: '350 curated shows across 7 genres',
    engineLabel: 'curated multi-genre catalog'
  };

  // Render all 7 shelves
  const shelvesHtml = CURATED_CATEGORIES.map((cat, catIdx) => {
    const featuredCardsHtml = (cat.featured || []).map((show, showIdx) => {
      const isTopShelfFirstCards = (catIdx === 0 && showIdx < 2);
      const loadingAttr = isTopShelfFirstCards ? 'fetchpriority="high" decoding="async"' : 'loading="lazy" decoding="async"';
      let icon = '✦';
      let note = String(show.whyNote || `Curated ${cat.title} selection`).trim();
      const firstChar = note.slice(0, 2).trim();
      if (['⏳', '✨', '✦', '🌱', '🚀', '🔬', '🎵', '⚡', '🧠', '🌐'].includes(firstChar) || ['⏳', '✨', '✦'].includes(note[0])) {
        icon = note.slice(0, 2).trim() || note[0];
        note = note.slice(icon.length).trim();
      }

      return `
        <div class="episode-card discover-show-recommendation-card discover-shelf-card" data-feed="${escapeHtml(show.feed)}">
          <div class="discover-why-badge">
            <span class="why-icon">${escapeHtml(icon)}</span>
            <span class="why-text">${escapeHtml(note)}</span>
          </div>
          <div class="episode-card-top">
            <img class="episode-artwork feed-art" src="${FALLBACK_ARTWORK}" alt="" ${loadingAttr} width="52" height="52" onerror="this.onerror=null;this.src='${FALLBACK_ARTWORK}';">
            <div class="episode-header-info">
              <div class="episode-podcast-name">${escapeHtml(show.badge || 'Recommended Show')}</div>
              <div class="episode-title">${escapeHtml(show.title)}</div>
            </div>
          </div>
          <div class="feed-recent-widget feed-recent-preview-empty" data-feed="${escapeHtml(show.feed)}">
            <div class="feed-recent-header">latest episode</div>
            <div class="feed-recent-list">
              <div class="recent-ep-row recent-ep-placeholder" style="color: var(--text-muted); font-size: 0.78rem; padding: 0.35rem 0.5rem;">
                <span>Click card to explore episodes</span>
              </div>
            </div>
          </div>
          <div class="episode-footer" style="margin-top:auto;">
            <div class="episode-meta">
              <span class="date-line">${escapeHtml(show.topic ? show.topic.toUpperCase() : 'PODCAST')}</span>
              <span class="time-line"><span class="btn-preview-link">Explore episodes →</span></span>
            </div>
            <div class="episode-card-actions" style="display:flex; gap:6px;">
              <button type="button" class="btn btn-primary btn-sm btn-discover-follow">+ Follow Show</button>
            </div>
          </div>
        </div>
      `;
    }).join('');

    return `
      <section class="discover-shelf" id="shelf-${cat.id}" data-category="${cat.id}">
        <div class="discover-shelf-header">
          <div class="discover-shelf-title-wrap">
            <h3 class="discover-shelf-title">
              <span>${cat.emoji}</span>
              <span>${escapeHtml(cat.title)}</span>
            </h3>
            <p class="discover-shelf-sub">${escapeHtml(cat.description)}</p>
          </div>
          <div class="discover-shelf-actions">
            <div class="discover-shelf-scroll-controls">
              <button type="button" class="btn-shelf-scroll btn-shelf-scroll-left" data-target="shelf-track-${cat.id}" aria-label="Scroll left" title="Scroll left">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="15 18 9 12 15 6"></polyline></svg>
              </button>
              <button type="button" class="btn-shelf-scroll btn-shelf-scroll-right" data-target="shelf-track-${cat.id}" aria-label="Scroll right" title="Scroll right">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"></polyline></svg>
              </button>
            </div>
            <button type="button" class="btn-shelf-see-all" data-category="${cat.id}">
              <span>See all ${cat.totalShows || 50}</span>
              <span aria-hidden="true">→</span>
            </button>
          </div>
        </div>
        <div class="discover-shelf-track" id="shelf-track-${cat.id}">
          ${featuredCardsHtml}
        </div>
      </section>
    `;
  }).join('');

  return `
    <div class="discover-view-wrap" data-prerendered="true" data-feeds-key="empty">
      <!-- AI Taste Persona Banner (Primary Text-First LCP Target) -->
      <div class="discover-persona-banner">
        <div class="persona-banner-header">
          <div class="persona-badge">
            <span class="persona-sparkle">✦</span>
            <span class="persona-badge-title">AI Taste Profile</span>
          </div>
          <button type="button" class="btn-recalibrate-taste" id="btn-recalibrate-taste" title="Recalibrate taste profile based on current library and history">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="23 4 23 10 17 10"></polyline>
              <polyline points="1 20 1 14 7 14"></polyline>
              <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>
            </svg>
            <span>Recalibrate</span>
          </button>
        </div>
        <div class="persona-main">
          <h2 class="persona-title">${escapeHtml(profile.title)}</h2>
          <p class="persona-narrative">${escapeHtml(profile.narrative)}</p>
        </div>
        <div class="persona-footer">
          <div class="persona-vibes">
            ${profile.vibes.map(v => `<span class="persona-vibe-chip clickable" data-target-shelf="${escapeHtml(v.target)}">${escapeHtml(v.label)}</span>`).join('')}
          </div>
          <div class="persona-stats">
            <span>${escapeHtml(profile.stats)}</span>
            <span class="persona-engine-tag" title="Runs privately and locally on your device">${escapeHtml(profile.engineLabel)}</span>
          </div>
        </div>
      </div>

      <!-- Clean Search & Direct RSS Add -->
      <div class="discover-search-box">
        <form id="empty-quick-form" class="quick-add-form" action="javascript:void(0);">
          <div class="quick-add-input-wrap">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="quick-add-icon">
              <circle cx="11" cy="11" r="8"></circle>
              <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
            </svg>
            <input type="text" id="empty-quick-input" placeholder="search podcast name or paste rss feed url..." autocomplete="off">
            <button type="submit" class="btn btn-primary btn-quick-submit" id="btn-empty-quick-submit">search / add</button>
          </div>
        </form>
        <div class="empty-category-chips" id="empty-category-chips">
          <button type="button" class="category-chip" data-category="Science">science</button>
          <button type="button" class="category-chip" data-category="Climate">climate &amp; planet</button>
          <button type="button" class="category-chip" data-category="Earth Nature">earth &amp; nature</button>
          <button type="button" class="category-chip" data-category="Space Astronomy">space &amp; astronomy</button>
          <button type="button" class="category-chip" data-category="Oceans Marine">oceans &amp; marine</button>
          <button type="button" class="category-chip" data-category="Physics Quantum">physics &amp; quantum</button>
          <button type="button" class="category-chip" data-category="Neuroscience Mind">neuroscience &amp; mind</button>
          <button type="button" class="category-chip" data-category="Biology Genetics">biology &amp; genetics</button>
          <button type="button" class="category-chip" data-category="Clean Energy">clean tech &amp; energy</button>
          <button type="button" class="category-chip" data-category="AI Tech">artificial intelligence</button>
          <button type="button" class="category-chip" data-category="History Science">history of science</button>
          <button type="button" class="category-chip" data-category="Wissen DE">wissen (de)</button>
        </div>
        <div id="empty-quick-results" class="quick-results-container"></div>
      </div>

      <!-- Multi-Category Curated Shelves (7 Categories x 5 Featured Shows) -->
      <div class="discover-shelves-container">
        ${shelvesHtml}
      </div>

      <!-- OPML import helper footer -->
      <div class="discover-opml-footer">
        <button class="btn btn-secondary btn-sm" id="btn-empty-opml-trigger">import opml file</button>
      </div>
    </div>
  `;
}
