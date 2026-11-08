import { hmacSha256, toHex, constantTimeEqual } from './signing.js';

const MB = 1024 * 1024;
const GB = 1024 * MB;

export const STUDIO_PLANS = {
  free: {
    id: 'free',
    label: 'Free',
    maxShows: 1,
    maxStorageBytes: 500 * MB,
    maxUploadBytes: 100 * MB,
    maxRecordingSeconds: 1800
  },
  pro: {
    id: 'pro',
    label: 'Pro',
    maxShows: 10,
    maxStorageBytes: 50 * GB,
    maxUploadBytes: 100 * MB,
    maxRecordingSeconds: 3600
  }
};

export function plansDisabled(env) {
  return !!env && env.STUDIO_PLANS_DISABLED === 'true';
}

export function formatBytes(bytes) {
  const value = Number(bytes || 0);
  if (value >= GB) return (value / GB).toFixed(1) + ' GB';
  return Math.round(value / MB) + ' MB';
}

export async function getCreatorPlan(user, env) {
  let row = null;
  if (env && env.DB && user && user.id) {
    try {
      row = await env.DB.prepare('SELECT studio_plan, studio_plan_until FROM users WHERE id = ?').bind(user.id).first();
    } catch (_) {
      row = null;
    }
  }
  const now = Math.floor(Date.now() / 1000);
  const until = row && row.studio_plan_until ? Number(row.studio_plan_until) : null;
  const active = !!row && row.studio_plan === 'pro' && (!until || until > now);
  const plan = { ...(active ? STUDIO_PLANS.pro : STUDIO_PLANS.free) };
  if (!active && env && env.STUDIO_FREE_QUOTA_BYTES) {
    plan.maxStorageBytes = Number(env.STUDIO_FREE_QUOTA_BYTES) || plan.maxStorageBytes;
  }
  plan.until = active ? until : null;
  return plan;
}

export async function getCreatorUsage(user, env) {
  const row = await env.DB.prepare(
    'SELECT COUNT(DISTINCT s.id) AS shows, COUNT(e.id) AS episodes, COALESCE(SUM(e.audio_byte_size), 0) AS bytes FROM shows s LEFT JOIN episodes e ON e.show_id = s.id WHERE s.owner_id = ?'
  ).bind(user.id).first();
  return {
    shows: Number((row && row.shows) || 0),
    episodes: Number((row && row.episodes) || 0),
    bytes: Number((row && row.bytes) || 0)
  };
}

export async function evaluateCreatorQuota(user, env, requestedBytes, options) {
  if (!user || !user.id) {
    return { allowed: false, tier: 'anonymous', code: 'auth_required', reason: 'Authentication required' };
  }
  if (plansDisabled(env) || !env || !env.DB) {
    return { allowed: true, tier: 'open-core', usedBytes: 0, maxBytes: Number.MAX_SAFE_INTEGER };
  }
  const plan = await getCreatorPlan(user, env);
  const usage = await getCreatorUsage(user, env);
  const base = { tier: plan.id, plan: plan.id, usedBytes: usage.bytes, maxBytes: plan.maxStorageBytes };
  const upgradeHint = plan.id === 'free' ? ' Upgrade to Pro for more.' : '';

  if (options && options.newShow && usage.shows >= plan.maxShows) {
    return {
      ...base,
      allowed: false,
      code: 'show_limit',
      reason: `The ${plan.label} plan includes ${plan.maxShows} show${plan.maxShows === 1 ? '' : 's'}.${upgradeHint}`
    };
  }
  if (requestedBytes > plan.maxUploadBytes) {
    return {
      ...base,
      allowed: false,
      code: 'upload_too_large',
      reason: `Files over ${formatBytes(plan.maxUploadBytes)} are not supported. Export as MP3 to reduce the size.`
    };
  }
  if (usage.bytes + requestedBytes > plan.maxStorageBytes) {
    return {
      ...base,
      allowed: false,
      code: 'storage_limit',
      reason: `Storage limit reached on the ${plan.label} plan (${formatBytes(usage.bytes)} of ${formatBytes(plan.maxStorageBytes)}).${upgradeHint}`
    };
  }
  return { ...base, allowed: true };
}

export async function verifyWebhookSignature(rawBody, signatureHex, env) {
  if (!env || !env.STUDIO_WEBHOOK_SECRET || !signatureHex) return false;
  const expected = toHex(await hmacSha256(env.STUDIO_WEBHOOK_SECRET, rawBody));
  return constantTimeEqual(expected, String(signatureHex).trim().toLowerCase());
}

export async function applyPlanChange(env, change) {
  const email = String((change && change.email) || '').trim().toLowerCase();
  const plan = change && change.plan === 'pro' ? 'pro' : 'free';
  const until = change && change.until ? Math.floor(Number(change.until)) : null;
  if (!email) return 0;
  const result = await env.DB.prepare(
    'UPDATE users SET studio_plan = ?, studio_plan_until = ? WHERE lower(email) = ?'
  ).bind(plan, plan === 'pro' ? until : null, email).run();
  return Number((result && result.meta && result.meta.changes) || 0);
}
