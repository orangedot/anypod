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
      const newUserId = `usr_${crypto.randomUUID()}`;
      await db.prepare('INSERT INTO users (id, email) VALUES (?, ?)').bind(newUserId, email).run();
      user = { id: newUserId, email };
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
      return new Response(JSON.stringify({ 
        success: true, 
        devNotice: 'No RESEND_API_KEY configured. Click link below to sign in locally:',
        verifyUrl 
      }), {
        headers: corsHeaders,
        status: 200
      });
    }

    const emailHtml = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #090a0f; color: #f8fafc; padding: 40px 20px;">
  <div style="max-width: 480px; margin: 0 auto; background: #141721; border: 1px solid #2e354f; border-radius: 16px; padding: 32px; text-align: center;">
    <h1 style="color: #ffffff; font-size: 22px; margin-bottom: 12px; font-weight: 700;">Sign in to Podany</h1>
    <p style="color: #94a3b8; font-size: 15px; line-height: 1.5; margin-bottom: 28px;">Click the button below to complete your sign in. This magic link is valid for 15 minutes.</p>
    <a href="${verifyUrl}" style="display: inline-block; background: #f97316; color: #ffffff; font-weight: 600; font-size: 15px; padding: 14px 28px; border-radius: 9999px; text-decoration: none;">Sign In to Podany</a>
    <p style="color: #64748b; font-size: 12px; margin-top: 32px; word-break: break-all;">Link not working? Paste this URL into your browser:<br><a href="${verifyUrl}" style="color: #f97316;">${verifyUrl}</a></p>
  </div>
</body>
</html>`;

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
        html: emailHtml
      })
    });

    if (!resendRes.ok) {
      const errText = await resendRes.text();
      let isSandboxRestriction = false;
      try {
        const parsed = JSON.parse(errText);
        if (
          parsed.statusCode === 403 ||
          parsed.statusCode === 422 ||
          (parsed.message && (
            parsed.message.includes('You can only send testing emails') ||
            parsed.message.includes('testing email address')
          )) ||
          fromEmail.includes('resend.dev')
        ) {
          isSandboxRestriction = true;
        }
      } catch (e) {
        if (fromEmail.includes('resend.dev')) {
          isSandboxRestriction = true;
        }
      }

      if (isSandboxRestriction) {
        return new Response(JSON.stringify({ 
          success: true, 
          sandboxNotice: 'Resend Sandbox Mode (Only delivered to account owner):',
          verifyUrl 
        }), {
          headers: corsHeaders,
          status: 200
        });
      }

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
