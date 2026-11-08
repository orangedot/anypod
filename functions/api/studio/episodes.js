import { getUserFromRequest, getCorsHeaders } from '../utils.js';
import { enforceStudioRateLimit, checkCreatorBillingQuota } from '../../../workers/studio-private/index.js';

export async function onRequestOptions(context) {
  return new Response(null, {
    status: 204,
    headers: getCorsHeaders(context.request, 'GET, POST, PUT, DELETE, OPTIONS')
  });
}

export async function onRequest(context) {
  const { request, env } = context;
  const method = request.method.toUpperCase();
  const headers = getCorsHeaders(request, 'GET, POST, PUT, DELETE, OPTIONS');

  if (method === 'OPTIONS') {
    return new Response(null, { status: 204, headers });
  }

  if (!env || !env.DB) {
    return new Response(JSON.stringify({ error: 'Database unavailable' }), { status: 503, headers });
  }

  const url = new URL(request.url);

  if (method === 'GET') {
    const showId = url.searchParams.get('showId');
    const showSlug = url.searchParams.get('showSlug') || url.searchParams.get('slug');
    const episodeId = url.searchParams.get('id') || url.searchParams.get('episodeId');

    if (episodeId) {
      const ep = await env.DB.prepare('SELECT * FROM episodes WHERE id = ?').bind(episodeId).first();
      if (!ep) {
        return new Response(JSON.stringify({ error: 'Episode not found' }), { status: 404, headers });
      }
      return new Response(JSON.stringify({ episode: ep }), { status: 200, headers });
    }

    let resolvedShowId = showId;
    if (!resolvedShowId && showSlug) {
      const show = await env.DB.prepare('SELECT id FROM shows WHERE slug = ?').bind(showSlug.trim().toLowerCase()).first();
      if (!show) {
        return new Response(JSON.stringify({ error: 'Show not found' }), { status: 404, headers });
      }
      resolvedShowId = show.id;
    }

    if (!resolvedShowId) {
      return new Response(JSON.stringify({ error: 'showId or showSlug parameter is required' }), { status: 400, headers });
    }

    const rows = await env.DB.prepare(
      'SELECT * FROM episodes WHERE show_id = ? ORDER BY published_at DESC, created_at DESC'
    ).bind(resolvedShowId).all();

    return new Response(JSON.stringify({ episodes: rows?.results || [] }), { status: 200, headers });
  }

  if (method === 'POST' || method === 'PUT') {
    const user = await getUserFromRequest(request, env);
    if (!user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers });
    }

    const rateCheck = enforceStudioRateLimit(`episodes:${user.id}`, 30);
    if (!rateCheck.allowed) {
      return new Response(JSON.stringify({ error: 'Rate limit exceeded' }), { status: 429, headers });
    }

    let body = {};
    try {
      body = await request.json();
    } catch (_) {
      return new Response(JSON.stringify({ error: 'Invalid JSON body' }), { status: 400, headers });
    }

    const showId = body.show_id || body.showId;
    const showSlug = body.show_slug || body.showSlug;
    let show = null;
    if (showId) {
      show = await env.DB.prepare('SELECT * FROM shows WHERE id = ?').bind(showId).first();
    } else if (showSlug) {
      show = await env.DB.prepare('SELECT * FROM shows WHERE slug = ?').bind(String(showSlug).trim().toLowerCase()).first();
    }

    if (!show || show.owner_id !== user.id) {
      return new Response(JSON.stringify({ error: 'Show not found or unauthorized' }), { status: 403, headers });
    }

    const title = String(body.title || '').trim();
    const audioKey = String(body.audio_key || body.audioKey || '').trim();
    if (!title || !audioKey) {
      return new Response(JSON.stringify({ error: 'title and audio_key are required' }), { status: 400, headers });
    }

    const byteSize = Math.max(0, parseInt(body.audio_byte_size ?? body.audioByteSize ?? 0, 10));
    const quota = await checkCreatorBillingQuota(user, env, byteSize);
    if (!quota.allowed) {
      return new Response(JSON.stringify({ error: quota.reason || 'Quota exceeded' }), { status: 402, headers });
    }

    const id = String(body.id || crypto.randomUUID());
    const description = String(body.description || '').trim();
    const audioContentType = String(body.audio_content_type || body.audioContentType || 'audio/mpeg').trim();
    const durationSeconds = Math.max(0, Number(body.duration_seconds ?? body.durationSeconds ?? 0));
    const episodeNumber = body.episode_number ?? body.episodeNumber ?? null;
    const seasonNumber = body.season_number ?? body.seasonNumber ?? null;
    const episodeType = String(body.episode_type || body.episodeType || 'full').trim();
    const explicit = body.explicit ? 1 : 0;
    let transcriptKey = body.transcript_key || body.transcriptKey || null;
    let chaptersKey = body.chapters_key || body.chaptersKey || null;

    if (!chaptersKey && Array.isArray(body.chapters) && body.chapters.length > 0 && env.AUDIO_BUCKET) {
      const generatedChaptersKey = `${show.slug}/${id}-chapters.json`;
      const chaptersPayload = JSON.stringify({
        version: '1.2.0',
        chapters: body.chapters
      });
      await env.AUDIO_BUCKET.put(generatedChaptersKey, chaptersPayload, {
        httpMetadata: { contentType: 'application/json+chapters; charset=utf-8' }
      });
      chaptersKey = generatedChaptersKey;
    }

    if (!transcriptKey && typeof body.transcript_vtt === 'string' && body.transcript_vtt.trim() && env.AUDIO_BUCKET) {
      const generatedTranscriptKey = `${show.slug}/${id}-transcript.vtt`;
      await env.AUDIO_BUCKET.put(generatedTranscriptKey, body.transcript_vtt, {
        httpMetadata: { contentType: 'text/vtt; charset=utf-8' }
      });
      transcriptKey = generatedTranscriptKey;
    }

    let waveformPeaksJson = null;
    if (Array.isArray(body.waveform_peaks || body.waveformPeaks)) {
      waveformPeaksJson = JSON.stringify(body.waveform_peaks || body.waveformPeaks);
    } else if (typeof body.waveform_peaks_json === 'string') {
      waveformPeaksJson = body.waveform_peaks_json;
    }

    const now = Math.floor(Date.now() / 1000);
    const publishedAt = body.published_at !== undefined
      ? (body.published_at === null ? null : Number(body.published_at))
      : now;

    await env.DB.prepare(
      `INSERT INTO episodes (
        id, show_id, title, description, audio_key, audio_content_type, audio_byte_size,
        duration_seconds, episode_number, season_number, episode_type, explicit,
        transcript_key, chapters_key, waveform_peaks_json, published_at, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        title = excluded.title,
        description = excluded.description,
        audio_key = excluded.audio_key,
        audio_content_type = excluded.audio_content_type,
        audio_byte_size = excluded.audio_byte_size,
        duration_seconds = excluded.duration_seconds,
        episode_number = excluded.episode_number,
        season_number = excluded.season_number,
        episode_type = excluded.episode_type,
        explicit = excluded.explicit,
        transcript_key = excluded.transcript_key,
        chapters_key = excluded.chapters_key,
        waveform_peaks_json = excluded.waveform_peaks_json,
        published_at = excluded.published_at`
    ).bind(
      id,
      show.id,
      title,
      description,
      audioKey,
      audioContentType,
      byteSize,
      durationSeconds,
      episodeNumber !== null ? parseInt(episodeNumber, 10) : null,
      seasonNumber !== null ? parseInt(seasonNumber, 10) : null,
      episodeType,
      explicit,
      transcriptKey,
      chaptersKey,
      waveformPeaksJson,
      publishedAt,
      now
    ).run();

    const saved = await env.DB.prepare('SELECT * FROM episodes WHERE id = ?').bind(id).first();
    return new Response(JSON.stringify({ episode: saved }), { status: 201, headers });
  }

  return new Response(JSON.stringify({ error: 'Method Not Allowed' }), { status: 405, headers });
}
