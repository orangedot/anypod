(function () {
  'use strict';

  const demo = window.StudioDemo;
  const dirs = window.StudioDirectories.directories;
  const shareTargets = window.StudioDirectories.shareTargets;

  const VIEWS = [
    { id: 'overview', label: 'Overview', icon: 'M3 12l9-9 9 9M5 10v10h14V10' },
    { id: 'record', label: 'Record & Cut', icon: 'M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3zM19 10v2a7 7 0 0 1-14 0v-2M12 19v4M8 23h8' },
    { id: 'episodes', label: 'Episodes', icon: 'M4 6h16M4 12h16M4 18h10' },
    { id: 'publish', label: 'Publish', icon: 'M12 16V4m0 0l-4 4m4-4l4 4M4 20h16' },
    { id: 'analytics', label: 'Analytics', icon: 'M4 20V10m6 10V4m6 16v-7m4 7H2' },
    { id: 'distribution', label: 'Distribution', icon: 'M18 8a3 3 0 1 0-3-3 3 3 0 0 0 3 3zM6 15a3 3 0 1 0-3-3 3 3 0 0 0 3 3zm12 7a3 3 0 1 0-3-3 3 3 0 0 0 3 3zM8.6 13.5l6.8 4M15.4 6.5l-6.8 4' },
    { id: 'embed', label: 'Embed', icon: 'M16 18l6-6-6-6M8 6l-6 6 6 6' },
    { id: 'settings', label: 'Plan & Settings', icon: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z' }
  ];

  const state = {
    mode: 'demo',
    token: localStorage.getItem('anypod_session_token') || '',
    user: null,
    plan: {
      id: 'free',
      label: 'Free',
      maxShows: 1,
      maxStorageBytes: 500 * 1024 * 1024,
      maxUploadBytes: 100 * 1024 * 1024,
      maxRecordingSeconds: 1800
    },
    usage: { shows: 0, episodes: 0, bytes: 0 },
    checkoutUrl: 'https://polar.sh/anypod',
    shows: [],
    show: demo.show,
    episodes: demo.episodes,
    downloadsByDay: demo.downloadsByDay,
    view: 'overview',
    file: null,
    analysis: null,
    previewUrl: '',
    cutter: {
      recording: false,
      recorder: null,
      sourceChannels: null,
      sampleRate: 48000,
      edl: null,
      renderedChannels: null,
      measuredLufs: null,
      normalizeLufs: true,
      targetLufs: -16,
      exportFormat: 'mp3',
      audioUrl: '',
      wfEditor: null,
      recoverableSession: null,
      detectedChapters: []
    }
  };

  const els = {
    nav: document.getElementById('st-nav'),
    mobileNav: document.getElementById('st-mobile-nav'),
    root: document.getElementById('st-view-root'),
    banner: document.getElementById('st-demo-banner'),
    showSelect: document.getElementById('st-show-select'),
    toast: document.getElementById('st-toast'),
    claimDialog: document.getElementById('st-claim-dialog'),
    showDialog: document.getElementById('st-show-dialog'),
    claimMsg: document.getElementById('st-claim-msg'),
    railUser: document.getElementById('st-rail-user')
  };

  function esc(value) {
    return String(value === null || value === undefined ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function fmtDuration(sec) {
    const s = Math.max(0, Math.floor(Number(sec) || 0));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const r = s % 60;
    return h > 0
      ? h + ':' + String(m).padStart(2, '0') + ':' + String(r).padStart(2, '0')
      : m + ':' + String(r).padStart(2, '0');
  }

  function fmtMb(bytes) {
    return (Number(bytes || 0) / (1024 * 1024)).toFixed(1) + ' MB';
  }

  function origin() {
    return window.location.origin;
  }

  function feedUrl() {
    return origin() + '/feeds/' + encodeURIComponent(state.show.slug) + '.xml';
  }

  function embedUrl(episodeId) {
    return origin() + '/embed/' + encodeURIComponent(state.show.slug) + (episodeId ? '/' + encodeURIComponent(episodeId) : '');
  }

  function iframeSnippet(episodeId) {
    return '<iframe src="' + embedUrl(episodeId) + '" width="100%" height="230" frameborder="0" allow="autoplay" loading="lazy"></iframe>';
  }

  function toast(message) {
    els.toast.textContent = message;
    els.toast.classList.add('show');
    clearTimeout(toast.timer);
    toast.timer = setTimeout(function () { els.toast.classList.remove('show'); }, 2400);
  }

  function copy(text, label) {
    navigator.clipboard.writeText(text).then(function () { toast(label || 'Copied'); });
  }

  function authHeaders() {
    const headers = { 'Content-Type': 'application/json' };
    if (state.token) {
      headers['X-Session-Token'] = state.token;
      headers['Authorization'] = 'Bearer ' + state.token;
    }
    return headers;
  }

  function svg(path) {
    return '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="' + path + '"></path></svg>';
  }

  function renderNav() {
    const html = VIEWS.map(function (v) {
      return '<button type="button" class="st-nav-item' + (state.view === v.id ? ' active' : '') + '" data-view="' + v.id + '">' + svg(v.icon) + '<span>' + v.label + '</span></button>';
    }).join('');
    els.nav.innerHTML = html;
    const mobile = VIEWS.filter(function (v) { return v.id !== 'embed' && v.id !== 'settings'; });
    els.mobileNav.innerHTML = mobile.map(function (v) {
      return '<button type="button" class="st-nav-item' + (state.view === v.id ? ' active' : '') + '" data-view="' + v.id + '">' + svg(v.icon) + '<span>' + v.label + '</span></button>';
    }).join('');
  }

  function renderShowSelect() {
    if (state.mode === 'demo') {
      els.showSelect.innerHTML = '<option>' + esc(demo.show.title) + ' (demo)</option>';
      els.showSelect.disabled = true;
      return;
    }
    els.showSelect.disabled = false;
    els.showSelect.innerHTML = state.shows.map(function (s) {
      return '<option value="' + esc(s.slug) + '"' + (s.slug === state.show.slug ? ' selected' : '') + '>' + esc(s.title) + '</option>';
    }).join('');
  }

  function renderBanner() {
    if (state.mode === 'demo') {
      els.banner.classList.remove('hidden');
      els.railUser.textContent = 'Demo mode · Guest';
    } else {
      els.banner.classList.add('hidden');
      const email = (state.user && state.user.email) || 'Signed in';
      els.railUser.textContent = email + ' · ' + state.plan.label.toUpperCase();
    }
  }

  function pageHeader(title, sub, actionsHtml) {
    return '<div class="st-topbar"><div><h1 class="st-page-title">' + esc(title) + '</h1><p class="st-page-sub">' + esc(sub) + '</p></div><div class="st-actions">' + (actionsHtml || '') + '</div></div>';
  }

  function copyRow(label, value, toastLabel) {
    return '<div class="st-copy-row"><span class="st-copy-label">' + esc(label) + '</span><span class="st-copy-value">' + esc(value) + '</span><button type="button" class="st-btn st-btn-sm" data-copy="' + esc(value) + '" data-toast="' + esc(toastLabel || label + ' copied') + '">Copy</button></div>';
  }

  function coverHtml() {
    if (state.show.cover_image_url) {
      return '<img class="st-cover" src="' + esc(state.show.cover_image_url) + '" alt="' + esc(state.show.title) + '">';
    }
    return '<div class="st-cover st-cover-fallback">' + esc((state.show.title || 'A').charAt(0).toUpperCase()) + '</div>';
  }

  function totalDownloads() {
    return state.episodes.reduce(function (sum, e) { return sum + (e.downloads || 0); }, 0);
  }

  function totalBytesServed() {
    return state.episodes.reduce(function (sum, e) { return sum + (e.bytes || 0) * (e.downloads || 0); }, 0);
  }

  function s3Cost() {
    return (totalBytesServed() / (1024 * 1024 * 1024)) * 0.09;
  }

  function distKey() {
    return 'studio_dist_' + state.show.slug;
  }

  function loadDist() {
    try {
      return JSON.parse(localStorage.getItem(distKey()) || '{}');
    } catch (_) {
      return {};
    }
  }

  function saveDist(map) {
    localStorage.setItem(distKey(), JSON.stringify(map));
  }

  function viewOverview() {
    const dist = loadDist();
    const done = dirs.filter(function (d) { return dist[d.id]; }).length;
    const latest = state.episodes[0];
    return pageHeader('Overview', state.show.title, '<button type="button" class="st-btn" data-view="record">Record in studio</button><button type="button" class="st-btn st-btn-primary" data-view="publish">New episode</button>') +
      '<div class="st-content">' +
      '<div class="st-card"><div class="st-overview-hero">' + coverHtml() +
      '<div class="st-hero-meta"><h2 class="st-hero-title">' + esc(state.show.title) + '</h2>' +
      '<p class="st-hero-host">' + esc(state.show.author || 'Host') + '</p>' +
      '<div class="st-chips"><span class="st-chip st-chip-accent">' + esc(state.show.category || 'Podcast') + '</span><span class="st-chip">' + esc(state.show.language || 'en') + '</span><span class="st-chip st-chip-ok">Podcasting 2.0</span><span class="st-chip">' + (state.show.explicit ? 'Explicit' : 'Clean') + '</span></div>' +
      '<p class="st-page-sub">' + esc(state.show.description || '') + '</p></div></div>' +
      copyRow('RSS', feedUrl(), 'RSS feed copied') +
      copyRow('GUID', state.show.guid || 'generated on first feed load', 'Podcast GUID copied') +
      copyRow('Embed', embedUrl(), 'Player link copied') +
      '</div>' +
      '<div class="st-grid st-grid-4">' +
      '<div class="st-card st-stat"><span class="st-stat-label">Episodes</span><span class="st-stat-value">' + state.episodes.length + '</span><span class="st-stat-note">' + (latest ? 'Latest: ' + esc(latest.title) : 'No episodes yet') + '</span></div>' +
      '<div class="st-card st-stat"><span class="st-stat-label">Downloads</span><span class="st-stat-value">' + totalDownloads().toLocaleString() + '</span><span class="st-stat-note">All time</span></div>' +
      '<div class="st-card st-stat"><span class="st-stat-label">R2 bandwidth cost</span><span class="st-stat-value st-stat-ok">$0.00</span><span class="st-stat-note">vs $' + s3Cost().toFixed(2) + ' on S3</span></div>' +
      '<div class="st-card st-stat"><span class="st-stat-label">Directories</span><span class="st-stat-value">' + done + '/' + dirs.length + '</span><span class="st-stat-note"><button type="button" class="st-btn st-btn-sm st-btn-ghost" data-view="distribution">Open checklist</button></span></div>' +
      '</div>' + shareCard() + '</div>';
  }

  function shareCard() {
    const text = 'Listen to ' + state.show.title;
    const links = shareTargets.map(function (t) {
      return '<a class="st-btn st-btn-sm" href="' + esc(t.url(embedUrl(), text)) + '" target="_blank" rel="noopener noreferrer">' + esc(t.name) + '</a>';
    }).join('');
    return '<div class="st-card"><div class="st-card-head"><div><h3 class="st-card-title">Share your show</h3><p class="st-card-sub">Spread the word everywhere your audience already is.</p></div><button type="button" class="st-btn st-btn-sm" data-native-share="1">Share…</button></div><div class="st-share-row">' + links +
      '<button type="button" class="st-btn st-btn-sm" data-copy="' + esc(embedUrl()) + '" data-toast="Link copied">Copy link</button></div></div>';
  }

  function viewRecord() {
    const isGuest = state.mode === 'demo';
    const maxMin = Math.round((state.plan.maxRecordingSeconds || 1800) / 60);
    const gateCard = isGuest
      ? '<div class="st-card" id="st-record-gate-card"><div class="st-card-head"><div><h3 class="st-card-title">Registered Creator Feature</h3><p class="st-card-sub">Recording & non-destructive cutting is reserved for registered creators. Sign in free (1 show, 500 MB R2 storage, 30 min takes) or upgrade to Pro (10 shows, 50 GB storage, 60 min takes). You can also load our synthetic studio tone below to test the cutter right now.</p></div><div class="st-actions"><button type="button" class="st-btn" id="st-btn-load-synth">Load test voice & tone</button><button type="button" class="st-btn st-btn-primary" data-open-claim="1">Sign in free to record</button></div></div></div>'
      : '';

    const recoveryBanner = state.cutter.recoverableSession
      ? '<div class="st-card" id="st-recovery-card"><div class="st-card-head"><div><h3 class="st-card-title">Unsaved recording found</h3><p class="st-card-sub">Recovered ' + state.cutter.recoverableSession.chunkCount + ' chunks (' + fmtMb(state.cutter.recoverableSession.totalBytes) + ') from crash-safe storage.</p></div><div class="st-actions"><button type="button" class="st-btn st-btn-primary" id="st-btn-recover-session">Recover take</button><button type="button" class="st-btn" id="st-btn-discard-session">Discard</button></div></div></div>'
      : '';

    const edl = state.cutter.edl;
    const outSamples = edl ? edl.getTotalOutputSamples() : 0;
    const outSec = outSamples / (state.cutter.sampleRate || 48000);
    const lufsInfo = state.cutter.measuredLufs
      ? 'Integrated: ' + state.cutter.measuredLufs.lufs + ' LUFS · True Peak: ' + state.cutter.measuredLufs.peakDbtp + ' dBTP'
      : 'No audio loaded';

    return pageHeader('Recording Studio & Cutter', 'Non-destructive EDL · Zero-crossing cuts · ITU-R BS.1770 LUFS mastering · MP3 / WAV export', '<span class="st-chip st-chip-accent">' + esc(state.plan.label) + ' plan · max ' + maxMin + ' min take</span>') +
      '<div class="st-content">' +
      gateCard +
      recoveryBanner +
      '<div class="st-card">' +
      '<div class="st-card-head"><div><h3 class="st-card-title">1. Capture Studio Audio</h3><p class="st-card-sub">Echo cancellation, noise suppression and auto-gain are disabled for clean broadcast voice. Use headphones to prevent feedback.</p></div>' +
      '<div class="st-actions"><select class="st-select" id="st-mic-select" style="width:220px"><option value="default">Default Microphone</option></select>' +
      '<button type="button" class="st-btn st-btn-primary" id="st-btn-rec-start"' + (isGuest ? ' data-guest-locked="1"' : '') + '>● Record</button>' +
      '<button type="button" class="st-btn" id="st-btn-rec-stop" disabled>■ Stop</button>' +
      '<label class="st-btn" style="cursor:pointer">Import file<input type="file" id="st-cutter-file" accept="audio/*,.wav,.mp3,.m4a" hidden></label></div></div>' +
      '<div class="st-grid st-grid-3">' +
      '<div class="st-cost-box"><span class="st-stat-label">Live Level Meter</span><div class="st-progress" style="height:10px;margin-top:6px"><div class="st-progress-fill" id="st-meter-bar" style="width:0%"></div></div><span class="st-ep-sub" id="st-meter-text">-90.0 dB · Ready</span></div>' +
      '<div class="st-cost-box"><span class="st-stat-label">Elapsed / Limit</span><span class="st-cost-amount" id="st-rec-timer">0:00</span><span class="st-ep-sub">Crash-safe chunks saved every 1s</span></div>' +
      '<div class="st-cost-box"><span class="st-stat-label">Loudness & Peak</span><span class="st-ep-title" id="st-lufs-readout">' + esc(lufsInfo) + '</span><span class="st-ep-sub">Target: -16 LUFS / -1.0 dBTP</span></div>' +
      '</div></div>' +
      '<div class="st-card">' +
      '<div class="st-card-head"><div><h3 class="st-card-title">2. Non-Destructive Waveform Cutter</h3><p class="st-card-sub">Click to seek, drag to select range. Keys: Space play/pause · S split at playhead · Backspace ripple-delete · Cmd+Z undo</p></div>' +
      '<div class="st-actions">' +
      '<button type="button" class="st-btn st-btn-sm" id="st-btn-cut-split">Split (S)</button>' +
      '<button type="button" class="st-btn st-btn-sm" id="st-btn-cut-ripple">Ripple delete</button>' +
      '<button type="button" class="st-btn st-btn-sm" id="st-btn-cut-silence">Tighten silences</button>' +
      '<button type="button" class="st-btn st-btn-sm" id="st-btn-cut-music">Remove music segments</button>' +
      '<button type="button" class="st-btn st-btn-sm" id="st-btn-cut-undo"' + (edl && edl.canUndo() ? '' : ' disabled') + '>Undo</button>' +
      '<button type="button" class="st-btn st-btn-sm" id="st-btn-cut-redo"' + (edl && edl.canRedo() ? '' : ' disabled') + '>Redo</button>' +
      '<select class="st-select" id="st-cut-zoom" style="width:96px"><option value="1">1x</option><option value="2">2x</option><option value="4">4x</option><option value="8">8x</option></select>' +
      '</div></div>' +
      '<canvas id="st-cutter-canvas" style="width:100%;height:148px;border-radius:8px;border:1px solid var(--st-border);cursor:crosshair"></canvas>' +
      '<div class="st-card-head"><span class="st-ep-sub" id="st-edl-summary">Regions: ' + (edl ? edl.getRegions().length : 0) + ' · Output duration: ' + fmtDuration(outSec) + '</span>' +
      '<audio id="st-cutter-audio" controls style="height:34px;width:340px"' + (state.cutter.audioUrl ? ' src="' + esc(state.cutter.audioUrl) + '"' : '') + '></audio></div>' +
      '</div>' +
      '<div class="st-card">' +
      '<div class="st-card-head"><div><h3 class="st-card-title">3. Loudness Mastering & Export</h3><p class="st-card-sub">Render with 6 ms raised-cosine crossfades and loudness normalisation, then send straight to Publish.</p></div>' +
      '<div class="st-actions">' +
      '<label class="st-chip" style="cursor:pointer"><input type="checkbox" id="st-chk-norm"' + (state.cutter.normalizeLufs ? ' checked' : '') + ' style="margin-right:6px">Normalise to -16 LUFS</label>' +
      '<select class="st-select" id="st-export-format" style="width:160px"><option value="mp3"' + (state.cutter.exportFormat === 'mp3' ? ' selected' : '') + '>MP3 (128 kbps)</option><option value="wav"' + (state.cutter.exportFormat === 'wav' ? ' selected' : '') + '>WAV (16-bit PCM)</option></select>' +
      '<button type="button" class="st-btn" id="st-btn-download-export"' + (outSamples ? '' : ' disabled') + '>Download file</button>' +
      '<button type="button" class="st-btn st-btn-primary" id="st-btn-send-publish"' + (outSamples ? '' : ' disabled') + '>Send to Publish →</button>' +
      '</div></div>' +
      '<span class="st-ep-sub" id="st-export-status"></span>' +
      '</div></div>';
  }

  function viewEpisodes() {
    const rows = state.episodes.map(function (e) {
      return '<tr><td class="st-num">' + (e.number || '·') + '</td>' +
        '<td><div class="st-ep-title">' + esc(e.title) + '</div><div class="st-ep-sub">' + esc(e.published || '') + '</div></td>' +
        '<td class="st-num">' + fmtDuration(e.durationSeconds) + '</td>' +
        '<td class="st-num">' + fmtMb(e.bytes) + '</td>' +
        '<td class="st-num">' + (e.downloads || 0).toLocaleString() + '</td>' +
        '<td><div class="st-actions">' +
        '<button type="button" class="st-btn st-btn-sm" data-preview-ep="' + esc(e.id) + '">Chapters</button>' +
        '<button type="button" class="st-btn st-btn-sm" data-copy="' + esc(iframeSnippet(e.id)) + '" data-toast="Embed code copied">Embed</button>' +
        '<a class="st-btn st-btn-sm" href="' + esc(embedUrl(e.id)) + '" target="_blank" rel="noopener noreferrer">Open</a>' +
        '</div></td></tr>';
    }).join('');
    const body = state.episodes.length
      ? '<div class="st-table-wrap"><table class="st-table"><thead><tr><th>#</th><th>Episode</th><th>Duration</th><th>Size</th><th>Downloads</th><th></th></tr></thead><tbody>' + rows + '</tbody></table></div>'
      : '<p class="st-card-sub">No episodes yet. Publish your first one.</p>';
    return pageHeader('Episodes', state.episodes.length + ' published', '<button type="button" class="st-btn st-btn-primary" data-view="publish">New episode</button>') +
      '<div class="st-content"><div class="st-card">' + body + '</div><div id="st-chapter-panel"></div></div>';
  }

  function renderChapterPanel(episodeId) {
    const ep = state.episodes.find(function (e) { return e.id === episodeId; });
    const panel = document.getElementById('st-chapter-panel');
    if (!ep || !panel) return;
    const chapters = (ep.chapters && ep.chapters.length)
      ? ep.chapters.map(function (c) {
        return '<div class="st-chapter"><span>' + esc(c.title) + '</span><span class="st-num">' + fmtDuration(c.startTime) + '</span></div>';
      }).join('')
      : '<p class="st-card-sub">Chapters load from the episode chapters file.</p>';
    panel.innerHTML = '<div class="st-card"><div class="st-card-head"><div><h3 class="st-card-title">' + esc(ep.title) + '</h3><p class="st-card-sub">Podcasting 2.0 chapter inspector</p></div></div>' +
      (ep.peaks ? '<div class="st-wave">' + waveBars(ep.peaks, ep.chapters, ep.durationSeconds) + '</div>' : '') +
      '<div class="st-chapter-list">' + chapters + '</div></div>';
  }

  function waveBars(peaks, chapters, duration) {
    return peaks.map(function (p, i) {
      const t = (i / peaks.length) * (duration || 1);
      let kind = '';
      (chapters || []).forEach(function (c) {
        if (t >= c.startTime) kind = String(c.title).toLowerCase().indexOf('music') === 0 ? 'music' : 'talk';
      });
      return '<div class="st-wave-bar ' + kind + '" style="height:' + Math.max(10, Math.round(p * 100)) + '%"></div>';
    }).join('');
  }

  function viewPublish() {
    const fileMeta = state.file ? esc(state.file.name) + ' · ' + fmtMb(state.file.size) : 'Drag and drop audio or click to browse';
    const analysisBlock = state.analysis
      ? '<div class="st-field full"><label>Waveform and detected segments</label><div class="st-wave" id="st-wave-preview">' + waveBars(state.analysis.waveformPeaks, state.analysis.chapters, state.analysis.durationSeconds) + '</div><audio id="st-audio-preview" controls style="width:100%;margin-top:8px" src="' + esc(state.previewUrl) + '"></audio><div class="st-chapter-list">' +
        state.analysis.chapters.map(function (c) { return '<div class="st-chapter"><span>' + esc(c.title) + '</span><span class="st-num">' + fmtDuration(c.startTime) + '</span></div>'; }).join('') + '</div></div>'
      : '';
    return pageHeader('Publish', 'Audio is analysed in your browser. Zero server CPU.', '<button type="button" class="st-btn" data-view="record">Open Recorder & Cutter</button>') +
      '<div class="st-content"><form class="st-card" id="st-publish-form"><div class="st-form-grid">' +
      '<div class="st-field"><label>Episode title</label><input class="st-input" id="st-ep-title" required placeholder="Episode 4: The Quantum Leap"></div>' +
      '<div class="st-field"><label>Episode number</label><input class="st-input" id="st-ep-number" type="number" placeholder="4"></div>' +
      '<div class="st-field full"><label>Show notes</label><textarea class="st-textarea" id="st-ep-desc" placeholder="What is this episode about?"></textarea></div>' +
      '<div class="st-field full"><label>Audio file</label><div class="st-dropzone" id="st-dropzone"><strong id="st-dz-label">' + fileMeta + '</strong><span class="st-card-sub">MP3, M4A or WAV</span><input type="file" id="st-file-input" accept="audio/*,.mp3,.m4a,.wav" hidden></div></div>' +
      '<div class="st-field full hidden" id="st-analysis-status"><span class="st-card-sub" id="st-analysis-text"></span></div>' +
      analysisBlock +
      '<div class="st-field full hidden" id="st-upload-wrap"><span class="st-card-sub" id="st-upload-text"></span><div class="st-progress"><div class="st-progress-fill" id="st-upload-bar"></div></div></div>' +
      '</div><div class="st-actions"><button type="submit" class="st-btn st-btn-primary" id="st-publish-btn"' + (state.analysis ? '' : ' disabled') + '>' + (state.mode === 'demo' ? 'Save and publish' : 'Publish to Cloudflare R2') + '</button></div></form></div>';
  }

  function viewAnalytics() {
    const max = Math.max.apply(null, state.downloadsByDay.concat([1]));
    const bars = state.downloadsByDay.map(function (v) {
      return '<div class="st-bar" title="' + v + ' downloads" style="height:' + Math.round((v / max) * 100) + '%"></div>';
    }).join('');
    const gb = totalBytesServed() / (1024 * 1024 * 1024);
    return pageHeader('Analytics', 'Last 14 days', '') +
      '<div class="st-content"><div class="st-card"><div class="st-card-head"><div><h3 class="st-card-title">Downloads per day</h3><p class="st-card-sub">' + state.downloadsByDay.reduce(function (a, b) { return a + b; }, 0).toLocaleString() + ' downloads</p></div></div><div class="st-bars">' + bars + '</div><div class="st-bar-labels"><span>14 days ago</span><span>Today</span></div></div>' +
      '<div class="st-card"><div class="st-card-head"><div><h3 class="st-card-title">Bandwidth cost</h3><p class="st-card-sub">' + gb.toFixed(2) + ' GB served in total</p></div></div><div class="st-cost-compare"><div class="st-cost-box"><span class="st-stat-label">Typical host on S3 at $0.09/GB</span><span class="st-cost-amount">$' + s3Cost().toFixed(2) + '</span></div><div class="st-cost-box win"><span class="st-stat-label">Anypod Studio on Cloudflare R2</span><span class="st-cost-amount st-stat-ok">$0.00</span></div></div></div>' +
      '<div class="st-card"><h3 class="st-card-title">Top episodes</h3><div class="st-table-wrap"><table class="st-table"><tbody>' +
      state.episodes.slice().sort(function (a, b) { return (b.downloads || 0) - (a.downloads || 0); }).map(function (e) {
        return '<tr><td>' + esc(e.title) + '</td><td class="st-num">' + (e.downloads || 0).toLocaleString() + '</td></tr>';
      }).join('') + '</tbody></table></div></div></div>';
  }

  function viewDistribution() {
    const dist = loadDist();
    const done = dirs.filter(function (d) { return dist[d.id]; }).length;
    const pct = Math.round((done / dirs.length) * 100);
    const cards = dirs.map(function (d) {
      const checked = !!dist[d.id];
      const subscribe = d.subscribeScheme ? d.subscribeScheme(feedUrl(), origin()) : null;
      return '<div class="st-dist-card"><div class="st-dist-head"><div class="st-dist-logo" style="background:' + d.color + '">' + esc(d.letter) + '</div><div><div class="st-dist-name">' + esc(d.name) + '</div><div class="st-dist-hint">' + esc(d.hint) + '</div></div></div>' +
        '<div class="st-dist-foot"><label class="st-chip' + (checked ? ' st-chip-ok' : '') + '" style="cursor:pointer"><input type="checkbox" data-dist="' + d.id + '"' + (checked ? ' checked' : '') + ' style="margin-right:6px">' + (checked ? 'Submitted' : 'Mark submitted') + '</label><div class="st-actions">' +
        (d.submitUrl ? '<a class="st-btn st-btn-sm st-btn-primary" href="' + esc(d.submitUrl) + '" target="_blank" rel="noopener noreferrer" data-copy-feed="1">Submit feed</a>' : '') +
        (subscribe ? '<a class="st-btn st-btn-sm" href="' + esc(subscribe) + '">Subscribe</a>' : '') +
        '</div></div></div>';
    }).join('');
    return pageHeader('Distribution', 'Submit once, appear in every podcast app', '') +
      '<div class="st-content"><div class="st-card"><div class="st-card-head"><div><h3 class="st-card-title">Distribution checklist</h3><p class="st-card-sub">' + done + ' of ' + dirs.length + ' directories submitted. Your RSS feed is copied automatically when you press Submit feed.</p></div></div>' +
      '<div class="st-progress"><div class="st-progress-fill" style="width:' + pct + '%"></div></div>' + copyRow('RSS', feedUrl(), 'RSS feed copied') + '</div>' +
      '<div class="st-grid st-grid-2">' + cards + '</div>' + shareCard() + '</div>';
  }

  function viewEmbed() {
    const latest = state.episodes[0];
    const id = latest ? latest.id : null;
    return pageHeader('Embed', 'Drop your player on any site, newsletter or Substack', '') +
      '<div class="st-content"><div class="st-grid st-grid-2"><div class="st-card"><h3 class="st-card-title">Live preview</h3><iframe class="st-embed-preview" id="st-embed-frame" src="' + esc(embedUrl(id) + '?theme=dark') + '" loading="lazy"></iframe>' +
      '<div class="st-actions" style="justify-content:flex-start"><button type="button" class="st-btn st-btn-sm" data-embed-theme="dark">Dark</button><button type="button" class="st-btn st-btn-sm" data-embed-theme="light">Light</button></div></div>' +
      '<div class="st-card"><h3 class="st-card-title">Embed code</h3><div class="st-code" id="st-embed-code">' + esc(iframeSnippet(id)) + '</div><div class="st-actions" style="justify-content:flex-start"><button type="button" class="st-btn st-btn-primary" data-copy="' + esc(iframeSnippet(id)) + '" data-toast="Embed code copied">Copy embed code</button></div>' +
      '<p class="st-card-sub">The player supports dark and light mode, talk and music skipping, chapters and interactive transcripts.</p></div></div></div>';
  }

  function viewSettings() {
    const usedBytes = state.usage.bytes || 0;
    const maxBytes = state.plan.maxStorageBytes || (500 * 1024 * 1024);
    const pct = Math.min(100, Math.round((usedBytes / maxBytes) * 100));
    const isPro = state.plan.id === 'pro';

    return pageHeader('Plan & Settings', 'Creator quota, R2 storage and Pro upgrade', '') +
      '<div class="st-content">' +
      '<div class="st-grid st-grid-2">' +
      '<div class="st-card"><div class="st-card-head"><div><h3 class="st-card-title">Current Plan: ' + esc(state.plan.label) + '</h3><p class="st-card-sub">' + (state.mode === 'demo' ? 'Sign in for a free creator account (1 show, 500 MB storage, 30 min studio recording).' : 'Shows: ' + state.usage.shows + ' / ' + state.plan.maxShows + ' · Storage: ' + fmtMb(usedBytes) + ' / ' + fmtMb(maxBytes)) + '</p></div><span class="st-chip ' + (isPro ? 'st-chip-ok' : 'st-chip-accent') + '">' + esc(state.plan.label.toUpperCase()) + '</span></div>' +
      '<div class="st-progress"><div class="st-progress-fill" style="width:' + pct + '%"></div></div>' +
      '<div class="st-actions" style="justify-content:flex-start">' +
      (state.mode === 'demo' ? '<button type="button" class="st-btn st-btn-primary" data-open-claim="1">Sign in free</button>' : '<button type="button" class="st-btn" data-open-show="1">Create new show</button>') +
      '</div></div>' +
      '<div class="st-card"><div class="st-card-head"><div><h3 class="st-card-title">Anypod Studio Pro</h3><p class="st-card-sub">10 hosted shows · 50 GB R2 audio storage · 60 min studio recording takes · Zero egress fees forever.</p></div><span class="st-chip st-chip-ok">$9 / mo</span></div>' +
      '<div class="st-actions" style="justify-content:flex-start">' +
      (isPro
        ? '<span class="st-chip st-chip-ok">Pro Active</span>'
        : '<a class="st-btn st-btn-primary" href="' + esc(state.checkoutUrl) + '" target="_blank" rel="noopener noreferrer">Checkout Pro</a><button type="button" class="st-btn" id="st-btn-upgrade-pro">Instant Pro Preview</button>') +
      '</div></div>' +
      '</div>' +
      '<div class="st-card"><h3 class="st-card-title">Open source</h3><p class="st-card-sub">Anypod Studio is licensed under the GNU AGPLv3. MP3 encoding powered by LAME (lame.sourceforge.net, LGPL-3.0).</p><div class="st-actions" style="justify-content:flex-start"><a class="st-btn" href="https://github.com/orangedot/anypod" target="_blank" rel="noopener noreferrer">GitHub (Open Source)</a><a class="st-btn" href="/">Back to player</a></div></div></div>';
  }

  const viewMap = {
    overview: viewOverview,
    record: viewRecord,
    episodes: viewEpisodes,
    publish: viewPublish,
    analytics: viewAnalytics,
    distribution: viewDistribution,
    embed: viewEmbed,
    settings: viewSettings
  };

  function render() {
    renderNav();
    renderShowSelect();
    renderBanner();
    els.root.innerHTML = (viewMap[state.view] || viewOverview)();
    if (state.view === 'publish') bindPublish();
    if (state.view === 'record') bindRecordView();
    if (state.view === 'settings') bindSettingsView();
  }

  function navigate(view, push) {
    if (!viewMap[view]) view = 'overview';
    state.view = view;
    if (push !== false) {
      history.pushState({ view: view }, '', '/studio?view=' + view);
    }
    render();
    window.scrollTo(0, 0);
  }

  function refreshCutterPreview() {
    if (!state.cutter.sourceChannels || !state.cutter.edl) return;
    const rendered = window.StudioEdl.renderEdlChannels(
      state.cutter.sourceChannels,
      state.cutter.edl,
      state.cutter.sampleRate,
      6
    );
    state.cutter.renderedChannels = rendered;
    state.cutter.measuredLufs = window.StudioLoudness.measureIntegratedLufs(rendered, state.cutter.sampleRate);

    const wavBytes = window.StudioEncoder.encodeWavPcm16(rendered, state.cutter.sampleRate);
    if (state.cutter.audioUrl) URL.revokeObjectURL(state.cutter.audioUrl);
    state.cutter.audioUrl = URL.createObjectURL(new Blob([wavBytes], { type: 'audio/wav' }));

    const audioEl = document.getElementById('st-cutter-audio');
    if (audioEl) audioEl.src = state.cutter.audioUrl;

    const lufsEl = document.getElementById('st-lufs-readout');
    if (lufsEl) {
      lufsEl.textContent = 'Integrated: ' + state.cutter.measuredLufs.lufs + ' LUFS · True Peak: ' + state.cutter.measuredLufs.peakDbtp + ' dBTP';
    }

    const summaryEl = document.getElementById('st-edl-summary');
    if (summaryEl) {
      const outSec = rendered[0].length / state.cutter.sampleRate;
      summaryEl.textContent = 'Regions: ' + state.cutter.edl.getRegions().length + ' · Output duration: ' + fmtDuration(outSec);
    }

    const undoBtn = document.getElementById('st-btn-cut-undo');
    const redoBtn = document.getElementById('st-btn-cut-redo');
    const dlBtn = document.getElementById('st-btn-download-export');
    const sendBtn = document.getElementById('st-btn-send-publish');
    if (undoBtn) undoBtn.disabled = !state.cutter.edl.canUndo();
    if (redoBtn) redoBtn.disabled = !state.cutter.edl.canRedo();
    if (dlBtn) dlBtn.disabled = rendered[0].length === 0;
    if (sendBtn) sendBtn.disabled = rendered[0].length === 0;

    if (state.cutter.wfEditor) {
      state.cutter.wfEditor.setData(rendered[0], state.cutter.sampleRate, state.cutter.edl.getRegions());
    }
  }

  function loadChannelDataIntoCutter(channels, sampleRate) {
    state.cutter.sourceChannels = channels;
    state.cutter.sampleRate = sampleRate || 48000;
    state.cutter.edl = window.StudioEdl.createEdl(channels[0].length, state.cutter.sampleRate, channels[0]);
    refreshCutterPreview();
  }

  async function decodeArrayBufferIntoCutter(arrayBuffer) {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    const ctx = new AudioCtx();
    try {
      const audioBuffer = await ctx.decodeAudioData(arrayBuffer.slice(0));
      const chs = [];
      for (let c = 0; c < audioBuffer.numberOfChannels; c++) {
        chs.push(new Float32Array(audioBuffer.getChannelData(c)));
      }
      if (window.AnypodStudio && window.AnypodStudio.analyzeCreatorAudioBuffer) {
        const analysis = await window.AnypodStudio.analyzeCreatorAudioBuffer(arrayBuffer.slice(0), 120);
        state.cutter.detectedChapters = analysis.chapters || [];
      }
      loadChannelDataIntoCutter(chs, audioBuffer.sampleRate);
    } finally {
      if (ctx.close) ctx.close().catch(function () {});
    }
  }

  function generateSyntheticVoiceTake() {
    const rate = 48000;
    const durationSec = 6;
    const total = rate * durationSec;
    const samples = new Float32Array(total);
    for (let i = 0; i < total; i++) {
      const t = i / rate;
      if (t >= 2.0 && t < 3.2) {
        samples[i] = 0;
      } else if (t >= 4.2 && t < 5.0) {
        samples[i] = 0.25 * Math.sin(2 * Math.PI * 5200 * t);
      } else {
        samples[i] = 0.35 * Math.sin(2 * Math.PI * 440 * t) + 0.15 * Math.sin(2 * Math.PI * 880 * t);
      }
    }
    state.cutter.detectedChapters = [
      { startTime: 0, title: 'talk ⏭ (1)', kind: 'talk' },
      { startTime: 4.2, title: 'music ⏭ (2)', kind: 'music' },
      { startTime: 5.0, title: 'talk ⏭ (3)', kind: 'talk' }
    ];
    loadChannelDataIntoCutter([samples], rate);
  }

  async function renderMasteredExportFile() {
    if (!state.cutter.renderedChannels || !state.cutter.renderedChannels[0].length) {
      throw new Error('Nothing to export');
    }
    let chs = state.cutter.renderedChannels;
    if (state.cutter.normalizeLufs) {
      const norm = window.StudioLoudness.normalizeChannelsToTargetLufs(chs, state.cutter.sampleRate, {
        targetLufs: -16,
        ceilingDbtp: -1.0
      });
      chs = norm.channels;
    }
    const fmt = state.cutter.exportFormat || 'mp3';
    if (fmt === 'mp3') {
      const mp3Bytes = await window.StudioEncoder.encodeMp3(chs, state.cutter.sampleRate, 128);
      return new File([mp3Bytes], 'studio-take-' + Date.now() + '.mp3', { type: 'audio/mpeg' });
    }
    const wavBytes = window.StudioEncoder.encodeWavPcm16(chs, state.cutter.sampleRate);
    return new File([wavBytes], 'studio-take-' + Date.now() + '.wav', { type: 'audio/wav' });
  }

  function bindRecordView() {
    const canvas = document.getElementById('st-cutter-canvas');
    const audioEl = document.getElementById('st-cutter-audio');

    if (canvas && window.StudioWaveform) {
      state.cutter.wfEditor = window.StudioWaveform.createWaveformEditor(canvas, {
        onSeek: function (sec) {
          if (audioEl && isFinite(sec)) {
            audioEl.currentTime = sec;
          }
        },
        onSelectionChange: function () {}
      });
      if (state.cutter.renderedChannels && state.cutter.edl) {
        state.cutter.wfEditor.setData(
          state.cutter.renderedChannels[0],
          state.cutter.sampleRate,
          state.cutter.edl.getRegions()
        );
      } else {
        state.cutter.wfEditor.draw();
      }
    }

    if (audioEl) {
      audioEl.addEventListener('timeupdate', function () {
        if (state.cutter.wfEditor) {
          state.cutter.wfEditor.setPlayheadSeconds(audioEl.currentTime || 0);
        }
      });
    }

    if (window.StudioRecorder) {
      window.StudioRecorder.listAudioInputs().then(function (inputs) {
        const sel = document.getElementById('st-mic-select');
        if (!sel || !inputs.length) return;
        sel.innerHTML = inputs.map(function (d) {
          return '<option value="' + esc(d.deviceId) + '">' + esc(d.label) + '</option>';
        }).join('');
      });

      const store = window.StudioRecorder.createDefaultCrashStore();
      store.getRecoverableSession().then(function (sess) {
        if (sess && sess.status === 'recording' && !state.cutter.recoverableSession) {
          state.cutter.recoverableSession = sess;
          render();
        }
      }).catch(function () {});
    }

    const synthBtn = document.getElementById('st-btn-load-synth');
    if (synthBtn) {
      synthBtn.addEventListener('click', function () {
        generateSyntheticVoiceTake();
        toast('Loaded 6s test voice & tone');
      });
    }

    const recBtn = document.getElementById('st-btn-rec-start');
    const stopBtn = document.getElementById('st-btn-rec-stop');
    if (recBtn) {
      recBtn.addEventListener('click', async function () {
        if (state.mode === 'demo') {
          openClaim();
          return;
        }
        try {
          const micSel = document.getElementById('st-mic-select');
          const deviceId = micSel ? micSel.value : 'default';
          const meterBar = document.getElementById('st-meter-bar');
          const meterText = document.getElementById('st-meter-text');
          const timerEl = document.getElementById('st-rec-timer');
          const maxSec = state.plan.maxRecordingSeconds || 1800;

          state.cutter.recorder = window.StudioRecorder.createLiveRecorder({
            onMeter: function (m) {
              const pct = Math.max(0, Math.min(100, Math.round(((m.db + 60) / 60) * 100)));
              if (meterBar) meterBar.style.width = pct + '%';
              if (meterText) {
                meterText.textContent = m.db.toFixed(1) + ' dB' + (m.clipped ? ' · CLIP WARNING' : ' · Clean');
              }
              if (timerEl) timerEl.textContent = fmtDuration(m.elapsedSeconds);
              if (m.elapsedSeconds >= maxSec) {
                stopBtn.click();
              }
            }
          });
          await state.cutter.recorder.start(deviceId);
          recBtn.disabled = true;
          stopBtn.disabled = false;
          toast('Recording started');
        } catch (err) {
          toast('Microphone error: ' + err.message);
        }
      });
    }

    if (stopBtn) {
      stopBtn.addEventListener('click', async function () {
        if (!state.cutter.recorder) return;
        stopBtn.disabled = true;
        recBtn.disabled = false;
        try {
          const assembled = await state.cutter.recorder.stop();
          if (assembled && assembled.bytes && assembled.bytes.byteLength > 0) {
            await decodeArrayBufferIntoCutter(assembled.bytes.buffer);
            await state.cutter.recorder.crashStore.clearSession(assembled.meta.id);
            toast('Recording ready in cutter');
          }
        } catch (err) {
          toast('Could not decode recording: ' + err.message);
        }
      });
    }

    const recoverBtn = document.getElementById('st-btn-recover-session');
    const discardBtn = document.getElementById('st-btn-discard-session');
    if (recoverBtn && state.cutter.recoverableSession) {
      recoverBtn.addEventListener('click', async function () {
        const store = window.StudioRecorder.createDefaultCrashStore();
        const sess = state.cutter.recoverableSession;
        const assembled = await store.assembleSessionBytes(sess.id);
        state.cutter.recoverableSession = null;
        await store.clearSession(sess.id);
        if (assembled && assembled.bytes.byteLength > 0) {
          await decodeArrayBufferIntoCutter(assembled.bytes.buffer);
        }
        render();
      });
    }
    if (discardBtn && state.cutter.recoverableSession) {
      discardBtn.addEventListener('click', async function () {
        const store = window.StudioRecorder.createDefaultCrashStore();
        await store.clearSession(state.cutter.recoverableSession.id);
        state.cutter.recoverableSession = null;
        render();
      });
    }

    const fileIn = document.getElementById('st-cutter-file');
    if (fileIn) {
      fileIn.addEventListener('change', function () {
        if (!fileIn.files || !fileIn.files[0]) return;
        fileIn.files[0].arrayBuffer().then(decodeArrayBufferIntoCutter).then(function () {
          toast('Audio loaded into cutter');
        }).catch(function (err) {
          toast('Failed to decode: ' + err.message);
        });
      });
    }

    const splitBtn = document.getElementById('st-btn-cut-split');
    if (splitBtn) {
      splitBtn.addEventListener('click', function () {
        if (!state.cutter.edl || !state.cutter.wfEditor) return;
        const sample = state.cutter.wfEditor.getPlayheadSample();
        if (state.cutter.edl.splitAtTimeline(sample)) {
          refreshCutterPreview();
          toast('Split at zero-crossing');
        }
      });
    }

    const rippleBtn = document.getElementById('st-btn-cut-ripple');
    if (rippleBtn) {
      rippleBtn.addEventListener('click', function () {
        if (!state.cutter.edl || !state.cutter.wfEditor) return;
        const sel = state.cutter.wfEditor.getSelection();
        if (!sel) {
          toast('Drag across the waveform to select a range first');
          return;
        }
        if (state.cutter.edl.rippleDeleteRange(sel.startSample, sel.endSample)) {
          state.cutter.wfEditor.clearSelection();
          refreshCutterPreview();
          toast('Ripple-deleted selection');
        }
      });
    }

    const silenceBtn = document.getElementById('st-btn-cut-silence');
    if (silenceBtn) {
      silenceBtn.addEventListener('click', function () {
        if (!state.cutter.sourceChannels || !state.cutter.edl) return;
        const src = state.cutter.sourceChannels[0];
        const silences = window.StudioEdl.detectSilenceCandidates(src, state.cutter.sampleRate, {
          thresholdDb: -38,
          minSilenceMs: 400,
          padMs: 60
        });
        if (!silences.length) {
          toast('No long silences detected');
          return;
        }
        const kept = window.StudioEdl.invertRemovedToKept(src.length, silences);
        state.cutter.edl.applyKeptSourceIntervals(kept);
        refreshCutterPreview();
        toast('Tightened ' + silences.length + ' silence region(s)');
      });
    }

    const musicBtn = document.getElementById('st-btn-cut-music');
    if (musicBtn) {
      musicBtn.addEventListener('click', function () {
        if (!state.cutter.sourceChannels || !state.cutter.edl) return;
        const src = state.cutter.sourceChannels[0];
        const chs = state.cutter.detectedChapters || [];
        const removed = [];
        for (let i = 0; i < chs.length; i++) {
          if (chs[i].kind === 'music' || String(chs[i].title).toLowerCase().indexOf('music') === 0) {
            const s = Math.round(chs[i].startTime * state.cutter.sampleRate);
            const e = i + 1 < chs.length ? Math.round(chs[i + 1].startTime * state.cutter.sampleRate) : src.length;
            removed.push({ sourceStart: s, sourceEnd: e });
          }
        }
        if (!removed.length) {
          toast('No music segments flagged');
          return;
        }
        const kept = window.StudioEdl.invertRemovedToKept(src.length, removed);
        state.cutter.edl.applyKeptSourceIntervals(kept);
        refreshCutterPreview();
        toast('Removed ' + removed.length + ' music segment(s)');
      });
    }

    const undoBtn = document.getElementById('st-btn-cut-undo');
    if (undoBtn) {
      undoBtn.addEventListener('click', function () {
        if (state.cutter.edl && state.cutter.edl.undo()) refreshCutterPreview();
      });
    }

    const redoBtn = document.getElementById('st-btn-cut-redo');
    if (redoBtn) {
      redoBtn.addEventListener('click', function () {
        if (state.cutter.edl && state.cutter.edl.redo()) refreshCutterPreview();
      });
    }

    const zoomSel = document.getElementById('st-cut-zoom');
    if (zoomSel) {
      zoomSel.addEventListener('change', function () {
        if (state.cutter.wfEditor) state.cutter.wfEditor.setZoom(Number(zoomSel.value));
      });
    }

    const normChk = document.getElementById('st-chk-norm');
    if (normChk) {
      normChk.addEventListener('change', function () {
        state.cutter.normalizeLufs = normChk.checked;
      });
    }

    const fmtSel = document.getElementById('st-export-format');
    if (fmtSel) {
      fmtSel.addEventListener('change', function () {
        state.cutter.exportFormat = fmtSel.value;
      });
    }

    const dlBtn = document.getElementById('st-btn-download-export');
    if (dlBtn) {
      dlBtn.addEventListener('click', async function () {
        const st = document.getElementById('st-export-status');
        if (st) st.textContent = 'Mastering & encoding (' + state.cutter.exportFormat.toUpperCase() + ')…';
        try {
          const file = await renderMasteredExportFile();
          const url = URL.createObjectURL(file);
          const a = document.createElement('a');
          a.href = url;
          a.download = file.name;
          a.click();
          setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
          if (st) st.textContent = 'Exported ' + file.name + ' (' + fmtMb(file.size) + ')';
        } catch (err) {
          if (st) st.textContent = 'Export failed: ' + err.message;
        }
      });
    }

    const sendBtn = document.getElementById('st-btn-send-publish');
    if (sendBtn) {
      sendBtn.addEventListener('click', async function () {
        const st = document.getElementById('st-export-status');
        if (st) st.textContent = 'Mastering & handing off to Publish…';
        try {
          const file = await renderMasteredExportFile();
          navigate('publish');
          handleFile(file);
          toast('Mastered audio loaded into Publish');
        } catch (err) {
          if (st) st.textContent = 'Export failed: ' + err.message;
        }
      });
    }
  }

  function bindSettingsView() {
    const upBtn = document.getElementById('st-btn-upgrade-pro');
    if (!upBtn) return;
    upBtn.addEventListener('click', function () {
      if (state.mode === 'demo') {
        openClaim();
        return;
      }
      fetch('/api/studio/plan', {
        method: 'POST',
        credentials: 'include',
        headers: authHeaders(),
        body: JSON.stringify({ action: 'activate-pro-demo' })
      }).then(function (r) { return r.json(); }).then(function (data) {
        if (data && data.plan) {
          state.plan = data.plan;
          state.usage = data.usage || state.usage;
          toast('Upgraded to Studio Pro');
          render();
        }
      }).catch(function () {});
    });
  }

  function bindPublish() {
    const dz = document.getElementById('st-dropzone');
    const input = document.getElementById('st-file-input');
    const form = document.getElementById('st-publish-form');
    dz.addEventListener('click', function () { input.click(); });
    dz.addEventListener('dragover', function (e) { e.preventDefault(); dz.classList.add('over'); });
    dz.addEventListener('dragleave', function () { dz.classList.remove('over'); });
    dz.addEventListener('drop', function (e) {
      e.preventDefault();
      dz.classList.remove('over');
      if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]);
    });
    input.addEventListener('change', function () {
      if (input.files[0]) handleFile(input.files[0]);
    });
    form.addEventListener('submit', submitEpisode);
  }

  function handleFile(file) {
    const titleEl = document.getElementById('st-ep-title');
    const numEl = document.getElementById('st-ep-number');
    const descEl = document.getElementById('st-ep-desc');
    const title = titleEl ? titleEl.value : '';
    const number = numEl ? numEl.value : '';
    const desc = descEl ? descEl.value : '';
    state.file = file;
    state.analysis = null;
    if (state.previewUrl) URL.revokeObjectURL(state.previewUrl);
    state.previewUrl = URL.createObjectURL(file);
    render();
    document.getElementById('st-ep-title').value = title || file.name.replace(/\.[^.]+$/, '');
    document.getElementById('st-ep-number').value = number;
    document.getElementById('st-ep-desc').value = desc;
    const status = document.getElementById('st-analysis-status');
    const text = document.getElementById('st-analysis-text');
    status.classList.remove('hidden');
    text.textContent = 'Decoding audio and detecting talk and music segments in your browser…';
    const reader = new FileReader();
    reader.onload = function () {
      window.AnypodStudio.analyzeCreatorAudioBuffer(reader.result, 120).then(function (result) {
        state.analysis = result;
        const t = document.getElementById('st-ep-title').value;
        const n = document.getElementById('st-ep-number').value;
        const d = document.getElementById('st-ep-desc').value;
        render();
        document.getElementById('st-ep-title').value = t;
        document.getElementById('st-ep-number').value = n;
        document.getElementById('st-ep-desc').value = d;
        const s = document.getElementById('st-analysis-status');
        s.classList.remove('hidden');
        document.getElementById('st-analysis-text').textContent = result.chapters.length + ' segments found · ' + fmtDuration(result.durationSeconds);
      }).catch(function (err) {
        text.textContent = 'Analysis failed: ' + err.message;
      });
    };
    reader.readAsArrayBuffer(file);
  }

  function submitEpisode(e) {
    e.preventDefault();
    if (!state.file || !state.analysis) return;
    if (state.mode === 'demo') {
      openClaim();
      return;
    }
    const wrap = document.getElementById('st-upload-wrap');
    const bar = document.getElementById('st-upload-bar');
    const text = document.getElementById('st-upload-text');
    const btn = document.getElementById('st-publish-btn');
    const title = document.getElementById('st-ep-title').value.trim();
    wrap.classList.remove('hidden');
    btn.disabled = true;
    bar.style.width = '8%';
    text.textContent = 'Requesting signed upload ticket…';
    window.AnypodStudio.uploadCreatorEpisode({
      showSlug: state.show.slug,
      audioFile: state.file,
      title: title,
      description: document.getElementById('st-ep-desc').value.trim(),
      sessionToken: state.token,
      onProgress: function (p) {
        bar.style.width = Math.round(p * 100) + '%';
        text.textContent = 'Uploading to Cloudflare R2: ' + Math.round(p * 100) + '%';
      }
    }).then(function () {
      bar.style.width = '100%';
      text.textContent = 'Published. Your RSS feed is updated.';
      toast('Episode published');
      state.file = null;
      state.analysis = null;
      loadShowEpisodes().then(function () { navigate('episodes'); });
    }).catch(function (err) {
      text.textContent = 'Publish failed: ' + err.message;
      btn.disabled = false;
    });
  }

  function openClaim() {
    els.claimMsg.textContent = '';
    if (!els.claimDialog.open) els.claimDialog.showModal();
  }

  function sendMagicLink(e) {
    e.preventDefault();
    const email = document.getElementById('st-claim-email').value.trim();
    if (!email) return;
    els.claimMsg.textContent = 'Sending magic link…';
    fetch('/api/auth/send-magic-link', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email })
    }).then(function (res) {
      return res.json().then(function (data) { return { ok: res.ok, data: data }; });
    }).then(function (r) {
      els.claimMsg.textContent = r.ok ? 'Check your inbox for the sign-in link. Your work stays in this tab.' : (r.data.error || 'Could not send link');
    }).catch(function () {
      els.claimMsg.textContent = 'Network error';
    });
  }

  function parseFeedEpisodes(xmlText) {
    const doc = new DOMParser().parseFromString(xmlText, 'application/xml');
    const guidNode = doc.getElementsByTagName('podcast:guid')[0];
    const items = Array.prototype.slice.call(doc.getElementsByTagName('item'));
    const total = items.length;
    const list = items.map(function (item, idx) {
      const enc = item.getElementsByTagName('enclosure')[0];
      const dur = item.getElementsByTagName('itunes:duration')[0];
      const num = item.getElementsByTagName('itunes:episode')[0];
      const pub = item.getElementsByTagName('pubDate')[0];
      const title = item.getElementsByTagName('title')[0];
      const gid = item.getElementsByTagName('guid')[0];
      const parts = dur ? dur.textContent.split(':').map(Number) : [0];
      const seconds = parts.reduce(function (acc, p) { return acc * 60 + (p || 0); }, 0);
      return {
        id: gid ? gid.textContent : 'ep-' + idx,
        number: num ? Number(num.textContent) : total - idx,
        title: title ? title.textContent : 'Untitled',
        published: pub ? new Date(pub.textContent).toISOString().slice(0, 10) : '',
        bytes: enc ? Number(enc.getAttribute('length')) || 0 : 0,
        durationSeconds: seconds,
        downloads: 0,
        chapters: []
      };
    });
    return { guid: guidNode ? guidNode.textContent : '', episodes: list };
  }

  function loadShowEpisodes() {
    return fetch(feedUrl()).then(function (res) {
      return res.ok ? res.text() : '';
    }).then(function (xml) {
      if (!xml) return;
      const parsed = parseFeedEpisodes(xml);
      state.episodes = parsed.episodes;
      state.show.guid = parsed.guid || state.show.guid;
      state.downloadsByDay = new Array(14).fill(0);
    }).catch(function () {});
  }

  function useLiveShows(shows) {
    state.mode = 'live';
    state.shows = shows;
    if (!shows.length) {
      state.show = { slug: 'your-show', title: 'Create your first show', author: '', category: 'Podcast', language: 'en', description: 'Create a show to get your Podcasting 2.0 RSS feed.' };
      state.episodes = [];
      state.downloadsByDay = new Array(14).fill(0);
      render();
      return Promise.resolve();
    }
    const saved = localStorage.getItem('studio_active_show');
    state.show = shows.find(function (s) { return s.slug === saved; }) || shows[0];
    return loadShowEpisodes().then(render);
  }

  function init() {
    const initial = new URLSearchParams(window.location.search).get('view');
    if (initial && viewMap[initial]) state.view = initial;
    render();
    fetch('/api/studio/plan', { credentials: 'include', headers: authHeaders() }).then(function (res) {
      return res.ok ? res.json() : null;
    }).then(function (planData) {
      if (planData && planData.plan) {
        state.user = planData.user || null;
        state.plan = planData.plan;
        state.usage = planData.usage || state.usage;
        state.checkoutUrl = planData.checkoutUrl || state.checkoutUrl;
      }
      return fetch('/api/studio/shows', { credentials: 'include', headers: authHeaders() });
    }).then(function (res) {
      if (!res || !res.ok) return null;
      return res.json();
    }).then(function (data) {
      if (data && Array.isArray(data.shows)) return useLiveShows(data.shows);
      return null;
    }).catch(function () {});
  }

  function createShow(e) {
    e.preventDefault();
    const body = {
      title: document.getElementById('st-new-title').value.trim(),
      slug: document.getElementById('st-new-slug').value.trim(),
      author: document.getElementById('st-new-author').value.trim(),
      category: document.getElementById('st-new-category').value,
      description: document.getElementById('st-new-desc').value.trim(),
      cover_image_url: document.getElementById('st-new-cover').value.trim()
    };
    fetch('/api/studio/shows', {
      method: 'POST',
      credentials: 'include',
      headers: authHeaders(),
      body: JSON.stringify(body)
    }).then(function (res) {
      return res.json().then(function (data) { return { ok: res.ok, status: res.status, data: data }; });
    }).then(function (r) {
      if (!r.ok) {
        if (r.status === 402) {
          els.showDialog.close();
          navigate('settings');
        }
        throw new Error(r.data.error || 'Could not create show');
      }
      els.showDialog.close();
      toast('Show created');
      return fetch('/api/studio/shows', { credentials: 'include', headers: authHeaders() }).then(function (x) { return x.json(); });
    }).then(function (data) {
      localStorage.setItem('studio_active_show', body.slug);
      return useLiveShows(data.shows || []);
    }).catch(function (err) {
      toast(err.message);
    });
  }

  document.addEventListener('click', function (e) {
    const target = e.target.closest('[data-view],[data-copy],[data-open-claim],[data-open-show],[data-preview-ep],[data-native-share],[data-embed-theme],[data-copy-feed],[data-close-dialog],[data-toggle-theme]');
    if (!target) return;
    if (target.dataset.view) {
      navigate(target.dataset.view);
    } else if (target.dataset.copy) {
      copy(target.dataset.copy, target.dataset.toast);
    } else if (target.dataset.openClaim) {
      openClaim();
    } else if (target.dataset.openShow) {
      if (state.mode === 'demo') {
        openClaim();
      } else {
        els.showDialog.showModal();
      }
    } else if (target.dataset.previewEp) {
      renderChapterPanel(target.dataset.previewEp);
    } else if (target.dataset.nativeShare) {
      if (navigator.share) {
        navigator.share({ title: state.show.title, url: embedUrl() }).catch(function () {});
      } else {
        copy(embedUrl(), 'Link copied');
      }
    } else if (target.dataset.embedTheme) {
      const frame = document.getElementById('st-embed-frame');
      const latest = state.episodes[0];
      frame.src = embedUrl(latest ? latest.id : null) + '?theme=' + target.dataset.embedTheme;
    } else if (target.dataset.copyFeed) {
      copy(feedUrl(), 'RSS feed copied. Paste it in the directory.');
    } else if (target.dataset.closeDialog) {
      target.closest('dialog').close();
    } else if (target.dataset.toggleTheme) {
      const root = document.documentElement;
      root.setAttribute('data-theme', root.getAttribute('data-theme') === 'light' ? 'dark' : 'light');
    }
  });

  document.addEventListener('change', function (e) {
    if (e.target.matches('[data-dist]')) {
      const map = loadDist();
      map[e.target.dataset.dist] = e.target.checked;
      saveDist(map);
      render();
    }
    if (e.target === els.showSelect && state.mode === 'live') {
      const found = state.shows.find(function (s) { return s.slug === els.showSelect.value; });
      if (found) {
        state.show = found;
        localStorage.setItem('studio_active_show', found.slug);
        loadShowEpisodes().then(render);
      }
    }
  });

  document.addEventListener('keydown', function (e) {
    const tag = e.target.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

    if (state.view === 'record') {
      const cutterAudio = document.getElementById('st-cutter-audio');
      if (e.code === 'Space' && cutterAudio && cutterAudio.src) {
        e.preventDefault();
        if (cutterAudio.paused) cutterAudio.play();
        else cutterAudio.pause();
        return;
      }
      if (e.key === 's' || e.key === 'S') {
        const splitBtn = document.getElementById('st-btn-cut-split');
        if (splitBtn) splitBtn.click();
        return;
      }
      if (e.key === 'Backspace' || e.key === 'Delete') {
        const rippleBtn = document.getElementById('st-btn-cut-ripple');
        if (rippleBtn && state.cutter.wfEditor && state.cutter.wfEditor.getSelection()) {
          e.preventDefault();
          rippleBtn.click();
        }
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) {
          if (state.cutter.edl && state.cutter.edl.redo()) refreshCutterPreview();
        } else if (state.cutter.edl && state.cutter.edl.undo()) {
          refreshCutterPreview();
        }
        return;
      }
    }

    const audio = document.getElementById('st-audio-preview');
    if (e.code === 'Space' && audio && tag !== 'BUTTON') {
      e.preventDefault();
      if (audio.paused) audio.play();
      else audio.pause();
    }
  });

  window.addEventListener('popstate', function () {
    const v = new URLSearchParams(window.location.search).get('view') || 'overview';
    navigate(v, false);
  });

  document.getElementById('st-claim-form').addEventListener('submit', sendMagicLink);
  document.getElementById('st-show-form').addEventListener('submit', createShow);

  const titleInput = document.getElementById('st-new-title');
  const slugInput = document.getElementById('st-new-slug');
  titleInput.addEventListener('input', function () {
    if (!slugInput.dataset.manual) {
      slugInput.value = titleInput.value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    }
  });
  slugInput.addEventListener('input', function () { slugInput.dataset.manual = '1'; });

  init();
})();
