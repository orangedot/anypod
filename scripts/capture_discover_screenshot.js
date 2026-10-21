#!/usr/bin/env node

/**
 * capture_discover_screenshot.js
 *
 * Dedicated screenshot utility for Anypod's AI-Narrated Full-Screen Discover page.
 * Supports customizable CLI flags:
 *   --taste=science|music|tech|culture (default: science)
 *   --device=desktop|mobile|tablet     (default: desktop)
 *   --theme=dark|light                 (default: dark)
 *   --output=path/to/shot.png          (optional custom path)
 *   --all                              (captures showcase matrix)
 */

import http from 'node:http';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function resolveProjectPath() {
  const candidateDirs = [
    path.resolve(__dirname, '..'),
    path.resolve(__dirname, '../app'),
    path.resolve(process.cwd(), 'app'),
    process.cwd()
  ];
  for (const dir of candidateDirs) {
    if (fs.existsSync(path.join(dir, 'public', 'index.html'))) {
      return dir;
    }
  }
  return path.resolve(__dirname, '..');
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

// ── Realistic Mock Library Fixtures for Different Taste Personas ───────────

const TASTE_FIXTURES = {
  science: {
    name: 'Cosmic & Fundamental Science',
    feeds: [
      'https://feeds.megaphone.fm/NATIONALAERONAUTICSANDSPACEADMINISTRATION8162188566',
      'https://feeds.simplecast.com/EmVW7VGp',
      'https://feeds.acast.com/public/shows/nature',
      'https://www.deutschlandfunk.de/forschung-aktuell-102.xml'
    ],
    feedMetadata: {
      'https://feeds.megaphone.fm/NATIONALAERONAUTICSANDSPACEADMINISTRATION8162188566': {
        title: "NASA's Curious Universe",
        author: 'NASA',
        description: 'Explore the cosmos, mysterious planets, and astronomical discoveries.',
        artwork: 'https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=300&h=300&fit=crop'
      },
      'https://feeds.simplecast.com/EmVW7VGp': {
        title: 'Radiolab',
        author: 'WNYC Studios',
        description: 'Deep narrative scientific investigations into strange phenomena.',
        artwork: 'https://images.unsplash.com/photo-1507679799987-c73779587ccf?w=300&h=300&fit=crop'
      },
      'https://feeds.acast.com/public/shows/nature': {
        title: 'Nature Podcast',
        author: 'Nature',
        description: 'Frontier science research, quantum discoveries, and biology.',
        artwork: 'https://images.unsplash.com/photo-1532094349884-543bc11b234d?w=300&h=300&fit=crop'
      },
      'https://www.deutschlandfunk.de/forschung-aktuell-102.xml': {
        title: 'Forschung aktuell',
        author: 'Deutschlandfunk',
        description: 'Täglich aktuelle Wissenschaft und Forschung aus aller Welt.',
        artwork: 'https://images.unsplash.com/photo-1448375240586-882707db888b?w=300&h=300&fit=crop'
      }
    },
    allEpisodes: [
      {
        guid: 'nasa-dark-side',
        feedUrl: 'https://feeds.megaphone.fm/NATIONALAERONAUTICSANDSPACEADMINISTRATION8162188566',
        podcastTitle: "NASA's Curious Universe",
        title: 'Encore: Welcome to the Dark Side',
        description: 'Normal matter makes up only 5 percent of the cosmos. Scientists unravel dark matter and cosmic expansion.',
        duration: '25:24',
        pubDate: new Date(Date.now() - 3600000 * 4).toISOString(),
        artwork: 'https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=300&h=300&fit=crop',
        audioUrl: 'https://example.com/audio1.mp3'
      },
      {
        guid: 'radiolab-jwst',
        feedUrl: 'https://feeds.simplecast.com/EmVW7VGp',
        podcastTitle: 'Radiolab',
        title: 'The James Webb Deep Field Odyssey',
        description: 'Looking 13.5 billion years into deep time to witness the very first stars ignite in the newborn universe.',
        duration: '52:10',
        pubDate: new Date(Date.now() - 86400000 * 2).toISOString(),
        artwork: 'https://images.unsplash.com/photo-1507679799987-c73779587ccf?w=300&h=300&fit=crop',
        audioUrl: 'https://example.com/audio2.mp3'
      },
      {
        guid: 'nature-quantum',
        feedUrl: 'https://feeds.acast.com/public/shows/nature',
        podcastTitle: 'Nature Podcast',
        title: 'Quantum Entanglement at Astronomical Distances',
        description: 'Testing Bell inequalities with photons emitted by distant quasars billions of light years away.',
        duration: '34:40',
        pubDate: new Date(Date.now() - 86400000 * 3).toISOString(),
        artwork: 'https://images.unsplash.com/photo-1532094349884-543bc11b234d?w=300&h=300&fit=crop',
        audioUrl: 'https://example.com/audio3.mp3'
      },
      {
        guid: 'dlf-gravitation',
        feedUrl: 'https://www.deutschlandfunk.de/forschung-aktuell-102.xml',
        podcastTitle: 'Forschung aktuell',
        title: 'Gravitationswellen verraten verschmelzende Neutronensterne',
        description: 'LIGO und Virgo detektieren neue kosmische Signale schwerer Atomkerne in fernen Galaxien.',
        duration: '28:15',
        pubDate: new Date(Date.now() - 86400000 * 4).toISOString(),
        artwork: 'https://images.unsplash.com/photo-1448375240586-882707db888b?w=300&h=300&fit=crop',
        audioUrl: 'https://example.com/audio4.mp3'
      }
    ],
    playbackPositions: {
      'nasa-dark-side': { position: 1142, duration: 1524, completed: false }
    },
    favorites: ['nasa-dark-side', 'radiolab-jwst'],
    queue: ['nature-quantum']
  },

  music: {
    name: 'Electronic Music & Audiophile Mixes',
    feeds: [
      'https://residentadvisor.net/podcast.xml',
      'https://electronicbeats.net/feed.xml'
    ],
    feedMetadata: {
      'https://residentadvisor.net/podcast.xml': {
        title: 'RA Podcast',
        author: 'Resident Advisor',
        description: 'Cutting-edge electronic music, club mixes, and ambient masterclasses.',
        artwork: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=300&h=300&fit=crop'
      },
      'https://electronicbeats.net/feed.xml': {
        title: 'Electronic Beats',
        author: 'Telekom Electronic Beats',
        description: 'Conversations with pioneers of synthesizers, techno, and underground club culture.',
        artwork: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=300&h=300&fit=crop'
      }
    },
    allEpisodes: [
      {
        guid: 'ra-814',
        feedUrl: 'https://residentadvisor.net/podcast.xml',
        podcastTitle: 'RA Podcast',
        title: 'EX.814 Syd - Ambient & Neo-Soul Odyssey',
        description: 'A 54-minute seamless journey traversing deep atmospheric dub, modular techno, and soundscapes.',
        duration: '54:02',
        pubDate: new Date(Date.now() - 3600000 * 3).toISOString(),
        artwork: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=300&h=300&fit=crop',
        audioUrl: 'https://example.com/audio5.mp3'
      },
      {
        guid: 'ra-902',
        feedUrl: 'https://residentadvisor.net/podcast.xml',
        podcastTitle: 'RA Podcast',
        title: 'EX.902 Modular Synthesis & Berlin Sound Design',
        description: 'Immersive live analog performance recorded direct from the recording studio.',
        duration: '62:18',
        pubDate: new Date(Date.now() - 86400000 * 2).toISOString(),
        artwork: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=300&h=300&fit=crop',
        audioUrl: 'https://example.com/audio6.mp3'
      },
      {
        guid: 'eb-detroit',
        feedUrl: 'https://electronicbeats.net/feed.xml',
        podcastTitle: 'Electronic Beats',
        title: 'The Resonance of Detroit Techno Pioneers',
        description: 'The sonic lineage of early synthesizers and drum machines that defined modern club culture.',
        duration: '48:30',
        pubDate: new Date(Date.now() - 86400000 * 4).toISOString(),
        artwork: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=300&h=300&fit=crop',
        audioUrl: 'https://example.com/audio7.mp3'
      }
    ],
    playbackPositions: {
      'ra-814': { position: 860, duration: 3242, completed: false }
    },
    favorites: ['ra-814'],
    queue: ['ra-902']
  },

  tech: {
    name: 'AI & Technological Frontiers',
    feeds: [
      'https://api.substack.com/feed/podcast/193024.rss',
      'https://api.quantamagazine.org/feed/podcast/'
    ],
    feedMetadata: {
      'https://api.substack.com/feed/podcast/193024.rss': {
        title: 'Volts',
        author: 'David Roberts',
        description: 'Deep dives on clean energy, battery technology, and modern software infrastructure.',
        artwork: 'https://images.unsplash.com/photo-1497435334941-8c899ee9e8e9?w=300&h=300&fit=crop'
      },
      'https://api.quantamagazine.org/feed/podcast/': {
        title: 'Quanta Science Podcast',
        author: 'Quanta Magazine',
        description: 'Illuminating math, computer science, and fundamental physics frontiers.',
        artwork: 'https://images.unsplash.com/photo-1518770660439-4636190af475?w=300&h=300&fit=crop'
      }
    },
    allEpisodes: [
      {
        guid: 'volts-batteries',
        feedUrl: 'https://api.substack.com/feed/podcast/193024.rss',
        podcastTitle: 'Volts',
        title: 'Next-Gen Solid State Batteries & Grid Scale Storage',
        description: 'How modern battery chemistry and energy software are revolutionizing regional power grids.',
        duration: '58:12',
        pubDate: new Date(Date.now() - 3600000 * 5).toISOString(),
        artwork: 'https://images.unsplash.com/photo-1497435334941-8c899ee9e8e9?w=300&h=300&fit=crop',
        audioUrl: 'https://example.com/audio8.mp3'
      },
      {
        guid: 'quanta-quantum-cs',
        feedUrl: 'https://api.quantamagazine.org/feed/podcast/',
        podcastTitle: 'Quanta Science Podcast',
        title: 'How Quantum Complexity Upends Classical Algorithms',
        description: 'The mathematics of computational limits and breakthrough algorithms in theoretical physics.',
        duration: '41:20',
        pubDate: new Date(Date.now() - 86400000 * 2).toISOString(),
        artwork: 'https://images.unsplash.com/photo-1518770660439-4636190af475?w=300&h=300&fit=crop',
        audioUrl: 'https://example.com/audio9.mp3'
      }
    ],
    playbackPositions: {
      'volts-batteries': { position: 1420, duration: 3492, completed: false }
    },
    favorites: ['volts-batteries'],
    queue: ['quanta-quantum-cs']
  },

  culture: {
    name: 'Planetary Ecology & Climate Systems',
    feeds: [
      'https://podcasts.files.bbci.co.uk/w13xtvb6.rss',
      'https://feeds.acast.com/public/shows/outrage-optimism'
    ],
    feedMetadata: {
      'https://podcasts.files.bbci.co.uk/w13xtvb6.rss': {
        title: 'The Climate Question',
        author: 'BBC World Service',
        description: 'Why do we find it so hard to save our own planet? Direct global investigative reporting.',
        artwork: 'https://images.unsplash.com/photo-1497435334941-8c899ee9e8e9?w=300&h=300&fit=crop'
      },
      'https://feeds.acast.com/public/shows/outrage-optimism': {
        title: 'Outrage + Optimism',
        author: 'Global Optimism',
        description: 'Facing the climate crisis with practical solutions, hope, and planetary resilience.',
        artwork: 'https://images.unsplash.com/photo-1448375240586-882707db888b?w=300&h=300&fit=crop'
      }
    },
    allEpisodes: [
      {
        guid: 'climate-hydrogen',
        feedUrl: 'https://podcasts.files.bbci.co.uk/w13xtvb6.rss',
        podcastTitle: 'The Climate Question',
        title: 'Can Green Hydrogen Decarbonize Heavy Shipping?',
        description: 'Investigating maritime transport and synthetic fuels produced from offshore wind power.',
        duration: '38:15',
        pubDate: new Date(Date.now() - 3600000 * 6).toISOString(),
        artwork: 'https://images.unsplash.com/photo-1497435334941-8c899ee9e8e9?w=300&h=300&fit=crop',
        audioUrl: 'https://example.com/audio10.mp3'
      },
      {
        guid: 'outrage-ocean',
        feedUrl: 'https://feeds.acast.com/public/shows/outrage-optimism',
        podcastTitle: 'Outrage + Optimism',
        title: 'Restoring Global Coral Reefs and Marine Protected Areas',
        description: 'Indigenous marine conservation strategies and global treaty implementation.',
        duration: '32:40',
        pubDate: new Date(Date.now() - 86400000 * 2).toISOString(),
        artwork: 'https://images.unsplash.com/photo-1448375240586-882707db888b?w=300&h=300&fit=crop',
        audioUrl: 'https://example.com/audio11.mp3'
      }
    ],
    playbackPositions: {
      'climate-hydrogen': { position: 880, duration: 2295, completed: false }
    },
    favorites: ['climate-hydrogen'],
    queue: ['outrage-ocean']
  }
};

const DEVICE_METRICS = {
  desktop: { width: 1440, height: 900, deviceScaleFactor: 2, mobile: false },
  mobile: { width: 390, height: 844, deviceScaleFactor: 3, mobile: true },
  tablet: { width: 820, height: 1180, deviceScaleFactor: 2, mobile: false }
};

function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    taste: 'science',
    device: 'desktop',
    theme: 'dark',
    output: null,
    all: false,
    fullPage: false,
    url: ''
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--all') {
      options.all = true;
    } else if (arg === '--full-page' || arg === '--fullpage') {
      options.fullPage = true;
    } else if (arg.startsWith('--taste=')) {
      options.taste = arg.split('=')[1].toLowerCase();
    } else if (arg.startsWith('--device=')) {
      options.device = arg.split('=')[1].toLowerCase();
    } else if (arg.startsWith('--theme=')) {
      options.theme = arg.split('=')[1].toLowerCase();
    } else if (arg.startsWith('--output=')) {
      options.output = arg.split('=')[1];
    } else if (arg.startsWith('--url=')) {
      options.url = arg.split('=')[1];
    }
  }

  return options;
}

async function captureShot(ws, send, tasteKey, deviceKey, themeKey, customOutPath = null, fullPage = false) {
  const fixture = TASTE_FIXTURES[tasteKey] || TASTE_FIXTURES.science;
  const metrics = DEVICE_METRICS[deviceKey] || DEVICE_METRICS.desktop;
  const isLight = themeKey === 'light';

  console.log(`\n📸 Capturing Discover Screenshot:`);
  console.log(`   Persona Taste: ${fixture.name} (${tasteKey})`);
  console.log(`   Device:        ${deviceKey} (${metrics.width}x${metrics.height} @${metrics.deviceScaleFactor}x)`);
  console.log(`   Theme:         ${themeKey}`);

  // 1. Set Device Metrics
  await send('Emulation.setDeviceMetricsOverride', metrics);

  // 2. Inject Mock Library Taste and Switch to Discover Tab
  const injectCode = `
    (function() {
      const fix = ${JSON.stringify(fixture)};
      state.feeds = fix.feeds;
      state.feedMetadata = fix.feedMetadata;
      state.allEpisodes = fix.allEpisodes;
      state.playbackPositions = fix.playbackPositions;
      state.favorites = fix.favorites;
      state.queue = fix.queue;

      document.documentElement.setAttribute('data-theme', '${isLight ? 'light' : 'dark'}');
      document.body.style.backgroundColor = '${isLight ? '#e8eaed' : '#161618'}';

      // Hide modals
      document.getElementById('auth-modal')?.classList.add('hidden');

      // Switch tab to discover
      document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
      const discPanel = document.getElementById('panel-discover');
      if (discPanel) discPanel.classList.add('active');

      document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
      const discTab = document.getElementById('tab-discover');
      if (discTab) discTab.classList.add('active');

      // Re-render Discover
      if (typeof renderDiscover === 'function') {
        renderDiscover();
      }
      window.scrollTo(0, 0);
    })();
  `;

  await send('Runtime.evaluate', { expression: injectCode });
  await new Promise(r => setTimeout(r, 900));

  // 3. Capture Screenshot
  const shot = await send('Page.captureScreenshot', {
    format: 'png',
    captureBeyondViewport: !!fullPage
  });

  const fileName = customOutPath || path.join(outDir, `discover-${tasteKey}-${deviceKey}-${themeKey}.png`);
  fs.writeFileSync(fileName, Buffer.from(shot.data, 'base64'));
  const sizeKb = (fs.statSync(fileName).size / 1024).toFixed(1);
  console.log(`   ✅ Saved: ${fileName} (${sizeKb} KB)`);
  return fileName;
}

async function main() {
  const options = parseArgs();

  const serverPort = await getAvailablePort(8793);
  const staticServer = await startStaticServer(serverPort);
  const targetUrl = options.url || `http://127.0.0.1:${serverPort}/`;
  console.log(`🚀 Static server ready on port ${serverPort}`);

  const debugPort = await getAvailablePort(9228);
  const tmpProfile = `/tmp/anypod-shot-discover-${Date.now()}`;
  fs.mkdirSync(tmpProfile, { recursive: true });

  const chrome = spawn(chromePath, [
    '--headless=new',
    `--remote-debugging-port=${debugPort}`,
    '--no-sandbox',
    '--disable-gpu',
    `--user-data-dir=${tmpProfile}`,
    targetUrl
  ]);

  const cleanup = () => {
    try { chrome.kill(); } catch (_) {}
    try { staticServer.close(); } catch (_) {}
    try { fs.rmSync(tmpProfile, { recursive: true, force: true }); } catch (_) {}
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
    } catch (_) {}
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
  await new Promise(r => setTimeout(r, 800));

  if (options.all) {
    console.log('🌟 Generating complete Discover showcase matrix...');
    await captureShot(ws, send, 'science', 'desktop', 'dark', null, options.fullPage);
    await captureShot(ws, send, 'science', 'desktop', 'light', null, options.fullPage);
    await captureShot(ws, send, 'science', 'mobile', 'dark', null, options.fullPage);
    await captureShot(ws, send, 'music', 'desktop', 'dark', null, options.fullPage);
    await captureShot(ws, send, 'tech', 'desktop', 'dark', null, options.fullPage);
    await captureShot(ws, send, 'culture', 'desktop', 'dark', null, options.fullPage);
  } else {
    await captureShot(ws, send, options.taste, options.device, options.theme, options.output, options.fullPage);
  }

  ws.close();
  cleanup();
  console.log('\n🎉 Screenshot capture completed successfully!');
}

main().catch(err => {
  console.error('Fatal discover screenshot error:', err);
  process.exit(1);
});
