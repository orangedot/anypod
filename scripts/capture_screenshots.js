#!/usr/bin/env node

import http from 'node:http';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function resolveProjectPath() {
  const candidateDirs = [
    path.resolve(__dirname, '../app'),
    path.resolve(__dirname, '..'),
    path.resolve(process.cwd(), 'app'),
    process.cwd()
  ];

  for (const dir of candidateDirs) {
    if (fs.existsSync(path.join(dir, 'public', 'index.html'))) {
      return dir;
    }
  }
  return path.resolve(__dirname, '../app');
}

const appDir = resolveProjectPath();
const publicDir = path.join(appDir, 'public');
const outDir = path.join(appDir, 'docs', 'screenshots');
fs.mkdirSync(outDir, { recursive: true });

const chromeCandidates = [
  process.env.CHROME_PATH,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser'
].filter(Boolean);

let chromePath = chromeCandidates.find(p => fs.existsSync(p));
if (!chromePath) {
  console.error('Error: Google Chrome or Chromium executable not found.');
  process.exit(1);
}

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon'
};

async function getAvailablePort(startPort) {
  return new Promise((resolve) => {
    const srv = http.createServer();
    srv.listen(startPort, '127.0.0.1', () => {
      const port = srv.address().port;
      srv.close(() => resolve(port));
    });
    srv.on('error', () => {
      resolve(getAvailablePort(startPort + 1));
    });
  });
}

function startStaticServer(port) {
  const server = http.createServer((req, res) => {
    let reqPath = req.url.split('?')[0];
    if (reqPath.startsWith('/api/')) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ feeds: [], user: { email: 'alex@anypod.org' } }));
      return;
    }
    if (reqPath === '/' || reqPath === '') reqPath = '/index.html';
    const filePath = path.join(publicDir, reqPath);

    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      const ext = path.extname(filePath).toLowerCase();
      const contentType = mimeTypes[ext] || 'application/octet-stream';
      res.writeHead(200, { 'Content-Type': contentType });
      fs.createReadStream(filePath).pipe(res);
    } else {
      res.writeHead(404);
      res.end('Not found');
    }
  });

  return new Promise((resolve) => {
    server.listen(port, '127.0.0.1', () => {
      resolve(server);
    });
  });
}

const continueData = [
  {
    pod: 'RA PODCAST',
    title: 'EX.814 Syd',
    desc: 'The frontwoman of Grammy-nominated The Internet talks ambition, contentment and her third solo album.',
    time: '2h ago',
    dur: '54:02',
    resume: 'Resumes at 14:20',
    pct: 26,
    active: true,
    art: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=200&h=200&fit=crop'
  },
  {
    pod: "NASA'S CURIOUS UNIVERSE",
    title: 'Encore: Welcome to the Dark Side',
    desc: 'Normal matter—the kind that makes up our home planet and everything we can see—adds up to just 5 percent.',
    time: 'Yesterday',
    dur: '25:24',
    resume: 'Resumes at 19:02',
    pct: 75,
    active: false,
    art: 'https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=200&h=200&fit=crop'
  },
  {
    pod: 'THE CLIMATE QUESTION',
    title: 'Can clean hydrogen replace dirty fossil fuels?',
    desc: 'Exploring how green hydrogen is produced and whether it can decarbonise shipping and steel production.',
    time: '2d ago',
    dur: '38:15',
    resume: 'Resumes at 14:40',
    pct: 38,
    active: false,
    art: 'https://images.unsplash.com/photo-1497435334941-8c899ee9e8e9?w=200&h=200&fit=crop'
  },
  {
    pod: 'FORSCHUNG AKTUELL',
    title: 'Klimawandel beschleunigt den Wasserkreislauf',
    desc: 'Neue Satellitendaten zeigen deutliche Veränderungen bei weltweiten Niederschlagsmustern.',
    time: '3d ago',
    dur: '28:40',
    resume: 'Resumes at 08:15',
    pct: 29,
    active: false,
    art: 'https://images.unsplash.com/photo-1532094349884-543bc11b234d?w=200&h=200&fit=crop'
  },
  {
    pod: 'ZEIT WISSEN',
    title: 'Warum der Wald uns gesund macht',
    desc: 'Wie Terpene und Waldatmosphäre auf unser Immunsystem wirken und warum Bäume heilsam sind.',
    time: '4d ago',
    dur: '42:10',
    resume: 'Resumes at 21:00',
    pct: 50,
    active: false,
    art: 'https://images.unsplash.com/photo-1448375240586-882707db888b?w=200&h=200&fit=crop'
  }
];

const timelineData = [
  {
    pod: 'NATURE PODCAST',
    title: 'Bank accounts reveal the fingerprints of abusive financial control',
    desc: 'Investigating the day-to-day impacts of Financial Abuse with Nature research analysis.',
    time: '5m ago',
    dur: '24:12',
    art: 'https://images.unsplash.com/photo-1507679799987-c73779587ccf?w=200&h=200&fit=crop'
  },
  {
    pod: 'WAS JETZT?',
    title: 'Wie der Gesundheitsminister Merz Aussagen einzufangen versucht',
    desc: 'Für den einen ist es Routine, für den anderen eine Premiere: Verteidigungsminister Boris Pistorius...',
    time: '13m ago',
    dur: '11:03',
    art: 'https://images.unsplash.com/photo-1585829365295-ab7cd400c167?w=200&h=200&fit=crop'
  },
  {
    pod: 'THE ECONOMIST PODCASTS',
    title: 'National front-runner: who can beat Le Pen?',
    desc: 'Marine Le Pen, party leader of France’s populist-right National Rally, starts her fourth campaign.',
    time: '6h ago',
    dur: '19:48',
    art: 'https://images.unsplash.com/photo-1495020689067-958852a7765e?w=200&h=200&fit=crop'
  },
  {
    pod: 'SERVUS. GRÜEZI. HALLO.',
    title: 'So neutral wollen nichtmal die Schweizer sein',
    desc: 'SVP-Doyen Christoph Blocher droht eine krachende Niederlage: Am Sonntag stimmen die Schweizer ab.',
    time: '10h ago',
    dur: '57:29',
    art: 'https://images.unsplash.com/photo-1506744038136-46273834b3fb?w=200&h=200&fit=crop'
  },
  {
    pod: 'WAS JETZT?',
    title: 'Wie groß ist das Antisemitismusproblem der Linken?',
    desc: 'Nach ihrem Wahlerfolg in Berlin stehen Teile der Linken wegen ihres Umgangs mit Kritik unter Druck.',
    time: '11h ago',
    dur: '13:05',
    art: 'https://images.unsplash.com/photo-1585829365295-ab7cd400c167?w=200&h=200&fit=crop'
  }
];

const feedsData = [
  {
    title: 'RA Podcast',
    author: 'Resident Advisor',
    desc: 'Electronic music and DJ mixes from the worlds best electronic artists.',
    episodes: '814 episodes',
    art: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=200&h=200&fit=crop'
  },
  {
    title: "NASA's Curious Universe",
    author: 'National Aeronautics and Space Administration',
    desc: 'Join NASA scientists and explorers as we unravel cosmic mysteries.',
    episodes: '92 episodes',
    art: 'https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=200&h=200&fit=crop'
  },
  {
    title: 'The Climate Question',
    author: 'BBC World Service',
    desc: 'Why do we find it so hard to save our own planet? Clear climate answers.',
    episodes: '168 episodes',
    art: 'https://images.unsplash.com/photo-1497435334941-8c899ee9e8e9?w=200&h=200&fit=crop'
  },
  {
    title: 'Forschung aktuell',
    author: 'Deutschlandfunk',
    desc: 'Berichte aus Wissenschaft, Forschung und Technik täglich aktuell.',
    episodes: '1240 episodes',
    art: 'https://images.unsplash.com/photo-1532094349884-543bc11b234d?w=200&h=200&fit=crop'
  },
  {
    title: 'Nature Podcast',
    author: 'Nature',
    desc: 'Science news and highlights from across the natural sciences.',
    episodes: '450 episodes',
    art: 'https://images.unsplash.com/photo-1507679799987-c73779587ccf?w=200&h=200&fit=crop'
  },
  {
    title: 'ZEIT WISSEN',
    author: 'ZEIT ONLINE',
    desc: 'Wissenschaft, Medizin und Gesellschaft vertieft recherchiert.',
    episodes: '194 episodes',
    art: 'https://images.unsplash.com/photo-1448375240586-882707db888b?w=200&h=200&fit=crop'
  }
];

function inPageSetup(continueData, timelineData, feedsData) {
  document.getElementById('auth-modal')?.classList.add('hidden');
  document.getElementById('empty-state')?.classList.add('hidden');

  const feedCountEl = document.getElementById('feed-count');
  if (feedCountEl) feedCountEl.textContent = '36';

  const userStatusPill = document.getElementById('user-status-pill');
  if (userStatusPill) {
    userStatusPill.innerHTML = '<span class="status-indicator active"></span><span class="user-pill-details"><span id="user-email-label">alex@anypod.org</span><button class="btn-pill-action" id="btn-account-toggle">Log Out</button></span>';
  }

  const shelf = document.getElementById('continue-shelf');
  if (shelf) shelf.classList.remove('hidden');

  const continueCount = document.getElementById('continue-count');
  if (continueCount) continueCount.textContent = '12';

  const continueToggleLabel = document.getElementById('continue-toggle-label');
  if (continueToggleLabel) continueToggleLabel.textContent = 'Show all (12)';

  const continueGrid = document.getElementById('continue-grid');
  const timelineList = document.getElementById('timeline-list');

  function createCard(item) {
    const card = document.createElement('div');
    card.className = 'episode-card' + (item.active ? ' playing' : '');

    let cardHtml = '<div class="episode-card-top">';
    cardHtml += '<img class="episode-artwork" src="' + item.art + '">';
    cardHtml += '<div class="episode-header-info">';
    cardHtml += '<div class="episode-podcast-name">' + item.pod + '</div>';
    cardHtml += '<div class="episode-title">' + item.title + '</div>';
    cardHtml += '</div></div>';
    cardHtml += '<div class="episode-desc">' + item.desc + '</div>';
    if (item.pct) {
      cardHtml += '<div class="ep-progress-track"><div class="ep-progress-fill" style="width: ' + item.pct + '%;"></div></div>';
    }
    cardHtml += '<div class="episode-footer">';
    cardHtml += '<div class="episode-meta">';
    cardHtml += '<span>' + item.time + '</span>';
    cardHtml += '<span>' + item.dur + '</span>';
    if (item.resume) {
      cardHtml += '<span class="ep-resume-time">• ' + item.resume + '</span>';
    }
    cardHtml += '</div>';
    cardHtml += '<div class="episode-card-actions">';
    cardHtml += '<button class="btn-download-ep"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg></button>';
    cardHtml += '<button class="btn-queue-ep"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 6h16M4 12h10M4 18h7"></path><path d="M18 15v6M15 18h6"></path></svg></button>';
    cardHtml += '<button class="btn-mark-played"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="9"></circle><polyline points="16 9 11 14 8 11"></polyline></svg></button>';
    cardHtml += '<button class="btn-play-ep">' + (item.active ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>' : '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="6 4 20 12 6 20 6 4"></polygon></svg>') + '</button>';
    cardHtml += '</div></div>';

    card.innerHTML = cardHtml;
    return card;
  }

  if (continueGrid) {
    continueGrid.innerHTML = '';
    continueData.forEach(d => continueGrid.appendChild(createCard(d)));
  }

  if (timelineList) {
    timelineList.innerHTML = '';
    timelineData.forEach(d => timelineList.appendChild(createCard(d)));
  }

  function createFeedCard(f) {
    const fCard = document.createElement('div');
    fCard.className = 'feed-card';
    let fHtml = '<div class="feed-header">';
    fHtml += '<img class="feed-art" src="' + f.art + '">';
    fHtml += '<div class="feed-info">';
    fHtml += '<h4>' + f.title + '</h4>';
    fHtml += '<p>' + f.episodes + ' • ' + f.author + '</p>';
    fHtml += '</div>';
    fHtml += '<button class="btn-feed-unsubscribe"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg></button>';
    fHtml += '</div>';
    fHtml += '<p class="feed-card-desc">' + f.desc + '</p>';
    fCard.innerHTML = fHtml;
    return fCard;
  }

  window.__renderMockFeeds = () => {
    const fg = document.getElementById('feeds-grid');
    if (fg) {
      fg.innerHTML = '';
      feedsData.forEach(f => fg.appendChild(createFeedCard(f)));
    }
  };

  window.__renderMockFeeds();

  const playerBar = document.getElementById('player-bar');
  if (playerBar) {
    playerBar.classList.add('active-episode');
    const art = document.getElementById('player-artwork');
    if (art) art.src = 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=200&h=200&fit=crop';
    const title = document.getElementById('player-title');
    if (title) title.textContent = 'EX.814 Syd';
    const pod = document.getElementById('player-podcast');
    if (pod) pod.textContent = 'RA PODCAST';
    const curTime = document.getElementById('current-time');
    if (curTime) curTime.textContent = '14:20';
    const totTime = document.getElementById('total-duration');
    if (totTime) totTime.textContent = '54:02';
    const seekBar = document.getElementById('seek-bar');
    if (seekBar) {
      seekBar.value = '26.5';
      seekBar.style.setProperty('--seek-pct', '26.5%');
    }
    const playIcon = document.querySelector('.icon-play');
    if (playIcon) playIcon.classList.add('hidden');
    const pauseIcon = document.querySelector('.icon-pause');
    if (pauseIcon) {
      pauseIcon.classList.remove('hidden');
      pauseIcon.style.display = 'block';
    }
  }

  const miniArt = document.getElementById('mini-artwork');
  if (miniArt) miniArt.src = 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=200&h=200&fit=crop';
  const miniTitle = document.getElementById('mini-title');
  if (miniTitle) miniTitle.textContent = 'EX.814 Syd';
  const miniPod = document.getElementById('mini-podcast');
  if (miniPod) miniPod.textContent = 'RA PODCAST';
  const miniFill = document.getElementById('mini-progress-fill');
  if (miniFill) miniFill.style.width = '26.5%';
  const miniPlayIcon = document.querySelector('.mini-icon-play');
  if (miniPlayIcon) miniPlayIcon.classList.add('hidden');
  const miniPauseIcon = document.querySelector('.mini-icon-pause');
  document.body.classList.add('has-active-episode', 'has-full-player');

  window.__renderMockTimeline = () => {
    document.getElementById('empty-state')?.classList.add('hidden');
    const tl = document.getElementById('timeline-list');
    if (tl) {
      tl.innerHTML = '';
      timelineData.forEach(d => tl.appendChild(createCard(d)));
    }
    const cg = document.getElementById('continue-grid');
    if (cg) {
      cg.innerHTML = '';
      continueData.forEach(d => cg.appendChild(createCard(d)));
    }
  };

  // Prevent background network failures from resetting mock cards
  window.renderTimeline = () => {
    window.__renderMockTimeline();
  };
  window.renderFeeds = () => {
    window.__renderMockFeeds();
  };
  window.renderFeedsGrid = () => {
    window.__renderMockFeeds();
  };
  window.renderContinueListening = () => {};
}

async function main() {
  const args = process.argv.slice(2);
  let targetUrl = '';
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--url' && args[i + 1]) {
      targetUrl = args[i + 1];
    }
  }

  let staticServer = null;
  if (!targetUrl) {
    const serverPort = await getAvailablePort(8791);
    staticServer = await startStaticServer(serverPort);
    targetUrl = `http://127.0.0.1:${serverPort}/`;
    console.log(`Local static server hosting ${publicDir} on port ${serverPort}`);
  } else {
    console.log(`Capturing screenshots from target URL: ${targetUrl}`);
  }

  const debugPort = await getAvailablePort(9225);
  const tmpProfile = `/tmp/anypod-chrome-shot-${Date.now()}`;
  fs.mkdirSync(tmpProfile, { recursive: true });

  const chrome = spawn(chromePath, [
    '--headless=new',
    `--remote-debugging-port=${debugPort}`,
    '--no-sandbox',
    '--disable-gpu',
    `--user-data-dir=${tmpProfile}`,
    targetUrl
  ]);

  chrome.stdout.on('data', data => console.log(`[Chrome stdout] ${data}`));
  chrome.stderr.on('data', data => console.error(`[Chrome stderr] ${data}`));
  chrome.on('exit', code => {
    if (code !== null && code !== 0) {
      console.error(`[Chrome process exited early with code ${code}]`);
    }
  });

  const cleanup = () => {
    try { chrome.kill(); } catch (e) {}
    if (staticServer) {
      try { staticServer.close(); } catch (e) {}
    }
    try { fs.rmSync(tmpProfile, { recursive: true, force: true }); } catch (e) {}
  };

  process.on('SIGINT', () => { cleanup(); process.exit(0); });
  process.on('SIGTERM', () => { cleanup(); process.exit(0); });

  let pageTarget = null;
  for (let i = 0; i < 40; i++) {
    await new Promise(r => setTimeout(r, 250));
    try {
      const targets = await new Promise((resolve, reject) => {
        http.get(`http://localhost:${debugPort}/json`, (res) => {
          let data = '';
          res.on('data', chunk => data += chunk);
          res.on('end', () => resolve(JSON.parse(data)));
        }).on('error', reject);
      });
      pageTarget = targets.find(t => t.type === 'page');
      if (pageTarget) break;
    } catch (e) {}
  }

  if (!pageTarget) {
    cleanup();
    throw new Error('Could not establish connection to Chrome remote debugging port.');
  }

  const ws = new WebSocket(pageTarget.webSocketDebuggerUrl);
  let msgId = 1;
  const pending = new Map();

  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    if (msg.id && pending.has(msg.id)) {
      pending.get(msg.id)(msg.result);
      pending.delete(msg.id);
    }
  };

  await new Promise(r => ws.onopen = r);

  function send(method, params = {}) {
    return new Promise(resolve => {
      const id = msgId++;
      pending.set(id, resolve);
      ws.send(JSON.stringify({ id, method, params }));
    });
  }

  await send('Page.enable');
  await send('Runtime.enable');

  // Inject Mock State and Realistic Content
  const setupExpression = `(${inPageSetup.toString()})(${JSON.stringify(continueData)}, ${JSON.stringify(timelineData)}, ${JSON.stringify(feedsData)})`;
  await send('Runtime.evaluate', { expression: setupExpression });

  await new Promise(r => setTimeout(r, 1200));

  // 1. Desktop Dark Mode
  console.log('Capturing Desktop Dark Mode...');
  await send('Emulation.setDeviceMetricsOverride', {
    width: 1440,
    height: 900,
    deviceScaleFactor: 2,
    mobile: false
  });
  await send('Runtime.evaluate', {
    expression: `
      document.documentElement.setAttribute('data-theme', 'dark');
      document.body.style.backgroundColor = '#0c0a09';
      document.body.classList.remove('has-mini-player');
      document.body.classList.add('has-full-player');
      document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
      document.getElementById('panel-timeline')?.classList.add('active');
      document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
      document.getElementById('tab-timeline')?.classList.add('active');
      if (typeof window.__renderMockTimeline === 'function') window.__renderMockTimeline();
    `
  });
  await new Promise(r => setTimeout(r, 800));
  const darkShot = await send('Page.captureScreenshot', { format: 'png' });
  const darkPath = path.join(outDir, 'preview-dark.png');
  fs.writeFileSync(darkPath, Buffer.from(darkShot.data, 'base64'));
  console.log(`Saved: ${darkPath} (${(fs.statSync(darkPath).size / 1024).toFixed(1)} KB)`);

  // 2. Desktop Light Mode
  console.log('Capturing Desktop Light Mode...');
  await send('Runtime.evaluate', {
    expression: `
      document.documentElement.setAttribute('data-theme', 'light');
      document.body.style.backgroundColor = '#f8f6f0';
      if (typeof window.__renderMockTimeline === 'function') window.__renderMockTimeline();
    `
  });
  await new Promise(r => setTimeout(r, 800));
  const lightShot = await send('Page.captureScreenshot', { format: 'png' });
  const lightPath = path.join(outDir, 'preview-light.png');
  fs.writeFileSync(lightPath, Buffer.from(lightShot.data, 'base64'));
  console.log(`Saved: ${lightPath} (${(fs.statSync(lightPath).size / 1024).toFixed(1)} KB)`);

  // Switch to Mobile Metrics (iPhone 14 / standard 390x844 @3x)
  await send('Emulation.setDeviceMetricsOverride', {
    width: 390,
    height: 844,
    deviceScaleFactor: 3,
    mobile: true
  });

  // 3. Mobile Active Playback (Timeline with full player bar)
  console.log('Capturing Mobile Active Playback...');
  await send('Runtime.evaluate', {
    expression: `
      document.documentElement.setAttribute('data-theme', 'dark');
      document.body.style.backgroundColor = '#0c0a09';
      document.body.classList.remove('has-mini-player');
      document.body.classList.add('has-full-player');
      document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
      document.getElementById('panel-timeline')?.classList.add('active');
      document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
      document.getElementById('tab-timeline')?.classList.add('active');
      window.scrollTo(0, 0);
    `
  });
  await new Promise(r => setTimeout(r, 800));
  const mobilePlayerShot = await send('Page.captureScreenshot', {
    format: 'png',
    captureBeyondViewport: false,
    clip: { x: 0, y: 0, width: 390, height: 844, scale: 1 }
  });
  const mobilePlayerPath = path.join(outDir, 'mobile-player.png');
  fs.writeFileSync(mobilePlayerPath, Buffer.from(mobilePlayerShot.data, 'base64'));
  console.log(`Saved: ${mobilePlayerPath} (${(fs.statSync(mobilePlayerPath).size / 1024).toFixed(1)} KB)`);

  // 4. Mobile Feeds Listing
  console.log('Capturing Mobile Subscribed Feeds...');
  await send('Runtime.evaluate', {
    expression: `
      document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
      document.getElementById('panel-feeds')?.classList.add('active');
      document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
      document.getElementById('tab-feeds')?.classList.add('active');
      if (typeof window.__renderMockFeeds === 'function') window.__renderMockFeeds();
      window.scrollTo(0, 0);
    `
  });
  await new Promise(r => setTimeout(r, 800));
  const mobileFeedsShot = await send('Page.captureScreenshot', {
    format: 'png',
    captureBeyondViewport: false,
    clip: { x: 0, y: 0, width: 390, height: 844, scale: 1 }
  });
  const mobileFeedsPath = path.join(outDir, 'mobile-feeds.png');
  fs.writeFileSync(mobileFeedsPath, Buffer.from(mobileFeedsShot.data, 'base64'));
  console.log(`Saved: ${mobileFeedsPath} (${(fs.statSync(mobileFeedsPath).size / 1024).toFixed(1)} KB)`);

  // 5. Mobile Mini-Player (Compact mini-player bar)
  console.log('Capturing Mobile Mini Player...');
  await send('Runtime.evaluate', {
    expression: `
      document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
      document.getElementById('panel-timeline')?.classList.add('active');
      document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
      document.getElementById('tab-timeline')?.classList.add('active');
      document.body.classList.add('has-mini-player');
      document.body.classList.remove('has-full-player');
      window.scrollTo(0, 0);
    `
  });
  await new Promise(r => setTimeout(r, 800));
  const mobileMiniShot = await send('Page.captureScreenshot', {
    format: 'png',
    captureBeyondViewport: false,
    clip: { x: 0, y: 0, width: 390, height: 844, scale: 1 }
  });
  const mobileMiniPath = path.join(outDir, 'mobile-mini.png');
  fs.writeFileSync(mobileMiniPath, Buffer.from(mobileMiniShot.data, 'base64'));
  console.log(`Saved: ${mobileMiniPath} (${(fs.statSync(mobileMiniPath).size / 1024).toFixed(1)} KB)`);

  // 6. Mobile Active Playback Light Mode
  console.log('Capturing Mobile Active Playback (Light)...');
  await send('Runtime.evaluate', {
    expression: `
      document.documentElement.setAttribute('data-theme', 'light');
      document.body.style.backgroundColor = '#f8f6f0';
      document.body.classList.remove('has-mini-player');
      document.body.classList.add('has-full-player');
      document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
      document.getElementById('panel-timeline')?.classList.add('active');
      document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
      document.getElementById('tab-timeline')?.classList.add('active');
      if (typeof window.__renderMockTimeline === 'function') window.__renderMockTimeline();
      window.scrollTo(0, 0);
    `
  });
  await new Promise(r => setTimeout(r, 800));
  const mobilePlayerLightShot = await send('Page.captureScreenshot', {
    format: 'png',
    captureBeyondViewport: false,
    clip: { x: 0, y: 0, width: 390, height: 844, scale: 1 }
  });
  const mobilePlayerLightPath = path.join(outDir, 'mobile-player-light.png');
  fs.writeFileSync(mobilePlayerLightPath, Buffer.from(mobilePlayerLightShot.data, 'base64'));
  console.log(`Saved: ${mobilePlayerLightPath} (${(fs.statSync(mobilePlayerLightPath).size / 1024).toFixed(1)} KB)`);

  // 7. Mobile Mini Player Light Mode
  console.log('Capturing Mobile Mini Player (Light)...');
  await send('Runtime.evaluate', {
    expression: `
      document.documentElement.setAttribute('data-theme', 'light');
      document.body.style.backgroundColor = '#f8f6f0';
      document.body.classList.add('has-mini-player');
      document.body.classList.remove('has-full-player');
      window.scrollTo(0, 0);
    `
  });
  await new Promise(r => setTimeout(r, 800));
  const mobileMiniLightShot = await send('Page.captureScreenshot', {
    format: 'png',
    captureBeyondViewport: false,
    clip: { x: 0, y: 0, width: 390, height: 844, scale: 1 }
  });
  const mobileMiniLightPath = path.join(outDir, 'mobile-mini-light.png');
  fs.writeFileSync(mobileMiniLightPath, Buffer.from(mobileMiniLightShot.data, 'base64'));
  console.log(`Saved: ${mobileMiniLightPath} (${(fs.statSync(mobileMiniLightPath).size / 1024).toFixed(1)} KB)`);

  ws.close();
  cleanup();
  console.log('\nAll screenshots captured and saved successfully!');
}

main().catch(err => {
  console.error('Fatal screenshot error:', err);
  process.exit(1);
});
