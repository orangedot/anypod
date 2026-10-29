#!/usr/bin/env node

/**
 * test_youtube_search.js
 *
 * Tests YouTube and YouTube Music search methods:
 * 1. InnerTube API POST https://www.youtube.com/youtubei/v1/search
 * 2. HTML search results scraping via ytInitialData
 */

async function testInnerTubeSearch(query, isMusic = false) {
  const url = 'https://www.youtube.com/youtubei/v1/search?prettyPrint=false';
  const client = isMusic
    ? { clientName: 'WEB_REMIX', clientVersion: '1.20240101.01.00' }
    : { clientName: 'WEB', clientVersion: '2.20240101.00.00' };

  const body = {
    context: {
      client: {
        ...client,
        hl: 'en',
        gl: 'US'
      }
    },
    query: isMusic ? `${query} music` : query
  };

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
      },
      body: JSON.stringify(body)
    });

    console.log(`InnerTube status (${isMusic ? 'music' : 'video'}):`, res.status);
    if (!res.ok) return null;
    const json = await res.json();
    return json;
  } catch (err) {
    console.error('InnerTube error:', err.message);
    return null;
  }
}

async function testHtmlSearch(query, isMusic = false) {
  const searchQuery = isMusic ? `${query} audio music` : query;
  const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(searchQuery)}&hl=en`;

  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9'
      }
    });

    console.log(`HTML search status (${isMusic ? 'music' : 'video'}):`, res.status);
    if (!res.ok) return null;
    const html = await res.text();
    const match = html.match(/var ytInitialData\s*=\s*({.+?});<\/script>/s) || html.match(/ytInitialData\s*=\s*({.+?});/s);
    if (!match) {
      console.log('ytInitialData not matched in HTML (length: ' + html.length + ')');
      return null;
    }
    const data = JSON.parse(match[1]);
    return data;
  } catch (err) {
    console.error('HTML search error:', err.message);
    return null;
  }
}

function parseVideosFromYtData(data, type = 'youtube') {
  const results = [];
  try {
    const contents = data?.contents?.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer?.contents || [];
    for (const section of contents) {
      const items = section?.itemSectionRenderer?.contents || [];
      for (const item of items) {
        const vr = item?.videoRenderer || item?.compactVideoRenderer;
        if (!vr || !vr.videoId) continue;

        const videoId = vr.videoId;
        const title = vr.title?.runs?.map(r => r.text).join('') || vr.title?.simpleText || '';
        const author = vr.ownerText?.runs?.map(r => r.text).join('') || vr.longBylineText?.runs?.map(r => r.text).join('') || vr.shortBylineText?.runs?.map(r => r.text).join('') || '';
        const duration = vr.lengthText?.simpleText || vr.lengthText?.runs?.map(r => r.text).join('') || '';
        const thumbnails = vr.thumbnail?.thumbnails || [];
        const thumbnail = thumbnails[thumbnails.length - 1]?.url || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
        const viewCount = vr.viewCountText?.simpleText || vr.shortViewCountText?.simpleText || '';

        results.push({
          id: videoId,
          guid: `yt:${videoId}`,
          title,
          author,
          podcastTitle: author || 'YouTube',
          duration,
          artwork: thumbnail,
          audioUrl: `https://www.youtube.com/watch?v=${videoId}`,
          type,
          isYouTube: true,
          viewCount
        });
      }
    }
  } catch (e) {
    console.error('Parse error:', e.message);
  }
  return results;
}

async function run() {
  console.log('Testing HTML search for "Daft Punk"...');
  const htmlData = await testHtmlSearch('Daft Punk', false);
  if (htmlData) {
    const items = parseVideosFromYtData(htmlData, 'youtube');
    console.log(`Parsed ${items.length} YouTube items:`);
    items.slice(0, 3).forEach((item, idx) => {
      console.log(` ${idx + 1}. [${item.duration}] ${item.title} - ${item.author} (${item.audioUrl})`);
    });
  }

  console.log('\nTesting Music HTML search for "Daft Punk"...');
  const musicData = await testHtmlSearch('Daft Punk', true);
  if (musicData) {
    const musicItems = parseVideosFromYtData(musicData, 'youtube_music');
    console.log(`Parsed ${musicItems.length} YouTube Music items:`);
    musicItems.slice(0, 3).forEach((item, idx) => {
      console.log(` ${idx + 1}. [${item.duration}] ${item.title} - ${item.author} (${item.audioUrl})`);
    });
  }
}

run();
