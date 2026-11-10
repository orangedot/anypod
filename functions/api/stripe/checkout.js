import { getUserFromRequest, getCorsHeaders } from '../utils.js';

export async function onRequest(context) {
  const { request, env } = context;
  const method = request.method.toUpperCase();
  const corsHeaders = getCorsHeaders(request, 'GET, POST, OPTIONS');

  if (method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  const url = new URL(request.url);
  const user = await getUserFromRequest(request, env);
  const appUrl = (env && env.APP_URL) || url.origin;

  if (!user) {
    if (method === 'GET') {
      return Response.redirect(`${appUrl}/studio?view=settings&auth=required`, 303);
    }
    return new Response(JSON.stringify({ error: 'Sign-in required to upgrade' }), {
      status: 401,
      headers: corsHeaders
    });
  }

  const stripeKey = env && env.STRIPE_SECRET_KEY;
  if (!stripeKey) {
    if (method === 'GET') {
      return Response.redirect(`${appUrl}/studio?view=settings&error=stripe_unconfigured`, 303);
    }
    return new Response(JSON.stringify({
      error: 'Stripe secret key unconfigured. Set STRIPE_SECRET_KEY in Cloudflare Pages environment variables.'
    }), { status: 503, headers: corsHeaders });
  }

  let interval = url.searchParams.get('interval') || 'month';
  if (method === 'POST') {
    try {
      const body = await request.json();
      if (body && body.interval) interval = body.interval;
    } catch (_) {}
  }
  const isYearly = interval === 'year' || interval === 'yearly';

  const unitAmount = isYearly ? 5000 : 500; // 50.00 EUR or 5.00 EUR
  const recurringInterval = isYearly ? 'year' : 'month';
  const planName = isYearly ? 'Anypod Studio Pro (Yearly)' : 'Anypod Studio Pro (Monthly)';

  const params = new URLSearchParams();
  params.append('mode', 'subscription');
  params.append('success_url', `${appUrl}/studio?view=settings&upgraded=true&session_id={CHECKOUT_SESSION_ID}`);
  params.append('cancel_url', `${appUrl}/studio?view=settings&canceled=true`);
  params.append('customer_email', user.email);
  params.append('client_reference_id', user.id);
  params.append('metadata[user_id]', user.id);
  params.append('metadata[user_email]', user.email);
  params.append('metadata[plan]', 'pro');
  params.append('metadata[interval]', recurringInterval);
  params.append('allow_promotion_codes', 'true');

  const priceId = isYearly ? (env.STRIPE_PRICE_ID_YEARLY || '') : (env.STRIPE_PRICE_ID_MONTHLY || '');
  if (priceId) {
    params.append('line_items[0][price]', priceId);
    params.append('line_items[0][quantity]', '1');
  } else {
    params.append('line_items[0][price_data][currency]', 'eur');
    params.append('line_items[0][price_data][unit_amount]', String(unitAmount));
    params.append('line_items[0][price_data][recurring][interval]', recurringInterval);
    params.append('line_items[0][price_data][product_data][name]', planName);
    params.append('line_items[0][price_data][product_data][description]', '10 shows, 50 GB R2 audio storage, 60 min takes, zero egress fees.');
    params.append('line_items[0][quantity]', '1');
  }

  try {
    const stripeRes = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${stripeKey}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: params.toString()
    });

    const session = await stripeRes.json();
    if (!stripeRes.ok || !session.url) {
      return new Response(JSON.stringify({ error: session.error?.message || 'Failed to create checkout session' }), {
        status: stripeRes.status || 500,
        headers: corsHeaders
      });
    }

    if (method === 'GET') {
      return Response.redirect(session.url, 303);
    }
    return new Response(JSON.stringify({ url: session.url, id: session.id }), {
      status: 200,
      headers: corsHeaders
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: corsHeaders });
  }
}
