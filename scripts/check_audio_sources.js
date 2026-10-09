#!/usr/bin/env node

/**
 * scripts/check_audio_sources.js
 *
 * Reusable test utility to verify podcast audio stream URLs, CDN response headers,
 * Range request compatibility, and audio-proxy readiness.
 *
 * Usage:
 *   node scripts/check_audio_sources.js                                 # Tests default representative feeds
 *   node scripts/check_audio_sources.js <audio_or_feed_url>            # Test specific audio URL or RSS feed
 *   node scripts/check_audio_sources.js --all                          # Tests all curated feeds in the library
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const USER_AGENT = 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36 Anypod/1.0';

const DEFAULT_TEST_FEEDS = [
  {
    name: 'Deutschlandfunk (Forschung aktuell)',
    url: 'https://www.deutschlandfunk.de/podcast-forschung-aktuell.422.de.rss'
  },
  {
    name: 'Resident Advisor Podcast',
    url: 'https://feeds.soundcloud.com/users/soundcloud:users:1873161/sounds.rss'
  },
  {
    name: 'BBC The Documentary',
    url: 'https://podcasts.files.bbci.co.uk/p02nq0lx.rss'
  },
  {
    name: 'NPR News Now',
    url: 'https://feeds.npr.org/500005/podcast.xml'
  }
];

function logHeader(title) {
  console.log('\n' + '='.repeat(64));
  console.log(` 🎧 ${title}`);
  console.log('='.repeat(64));
}

/**
 * Tests an individual audio file URL for streaming headers and byte range support.
 */
async function testAudioStreamUrl(audioUrl, title = '') {
  console.log(`\n▶ Testing Audio: "${title || audioUrl}"`);
  console.log(`  Target: ${audioUrl}`);

  const results = {
    url: audioUrl,
    directHead: false,
    directRange: false,
    contentType: 'unknown',
    contentLength: 0,
    acceptRanges: 'none',
    status: 0,
    redirects: 0,
    issues: []
  };

  // 1. Test HEAD Request (to check CORS, redirects, Content-Type, Content-Length)
  try {
    const headRes = await fetch(audioUrl, {
      method: 'HEAD',
      headers: { 'User-Agent': USER_AGENT },
      redirect: 'follow',
      signal: AbortSignal.timeout(9000)
    });

    results.status = headRes.status;
    results.contentType = headRes.headers.get('content-type') || 'unknown';
    results.contentLength = parseInt(headRes.headers.get('content-length') || '0', 10);
    results.acceptRanges = headRes.headers.get('accept-ranges') || 'none';

    if (headRes.ok) {
      results.directHead = true;
      console.log(`  [HEAD] HTTP ${headRes.status} | Type: ${results.contentType} | Size: ${(results.contentLength / 1024 / 1024).toFixed(2)} MB`);
      console.log(`  [HEAD] Accept-Ranges: ${results.acceptRanges}`);
    } else {
      results.issues.push(`HEAD returned HTTP ${headRes.status}`);
      console.log(`  ⚠️ [HEAD] Non-200 HTTP status: ${headRes.status}`);
    }
  } catch (err) {
    results.issues.push(`HEAD request failed: ${err.message}`);
    console.log(`  ⚠️ [HEAD] Failed: ${err.message}`);
  }

  // 2. Test HTTP 206 Partial Content (Byte Range Request: 0-1024)
  // This is what mobile Chromium / FFmpegDemuxer strictly relies upon!
  try {
    const rangeRes = await fetch(audioUrl, {
      method: 'GET',
      headers: {
        'User-Agent': USER_AGENT,
        'Range': 'bytes=0-1024'
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(9000)
    });

    const is206 = rangeRes.status === 206;
    const contentRange = rangeRes.headers.get('content-range') || 'none';
    const rangeContentType = rangeRes.headers.get('content-type') || results.contentType;

    if (is206) {
      results.directRange = true;
      console.log(`  [RANGE 206] ✅ Valid partial content supported! (Content-Range: ${contentRange})`);
    } else if (rangeRes.status === 200) {
      console.log(`  [RANGE 200] ⚠️ Server ignored Range header and sent full body (HTTP 200). Mobile scrubbing may stall.`);
      results.issues.push('Server does not support HTTP 206 partial content');
    } else {
      console.log(`  [RANGE] ❌ Range request failed with HTTP ${rangeRes.status}`);
      results.issues.push(`Range request HTTP ${rangeRes.status}`);
    }
  } catch (err) {
    results.issues.push(`Range request error: ${err.message}`);
    console.log(`  [RANGE] ❌ Error: ${err.message}`);
  }

  // 3. Overall Verdict
  const isHealthy = results.directHead && results.directRange;
  if (isHealthy) {
    console.log(`  Verdict: ✅ DIRECT STREAM HEALTHY (Native playback will work cleanly in background)`);
  } else {
    console.log(`  Verdict: ⚠️ CDN REQUIRES AUDIO-PROXY (Native audio may encounter Code 4 / demux drop without proxy)`);
  }

  return results;
}

/**
 * Extracts sample episodes from an RSS Feed and tests their audio enclosure URLs.
 */
async function testFeedAudioSources(feedUrl, feedName = '') {
  logHeader(`Auditing Feed: ${feedName || feedUrl}`);
  console.log(`Fetching RSS feed: ${feedUrl}...`);

  try {
    const res = await fetch(feedUrl, {
      headers: { 'User-Agent': USER_AGENT },
      signal: AbortSignal.timeout(10000)
    });

    if (!res.ok) {
      console.error(`❌ Could not fetch feed (HTTP ${res.status})`);
      return;
    }

    const xml = await res.text();
    const itemRegex = /<item[^>]*>([\s\S]*?)<\/item>/gi;
    let match;
    const episodes = [];

    while ((match = itemRegex.exec(xml)) !== null && episodes.length < 3) {
      const itemXml = match[1];
      const titleMatch = itemXml.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
      const title = titleMatch ? titleMatch[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/gi, '$1').trim() : 'Untitled';
      
      const encMatch = itemXml.match(/<enclosure[^>]*url=["']([^"']+)["'][^>]*>/i) 
                    || itemXml.match(/<media:content[^>]*url=["']([^"']+)["'][^>]*>/i);
      if (encMatch && encMatch[1]) {
        episodes.push({ title, audioUrl: encMatch[1].trim() });
      }
    }

    if (episodes.length === 0) {
      console.log('⚠️ No audio enclosures found in feed.');
      return;
    }

    console.log(`Found ${episodes.length} sample episodes to inspect.`);
    for (const ep of episodes) {
      await testAudioStreamUrl(ep.audioUrl, ep.title);
    }
  } catch (err) {
    console.error(`❌ Feed test failed: ${err.message}`);
  }
}

async function main() {
  const args = process.argv.slice(2);
  const target = args.find(a => !a.startsWith('-'));

  if (target) {
    // Check if target is a direct audio file or a podcast feed
    if (/\.(mp3|m4a|aac|ogg|opus)(\?|$)/i.test(target)) {
      logHeader('Direct Audio URL Verification');
      await testAudioStreamUrl(target, 'User Input Audio File');
    } else {
      await testFeedAudioSources(target, 'User Specified Feed');
    }
    return;
  }

  logHeader('Anypod Audio Source Health Check');
  console.log('Testing representative podcast network CDNs (Akamai, SoundCloud, BBC, NPR)...');

  for (const feed of DEFAULT_TEST_FEEDS) {
    await testFeedAudioSources(feed.url, feed.name);
  }

  console.log('\n' + '='.repeat(64));
  console.log(' ✨ Audio source verification check complete.');
  console.log('='.repeat(64) + '\n');
}

main();
