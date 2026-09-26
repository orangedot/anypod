export async function hashToken(token) {
  const encoder = new TextEncoder();
  const data = encoder.encode(token);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function getUserFromRequest(request, env) {
  if (!env || !env.DB) return null;

  const candidateTokens = [];

  // 1. Header token (from client localStorage)
  const headerToken = request.headers.get('X-Session-Token');
  if (headerToken && typeof headerToken === 'string') {
    const trimmed = headerToken.trim();
    if (trimmed) candidateTokens.push(trimmed);
  }

  // 2. Cookie token(s)
  const cookieHeader = request.headers.get('Cookie') || '';
  if (cookieHeader) {
    const cookiePairs = cookieHeader.split(';');
    for (const pair of cookiePairs) {
      const [k, ...v] = pair.trim().split('=');
      if (k === 'podcast_session') {
        const val = v.join('=').trim();
        if (val && !candidateTokens.includes(val)) {
          candidateTokens.push(val);
        }
      }
    }
  }

  // 3. Authorization Bearer header fallback
  const authHeader = request.headers.get('Authorization') || '';
  if (authHeader.startsWith('Bearer ')) {
    const bToken = authHeader.slice(7).trim();
    if (bToken && !candidateTokens.includes(bToken)) {
      candidateTokens.push(bToken);
    }
  }

  if (candidateTokens.length === 0) return null;

  const now = Math.floor(Date.now() / 1000);
  for (const token of candidateTokens) {
    try {
      const sessionHash = await hashToken(token);
      const row = await env.DB.prepare(
        'SELECT u.id, u.email, s.session_hash FROM user_sessions s JOIN users u ON s.user_id = u.id WHERE s.session_hash = ? AND s.expires_at > ?'
      ).bind(sessionHash, now).first();
      if (row && row.session_hash && timingSafeEqual(row.session_hash, sessionHash)) {
        return { id: row.id, email: row.email };
      }
    } catch (_) {
      // Continue trying next candidate token
    }
  }
  return null;
}

export function timingSafeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const encoder = new TextEncoder();
  const aBuf = encoder.encode(a);
  const bBuf = encoder.encode(b);
  if (aBuf.byteLength !== bBuf.byteLength) return false;
  return crypto.subtle.timingSafeEqual(aBuf, bBuf);
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
      // Disallow octal notation / leading zeros in octets (e.g. 0177.0.0.1)
      if ([ipv4Match[1], ipv4Match[2], ipv4Match[3], ipv4Match[4]].some(s => s.length > 1 && s.startsWith('0'))) {
        return false;
      }
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

