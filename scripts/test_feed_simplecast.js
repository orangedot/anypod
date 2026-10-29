#!/usr/bin/env node

/**
 * test_feed_simplecast.js
 * Tests fetching Simplecast RSS feeds like Radiolab with different User-Agents.
 */

const FEED_URL = 'https://feeds.simplecast.com/EmVW7VGp';

const testAgents = [
  { name: 'Default Anypod UA', ua: 'Anypod/1.0 (+CloudflarePages)' },
  { name: 'Chrome Mac UA', ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36' },
  { name: 'Apple Podcasts UA', ua: 'iCatcher! Podcast App/3.0.1' },
  { name: 'Overcast UA', ua: 'Overcast/3.0 (+http://overcast.fm/; iOS podcast app)' }
];

async function run() {
  console.log(`Testing feed URL: ${FEED_URL}\n`);
  for (const { name, ua } of testAgents) {
    try {
      const res = await fetch(FEED_URL, {
        headers: {
          'User-Agent': ua,
          'Accept': 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*'
        }
      });
      console.log(`[${name}] Status: ${res.status} ${res.statusText}`);
      if (res.ok) {
        const text = await res.text();
        const epCount = (text.match(/<item[\s>]/gi) || []).length;
        console.log(`  -> SUCCESS! Found ${epCount} episodes. Title match:`, text.match(/<title>(.*?)<\/title>/)?.[1]);
      }
    } catch (e) {
      console.log(`[${name}] Error:`, e.message);
    }
  }
}

run();
