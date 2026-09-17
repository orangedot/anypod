/**
 * Cloudflare Pages Function: /api/auth/verify
 * Validates Magic Token, creates 30-day user session, and redirects to app
 */

export async function onRequest(context) {
  const { request, env } = context;
  const urlParams = new URL(request.url).searchParams;
  const token = urlParams.get('token');

  if (!token) {
    return new Response('Missing magic link token.', { status: 400 });
  }

  const db = env.DB;
  if (!db) {
    return new Response('Database error', { status: 500 });
  }

  try {
    // Query magic token
    const record = await db.prepare(
      'SELECT token, email, expires_at, used FROM auth_tokens WHERE token = ?'
    ).bind(token).first();

    if (!record || record.used === 1) {
      return new Response('Invalid or already used magic link.', { status: 400 });
    }

    if (new Date(record.expires_at) < new Date()) {
      return new Response('Magic link has expired. Please request a new one.', { status: 400 });
    }

    // Mark token as used
    await db.prepare('UPDATE auth_tokens SET used = 1 WHERE token = ?').bind(token).run();

    // Get user
    const user = await db.prepare('SELECT id FROM users WHERE email = ?').bind(record.email).first();
    if (!user) {
      return new Response('User record not found.', { status: 404 });
    }

    // Create 30-day session token
    const sessionBuffer = new Uint8Array(32);
    crypto.getRandomValues(sessionBuffer);
    const sessionToken = Array.from(sessionBuffer).map(b => b.toString(16).padStart(2, '0')).join('');
    const sessionExpires = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

    await db.prepare(
      'INSERT INTO user_sessions (session_token, user_id, email, expires_at) VALUES (?, ?, ?, ?)'
    ).bind(sessionToken, user.id, record.email, sessionExpires).run();

    // Redirect to frontend with session parameter & set HTTP-only cookie
    const origin = new URL(request.url).origin;
    const redirectUrl = `${origin}/?session=${sessionToken}`;

    return new Response(null, {
      status: 302,
      headers: {
        'Location': redirectUrl,
        'Set-Cookie': `podcast_session=${sessionToken}; Path=/; Max-Age=${30 * 24 * 3600}; SameSite=Lax; Secure`
      }
    });

  } catch (err) {
    return new Response(`Authentication Error: ${err.message}`, { status: 500 });
  }
}
