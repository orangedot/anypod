const rateLimitWindows = new Map();

async function hmacSha256(keyData, message) {
  const encoder = new TextEncoder();
  const rawKey = typeof keyData === 'string' ? encoder.encode(keyData) : keyData;
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    rawKey,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(message));
  return new Uint8Array(sig);
}

function toHex(bytes) {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function checkCreatorBillingQuota(user, env, requestedBytes = 0) {
  if (!user || !user.id) {
    return { allowed: false, tier: 'anonymous', reason: 'Authentication required' };
  }
  if (env && env.STUDIO_BILLING_ENFORCED === 'true' && env.DB) {
    const usageRow = await env.DB.prepare(
      'SELECT COALESCE(SUM(e.audio_byte_size), 0) AS total_bytes, COUNT(e.id) AS episode_count FROM episodes e JOIN shows s ON e.show_id = s.id WHERE s.owner_id = ?'
    ).bind(user.id).first();
    const usedBytes = Number(usageRow?.total_bytes || 0);
    const maxFreeBytes = Number(env.STUDIO_FREE_QUOTA_BYTES || 5 * 1024 * 1024 * 1024);
    if (usedBytes + requestedBytes > maxFreeBytes) {
      return {
        allowed: false,
        tier: 'starter',
        usedBytes,
        maxBytes: maxFreeBytes,
        reason: 'Storage quota exceeded for current plan'
      };
    }
    return {
      allowed: true,
      tier: 'creator',
      usedBytes,
      maxBytes: maxFreeBytes
    };
  }
  return {
    allowed: true,
    tier: 'open-core',
    usedBytes: 0,
    maxBytes: Number.MAX_SAFE_INTEGER
  };
}

export function enforceStudioRateLimit(clientKey, limitPerMinute = 30) {
  const now = Date.now();
  const windowMs = 60000;
  const bucketKey = String(clientKey || 'anon');
  const record = rateLimitWindows.get(bucketKey);

  if (!record || now - record.windowStart >= windowMs) {
    rateLimitWindows.set(bucketKey, { windowStart: now, count: 1 });
    return { allowed: true, remaining: limitPerMinute - 1, resetAt: now + windowMs };
  }

  if (record.count >= limitPerMinute) {
    return { allowed: false, remaining: 0, resetAt: record.windowStart + windowMs };
  }

  record.count += 1;
  return { allowed: true, remaining: limitPerMinute - record.count, resetAt: record.windowStart + windowMs };
}

export async function createSignedUploadTicket({ showSlug, objectKey, contentType, byteSize, userId, expiresInSeconds = 3600 }, env) {
  const secret = (env && env.STUDIO_UPLOAD_SECRET) || (env && env.SESSION_SECRET) || 'anypod-studio-open-core-default-key';
  const expiresAt = Math.floor(Date.now() / 1000) + expiresInSeconds;
  const payload = `${showSlug}:${objectKey}:${contentType}:${byteSize}:${userId}:${expiresAt}`;
  const sigBytes = await hmacSha256(secret, payload);
  const signature = toHex(sigBytes);
  const baseUrl = (env && env.APP_URL) || 'https://anypod.org';
  const uploadUrl = `${baseUrl}/api/studio/upload?key=${encodeURIComponent(objectKey)}&slug=${encodeURIComponent(showSlug)}&type=${encodeURIComponent(contentType)}&size=${encodeURIComponent(byteSize)}&uid=${encodeURIComponent(userId)}&exp=${expiresAt}&sig=${signature}`;

  return {
    objectKey,
    uploadUrl,
    expiresAt,
    signature,
    headers: {
      'Content-Type': contentType
    }
  };
}

export async function verifySignedUploadTicket({ showSlug, objectKey, contentType, byteSize, userId, expiresAt, signature }, env) {
  if (!showSlug || !objectKey || !userId || !expiresAt || !signature) {
    return false;
  }
  const now = Math.floor(Date.now() / 1000);
  if (Number(expiresAt) < now) {
    return false;
  }
  const secret = (env && env.STUDIO_UPLOAD_SECRET) || (env && env.SESSION_SECRET) || 'anypod-studio-open-core-default-key';
  const payload = `${showSlug}:${objectKey}:${contentType}:${byteSize}:${userId}:${expiresAt}`;
  const sigBytes = await hmacSha256(secret, payload);
  const expectedSig = toHex(sigBytes);
  if (expectedSig.length !== signature.length) return false;
  const enc = new TextEncoder();
  const a = enc.encode(expectedSig);
  const b = enc.encode(signature);
  if (typeof crypto.subtle.timingSafeEqual === 'function') {
    return crypto.subtle.timingSafeEqual(a, b);
  }
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a[i] ^ b[i];
  }
  return diff === 0;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/health') {
      return new Response(JSON.stringify({ status: 'ok', service: 'anypod-studio-private' }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }
    return new Response(JSON.stringify({ error: 'Not Found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
