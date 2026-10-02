/**
 * /api/transcribe  —  Cloudflare Pages Function
 *
 * Accepts a raw audio blob (webm/opus or mp4/aac, typically 5–10 s)
 * from the client MediaRecorder, runs it through @cf/openai/whisper,
 * and returns { text, segments }.
 *
 * Binding required in wrangler.json:
 *   "ai": { "binding": "AI" }
 *
 * Client sends:
 *   POST /api/transcribe
 *   Content-Type: audio/webm  (or audio/mp4)
 *   X-Session-Token: <token>     (optional auth)
 *   X-Episode-Lang: en           (optional BCP-47 hint)
 *   body: raw audio blob
 */

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Session-Token, X-Episode-Lang'
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' }
  });
}

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS });
  }

  if (request.method !== 'POST') {
    return json({ error: 'POST only' }, 405);
  }

  // Check AI binding is available
  if (!env.AI) {
    return json({ error: 'AI binding not configured. Add "ai": {"binding":"AI"} to wrangler.json' }, 503);
  }

  // Read audio body
  let audioBuffer;
  try {
    audioBuffer = await request.arrayBuffer();
  } catch (e) {
    return json({ error: 'Failed to read audio body: ' + e.message }, 400);
  }

  if (!audioBuffer || audioBuffer.byteLength < 1000) {
    return json({ error: 'Audio too short or empty', byteLength: audioBuffer?.byteLength }, 400);
  }

  // Optional language hint from client
  const lang = request.headers.get('X-Episode-Lang') || 'en';

  try {
    // @cf/openai/whisper expects a Uint8Array / ArrayBuffer
    const result = await env.AI.run('@cf/openai/whisper', {
      audio: [...new Uint8Array(audioBuffer)],  // CF AI SDK wants plain array
    });

    // result = { text: string, segments?: [{start,end,text}...] }
    return json({
      text: result.text || '',
      segments: result.segments || [],
      byteLength: audioBuffer.byteLength
    });

  } catch (e) {
    console.error('[transcribe] Whisper error:', e);
    return json({ error: e.message || 'Whisper failed' }, 500);
  }
}
