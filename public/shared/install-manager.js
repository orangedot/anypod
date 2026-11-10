/**
 * shared/install-manager.js — Cross-platform PWA Homescreen & Desktop Install Controller
 * Handles beforeinstallprompt (Android / Chromium / Desktop), iOS Safari guidance,
 * standalone mode detection, and top nav install pill.
 */
(function (global) {
  'use strict';

  let deferredPrompt = null;

  const state = {
    isStandalone: false,
    isIOS: false,
    isSafari: false,
    canPromptNative: false,
    isInstalled: false
  };

  function checkStandalone() {
    return (
      (global.matchMedia && global.matchMedia('(display-mode: standalone)').matches) ||
      global.navigator.standalone === true ||
      (document.referrer && document.referrer.includes('android-app://'))
    );
  }

  function detectPlatform() {
    const ua = navigator.userAgent || '';
    state.isIOS = /iPad|iPhone|iPod/.test(ua) && !global.MSStream;
    state.isSafari = /^((?!chrome|android).)*safari/i.test(ua);
    state.isStandalone = checkStandalone();
    state.isInstalled = state.isStandalone;

    if (state.isStandalone) {
      document.documentElement.classList.add('is-standalone');
    }
  }

  function updateUI() {
    const installPill = document.getElementById('btn-install-app');
    const settingsBtn = document.getElementById('btn-settings-install');
    const settingsStatus = document.getElementById('install-app-status');

    if (state.isStandalone) {
      if (installPill) installPill.classList.add('hidden');
      if (settingsBtn) {
        settingsBtn.disabled = true;
        settingsBtn.innerHTML = '<span>&#10003; app installed (offline ready)</span>';
      }
      if (settingsStatus) {
        settingsStatus.textContent = 'Anypod is running in standalone mode on your home screen or dock.';
      }
      return;
    }

    // Show header install button if native prompt is ready OR on iOS Safari
    if (installPill) {
      if (state.canPromptNative || state.isIOS) {
        installPill.classList.remove('hidden');
      } else {
        installPill.classList.add('hidden');
      }
    }

    if (settingsBtn) {
      settingsBtn.disabled = false;
      settingsBtn.innerHTML = `
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:6px">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
          <polyline points="7 10 12 15 17 10"></polyline>
          <line x1="12" y1="15" x2="12" y2="3"></line>
        </svg>
        <span>${state.isIOS ? 'Add to Home Screen' : 'Install App'}</span>
      `;
    }

    if (settingsStatus) {
      settingsStatus.textContent = state.isIOS
        ? 'Add Anypod to your iOS Home Screen for one-tap listening and lock screen controls.'
        : 'Install Anypod for offline playback, desktop dock integration, and lock screen controls.';
    }
  }

  function openIOSModal() {
    const modal = document.getElementById('ios-install-modal');
    if (modal) {
      modal.classList.remove('hidden');
    }
  }

  function closeIOSModal() {
    const modal = document.getElementById('ios-install-modal');
    if (modal) {
      modal.classList.add('hidden');
    }
  }

  async function promptInstall() {
    if (state.isStandalone) {
      if (typeof global.showToast === 'function') {
        global.showToast('Anypod is already installed on this device');
      }
      return;
    }

    // 1. Android / Chrome / Edge Native Prompt
    if (deferredPrompt) {
      try {
        await deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        if (outcome === 'accepted') {
          deferredPrompt = null;
          state.canPromptNative = false;
          updateUI();
        }
      } catch (err) {
        console.warn('[InstallManager] Prompt error:', err);
      }
      return;
    }

    // 2. iOS Safari Step-by-Step Guidance Sheet
    if (state.isIOS) {
      openIOSModal();
      return;
    }

    // 3. Desktop Safari (macOS Sonoma 14+)
    if (state.isSafari && !state.isIOS) {
      if (typeof global.showToast === 'function') {
        global.showToast('In Safari menu bar, click File → Add to Dock');
      }
      return;
    }

    // 4. Fallback for other browsers (e.g. desktop Firefox / browser menu)
    if (typeof global.showToast === 'function') {
      global.showToast('Use your browser menu (⋮) and select "Install" or "Add to Home Screen"');
    }
  }

  function setupEventListeners() {
    // Chromium / Android beforeinstallprompt
    global.addEventListener('beforeinstallprompt', function (e) {
      e.preventDefault();
      deferredPrompt = e;
      state.canPromptNative = true;
      updateUI();
    });

    // Native appinstalled event
    global.addEventListener('appinstalled', function () {
      deferredPrompt = null;
      state.canPromptNative = false;
      state.isInstalled = true;
      updateUI();
      if (typeof global.showToast === 'function') {
        global.showToast('Anypod installed successfully!');
      }
    });

    // Check display-mode changes dynamically
    if (global.matchMedia) {
      const displayMedia = global.matchMedia('(display-mode: standalone)');
      if (displayMedia.addEventListener) {
        displayMedia.addEventListener('change', function (e) {
          state.isStandalone = e.matches;
          if (state.isStandalone) {
            document.documentElement.classList.add('is-standalone');
          } else {
            document.documentElement.classList.remove('is-standalone');
          }
          updateUI();
        });
      }
    }

    // Bind DOM triggers when document is ready
    function bindDOM() {
      const installPill = document.getElementById('btn-install-app');
      if (installPill) {
        installPill.addEventListener('click', function (e) {
          e.preventDefault();
          promptInstall();
        });
      }

      const settingsBtn = document.getElementById('btn-settings-install');
      if (settingsBtn) {
        settingsBtn.addEventListener('click', function (e) {
          e.preventDefault();
          promptInstall();
        });
      }

      const closeIOSBtn = document.getElementById('btn-close-ios-install');
      if (closeIOSBtn) {
        closeIOSBtn.addEventListener('click', closeIOSModal);
      }

      const dismissIOSBtn = document.getElementById('btn-dismiss-ios-install');
      if (dismissIOSBtn) {
        dismissIOSBtn.addEventListener('click', closeIOSModal);
      }

      const iosModal = document.getElementById('ios-install-modal');
      if (iosModal) {
        iosModal.addEventListener('click', function (e) {
          if (e.target === iosModal) closeIOSModal();
        });
      }

      // Close modal on Escape
      document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && iosModal && !iosModal.classList.contains('hidden')) {
          closeIOSModal();
        }
      });

      updateUI();
    }

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', bindDOM);
    } else {
      bindDOM();
    }
  }

  // Initialise immediately
  detectPlatform();
  setupEventListeners();

  // Export public interface
  global.AnypodInstall = {
    isStandalone: function () { return state.isStandalone; },
    isIOS: function () { return state.isIOS; },
    canPromptNative: function () { return state.canPromptNative; },
    promptInstall: promptInstall,
    updateUI: updateUI
  };

})(typeof window !== 'undefined' ? window : globalThis);
