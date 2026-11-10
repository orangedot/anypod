import { applyPlanChange } from '../../../workers/studio-private/index.js';
import { timingSafeEqual } from '../utils.js';

async function verifyStripeSignature(rawBody, sigHeader, secret) {
  if (!sigHeader || !secret) return false;
  const items = sigHeader.split(',').reduce((acc, part) => {
    const eqIdx = part.indexOf('=');
    if (eqIdx !== -1) {
      const k = part.slice(0, eqIdx).trim();
      const v = part.slice(eqIdx + 1).trim();
      if (k && v) acc[k] = v;
    }
    return acc;
  }, {});

  const timestamp = items.t;
  const signature = items.v1;
  if (!timestamp || !signature) return false;

  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - Number(timestamp)) > 300) {
    return false;
  }

  const payload = `${timestamp}.${rawBody}`;
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sigBuffer = await crypto.subtle.sign('HMAC', key, enc.encode(payload));
  const expectedSig = Array.from(new Uint8Array(sigBuffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');

  return timingSafeEqual(expectedSig, signature);
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const rawBody = await request.text();
  const sigHeader = request.headers.get('stripe-signature') || '';

  if (env && env.STRIPE_WEBHOOK_SECRET) {
    const valid = await verifyStripeSignature(rawBody, sigHeader, env.STRIPE_WEBHOOK_SECRET);
    if (!valid) {
      return new Response(JSON.stringify({ error: 'Invalid Stripe signature' }), { status: 400 });
    }
  }

  let event;
  try {
    event = JSON.parse(rawBody);
  } catch (err) {
    return new Response(JSON.stringify({ error: 'Invalid JSON payload' }), { status: 400 });
  }

  const type = event.type;
  const data = event.data?.object || {};

  if (type === 'checkout.session.completed') {
    const email = data.customer_email || data.customer_details?.email || data.metadata?.user_email;
    const interval = data.metadata?.interval;
    const durationDays = interval === 'year' ? 370 : 32;
    const until = Math.floor(Date.now() / 1000) + durationDays * 86400;

    if (email) {
      await applyPlanChange(env, { email, plan: 'pro', until });
    }
  } else if (type === 'invoice.payment_succeeded') {
    const email = data.customer_email || data.customer_name;
    const until = Math.floor(Date.now() / 1000) + 32 * 86400;
    if (email) {
      await applyPlanChange(env, { email, plan: 'pro', until });
    }
  } else if (type === 'customer.subscription.deleted') {
    const email = data.customer_email || data.metadata?.user_email;
    if (email) {
      await applyPlanChange(env, { email, plan: 'free', until: null });
    }
  }

  return new Response(JSON.stringify({ received: true }), { status: 200 });
}
