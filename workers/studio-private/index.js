import { hmacSha256, toHex, constantTimeEqual } from './signing.js';
import {
  STUDIO_PLANS,
  getCreatorPlan,
  getCreatorUsage,
  evaluateCreatorQuota,
  verifyWebhookSignature,
  applyPlanChange
} from './plans.js';

const rateLimitWindows = new Map();

export {
  STUDIO_PLANS,
  getCreatorPlan,
  getCreatorUsage,
  evaluateCreatorQuota,
  verifyWebhookSignature,
  applyPlanChange
};

export async function checkCreatorBillingQuota(user, env, requestedBytes = 0, options = {}) {
  return evaluateCreatorQuota(user, env, requestedBytes, options);
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
  return constantTimeEqual(expectedSig, signature);
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
