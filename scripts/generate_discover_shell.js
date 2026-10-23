/**
 * generate_discover_shell.js
 *
 * Generates a pre-rendered static HTML shell for Anypod's Discover view.
 * Injected into public/dist/index.html during production build (scripts/build.js).
 * Eliminates client-side JavaScript render delay for instant LCP on Discover.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const modulePath = path.join(rootDir, 'public', 'app', '01-state-and-dom.js');

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

// Read CURATED_SCIENCE_FEEDS directly from 01-state-and-dom.js to stay in sync
let CURATED_SCIENCE_FEEDS = [];
try {
  const code = fs.readFileSync(modulePath, 'utf8');
  const match = code.match(/const CURATED_SCIENCE_FEEDS = (\[[\s\S]*?\n\]);/);
  if (match) {
    CURATED_SCIENCE_FEEDS = (new Function(`return ${match[1]}`))();
  }
} catch (err) {
  console.warn('⚠️ Could not parse CURATED_SCIENCE_FEEDS from 01-state-and-dom.js:', err.message);
}

export function generateDiscoverShellHtml() {
  const profile = {
    title: 'Curious Explorer',
    narrative: 'Welcome to Anypod! We have prepared a narrated discovery feed spanning planetary science, cosmic mysteries, and cutting-edge research to calibrate your personal taste profile.',
    vibes: ['🌱 Planet & Space', '🔬 Frontier Research', '⚡ Zero Ads / Pure RSS'],
    stats: '50 curated shows worldwide',
    engineLabel: 'curated science catalog'
  };

  const topExternalShows = [
    {
      title: "NASA's Curious Universe",
      feed: "https://feeds.megaphone.fm/NATIONALAERONAUTICSANDSPACEADMINISTRATION8162188566",
      badge: "EN • Space",
      topic: "space",
      whyNote: "✦ Recommended companion for your Space focus"
    },
    {
      title: "Radiolab",
      feed: "https://feeds.simplecast.com/EmVW7VGp",
      badge: "EN • Science",
      topic: "science",
      whyNote: "✦ Recommended companion for your Science focus"
    },
    {
      title: "The Climate Question (BBC)",
      feed: "https://podcasts.files.bbci.co.uk/w13xtvb6.rss",
      badge: "EN • Climate",
      topic: "climate",
      whyNote: "✦ Recommended companion for your Climate focus"
    }
  ];

  // Top 3 cards in Explore New Horizons
  const externalCardsHtml = topExternalShows.map((show, idx) => {
    const loadingAttr = idx < 3 ? 'fetchpriority="high" decoding="async"' : 'loading="lazy" decoding="async"';
    return `
      <div class="episode-card discover-show-recommendation-card" data-feed="${escapeHtml(show.feed)}">
        <div class="discover-why-badge">
          <span class="why-icon">✦</span>
          <span class="why-text">${escapeHtml(show.whyNote.replace(/^✦\s*/, ''))}</span>
        </div>
        <div class="episode-card-top">
          <img class="episode-artwork feed-art" src="${FALLBACK_ARTWORK}" alt="" ${loadingAttr} width="52" height="52" onerror="this.onerror=null;this.src='${FALLBACK_ARTWORK}';">
          <div class="episode-header-info">
            <div class="episode-podcast-name">${escapeHtml(show.badge)}</div>
            <div class="episode-title">${escapeHtml(show.title)}</div>
          </div>
        </div>
        <div class="episode-footer" style="margin-top:auto;">
          <div class="episode-meta">
            <span class="date-line">${escapeHtml(show.topic.toUpperCase())}</span>
            <span class="time-line"><span class="btn-preview-link">Explore episodes →</span></span>
          </div>
          <div class="episode-card-actions" style="display:flex; gap:6px;">
            <button type="button" class="btn btn-primary btn-sm btn-discover-follow">+ Follow Show</button>
          </div>
        </div>
      </div>
    `;
  }).join('');

  // Initial 12 curated shows for catalog
  const initialCurated = CURATED_SCIENCE_FEEDS.slice(0, 12);
  const curatedChipsHtml = initialCurated.map(item => {
    return `
      <div class="feed-card starter-show-card" data-feed="${escapeHtml(item.feed)}" data-title="${escapeHtml(item.title)}">
        <div class="feed-header">
          <img class="feed-art" loading="lazy" decoding="async" width="48" height="48" src="${FALLBACK_ARTWORK}" alt="" onerror="this.onerror=null;this.src='${FALLBACK_ARTWORK}';">
          <div class="feed-info">
            <h4>${escapeHtml(item.title)}</h4>
            <p>${escapeHtml(item.badge || item.lang.toUpperCase())}</p>
          </div>
          <div class="feed-header-actions">
            <button type="button" class="btn-feed-share" title="Share podcast" aria-label="Share podcast">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"></path>
                <polyline points="16 6 12 2 8 6"></polyline>
                <line x1="12" y1="2" x2="12" y2="15"></line>
              </svg>
            </button>
            <button type="button" class="btn btn-primary btn-sm starter-chip-add" data-feed="${escapeHtml(item.feed)}" data-title="${escapeHtml(item.title)}">+ follow</button>
          </div>
        </div>
        <div class="feed-recent-widget feed-recent-preview-empty" data-feed="${escapeHtml(item.feed)}">
          <div class="feed-recent-header">latest episodes</div>
          <div class="feed-recent-list">
            <div class="recent-ep-row recent-ep-placeholder" style="color: var(--text-muted); font-size: 0.78rem; padding: 0.35rem 0.5rem;">
              <span>Click card to preview episodes</span>
            </div>
          </div>
        </div>
      </div>
    `;
  }).join('');

  const filterPills = [
    { id: 'all', label: 'all shows (50)', active: true },
    { id: 'en', label: 'english (25)' },
    { id: 'de', label: 'deutsch (12)' },
    { id: 'fr', label: 'français (6)' },
    { id: 'es', label: 'español (5)' },
    { id: 'other', label: 'global / other (2)' },
    { id: 'climate', label: '🌱 climate & planet' },
    { id: 'science', label: '🔬 science' },
    { id: 'space', label: '🚀 space' }
  ].map(f => `<button type="button" class="starter-filter-pill ${f.active ? 'active' : ''}" data-filter="${f.id}">${f.label}</button>`).join('');

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
            ${profile.vibes.map(v => `<span class="persona-vibe-chip">${escapeHtml(v)}</span>`).join('')}
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

      <!-- Section: Explore New Horizons (Top 3 Cards with fetchpriority="high") -->
      <div class="discover-section">
        <div class="discover-section-header">
          <div class="discover-section-title-wrap">
            <h3 class="discover-section-title">Explore New Horizons</h3>
            <span class="discover-section-pill">Matched To Your Taste</span>
          </div>
          <p class="discover-section-narrative">Curated starter shows from worldwide producers to introduce fresh perspectives and tune your profile.</p>
        </div>
        <div class="discover-narrative-grid" id="discover-external-grid">
          ${externalCardsHtml}
        </div>
      </div>

      <!-- Section: Curated Global Directory Catalog (First 12 Shows + Load More Sentinel) -->
      <div class="discover-section">
        <div class="discover-section-header">
          <div class="discover-section-title-wrap">
            <h3 class="discover-section-title">Curated Planetary &amp; Science Catalog</h3>
            <span class="discover-section-pill">50 Worldwide Shows</span>
          </div>
          <p class="discover-section-narrative">Explore curated independent podcasts across English, German, French, Spanish, and global reporting.</p>
        </div>
        <div class="starter-suggestions-section">
          <div class="starter-suggestions-header">
            <div class="starter-suggestions-title">discover curated shows worldwide</div>
            <div class="starter-suggestions-sub">science, planet &amp; climate • 50 curated worldwide audio shows</div>
          </div>
          <div class="starter-filters-row">
            ${filterPills}
          </div>
          <div class="feeds-grid starter-suggestions-grid">
            ${curatedChipsHtml}
            <div class="starter-pagination-wrap" style="grid-column: 1 / -1; display: flex; justify-content: center; padding: 1rem 0;">
              <button type="button" class="btn btn-secondary btn-sm btn-starter-load-more" data-filter="all">
                show all 50 shows (38 more)
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- OPML import helper footer -->
      <div class="discover-opml-footer">
        <button class="btn btn-secondary btn-sm" id="btn-empty-opml-trigger">import opml file</button>
      </div>
    </div>
  `;
}
