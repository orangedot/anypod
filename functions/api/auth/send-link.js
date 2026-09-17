import { hashToken } from '../utils.js';

export async function onRequest(context) {
  const { request, env } = context;

  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json; charset=utf-8'
  };

  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders, status: 204 });
  }

  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      headers: corsHeaders,
      status: 405
    });
  }

  try {
    const body = await request.json();
    const email = body.email ? String(body.email).trim().toLowerCase() : '';

    if (!email || !email.includes('@')) {
      return new Response(JSON.stringify({ error: 'Valid email address required.' }), {
        headers: corsHeaders,
        status: 400
      });
    }

    const db = env.DB;
    if (!db) {
      return new Response(JSON.stringify({ error: 'Database binding unconfigured' }), {
        headers: corsHeaders,
        status: 500
      });
    }

    let user = await db.prepare('SELECT id, email FROM users WHERE email = ?').bind(email).first();
    if (!user) {
      return new Response(JSON.stringify({ success: true }), {
        headers: corsHeaders,
        status: 200
      });
    }

    const tokenBuffer = new Uint8Array(32);
    crypto.getRandomValues(tokenBuffer);
    const rawToken = Array.from(tokenBuffer).map(b => b.toString(16).padStart(2, '0')).join('');
    const tokenHash = await hashToken(rawToken);

    const expiresAt = Math.floor(Date.now() / 1000) + 15 * 60;

    await db.prepare(
      'INSERT INTO auth_tokens (token_hash, user_id, expires_at, used) VALUES (?, ?, ?, 0)'
    ).bind(tokenHash, user.id, expiresAt).run();

    const appUrl = (env.APP_URL || new URL(request.url).origin).replace(/\/$/, '');
    const fromEmail = env.FROM_EMAIL || 'onboarding@resend.dev';
    const verifyUrl = `${appUrl}/auth/verify?token=${rawToken}`;

    const resendKey = env.RESEND_API_KEY;
    if (!resendKey) {
      throw new Error('RESEND_API_KEY environment variable is not configured');
    }

    const resendRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${resendKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: fromEmail,
        to: [email],
        subject: 'Podany Magic Login Link',
        html: `<p>Click the link below to sign in:</p><p><a href="${verifyUrl}">${verifyUrl}</a></p>`
      })
    });

    if (!resendRes.ok) {
      const errText = await resendRes.text();
      throw new Error(`Resend email delivery failed (${resendRes.status}): ${errText}`);
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: corsHeaders,
      status: 200
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      headers: corsHeaders,
      status: 500
    });
  }
}
