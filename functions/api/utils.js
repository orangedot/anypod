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

export function isValidExternalUrl(urlString) {
  try {
    const parsed = new URL(urlString);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return false;
    }
    const host = parsed.hostname.toLowerCase();
    if (!host || host === 'localhost' || host.endsWith('.local') || host.endsWith('.internal') || host.endsWith('.lan')) {
      return false;
    }
    if (host === 'metadata.google.internal' || host === 'metadata' || host === 'instance-data') {
      return false;
    }
    if (/^0x[0-9a-f]+$/i.test(host) || /^\d+$/.test(host)) {
      return false;
    }
    const ipv4Match = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
    if (ipv4Match) {
      const octets = [Number(ipv4Match[1]), Number(ipv4Match[2]), Number(ipv4Match[3]), Number(ipv4Match[4])];
      if (octets.some(o => o < 0 || o > 255)) return false;
      if (octets[0] === 127 || octets[0] === 0 || octets[0] === 10) return false;
      if (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) return false;
      if (octets[0] === 192 && octets[1] === 168) return false;
      if (octets[0] === 169 && octets[1] === 254) return false;
      if (octets[0] === 100 && octets[1] >= 64 && octets[1] <= 127) return false;
    }
    if (host.startsWith('[') && host.endsWith(']')) {
      const ipv6 = host.slice(1, -1).toLowerCase();
      if (ipv6 === '::1' || ipv6 === '::' || ipv6.startsWith('fe80:') || ipv6.startsWith('fc') || ipv6.startsWith('fd')) {
        return false;
      }
    }
    return true;
  } catch (e) {
    return false;
  }
}

