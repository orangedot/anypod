import { hashToken } from '../utils.js';

async function ensureCleanerColumns(db) {
  try {
    await db.prepare('ALTER TABLE users ADD COLUMN last_active_at INTEGER').run();
  } catch (e) {}
  try {
    await db.prepare('ALTER TABLE users ADD COLUMN warned_30d_at INTEGER').run();
  } catch (e) {}
  try {
    await db.prepare('ALTER TABLE users ADD COLUMN warned_50d_at INTEGER').run();
  } catch (e) {}
  try {
    await db.prepare("ALTER TABLE users ADD COLUMN listener_plan TEXT DEFAULT 'free'").run();
  } catch (e) {}
  try {
    await db.prepare("ALTER TABLE users ADD COLUMN listener_plan_until INTEGER").run();
  } catch (e) {}
  try {
    await db.prepare("UPDATE users SET listener_plan = 'pro' WHERE lower(replace(email, '.', '')) = 'steffenklaue@gmailcom' OR lower(email) LIKE '%steffen%klaue%'").run();
  } catch (e) {}
}

async function createMagicActionToken(db, userId, purpose = 'keep_active') {
  const tokenBuffer = new Uint8Array(32);
  crypto.getRandomValues(tokenBuffer);
  const rawToken = Array.from(tokenBuffer).map(b => b.toString(16).padStart(2, '0')).join('');
  const tokenHash = await hashToken(rawToken);
  // Token valid for 14 days
  const expiresAt = Math.floor(Date.now() / 1000) + 14 * 86400;

  await db.prepare(
    'INSERT INTO auth_tokens (token_hash, user_id, expires_at, used) VALUES (?, ?, ?, 0)'
  ).bind(tokenHash, userId, expiresAt).run();

  return rawToken;
}

function buildCleanerEmailHtml({ email, appUrl, verifyUrl, opmlUrl, isFinalNotice = false }) {
  const title = isFinalNotice ? 'Final Notice: Account Deletion in 10 Days' : 'Anypod Cleaner Monday: Inactive Account Check';
  const subtitle = isFinalNotice 
    ? 'Your Anypod account and cloud sync data are scheduled for permanent deletion in <strong>10 days</strong> due to 80 days of inactivity.'
    : 'You haven\'t used your Anypod cloud sync in the last <strong>60 days</strong>. To protect your privacy and keep our servers lean, we automatically wipe inactive accounts after 90 days.';

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0c0a09; color: #f5f5f4; padding: 40px 20px;">
  <div style="max-width: 500px; margin: 0 auto; background: #1c1917; border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 14px; padding: 36px 28px; text-align: center;">
    <div style="display: inline-block; width: 44px; height: 44px; background: rgba(216, 205, 190, 0.12); border-radius: 50%; line-height: 44px; font-size: 20px; margin-bottom: 18px;">
      ${isFinalNotice ? '⚠️' : '🧹'}
    </div>
    <h1 style="color: #ffffff; font-size: 20px; margin-bottom: 12px; font-weight: 700; letter-spacing: -0.01em;">${title}</h1>
    <p style="color: #a8a29e; font-size: 14px; line-height: 1.6; margin-bottom: 24px;">
      ${subtitle}
    </p>

    <div style="background: rgba(255, 255, 255, 0.03); border: 1px solid rgba(255, 255, 255, 0.06); border-radius: 10px; padding: 18px; margin-bottom: 26px; text-align: left;">
      <p style="color: #e7e5e4; font-size: 13px; font-weight: 600; margin: 0 0 8px 0;">What would you like to do?</p>
      <ul style="color: #a8a29e; font-size: 13px; line-height: 1.5; margin: 0; padding-left: 20px;">
        <li style="margin-bottom: 6px;"><strong>Keep Account:</strong> Tap the button below to confirm you still use Anypod.</li>
        <li style="margin-bottom: 6px;"><strong>Export Feeds:</strong> Download your podcast library as a standard OPML file.</li>
        <li><strong>Let it expire:</strong> Do nothing, and your data will be permanently wiped with zero traces left.</li>
      </ul>
    </div>

    <div style="display: flex; flex-direction: column; gap: 10px; margin-bottom: 24px;">
      <a href="${verifyUrl}" style="display: block; background: #d8cdbe; color: #141414; font-weight: 600; font-size: 14px; padding: 12px 24px; border-radius: 8px; text-decoration: none; text-align: center;">
        Keep My Account Active
      </a>
      <a href="${verifyUrl}&export=opml" style="display: block; background: rgba(255, 255, 255, 0.06); color: #f5f5f4; font-weight: 500; font-size: 13px; padding: 10px 20px; border-radius: 8px; text-decoration: none; text-align: center; border: 1px solid rgba(255, 255, 255, 0.1);">
        Sign In &amp; Export Feeds (OPML)
      </a>
    </div>

    <p style="color: #78716c; font-size: 11px; line-height: 1.4; margin: 0; border-top: 1px solid rgba(255, 255, 255, 0.06); padding-top: 20px;">
      Anypod believes in Privacy by Default &amp; Storage Limitation (GDPR Art. 5). We do not keep inactive data indefinitely.
    </p>
  </div>
</body>
</html>`;
}

export async function onRequest(context) {
  const { request, env } = context;

  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Cron-Secret',
    'Content-Type': 'application/json; charset=utf-8'
  };

  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders, status: 204 });
  }

  const url = new URL(request.url);
  const secretParam = url.searchParams.get('secret') || url.searchParams.get('key');
  const authHeader = request.headers.get('Authorization') || request.headers.get('X-Cron-Secret') || '';
  const bearerToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : authHeader.trim();

  // If CRON_SECRET is defined in env, enforce it
  if (env.CRON_SECRET) {
    const provided = secretParam || bearerToken;
    if (provided !== env.CRON_SECRET) {
      return new Response(JSON.stringify({ error: 'Unauthorized: Invalid cron secret' }), {
        headers: corsHeaders,
        status: 401
      });
    }
  }

  const db = env.DB;
  if (!db) {
    return new Response(JSON.stringify({ error: 'Database binding unconfigured' }), {
      headers: corsHeaders,
      status: 500
    });
  }

  await ensureCleanerColumns(db);

  const resendKey = env.RESEND_API_KEY;
  const fromEmail = env.FROM_EMAIL || 'Anypod Cleaner <login@anypod.org>';
  const appUrl = (env.APP_URL || 'https://anypod.org').replace(/\/$/, '');

  const isDryRun = url.searchParams.get('dryRun') === 'true' || (!url.searchParams.get('run') && !url.searchParams.get('testEmail'));
  const testEmail = url.searchParams.get('testEmail');

  // TEST EMAIL PIPELINE: Send a sample email to a specific address immediately
  if (testEmail) {
    const isFinal = url.searchParams.get('type') === 'final' || url.searchParams.get('type') === '50d';
    const sampleToken = 'test_' + Array.from(crypto.getRandomValues(new Uint8Array(16))).map(b => b.toString(16).padStart(2, '0')).join('');
    const verifyUrl = `${appUrl}/auth/verify/?token=${sampleToken}`;
    const subject = isFinal ? '[Test] Final Notice: Anypod Account Deletion in 10 Days' : '[Test] Anypod Cleaner Monday: Inactive Account Check';

    const emailHtml = buildCleanerEmailHtml({
      email: testEmail,
      appUrl,
      verifyUrl,
      isFinalNotice: isFinal
    });

    if (!resendKey) {
      return new Response(JSON.stringify({ 
        success: true, 
        devNotice: 'RESEND_API_KEY is not configured on this environment (offline dev mode). Email preview and test link generated.',
        testEmail,
        subject,
        verifyUrl,
        htmlPreview: emailHtml
      }, null, 2), {
        headers: corsHeaders,
        status: 200
      });
    }

    const resendRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${resendKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: fromEmail,
        to: [testEmail],
        subject,
        html: emailHtml
      })
    });

    const resText = await resendRes.text();
    if (!resendRes.ok) {
      return new Response(JSON.stringify({ 
        success: false, 
        error: `Resend test delivery failed (${resendRes.status}): ${resText}` 
      }), {
        headers: corsHeaders,
        status: 502
      });
    }

    return new Response(JSON.stringify({ 
      success: true, 
      message: `Test Cleaner email (${isFinal ? '50-day final notice' : '30-day notice'}) sent successfully to ${testEmail}`,
      resendResponse: resText,
      verifyUrl
    }, null, 2), {
      headers: corsHeaders,
      status: 200
    });
  }

  // BATCH PIPELINE: Scan all users for 60d warnings, 80d warnings, and 90d deletions
  const now = Math.floor(Date.now() / 1000);
  const SIXTY_DAYS_SEC = 60 * 86400;
  const EIGHTY_DAYS_SEC = 80 * 86400;
  const NINETY_DAYS_SEC = 90 * 86400;

  // Query users and compute latest activity timestamp
  const query = `
    SELECT 
      u.id, 
      u.email, 
      u.created_at,
      u.last_active_at,
      u.warned_30d_at,
      u.warned_50d_at,
      MAX(
        COALESCE(u.last_active_at, 0),
        COALESCE(s_max.last_sub, 0),
        COALESCE(p_max.last_listen, 0),
        COALESCE(sess_max.last_session, 0),
        COALESCE(u.created_at, 0)
      ) AS effective_last_active
    FROM users u
    LEFT JOIN (SELECT user_id, MAX(created_at) as last_sub FROM subscriptions GROUP BY user_id) s_max ON s_max.user_id = u.id
    LEFT JOIN (SELECT user_id, MAX(last_listened_at) as last_listen FROM playback_state GROUP BY user_id) p_max ON p_max.user_id = u.id
    LEFT JOIN (SELECT user_id, MAX(created_at) as last_session FROM user_sessions GROUP BY user_id) sess_max ON sess_max.user_id = u.id
    GROUP BY u.id
  `;

  const rows = await db.prepare(query).all();
  const users = rows.results || [];

  const toDelete90d = [];
  const toWarn80d = [];
  const toWarn60d = [];
  const activeUsers = [];

  for (const u of users) {
    const lastActive = u.effective_last_active || u.created_at || now;
    const inactiveSeconds = now - lastActive;
    const inactiveDays = Math.floor(inactiveSeconds / 86400);

    const info = {
      id: u.id,
      email: u.email,
      inactiveDays,
      lastActive: new Date(lastActive * 1000).toISOString()
    };

    if (inactiveSeconds >= NINETY_DAYS_SEC) {
      toDelete90d.push(info);
    } else if (inactiveSeconds >= EIGHTY_DAYS_SEC) {
      if (!u.warned_50d_at) {
        toWarn80d.push(info);
      }
    } else if (inactiveSeconds >= SIXTY_DAYS_SEC) {
      if (!u.warned_30d_at) {
        toWarn60d.push(info);
      }
    } else {
      activeUsers.push(info);
    }
  }

  // If dry-run, return planned actions without mutating DB or sending emails
  if (isDryRun) {
    return new Response(JSON.stringify({
      mode: 'dryRun',
      examinedCount: users.length,
      activeCount: activeUsers.length,
      toWarn60dCount: toWarn60d.length,
      toWarn60d,
      toWarn80dCount: toWarn80d.length,
      toWarn80d,
      toDelete90dCount: toDelete90d.length,
      toDelete90d,
      note: 'Pass ?run=true to execute deletions and send warnings, or ?testEmail=<address> to test a sample email.'
    }, null, 2), {
      headers: corsHeaders,
      status: 200
    });
  }

  // EXECUTE ACTIONS (run=true)
  const results = {
    deleted: [],
    warned80d: [],
    warned60d: [],
    errors: []
  };

  // 1. Wipe accounts inactive >= 90 days
  for (const target of toDelete90d) {
    try {
      await db.batch([
        db.prepare('DELETE FROM subscriptions WHERE user_id = ?').bind(target.id),
        db.prepare('DELETE FROM playback_state WHERE user_id = ?').bind(target.id),
        db.prepare('DELETE FROM user_sessions WHERE user_id = ?').bind(target.id),
        db.prepare('DELETE FROM auth_tokens WHERE user_id = ?').bind(target.id),
        db.prepare('DELETE FROM users WHERE id = ?').bind(target.id)
      ]);
      results.deleted.push(target.email);
    } catch (e) {
      results.errors.push({ action: 'delete', email: target.email, error: e.message });
    }
  }

  // 2. Send 80-day final warning emails (10 days until deletion at 90d)
  for (const target of toWarn80d) {
    try {
      if (resendKey) {
        const rawToken = await createMagicActionToken(db, target.id, 'keep_active_80d');
        const verifyUrl = `${appUrl}/auth/verify/?token=${rawToken}`;
        const html = buildCleanerEmailHtml({
          email: target.email,
          appUrl,
          verifyUrl,
          isFinalNotice: true
        });

        await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${resendKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            from: fromEmail,
            to: [target.email],
            subject: 'Final Notice: 10 Days Until Anypod Account Deletion',
            html
          })
        });
      }

      await db.prepare('UPDATE users SET warned_50d_at = unixepoch() WHERE id = ?').bind(target.id).run();
      results.warned80d.push(target.email);
    } catch (e) {
      results.errors.push({ action: 'warn80d', email: target.email, error: e.message });
    }
  }

  // 3. Send 60-day "Cleaner Monday" emails (30 days until deletion at 90d)
  for (const target of toWarn60d) {
    try {
      const rawToken = await createMagicActionToken(db, target.id, 'keep_active_60d');
      const verifyUrl = `${appUrl}/auth/verify/?token=${rawToken}`;

      if (resendKey) {
        const html = buildCleanerEmailHtml({
          email: target.email,
          appUrl,
          verifyUrl,
          isFinalNotice: false
        });

        await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${resendKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            from: fromEmail,
            to: [target.email],
            subject: 'Anypod Cleaner Monday: Inactive Account Check',
            html
          })
        });
      }

      await db.prepare('UPDATE users SET warned_30d_at = unixepoch() WHERE id = ?').bind(target.id).run();
      results.warned60d.push({
        email: target.email,
        verifyUrl,
        deliveredEmail: !!resendKey
      });
    } catch (e) {
      results.errors.push({ action: 'warn60d', email: target.email, error: e.message });
    }
  }

  return new Response(JSON.stringify({
    success: true,
    mode: 'executed',
    results
  }, null, 2), {
    headers: corsHeaders,
    status: 200
  });
}
