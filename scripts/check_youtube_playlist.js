#!/usr/bin/env node

/**
 * scripts/check_youtube_playlist.js
 *
 * Reusable test utility to inspect and diagnose YouTube playlist extraction,
 * detecting false video entries, missing durations, and playlist shelf leaks.
 *
 * Usage:
 *   node scripts/check_youtube_playlist.js [playlist_id_or_url]
 */

import fs from 'node:fs';

const playlistInput = process.argv[2] || 'PLx3QyNMOsJdzDzbIt2XYB-pK-rDIJ5Ph7aY';
const playlistId = playlistInput.includes('list=') 
  ? new URL(playlistInput).searchParams.get('list') 
  : playlistInput;

console.log(`\n🔍 Inspecting YouTube Playlist: ${playlistId}\n`);

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

async function run() {
  const url = `https://www.youtube.com/playlist?list=${playlistId}`;
  console.log(`🌐 Fetching: ${url}`);

  const res = await fetch(url, {
    headers: {
      'User-Agent': USER_AGENT,
      'Accept-Language': 'en-US,en;q=0.9'
    }
  });

  if (!res.ok) {
    console.error(`❌ HTTP ${res.status}: Failed to fetch playlist page`);
    console.log('Trying InnerTube browse API with ANDROID/WEB client...');
    await testInnerTubeBrowse(playlistId);
    return;
  }

  const html = await res.text();
  console.log(`📄 Received HTML (${(html.length / 1024).toFixed(1)} KB)`);

  const match = html.match(/var ytInitialData = ({.*?});<\/script>/s) || html.match(/ytInitialData\s*=\s*({.*?});/s);
  if (!match) {
    console.error('❌ ytInitialData not found in HTML response');
    await testInnerTubeBrowse(playlistId);
    return;
  }

  let data;
  try {
    data = JSON.parse(match[1]);
  } catch (err) {
    console.error('❌ Failed to parse ytInitialData JSON:', err.message);
    process.exit(1);
  }

  inspectData(data);
}

async function testInnerTubeBrowse(playlistId) {
  const browseUrl = 'https://www.youtube.com/youtubei/v1/browse?prettyPrint=false';
  const body = {
    context: {
      client: {
        clientName: 'WEB',
        clientVersion: '2.20240101.00.00'
      }
    },
    browseId: playlistId.startsWith('VL') ? playlistId : `VL${playlistId}`
  };

  const res = await fetch(browseUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': USER_AGENT
    },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    console.error(`❌ InnerTube browse HTTP ${res.status}`);
    process.exit(1);
  }

  const data = await res.json();
  console.log('✅ Received InnerTube browse response');
  inspectData(data);
}

function inspectData(data) {
  const lockups = [];
  function findLockups(obj, path = '') {
    if (!obj || typeof obj !== 'object') return;
    if (obj.lockupViewModel) {
      lockups.push({ lockup: obj.lockupViewModel, path });
    }
    for (const key of Object.keys(obj)) {
      findLockups(obj[key], path ? `${path}.${key}` : key);
    }
  }

  findLockups(data);
  console.log(`\nFound ${lockups.length} lockupViewModel instances in data:\n`);

  let realVideoCount = 0;
  let rejectedShelfCount = 0;

  lockups.forEach(({ lockup, path }, idx) => {
    const title = lockup.metadata?.lockupMetadataViewModel?.title?.content 
      || lockup.rendererContext?.accessibilityContext?.label 
      || 'Untitled';
    const contentType = lockup.contentType || '';
    const contentId = lockup.contentId || '';
    const endpointVId = lockup.rendererContext?.commandContext?.onTap?.innertubeCommand?.watchEndpoint?.videoId;
    const endpointPId = lockup.rendererContext?.commandContext?.onTap?.innertubeCommand?.watchEndpoint?.playlistId;
    const durText = lockup.contentImage?.thumbnailViewModel?.overlays?.[0]?.thumbnailBottomOverlayViewModel?.badges?.[0]?.thumbnailBadgeViewModel?.text || '';

    const isPlaylistType = contentType.includes('PLAYLIST') || contentType.includes('ALBUM') || contentType.includes('MIX') || contentType.includes('CHANNEL');
    const isPlaylistId = contentId.startsWith('PL') || contentId.startsWith('VL') || contentId.startsWith('RD') || contentId.startsWith('UC');
    const isShelfPath = path.includes('shelfRenderer') || path.includes('richShelfRenderer') || path.includes('horizontalList') || path.includes('secondaryContents');

    const isRejected = isPlaylistType || isPlaylistId || isShelfPath || !durText;

    if (isRejected) rejectedShelfCount++;
    else realVideoCount++;

    console.log(`[#${idx + 1}] ${isRejected ? '⛔ REJECTED' : '✅ VIDEO'} - "${title}"`);
    console.log(`     contentType: "${contentType}", contentId: "${contentId}"`);
    console.log(`     duration: "${durText || 'NONE'}" | watchEndpoint.videoId: ${endpointVId}`);
    console.log(`     path: ${path}`);
    console.log('----------------------------------------------------');
  });

  console.log(`\nSummary: ${realVideoCount} valid videos, ${rejectedShelfCount} rejected non-video/shelf items.\n`);
}

run().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
