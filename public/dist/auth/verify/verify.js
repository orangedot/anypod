(function () {
  const urlParams = new URLSearchParams(window.location.search);
  const token = urlParams.get('token');
  const btn = document.getElementById('btn-confirm');
  const errorBox = document.getElementById('error-box');
  const infoText = document.getElementById('info-text');

  if (!token) {
    btn.style.display = 'none';
    infoText.style.display = 'none';
    errorBox.style.display = 'block';
    errorBox.textContent = 'invalid verification link. token parameter is missing.';
    return;
  }

  async function doVerify() {
    btn.disabled = true;
    btn.textContent = 'signing you in...';
    infoText.textContent = 'verifying your login link and redirecting...';
    errorBox.style.display = 'none';

    try {
      const res = await fetch('/api/auth/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
        credentials: 'include'
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'verification failed');
      }

      const returnTo = urlParams.get('return_to') || urlParams.get('redirect') || '';
      let targetUrl = '/';
      if (returnTo) {
        try {
          if (returnTo.startsWith('/')) {
            targetUrl = returnTo;
          } else {
            const parsedTarget = new URL(returnTo);
            const host = parsedTarget.hostname.toLowerCase();
            if (host === 'anypod.org' || host.endsWith('.anypod.org') || host === 'localhost' || host === '127.0.0.1') {
              targetUrl = returnTo;
            }
          }
        } catch (_) {}
      }

      if (data.sessionToken) {
        localStorage.setItem('anypod_session_token', data.sessionToken);
        const sep = targetUrl.includes('?') ? '&' : '?';
        window.location.href = targetUrl + sep + 'session=' + encodeURIComponent(data.sessionToken);
      } else {
        window.location.href = targetUrl;
      }
    } catch (err) {
      btn.disabled = false;
      btn.textContent = 'confirm sign in';
      infoText.textContent = 'click the button below to complete your authentication and open anypod.';
      errorBox.style.display = 'block';
      errorBox.textContent = err.message;
    }
  }

  btn.addEventListener('click', doVerify);
  doVerify();
})();
