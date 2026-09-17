/**
 * Cloudflare Pages Function: /api/auth/send-link
 * Generates a passwordless Magic Login Token and dispatches login link
 */

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
    const rawEmail = body.email ? String(body.email).trim().toLowerCase() : '';

    if (!rawEmail || !rawEmail.includes('@')) {
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

    // Ensure user exists in D1
    let user = await db.prepare('SELECT id, email FROM users WHERE email = ?').bind(rawEmail).first();
    if (!user) {
      const userId = 'usr_' + crypto.randomUUID();
      await db.prepare('INSERT INTO users (id, email) VALUES (?, ?)').bind(userId, rawEmail).run();
      user = { id: userId, email: rawEmail };
    }

    // Generate Magic Token (expires in 15 minutes)
    const tokenBuffer = new Uint8Array(32);
    crypto.getRandomValues(tokenBuffer);
    const magicToken = Array.from(tokenBuffer).map(b => b.toString(16).padStart(2, '0')).join('');
    
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

    await db.prepare(
      'INSERT INTO auth_tokens (token, email, expires_at) VALUES (?, ?, ?)'
    ).bind(magicToken, rawEmail, expiresAt).run();

    // Construct Magic Link URL
    const host = new URL(request.url).origin;
    const magicLink = `${host}/api/auth/verify?token=${magicToken}`;

    // Dispatch Email via Resend / MailChannels if API key configured
    if (env.RESEND_API_KEY) {
      try {
        await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${env.RESEND_API_KEY}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            from: 'Podcast Pulse <login@podany.pages.dev>',
            to: [rawEmail],
            subject: '🔑 Your Magic Login Link - Podcast Pulse',
            html: `
              <div style="font-family: sans-serif; max-width: 500px; margin: 0 auto; padding: 20px; background: #0d0f17; color: #fff; border-radius: 12px;">
                <h2 style="color: #6366f1;">Podcast Pulse Magic Login</h2>
                <p>Click the button below to log in to your private podcast app:</p>
                <p style="margin: 25px 0;">
                  <a href="${magicLink}" style="background: #6366f1; color: #fff; text-decoration: none; padding: 12px 24px; border-radius: 8px; font-weight: bold; display: inline-block;">Unlock & Log In</a>
                </p>
                <p style="color: #888; font-size: 12px;">This magic link expires in 15 minutes.</p>
              </div>
            `
          })
        });
      } catch (emailErr) {
        console.warn('Resend email error:', emailErr);
      }
    }

    return new Response(JSON.stringify({
      success: true,
      message: `Magic link created for ${rawEmail}!`,
      magicLink: magicLink // Included for instant friction-free testing
    }), {
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
