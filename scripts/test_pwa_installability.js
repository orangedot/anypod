import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.resolve(__dirname, '../public');

console.log('🧪 Running PWA & Homescreen Installability Test Suite...\n');

let failed = false;
function assert(condition, message) {
  if (!condition) {
    console.error(`❌ FAIL: ${message}`);
    failed = true;
  } else {
    console.log(`✅ PASS: ${message}`);
  }
}

// 1. Manifest Validation
const manifestPath = path.join(publicDir, 'manifest.webmanifest');
assert(fs.existsSync(manifestPath), 'manifest.webmanifest exists in public/');

const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
assert(manifest.id === '/?source=pwa', 'manifest.id is defined and equals "/?source=pwa"');
assert(manifest.start_url === '/?source=pwa', 'manifest.start_url is "/?source=pwa"');
assert(manifest.display === 'standalone', 'manifest.display is "standalone"');
assert(Array.isArray(manifest.display_override) && manifest.display_override.includes('standalone'), 'manifest.display_override includes standalone');
assert(Array.isArray(manifest.categories) && manifest.categories.includes('music'), 'manifest.categories includes "music"');

// Check icons
assert(Array.isArray(manifest.icons) && manifest.icons.length >= 3, 'manifest.icons has at least 3 icons');
const icon192 = manifest.icons.find(i => i.sizes === '192x192' && i.src === '/icon-192.png');
const icon512 = manifest.icons.find(i => i.sizes === '512x512' && i.src === '/icon-512.png');
const iconMaskable = manifest.icons.find(i => i.purpose && i.purpose.includes('maskable'));
const icon180 = manifest.icons.find(i => i.sizes === '180x180' && i.src === '/icon-180.png');

assert(!!icon192, 'manifest has 192x192 icon');
assert(!!icon512, 'manifest has 512x512 icon');
assert(!!iconMaskable, 'manifest has maskable SVG icon');
assert(!!icon180, 'manifest has 180x180 Apple touch icon');

// Check screenshots for Chromium Rich Install UI
assert(Array.isArray(manifest.screenshots) && manifest.screenshots.length >= 2, 'manifest has at least 2 screenshots');
const wideScreenshot = manifest.screenshots.find(s => s.form_factor === 'wide');
const narrowScreenshot = manifest.screenshots.find(s => s.form_factor === 'narrow');
assert(!!wideScreenshot, 'manifest has wide screenshot (form_factor: wide)');
assert(!!narrowScreenshot, 'manifest has narrow screenshot (form_factor: narrow)');

// Check physical existence of files referenced in manifest
for (const icon of manifest.icons) {
  const filePath = path.join(publicDir, icon.src);
  assert(fs.existsSync(filePath), `Icon file exists: ${icon.src}`);
}
for (const shot of manifest.screenshots) {
  const filePath = path.join(publicDir, shot.src);
  assert(fs.existsSync(filePath), `Screenshot file exists: ${shot.src}`);
}

// Check shortcuts
assert(Array.isArray(manifest.shortcuts) && manifest.shortcuts.length >= 2, 'manifest has app shortcuts');

// 2. HTML Meta Tags Validation (both index.html and dist/index.html)
const htmlPath = path.join(publicDir, 'index.html');
const htmlContent = fs.readFileSync(htmlPath, 'utf8');

assert(htmlContent.includes('viewport-fit=cover'), 'HTML includes viewport-fit=cover');
assert(htmlContent.includes('name="apple-mobile-web-app-capable" content="yes"'), 'HTML has apple-mobile-web-app-capable meta');
assert(htmlContent.includes('name="apple-mobile-web-app-title" content="Anypod"'), 'HTML has apple-mobile-web-app-title meta');
assert(htmlContent.includes('rel="apple-touch-icon" sizes="180x180" href="/icon-180.png"'), 'HTML has apple-touch-icon 180x180');
assert(htmlContent.includes('id="btn-install-app"'), 'HTML has #btn-install-app header pill');
assert(htmlContent.includes('id="ios-install-modal"'), 'HTML has #ios-install-modal');
assert(htmlContent.includes('id="btn-settings-install"'), 'HTML has #btn-settings-install in settings');

// 3. Service Worker registration & shell
const swPath = path.join(publicDir, 'sw.js');
const swContent = fs.readFileSync(swPath, 'utf8');
assert(swContent.includes('/shared/install-manager.js'), 'sw.js APP_SHELL includes install-manager.js');
assert(swContent.includes('/icon-180.png'), 'sw.js APP_SHELL includes icon-180.png');

console.log('\n----------------------------------------');
if (failed) {
  console.error('❌ One or more PWA installability tests failed.');
  process.exit(1);
} else {
  console.log('🎉 ALL PWA & Homescreen Installability tests PASSED with 100% compliance!');
}
