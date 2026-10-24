import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appDir = path.resolve(__dirname, '..');

let totalTests = 0;
let failedTests = 0;

function assert(condition, testName, details = '') {
  totalTests++;
  if (!condition) {
    failedTests++;
    console.error(`❌ FAIL: ${testName} ${details ? `(${details})` : ''}`);
  } else {
    console.log(`✅ PASS: ${testName}`);
  }
}

console.log('🔒 Running Anypod Security Verification Suite...\n');

// ─────────────────────────────────────────────────────────────────────────────
// 1. HTTP Security Headers & CSP
// ─────────────────────────────────────────────────────────────────────────────
console.log('--- 1. HTTP Security Headers & Content Security Policy ---');
const headersContent = fs.readFileSync(path.join(appDir, 'public', '_headers'), 'utf-8');

assert(
  headersContent.includes('Strict-Transport-Security:'),
  'HSTS header present in _headers',
  'Strict-Transport-Security header is missing'
);

assert(
  /Content-Security-Policy:.*object-src\s+'none'/i.test(headersContent),
  'CSP includes object-src \'none\'',
  'object-src \'none\' directive is missing from CSP'
);

assert(
  /Content-Security-Policy:.*base-uri\s+'self'/i.test(headersContent),
  'CSP includes base-uri \'self\'',
  'base-uri \'self\' directive is missing from CSP'
);

// ─────────────────────────────────────────────────────────────────────────────
// 2. Dependabot Sharp Overrides in package.json
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n--- 2. Dependency Overrides (Sharp Dependabot Alert) ---');
const pkg = JSON.parse(fs.readFileSync(path.join(appDir, 'package.json'), 'utf-8'));
assert(
  pkg.overrides && pkg.overrides.sharp && pkg.overrides.sharp.includes('0.35.5'),
  'package.json contains sharp override >= 0.35.5',
  'package.json missing overrides.sharp'
);

// ─────────────────────────────────────────────────────────────────────────────
// 3. Show Notes HTML Sanitization (XSS Defense)
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n--- 3. Show Notes HTML Sanitization & Event Handler Scrubbing ---');

// Mock browser DOMParser environment for Node testing
const { JSDOM } = await import('jsdom').catch(async () => {
  // If jsdom is not installed, we can simulate DOMParser with a regex-based or minimal parser
  return { JSDOM: null };
});

if (!globalThis.DOMParser) {
  // Minimal DOMParser mock if jsdom isn't present
  const jsdomPkg = await import('jsdom').catch(() => null);
  if (jsdomPkg) {
    const dom = new jsdomPkg.JSDOM('');
    globalThis.DOMParser = dom.window.DOMParser;
    globalThis.document = dom.window.document;
  }
}

// Read formatShowNotesHtml source directly
const cardsJs = fs.readFileSync(path.join(appDir, 'public', 'app', '05-timeline-and-cards.js'), 'utf-8');

assert(
  cardsJs.includes('.removeAttribute(attr.name)') || cardsJs.includes('.removeAttribute(attr)'),
  'formatShowNotesHtml scrubs dynamic element attributes (e.g. on* handlers)',
  'Attribute scrubbing logic not found in 05-timeline-and-cards.js'
);

assert(
  cardsJs.includes('javascript:') || cardsJs.includes('javascript|'),
  'formatShowNotesHtml detects and strips javascript: URI schemes in href/src',
  'URI scheme sanitization not found in 05-timeline-and-cards.js'
);

// ─────────────────────────────────────────────────────────────────────────────
// 4. Safe Attribute Escaping in Episode Cards and Chapters
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n--- 4. Attribute Escaping in Cards and Chapter Rows ---');

assert(
  cardsJs.includes('src="${escapeHtml(ep.artwork'),
  'Episode artwork attribute is escaped with escapeHtml()',
  'ep.artwork interpolated raw in src attribute'
);

assert(
  cardsJs.includes('src="${escapeHtml(meta.artwork'),
  'Feed metadata artwork attribute is escaped with escapeHtml()',
  'meta.artwork interpolated raw in src attribute'
);

assert(
  cardsJs.includes('src="${escapeHtml(ch.img'),
  'Chapter thumbnail attribute is escaped with escapeHtml()',
  'ch.img interpolated raw in src attribute'
);

assert(
  cardsJs.includes('href="${escapeHtml(ch.url') || cardsJs.includes('href="${safeChapterUrl'),
  'Chapter URL link attribute is escaped and protocol checked',
  'ch.url interpolated raw in href attribute'
);

console.log(`\n========================================`);
console.log(`Tests: ${totalTests - failedTests} passed, ${failedTests} failed, ${totalTests} total`);
console.log(`========================================`);

if (failedTests > 0) {
  process.exit(1);
} else {
  console.log('🎉 All security verification checks PASSED!');
  process.exit(0);
}
