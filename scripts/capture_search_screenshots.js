#!/usr/bin/env node

/**
 * capture_search_screenshots.js
 *
 * Dedicated screenshot utility for:
 * 1. Unified Search across Podcasts, YouTube, and YT Music (Desktop & Mobile).
 * 2. Active episode playback bar in bottom player with new card design.
 * 3. Clean feed detail page without duplicate back buttons.
 */

import http from 'node:http';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const appDir = path.resolve(__dirname, '..');
const publicDir = path.join(appDir, 'public');
const distDir = path.join(publicDir, 'dist');
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

const chromePath = chromeCandidates.find(p => fs.existsSync(p));
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
  '.woff2': 'font/woff2'
};

async function getAvailablePort(startPort) {
  return new Promise((resolve) => {
    const srv = http.createServer();
    srv.listen(startPort, '127.0.0.1', () => {
      const port = srv.address().port;
      srv.close(() => resolve(port));
    });
    srv.on('error', () => resolve(getAvailablePort(startPort + 1)));
  });
}

function startStaticServer(port) {
  const server = http.createServer((req, res) => {
    let reqPath = req.url.split('?')[0];

    // API fallbacks
    if (reqPath.startsWith('/api/')) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ results: [], feeds: [], user: { email: 'alex@anypod.org' } }));
      return;
    }

    if (reqPath === '/' || reqPath === '') reqPath = '/index.html';

    // Check distDir first, fallback to publicDir
    let filePath = path.join(distDir, reqPath);
    if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
      filePath = path.join(publicDir, reqPath);
    }

    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      const ext = path.extname(filePath).toLowerCase();
      res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'application/octet-stream' });
      fs.createReadStream(filePath).pipe(res);
    } else {
      res.writeHead(404);
      res.end('Not found');
    }
  });

  return new Promise((resolve) => {
    server.listen(port, '127.0.0.1', () => resolve(server));
  });
}

async function run() {
  const serverPort = await getAvailablePort(8780);
  const server = await startStaticServer(serverPort);
  console.log(`🚀 Static server ready on http://127.0.0.1:${serverPort}`);

  const debugPort = await getAvailablePort(9228);
  const tmpProfile = `/tmp/anypod-shot-search-${Date.now()}`;
  fs.mkdirSync(tmpProfile, { recursive: true });

  const targetUrl = `http://127.0.0.1:${serverPort}/`;
  const chromeProc = spawn(chromePath, [
    '--headless=new',
    `--remote-debugging-port=${debugPort}`,
    '--no-sandbox',
    '--disable-gpu',
    `--user-data-dir=${tmpProfile}`,
    targetUrl
  ]);

  const cleanup = () => {
    try { chromeProc.kill(); } catch (_) {}
    try { server.close(); } catch (_) {}
    try { fs.rmSync(tmpProfile, { recursive: true, force: true }); } catch (_) {}
  };

  process.on('SIGINT', () => { cleanup(); process.exit(0); });
  process.on('SIGTERM', () => { cleanup(); process.exit(0); });

  let pageTarget = null;
  for (let i = 0; i < 40; i++) {
    await new Promise(r => setTimeout(r, 250));
    try {
      const targets = await new Promise((resolve, reject) => {
        http.get(`http://127.0.0.1:${debugPort}/json`, (res) => {
          let data = '';
          res.on('data', chunk => data += chunk);
          res.on('end', () => resolve(JSON.parse(data)));
        }).on('error', reject);
      });
      pageTarget = targets.find(t => t.type === 'page');
      if (pageTarget) break;
    } catch (_) {}
  }

  if (!pageTarget) {
    cleanup();
    throw new Error('Could not connect to Chrome remote debugging port.');
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
  await new Promise(r => setTimeout(r, 1200));

  async function capture(filename, width = 1280, height = 800) {
    await send('Emulation.setDeviceMetricsOverride', {
      width,
      height,
      deviceScaleFactor: 2,
      mobile: width < 600
    });
    await new Promise(r => setTimeout(r, 600));

    const shot = await send('Page.captureScreenshot', { format: 'png' });
    const outPath = path.join(outDir, filename);
    fs.writeFileSync(outPath, Buffer.from(shot.data, 'base64'));
    const sizeKb = (fs.statSync(outPath).size / 1024).toFixed(1);
    console.log(`📸 Saved: ${filename} (${sizeKb} KB, ${width}x${height})`);
    return outPath;
  }

  try {
    // 1. Inject Unified Search results into Discover view
    console.log('Injecting search results into Discover view...');
    await send('Runtime.evaluate', {
      expression: `
        (() => {
          // Switch tab to discover
          if (typeof navigateTo === 'function') navigateTo('discover');
          
          document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
          const discPanel = document.getElementById('panel-discover');
          if (discPanel) discPanel.classList.add('active');

          document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
          const discTab = document.getElementById('tab-discover');
          if (discTab) discTab.classList.add('active');

          const quickInput = document.getElementById('empty-quick-input');
          if (quickInput) quickInput.value = 'Daft Punk';
          
          const clearBtn = document.getElementById('btn-discover-clear-search');
          if (clearBtn) clearBtn.classList.remove('hidden');

          const container = document.getElementById('empty-quick-results');
          if (container) {
            container.innerHTML = '';
            
            const headerEl = document.createElement('div');
            headerEl.className = 'discover-section-header';
            headerEl.style.width = '100%';
            headerEl.style.marginTop = '0.5rem';
            headerEl.style.marginBottom = '0.75rem';
            headerEl.innerHTML = '<div class="discover-section-title-wrap"><h3 class="discover-section-title" style="font-size: 1.05rem;">Search Results (6)</h3><span class="discover-section-pill">ALL SOURCES</span></div>';
            container.appendChild(headerEl);

            const gridEl = document.createElement('div');
            gridEl.className = 'discover-narrative-grid unified-search-results-grid';
            container.appendChild(gridEl);

            const mockItems = [
              {
                id: 'TCd6PfxOy0Y',
                guid: 'yt:TCd6PfxOy0Y',
                title: 'Daft Punk - Veridis Quo (Official Audio)',
                author: 'Daft Punk',
                podcastTitle: 'Daft Punk',
                duration: '5:46',
                artwork: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=300&h=300&fit=crop',
                type: 'youtube_music',
                isYouTube: true,
                pubDate: 'Track'
              },
              {
                id: 'CCHdMIEGaaM',
                guid: 'yt:CCHdMIEGaaM',
                title: 'Get Lucky (Official Video) feat. Pharrell Williams',
                author: 'Daft Punk',
                podcastTitle: 'Daft Punk',
                duration: '4:08',
                artwork: 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=300&h=300&fit=crop',
                type: 'youtube',
                isYouTube: true,
                pubDate: 'Video'
              },
              {
                collectionName: 'Daft Punk: Alive in the Machine',
                artistName: 'Electronic Beats Podcast',
                feedUrl: 'https://feeds.example.com/daft-punk',
                trackCount: 42,
                artworkUrl600: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=300&h=300&fit=crop',
                type: 'podcast',
                isPodcast: true,
                pubDate: 'Show'
              },
              {
                id: 'PwILkY9gRrc',
                guid: 'yt:PwILkY9gRrc',
                title: 'Da Funk (Official Audio)',
                author: 'Daft Punk',
                podcastTitle: 'Daft Punk',
                duration: '5:29',
                artwork: 'https://images.unsplash.com/photo-1492684223066-81342ee5ff30?w=300&h=300&fit=crop',
                type: 'youtube_music',
                isYouTube: true,
                pubDate: 'Track'
              },
              {
                collectionName: 'French Touch & Electronic Pioneer Sessions',
                artistName: 'BBC Radio 6 Music',
                feedUrl: 'https://feeds.example.com/french-touch',
                trackCount: 18,
                artworkUrl600: 'https://images.unsplash.com/photo-1508700115892-45ecd05ae2ad?w=300&h=300&fit=crop',
                type: 'podcast',
                isPodcast: true,
                pubDate: 'Show'
              },
              {
                id: 'VeauURD-qLk',
                guid: 'yt:VeauURD-qLk',
                title: 'Daft Punk Greatest Hits 🔥 Best Songs & Playlist Full Album',
                author: 'Music EDM 2022',
                podcastTitle: 'Music EDM',
                duration: '1:11:15',
                artwork: 'https://images.unsplash.com/photo-1459749411175-04bf5292ceea?w=300&h=300&fit=crop',
                type: 'youtube',
                isYouTube: true,
                pubDate: 'Video'
              }
            ];

            mockItems.forEach(item => {
              if (typeof buildUnifiedSearchResultCard === 'function') {
                gridEl.appendChild(buildUnifiedSearchResultCard(item));
              }
            });
          }
          window.scrollTo(0, 0);
        })()
      `
    });

    await new Promise(r => setTimeout(r, 800));

    // Capture Search Results Desktop & Mobile
    await capture('search_results_desktop.png', 1280, 850);
    await capture('search_results_mobile.png', 390, 844);

    // 2. Simulate playback of a search result track
    console.log('Simulating playback of YouTube Music track...');
    await send('Runtime.evaluate', {
      expression: `
        (() => {
          const track = {
            guid: 'yt:TCd6PfxOy0Y',
            title: 'Daft Punk - Veridis Quo (Official Audio)',
            author: 'Daft Punk',
            podcastTitle: 'Daft Punk • YT Music',
            audioUrl: 'https://www.youtube.com/watch?v=TCd6PfxOy0Y',
            artwork: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=300&h=300&fit=crop',
            duration: '5:46',
            isYouTube: true,
            videoId: 'TCd6PfxOy0Y'
          };
          state.currentEpisode = track;
          state.playbackStatus = 'playing';
          state.isPlaying = true;
          state.activeEngine = 'youtube';

          if (elements.player) elements.player.classList.remove('hidden');
          if (elements.playerTitle) elements.playerTitle.textContent = track.title;
          if (elements.playerPodcast) elements.playerPodcast.textContent = track.podcastTitle;
          if (elements.playerArtwork) elements.playerArtwork.src = track.artwork;
          if (elements.playerDuration) elements.playerDuration.textContent = '5:46';
          if (elements.playerCurTime) elements.playerCurTime.textContent = '1:24';
          if (elements.playerProgress) elements.playerProgress.style.width = '24.2%';
          if (elements.btnPlay) elements.btnPlay.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>';

          // Sync first card playing state
          const firstCard = document.querySelector('.search-result-card');
          if (firstCard) {
            const playBtn = firstCard.querySelector('.btn-play-ep');
            if (playBtn) playBtn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>';
            const progress = firstCard.querySelector('.episode-progress-bar');
            if (progress) progress.style.width = '24.2%';
            const timeLine = firstCard.querySelector('.date-line');
            if (timeLine) timeLine.textContent = 'Track • Resumes at 1:24';
          }
        })()
      `
    });

    await new Promise(r => setTimeout(r, 600));

    // Capture Play Active Desktop & Mobile
    await capture('search_play_active_desktop.png', 1280, 850);
    await capture('search_play_active_mobile.png', 390, 844);

    // 3. Test Feed Detail Page to verify duplicate back button is gone
    console.log('Testing feed detail page (Radiolab)...');
    await send('Runtime.evaluate', {
      expression: `
        (() => {
          state.feedMetadata['https://feeds.simplecast.com/EmVW7VGp'] = {
            title: 'Radiolab',
            author: 'WNYC Studios',
            description: 'Radiolab is on a curiosity bender. We ask deep questions and use investigative journalism to get the answers. A given episode might whirl you through science, legal history, and into the home of someone halfway across the world.',
            artwork: 'https://images.unsplash.com/photo-1507679799987-c73779587ccf?w=300&h=300&fit=crop',
            episodesCount: 676
          };
          state.allEpisodes = [
            {
              guid: 'rl-1',
              feedUrl: 'https://feeds.simplecast.com/EmVW7VGp',
              podcastTitle: 'Radiolab',
              title: 'Heavy Metal: The Lead Crime Hypothesis Revisited',
              description: 'In the late 1990s, an economist noticed a strange pattern...',
              duration: '52:10',
              pubDate: '2d ago',
              artwork: 'https://images.unsplash.com/photo-1507679799987-c73779587ccf?w=300&h=300&fit=crop',
              audioUrl: 'https://example.com/audio1.mp3'
            },
            {
              guid: 'rl-2',
              feedUrl: 'https://feeds.simplecast.com/EmVW7VGp',
              podcastTitle: 'Radiolab',
              title: 'The Bad Show',
              description: 'Exploring dark corners of human behavior and moral dilemmas.',
              duration: '1:01:14',
              pubDate: '1w ago',
              artwork: 'https://images.unsplash.com/photo-1507679799987-c73779587ccf?w=300&h=300&fit=crop',
              audioUrl: 'https://example.com/audio2.mp3'
            }
          ];
          state.navHistory = [{ tab: 'discover' }];
          if (typeof navigateTo === 'function') {
            navigateTo(null, 'https://feeds.simplecast.com/EmVW7VGp');
          } else {
            document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
            const fdPanel = document.getElementById('panel-feed-detail');
            if (fdPanel) fdPanel.classList.add('active');
            if (typeof renderFeedDetail === 'function') {
              renderFeedDetail('https://feeds.simplecast.com/EmVW7VGp');
            }
          }
          if (typeof updateHeaderBackNav === 'function') {
            updateHeaderBackNav('discover');
          }
          window.scrollTo(0, 0);
        })()
      `
    });

    await new Promise(r => setTimeout(r, 800));

    // Capture Feed Detail Clean Desktop & Mobile
    await capture('feed_detail_clean_desktop.png', 1280, 850);
    await capture('feed_detail_clean_mobile.png', 390, 844);

    console.log('🎉 All search and playback verification screenshots captured successfully!');
  } finally {
    cleanup();
  }
}

run().catch(err => {
  console.error('Screenshot run failed:', err);
  process.exit(1);
});
