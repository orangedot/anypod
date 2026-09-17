export async function hashToken(token) {
  const encoder = new TextEncoder();
  const data = encoder.encode(token);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function getUserFromRequest(request, env) {
  const cookieHeader = request.headers.get('Cookie') || '';
  let rawSessionToken = null;
  const cookiePairs = cookieHeader.split(';');
  for (const pair of cookiePairs) {
    const [k, ...v] = pair.trim().split('=');
    if (k === 'podcast_session') {
      rawSessionToken = v.join('=');
      break;
    }
  }
  if (!rawSessionToken) {
    rawSessionToken = request.headers.get('X-Session-Token');
  }
  if (!rawSessionToken || !env.DB) return null;
  const sessionHash = await hashToken(rawSessionToken);
  const now = Math.floor(Date.now() / 1000);
  const row = await env.DB.prepare(
    'SELECT u.id, u.email FROM user_sessions s JOIN users u ON s.user_id = u.id WHERE s.session_hash = ? AND s.expires_at > ?'
  ).bind(sessionHash, now).first();
  if (!row) return null;
  return { id: row.id, email: row.email };
}
