#!/usr/bin/env node

import http from 'node:http';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const appDir = path.resolve(__dirname, '..');
const publicDir = path.join(appDir, 'public');

const chromeCandidates = [
  process.env.CHROME_PATH,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium'
].filter(Boolean);

const chromePath = chromeCandidates.find(p => fs.existsSync(p));
if (!chromePath) {
  console.error('Error: Chrome not found');
  process.exit(1);
}

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png'
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
    if (reqPath === '/' || reqPath === '') reqPath = '/index.html';
    const filePath = path.join(publicDir, reqPath);

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

async function sendCDP(wsUrl, method, params = {}) {
  const WebSocket = (await import('ws')).default || globalThis.WebSocket;
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    const id = 1;
    ws.on('open', () => {
      ws.send(JSON.stringify({ id, method, params }));
    });
    ws.on('message', (data) => {
      const msg = JSON.parse(data.toString());
      if (msg.id === id) {
        ws.close();
        if (msg.error) reject(new Error(msg.error.message));
        else resolve(msg.result);
      }
    });
    ws.on('error', reject);
  });
}

async function main() {
  const serverPort = await getAvailablePort(8795);
  const server = await startStaticServer(serverPort);
  console.log(`Test server running on http://127.0.0.1:${serverPort}`);

  const cdpPort = await getAvailablePort(9225);
  const chromeProc = spawn(chromePath, [
    '--headless=new',
    '--disable-gpu',
    '--no-sandbox',
    `--remote-debugging-port=${cdpPort}`,
    '--window-size=1280,900',
    `http://127.0.0.1:${serverPort}`
  ]);

  // Wait for Chrome CDP
  await new Promise(r => setTimeout(r, 1200));

  try {
    const versionRes = await fetch(`http://127.0.0.1:${cdpPort}/json/list`);
    const targets = await versionRes.json();
    const pageTarget = targets.find(t => t.type === 'page');
    if (!pageTarget) throw new Error('No page target found');

    const wsUrl = pageTarget.webSocketDebuggerUrl;
    const WebSocket = (await import('ws')).default || globalThis.WebSocket;
    const ws = new WebSocket(wsUrl);

    let msgId = 1;
    const pending = new Map();
    const consoleLogs = [];

    ws.on('message', (raw) => {
      const msg = JSON.parse(raw.toString());
      if (msg.method === 'Runtime.consoleAPICalled') {
        consoleLogs.push({ type: msg.params.type, text: msg.params.args.map(a => a.value || a.description).join(' ') });
      } else if (msg.method === 'Runtime.exceptionThrown') {
        consoleLogs.push({ type: 'error', text: msg.params.exceptionDetails.text });
      }
      if (msg.id && pending.has(msg.id)) {
        const { resolve, reject } = pending.get(msg.id);
        pending.delete(msg.id);
        if (msg.error) reject(new Error(msg.error.message));
        else resolve(msg.result);
      }
    });

    await new Promise((r) => ws.on('open', r));

    function call(method, params = {}) {
      return new Promise((resolve, reject) => {
        const id = msgId++;
        pending.set(id, { resolve, reject });
        ws.send(JSON.stringify({ id, method, params }));
      });
    }

    await call('Runtime.enable');
    await call('Page.enable');
    await call('DOM.enable');

    console.log('Page loaded, evaluating test interactions...');
    await new Promise(r => setTimeout(r, 1000));

    // Open add modal and click chip
    const evalResult = await call('Runtime.evaluate', {
      expression: `(async () => {
        const addBtn = document.getElementById('btn-header-add');
        if (addBtn) addBtn.click();
        
        // Wait for modal
        await new Promise(r => setTimeout(r, 300));
        
        // Find chip
        const chip = document.querySelector('[data-category="Paleontology Fossils"]');
        if (chip) chip.click();
        
        // Wait for subgenres and search
        await new Promise(r => setTimeout(r, 1500));
        
        const subgenreContainer = document.getElementById('modal-subgenre-chips');
        const resultsContainer = document.getElementById('search-directory-results');
        const queryInput = document.getElementById('podcast-search-query');
        
        return {
          queryValue: queryInput ? queryInput.value : null,
          subgenreHTML: subgenreContainer ? subgenreContainer.innerHTML : null,
          subgenreHidden: subgenreContainer ? subgenreContainer.classList.contains('hidden') : null,
          resultsHTML: resultsContainer ? resultsContainer.innerHTML : null
        };
      })()`,
      awaitPromise: true,
      returnByValue: true
    });

    console.log('Result from page evaluation:');
    console.log(JSON.stringify(evalResult.result.value, null, 2));

    if (consoleLogs.length > 0) {
      console.log('Console logs captured:');
      console.log(consoleLogs);
    }

    // Capture screenshot
    const screenshot = await call('Page.captureScreenshot', { format: 'png' });
    const screenshotPath = path.join(appDir, 'test-search-result.png');
    fs.writeFileSync(screenshotPath, Buffer.from(screenshot.data, 'base64'));
    console.log(`Screenshot saved to ${screenshotPath}`);

    ws.close();
  } finally {
    chromeProc.kill('SIGTERM');
    server.close();
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
