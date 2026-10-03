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

  crateToggle.addEventListener('click', () => {
    const open = crateEl.classList.toggle('open');
    crateToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    crateToggle.innerHTML = `${open ? '▼' : '▲'} Crate <span id="crate-count">${crateTracks.length}</span>`;
  });

  let crateTracks = [];

  function loadCrateFromStorage() {
    crateTracks = [];
    try {
      // 1. Check anypod playback queue
      const q = JSON.parse(localStorage.getItem('anypod_playback_queue') || '[]');
      const eps = JSON.parse(localStorage.getItem('anypod_cached_episodes') || '{}');
      if (Array.isArray(q)) {
        q.forEach((item) => {
          const ep = eps[item.guid] || item;
          if (ep && (ep.audioUrl || ep.url)) {
            crateTracks.push({
              title: ep.title || 'Podcast Episode',
              url: ep.audioUrl || ep.url
            });
          }
        });
      }
    } catch (_) {}

    // Add sample tracks if empty
    if (crateTracks.length === 0) {
      crateTracks.push(
        { title: 'Sample 1: Synth Loop', url: 'https://cdn.freesound.org/previews/381/381382_1676145-lq.mp3' },
        { title: 'Sample 2: Funk Beat', url: 'https://cdn.freesound.org/previews/242/242857_4284968-lq.mp3' }
      );
    }
    renderCrate();
  }

  function renderCrate() {
    crateList.innerHTML = '';
    crateCount.textContent = crateTracks.length;
    crateTracks.forEach((t, i) => {
      const li = document.createElement('li');
      li.className = 'crate-item';
      li.innerHTML = `
        <span class="crate-item-title">${t.title}</span>
        <div class="crate-item-actions">
          <button class="btn-load btn-load-a" data-action="load-a" data-idx="${i}">Load A</button>
          <button class="btn-load btn-load-b" data-action="load-b" data-idx="${i}">Load B</button>
        </div>
      `;
      crateList.appendChild(li);
    });
  }

  crateList.addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    const idx = parseInt(btn.dataset.idx, 10);
    const track = crateTracks[idx];
    if (!track) return;

    if (btn.dataset.action === 'load-a') {
      mixer.loadTrack('A', track.url, { title: track.title });
      crateEl.classList.remove('open');
    } else if (btn.dataset.action === 'load-b') {
      mixer.loadTrack('B', track.url, { title: track.title });
      crateEl.classList.remove('open');
    }
  });

  crateAdd.addEventListener('submit', (e) => {
    e.preventDefault();
    const url = crateUrl.value.trim();
    if (!url) return;
    const title = url.split('/').pop().split('?')[0] || 'Custom Track';
    crateTracks.unshift({ title, url });
    crateUrl.value = '';
    renderCrate();
  });

  loadCrateFromStorage();
})();
