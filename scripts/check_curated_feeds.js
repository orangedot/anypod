#!/usr/bin/env node

/**
 * check_curated_feeds.js
 *
 * Reusable test and discovery tool for Anypod's Curated Worldwide Shows.
 *
 * Usage:
 *   node scripts/check_curated_feeds.js           # Check all curated feeds
 *   node scripts/check_curated_feeds.js --resolve # Check and search iTunes API for working replacement URLs
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const appJsPath = path.resolve(__dirname, '../public/app.js');

// Parse CURATED_SCIENCE_FEEDS array from app.js
const appJs = fs.readFileSync(appJsPath, 'utf8');
const match = appJs.match(/const CURATED_SCIENCE_FEEDS = (\[[\s\S]*?\]);\s*\/\//);
if (!match) {
  console.error('❌ Could not locate CURATED_SCIENCE_FEEDS in app.js');
  process.exit(1);
}

let curatedFeeds;
try {
  curatedFeeds = (new Function(`return ${match[1]}`))();
} catch (err) {
  console.error('❌ Failed to parse CURATED_SCIENCE_FEEDS:', err.message);
  process.exit(1);
}

const shouldResolve = process.argv.includes('--resolve') || process.argv.includes('-r');

const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

async function testFeedUrl(url, timeoutMs = 8000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        'User-Agent': USER_AGENT,
        'Accept': 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*'
      },
      redirect: 'follow',
      signal: controller.signal
    });
    clearTimeout(timer);

    const status = res.status;
    const finalUrl = res.url;
    if (!res.ok) {
      return { ok: false, status, finalUrl, error: `HTTP ${status}` };
    }

    const text = await res.text();
    const hasXmlTag = text.includes('<rss') || text.includes('<xml') || text.includes('<feed') || text.includes('<channel');
    const hasItem = text.includes('<item') || text.includes('<entry');

    if (!hasXmlTag || !hasItem) {
      return {
        ok: false,
        status,
        finalUrl,
        error: 'Response is not valid podcast RSS/XML',
        preview: text.slice(0, 120).trim()
      };
    }

    // Rough episode count
    const epCount = (text.match(/<item[\s>]/gi) || text.match(/<entry[\s>]/gi) || []).length;

    return {
      ok: true,
      status,
      finalUrl,
      episodes: epCount
    };
  } catch (err) {
    clearTimeout(timer);
    return {
      ok: false,
      status: 0,
      finalUrl: url,
      error: err.name === 'AbortError' ? 'Timeout (8s)' : err.message
    };
  }
}

async function searchApplePodcasts(title) {
  try {
    const cleanTitle = title.replace(/\([^)]*\)/g, '').trim();
    const queryUrl = `https://itunes.apple.com/search?term=${encodeURIComponent(cleanTitle)}&entity=podcast&limit=3`;
    const res = await fetch(queryUrl, {
      headers: { 'User-Agent': USER_AGENT }
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (data.results && data.results.length > 0) {
      for (const item of data.results) {
        if (item.feedUrl) {
          return {
            title: item.collectionName,
            feedUrl: item.feedUrl,
            artist: item.artistName
          };
        }
      }
    }
  } catch (_) {}
  return null;
}

async function main() {
  console.log(`\n🎙️  Testing ${curatedFeeds.length} Curated Shows Worldwide...\n`);

  const results = [];
  const broken = [];

  // Test in small concurrent batches of 4
  const batchSize = 4;
  for (let i = 0; i < curatedFeeds.length; i += batchSize) {
    const batch = curatedFeeds.slice(i, i + batchSize);
    const batchResults = await Promise.all(
      batch.map(async (item) => {
        const check = await testFeedUrl(item.feed);
        return { item, check };
      })
    );

    for (const { item, check } of batchResults) {
      if (check.ok) {
        const redirected = check.finalUrl !== item.feed ? ` (➡️ ${check.finalUrl.slice(0, 45)}...)` : '';
        console.log(`  ✅ [${item.badge}] ${item.title} — ${check.episodes} eps${redirected}`);
        results.push({ item, check });
      } else {
        console.log(`  ❌ [${item.badge}] ${item.title} — ${check.error} (${item.feed})`);
        broken.push({ item, check });
      }
    }
  }

  console.log(`\n────────────────────────────────────────────────────────────`);
  console.log(`Summary: ${results.length} Active, ${broken.length} Inactive / Broken out of ${curatedFeeds.length}`);
  console.log(`────────────────────────────────────────────────────────────\n`);

  if (broken.length > 0 && shouldResolve) {
    console.log(`🔍 Searching Apple Podcasts directory for replacement URLs for ${broken.length} shows...\n`);
    for (const { item, check } of broken) {
      const candidate = await searchApplePodcasts(item.title);
      if (candidate && candidate.feedUrl) {
        const verify = await testFeedUrl(candidate.feedUrl);
        if (verify.ok) {
          console.log(`  ✨ Found live feed for "${item.title}":`);
          console.log(`     Old: ${item.feed}`);
          console.log(`     New: ${candidate.feedUrl} (${verify.episodes} eps)\n`);
        } else {
          console.log(`  ⚠️  Candidate for "${item.title}" also failed (${candidate.feedUrl})\n`);
        }
      } else {
        console.log(`  ❓ No alternative found on iTunes for "${item.title}"\n`);
      }
    }
  } else if (broken.length > 0) {
    console.log(`💡 Tip: Run with --resolve to automatically find live replacement feed URLs:`);
    console.log(`   node scripts/check_curated_feeds.js --resolve\n`);
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
