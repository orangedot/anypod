const puppeteer = require('puppeteer-core');
const http = require('http');
const fs = require('fs');
const path = require('path');

const distDir = path.resolve(__dirname, '../public/dist');
const server = http.createServer((req, res) => {
  let reqPath = req.url.split('?')[0];
  let filePath = path.join(distDir, reqPath);
  if (filePath.endsWith('/')) filePath = path.join(filePath, 'index.html');
  if (!fs.existsSync(filePath) && fs.existsSync(filePath + '.html')) filePath = filePath + '.html';

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    const ext = path.extname(filePath);
    const mime = ext === '.html' ? 'text/html' : ext === '.js' ? 'application/javascript' : ext === '.css' ? 'text/css' : 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': mime });
    res.end(data);
  });
});

server.listen(0, async () => {
  const port = server.address().port;
  console.log(`Test server running on port ${port}`);

  const browser = await puppeteer.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900, deviceScaleFactor: 2 });
  await page.goto(`http://127.0.0.1:${port}`, { waitUntil: 'networkidle2' });

  // Create card and inject into document
  const cardInspection = await page.evaluate(() => {
    const ep = {
      guid: 'dub-tech-save-you',
      title: 'Oldschool_Dubtechno .Producer - They Will Save You (wave folder RERMX)',
      podcastTitle: 'PIRANHA SIBERIA DUB | Dub Techno',
      pubDate: new Date(Date.now() - 86400000).toISOString(),
      duration: '05:09',
      artwork: 'https://picsum.photos/200'
    };
    window.state.playbackPositions[ep.guid] = {
      position: 157, // 2:37
      completed: false,
      lastListenedAt: Math.floor(Date.now() / 1000)
    };
    const card = window.createEpisodeCard(ep);
    card.id = 'test-dub-card';
    card.style.position = 'fixed';
    card.style.top = '30px';
    card.style.left = '30px';
    card.style.width = '280px';
    card.style.zIndex = '99999';
    card.style.background = '#202024';
    card.style.boxShadow = '0 10px 40px rgba(0,0,0,0.8)';
    document.body.appendChild(card);

    const meta = card.querySelector('.episode-meta');
    const spans = Array.from(meta.children).map(s => {
      const r = s.getBoundingClientRect();
      return {
        text: s.textContent.trim(),
        top: Math.round(r.top),
        left: Math.round(r.left),
        width: Math.round(r.width),
        height: Math.round(r.height)
      };
    });
    const metaRect = meta.getBoundingClientRect();
    return {
      metaText: meta.textContent.replace(/\s+/g, ' ').trim(),
      metaHeight: Math.round(metaRect.height),
      metaWidth: Math.round(metaRect.width),
      spans
    };
  });

  console.log('Dub card inspection:', JSON.stringify(cardInspection, null, 2));

  await new Promise(r => setTimeout(r, 600));

  const screenshotDir = path.resolve(__dirname, '../screenshots');
  fs.mkdirSync(screenshotDir, { recursive: true });

  const testCard = await page.$('#test-dub-card');
  if (testCard) {
    await testCard.screenshot({ path: path.join(screenshotDir, 'meta_line_card_desktop.png') });
  }

  // 1. Desktop full page
  await page.screenshot({ path: path.join(screenshotDir, 'meta_line_desktop.png') });

  // 2. Mobile viewport
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
  const mobileInspection = await page.evaluate(() => {
    const card = document.getElementById('test-dub-card');
    if (card) {
      card.style.width = '200px'; // test narrow card in 2-column mobile grid
    }
    const meta = card ? card.querySelector('.episode-meta') : null;
    const spans = meta ? Array.from(meta.children).map(s => {
      const r = s.getBoundingClientRect();
      return {
        text: s.textContent.trim(),
        top: Math.round(r.top),
        left: Math.round(r.left),
        width: Math.round(r.width),
        height: Math.round(r.height)
      };
    }) : [];
    const metaRect = meta ? meta.getBoundingClientRect() : {};
    return {
      metaHeight: Math.round(metaRect.height || 0),
      metaWidth: Math.round(metaRect.width || 0),
      spans
    };
  });
  console.log('Mobile narrow card inspection (200px width):', JSON.stringify(mobileInspection, null, 2));
  await new Promise(r => setTimeout(r, 500));
  if (testCard) {
    await testCard.screenshot({ path: path.join(screenshotDir, 'meta_line_card_mobile.png') });
  }
  await page.screenshot({ path: path.join(screenshotDir, 'meta_line_mobile.png') });

  await browser.close();
  server.close();
  console.log('Screenshots captured successfully!');
});
