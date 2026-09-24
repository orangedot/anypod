import { getUserFromRequest } from '../utils.js';

export async function onRequest(context) {
  const { request, env } = context;
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Session-Token',
    'Content-Type': 'application/json; charset=utf-8'
  };

  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders, status: 204 });
  }

  const db = env.DB;
  if (!db) {
    return new Response(JSON.stringify({ error: 'DB unconfigured' }), { headers: corsHeaders, status: 500 });
  }

  const user = await getUserFromRequest(request, env);
  if (!user) {
    return new Response(JSON.stringify({ error: 'Unauthorized: Session required' }), { headers: corsHeaders, status: 401 });
  }

  const userId = user.id;
  db.prepare('UPDATE users SET last_active_at = unixepoch(), warned_30d_at = NULL, warned_50d_at = NULL WHERE id = ?').bind(userId).run().catch(() => {});

  // Ensure table exists
  try {
    await db.prepare(`
      CREATE TABLE IF NOT EXISTS favorites (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        episode_guid TEXT NOT NULL,
        feed_url TEXT,
        title TEXT,
        podcast_title TEXT,
        artwork TEXT,
        audio_url TEXT,
        duration TEXT,
        pub_date TEXT,
        created_at INTEGER DEFAULT (unixepoch()),
        UNIQUE(user_id, episode_guid),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `).run();
  } catch (_) {}

  try {
    if (request.method === 'GET') {
      const rows = await db.prepare(
        'SELECT episode_guid, feed_url, title, podcast_title, artwork, audio_url, duration, pub_date, created_at FROM favorites WHERE user_id = ? ORDER BY created_at DESC'
      ).bind(userId).all();

      const favorites = (rows.results || []).map(r => ({
        guid: r.episode_guid,
        feedUrl: r.feed_url,
        title: r.title,
        podcastTitle: r.podcast_title,
        artwork: r.artwork,
        audioUrl: r.audio_url,
        duration: r.duration,
        pubDate: r.pub_date,
        addedAt: r.created_at * 1000
      }));

      return new Response(JSON.stringify({ favorites }), { headers: corsHeaders, status: 200 });
    }

    if (request.method === 'POST') {
      const body = await request.json();
      const { episodeGuid, feedUrl, title, podcastTitle, artwork, audioUrl, duration, pubDate, isFavorite } = body;

      if (!episodeGuid) {
        return new Response(JSON.stringify({ error: 'episodeGuid required' }), { headers: corsHeaders, status: 400 });
      }

      if (isFavorite === false) {
        await db.prepare('DELETE FROM favorites WHERE user_id = ? AND episode_guid = ?').bind(userId, episodeGuid).run();
        return new Response(JSON.stringify({ success: true, removed: episodeGuid }), { headers: corsHeaders, status: 200 });
      } else {
        const id = 'fav_' + crypto.randomUUID();
        await db.prepare(
          `INSERT INTO favorites (id, user_id, episode_guid, feed_url, title, podcast_title, artwork, audio_url, duration, pub_date, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, unixepoch())
           ON CONFLICT(user_id, episode_guid) DO UPDATE SET
             feed_url = excluded.feed_url,
             title = excluded.title,
             podcast_title = excluded.podcast_title,
             artwork = excluded.artwork,
             audio_url = excluded.audio_url,
             duration = excluded.duration,
             pub_date = excluded.pub_date`
        ).bind(id, userId, episodeGuid, feedUrl || '', title || '', podcastTitle || '', artwork || '', audioUrl || '', duration || '', pubDate || '').run();

        return new Response(JSON.stringify({ success: true, episodeGuid }), { headers: corsHeaders, status: 200 });
      }
    }

    if (request.method === 'DELETE') {
      const body = await request.json();
      const { episodeGuid } = body;

      if (!episodeGuid) {
        return new Response(JSON.stringify({ error: 'episodeGuid required' }), { headers: corsHeaders, status: 400 });
      }

      await db.prepare('DELETE FROM favorites WHERE user_id = ? AND episode_guid = ?').bind(userId, episodeGuid).run();
      return new Response(JSON.stringify({ success: true, removed: episodeGuid }), { headers: corsHeaders, status: 200 });
    }

    return new Response(JSON.stringify({ error: 'Method not allowed' }), { headers: corsHeaders, status: 405 });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { headers: corsHeaders, status: 500 });
  }
}
