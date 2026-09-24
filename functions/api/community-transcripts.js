export async function onRequest(context) {
  const { request, env } = context;
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json; charset=utf-8'
  };

  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders, status: 204 });
  }

  const db = env.DB;
  if (!db) {
    return new Response(JSON.stringify({ found: false, error: 'Database unconfigured' }), {
      headers: corsHeaders,
      status: 200
    });
  }

  // Ensure table exists
  try {
    await db.prepare(`
      CREATE TABLE IF NOT EXISTS episode_transcripts (
        episode_guid TEXT PRIMARY KEY,
        feed_url TEXT,
        duration REAL DEFAULT 0,
        bars_json TEXT,
        segments_json TEXT,
        transcript_url TEXT,
        source TEXT DEFAULT 'probe',
        created_at INTEGER DEFAULT (unixepoch())
      )
    `).run();
  } catch (_) {}

  // 1. GET: Fetch community cached timeline / speech segments
  if (request.method === 'GET') {
    const url = new URL(request.url);
    const guid = url.searchParams.get('guid');

    if (!guid) {
      return new Response(JSON.stringify({ found: false, error: 'Missing guid parameter' }), {
        headers: corsHeaders,
        status: 400
      });
    }

    try {
      const row = await db.prepare(
        'SELECT episode_guid, duration, bars_json, segments_json, transcript_url, source, created_at FROM episode_transcripts WHERE episode_guid = ?'
      ).bind(guid).first();

      if (!row) {
        return new Response(JSON.stringify({ found: false }), {
          headers: { ...corsHeaders, 'Cache-Control': 'public, max-age=60' },
          status: 200
        });
      }

      const bars = row.bars_json ? JSON.parse(row.bars_json) : [];
      const segments = row.segments_json ? JSON.parse(row.segments_json) : [];

      return new Response(JSON.stringify({
        found: true,
        guid: row.episode_guid,
        duration: row.duration,
        bars,
        segments,
        transcriptUrl: row.transcript_url || '',
        source: row.source || 'community',
        createdAt: row.created_at
      }), {
        headers: { ...corsHeaders, 'Cache-Control': 'public, max-age=86400, s-maxage=604800' },
        status: 200
      });
    } catch (err) {
      return new Response(JSON.stringify({ found: false, error: err.message }), {
        headers: corsHeaders,
        status: 200
      });
    }
  }

  // 2. POST: Contribute analyzed speech/music timeline to the community
  if (request.method === 'POST') {
    try {
      const body = await request.json();
      const { episodeGuid, feedUrl, duration, bars, segments, transcriptUrl, source } = body;

      if (!episodeGuid || (!bars && !segments)) {
        return new Response(JSON.stringify({ success: false, error: 'Missing episodeGuid or timeline data' }), {
          headers: corsHeaders,
          status: 400
        });
      }

      const barsStr = bars ? JSON.stringify(bars) : '[]';
      const segStr = segments ? JSON.stringify(segments) : '[]';
      const dur = typeof duration === 'number' ? duration : 0;
      const src = source || 'probe';

      await db.prepare(`
        INSERT INTO episode_transcripts (episode_guid, feed_url, duration, bars_json, segments_json, transcript_url, source, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, unixepoch())
        ON CONFLICT(episode_guid) DO UPDATE SET
          bars_json = excluded.bars_json,
          segments_json = excluded.segments_json,
          duration = CASE WHEN excluded.duration > 0 THEN excluded.duration ELSE duration END,
          source = excluded.source,
          transcript_url = CASE WHEN excluded.transcript_url != '' THEN excluded.transcript_url ELSE transcript_url END
      `).bind(episodeGuid, feedUrl || '', dur, barsStr, segStr, transcriptUrl || '', src).run();

      return new Response(JSON.stringify({ success: true, guid: episodeGuid }), {
        headers: corsHeaders,
        status: 200
      });
    } catch (err) {
      return new Response(JSON.stringify({ success: false, error: err.message }), {
        headers: corsHeaders,
        status: 500
      });
    }
  }

  return new Response(JSON.stringify({ error: 'Method not allowed' }), {
    headers: corsHeaders,
    status: 405
  });
}
