#!/usr/bin/env node
/**
 * check_catalog_feeds.mjs — verify (and optionally prune) feeds of one curated catalog.
 *
 * Usage:
 *   node scripts/check_catalog_feeds.mjs audiobooks            # report only
 *   node scripts/check_catalog_feeds.mjs audiobooks --prune    # drop dead feeds, rebuild
 *                                                              # featured + index.json entry
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../public/catalogs');
const id = process.argv[2];
const prune = process.argv.includes('--prune');
if (!id) { console.error('usage: check_catalog_feeds.mjs <catalog-id> [--prune]'); process.exit(1); }

const file = path.join(dir, `${id}.json`);
const catalog = JSON.parse(fs.readFileSync(file, 'utf8'));
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/124.0 Safari/537.36';

async function check(url) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 10000);
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA }, redirect: 'follow', signal: ctl.signal });
    if (!res.ok) return `HTTP ${res.status}`;
    const text = await res.text();
    if (!/<rss|<feed|<channel/.test(text)) return 'not RSS';
    if (!/<item[\s>]|<entry[\s>]/.test(text)) return 'no episodes';
    return null;
  } catch (e) {
    return e.name === 'AbortError' ? 'timeout' : e.message;
  } finally {
    clearTimeout(timer);
  }
}

const results = await Promise.all(catalog.shows.map(async (s) => ({ show: s, error: await check(s.feed) })));
for (const { show, error } of results) console.log(`${error ? 'FAIL' : ' ok '}  ${show.title}${error ? `  (${error})` : ''}`);

const alive = results.filter((r) => !r.error).map((r) => r.show);
console.log(`\n${alive.length}/${catalog.shows.length} feeds alive`);

if (prune) {
  catalog.shows = alive;
  catalog.featured = alive.slice(0, 5);
  fs.writeFileSync(file, JSON.stringify(catalog, null, 2) + '\n');

  const indexFile = path.join(dir, 'index.json');
  const index = JSON.parse(fs.readFileSync(indexFile, 'utf8'));
  const entry = {
    id: catalog.id, title: catalog.title, emoji: catalog.emoji, description: catalog.description,
    totalShows: alive.length, featured: catalog.featured, subtopics: catalog.subtopics
  };
  const at = index.findIndex((c) => c.id === id);
  if (at >= 0) index[at] = entry; else index.unshift(entry);
  fs.writeFileSync(indexFile, JSON.stringify(index, null, 2) + '\n');
  console.log(`Pruned ${id}.json and synced index.json`);
}
