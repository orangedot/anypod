import esbuild from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const publicDir = path.join(rootDir, 'public');
const distDir = path.join(publicDir, 'dist');

console.log('📦 Starting Anypod production build...');

// Ensure clean dist directory
if (!fs.existsSync(distDir)) {
  fs.mkdirSync(distDir, { recursive: true });
}

// 0. Assemble in-memory JS bundle from shared/* + app/* modular files
const sharedModules = [
  'shared/formatters.js',
  'shared/storage.js',
  'shared/sync-bridge.js',
  'shared/audio-utils.js'
];

const appModules = [
  'app/01-state-and-dom.js',
  'app/02-auth-and-sync.js',
  'app/03-queue-favorites-downloads.js',
  'app/04-feeds-and-discover.js',
  'app/05-timeline-and-cards.js',
  'app/06-audio-player.js',
  'app/07-events-and-modals.js',
  'app/08-waveform-and-ai.js'
];

const sharedCode = sharedModules
  .map(rel => `// ── ${rel} ──\n` + fs.readFileSync(path.join(publicDir, rel), 'utf-8'))
  .join('\n\n');

const appBody = appModules
  .map(rel => {
    const raw = fs.readFileSync(path.join(publicDir, rel), 'utf-8').replace(/^'use strict';\s*/, '');
    return `  // ══ ${rel} ══\n` + raw.split('\n').map(l => (l ? '  ' + l : '')).join('\n');
  })
  .join('\n\n');

const assembledAppJs = `${sharedCode}\n\n(function () {\n  'use strict';\n\n${appBody}\n})();\n`;
console.log(`🔧 Assembled in-memory: ${sharedModules.length} shared + ${appModules.length} app modules`);

// Clean up legacy monolithic app.js if present
const legacyAppJs = path.join(publicDir, 'app.js');
if (fs.existsSync(legacyAppJs)) {
  fs.unlinkSync(legacyAppJs);
}

// 1. Bundle and minify JS directly in memory (zero monolithic file on disk)
await esbuild.build({
  stdin: {
    contents: assembledAppJs,
    resolveDir: publicDir,
    sourcefile: 'app.js',
    loader: 'js'
  },
  bundle: false,
  minify: true,
  sourcemap: true,
  target: ['es2022'],
  outfile: path.join(distDir, 'app.min.js'),
  metafile: true
});

// 2. Minify CSS
await esbuild.build({
  entryPoints: [path.join(publicDir, 'style.css')],
  bundle: false,
  minify: true,
  sourcemap: true,
  outfile: path.join(distDir, 'style.min.css'),
  metafile: true
});

// 3. Prepare production HTML in public/dist/index.html
const rawHtml = fs.readFileSync(path.join(publicDir, 'index.html'), 'utf-8');
const minCss = fs.readFileSync(path.join(distDir, 'style.min.css'), 'utf-8');
const v = Date.now();

let prodHtml = rawHtml
  // 1. Inline minified CSS directly (eliminates render-blocking audit and FOUC permanently)
  .replace(/<link[^>]*href=["']\/?style\.css(\?[^"']*)?["'][^>]*>/i, `<style>${minCss}</style>`)
  // 2. Replace modular shared/ and app/ script tags (or legacy app.js tag) with single minified bundle
  .replace(
    /<!-- Shared Functional Modules \(AnypodShared\) -->[\s\S]*?<script src="app\/08-waveform-and-ai\.js(\?[^"']*)?" defer><\/script>/i,
    `<script src="app.min.js?v=${v}" defer></script>`
  )
  .replace(/src=["']\/?app\.js(\?[^"']*)?["']/g, `src="app.min.js?v=${v}"`)
  // 3. Normalize any duplicate rel attributes to standard rel="stylesheet"
  .replace(/rel=["']?preload["']?\s+rel=["']?stylesheet["']?/g, 'rel="stylesheet"');

fs.writeFileSync(path.join(distDir, 'index.html'), prodHtml, 'utf-8');

// 4. Auto-copy ALL root static files to dist/
// (Automatically includes robots.txt, sw.js, _headers, manifest, icon.svg, llms.txt, shared/, app/, dj.js, sets.js, etc.)
const ignoredFiles = new Set(['index.html', 'app.js', 'style.css', 'dist', 'node_modules', '.git']);

for (const entry of fs.readdirSync(publicDir, { withFileTypes: true })) {
  if (ignoredFiles.has(entry.name)) continue;

  const srcPath = path.join(publicDir, entry.name);
  const destPath = path.join(distDir, entry.name);

  if (entry.isFile()) {
    fs.copyFileSync(srcPath, destPath);
  } else if (entry.isDirectory()) {
    fs.cpSync(srcPath, destPath, { recursive: true });
  }
}

// 5. Customize dist/sw.js to cache production bundle
const swDistPath = path.join(distDir, 'sw.js');
if (fs.existsSync(swDistPath)) {
  let swContent = fs.readFileSync(swDistPath, 'utf-8');
  swContent = swContent
    .replace(/'\/app\.js',?\n?/g, "'/app.min.js',\n")
    .replace(/'\/style\.css',?\n?/g, "'/style.min.css',\n");
  fs.writeFileSync(swDistPath, swContent, 'utf-8');
}

const originalJsSize = (Buffer.byteLength(assembledAppJs, 'utf-8') / 1024).toFixed(1);
const minJsSize = (fs.statSync(path.join(distDir, 'app.min.js')).size / 1024).toFixed(1);
const originalCssSize = (fs.statSync(path.join(publicDir, 'style.css')).size / 1024).toFixed(1);
const minCssSize = (fs.statSync(path.join(distDir, 'style.min.css')).size / 1024).toFixed(1);

console.log(`✅ JS:   ${originalJsSize} KB (in-memory)  →  ${minJsSize} KB (public/dist/app.min.js)`);
console.log(`✅ CSS:  ${originalCssSize} KB  →  ${minCssSize} KB (public/dist/style.min.css)`);
console.log('✅ Static: Automatically copied all root assets & subdirectories to dist/');
console.log('✅ HTML: Generated production public/dist/index.html');
console.log('🎉 Production build complete!');