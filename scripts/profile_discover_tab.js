#!/usr/bin/env node

/**
 * profile_discover_tab.js
 *
 * Measures tab switching latency and main-thread execution time
 * when switching between Timeline and Discover tabs.
 */

import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const appDir = path.resolve(__dirname, '..');
const distDir = path.join(appDir, 'public', 'dist');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml'
};

function startServer() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      let reqPath = req.url.split('?')[0];
      if (reqPath === '/' || reqPath === '') reqPath = '/index.html';
      const filePath = path.join(distDir, reqPath);
      fs.stat(filePath, (err, stats) => {
        if (err || !stats.isFile()) {
          res.writeHead(404);
          res.end('Not Found');
          return;
        }
        const ext = path.extname(filePath).toLowerCase();
        res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
        fs.createReadStream(filePath).pipe(res);
      });
    });
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      resolve({ server, url: `http://127.0.0.1:${port}` });
    });
  });
}

export async function profileDiscoverTab() {
  const { server, url } = await startServer();
  const tempProfileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'chrome-prof-'));

  const browser = await puppeteer.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: 'new',
    userDataDir: tempProfileDir,
    args: ['--no-sandbox', '--disable-gpu']
  });

  const page = await browser.newPage();

  try {
    console.log(`🧭 Loading local dist from ${url}...`);
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await new Promise(r => setTimeout(r, 1200));

    // Simulate user having subscribed feeds & episode history in localStorage
    await page.evaluate(() => {
      const mockFeeds = [
        'https://feeds.megaphone.fm/hubermanlab',
        'https://feeds.simplecast.com/FO6kxYGj',
        'https://feeds.acast.com/public/shows/nature',
        'https://changelog.com/podcast/feed',
        'https://feeds.simplecast.com/EmVW7VGp'
      ];
      const mockMeta = {};
      mockFeeds.forEach((f, idx) => {
        mockMeta[f] = { title: `Show ${idx + 1}`, description: 'Podcast description about science and tech' };
      });
      const mockEpisodes = [];
      for (let i = 0; i < 400; i++) {
        mockEpisodes.push({
          guid: `guid_${i}`,
          feedUrl: mockFeeds[i % mockFeeds.length],
          title: `Episode ${i} about science, technology, and planetary climate systems`,
          description: 'Deep dive into astrophysics, machine learning, and biology',
          timestamp: Date.now() - i * 86400000,
          duration: '45:00'
        });
      }
      const mockPositions = {};
      for (let i = 0; i < 60; i++) {
        mockPositions[`guid_${i}`] = { position: 350, completed: i % 2 === 0, lastListenedAt: Date.now() - i * 100000 };
      }

      window.state.feeds = mockFeeds;
      window.state.feedMetadata = mockMeta;
      window.state.allEpisodes = mockEpisodes;
      window.state.playbackPositions = mockPositions;
      window.state.favorites = ['guid_1', 'guid_5', 'guid_10'];
      window.state.queue = ['guid_2', 'guid_3'];
    });

    // 1. Switch to timeline tab first
    await page.evaluate(() => {
      document.getElementById('tab-timeline')?.click();
    });
    await new Promise(r => setTimeout(r, 400));

    // 2. Measure first switch to Discover tab
    const firstSwitch = await page.evaluate(async () => {
      const t0 = performance.now();
      const tabDiscover = document.getElementById('tab-discover');
      tabDiscover.click();
      const t1 = performance.now();

      await new Promise(resolve => requestAnimationFrame(resolve));
      const t2 = performance.now();

      const panelActive = document.getElementById('panel-discover')?.classList.contains('active');
      const tabActive = tabDiscover?.classList.contains('active');
      const shelfCount = document.querySelectorAll('.discover-shelf').length;
      const initialEpCount = window.state.allEpisodes.length;

      return {
        clickSynchronousMs: t1 - t0,
        renderFrameMs: t2 - t0,
        panelActive,
        tabActive,
        shelfCount,
        initialEpCount
      };
    });

    // 3. Switch back to timeline
    await page.evaluate(() => {
      document.getElementById('tab-timeline')?.click();
    });
    await new Promise(r => setTimeout(r, 300));

    // 4. Measure return switch to Discover tab (should be instant in-place < 5ms!)
    const returnSwitch = await page.evaluate(async () => {
      const t0 = performance.now();
      const tabDiscover = document.getElementById('tab-discover');
      tabDiscover.click();
      const t1 = performance.now();

      await new Promise(resolve => requestAnimationFrame(resolve));
      const t2 = performance.now();

      const panelActive = document.getElementById('panel-discover')?.classList.contains('active');
      const tabActive = tabDiscover?.classList.contains('active');
      const finalEpCount = window.state.allEpisodes.length;
      const shelfCount = document.querySelectorAll('.discover-shelf').length;

      return {
        clickSynchronousMs: t1 - t0,
        renderFrameMs: t2 - t0,
        panelActive,
        tabActive,
        shelfCount,
        finalEpCount
      };
    });

    console.log(`\n📊 Discover Tab Switch Benchmark (400 episodes & 5 library feeds):`);
    console.log(`   🚀 First Switch (Hydration):`);
    console.log(`      ⏱️  Blocking click time: ${firstSwitch.clickSynchronousMs.toFixed(1)} ms`);
    console.log(`      🖼️  Time to paint:       ${firstSwitch.renderFrameMs.toFixed(1)} ms`);
    console.log(`      📚 Shelves preserved:   ${firstSwitch.shelfCount}/7`);
    console.log(`   ⚡ Return Switch (In-Place 0ms Navigation):`);
    console.log(`      ⏱️  Blocking click time: ${returnSwitch.clickSynchronousMs.toFixed(1)} ms`);
    console.log(`      🖼️  Time to paint:       ${returnSwitch.renderFrameMs.toFixed(1)} ms`);
    console.log(`      📚 Shelves preserved:   ${returnSwitch.shelfCount}/7`);
    console.log(`   🛡️ Library Integrity:`);
    console.log(`      Initial episodes: ${firstSwitch.initialEpCount}, Final episodes: ${returnSwitch.finalEpCount} (Pollution: ${returnSwitch.finalEpCount - 400})`);

    return { firstSwitch, returnSwitch };
  } finally {
    await browser.close().catch(() => {});
    server.close();
    try { fs.rmSync(tempProfileDir, { recursive: true, force: true }); } catch (_) {}
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  profileDiscoverTab().catch(err => {
    console.error('Error during profiling:', err);
    process.exit(1);
  });
}
