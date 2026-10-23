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

async function test() {
  const { server, url } = await startServer();
  const tempProfileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'chrome-shelves-'));
  const browser = await puppeteer.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: 'new',
    userDataDir: tempProfileDir,
    args: ['--no-sandbox', '--disable-gpu']
  });

  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', err => errors.push(err.message));
  page.on('console', msg => {
    if (msg.type() === 'error') errors.push(msg.text());
  });

  try {
    console.log(`🧭 Loading ${url}...`);
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await new Promise(r => setTimeout(r, 1000));

    // 1. Verify all 7 shelves in DOM
    const shelfIds = await page.evaluate(() => {
      const shelves = document.querySelectorAll('.discover-shelf');
      return Array.from(shelves).map(s => s.id);
    });
    console.log('✅ Found shelves:', shelfIds);
    if (shelfIds.length !== 7) {
      throw new Error(`Expected 7 shelves, found ${shelfIds.length}`);
    }

    // 2. Verify cards per shelf
    const cardCounts = await page.evaluate(() => {
      const shelves = document.querySelectorAll('.discover-shelf');
      return Array.from(shelves).map(s => s.querySelectorAll('.discover-shelf-card').length);
    });
    console.log('✅ Card counts per shelf:', cardCounts);
    if (!cardCounts.every(c => c === 5)) {
      throw new Error(`Expected 5 cards per shelf, found: ${cardCounts.join(', ')}`);
    }

    // 3. Test clicking "See all 50" on shelf-democracy
    console.log('🖱️ Clicking "See all 50" on Democracy shelf...');
    await page.evaluate(() => {
      const btn = document.querySelector('#shelf-democracy .btn-shelf-see-all');
      if (btn) btn.click();
    });

    // Wait for catalog modal and network fetch
    await new Promise(r => setTimeout(r, 600));

    const modalState = await page.evaluate(() => {
      const modal = document.getElementById('catalog-browser-modal');
      const isVisible = modal && !modal.classList.contains('hidden');
      const title = document.getElementById('catalog-modal-title')?.textContent;
      const count = document.getElementById('catalog-modal-count')?.textContent;
      const showsCount = document.querySelectorAll('#catalog-grid .catalog-show-card').length;
      const subtopicsCount = document.querySelectorAll('#catalog-subtopics-row .catalog-topic-pill').length;
      return { isVisible, title, count, showsCount, subtopicsCount };
    });

    console.log('✅ Modal state:', modalState);
    if (!modalState.isVisible) throw new Error('Catalog modal did not open');
    if (modalState.showsCount !== 50) throw new Error(`Expected 50 shows in modal, got ${modalState.showsCount}`);
    if (modalState.subtopicsCount < 2) throw new Error('Expected subtopic pills');

    // 4. Test in-modal live search
    console.log('🔍 Testing search input in modal...');
    await page.type('#catalog-search-input', 'Frontline');
    await new Promise(r => setTimeout(r, 200));

    const searchCount = await page.evaluate(() => {
      return document.querySelectorAll('#catalog-grid .catalog-show-card').length;
    });
    console.log(`✅ Filtered to ${searchCount} show(s) with "Frontline"`);
    if (searchCount === 0 || searchCount > 5) throw new Error(`Search filtering failed, got ${searchCount}`);

    // Clear search
    await page.evaluate(() => {
      document.getElementById('btn-clear-catalog-search')?.click();
    });
    await new Promise(r => setTimeout(r, 100));

    // 5. Test subtopic filter pill
    console.log('🏷️ Testing subtopic pill click...');
    await page.evaluate(() => {
      const pills = document.querySelectorAll('#catalog-subtopics-row .catalog-topic-pill');
      if (pills[1]) pills[1].click();
    });
    await new Promise(r => setTimeout(r, 200));

    const topicFilteredCount = await page.evaluate(() => {
      return document.querySelectorAll('#catalog-grid .catalog-show-card').length;
    });
    console.log(`✅ Subtopic filtered to ${topicFilteredCount} show(s)`);
    if (topicFilteredCount === 0 || topicFilteredCount === 50) throw new Error(`Subtopic filtering failed, got ${topicFilteredCount}`);

    // 6. Test Escape closes modal
    console.log('⌨️ Testing Escape key closes modal...');
    await page.keyboard.press('Escape');
    await new Promise(r => setTimeout(r, 200));

    const closed = await page.evaluate(() => {
      return document.getElementById('catalog-browser-modal').classList.contains('hidden');
    });
    console.log('✅ Modal closed via Escape:', closed);
    if (!closed) throw new Error('Modal did not close on Escape');

    if (errors.length > 0) {
      throw new Error(`Page errors encountered: ${errors.join('; ')}`);
    }

    console.log('\n🎉 ALL SHELVES AND CATALOG MODAL INTERACTION TESTS PASSED!');
  } finally {
    await browser.close().catch(() => {});
    server.close();
    try { fs.rmSync(tempProfileDir, { recursive: true, force: true }); } catch (_) {}
  }
}

test()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('❌ Interaction Test Failed:', err);
    process.exit(1);
  });
