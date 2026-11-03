import { getUserFromRequest, getCorsHeaders } from '../utils.js';

export async function onRequest(context) {
  const { request, env } = context;
  const corsHeaders = getCorsHeaders(request, 'GET, POST, OPTIONS');

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

  try {
    if (request.method === 'GET') {
      const url = new URL(request.url);
      const sinceParam = url.searchParams.get('since');
      const since = sinceParam ? parseInt(sinceParam, 10) : 0;

      let stmt;
      if (since > 0) {
        stmt = db.prepare(
          'SELECT episode_guid, position_seconds, completed, last_listened_at FROM playback_state WHERE user_id = ? AND last_listened_at > ?'
        ).bind(userId, since);
      } else {
        stmt = db.prepare(
          'SELECT episode_guid, position_seconds, completed, last_listened_at FROM playback_state WHERE user_id = ?'
        ).bind(userId);
      }

      const rows = await stmt.all();

      const positions = {};
      (rows.results || []).forEach(r => {
        positions[r.episode_guid] = {
          position: r.position_seconds,
          completed: r.completed === 1,
          lastListenedAt: r.last_listened_at
        };
      });

      const serverTime = Math.floor(Date.now() / 1000);
      return new Response(JSON.stringify({ positions, serverTime }), { headers: corsHeaders, status: 200 });
    }

    if (request.method === 'POST') {
      const body = await request.json();

      // Support batched position updates: { updates: [{ episodeGuid, positionSeconds, completed }, ...] }
      if (Array.isArray(body.updates) && body.updates.length > 0) {
        const stmts = [];
        for (const item of body.updates.slice(0, 100)) {
          if (!item || !item.episodeGuid) continue;
          const id = 'pos_' + crypto.randomUUID();
          const isCompleted = item.completed ? 1 : 0;
          const posSec = typeof item.positionSeconds === 'number' ? item.positionSeconds : 0;
          stmts.push(
            db.prepare(
              `INSERT INTO playback_state (id, user_id, episode_guid, position_seconds, completed, last_listened_at)
               VALUES (?, ?, ?, ?, ?, unixepoch())
               ON CONFLICT(user_id, episode_guid) DO UPDATE SET
                 position_seconds = excluded.position_seconds,
                 completed = excluded.completed,
                 last_listened_at = unixepoch()`
            ).bind(id, userId, item.episodeGuid, posSec, isCompleted)
          );
        }
        if (stmts.length > 0) {
          await db.batch(stmts);
        }
        return new Response(JSON.stringify({ success: true, batched: stmts.length }), { headers: corsHeaders, status: 200 });
      }

      const { episodeGuid, positionSeconds, completed } = body;

      if (!episodeGuid) {
        return new Response(JSON.stringify({ error: 'episodeGuid required' }), { headers: corsHeaders, status: 400 });
      }

      const id = 'pos_' + crypto.randomUUID();
      const isCompleted = completed ? 1 : 0;
      const posSec = typeof positionSeconds === 'number' ? positionSeconds : 0;

      await db.prepare(
        `INSERT INTO playback_state (id, user_id, episode_guid, position_seconds, completed, last_listened_at)
         VALUES (?, ?, ?, ?, ?, unixepoch())
         ON CONFLICT(user_id, episode_guid) DO UPDATE SET
           position_seconds = excluded.position_seconds,
           completed = excluded.completed,
           last_listened_at = unixepoch()`
      ).bind(id, userId, episodeGuid, posSec, isCompleted).run();

      return new Response(JSON.stringify({ success: true, episodeGuid, positionSeconds: posSec }), { headers: corsHeaders, status: 200 });
    }

    return new Response(JSON.stringify({ error: 'Method not allowed' }), { headers: corsHeaders, status: 405 });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { headers: corsHeaders, status: 500 });
  }
}
