#!/usr/bin/env node

/**
 * smoke_test.js — Headless Browser Smoke Test for Anypod
 *
 * Boots a local HTTP server serving public/dist/ and runs a headless Chrome session.
 * Catches any ReferenceError, TypeError, syntax crash, or failed initialization
 * before code can be deployed to production.
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
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon'
};

function findChromeExecutable() {
  if (process.env.CHROME_PATH && fs.existsSync(process.env.CHROME_PATH)) {
    return process.env.CHROME_PATH;
  }

  const standardPaths = [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe'
  ];

  for (const p of standardPaths) {
    if (fs.existsSync(p)) return p;
  }

  return null;
}

function startStaticServer(rootDir) {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      let reqPath = req.url.split('?')[0];
      if (reqPath === '/' || reqPath === '') reqPath = '/index.html';

      const filePath = path.join(rootDir, reqPath);

      // Security check: ensure path stays within rootDir
      if (!filePath.startsWith(rootDir)) {
        res.writeHead(403);
        res.end('Forbidden');
        return;
      }

      fs.stat(filePath, (err, stats) => {
        if (err || !stats.isFile()) {
          // Fallback to index.html for SPA routes
          const indexPath = path.join(rootDir, 'index.html');
          fs.readFile(indexPath, (indexErr, data) => {
            if (indexErr) {
              res.writeHead(404);
              res.end('Not Found');
            } else {
              res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
              res.end(data);
            }
          });
          return;
        }

        const ext = path.extname(filePath).toLowerCase();
        const contentType = MIME_TYPES[ext] || 'application/octet-stream';

        res.writeHead(200, { 'Content-Type': contentType });
        fs.createReadStream(filePath).pipe(res);
      });
    });

    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      resolve({ server, port, url: `http://127.0.0.1:${port}` });
    });

    server.on('error', reject);
  });
}

export async function runSmokeTest() {
  console.log('🧪 Starting automated headless browser smoke test...');

  if (!fs.existsSync(path.join(distDir, 'index.html'))) {
    throw new Error(`public/dist/index.html not found! Run 'npm run build' first.`);
  }

  const chromePath = findChromeExecutable();
  if (!chromePath) {
    throw new Error('Could not locate Google Chrome or Chromium executable on this machine.');
  }

  console.log(`🌐 Serving dist from: ${distDir}`);
  const { server, port, url } = await startStaticServer(distDir);
  console.log(`🔌 Local test server listening at: ${url}`);

  const pageErrors = [];
  const consoleErrors = [];
  let browser = null;
  const tempProfileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'chrome-smoke-'));

  try {
    console.log(`🚀 Launching headless Chrome via: ${chromePath}`);
    browser = await puppeteer.launch({
      executablePath: chromePath,
      headless: 'new',
      userDataDir: tempProfileDir,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--window-size=1280,800',
        `--user-data-dir=${tempProfileDir}`,
        '--disable-features=AudioServiceOutOfProcess,IsolateOrigins,site-per-process',
        '--disable-background-networking',
        '--disable-crash-reporter'
      ]
    });

    const page = await browser.newPage();

    // Collect runtime errors
    page.on('pageerror', (err) => {
      console.error(`💥 [Browser PageError] ${err.message}`);
      pageErrors.push(err.message + (err.stack ? '\n' + err.stack : ''));
    });

    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        const text = msg.text();
        // Ignore expected favicon/media 404s in local offline test mode
        if (text.includes('favicon.ico') || text.includes('failed to load resource: the server responded with a status of 404')) {
          return;
        }
        console.error(`🔴 [Browser ConsoleError] ${text}`);
        consoleErrors.push(text);
      }
    });

    console.log(`🧭 Navigating to ${url}...`);
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });

    // Step 1: Verify DOM and state presence
    console.log('🔍 Checking DOM and state initialization...');
    const stateCheck = await page.evaluate(() => {
      const hasState = typeof window.state === 'object' && window.state !== null;
      const discoverContainer = !!document.getElementById('discover-content-container');
      const tabsCount = document.querySelectorAll('.nav-tab').length;
      return {
        hasState,
        discoverContainer,
        tabsCount,
        hasErrorClass: document.body.classList.contains('error')
      };
    });

    if (!stateCheck.hasState) {
      throw new Error('window.state is not defined or failed to initialize on startup.');
    }
    if (!stateCheck.discoverContainer) {
      throw new Error('#discover-content-container is missing from DOM.');
    }
    if (stateCheck.tabsCount === 0) {
      throw new Error('No navigation tabs found in DOM.');
    }
    console.log(`✅ DOM and state initialized (${stateCheck.tabsCount} navigation tabs verified).`);

    // Step 2: Simulate tab clicks (navigation)
    console.log('🖱️ Simulating tab navigation (timeline & discover)...');
    await page.evaluate(() => {
      const tabTimeline = document.getElementById('tab-timeline');
      if (tabTimeline) tabTimeline.click();
    });

    await new Promise(r => setTimeout(r, 400));

    await page.evaluate(() => {
      const tabDiscover = document.getElementById('tab-discover');
      if (tabDiscover) tabDiscover.click();
    });

    // Step 3: Verify Show Notes HTML sanitization against XSS payloads in live browser
    console.log('🛡️ Verifying Show Notes HTML sanitization against XSS payloads...');
    const sanitizeResult = await page.evaluate(() => {
      if (typeof window.formatShowNotesHtml !== 'function') {
        return { ok: false, reason: 'formatShowNotesHtml is not exported or defined' };
      }
      const maliciousPayload = `
        <p>Check out this episode!</p>
        <img src="https://example.com/art.jpg" onerror="window.__xss_fired=true">
        <a href="javascript:window.__xss_fired=true">Click here</a>
        <div onmouseover="window.__xss_fired=true">Hover</div>
        <script>window.__xss_fired=true</script>
        <span>Timestamps: 05:20 Intro, 12:45 Conclusion</span>
      `;
      const sanitized = window.formatShowNotesHtml(maliciousPayload);

      // Mount into DOM to test for execution
      const testDiv = document.createElement('div');
      testDiv.id = '__xss_test_div';
      testDiv.innerHTML = sanitized;
      document.body.appendChild(testDiv);

      const hasOnerror = sanitized.includes('onerror=');
      const hasOnmouseover = sanitized.includes('onmouseover=');
      const hasJsUri = /href=["']\s*javascript:/i.test(sanitized);
      const hasScriptTag = sanitized.includes('<script');
      const hasTimestampBtn = !!testDiv.querySelector('.note-timestamp');
      const xssExecuted = !!window.__xss_fired;

      testDiv.remove();

      return {
        ok: !hasOnerror && !hasOnmouseover && !hasJsUri && !hasScriptTag && hasTimestampBtn && !xssExecuted,
        hasOnerror,
        hasOnmouseover,
        hasJsUri,
        hasScriptTag,
        hasTimestampBtn,
        xssExecuted
      };
    });

    if (!sanitizeResult.ok) {
      throw new Error('Show notes HTML sanitization failed in live browser: ' + JSON.stringify(sanitizeResult));
    }
    console.log('✅ Live browser XSS sanitization verified: all malicious handlers stripped, valid timestamps preserved.');

    // Step 4: Wait for idle execution (deferred scripts like player bundle, timers)
    console.log('⏳ Awaiting idle callbacks and deferred script execution (3s)...');
    await new Promise(r => setTimeout(r, 3200));

    // Evaluate final errors
    if (pageErrors.length > 0 || consoleErrors.length > 0) {
      const totalErrors = [...pageErrors, ...consoleErrors];
      throw new Error(`Smoke test failed with ${totalErrors.length} browser error(s):\n\n` + totalErrors.join('\n\n'));
    }

    console.log('🎉 Browser smoke test passed with 0 runtime errors!\n');
    return true;
  } finally {
    if (browser) await browser.close().catch(() => {});
    server.close();
    try {
      if (fs.existsSync(tempProfileDir)) {
        fs.rmSync(tempProfileDir, { recursive: true, force: true });
      }
    } catch (_) {}
  }
}

// Allow direct CLI invocation: node scripts/smoke_test.js
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runSmokeTest()
    .then(() => {
      process.exit(0);
    })
    .catch((err) => {
      console.error('\n❌ CRITICAL ERROR IN BROWSER SMOKE TEST:');
      console.error(err.message);
      process.exit(1);
    });
}
