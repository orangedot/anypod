import esbuild from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const publicDir = path.join(rootDir, 'public');
const distDir = path.join(publicDir, 'dist');

console.log('📦 Starting Podany production build...');

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
const v = Date.now();
const prodHtml = rawHtml
  .replace(/href="style\.css(\?[^"]*)?"/, `href="style.min.css?v=${v}"`)
  .replace(/src="app\.js(\?[^"]*)?"/, `src="app.min.js?v=${v}"`);

fs.writeFileSync(path.join(distDir, 'index.html'), prodHtml, 'utf-8');

// 4. Copy static assets to public/dist/
const staticFiles = ['icon.svg', 'manifest.webmanifest', '_headers'];
for (const file of staticFiles) {
  const src = path.join(publicDir, file);
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, path.join(distDir, file));
  }
}

const originalJsSize = (fs.statSync(path.join(publicDir, 'app.js')).size / 1024).toFixed(1);
const minJsSize = (fs.statSync(path.join(distDir, 'app.min.js')).size / 1024).toFixed(1);
const originalCssSize = (fs.statSync(path.join(publicDir, 'style.css')).size / 1024).toFixed(1);
const minCssSize = (fs.statSync(path.join(distDir, 'style.min.css')).size / 1024).toFixed(1);

console.log(`✅ JS:   ${originalJsSize} KB  →  ${minJsSize} KB (public/dist/app.min.js)`);
console.log(`✅ CSS:  ${originalCssSize} KB  →  ${minCssSize} KB (public/dist/style.min.css)`);
console.log('✅ HTML: Generated production public/dist/index.html');
console.log('🎉 Production build complete!');
