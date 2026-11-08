const EMBED_CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type'
};

function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildPublicAssetUrl(origin, key) {
  if (!key) return '';
  const cleanKey = String(key).replace(/^\/+/, '');
  return `${origin}/audio/${cleanKey}`;
}

function formatDurationDisplay(seconds) {
  const s = Math.max(0, Math.floor(Number(seconds) || 0));
  const hrs = Math.floor(s / 3600);
  const mins = Math.floor((s % 3600) / 60);
  const secs = s % 60;
  if (hrs > 0) {
    return `${hrs}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

export function renderEmbedPlayerHtml({ origin, show, episode, episodesList = [], theme = 'dark' }) {
  const resolvedTheme = theme === 'light' ? 'light' : 'dark';
  const showTitle = escapeHtml(show.title || show.slug);
  const showAuthor = escapeHtml(show.author || show.title || 'Anypod Studio');
  const episodeTitle = escapeHtml(episode.title || 'Untitled Episode');
  const coverUrl = escapeHtml(show.cover_image_url || `${origin}/icon.svg`);
  const audioUrl = buildPublicAssetUrl(origin, episode.audio_key);
  const transcriptUrl = episode.transcript_key ? buildPublicAssetUrl(origin, episode.transcript_key) : '';
  const chaptersUrl = episode.chapters_key ? buildPublicAssetUrl(origin, episode.chapters_key) : '';
  const feedUrl = `${origin}/feeds/${encodeURIComponent(show.slug)}.xml`;
  const durationSec = Math.max(0, Math.floor(Number(episode.duration_seconds) || 0));

  let peaks = [];
  if (episode.waveform_peaks_json) {
    try {
      const parsed = JSON.parse(episode.waveform_peaks_json);
      if (Array.isArray(parsed) && parsed.length > 0) {
        peaks = parsed.slice(0, 160).map((n) => Math.max(0.05, Math.min(1, Number(n) || 0.1)));
      }
    } catch (_) {
      peaks = [];
    }
  }
  if (peaks.length === 0) {
    for (let i = 0; i < 96; i++) {
      const v = 0.22 + 0.55 * Math.abs(Math.sin(i * 0.29) * Math.cos(i * 0.13));
      peaks.push(Number(v.toFixed(3)));
    }
  }

  const bootstrapPayload = JSON.stringify({
    origin,
    show: {
      id: show.id,
      slug: show.slug,
      title: show.title,
      author: show.author,
      coverImageUrl: show.cover_image_url || `${origin}/icon.svg`,
      feedUrl
    },
    episode: {
      id: episode.id,
      title: episode.title,
      description: episode.description || '',
      audioUrl,
      transcriptUrl,
      chaptersUrl,
      durationSeconds: durationSec,
      publishedAt: episode.published_at,
      peaks
    },
    episodes: episodesList.map((ep) => ({
      id: ep.id,
      title: ep.title,
      durationSeconds: Number(ep.duration_seconds) || 0,
      publishedAt: ep.published_at,
      embedUrl: `${origin}/embed/${encodeURIComponent(show.slug)}/${encodeURIComponent(ep.id)}?theme=${resolvedTheme}`
    }))
  }).replace(/</g, '\\u003c');

  return `<!DOCTYPE html>
<html lang="${escapeHtml(show.language || 'en')}" data-theme="${resolvedTheme}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${episodeTitle} — ${showTitle}</title>
  <link rel="alternate" type="application/rss+xml" title="${showTitle}" href="${escapeHtml(feedUrl)}">
  <style>
    :root {
      --bg-outer: #0d0e11;
      --bg-card: #15171c;
      --bg-elevated: #1d2027;
      --bg-pill: #252932;
      --text-primary: #f2f0eb;
      --text-secondary: #a5a8b1;
      --text-muted: #6e727d;
      --accent: #e5a967;
      --accent-talk: #6bc4a6;
      --accent-music: #d99b66;
      --border-subtle: rgba(255, 255, 255, 0.07);
      --radius-card: 16px;
      --radius-control: 10px;
      --radius-pill: 999px;
    }
    html[data-theme="light"] {
      --bg-outer: #f5f2eb;
      --bg-card: #fcfaf5;
      --bg-elevated: #f0ece1;
      --bg-pill: #e6e1d4;
      --text-primary: #1c1d20;
      --text-secondary: #555861;
      --text-muted: #858892;
      --accent: #c47d38;
      --accent-talk: #2d8a6b;
      --accent-music: #b86d29;
      --border-subtle: rgba(28, 29, 32, 0.09);
    }
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Inter", "Segoe UI", Roboto, sans-serif;
      background: var(--bg-outer);
      color: var(--text-primary);
      padding: 14px;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      -webkit-font-smoothing: antialiased;
    }
    .embed-shell {
      width: 100%;
      max-width: 760px;
      background: var(--bg-card);
      border: 1px solid var(--border-subtle);
      border-radius: var(--radius-card);
      padding: 18px 20px;
      display: flex;
      flex-direction: column;
      gap: 14px;
    }
    .embed-top {
      display: flex;
      align-items: center;
      gap: 14px;
    }
    .embed-artwork {
      width: 56px;
      height: 56px;
      border-radius: 12px;
      object-fit: cover;
      background: var(--bg-elevated);
      flex-shrink: 0;
      border: 1px solid var(--border-subtle);
    }
    .embed-meta {
      flex: 1;
      min-width: 0;
    }
    .embed-show-row {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 11px;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      color: var(--text-secondary);
      margin-bottom: 3px;
    }
    .embed-title {
      font-size: 15px;
      font-weight: 600;
      color: var(--text-primary);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .embed-header-actions {
      display: flex;
      align-items: center;
      gap: 6px;
      flex-shrink: 0;
    }
    .btn-pill {
      background: var(--bg-elevated);
      color: var(--text-secondary);
      border: 1px solid var(--border-subtle);
      border-radius: var(--radius-pill);
      padding: 6px 11px;
      font-size: 11.5px;
      font-weight: 500;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 5px;
      text-decoration: none;
      transition: background 0.15s ease, color 0.15s ease;
    }
    .btn-pill:hover {
      background: var(--bg-pill);
      color: var(--text-primary);
    }
    .btn-pill.active {
      color: var(--accent);
      border-color: var(--accent);
    }
    .waveform-wrap {
      position: relative;
      height: 52px;
      background: var(--bg-elevated);
      border-radius: var(--radius-control);
      padding: 8px 10px;
      cursor: pointer;
      display: flex;
      align-items: flex-end;
      gap: 2px;
      overflow: hidden;
      user-select: none;
    }
    .wf-bar {
      flex: 1;
      min-width: 2px;
      background: var(--text-muted);
      opacity: 0.38;
      border-radius: 2px;
      transition: opacity 0.12s ease, background 0.12s ease;
    }
    .wf-bar.played {
      opacity: 0.95;
      background: var(--accent);
    }
    .wf-bar.talk-bar.played {
      background: var(--accent-talk);
    }
    .wf-bar.music-bar.played {
      background: var(--accent-music);
    }
    .controls-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      flex-wrap: wrap;
    }
    .transport-group {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .btn-play {
      width: 40px;
      height: 40px;
      border-radius: 50%;
      border: none;
      background: var(--text-primary);
      color: var(--bg-card);
      display: inline-flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      transition: transform 0.12s ease;
    }
    .btn-play:active {
      transform: scale(0.95);
    }
    .time-readout {
      font-variant-numeric: tabular-nums;
      font-size: 12px;
      color: var(--text-secondary);
      margin-left: 4px;
    }
    .smart-skip-group {
      display: flex;
      align-items: center;
      gap: 6px;
      flex-wrap: wrap;
    }
    .drawer-panel {
      display: none;
      background: var(--bg-elevated);
      border: 1px solid var(--border-subtle);
      border-radius: var(--radius-control);
      padding: 10px 12px;
      max-height: 170px;
      overflow-y: auto;
      font-size: 12.5px;
      line-height: 1.5;
    }
    .drawer-panel.open {
      display: block;
    }
    .chapter-item, .cue-item {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      gap: 10px;
      padding: 5px 6px;
      border-radius: 6px;
      cursor: pointer;
      color: var(--text-secondary);
    }
    .chapter-item:hover, .cue-item:hover, .chapter-item.active, .cue-item.active {
      background: var(--bg-pill);
      color: var(--text-primary);
    }
    .item-time {
      font-variant-numeric: tabular-nums;
      font-size: 11px;
      color: var(--accent);
      flex-shrink: 0;
    }
  </style>
</head>
<body>
  <div class="embed-shell" id="embed-shell">
    <div class="embed-top">
      <img class="embed-artwork" src="${coverUrl}" alt="${showTitle}">
      <div class="embed-meta">
        <div class="embed-show-row">
          <span>${showTitle}</span>
          <span>&middot;</span>
          <span>${showAuthor}</span>
        </div>
        <h1 class="embed-title" title="${episodeTitle}">${episodeTitle}</h1>
      </div>
      <div class="embed-header-actions">
        <button type="button" class="btn-pill" id="btn-theme" title="Toggle theme">Theme</button>
        <a class="btn-pill" href="${escapeHtml(feedUrl)}" target="_blank" rel="noopener noreferrer">RSS</a>
        <a class="btn-pill" href="${escapeHtml(origin)}" target="_blank" rel="noopener noreferrer">anypod</a>
      </div>
    </div>

    <div class="waveform-wrap" id="waveform-track" role="slider" aria-label="Seek audio timeline" tabindex="0"></div>

    <div class="controls-row">
      <div class="transport-group">
        <button type="button" class="btn-play" id="btn-toggle-play" aria-label="Play or pause">
          <svg id="icon-play" width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><polygon points="6 4 20 12 6 20 6 4"></polygon></svg>
          <svg id="icon-pause" width="16" height="16" viewBox="0 0 24 24" fill="currentColor" style="display:none"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>
        </button>
        <button type="button" class="btn-pill" id="btn-speed">1.0x</button>
        <span class="time-readout"><span id="time-current">0:00</span> / <span id="time-total">${formatDurationDisplay(durationSec)}</span></span>
      </div>

      <div class="smart-skip-group">
        <button type="button" class="btn-pill" id="btn-skip-talk" title="Jump to next talk segment">talk &#9197;</button>
        <button type="button" class="btn-pill" id="btn-skip-music" title="Jump to next music segment">music &#9197;</button>
        <button type="button" class="btn-pill" id="btn-toggle-chapters">Chapters</button>
        <button type="button" class="btn-pill" id="btn-toggle-transcript">Transcript</button>
      </div>
    </div>

    <div class="drawer-panel" id="panel-chapters" aria-label="Episode chapters"></div>
    <div class="drawer-panel" id="panel-transcript" aria-label="Interactive transcript"></div>

    <audio id="embed-audio" preload="metadata" crossorigin="anonymous" src="${escapeHtml(audioUrl)}"></audio>
  </div>

  <script id="anypod-embed-data" type="application/json">${bootstrapPayload}</script>
  <script>
    (function () {
      const payloadEl = document.getElementById('anypod-embed-data');
      const data = JSON.parse(payloadEl.textContent || '{}');
      const audio = document.getElementById('embed-audio');
      const btnPlay = document.getElementById('btn-toggle-play');
      const iconPlay = document.getElementById('icon-play');
      const iconPause = document.getElementById('icon-pause');
      const btnSpeed = document.getElementById('btn-speed');
      const btnSkipTalk = document.getElementById('btn-skip-talk');
      const btnSkipMusic = document.getElementById('btn-skip-music');
      const btnChapters = document.getElementById('btn-toggle-chapters');
      const btnTranscript = document.getElementById('btn-toggle-transcript');
      const btnTheme = document.getElementById('btn-theme');
      const panelChapters = document.getElementById('panel-chapters');
      const panelTranscript = document.getElementById('panel-transcript');
      const wfTrack = document.getElementById('waveform-track');
      const timeCurrent = document.getElementById('time-current');
      const timeTotal = document.getElementById('time-total');

      const speeds = [1, 1.25, 1.5, 1.75, 2, 0.8];
      let speedIdx = 0;
      let chapters = [];
      let transcriptCues = [];
      const peaks = (data.episode && Array.isArray(data.episode.peaks)) ? data.episode.peaks : [];

      function fmt(sec) {
        const s = Math.max(0, Math.floor(Number(sec) || 0));
        const h = Math.floor(s / 3600);
        const m = Math.floor((s % 3600) / 60);
        const r = s % 60;
        return h > 0 ? h + ':' + String(m).padStart(2, '0') + ':' + String(r).padStart(2, '0') : m + ':' + String(r).padStart(2, '0');
      }

      function renderWaveform() {
        wfTrack.innerHTML = '';
        const dur = Number(audio.duration) || Number(data.episode.durationSeconds) || 1;
        peaks.forEach((p, idx) => {
          const bar = document.createElement('div');
          bar.className = 'wf-bar';
          bar.style.height = Math.max(12, Math.round(p * 100)) + '%';
          const barTime = (idx / peaks.length) * dur;
          const ch = chapters.find((c) => barTime >= c.startTime && (c.endTime ? barTime < c.endTime : true));
          if (ch && ch.title) {
            const lower = ch.title.toLowerCase();
            if (lower.includes('talk')) bar.classList.add('talk-bar');
            if (lower.includes('music')) bar.classList.add('music-bar');
          }
          wfTrack.appendChild(bar);
        });
      }

      function updateWaveformProgress() {
        const dur = Number(audio.duration) || Number(data.episode.durationSeconds) || 1;
        const ratio = Math.max(0, Math.min(1, (audio.currentTime || 0) / dur));
        const bars = wfTrack.querySelectorAll('.wf-bar');
        const activeCount = Math.floor(ratio * bars.length);
        bars.forEach((b, i) => {
          if (i <= activeCount) b.classList.add('played');
          else b.classList.remove('played');
        });
        timeCurrent.textContent = fmt(audio.currentTime || 0);
        if (audio.duration && isFinite(audio.duration)) {
          timeTotal.textContent = fmt(audio.duration);
        }
      }

      function togglePlay() {
        if (audio.paused) {
          audio.play().catch(() => {});
        } else {
          audio.pause();
        }
      }

      btnPlay.addEventListener('click', togglePlay);
      audio.addEventListener('play', () => {
        iconPlay.style.display = 'none';
        iconPause.style.display = 'block';
      });
      audio.addEventListener('pause', () => {
        iconPlay.style.display = 'block';
        iconPause.style.display = 'none';
      });
      audio.addEventListener('timeupdate', updateWaveformProgress);
      audio.addEventListener('loadedmetadata', () => {
        if (audio.duration && isFinite(audio.duration)) {
          timeTotal.textContent = fmt(audio.duration);
        }
        renderWaveform();
      });

      wfTrack.addEventListener('click', (e) => {
        const rect = wfTrack.getBoundingClientRect();
        const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
        const dur = Number(audio.duration) || Number(data.episode.durationSeconds) || 0;
        if (dur > 0) {
          audio.currentTime = ratio * dur;
          updateWaveformProgress();
        }
      });

      btnSpeed.addEventListener('click', () => {
        speedIdx = (speedIdx + 1) % speeds.length;
        audio.playbackRate = speeds[speedIdx];
        btnSpeed.textContent = speeds[speedIdx].toFixed(2).replace(/\\.00$/, '.0').replace(/0$/, '') + 'x';
      });

      btnTheme.addEventListener('click', () => {
        const root = document.documentElement;
        const next = root.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
        root.setAttribute('data-theme', next);
      });

      function skipToKind(kind) {
        const now = audio.currentTime || 0;
        const match = chapters.find((c) => c.startTime > now + 0.5 && String(c.title || '').toLowerCase().includes(kind));
        if (match) {
          audio.currentTime = match.startTime;
          if (audio.paused) audio.play().catch(() => {});
          return;
        }
        const dur = Number(audio.duration) || Number(data.episode.durationSeconds) || 0;
        if (dur > 0) {
          audio.currentTime = Math.min(dur, now + (kind === 'talk' ? 15 : 30));
        }
      }

      btnSkipTalk.addEventListener('click', () => skipToKind('talk'));
      btnSkipMusic.addEventListener('click', () => skipToKind('music'));

      function renderChaptersList() {
        panelChapters.innerHTML = '';
        if (!chapters.length) {
          panelChapters.textContent = 'No chapters available for this episode.';
          return;
        }
        chapters.forEach((ch) => {
          const row = document.createElement('div');
          row.className = 'chapter-item';
          const titleSpan = document.createElement('span');
          titleSpan.textContent = ch.title || 'Chapter';
          const timeSpan = document.createElement('span');
          timeSpan.className = 'item-time';
          timeSpan.textContent = fmt(ch.startTime || 0);
          row.appendChild(titleSpan);
          row.appendChild(timeSpan);
          row.addEventListener('click', () => {
            audio.currentTime = Number(ch.startTime) || 0;
            if (audio.paused) audio.play().catch(() => {});
          });
          panelChapters.appendChild(row);
        });
      }

      function parseVtt(text) {
        const lines = String(text || '').split(/\\r?\\n/);
        const cues = [];
        let i = 0;
        function toSec(ts) {
          const parts = ts.trim().split(':');
          if (parts.length === 3) {
            return Number(parts[0]) * 3600 + Number(parts[1]) * 60 + parseFloat(parts[2].replace(',', '.'));
          }
          if (parts.length === 2) {
            return Number(parts[0]) * 60 + parseFloat(parts[1].replace(',', '.'));
          }
          return 0;
        }
        while (i < lines.length) {
          const line = lines[i].trim();
          if (line.includes('-->')) {
            const [startRaw] = line.split('-->');
            const startTime = toSec(startRaw);
            i++;
            const textLines = [];
            while (i < lines.length && lines[i].trim() !== '') {
              textLines.push(lines[i].trim());
              i++;
            }
            cues.push({ startTime, text: textLines.join(' ') });
          }
          i++;
        }
        return cues;
      }

      function renderTranscriptList() {
        panelTranscript.innerHTML = '';
        if (!transcriptCues.length) {
          panelTranscript.textContent = 'No transcript available for this episode.';
          return;
        }
        transcriptCues.forEach((cue) => {
          const row = document.createElement('div');
          row.className = 'cue-item';
          const textSpan = document.createElement('span');
          textSpan.textContent = cue.text;
          const timeSpan = document.createElement('span');
          timeSpan.className = 'item-time';
          timeSpan.textContent = fmt(cue.startTime);
          row.appendChild(textSpan);
          row.appendChild(timeSpan);
          row.addEventListener('click', () => {
            audio.currentTime = cue.startTime;
            if (audio.paused) audio.play().catch(() => {});
          });
          panelTranscript.appendChild(row);
        });
      }

      btnChapters.addEventListener('click', () => {
        const open = panelChapters.classList.toggle('open');
        btnChapters.classList.toggle('active', open);
        if (open) {
          panelTranscript.classList.remove('open');
          btnTranscript.classList.remove('active');
        }
      });

      btnTranscript.addEventListener('click', () => {
        const open = panelTranscript.classList.toggle('open');
        btnTranscript.classList.toggle('active', open);
        if (open) {
          panelChapters.classList.remove('open');
          btnChapters.classList.remove('active');
        }
      });

      document.addEventListener('keydown', (e) => {
        if (e.code === 'Space' && e.target === document.body) {
          e.preventDefault();
          togglePlay();
        }
      });

      renderWaveform();
      renderChaptersList();
      renderTranscriptList();

      if (data.episode && data.episode.chaptersUrl) {
        fetch(data.episode.chaptersUrl)
          .then((r) => (r.ok ? r.json() : null))
          .then((json) => {
            if (json && Array.isArray(json.chapters)) {
              chapters = json.chapters;
              renderChaptersList();
              renderWaveform();
            }
          })
          .catch(() => {});
      }

      if (data.episode && data.episode.transcriptUrl) {
        fetch(data.episode.transcriptUrl)
          .then((r) => (r.ok ? r.text() : ''))
          .then((txt) => {
            if (txt) {
              transcriptCues = parseVtt(txt);
              renderTranscriptList();
            }
          })
          .catch(() => {});
      }
    })();
  </script>
</body>
</html>`;
}

export async function handleEmbedRequest(context, showSlug, episodeId) {
  const { request, env } = context;

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: EMBED_CORS_HEADERS });
  }

  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return new Response('Method Not Allowed', { status: 405, headers: EMBED_CORS_HEADERS });
  }

  if (!env || !env.DB) {
    return new Response('Database Not Configured', { status: 503, headers: EMBED_CORS_HEADERS });
  }

  const slug = String(showSlug || '').trim().toLowerCase();
  if (!slug) {
    return new Response('Missing Show Slug', { status: 400, headers: EMBED_CORS_HEADERS });
  }

  const show = await env.DB.prepare(
    `SELECT id, owner_id, slug, title, description, author, email, cover_image_url, language, category, explicit, website_url, created_at
     FROM shows
     WHERE slug = ?
     LIMIT 1`
  ).bind(slug).first();

  if (!show) {
    return new Response('Show Not Found', { status: 404, headers: EMBED_CORS_HEADERS });
  }

  const { results: episodes } = await env.DB.prepare(
    `SELECT id, show_id, title, description, audio_key, audio_content_type, audio_byte_size, duration_seconds,
            episode_number, season_number, episode_type, explicit, transcript_key, chapters_key, waveform_peaks_json,
            published_at, created_at
     FROM episodes
     WHERE show_id = ? AND published_at IS NOT NULL
     ORDER BY published_at DESC, created_at DESC
     LIMIT 50`
  ).bind(show.id).all();

  const list = episodes || [];
  let targetEpisode = null;

  if (episodeId) {
    targetEpisode = list.find((ep) => String(ep.id) === String(episodeId)) || null;
    if (!targetEpisode) {
      targetEpisode = await env.DB.prepare(
        `SELECT id, show_id, title, description, audio_key, audio_content_type, audio_byte_size, duration_seconds,
                episode_number, season_number, episode_type, explicit, transcript_key, chapters_key, waveform_peaks_json,
                published_at, created_at
         FROM episodes
         WHERE show_id = ? AND id = ?
         LIMIT 1`
      ).bind(show.id, String(episodeId)).first();
    }
  } else {
    targetEpisode = list[0] || null;
  }

  if (!targetEpisode) {
    return new Response('Episode Not Found', { status: 404, headers: EMBED_CORS_HEADERS });
  }

  const url = new URL(request.url);
  const theme = url.searchParams.get('theme') === 'light' ? 'light' : 'dark';

  const html = renderEmbedPlayerHtml({
    origin: url.origin,
    show,
    episode: targetEpisode,
    episodesList: list,
    theme
  });

  const headers = new Headers(EMBED_CORS_HEADERS);
  headers.set('Content-Type', 'text/html; charset=utf-8');
  headers.set('Cache-Control', 'public, max-age=60, s-maxage=300');
  headers.set('Content-Security-Policy', 'frame-ancestors *');

  return new Response(request.method === 'HEAD' ? null : html, {
    status: 200,
    headers
  });
}

export async function onRequest(context) {
  const showSlug = context.params && context.params.showSlug;
  return handleEmbedRequest(context, showSlug, null);
}
