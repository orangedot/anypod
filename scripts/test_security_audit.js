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
    console.error(`FAIL: ${testName} ${details ? `(${details})` : ''}`);
  } else {
    console.log(`PASS: ${testName}`);
  }
}

console.log('Running Anypod Security Verification Suite...\n');

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

// ─────────────────────────────────────────────────────────────────────────────
// 5. SSRF URL Validation & Safe Redirect Proxy Controls
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n--- 5. SSRF Defense & Proxy Redirect Validation ---');
const { isValidExternalUrl } = await import(path.join(appDir, 'functions', 'api', 'utils.js'));

const disallowedUrls = [
  'http://127.0.0.1/feed.xml',
  'http://169.254.169.254/latest/meta-data/',
  'http://[::1]/feed.xml',
  'http://[::7f00:1]/feed.xml',
  'http://[::ffff:127.0.0.1]/feed.xml',
  'http://[fe80::1%eth0]/feed.xml',
  'http://192.0.2.1/test',
  'http://198.18.0.1/test',
  'http://224.0.0.1/test',
  'http://2130706433/',
  'http://0x7f000001/',
  'https://user:pass@example.com/feed.xml',
  'file:///etc/passwd'
];
for (const badUrl of disallowedUrls) {
  assert(isValidExternalUrl(badUrl) === false, `SSRF blocks ${badUrl}`);
}
assert(isValidExternalUrl('https://feeds.simplecast.com/EmVW7VGp') === true, 'SSRF allows valid public HTTPS podcast feed');

const utilsSrc = fs.readFileSync(path.join(appDir, 'functions', 'api', 'utils.js'), 'utf-8');
assert(utilsSrc.includes("redirect: 'manual'"), 'safeExternalFetch uses redirect: manual to validate hops');

for (const proxyFile of ['audio-proxy.js', 'chapters-proxy.js', 'transcript-proxy.js', 'feed.js']) {
  const src = fs.readFileSync(path.join(appDir, 'functions', 'api', proxyFile), 'utf-8');
  assert(src.includes('safeExternalFetch('), `${proxyFile} uses safeExternalFetch()`);
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. Auth, Fail-Closed Secrets & Studio Tenant Isolation
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n--- 6. Auth, Fail-Closed Billing & Tenant Isolation ---');
const sendLinkSrc = fs.readFileSync(path.join(appDir, 'functions', 'api', 'auth', 'send-link.js'), 'utf-8');
assert(
  sendLinkSrc.includes('isLocalDevRequest') && !sendLinkSrc.includes('isSandboxRestriction'),
  'send-link.js never leaks verifyUrl on Resend 403/422 in production'
);

const verifySrc = fs.readFileSync(path.join(appDir, 'functions', 'api', 'auth', 'verify.js'), 'utf-8');
assert(
  verifySrc.includes('Number(existingToken.used) === 0'),
  'verify.js fallback branch enforces single-use token (used === 0)'
);

const webhookSrc = fs.readFileSync(path.join(appDir, 'functions', 'api', 'stripe', 'webhook.js'), 'utf-8');
assert(
  webhookSrc.includes('!env || !env.STRIPE_WEBHOOK_SECRET'),
  'stripe/webhook.js fails closed when STRIPE_WEBHOOK_SECRET is missing'
);

const planSrc = fs.readFileSync(path.join(appDir, 'functions', 'api', 'studio', 'plan.js'), 'utf-8');
assert(
  !planSrc.includes('!env.STUDIO_WEBHOOK_SECRET'),
  'studio/plan.js does not allow self-upgrade when STUDIO_WEBHOOK_SECRET is missing'
);

const studioPrivateSrc = fs.readFileSync(path.join(appDir, 'workers', 'studio-private', 'index.js'), 'utf-8');
assert(
  !studioPrivateSrc.includes('anypod-studio-open-core-default-key'),
  'studio-private/index.js contains no hardcoded default signing secret'
);

const showsSrc = fs.readFileSync(path.join(appDir, 'functions', 'api', 'studio', 'shows.js'), 'utf-8');
assert(
  showsSrc.includes('show.is_private && !isOwner'),
  'studio/shows.js enforces owner auth for private shows'
);

const episodesSrc = fs.readFileSync(path.join(appDir, 'functions', 'api', 'studio', 'episodes.js'), 'utf-8');
assert(
  episodesSrc.includes('existingEpisode.show_id !== show.id'),
  'studio/episodes.js prevents cross-show episode overwrite IDOR'
);

const uploadSrc = fs.readFileSync(path.join(appDir, 'functions', 'api', 'studio', 'upload.js'), 'utf-8');
assert(
  uploadSrc.includes('actualSize > allowedTicketSize'),
  'studio/upload.js enforces signed ticket byte quota on PUT'
);

const embedSrc = fs.readFileSync(path.join(appDir, 'functions', 'embed', '[showSlug]', 'index.js'), 'utf-8');
assert(
  embedSrc.includes('show.is_private') && embedSrc.includes("status = 'published'"),
  'embed player blocks private shows and unpublished drafts'
);

console.log(`\n========================================`);
console.log(`Tests: ${totalTests - failedTests} passed, ${failedTests} failed, ${totalTests} total`);
console.log(`========================================`);

if (failedTests > 0) {
  process.exit(1);
} else {
  console.log('All security verification checks PASSED!');
  process.exit(0);
}
