(function () {
  'use strict';

  const demo = window.StudioDemo;
  const dirs = window.StudioDirectories.directories;
  const shareTargets = window.StudioDirectories.shareTargets;

  const VIEWS = [
    { id: 'overview', label: 'Overview', icon: 'M3 12l9-9 9 9M5 10v10h14V10' },
    { id: 'episodes', label: 'Episodes', icon: 'M4 6h16M4 12h16M4 18h10' },
    { id: 'publish', label: 'Publish', icon: 'M12 16V4m0 0l-4 4m4-4l4 4M4 20h16' },
    { id: 'analytics', label: 'Analytics', icon: 'M4 20V10m6 10V4m6 16v-7m4 7H2' },
    { id: 'distribution', label: 'Distribution', icon: 'M18 8a3 3 0 1 0-3-3 3 3 0 0 0 3 3zM6 15a3 3 0 1 0-3-3 3 3 0 0 0 3 3zm12 7a3 3 0 1 0-3-3 3 3 0 0 0 3 3zM8.6 13.5l6.8 4M15.4 6.5l-6.8 4' },
    { id: 'embed', label: 'Embed', icon: 'M16 18l6-6-6-6M8 6l-6 6 6 6' },
    { id: 'settings', label: 'Settings', icon: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z' }
  ];

  const state = {
    mode: 'demo',
    token: localStorage.getItem('anypod_session_token') || '',
    shows: [],
    show: demo.show,
    episodes: demo.episodes,
    downloadsByDay: demo.downloadsByDay,
    view: 'overview',
    file: null,
    analysis: null,
    previewUrl: ''
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
    toast.timer = setTimeout(function () { els.toast.classList.remove('show'); }, 2200);
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
      els.railUser.textContent = 'Demo studio';
    } else {
      els.banner.classList.add('hidden');
      els.railUser.textContent = 'Signed in';
    }
  }

  function pageHeader(title, sub, actionsHtml) {
    return '<div class="st-topbar"><div><h1 class="st-page-title">' + esc(title) + '</h1><p class="st-page-sub">' + esc(sub) + '</p></div><div>' + (actionsHtml || '') + '</div></div>';
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
    return pageHeader('Overview', state.show.title, '<button type="button" class="st-btn st-btn-primary" data-view="publish">New episode</button>') +
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
    return pageHeader('Publish', 'Audio is analysed in your browser. Zero server CPU.', '') +
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
    return pageHeader('Settings', 'Account and shows', '') +
      '<div class="st-content"><div class="st-card"><h3 class="st-card-title">Account</h3><p class="st-card-sub">' + (state.mode === 'demo' ? 'You are viewing the demo studio. Sign in to host your own show.' : 'Signed in with your Anypod account.') + '</p><div class="st-actions" style="justify-content:flex-start">' +
      (state.mode === 'demo' ? '<button type="button" class="st-btn st-btn-primary" data-open-claim="1">Sign in</button>' : '<button type="button" class="st-btn st-btn-primary" data-open-show="1">New show</button>') +
      '<a class="st-btn" href="/">Back to player</a></div></div>' +
      '<div class="st-card"><h3 class="st-card-title">Open source</h3><p class="st-card-sub">Anypod Studio is licensed under the GNU AGPLv3.</p><div class="st-actions" style="justify-content:flex-start"><a class="st-btn" href="https://github.com/orangedot/anypod" target="_blank" rel="noopener noreferrer">GitHub (Open Source)</a></div></div></div>';
  }

  const viewMap = {
    overview: viewOverview,
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
    const title = document.getElementById('st-ep-title').value;
    const number = document.getElementById('st-ep-number').value;
    const desc = document.getElementById('st-ep-desc').value;
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
      token: state.token,
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
      els.claimMsg.textContent = r.ok ? 'Check your inbox for the sign-in link. Your uploaded file stays in this tab.' : (r.data.error || 'Could not send link');
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
    fetch('/api/studio/shows', { credentials: 'include', headers: authHeaders() }).then(function (res) {
      if (!res.ok) return null;
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
      return res.json().then(function (data) { return { ok: res.ok, data: data }; });
    }).then(function (r) {
      if (!r.ok) throw new Error(r.data.error || 'Could not create show');
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
      els.showDialog.showModal();
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
    const audio = document.getElementById('st-audio-preview');
    const tag = e.target.tagName;
    if (e.code === 'Space' && audio && tag !== 'INPUT' && tag !== 'TEXTAREA' && tag !== 'BUTTON') {
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
