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

const coreExportBridge = `
  // ══ Core -> Player Bundle Export Bridge ══
  Object.assign(window, {
    storage,
    STORAGE_KEYS,
    CARD_ICONS,
    FALLBACK_ARTWORK,
    state,
    elements,
    parseDurationSeconds,
    formatTime,
    escapeHtml,
    syncShowNotesPlayButton,
    logPlayerDiagnostic,
    handleYouTubeStateChange,
    handleYouTubeError,
    navigateTo,
    init,
    saveFeedToD1,
    removeFeedFromD1,
    savePositionsToStorage,
    savePlaybackPositionToD1,
    saveMutedFeedsToStorage,
    saveFeedsToStorage,
    updateFeedCountUI,
    saveCacheToStorage,
    saveQueueToStorage,
    isEpisodeQueued,
    removeFromQueue,
    updateQueueUI,
    getAutoQueueEpisodes,
    renderQueueModalContent,
    updatePlayerFavButton,
    showToast,
    saveDownloadsToStorage,
    refreshAllFeeds,
    fetchSingleFeed,
    updateFilterBadges,
    processAndSortEpisodes,
    renderContinueShelf,
    renderTimeline,
    seekToExactTime,
    switchShowNotesTab,
    renderTranscriptView,
    loadEpisodeChapters,
    renderChapterTicksOnWaveform,
    updateActiveChapter,
    setupProgressTrackInteractivity,
    renderFeedsGrid,
    renderFeedDetail,
    closeSleepModal,
    showStatus,
    hideStatus
  });

  // Default playback stubs before player engine finishes executing
  if (typeof window.toggleEpisodePlayback !== 'function') {
    window.toggleEpisodePlayback = function (ep, context) {
      if (typeof window.__realToggleEpisodePlayback === 'function') {
        return window.__realToggleEpisodePlayback(ep, context);
      }
    };
  }
  if (typeof window.playEpisode !== 'function') {
    window.playEpisode = function (ep, overrideStartTime, context) {
      if (typeof window.__realPlayEpisode === 'function') {
        return window.__realPlayEpisode(ep, overrideStartTime, context);
      }
    };
  }
`;

const assembledCoreJs = `${sharedCode}\n\n(function () {\n  'use strict';\n\n
  // ══ Forward declarations for Player Engine functions used in Core Shell ══
  let setupAudioEngines = (...args) => (window.setupAudioEngines ? window.setupAudioEngines(...args) : undefined);
  let isEnginePlaying = (...args) => (window.isEnginePlaying ? window.isEnginePlaying(...args) : false);
  let playCurrentEngine = (...args) => (window.playCurrentEngine ? window.playCurrentEngine(...args) : undefined);
  let pauseCurrentEngine = (...args) => (window.pauseCurrentEngine ? window.pauseCurrentEngine(...args) : undefined);
  let toggleEpisodePlayback = (...args) => (window.toggleEpisodePlayback ? window.toggleEpisodePlayback(...args) : undefined);
  let playEpisode = (...args) => (window.playEpisode ? window.playEpisode(...args) : undefined);
  let startYouTubeBackgroundPaging = (...args) => (window.startYouTubeBackgroundPaging ? window.startYouTubeBackgroundPaging(...args) : undefined);
  let updateProgress = (...args) => (window.updateProgress ? window.updateProgress(...args) : undefined);
  let updateDuration = (...args) => (window.updateDuration ? window.updateDuration(...args) : undefined);
  let playNextEpisode = (...args) => (window.playNextEpisode ? window.playNextEpisode(...args) : undefined);
  let onEpisodeEnded = (...args) => (window.onEpisodeEnded ? window.onEpisodeEnded(...args) : undefined);
  let skipToNextEpisode = (...args) => (window.skipToNextEpisode ? window.skipToNextEpisode(...args) : undefined);
  let updateAutoplayButtonUI = (...args) => (window.updateAutoplayButtonUI ? window.updateAutoplayButtonUI(...args) : undefined);
  let updateShuffleButtonUI = (...args) => (window.updateShuffleButtonUI ? window.updateShuffleButtonUI(...args) : undefined);
  let toggleShuffle = (...args) => (window.toggleShuffle ? window.toggleShuffle(...args) : undefined);
  let syncMediaSession = (...args) => (window.syncMediaSession ? window.syncMediaSession(...args) : undefined);
  let syncPlaybackButtons = (...args) => (window.syncPlaybackButtons ? window.syncPlaybackButtons(...args) : undefined);
  let updatePlayerUI = (...args) => (window.updatePlayerUI ? window.updatePlayerUI(...args) : undefined);
  let setPlayerCollapsed = (...args) => (window.setPlayerCollapsed ? window.setPlayerCollapsed(...args) : undefined);
  let cyclePlaybackSpeed = (...args) => (window.cyclePlaybackSpeed ? window.cyclePlaybackSpeed(...args) : undefined);
  let updateSleepTimerUI = (...args) => (window.updateSleepTimerUI ? window.updateSleepTimerUI(...args) : undefined);
  let startSleepTimer = (...args) => (window.startSleepTimer ? window.startSleepTimer(...args) : undefined);
  let stopSleepTimer = (...args) => (window.stopSleepTimer ? window.stopSleepTimer(...args) : undefined);
  let addFeed = (...args) => (window.addFeed ? window.addFeed(...args) : undefined);
  let openConfirmDialog = (...args) => (window.openConfirmDialog ? window.openConfirmDialog(...args) : undefined);
  let promptRemoveFeed = (...args) => (window.promptRemoveFeed ? window.promptRemoveFeed(...args) : undefined);
  let purgeOrphanedDownloads = (...args) => (window.purgeOrphanedDownloads ? window.purgeOrphanedDownloads(...args) : undefined);
  let removeFeed = (...args) => (window.removeFeed ? window.removeFeed(...args) : undefined);
  let importOpml = (...args) => (window.importOpml ? window.importOpml(...args) : undefined);
  let exportOpml = (...args) => (window.exportOpml ? window.exportOpml(...args) : undefined);
  let loadExperimentalSettings = (...args) => (window.loadExperimentalSettings ? window.loadExperimentalSettings(...args) : undefined);
  let setupExperimentalSettings = (...args) => (window.setupExperimentalSettings ? window.setupExperimentalSettings(...args) : undefined);
  let initOrLoadEpisodeTimeline = (...args) => (window.initOrLoadEpisodeTimeline ? window.initOrLoadEpisodeTimeline(...args) : undefined);
  let parseMusicTrackInfo = (...args) => (window.parseMusicTrackInfo ? window.parseMusicTrackInfo(...args) : undefined);
  let fetchLyricsFromLrclib = (...args) => (window.fetchLyricsFromLrclib ? window.fetchLyricsFromLrclib(...args) : undefined);
  let parseVttOrSrtTimestamps = (...args) => (window.parseVttOrSrtTimestamps ? window.parseVttOrSrtTimestamps(...args) : undefined);
  let deriveBarsFromCues = (...args) => (window.deriveBarsFromCues ? window.deriveBarsFromCues(...args) : undefined);
  let deriveSegmentsFromCues = (...args) => (window.deriveSegmentsFromCues ? window.deriveSegmentsFromCues(...args) : undefined);
  let saveTimelineToCommunityCache = (...args) => (window.saveTimelineToCommunityCache ? window.saveTimelineToCommunityCache(...args) : undefined);
  let renderWaveformChart = (...args) => (window.renderWaveformChart ? window.renderWaveformChart(...args) : undefined);
  let hookVisualizerToAudio = (...args) => (window.hookVisualizerToAudio ? window.hookVisualizerToAudio(...args) : undefined);
\n${coreAppBody}\n${coreExportBridge}\n})();\n`;

const playerAppBody = playerAppModules
  .map(rel => {
    const raw = fs.readFileSync(path.join(publicDir, rel), 'utf-8').replace(/^'use strict';\s*/, '');
    return `  // ══ ${rel} ══\n` + raw.split('\n').map(l => (l ? '  ' + l : '')).join('\n');
  })
  .join('\n\n');

const playerImportBridge = `
  // ══ Player Import Bridge (Imports core symbols from window) ══
  const {
    storage = window.storage,
    STORAGE_KEYS = window.STORAGE_KEYS,
    CARD_ICONS = window.CARD_ICONS,
    FALLBACK_ARTWORK = window.FALLBACK_ARTWORK,
    state = window.state,
    elements = window.elements,
    parseDurationSeconds = window.parseDurationSeconds,
    formatTime = window.formatTime,
    escapeHtml = window.escapeHtml,
    syncShowNotesPlayButton = window.syncShowNotesPlayButton,
    logPlayerDiagnostic = window.logPlayerDiagnostic,
    handleYouTubeStateChange = window.handleYouTubeStateChange,
    handleYouTubeError = window.handleYouTubeError,
    navigateTo = window.navigateTo,
    init = window.init,
    saveFeedToD1 = window.saveFeedToD1,
    removeFeedFromD1 = window.removeFeedFromD1,
    savePositionsToStorage = window.savePositionsToStorage,
    savePlaybackPositionToD1 = window.savePlaybackPositionToD1,
    saveMutedFeedsToStorage = window.saveMutedFeedsToStorage,
    saveFeedsToStorage = window.saveFeedsToStorage,
    updateFeedCountUI = window.updateFeedCountUI,
    saveCacheToStorage = window.saveCacheToStorage,
    saveQueueToStorage = window.saveQueueToStorage,
    isEpisodeQueued = window.isEpisodeQueued,
    removeFromQueue = window.removeFromQueue,
    updateQueueUI = window.updateQueueUI,
    getAutoQueueEpisodes = window.getAutoQueueEpisodes,
    renderQueueModalContent = window.renderQueueModalContent,
    updatePlayerFavButton = window.updatePlayerFavButton,
    showToast = window.showToast,
    saveDownloadsToStorage = window.saveDownloadsToStorage,
    refreshAllFeeds = window.refreshAllFeeds,
    fetchSingleFeed = window.fetchSingleFeed,
    updateFilterBadges = window.updateFilterBadges,
    processAndSortEpisodes = window.processAndSortEpisodes,
    renderContinueShelf = window.renderContinueShelf,
    renderTimeline = window.renderTimeline,
    seekToExactTime = window.seekToExactTime,
    switchShowNotesTab = window.switchShowNotesTab,
    renderTranscriptView = window.renderTranscriptView,
    loadEpisodeChapters = window.loadEpisodeChapters,
    renderChapterTicksOnWaveform = window.renderChapterTicksOnWaveform,
    updateActiveChapter = window.updateActiveChapter,
    setupProgressTrackInteractivity = window.setupProgressTrackInteractivity,
    renderFeedsGrid = window.renderFeedsGrid,
    renderFeedDetail = window.renderFeedDetail,
    closeSleepModal = window.closeSleepModal,
    showStatus = window.showStatus,
    hideStatus = window.hideStatus
  } = window;
`;

const playerExportBridge = `
  // ══ Player Export Bridge (Exports player functions to window) ══
  Object.assign(window, {
    setupAudioEngines,
    isEnginePlaying,
    playCurrentEngine,
    pauseCurrentEngine,
    toggleEpisodePlayback,
    playEpisode,
    __realPlayEpisode: playEpisode,
    __realToggleEpisodePlayback: toggleEpisodePlayback,
    startYouTubeBackgroundPaging,
    updateProgress,
    updateDuration,
    playNextEpisode,
    onEpisodeEnded,
    skipToNextEpisode,
    updateAutoplayButtonUI,
    updateShuffleButtonUI,
    toggleShuffle,
    syncMediaSession,
    syncPlaybackButtons,
    updatePlayerUI,
    setPlayerCollapsed,
    cyclePlaybackSpeed,
    updateSleepTimerUI,
    startSleepTimer,
    stopSleepTimer,
    addFeed,
    openConfirmDialog,
    promptRemoveFeed,
    purgeOrphanedDownloads,
    removeFeed,
    importOpml,
    exportOpml,
    loadExperimentalSettings,
    setupExperimentalSettings,
    initOrLoadEpisodeTimeline,
    parseMusicTrackInfo,
    fetchLyricsFromLrclib,
    parseVttOrSrtTimestamps,
    deriveBarsFromCues,
    deriveSegmentsFromCues,
    saveTimelineToCommunityCache,
    renderWaveformChart,
    hookVisualizerToAudio
  });

  // If page was already initialized, initialize audio engines now
  if (window.state && window.elements) {
    if (typeof setupAudioEngines === 'function') setupAudioEngines();
    if (typeof hookVisualizerToAudio === 'function') hookVisualizerToAudio();
    if (typeof updateAutoplayButtonUI === 'function') updateAutoplayButtonUI();
    if (typeof updateShuffleButtonUI === 'function') updateShuffleButtonUI();
    if (typeof loadExperimentalSettings === 'function') loadExperimentalSettings();
    if (typeof setupExperimentalSettings === 'function') setupExperimentalSettings();
    if (typeof restoreLastActiveEpisode === 'function') restoreLastActiveEpisode();
  }
`;

const assembledPlayerJs = `(function () {\n  'use strict';\n\n${playerImportBridge}\n${playerAppBody}\n${playerExportBridge}\n})();\n`;

console.log(`🔧 Assembled in-memory: Core Shell (${coreAppModules.length} modules) + Player Engine (${playerAppModules.length} modules)`);

// Clean up legacy monolithic app.js if present
const legacyAppJs = path.join(publicDir, 'app.js');
if (fs.existsSync(legacyAppJs)) {
  fs.unlinkSync(legacyAppJs);
}

// 1. Bundle and minify Core Shell JS (app.min.js)
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

// 2. Bundle and minify Deferred Audio Player Engine JS (player.min.js)
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

// 3. Assemble and minify CSS directly from modular files in public/styles/
const styleModules = [
  'styles/01-variables.css',
  'styles/02-layout.css',
  'styles/03-timeline-feeds.css',
  'styles/04-discover.css',
  'styles/05-player.css',
  'styles/06-modals.css',
  'styles/07-responsive.css',
  'styles/08-waveform-transcript.css'
];

const assembledCss = styleModules
  .map(rel => `/* ── ${rel} ── */\n` + fs.readFileSync(path.join(publicDir, rel), 'utf-8'))
  .join('\n\n');

await esbuild.build({
  stdin: {
    contents: assembledCss,
    resolveDir: publicDir,
    sourcefile: 'style.css',
    loader: 'css'
  },
  bundle: false,
  minify: true,
  sourcemap: true,
  outfile: path.join(distDir, 'style.min.css'),
  metafile: true
});

// 4. Prepare production HTML in public/dist/index.html
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
  // 4. Replace modular shared/ and app/ script tags with dual minified bundles (core shell + player engine)
  .replace(
    /<!-- Experimental defaults[\s\S]*?<script src="app\/08-waveform-and-ai\.js(\?[^"']*)?" defer><\/script>/i,
    `<script src="app.min.js?v=${v}" defer></script>\n  <script src="player.min.js?v=${v}" defer></script>`
  )
  .replace(
    /<!-- Shared Functional Modules \(AnypodShared\) -->[\s\S]*?<script src="app\/08-waveform-and-ai\.js(\?[^"']*)?" defer><\/script>/i,
    `<script src="app.min.js?v=${v}" defer></script>\n  <script src="player.min.js?v=${v}" defer></script>`
  )
  .replace(/src=["']\/?app\.js(\?[^"']*)?["']/g, `src="app.min.js?v=${v}"`)
  // 5. Normalize any duplicate rel attributes to standard rel="stylesheet"
  .replace(/rel=["']?preload["']?\s+rel=["']?stylesheet["']?/g, 'rel="stylesheet"');

fs.writeFileSync(path.join(distDir, 'index.html'), prodHtml, 'utf-8');

// Provide fallback for any legacy requests to /app.js, /player.js and /style.css
fs.copyFileSync(path.join(distDir, 'app.min.js'), path.join(distDir, 'app.js'));
fs.copyFileSync(path.join(distDir, 'player.min.js'), path.join(distDir, 'player.js'));
fs.copyFileSync(path.join(distDir, 'style.min.css'), path.join(distDir, 'style.css'));

// 5. Auto-copy ALL root static files to dist/
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

// Ensure fallbacks are guaranteed after copy
fs.copyFileSync(path.join(distDir, 'app.min.js'), path.join(distDir, 'app.js'));
fs.copyFileSync(path.join(distDir, 'player.min.js'), path.join(distDir, 'player.js'));
fs.copyFileSync(path.join(distDir, 'style.min.css'), path.join(distDir, 'style.css'));

// 6. Customize dist/sw.js to cache production bundles
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
const originalCssSize = (Buffer.byteLength(assembledCss, 'utf-8') / 1024).toFixed(1);
const minCssSize = (fs.statSync(path.join(distDir, 'style.min.css')).size / 1024).toFixed(1);

console.log(`✅ Core Shell JS:   ${coreMinSize} KB (public/dist/app.min.js)`);
console.log(`✅ Player Engine JS: ${playerMinSize} KB (public/dist/player.min.js)`);
console.log(`✅ Total JS:        ${(parseFloat(coreMinSize) + parseFloat(playerMinSize)).toFixed(1)} KB`);
console.log(`✅ CSS:             ${originalCssSize} KB  →  ${minCssSize} KB (public/dist/style.min.css)`);
console.log('✅ Static: Automatically copied all root assets & subdirectories to dist/');
console.log('✅ HTML: Generated production public/dist/index.html');
console.log('🎉 Production build complete!');
