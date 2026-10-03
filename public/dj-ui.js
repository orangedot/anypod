(function () {
  'use strict';

  const mixer = new DJMixer();

  const deckEls = {
    A: {
      root: document.querySelector('.deck-a'),
      title: document.querySelector('.deck-a [data-role="title"]'),
      cur: document.querySelector('.deck-a [data-role="cur"]'),
      dur: document.querySelector('.deck-a [data-role="dur"]'),
      play: document.querySelector('.deck-a [data-role="play"]'),
      rate: document.querySelector('.deck-a [data-role="rate"]'),
      rateLabel: document.querySelector('.deck-a [data-role="rate-label"]'),
      cues: document.querySelectorAll('.deck-a .cue'),
      wave: document.querySelector('.deck-a [data-role="wave"]')
    },
    B: {
      root: document.querySelector('.deck-b'),
      title: document.querySelector('.deck-b [data-role="title"]'),
      cur: document.querySelector('.deck-b [data-role="cur"]'),
      dur: document.querySelector('.deck-b [data-role="dur"]'),
      play: document.querySelector('.deck-b [data-role="play"]'),
      rate: document.querySelector('.deck-b [data-role="rate"]'),
      rateLabel: document.querySelector('.deck-b [data-role="rate-label"]'),
      cues: document.querySelectorAll('.deck-b .cue'),
      wave: document.querySelector('.deck-b [data-role="wave"]')
    }
  };

  function formatTime(s) {
    if (!s || !isFinite(s)) return '0:00';
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec < 10 ? '0' : ''}${sec}`;
  }

  function drawWaveform(canvas, progress, color) {
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const w = (canvas.width = canvas.clientWidth);
    const h = (canvas.height = canvas.clientHeight);

    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#222230';
    ctx.fillRect(0, 0, w, h);

    const step = 4;
    const bars = Math.floor(w / step);
    for (let i = 0; i < bars; i++) {
      const barX = i * step;
      const barProgress = barX / w;
      // Deterministic synthetic waveform pattern
      const val = (Math.sin(i * 0.2) + Math.cos(i * 0.5) + 2) / 4;
      const barH = Math.max(4, val * (h - 8));
      const barY = (h - barH) / 2;

      ctx.fillStyle = barProgress <= progress ? color : '#3a3a4e';
      ctx.fillRect(barX, barY, step - 1, barH);
    }
  }

  // Bind deck actions
  ['A', 'B'].forEach((id) => {
    const el = deckEls[id];
    const color = id === 'A' ? '#ff3b5c' : '#00d2ff';

    el.play.addEventListener('click', () => mixer.toggle(id));

    el.rate.addEventListener('input', (e) => {
      const val = parseFloat(e.target.value);
      el.rateLabel.textContent = `${val.toFixed(2)}×`;
      mixer.setPlaybackRate(id, val);
    });

    el.cues.forEach((btn) => {
      const cueIdx = parseInt(btn.dataset.cue, 10);
      let holdTimer = null;
      let isHold = false;

      // Tap = trigger/set, Long press = clear
      btn.addEventListener('pointerdown', (e) => {
        isHold = false;
        holdTimer = setTimeout(() => {
          isHold = true;
          mixer.clearHotCue(id, cueIdx);
        }, 800);
      });

      btn.addEventListener('pointerup', () => {
        clearTimeout(holdTimer);
        if (isHold) return;
        const cues = mixer.decks[id].cues;
        if (typeof cues[cueIdx] === 'number') {
          mixer.triggerHotCue(id, cueIdx);
        } else {
          mixer.setHotCue(id, cueIdx);
        }
      });

      btn.addEventListener('pointercancel', () => clearTimeout(holdTimer));
    });

    // Waveform seek
    el.wave.addEventListener('click', (e) => {
      const rect = el.wave.getBoundingClientRect();
      const pos = (e.clientX - rect.left) / rect.width;
      const dur = mixer.decks[id].audio.duration;
      if (dur && isFinite(dur)) {
        mixer.seek(id, pos * dur);
      }
    });

    drawWaveform(el.wave, 0, color);
  });

  // EQ Sliders
  document.querySelectorAll('.vslider').forEach((slider) => {
    slider.addEventListener('input', (e) => {
      const deck = e.target.closest('.eq').dataset.deck;
      const band = e.target.dataset.eq;
      mixer.setEQ(deck, band, parseFloat(e.target.value));
    });
  });

  // Crossfader
  const xfader = document.getElementById('crossfader');
  xfader.addEventListener('input', (e) => {
    mixer.setCrossfader(parseFloat(e.target.value));
  });

  // Mixer engine events
  mixer.on('time', ({ deck, currentTime, duration }) => {
    const el = deckEls[deck];
    el.cur.textContent = formatTime(currentTime);
    const prog = duration > 0 ? currentTime / duration : 0;
    drawWaveform(el.wave, prog, deck === 'A' ? '#ff3b5c' : '#00d2ff');
  });

  mixer.on('loaded', ({ deck, duration }) => {
    deckEls[deck].dur.textContent = formatTime(duration);
  });

  mixer.on('state', ({ deck, playing }) => {
    const el = deckEls[deck];
    if (playing) {
      el.play.textContent = '❚❚';
      el.play.classList.add('playing');
    } else {
      el.play.textContent = '▶';
      el.play.classList.remove('playing');
    }
  });

  mixer.on('track', ({ deck, meta, cues }) => {
    deckEls[deck].title.textContent = meta.title || 'Untitled';
    updateCueButtons(deck, cues);
  });

  mixer.on('cues', ({ deck, cues }) => {
    updateCueButtons(deck, cues);
  });

  function updateCueButtons(deck, cues) {
    deckEls[deck].cues.forEach((btn, idx) => {
      if (typeof cues[idx] === 'number') {
        btn.classList.add('active');
        btn.title = `Cue ${idx + 1}: ${formatTime(cues[idx])} (Hold to clear)`;
      } else {
        btn.classList.remove('active');
        btn.title = `Set Cue ${idx + 1}`;
      }
    });
  }

  // --- Crate Drawer & Storage sync ---
  const crateToggle = document.getElementById('crate-toggle');
  const crateEl = document.getElementById('crate');
  const crateList = document.getElementById('crate-list');
  const crateAdd = document.getElementById('crate-add');
  const crateUrl = document.getElementById('crate-url');
  const crateCount = document.getElementById('crate-count');
  const crateSearchInput = document.getElementById('crate-search-input');
  const btnClearCrateSearch = document.getElementById('btn-clear-crate-search');
  const crateTabs = document.querySelectorAll('.crate-tab');

  let activeCrateTab = 'all';
  let crateSearchQuery = '';

  crateToggle.addEventListener('click', () => {
    const open = crateEl.classList.toggle('open');
    crateToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    crateToggle.innerHTML = `${open ? '▼' : '▲'} Crate <span id="crate-count">${filteredCrateTracks().length}</span>`;
  });

  let rawCrateTracks = [];

  function loadCrateFromStorage() {
    rawCrateTracks = [];
    const seenUrls = new Set();

    const addTrack = (item, source) => {
      if (!item) return;
      const url = item.audioUrl || item.url;
      if (!url || seenUrls.has(url)) return;
      seenUrls.add(url);
      rawCrateTracks.push({
        guid: item.guid || url,
        title: item.title || 'Untitled Episode',
        podcastTitle: item.podcastTitle || item.author || '',
        description: item.description || item.content || '',
        content: item.content || '',
        url: url,
        source: source || 'cached'
      });
    };

    try {
      // 1. Up Next Queue
      const q = JSON.parse(localStorage.getItem('anypod_playback_queue') || '[]');
      const eps = JSON.parse(localStorage.getItem('anypod_cached_episodes') || '{}');
      if (Array.isArray(q)) {
        q.forEach(item => {
          const ep = eps[item.guid] || item;
          addTrack(ep, 'queue');
        });
      }

      // 2. Favorites
      const favs = JSON.parse(localStorage.getItem('anypod_favorites') || '[]');
      if (Array.isArray(favs)) {
        favs.forEach(item => {
          const ep = eps[item.guid] || item;
          addTrack(ep, 'favorites');
        });
      }

      // 3. All cached episodes from your subscribed feeds
      if (eps && typeof eps === 'object') {
        Object.values(eps).forEach(ep => addTrack(ep, 'cached'));
      }
    } catch (_) {}

    // Add sample tracks if completely empty
    if (rawCrateTracks.length === 0) {
      rawCrateTracks.push(
        { title: 'Synth Loop Beat', podcastTitle: 'Sample Pack', description: 'Electronic synth loop', url: 'https://cdn.freesound.org/previews/381/381382_1676145-lq.mp3', source: 'sample' },
        { title: 'Funk Beat Loop', podcastTitle: 'Sample Pack', description: 'Funky drums sample', url: 'https://cdn.freesound.org/previews/242/242857_4284968-lq.mp3', source: 'sample' }
      );
    }

    renderCrate();
  }

  function filteredCrateTracks() {
    let list = rawCrateTracks;

    // Filter by tab
    if (activeCrateTab === 'queue') {
      list = list.filter(t => t.source === 'queue');
    } else if (activeCrateTab === 'favorites') {
      list = list.filter(t => t.source === 'favorites');
    } else if (activeCrateTab === 'cached') {
      list = list.filter(t => t.source === 'cached');
    }

    // In-depth multi-term search
    if (crateSearchQuery) {
      const terms = crateSearchQuery.toLowerCase().split(/\s+/).filter(Boolean);
      list = list.filter(t => {
        const title = (t.title || '').toLowerCase();
        const pod = (t.podcastTitle || '').toLowerCase();
        const desc = (t.content || t.description || '').toLowerCase();
        const url = (t.url || '').toLowerCase();
        return terms.every(term => title.includes(term) || pod.includes(term) || desc.includes(term) || url.includes(term));
      });
    }

    return list;
  }

  function highlightCrateText(str, query) {
    if (!str) return '';
    const safe = str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    if (!query || query.trim().length < 2) return safe;
    const terms = query.trim().toLowerCase().split(/\s+/).filter(t => t.length >= 2);
    if (terms.length === 0) return safe;
    const pattern = terms.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
    return safe.replace(new RegExp(`(${pattern})`, 'gi'), '<mark style="background:#ffcc00;color:#000;border-radius:2px;padding:0 2px;">$1</mark>');
  }

  function renderCrate() {
    crateList.innerHTML = '';
    const visibleTracks = filteredCrateTracks();
    crateCount.textContent = visibleTracks.length;

    if (visibleTracks.length === 0) {
      crateList.innerHTML = `
        <li style="padding: 18px 10px; text-align: center; color: var(--muted); font-size: 11px;">
          ${crateSearchQuery ? `No episodes matching "${crateSearchQuery}"` : 'No episodes in this tab. Try searching or paste an audio URL.'}
        </li>
      `;
      return;
    }

    visibleTracks.forEach((t) => {
      const li = document.createElement('li');
      li.className = 'crate-item';
      const metaText = t.podcastTitle || (t.source === 'queue' ? 'Queue' : (t.source === 'favorites' ? 'Favorite' : ''));
      li.innerHTML = `
        <div class="crate-item-main">
          <span class="crate-item-title">${highlightCrateText(t.title, crateSearchQuery)}</span>
          ${metaText ? `<span class="crate-item-meta">${highlightCrateText(metaText, crateSearchQuery)}</span>` : ''}
        </div>
        <div class="crate-item-actions">
          <button class="btn-load btn-load-a" data-action="load-a">Load A</button>
          <button class="btn-load btn-load-b" data-action="load-b">Load B</button>
        </div>
      `;

      li.querySelector('[data-action="load-a"]').addEventListener('click', () => {
        mixer.loadTrack('A', t.url, { title: t.title, artist: t.podcastTitle });
        crateEl.classList.remove('open');
      });

      li.querySelector('[data-action="load-b"]').addEventListener('click', () => {
        mixer.loadTrack('B', t.url, { title: t.title, artist: t.podcastTitle });
        crateEl.classList.remove('open');
      });

      crateList.appendChild(li);
    });
  }

  // Search input events
  if (crateSearchInput) {
    let searchDebounce = null;
    crateSearchInput.addEventListener('input', (e) => {
      const val = e.target.value.trim();
      crateSearchQuery = val;
      if (btnClearCrateSearch) {
        btnClearCrateSearch.classList.toggle('hidden', !val);
      }
      clearTimeout(searchDebounce);
      searchDebounce = setTimeout(renderCrate, 250);
    });

    if (btnClearCrateSearch) {
      btnClearCrateSearch.addEventListener('click', () => {
        crateSearchInput.value = '';
        crateSearchQuery = '';
        btnClearCrateSearch.classList.add('hidden');
        renderCrate();
        crateSearchInput.focus();
      });
    }
  }

  // Tabs
  crateTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      crateTabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      activeCrateTab = tab.dataset.tab;
      renderCrate();
    });
  });

  crateAdd.addEventListener('submit', (e) => {
    e.preventDefault();
    const url = crateUrl.value.trim();
    if (!url) return;
    const title = url.split('/').pop().split('?')[0] || 'Custom Track';
    rawCrateTracks.unshift({ title, url, podcastTitle: 'Custom Stream', source: 'queue' });
    crateUrl.value = '';
    renderCrate();
  });

  loadCrateFromStorage();
})();
