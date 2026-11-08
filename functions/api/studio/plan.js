import { getUserFromRequest, getCorsHeaders } from '../utils.js';
import {
  getCreatorPlan,
  getCreatorUsage,
  verifyWebhookSignature,
  applyPlanChange
} from '../../../workers/studio-private/index.js';

export async function onRequestOptions(context) {
  return new Response(null, {
    status: 204,
    headers: getCorsHeaders(context.request, 'GET, POST, OPTIONS')
  });
}

export async function onRequest(context) {
  const { request, env } = context;
  const method = request.method.toUpperCase();
  const headers = getCorsHeaders(request, 'GET, POST, OPTIONS');

  if (method === 'OPTIONS') {
    return new Response(null, { status: 204, headers });
  }

  if (!env || !env.DB) {
    return new Response(JSON.stringify({ error: 'Database unavailable' }), { status: 503, headers });
  }

  if (method === 'GET') {
    const user = await getUserFromRequest(request, env);
    if (!user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers });
    }
    const plan = await getCreatorPlan(user, env);
    const usage = await getCreatorUsage(user, env);
    const checkoutUrl = (env && env.STUDIO_PRO_CHECKOUT_URL) || 'https://polar.sh/anypod';
    return new Response(JSON.stringify({
      user: {
        id: user.id,
        email: user.email
      },
      plan,
      usage,
      checkoutUrl
    }), { status: 200, headers });
  }

  if (method === 'POST') {
    const rawBody = await request.text();
    let payload = {};
    try {
      payload = JSON.parse(rawBody || '{}');
    } catch (_) {
      return new Response(JSON.stringify({ error: 'Invalid JSON body' }), { status: 400, headers });
    }

    const signature = request.headers.get('X-Studio-Webhook-Signature') || '';
    if (signature) {
      const valid = await verifyWebhookSignature(rawBody, signature, env);
      if (!valid) {
        return new Response(JSON.stringify({ error: 'Invalid webhook signature' }), { status: 403, headers });
      }
      const changes = await applyPlanChange(env, payload);
      return new Response(JSON.stringify({ updated: changes > 0, changes }), { status: 200, headers });
    }

    const user = await getUserFromRequest(request, env);
    if (!user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers });
    }

    if (payload.action === 'activate-pro-demo' && (!env.STUDIO_WEBHOOK_SECRET || env.STUDIO_ALLOW_SELF_UPGRADE === 'true')) {
      await applyPlanChange(env, { email: user.email, plan: 'pro', until: Math.floor(Date.now() / 1000) + 365 * 86400 });
      const plan = await getCreatorPlan(user, env);
      const usage = await getCreatorUsage(user, env);
      return new Response(JSON.stringify({ upgraded: true, plan, usage }), { status: 200, headers });
    }

    return new Response(JSON.stringify({ error: 'Invalid plan action' }), { status: 400, headers });
  }

  return new Response(JSON.stringify({ error: 'Method Not Allowed' }), { status: 405, headers });
}
