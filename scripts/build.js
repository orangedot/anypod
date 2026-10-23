import esbuild from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateDiscoverShellHtml } from './generate_discover_shell.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const publicDir = path.join(rootDir, 'public');
const distDir = path.join(publicDir, 'dist');

console.log('📦 Starting Anypod production build...');

// Ensure clean dist directory
if (!fs.existsSync(distDir)) {
  fs.mkdirSync(distDir, { recursive: true });
}

// 0. Assemble in-memory JS bundles: Core Shell (app.min.js) and Deferred Audio Engine (player.min.js)
const sharedModules = [
  'scripts/settings.js',
  'shared/formatters.js',
  'shared/storage.js',
  'shared/sync-bridge.js',
  'shared/audio-utils.js'
];

const coreAppModules = [
  'app/01-state-and-dom.js',
  'app/02-auth-and-sync.js',
  'app/03-queue-favorites-downloads.js',
  'app/04-feeds-and-discover.js',
  'app/05-timeline-and-cards.js',
  'app/07-events-and-modals.js'
];

const playerAppModules = [
  'app/06-audio-player.js',
  'app/08-waveform-and-ai.js'
];

const sharedCode = sharedModules
  .map(rel => `// ── ${rel} ──\n` + fs.readFileSync(path.join(publicDir, rel), 'utf-8'))
  .join('\n\n');

const coreAppBody = coreAppModules
  .map(rel => {
    const raw = fs.readFileSync(path.join(publicDir, rel), 'utf-8').replace(/^'use strict';\s*/, '');
    return `  // ══ ${rel} ══\n` + raw.split('\n').map(l => (l ? '  ' + l : '')).join('\n');
  })
  .join('\n\n');

const coreLoaderBridge = `
  // ══ Core -> Player Bundle Loader Bridge ══
  window.state = state;
  window.elements = elements;
  window.CARD_ICONS = CARD_ICONS;
  window.FALLBACK_ARTWORK = FALLBACK_ARTWORK;
  window.showToast = showToast;
  window.showStatus = typeof showStatus === 'function' ? showStatus : () => {};
  window.hideStatus = typeof hideStatus === 'function' ? hideStatus : () => {};
  window.savePositionsToStorage = savePositionsToStorage;
  window.savePlaybackPositionToD1 = savePlaybackPositionToD1;
  window.saveFeedsToStorage = saveFeedsToStorage;
  window.saveCacheToStorage = saveCacheToStorage;
  window.saveDownloadsToStorage = saveDownloadsToStorage;
  window.saveMutedFeedsToStorage = typeof saveMutedFeedsToStorage === 'function' ? saveMutedFeedsToStorage : () => {};
  window.renderTimeline = renderTimeline;
  window.renderFeedsGrid = renderFeedsGrid;
  window.renderContinueShelf = renderContinueShelf;
  window.processAndSortEpisodes = processAndSortEpisodes;
  window.navigateTo = navigateTo;
  window._applyView = _applyView;
  window._currentView = _currentView;
  window.updateFeedCountUI = updateFeedCountUI;
  window.updateQueueUI = updateQueueUI;
  window.updateDownloadedCountUI = updateDownloadedCountUI;
  window.updateDockVisibility = updateDockVisibility;
  window.openShowNotes = typeof openShowNotes === 'function' ? openShowNotes : () => {};
  window.closeShowNotes = typeof closeShowNotes === 'function' ? closeShowNotes : () => {};
  window.openQueueModal = typeof openQueueModal === 'function' ? openQueueModal : () => {};
  window.closeQueueModal = typeof closeQueueModal === 'function' ? closeQueueModal : () => {};
  window.openAddModal = typeof openAddModal === 'function' ? openAddModal : () => {};
  window.closeAddModal = typeof closeAddModal === 'function' ? closeAddModal : () => {};
  window.openConfirmDialog = typeof openConfirmDialog === 'function' ? openConfirmDialog : () => {};
  window.promptRemoveFeed = typeof promptRemoveFeed === 'function' ? promptRemoveFeed : () => {};
  window.removeFeed = typeof removeFeed === 'function' ? removeFeed : () => {};
  window.importOpml = typeof importOpml === 'function' ? importOpml : () => {};
  window.exportOpml = typeof exportOpml === 'function' ? exportOpml : () => {};
  window.isEpisodeQueued = typeof isEpisodeQueued === 'function' ? isEpisodeQueued : () => false;
  window.toggleEpisodeQueue = typeof toggleEpisodeQueue === 'function' ? toggleEpisodeQueue : () => {};
  window.isEpisodeDownloaded = typeof isEpisodeDownloaded === 'function' ? isEpisodeDownloaded : () => false;
  window.downloadEpisode = typeof downloadEpisode === 'function' ? downloadEpisode : () => {};
  window.refreshAllFeeds = typeof refreshAllFeeds === 'function' ? refreshAllFeeds : () => {};

  let _playerBundlePromise = null;
  function loadPlayerBundle() {
    if (window.__playerBundleLoaded) return Promise.resolve();
    if (_playerBundlePromise) return _playerBundlePromise;
    _playerBundlePromise = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = \`player.min.js?v=\${window.__BUILD_VERSION || Date.now()}\`;
      s.onload = () => {
        window.__playerBundleLoaded = true;
        if (typeof window.initPlayerEngine === 'function') {
          window.initPlayerEngine();
        }
        resolve();
      };
      s.onerror = (err) => {
        _playerBundlePromise = null;
        console.warn('⚠️ Player bundle load failed:', err);
        reject(err);
      };
      document.head.appendChild(s);
    });
    return _playerBundlePromise;
  }
  window.loadPlayerBundle = loadPlayerBundle;

  window.playEpisode = async function(episode, overrideStartTime, context = null) {
    await loadPlayerBundle();
    if (typeof window.__realPlayEpisode === 'function') {
      return window.__realPlayEpisode(episode, overrideStartTime, context);
    }
  };

  window.toggleEpisodePlayback = async function(episode, context = null) {
    await loadPlayerBundle();
    if (typeof window.__realToggleEpisodePlayback === 'function') {
      return window.__realToggleEpisodePlayback(episode, context);
    }
  };

  window.isEnginePlaying = () => false;
  window.renderWaveformChart = () => {};
  window.initOrLoadEpisodeTimeline = () => {};
  window.setupAudioEngines = () => {};
  window.hookVisualizerToAudio = () => {};
  window.loadExperimentalSettings = () => {};
  window.setupExperimentalSettings = () => {};
  window.updateAutoplayButtonUI = () => {};
  window.updateShuffleButtonUI = () => {};

  // Dual Trigger: Preload player and waveform engines on idle or after 2s
  if (typeof requestIdleCallback === 'function') {
    requestIdleCallback(() => {
      setTimeout(loadPlayerBundle, 2000);
    }, { timeout: 3500 });
  } else {
    setTimeout(loadPlayerBundle, 2500);
  }

  // Click Capture Trigger: Any tap on player controls loads bundle instantly
  document.body.addEventListener('click', (e) => {
    if (e.target.closest('.btn-play, .btn-play-toggle, .episode-play-btn, .recent-ep-row, #mini-play-toggle, #btn-play-toggle, .btn-hero-play, #btn-play-main')) {
      loadPlayerBundle();
    }
  }, { capture: true, passive: true });
`;

const assembledCoreJs = `${sharedCode}\n\n(function () {\n  'use strict';\n\n${coreAppBody}\n${coreLoaderBridge}\n})();\n`;

const playerAppBody = playerAppModules
  .map(rel => {
    const raw = fs.readFileSync(path.join(publicDir, rel), 'utf-8').replace(/^'use strict';\s*/, '');
    return `  // ══ ${rel} ══\n` + raw.split('\n').map(l => (l ? '  ' + l : '')).join('\n');
  })
  .join('\n\n');

const assembledPlayerJs = `(function () {\n  'use strict';\n
  const state = window.state || {};
  const elements = window.elements || {};
  const CARD_ICONS = window.CARD_ICONS || {};
  const FALLBACK_ARTWORK = window.FALLBACK_ARTWORK || '';
  const showToast = window.showToast || console.log;
  const showStatus = window.showStatus || console.log;
  const hideStatus = window.hideStatus || (() => {});
  const savePositionsToStorage = window.savePositionsToStorage || (() => {});
  const savePlaybackPositionToD1 = window.savePlaybackPositionToD1 || (() => {});
  const saveFeedsToStorage = window.saveFeedsToStorage || (() => {});
  const saveCacheToStorage = window.saveCacheToStorage || (() => {});
  const saveDownloadsToStorage = window.saveDownloadsToStorage || (() => {});
  const saveMutedFeedsToStorage = window.saveMutedFeedsToStorage || (() => {});
  const renderTimeline = window.renderTimeline || (() => {});
  const renderFeedsGrid = window.renderFeedsGrid || (() => {});
  const renderContinueShelf = window.renderContinueShelf || (() => {});
  const processAndSortEpisodes = window.processAndSortEpisodes || (() => {});
  const navigateTo = window.navigateTo || (() => {});
  const _applyView = window._applyView || (() => {});
  const _currentView = window._currentView || (() => ({ tab: 'discover' }));
  const updateFeedCountUI = window.updateFeedCountUI || (() => {});
  const updateQueueUI = window.updateQueueUI || (() => {});
  const updateDownloadedCountUI = window.updateDownloadedCountUI || (() => {});
  const updateDockVisibility = window.updateDockVisibility || (() => {});
  const openShowNotes = window.openShowNotes || (() => {});
  const closeShowNotes = window.closeShowNotes || (() => {});
  const openQueueModal = window.openQueueModal || (() => {});
  const closeQueueModal = window.closeQueueModal || (() => {});
  const openAddModal = window.openAddModal || (() => {});
  const closeAddModal = window.closeAddModal || (() => {});
  const isEpisodeQueued = window.isEpisodeQueued || (() => false);
  const toggleEpisodeQueue = window.toggleEpisodeQueue || (() => {});
  const isEpisodeDownloaded = window.isEpisodeDownloaded || (() => false);
  const downloadEpisode = window.downloadEpisode || (() => {});
  const refreshAllFeeds = window.refreshAllFeeds || (() => {});

${playerAppBody}

  // Expose real player engine functions
  window.__realPlayEpisode = playEpisode;
  window.__realToggleEpisodePlayback = toggleEpisodePlayback;
  window.playEpisode = playEpisode;
  window.toggleEpisodePlayback = toggleEpisodePlayback;
  window.isEnginePlaying = isEnginePlaying;
  window.pauseCurrentEngine = pauseCurrentEngine;
  window.playCurrentEngine = playCurrentEngine;
  window.skipToNextEpisode = skipToNextEpisode;
  window.toggleShuffle = toggleShuffle;
  window.updateAutoplayButtonUI = updateAutoplayButtonUI;
  window.updateShuffleButtonUI = updateShuffleButtonUI;
  window.setPlayerCollapsed = setPlayerCollapsed;
  window.cyclePlaybackSpeed = cyclePlaybackSpeed;
  window.updateProgress = updateProgress;
  window.updateDuration = updateDuration;
  window.syncPlaybackButtons = syncPlaybackButtons;
  window.syncMediaSession = syncMediaSession;
  window.renderWaveformChart = renderWaveformChart;
  window.initOrLoadEpisodeTimeline = initOrLoadEpisodeTimeline;
  window.setupWaveformInteractivity = setupWaveformInteractivity;
  window.hookVisualizerToAudio = hookVisualizerToAudio;
  window.setupAudioEngines = setupAudioEngines;
  window.setupExperimentalSettings = setupExperimentalSettings;
  window.loadExperimentalSettings = loadExperimentalSettings;
  window.syncExperimentalUI = syncExperimentalUI;

  window.initPlayerEngine = function() {
    setupAudioEngines();
    hookVisualizerToAudio();
    loadExperimentalSettings();
    setupExperimentalSettings();
    updateAutoplayButtonUI();
    updateShuffleButtonUI();
    if (typeof restoreLastActiveEpisode === 'function') {
      restoreLastActiveEpisode();
    }
  };

  // Auto-init if app is already active
  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    window.initPlayerEngine();
  }
})();
`;

console.log(`🔧 Assembled in-memory: Core (${sharedModules.length} shared + ${coreAppModules.length} app) & Player (${playerAppModules.length} modules)`);

// Clean up legacy monolithic app.js if present
const legacyAppJs = path.join(publicDir, 'app.js');
if (fs.existsSync(legacyAppJs)) {
  fs.unlinkSync(legacyAppJs);
}

// 1. Bundle and minify Core JS directly in memory (zero monolithic file on disk)
await esbuild.build({
  stdin: {
    contents: assembledCoreJs,
    resolveDir: publicDir,
    sourcefile: 'app.js',
    loader: 'js'
  },
  bundle: false,
  minify: true,
  sourcemap: true,
  target: ['es2022'],
  outfile: path.join(distDir, 'app.min.js'),
  metafile: true
});

// 1b. Bundle and minify Player Engine JS
await esbuild.build({
  stdin: {
    contents: assembledPlayerJs,
    resolveDir: publicDir,
    sourcefile: 'player.js',
    loader: 'js'
  },
  bundle: false,
  minify: true,
  sourcemap: true,
  target: ['es2022'],
  outfile: path.join(distDir, 'player.min.js'),
  metafile: true
});

// 2. Minify CSS
await esbuild.build({
  entryPoints: [path.join(publicDir, 'style.css')],
  bundle: false,
  minify: true,
  sourcemap: true,
  outfile: path.join(distDir, 'style.min.css'),
  metafile: true
});

// 3. Prepare production HTML in public/dist/index.html
const rawHtml = fs.readFileSync(path.join(publicDir, 'index.html'), 'utf-8');
const minCss = fs.readFileSync(path.join(distDir, 'style.min.css'), 'utf-8');
const staticDiscoverHtml = generateDiscoverShellHtml();
const v = Date.now();

let prodHtml = rawHtml
  // 1. Pre-render default Discover Shell directly into HTML for instant LCP (<200ms)
  .replace(
    '<div id="discover-content-container"></div>',
    `<div id="discover-content-container">${staticDiscoverHtml}</div>`
  )
  // 2. Ensure Discover panel & tab are active by default in initial HTML (eliminates Slow 4G JS wait for LCP)
  .replace(/<section class="tab-panel active" id="panel-timeline">/g, '<section class="tab-panel" id="panel-timeline">')
  .replace(/<section class="tab-panel" id="panel-discover">/g, '<section class="tab-panel active" id="panel-discover">')
  .replace(/<button class="nav-tab active" data-tab="timeline" id="tab-timeline">/g, '<button class="nav-tab" data-tab="timeline" id="tab-timeline">')
  .replace(/<button class="nav-tab" data-tab="discover" id="tab-discover">/g, '<button class="nav-tab active" data-tab="discover" id="tab-discover">')
  // 3. Inline minified CSS directly (eliminates render-blocking audit and FOUC permanently)
  .replace(/<link[^>]*href=["']\/?style\.css(\?[^"']*)?["'][^>]*>/i, `<style>${minCss}</style>`)
  // 4. Replace modular shared/ and app/ script tags (and settings.js) with single minified bundle
  .replace(
    /<!-- Experimental defaults[\s\S]*?<script src="app\/08-waveform-and-ai\.js(\?[^"']*)?" defer><\/script>/i,
    `<script>window.__BUILD_VERSION="${v}";</script>\n  <script src="app.min.js?v=${v}" defer></script>`
  )
  .replace(
    /<!-- Shared Functional Modules \(AnypodShared\) -->[\s\S]*?<script src="app\/08-waveform-and-ai\.js(\?[^"']*)?" defer><\/script>/i,
    `<script>window.__BUILD_VERSION="${v}";</script>\n  <script src="app.min.js?v=${v}" defer></script>`
  )
  .replace(/src=["']\/?app\.js(\?[^"']*)?["']/g, `src="app.min.js?v=${v}"`)
  // 5. Normalize any duplicate rel attributes to standard rel="stylesheet"
  .replace(/rel=["']?preload["']?\s+rel=["']?stylesheet["']?/g, 'rel="stylesheet"');

fs.writeFileSync(path.join(distDir, 'index.html'), prodHtml, 'utf-8');

// Provide fallback for any legacy requests to /app.js and /style.css
fs.copyFileSync(path.join(distDir, 'app.min.js'), path.join(distDir, 'app.js'));
fs.copyFileSync(path.join(distDir, 'style.min.css'), path.join(distDir, 'style.css'));

// 4. Auto-copy ALL root static files to dist/
// (Automatically includes robots.txt, sw.js, _headers, manifest, icon.svg, llms.txt, shared/, app/, dj.js, sets.js, etc.)
const ignoredFiles = new Set(['index.html', 'app.js', 'style.css', 'dist', 'node_modules', '.git']);

for (const entry of fs.readdirSync(publicDir, { withFileTypes: true })) {
  if (ignoredFiles.has(entry.name)) continue;

  const srcPath = path.join(publicDir, entry.name);
  const destPath = path.join(distDir, entry.name);

  if (entry.isFile()) {
    fs.copyFileSync(srcPath, destPath);
  } else if (entry.isDirectory()) {
    fs.cpSync(srcPath, destPath, { recursive: true });
  }
}

// Provide fallback for any legacy requests to /app.js and /style.css
fs.copyFileSync(path.join(distDir, 'app.min.js'), path.join(distDir, 'app.js'));
fs.copyFileSync(path.join(distDir, 'style.min.css'), path.join(distDir, 'style.css'));

// 5. Customize dist/sw.js to cache production bundle
const swDistPath = path.join(distDir, 'sw.js');
if (fs.existsSync(swDistPath)) {
  let swContent = fs.readFileSync(swDistPath, 'utf-8');
  swContent = swContent
    .replace(/'\/style\.css',?\n?/g, "'/style.min.css',\n")
    .replace(
      /'\/shared\/formatters\.js',[\s\S]*?'\/app\/08-waveform-and-ai\.js',?\n?/g,
      "'/app.min.js',\n    '/player.min.js',\n"
    );
  fs.writeFileSync(swDistPath, swContent, 'utf-8');
}

const coreMinSize = (fs.statSync(path.join(distDir, 'app.min.js')).size / 1024).toFixed(1);
const playerMinSize = (fs.statSync(path.join(distDir, 'player.min.js')).size / 1024).toFixed(1);
const originalCssSize = (fs.statSync(path.join(publicDir, 'style.css')).size / 1024).toFixed(1);
const minCssSize = (fs.statSync(path.join(distDir, 'style.min.css')).size / 1024).toFixed(1);

console.log(`✅ Core Shell JS:   ${coreMinSize} KB (public/dist/app.min.js)`);
console.log(`✅ Player Engine JS: ${playerMinSize} KB (public/dist/player.min.js)`);
console.log(`✅ CSS:             ${originalCssSize} KB  →  ${minCssSize} KB (public/dist/style.min.css)`);
console.log('✅ Static: Automatically copied all root assets & subdirectories to dist/');
console.log('✅ HTML: Generated production public/dist/index.html');
console.log('🎉 Production build complete!');