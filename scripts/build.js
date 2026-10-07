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

// 1. Bundle and minify JS
await esbuild.build({
  entryPoints: [path.join(publicDir, 'app.js')],
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
  // 2. Safely replace app.js with cache-busted minified bundle
  .replace(/src=["']\/?app\.js(\?[^"']*)?["']/g, `src="app.min.js?v=${v}"`)
  // 3. Normalize any duplicate rel attributes to standard rel="stylesheet"
  .replace(/rel=["']?preload["']?\s+rel=["']?stylesheet["']?/g, 'rel="stylesheet"');

fs.writeFileSync(path.join(distDir, 'index.html'), prodHtml, 'utf-8');

// 4. Auto-copy ALL root static files to dist/
// (Automatically includes robots.txt, sw.js, _headers, manifest, icon.svg, llms.txt, etc.)
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

const originalJsSize = (fs.statSync(path.join(publicDir, 'app.js')).size / 1024).toFixed(1);
const minJsSize = (fs.statSync(path.join(distDir, 'app.min.js')).size / 1024).toFixed(1);
const originalCssSize = (fs.statSync(path.join(publicDir, 'style.css')).size / 1024).toFixed(1);
const minCssSize = (fs.statSync(path.join(distDir, 'style.min.css')).size / 1024).toFixed(1);

console.log(`✅ JS:   ${originalJsSize} KB  →  ${minJsSize} KB (public/dist/app.min.js)`);
console.log(`✅ CSS:  ${originalCssSize} KB  →  ${minCssSize} KB (public/dist/style.min.css)`);
console.log('✅ Static: Automatically copied all root assets & subdirectories to dist/');
console.log('✅ HTML: Generated production public/dist/index.html');
console.log('🎉 Production build complete!');