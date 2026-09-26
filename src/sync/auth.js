/**
 * @file auth.js
 * @description Authentication and cloud account sync verification via magic link or HTTP session cookie.
 */

import { STORAGE_KEYS } from '../config/constants.js';
import { state, elements } from '../state/store.js';

export function checkUrlSessionParam() {
  const urlParams = new URLSearchParams(window.location.search);
  const sessionParam = urlParams.get('session');
  if (sessionParam) {
    state.sessionToken = sessionParam;
    localStorage.setItem(STORAGE_KEYS.SESSION, sessionParam);
    window.history.replaceState({}, document.title, window.location.pathname);
  } else {
    state.sessionToken = localStorage.getItem(STORAGE_KEYS.SESSION) || localStorage.getItem('podcast_pulse_session_token') || '';
  }
  state.userEmail = localStorage.getItem(STORAGE_KEYS.USER_EMAIL) || '';
}

export function updateSyncStatusUI(statusText, email = '', isConnected = false) {
  if (elements.userSyncStatus) {
    elements.userSyncStatus.textContent = (statusText || '').toLowerCase();
  }
  if (elements.statusIndicator) {
    if (isConnected) {
      elements.statusIndicator.classList.add('online');
    } else {
      elements.statusIndicator.classList.remove('online');
    }
  }
  if (elements.userEmailLabel) {
    elements.userEmailLabel.textContent = (email || (isConnected ? 'logged in' : 'guest mode')).toLowerCase();
  }
  if (elements.btnAccountToggle) {
    elements.btnAccountToggle.textContent = isConnected ? 'sign out' : 'log in';
  }
  const cardDelete = document.getElementById('card-delete-account');
  if (cardDelete) {
    cardDelete.style.display = isConnected ? 'block' : 'none';
  }
}

export function getWebmailProvider(email) {
  if (!email || !email.includes('@')) return null;
  const domain = email.split('@')[1].toLowerCase().trim();
  if (domain === 'gmail.com' || domain === 'googlemail.com') {
    return { name: 'Gmail', url: 'https://mail.google.com/' };
  }
  if (['outlook.com', 'hotmail.com', 'live.com', 'msn.com', 'outlook.de'].includes(domain)) {
    return { name: 'Outlook', url: 'https://outlook.live.com/mail/' };
  }
  if (domain === 'ue-germany.de') {
    return { name: 'Outlook (UE Germany)', url: 'https://outlook.office.com/mail/' };
  }
  if (['yahoo.com', 'ymail.com', 'yahoo.de', 'yahoo.fr', 'yahoo.co.uk'].includes(domain)) {
    return { name: 'Yahoo Mail', url: 'https://mail.yahoo.com/' };
  }
  if (['icloud.com', 'me.com', 'mac.com'].includes(domain)) {
    return { name: 'iCloud Mail', url: 'https://www.icloud.com/mail/' };
  }
  if (domain === 'proton.me' || domain === 'protonmail.com') {
    return { name: 'Proton Mail', url: 'https://mail.proton.me/' };
  }
  if (domain.startsWith('gmx.')) {
    return { name: 'GMX', url: 'https://www.gmx.net/' };
  }
  if (domain === 'web.de') {
    return { name: 'WEB.DE', url: 'https://web.de/' };
  }
  if (domain === 't-online.de') {
    return { name: 'Telekom Mail', url: 'https://email.t-online.de/' };
  }
  if (domain === 'posteo.de' || domain === 'posteo.net' || domain === 'posteo.org') {
    return { name: 'Posteo', url: 'https://posteo.de/' };
  }
  if (domain === 'mailbox.org') {
    return { name: 'mailbox.org', url: 'https://mailbox.org/' };
  }
  if (domain === 'freenet.de') {
    return { name: 'freenet Mail', url: 'https://email.freenet.de/' };
  }
  if (domain === 'zoho.com' || domain === 'zoho.eu') {
    return { name: 'Zoho Mail', url: 'https://mail.zoho.com/' };
  }
  if (domain === 'fastmail.com' || domain === 'fastmail.fm') {
    return { name: 'Fastmail', url: 'https://app.fastmail.com/' };
  }
  if (domain === 'ionos.de' || domain === 'ionos.com' || domain === 'online.de') {
    return { name: 'IONOS Webmail', url: 'https://mail.ionos.de/' };
  }
  return { name: domain, url: `https://${domain}` };
}

export async function submitMagicAuth() {
  const email = elements.magicEmailInput ? elements.magicEmailInput.value.trim() : '';
  if (!email || !email.includes('@')) return;

  if (elements.magicStatusMsg) {
    elements.magicStatusMsg.style.display = 'block';
    elements.magicStatusMsg.style.color = '#a5b4fc';
    elements.magicStatusMsg.textContent = 'sending sign-in link...';
  }

  try {
    const res = await fetch('/api/auth/send-link', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, origin: window.location.origin })
    });

    let data = {};
    try {
      data = await res.json();
    } catch (e) {
      data = { error: `server error (${res.status}). please try again in a moment.` };
    }
    if (!res.ok || data.error) throw new Error(data.error || 'failed to send link');

    const provider = getWebmailProvider(email);
    let content = '<div style="margin-top: 6px; line-height: 1.45;">';
    content += '<div style="color: #cbd5e1;">sign-in link sent! check your email inbox (and spam folder) to complete sign in.</div>';

    if (data.verifyUrl) {
      content += `<div style="margin-top: 8px;"><a href="${data.verifyUrl}" class="btn btn-primary btn-sm" style="display: inline-block; text-decoration: none;">open direct sign-in link</a></div>`;
    } else if (provider) {
      content += `<div style="margin-top: 8px;"><a href="${provider.url}" target="_blank" rel="noopener noreferrer" class="btn btn-primary btn-sm" style="display: inline-block; text-decoration: none;">open ${provider.name.toLowerCase()}</a></div>`;
    }
    content += '</div>';

    if (elements.magicStatusMsg) {
      elements.magicStatusMsg.style.color = '#4ade80';
      elements.magicStatusMsg.innerHTML = content;
    }
  } catch (err) {
    if (elements.magicStatusMsg) {
      elements.magicStatusMsg.style.color = '#f87171';
      elements.magicStatusMsg.textContent = (err.message || 'error sending link').toLowerCase();
    }
  }
}
