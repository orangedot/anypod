'use strict';

// ─────────────────────────────────────────────────────────────────────────
// SECTION 27 · Event Listeners & Modal Helpers
// All UI click/input/keyboard wiring lives here.
// Modal helpers: openAddModal, closeAddModal, openSleepModal,
// closeSleepModal, showStatus, hideStatus.
// ─────────────────────────────────────────────────────────────────────────

function setupEventListeners() {
  if (elements.magicAuthForm) {
    elements.magicAuthForm.addEventListener('submit', (e) => {
      e.preventDefault();
      submitMagicAuth();
    });
  }

  if (elements.btnCloseAuth) {
    elements.btnCloseAuth.addEventListener('click', () => {
      elements.authModal.classList.add('hidden');
      sessionStorage.setItem('anypod_guest_mode', '1');
    });
  }

  if (elements.btnCancelAuth) {
    elements.btnCancelAuth.addEventListener('click', () => {
      elements.authModal.classList.add('hidden');
      sessionStorage.setItem('anypod_guest_mode', '1');
    });
  }

  if (elements.btnShowLogin) {
    elements.btnShowLogin.addEventListener('click', () => {
      elements.authModal.classList.remove('hidden');
    });
  }

  if (elements.filterChips) {
    elements.filterChips.forEach(chip => {
      chip.addEventListener('click', () => {
        elements.filterChips.forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        state.filterMode = chip.dataset.filter || 'all';
        processAndSortEpisodes();
        renderTimeline();
        if (state.activeFeedDetailUrl) {
          renderFeedDetail(state.activeFeedDetailUrl);
        }
      });
    });
  }

  if (elements.btnAccountToggle) {
    elements.btnAccountToggle.addEventListener('click', async () => {
      if (elements.statusIndicator && elements.statusIndicator.classList.contains('online')) {
        const emailDisplay = state.userEmail ? ` (${state.userEmail})` : '';
        openConfirmDialog({
          title: 'Sign Out?',
          message: `Are you sure you want to sign out${emailDisplay}? Your cloud subscriptions and playback positions will remain safely synced to your account.`,
          actionLabel: 'Sign Out',
          onConfirm: async () => {
            const currentToken = state.sessionToken;
            try {
              await fetch('/api/auth/logout', {
                method: 'POST',
                credentials: 'include',
                headers: {
                  'Content-Type': 'application/json',
                  ...(currentToken ? { 'X-Session-Token': currentToken } : {})
                },
                body: JSON.stringify({ sessionToken: currentToken })
              });
            } catch (e) {}
            storage.removeItem(STORAGE_KEYS.SESSION);
            storage.removeItem(STORAGE_KEYS.USER_EMAIL);
            storage.removeItem('podcast_pulse_session_token');
            storage.removeItem(STORAGE_KEYS.FEEDS);
            storage.removeItem(STORAGE_KEYS.MUTED_FEEDS);
            storage.removeItem(STORAGE_KEYS.POSITIONS);
            storage.removeItem(STORAGE_KEYS.CACHED_EPISODES);
            storage.removeItem(STORAGE_KEYS.CACHED_METADATA);
            storage.removeItem(STORAGE_KEYS.QUEUE);
            storage.removeItem(STORAGE_KEYS.LAST_EPISODE);
            document.cookie = 'podcast_session=; Path=/; Expires=Thu, 01 Jan 1970 00:00:01 GMT;';
            window.history.replaceState({}, document.title, window.location.pathname);
            state.sessionToken = '';
            state.userEmail = '';
            state.feeds = [];
            state.mutedFeeds = [];
            state.playbackPositions = {};
            state.allEpisodes = [];
            state.filteredEpisodes = [];
            state.feedMetadata = {};
            state.queue = [];
            if (elements.audio) {
              elements.audio.pause();
              elements.audio.src = '';
            }
            if (state.ytPlayer && state.ytPlayer.stopVideo) {
              state.ytPlayer.stopVideo();
            }
            state.currentEpisode = null;
            state.playbackStatus = 'idle';
            if (elements.playerBar) elements.playerBar.classList.remove('active-episode');
            document.body.classList.remove('has-active-episode', 'has-mini-player', 'has-full-player');
            updatePlayerUI(false);
            updateFeedCountUI();
            updateQueueUI();
            renderContinueShelf();
            renderTimeline();
            renderFeedsGrid();
            updateSyncStatusUI('Logged Out', '', false);
            elements.authModal.classList.remove('hidden');
          }
        });
      } else {
        elements.authModal.classList.remove('hidden');
      }
    });
  }

  if (elements.userStatusPill) {
    elements.userStatusPill.addEventListener('click', (e) => {
      if (e.target.closest('#btn-account-toggle')) return;
      elements.userStatusPill.classList.toggle('is-expanded');
    });

    document.addEventListener('click', (e) => {
      if (!e.target.closest('#user-status-pill')) {
        elements.userStatusPill.classList.remove('is-expanded');
      }
    });
  }

  if (elements.btnConfirmCancel) {
    elements.btnConfirmCancel.addEventListener('click', () => {
      state.feedToDelete = null;
      state.confirmModalAction = null;
      if (elements.confirmModal) elements.confirmModal.classList.add('hidden');
    });
  }

  if (elements.btnConfirmDelete) {
    elements.btnConfirmDelete.addEventListener('click', () => {
      if (typeof state.confirmModalAction === 'function') {
        const action = state.confirmModalAction;
        state.confirmModalAction = null;
        action();
      } else if (state.feedToDelete) {
        removeFeed(state.feedToDelete);
        state.feedToDelete = null;
      }
      if (elements.confirmModal) elements.confirmModal.classList.add('hidden');
    });
  }

  const btnDeleteAccount = document.getElementById('btn-delete-account');
  if (btnDeleteAccount) {
    btnDeleteAccount.addEventListener('click', () => {
      openConfirmDialog({
        title: 'Delete Cloud Account?',
        message: 'Permanently wipe your account email, synced podcast subscriptions, playback positions, and active sessions from Cloudflare D1. This action cannot be undone.',
        actionLabel: 'Wipe & Delete',
        onConfirm: async () => {
          btnDeleteAccount.disabled = true;
          btnDeleteAccount.textContent = 'Deleting account...';
          try {
            const res = await fetch('/api/auth/delete-account', {
              method: 'POST',
              credentials: 'include'
            });
            const data = await res.json();
            if (!res.ok || !data.success) {
              throw new Error(data.error || 'Failed to delete account');
            }

            storage.removeItem(STORAGE_KEYS.SESSION);
            storage.removeItem(STORAGE_KEYS.USER_EMAIL);
            storage.removeItem('podcast_pulse_session_token');
            storage.removeItem('anypod_session_token');
            state.sessionToken = '';
            state.userEmail = '';

            updateSyncStatusUI('logged in as guest / local device storage', '', false);
            showStatus('cloud account and sync data permanently wiped.');
          } catch (err) {
            showStatus('failed to delete account: ' + err.message);
          } finally {
            btnDeleteAccount.disabled = false;
            btnDeleteAccount.textContent = 'delete account & wipe cloud data';
          }
        }
      });
    });

    document.addEventListener('error', (e) => {
      if (e.target && e.target.tagName === 'IMG') {
        const img = e.target;
        if (img.src !== FALLBACK_ARTWORK) {
          img.src = FALLBACK_ARTWORK;
        }
      }
    }, true);
  }

  if (elements.btnPrev15) {
    elements.btnPrev15.addEventListener('click', () => {
      if (state.activeEngine === 'audio') {
        elements.audio.currentTime = Math.max(0, elements.audio.currentTime - 15);
      } else if (state.activeEngine === 'youtube' && state.ytPlayer && state.ytPlayer.getCurrentTime) {
        const cur = state.ytPlayer.getCurrentTime();
        state.ytPlayer.seekTo(Math.max(0, cur - 15), true);
      }
    });
  }

  if (elements.btnNext15) {
    elements.btnNext15.addEventListener('click', () => {
      if (state.activeEngine === 'audio') {
        elements.audio.currentTime = Math.min(elements.audio.duration || 0, elements.audio.currentTime + 15);
      } else if (state.activeEngine === 'youtube' && state.ytPlayer && state.ytPlayer.getCurrentTime) {
        const cur = state.ytPlayer.getCurrentTime();
        state.ytPlayer.seekTo(cur + 15, true);
      }
    });
  }

  if (elements.btnSkipEpisode) {
    elements.btnSkipEpisode.addEventListener('click', () => {
      skipToNextEpisode(false);
    });
  }

  if (elements.btnPlayerShuffle) {
    elements.btnPlayerShuffle.addEventListener('click', toggleShuffle);
  }

  if (elements.btnPlayerMarkPlayed) {
    elements.btnPlayerMarkPlayed.addEventListener('click', () => {
      skipToNextEpisode(true);
    });
  }

  elements.btnSearchDirectory.addEventListener('click', () => {
    searchPodcastDirectory(elements.podcastSearchQuery.value);
  });
  elements.podcastSearchQuery.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      searchPodcastDirectory(elements.podcastSearchQuery.value);
    }
  });

  elements.tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const targetTab = tab.dataset.tab;
      navigateTo(targetTab);
    });
  });

  // Gear icon → Settings (history-aware)
  if (elements.btnOpenSettings) {
    elements.btnOpenSettings.addEventListener('click', () => {
      navigateTo('settings');
    });
  }

  if (elements.themeBtns) {
    elements.themeBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        setTheme(btn.dataset.themeVal);
      });
    });
  }

  elements.searchInput.addEventListener('input', (e) => {
    state.searchQuery = e.target.value;
    const hasText = !!e.target.value.trim();
    if (elements.btnClearSearch) {
      elements.btnClearSearch.classList.toggle('hidden', !hasText);
    }
    if (elements.searchBarWrap) {
      elements.searchBarWrap.classList.toggle('has-text', hasText);
    }
    processAndSortEpisodes();
    renderTimeline();
    renderFeedsGrid();
    if (state.activeFeedDetailUrl) {
      renderFeedDetail(state.activeFeedDetailUrl);
    }
    renderOfflineStorageSettings();
  });

  // ───────────────────────────────────────────────────────────────────────
  // Search Discover Live Preview (5 items + trailing 'see all' card)
  // ───────────────────────────────────────────────────────────────────────
  let discoverSearchTimer = null;
  const previewContainer = document.getElementById('search-discover-preview');
  const previewScroll = document.getElementById('discover-preview-scroll');

  // Helper: completely close & reset header search
  function dismissHeaderSearch() {
    if (elements.searchInput) {
      elements.searchInput.value = '';
      elements.searchInput.blur();
    }
    state.searchQuery = '';
    if (elements.btnClearSearch) elements.btnClearSearch.classList.add('hidden');
    if (elements.searchBarWrap) elements.searchBarWrap.classList.remove('has-text');
    if (previewContainer) previewContainer.classList.add('hidden');
  }

  elements.searchInput?.addEventListener('input', (e) => {
    const q = e.target.value.trim();
    clearTimeout(discoverSearchTimer);

    if (q.length < 3) {
      if (previewContainer) previewContainer.classList.add('hidden');
      return;
    }

    discoverSearchTimer = setTimeout(async () => {
      try {
        // Fetch 5 matching shows via proxy (with direct fallback)
        let data = null;
        try {
          const proxyRes = await fetch(`/api/search-directory?term=${encodeURIComponent(q)}&limit=5`);
          if (proxyRes.ok) data = await proxyRes.json();
        } catch (_) {}

        if (!data || !data.results || data.results.length === 0 || data.rateLimited) {
          try {
            const directRes = await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(q)}&media=podcast&entity=podcast&limit=5`);
            if (directRes.ok) data = await directRes.json();
          } catch (_) {}
        }

        if (!data || !data.results || data.results.length === 0) {
          if (previewContainer) previewContainer.classList.add('hidden');
          return;
        }

        if (previewScroll) {
          // 1. Five podcast cards with inline '+' save button
          const cardsHtml = data.results.map(pod => {
            const feedUrl = pod.feedUrl || '';
            const isSubbed = state.feeds.includes(feedUrl);
            const title = pod.collectionName || 'Unknown';
            const artist = pod.artistName || '';
            const artwork = pod.artworkUrl60 || pod.artworkUrl100 || '';

            return `
              <div class="discover-preview-item" data-feed-url="${encodeURIComponent(feedUrl)}" data-title="${escapeHtml(title)}" data-artwork="${escapeHtml(artwork)}">
                <img loading="lazy" decoding="async" width="48" height="48" src="${artwork}" alt="">
                <div class="discover-preview-item-info">
                  <span class="discover-preview-title">${escapeHtml(title)}</span>
                  <span class="discover-preview-artist">${escapeHtml(artist)}</span>
                </div>
                <button type="button" class="discover-preview-add-btn ${isSubbed ? 'is-subbed' : ''}" title="${isSubbed ? 'Subscribed' : 'Save podcast'}" ${isSubbed ? 'disabled' : ''}>
                  ${isSubbed ? '✓' : '+'}
                </button>
              </div>
            `;
          }).join('');

          // 2. Trailing 'see all in discover →' card in the same row
          const seeAllHtml = `
            <button type="button" class="discover-preview-see-all-card" id="btn-discover-see-all">
              <span>see all in discover</span>
              <span style="font-size: 1.1rem; line-height: 1;">→</span>
            </button>
          `;

          previewScroll.innerHTML = cardsHtml + seeAllHtml;

          // Clicking any card closes search & opens feed detail
          previewScroll.querySelectorAll('.discover-preview-item').forEach(item => {
            item.addEventListener('click', (ev) => {
              if (ev.target.closest('.discover-preview-add-btn')) return;
              const feedUrl = decodeURIComponent(item.dataset.feedUrl);
              if (feedUrl) {
                dismissHeaderSearch();
                if (!state.feedMetadata[feedUrl]) {
                  state.feedMetadata[feedUrl] = {
                    title: item.dataset.title || '',
                    author: '',
                    artwork: item.dataset.artwork || ''
                  };
                }
                openFeedDetail(feedUrl);
              }
            });
          });

          // Inline '+' / '✓' button
          previewScroll.querySelectorAll('.discover-preview-add-btn').forEach(btn => {
            btn.addEventListener('click', async (ev) => {
              ev.stopPropagation();
              const parent = btn.closest('.discover-preview-item');
              const feedUrl = decodeURIComponent(parent.dataset.feedUrl);
              const title = parent.dataset.title || '';
              const artwork = parent.dataset.artwork || '';

              if (feedUrl && !state.feeds.includes(feedUrl)) {
                btn.textContent = '...';
                await addFeed(feedUrl, title, artwork);
                btn.textContent = '✓';
                btn.classList.add('is-subbed');
                btn.disabled = true;
              }
            });
          });

          // Clicking trailing 'see all in discover' closes search & navigates to discover tab
          const btnSeeAllEl = document.getElementById('btn-discover-see-all');
          btnSeeAllEl?.addEventListener('click', (ev) => {
            ev.stopPropagation();
            const term = q;
            dismissHeaderSearch();
            navigateTo('discover');
            window.scrollTo({ top: 0, behavior: 'smooth' });

            const discInput = document.getElementById('empty-quick-input');
            if (discInput && term) {
              discInput.value = term;
              const quickResults = document.getElementById('empty-quick-results');
              if (quickResults) searchPodcastDirectory(term, quickResults);
            }
          });
        }

        if (previewContainer) previewContainer.classList.remove('hidden');
      } catch (_) {}
    }, 650);
  });

  // Clicking anywhere outside closes the preview
  document.addEventListener('click', (e) => {
    if (!e.target.closest('#header-search') && previewContainer) {
      previewContainer.classList.add('hidden');
    }
  });

  // btnSeeAll?.addEventListener('click', () => {
  //   const q = elements.searchInput?.value.trim() || '';

  //   // 1. Clear general top search bar and state
  //   if (elements.searchInput) {
  //     elements.searchInput.value = '';
  //     elements.searchInput.blur();
  //   }
  //   state.searchQuery = '';
  //   if (elements.btnClearSearch) elements.btnClearSearch.classList.add('hidden');
  //   if (elements.searchBarWrap) elements.searchBarWrap.classList.remove('has-text');
  //   previewContainer?.classList.add('hidden');

  //   // 2. Switch to Discover tab & scroll to the top
  //   navigateTo('discover');
  //   window.scrollTo({ top: 0, behavior: 'smooth' });

  //   // 3. Populate Discover search & trigger results
  //   const discInput = document.getElementById('empty-quick-input');
  //   if (discInput && q) {
  //     discInput.value = q;
  //     const quickResults = document.getElementById('empty-quick-results');
  //     if (quickResults) searchPodcastDirectory(q, quickResults);
  //   }
  // });

  // document.addEventListener('click', (e) => {
  //   if (!e.target.closest('#header-search') && previewContainer) {
  //     previewContainer.classList.add('hidden');
  //   }
  // });

  if (elements.btnClearSearch) {
    elements.btnClearSearch.addEventListener('click', (e) => {
      e.stopPropagation();
      elements.searchInput.value = '';
      state.searchQuery = '';
      elements.btnClearSearch.classList.add('hidden');
      if (elements.searchBarWrap) {
        elements.searchBarWrap.classList.remove('has-text');
      }
      processAndSortEpisodes();
      renderTimeline();
      renderFeedsGrid();
      if (state.activeFeedDetailUrl) {
        renderFeedDetail(state.activeFeedDetailUrl);
      }
      renderOfflineStorageSettings();
      elements.searchInput.focus();
    });
  }

  elements.searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (elements.searchInput.value) {
        elements.btnClearSearch?.click();
      } else {
        elements.searchInput.blur();
      }
    }
  });

  if (elements.searchBarWrap) {
    elements.searchBarWrap.addEventListener('click', (e) => {
      if (e.target.closest('#btn-clear-search')) return;
      elements.searchInput.focus();
    });
  }

  elements.sortOrderSelect.addEventListener('change', (e) => {
    state.sortOrder = e.target.value;
    processAndSortEpisodes();
    renderTimeline();
    if (state.activeFeedDetailUrl) {
      renderFeedDetail(state.activeFeedDetailUrl);
    }
  });

  // elements.btnOpenAddModal.addEventListener('click', openAddModal);
  // elements.btnRefreshAll.addEventListener('click', refreshAllFeeds);

  if (elements.btnToggleContinue) {
    elements.btnToggleContinue.addEventListener('click', () => {
      const wasExpanded = !state.continueCollapsed;
      state.continueCollapsed = !state.continueCollapsed;
      renderContinueShelf();

      // If user collapsed it from the bottom, scroll back to the top of the shelf
      if (wasExpanded && elements.continueShelf) {
        elements.continueShelf.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  }

  // if (elements.btnContinueStickyCollapse) {
  //   elements.btnContinueStickyCollapse.addEventListener('click', () => {
  //     state.continueCollapsed = true;
  //     renderContinueShelf();
  //     if (elements.continueShelf) {
  //       elements.continueShelf.scrollIntoView({ behavior: 'smooth', block: 'start' });
  //     }
  //   });
  // }

  if (elements.btnToggleEnlarge) {
    elements.btnToggleEnlarge.addEventListener('click', () => {
      const isEnlarged = elements.searchDirectoryResults && elements.searchDirectoryResults.classList.contains('is-enlarged');
      setDirectoryEnlarged(!isEnlarged);
    });
  }

  if (elements.btnAutoplayToggle) {
    const autoplayBtn = elements.btnAutoplayToggle || document.getElementById('btn-autoplay-toggle');
    if (autoplayBtn) {
      autoplayBtn.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();

        state.autoplayEnabled = !state.autoplayEnabled;
        storage.setItem(STORAGE_KEYS.AUTOPLAY, state.autoplayEnabled ? 'true' : 'false');

        updateAutoplayButtonUI();

        showToast(state.autoplayEnabled 
          ? `Autoplay ON (${state.playbackContext?.title || 'Timeline'})` 
          : 'Autoplay OFF'
        );

        if (elements.queueModal && !elements.queueModal.classList.contains('hidden')) {
          renderQueueModalContent();
        }
      };

      updateAutoplayButtonUI();
    }
  }


  if (elements.btnStickyCollapse) {
    elements.btnStickyCollapse.addEventListener('click', () => {
      setDirectoryEnlarged(false);
      if (elements.addModalBody) {
        const searchSec = elements.addModalBody.querySelector('#add-section-search');
        if (searchSec) {
          elements.addModalBody.scrollTo({ top: searchSec.offsetTop - 10, behavior: 'smooth' });
        }
      }
    });
  }

  if (elements.addModalNav && elements.addModalBody) {
    const navLinks = elements.addModalNav.querySelectorAll('.modal-scroll-link');
    navLinks.forEach(link => {
      link.addEventListener('click', () => {
        const targetId = link.getAttribute('data-target');
        const targetEl = elements.addModalBody.querySelector(targetId);
        if (targetEl) {
          elements.addModalBody.scrollTo({
            top: targetEl.offsetTop - 10,
            behavior: 'smooth'
          });
        }
        navLinks.forEach(l => l.classList.remove('active'));
        link.classList.add('active');
        if (targetId === '#add-section-search' && elements.podcastSearchQuery) {
          setTimeout(() => elements.podcastSearchQuery.focus(), 250);
        } else if (targetId === '#add-section-rss' && elements.feedUrlInput) {
          setTimeout(() => elements.feedUrlInput.focus(), 250);
        }
      });
    });

    elements.addModalBody.addEventListener('scroll', () => {
      const sections = elements.addModalBody.querySelectorAll('.add-modal-section');
      const scrollPos = elements.addModalBody.scrollTop + 60;
      sections.forEach(sec => {
        if (scrollPos >= sec.offsetTop && scrollPos < sec.offsetTop + sec.offsetHeight) {
          const id = '#' + sec.id;
          navLinks.forEach(l => {
            if (l.getAttribute('data-target') === id) {
              l.classList.add('active');
            } else {
              l.classList.remove('active');
            }
          });
        }
      });
    }, { passive: true });
  }

  let modalSearchDebounceTimer = null;
  if (elements.btnClearModalSearch && elements.podcastSearchQuery) {
    elements.podcastSearchQuery.addEventListener('input', () => {
      const val = elements.podcastSearchQuery.value.trim();
      elements.btnClearModalSearch.classList.toggle('hidden', !val);
      if (modalSearchDebounceTimer) clearTimeout(modalSearchDebounceTimer);
      if (val.length >= 3) {
        modalSearchDebounceTimer = setTimeout(() => {
          searchPodcastDirectory(val);
        }, 650);
      } else if (!val) {
        if (elements.searchDirectoryResults) {
          elements.searchDirectoryResults.innerHTML = buildStarterSuggestionsHTML('all');
          wireStarterSuggestionsEvents(elements.searchDirectoryResults);
        }
        if (elements.dirResultsTitle) {
          elements.dirResultsTitle.textContent = 'podcasts';
        }
      }
    });
    elements.btnClearModalSearch.addEventListener('click', () => {
      if (modalSearchDebounceTimer) clearTimeout(modalSearchDebounceTimer);
      elements.podcastSearchQuery.value = '';
      elements.btnClearModalSearch.classList.add('hidden');
      if (elements.searchDirectoryResults) {
        elements.searchDirectoryResults.innerHTML = buildStarterSuggestionsHTML('all');
        wireStarterSuggestionsEvents(elements.searchDirectoryResults);
      }
      if (elements.dirResultsTitle) {
        elements.dirResultsTitle.textContent = 'podcasts';
      }
      elements.podcastSearchQuery.focus();
    });
    elements.podcastSearchQuery.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (modalSearchDebounceTimer) clearTimeout(modalSearchDebounceTimer);
        elements.podcastSearchQuery.value = '';
        elements.btnClearModalSearch.classList.add('hidden');
        if (elements.searchDirectoryResults) {
          elements.searchDirectoryResults.innerHTML = buildStarterSuggestionsHTML('all');
          wireStarterSuggestionsEvents(elements.searchDirectoryResults);
        }
        if (elements.dirResultsTitle) {
          elements.dirResultsTitle.textContent = 'podcasts';
        }
      }
    });
  }

  elements.btnCloseAdd.addEventListener('click', closeAddModal);
  if (elements.btnCancelAdd) {
    elements.btnCancelAdd.addEventListener('click', closeAddModal);
  }
  const handleModalFeedSubmit = async () => {
    const val = elements.feedUrlInput ? elements.feedUrlInput.value.trim() : '';
    if (!val) return;
    elements.btnSubmitFeed.disabled = true;
    elements.btnSubmitFeed.textContent = 'adding...';
    try {
      const added = await addFeed(val);
      if (added) {
        const meta = state.feedMetadata[val] || {};
        if (meta.error) {
          showToast(`⚠️ Could not load feed: ${meta.error}`, 4000);
          elements.btnSubmitFeed.textContent = 'subscribe';
          elements.btnSubmitFeed.disabled = false;
        } else {
          elements.btnSubmitFeed.textContent = '✓ subscribed!';
          showToast(`✓ Subscribed to "${meta.title || 'podcast'}"!`);
          closeAddModal();
          setTimeout(() => {
            if (elements.btnSubmitFeed) {
              elements.btnSubmitFeed.textContent = 'subscribe';
              elements.btnSubmitFeed.disabled = false;
            }
          }, 1500);
        }
      } else {
        elements.btnSubmitFeed.textContent = 'subscribe';
        elements.btnSubmitFeed.disabled = false;
      }
    } catch (err) {
      showToast(`⚠️ Error: ${err?.message || 'Failed to add feed'}`);
      elements.btnSubmitFeed.textContent = 'subscribe';
      elements.btnSubmitFeed.disabled = false;
    }
  };

  elements.btnSubmitFeed.addEventListener('click', handleModalFeedSubmit);
  elements.feedUrlInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleModalFeedSubmit();
    }
  });

  elements.btnOpenSleep.addEventListener('click', openSleepModal);
  elements.btnCloseSleep.addEventListener('click', closeSleepModal);
  elements.timerBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const val = btn.dataset.minutes;
      startSleepTimer(val === 'end' || val === 'end-queue' ? val : parseInt(val, 10));
    });
  });
  elements.fadeoutCheck.addEventListener('change', (e) => {
    state.sleepTimer.fadeout = e.target.checked;
  });

  const modalCatChips = document.querySelectorAll('#modal-category-chips .category-chip');
  modalCatChips.forEach(chip => {
    chip.addEventListener('click', () => {
      modalCatChips.forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      const cat = chip.dataset.category;
      renderSubgenreChips(cat, elements.modalSubgenreChips);
      if (elements.podcastSearchQuery) {
        elements.podcastSearchQuery.value = cat;
        if (elements.btnClearModalSearch) elements.btnClearModalSearch.classList.remove('hidden');
        searchPodcastDirectory(cat);
      }
      if (elements.addModalBody) {
        const searchSec = elements.addModalBody.querySelector('#add-section-search');
        if (searchSec) {
          elements.addModalBody.scrollTo({ top: searchSec.offsetTop - 10, behavior: 'smooth' });
        }
      }
      if (elements.addModalNav) {
        const links = elements.addModalNav.querySelectorAll('.modal-scroll-link');
        links.forEach(l => {
          if (l.getAttribute('data-target') === '#add-section-search') l.classList.add('active');
          else l.classList.remove('active');
        });
      }
    });
  });

  if (elements.btnOpenQueue) elements.btnOpenQueue.addEventListener('click', openQueueModal);
  if (elements.btnCloseQueue) elements.btnCloseQueue.addEventListener('click', closeQueueModal);
  if (elements.queueModal) {
    elements.queueModal.addEventListener('click', (e) => {
      if (e.target === elements.queueModal) closeQueueModal();
    });
  }

  if (elements.btnPlayerNotes) elements.btnPlayerNotes.addEventListener('click', () => openShowNotes(null, 'notes'));
  if (elements.btnPlayerFav) elements.btnPlayerFav.addEventListener('click', () => {
    if (state.currentEpisode) toggleFavoriteEpisode(state.currentEpisode);
  });
  if (elements.btnPlayerTranscript) elements.btnPlayerTranscript.addEventListener('click', () => openShowNotes(null, 'transcript'));
  
  if (elements.playerTitle) {
    elements.playerTitle.addEventListener('click', (e) => {
      e.stopPropagation();
      openShowNotes(null, 'notes');
    });
  }

  if (elements.playerPodcast) {
    elements.playerPodcast.addEventListener('click', (e) => {
      e.stopPropagation();
      if (state.currentEpisode && state.currentEpisode.feedUrl) {
        openFeedDetail(state.currentEpisode.feedUrl);
      }
    });
  }

  if (elements.playerArtwork) {
    elements.playerArtwork.addEventListener('click', (e) => {
      e.stopPropagation();
      openShowNotes(null, 'notes');
    });
  }

  if (elements.totalDurationLabel) {
    elements.totalDurationLabel.addEventListener('click', (e) => {
      e.stopPropagation();
      state.showRemainingTime = !state.showRemainingTime;
      updateProgress();
    });
  }

  function copyActiveStreamUrl() {
    const streamUrl = window.__ANYPOD_CURRENT_STREAM_URL || (elements.audio ? elements.audio.src : '') || '';
    if (!streamUrl) {
      showToast('No active audio stream URL');
      return;
    }

    if (elements.audio && elements.audio.buffered && elements.audio.buffered.length > 0) {
      try {
        console.log(`[Buffer Info] 0 to ${elements.audio.buffered.end(0)}s of ${elements.audio.duration}s`);
        for (let i = 0; i < elements.audio.buffered.length; i++) {
          console.log(`[Buffer Detail ${i}] ${elements.audio.buffered.start(i).toFixed(2)}s to ${elements.audio.buffered.end(i).toFixed(2)}s`);
        }
      } catch (bufErr) {
        console.warn('[Buffer Info Error]:', bufErr);
      }
    } else if (elements.audio) {
      console.log(`[Buffer Info] No buffered ranges (duration: ${elements.audio.duration}s, readyState: ${elements.audio.readyState})`);
    }

    const onCopied = () => {
      showToast('Copied active stream URL to clipboard');
      if (elements.btnCopyStreamUrl) {
        elements.btnCopyStreamUrl.classList.add('is-copied');
        setTimeout(() => {
          elements.btnCopyStreamUrl?.classList.remove('is-copied');
        }, 1500);
      }
    };

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(streamUrl).then(onCopied).catch(() => {
        window.prompt('Copy active stream URL:', streamUrl);
        onCopied();
      });
    } else {
      window.prompt('Copy active stream URL:', streamUrl);
      onCopied();
    }
  }

  if (elements.currentTimeLabel) {
    elements.currentTimeLabel.title = 'Click to copy active stream URL';
    elements.currentTimeLabel.addEventListener('click', (e) => {
      e.stopPropagation();
      copyActiveStreamUrl();
    });
  }

  if (elements.btnCopyStreamUrl) {
    elements.btnCopyStreamUrl.addEventListener('click', (e) => {
      e.stopPropagation();
      copyActiveStreamUrl();
    });
  }

  if (elements.btnCloseNotes) elements.btnCloseNotes.addEventListener('click', closeShowNotes);
  if (elements.showNotesModal) {
    elements.showNotesModal.addEventListener('click', (e) => {
      if (e.target === elements.showNotesModal) closeShowNotes();
    });
  }

  if (elements.tabBtnNotes) {
    elements.tabBtnNotes.addEventListener('click', () => switchShowNotesTab('notes'));
  }
  if (elements.tabBtnChapters) {
    elements.tabBtnChapters.addEventListener('click', () => switchShowNotesTab('chapters'));
  }
  if (elements.tabBtnTranscript) {
    elements.tabBtnTranscript.addEventListener('click', () => switchShowNotesTab('transcript'));
  }
  // if (elements.transcriptSearchInput) {
  //   elements.transcriptSearchInput.addEventListener('input', (e) => {
  //     renderTranscriptView(e.target.value);
  //   });
  // }
  // if (elements.transcriptFileInput) {
  //   elements.transcriptFileInput.addEventListener('change', (e) => {
  //     const file = e.target.files && e.target.files[0];
  //     if (!file) return;
  //     const reader = new FileReader();
  //     reader.onload = (evt) => {
  //       const text = evt.target.result;
  //       const cues = parseVttOrSrtTimestamps(text);
  //       if (cues.length > 0) {
  //         state.episodeTimeline.cues = cues;
  //         state.episodeTimeline.transcriptSource = 'Upload';
  //         const dur = (elements.audio && elements.audio.duration) ? elements.audio.duration : state.episodeTimeline.duration;
  //         state.episodeTimeline.bars = deriveBarsFromCues(cues, dur, TIMELINE_BAR_COUNT);
  //         state.episodeTimeline.segments = deriveSegmentsFromCues(cues, dur);

  //         if (state.currentEpisode) {
  //           try {
  //             storage.setItem('anypod_timeline_' + state.currentEpisode.guid, JSON.stringify({
  //               bars: state.episodeTimeline.bars,
  //               segments: state.episodeTimeline.segments,
  //               cues: cues,
  //               transcriptSource: 'Upload'
  //             }));
  //           } catch (_) {}
  //           saveTimelineToCommunityCache(state.currentEpisode, dur, state.episodeTimeline.bars, state.episodeTimeline.segments, 'upload');
  //         }

  //         renderWaveformChart();
  //         renderTranscriptView();
  //       }
  //     };
  //     reader.readAsText(file);
  //   });
  // }

  function toggleCurrentPlayback() {
    if (state.currentEpisode) {
      toggleEpisodePlayback(state.currentEpisode);
    } else if (state.filteredEpisodes && state.filteredEpisodes.length > 0) {
      toggleEpisodePlayback(state.filteredEpisodes[0]);
    } else if (state.allEpisodes && state.allEpisodes.length > 0) {
      toggleEpisodePlayback(state.allEpisodes[0]);
    }
  }

  function seekRelative(offset) {
    if (state.activeEngine === 'audio' && elements.audio) {
      const dur = elements.audio.duration || 0;
      const cur = elements.audio.currentTime || 0;
      elements.audio.currentTime = Math.max(0, Math.min(dur || Infinity, cur + offset));
      updateProgress();
      if (state.experimentalSettings.enableVisualizer) renderWaveformChart();
    } else if (state.activeEngine === 'youtube' && state.ytPlayer && state.ytPlayer.getCurrentTime) {
      const cur = state.ytPlayer.getCurrentTime();
      state.ytPlayer.seekTo(Math.max(0, cur + offset), true);
      updateProgress();
      if (state.experimentalSettings.enableVisualizer) renderWaveformChart();
    }
  }

  function adjustPlayerVolume(delta) {
    if (elements.audio) {
      const newVol = Math.max(0, Math.min(1, elements.audio.volume + delta));
      elements.audio.volume = newVol;
      syncVolumeUI(newVol, elements.audio.muted);
      showStatus(`Volume ${Math.round(newVol * 100)}%`);
    }
  }

  function syncVolumeUI(vol, isMuted) {
    const effectiveVol = isMuted ? 0 : vol;
    const pct = Math.round(effectiveVol * 100);

    if (elements.volumeSlider) {
      elements.volumeSlider.value = isMuted ? 0 : vol;
    }
    if (elements.volumePercentLabel) {
      elements.volumePercentLabel.textContent = `${pct}%`;
    }

    const isZero = effectiveVol === 0 || isMuted;
    const isLow = effectiveVol > 0 && effectiveVol < 0.5 && !isMuted;
    const isHigh = effectiveVol >= 0.5 && !isMuted;

    [elements.btnPlayerVolume, elements.btnMiniVolume].forEach(btn => {
      if (!btn) return;
      const iconHigh = btn.querySelector('.icon-vol-high');
      const iconLow = btn.querySelector('.icon-vol-low');
      const iconMute = btn.querySelector('.icon-vol-mute');

      if (iconHigh) iconHigh.classList.toggle('hidden', !isHigh);
      if (iconLow) iconLow.classList.toggle('hidden', !isLow);
      if (iconMute) iconMute.classList.toggle('hidden', !isZero);
    });
  }

  function toggleVolumePopover(targetAnchor) {
    if (!elements.volumePopover) return;
    const card = elements.volumePopover;
    const isHidden = card.classList.contains('hidden');

    if (isHidden) {
      // Move popover into targetAnchor container if needed for proper positioning
      if (targetAnchor && card.parentElement !== targetAnchor) {
        targetAnchor.appendChild(card);
      }
      card.classList.remove('hidden');
      if (elements.audio) {
        syncVolumeUI(elements.audio.volume, elements.audio.muted);
      }
    } else {
      card.classList.add('hidden');
    }
  }

  if (elements.btnPlayerVolume) {
    elements.btnPlayerVolume.addEventListener('click', (e) => {
      e.stopPropagation();
      const wrap = elements.btnPlayerVolume.closest('.volume-popover-wrap');
      toggleVolumePopover(wrap);
    });
  }

  if (elements.btnMiniVolume) {
    elements.btnMiniVolume.addEventListener('click', (e) => {
      e.stopPropagation();
      const wrap = elements.btnMiniVolume.closest('.volume-popover-wrap');
      toggleVolumePopover(wrap);
    });
  }

  if (elements.volumeSlider) {
    elements.volumeSlider.addEventListener('input', (e) => {
      const val = parseFloat(e.target.value);
      if (elements.audio) {
        elements.audio.volume = val;
        if (val > 0 && elements.audio.muted) elements.audio.muted = false;
        syncVolumeUI(val, elements.audio.muted);
      }
    });
  }

  if (elements.btnVolumeMute) {
    elements.btnVolumeMute.addEventListener('click', (e) => {
      e.stopPropagation();
      togglePlayerMute();
    });
  }

  // Dismiss volume popover when clicking outside
  document.addEventListener('click', (e) => {
    if (elements.volumePopover && !elements.volumePopover.classList.contains('hidden')) {
      if (!e.target.closest('.volume-popover-wrap') && !e.target.closest('#volume-popover')) {
        elements.volumePopover.classList.add('hidden');
      }
    }
  });

  function togglePlayerMute() {
    if (elements.audio) {
      elements.audio.muted = !elements.audio.muted;
      syncVolumeUI(elements.audio.volume, elements.audio.muted);
      showStatus(elements.audio.muted ? 'Muted' : 'Unmuted');
    }
  }

  // Storage permission banner actions
  if (elements.btnRetryStorage) {
    elements.btnRetryStorage.addEventListener('click', async () => {
      // Try requesting storage access first in case the browser allows programmatic prompt
      if (typeof document.requestStorageAccess === 'function') {
        try { await document.requestStorageAccess(); } catch (_) {}
      }
      if (navigator.storage && typeof navigator.storage.persist === 'function') {
        try { await navigator.storage.persist(); } catch (_) {}
      }

      try {
        const testKey = '__storage_test__';
        window.localStorage.setItem(testKey, '1');
        window.localStorage.removeItem(testKey);
        isStorageBlocked = false;
        if (elements.storagePermissionBanner) elements.storagePermissionBanner.classList.add('hidden');
        showStatus('Storage access enabled! Reloading to load your saved data...');
        setTimeout(() => window.location.reload(), 600);
      } catch (_) {
        showStatus('Still blocked. Please click the crossed eye icon (🚫👁️) in your Chrome URL bar and choose "Allow".');
      }
    });
  }

  if (elements.btnDismissStorage) {
    elements.btnDismissStorage.addEventListener('click', () => {
      if (elements.storagePermissionBanner) elements.storagePermissionBanner.classList.add('hidden');
    });
  }

  // Modern 2026 Player Keyboard Shortcuts (Spotify / Apple Podcasts / YouTube UX)
  document.addEventListener('keydown', (e) => {
    // 1. Modals & Detail Navigation Escape
    if (e.key === 'Escape') {
      if (elements.showNotesModal && !elements.showNotesModal.classList.contains('hidden')) {
        closeShowNotes();
        return;
      } else if (elements.queueModal && !elements.queueModal.classList.contains('hidden')) {
        closeQueueModal();
        return;
      } else if (elements.sleepModal && !elements.sleepModal.classList.contains('hidden')) {
        closeSleepModal();
        return;
      } else if (elements.addModal && !elements.addModal.classList.contains('hidden')) {
        closeAddModal();
        return;
      } else if (elements.confirmModal && !elements.confirmModal.classList.contains('hidden')) {
        elements.confirmModal.classList.add('hidden');
        return;
      } else if (state.activeFeedDetailUrl) {
        navigateBack();
        return;
      }
    }

    // Ignore when user is actively typing in inputs or contenteditable areas
    const target = e.target;
    const tag = (target && target.tagName ? target.tagName : '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select' || (target && target.isContentEditable)) {
      return;
    }
    // Ignore OS-level modifier combos (Cmd+C, Ctrl+V, Alt+Tab, etc.)
    if (e.metaKey || e.ctrlKey || e.altKey) {
      return;
    }

    // 2. Play / Pause: Space or 'k' (prevents page scrolling on Space)
    if (e.code === 'Space' || e.key === ' ' || e.key === 'k' || e.key === 'K') {
      e.preventDefault();
      toggleCurrentPlayback();
      return;
    }

    // 3. Skip 10s: ArrowLeft / ArrowRight or 'j' / 'l'
    if (!e.shiftKey && (e.key === 'ArrowLeft' || e.key === 'j' || e.key === 'J')) {
      e.preventDefault();
      seekRelative(-10);
      return;
    }
    if (!e.shiftKey && (e.key === 'ArrowRight' || e.key === 'l' || e.key === 'L')) {
      e.preventDefault();
      seekRelative(10);
      return;
    }

    // 4. Next / Previous Episode: Shift + ArrowRight / Shift + ArrowLeft, or 'n' / 'p'
    if ((e.shiftKey && e.key === 'ArrowRight') || e.key === 'n' || e.key === 'N') {
      e.preventDefault();
      skipToNextEpisode(false);
      return;
    }
    if ((e.shiftKey && e.key === 'ArrowLeft') || e.key === 'p' || e.key === 'P') {
      e.preventDefault();
      if (state.activeEngine === 'audio' && elements.audio) {
        elements.audio.currentTime = 0;
      } else if (state.activeEngine === 'youtube' && state.ytPlayer && state.ytPlayer.seekTo) {
        state.ytPlayer.seekTo(0, true);
      }
      updateProgress();
      if (state.experimentalSettings.enableVisualizer) renderWaveformChart();
      return;
    }

    // 5. Volume Control: ArrowUp / ArrowDown
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      adjustPlayerVolume(0.05);
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      adjustPlayerVolume(-0.05);
      return;
    }

    // 6. Mute Toggle: 'm'
    if (e.key === 'm' || e.key === 'M') {
      e.preventDefault();
      togglePlayerMute();
      return;
    }
  });

  elements.opmlFileInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) importOpml(e.target.files[0]);
  });
  elements.btnExportOpml.addEventListener('click', exportOpml);

  if (elements.btnLoadDefaults) {
    elements.btnLoadDefaults.addEventListener('click', async () => {
      showStatus('Adding recommended starter feeds...');
      const searchTerms = ["NASA's Curious Universe", "The Climate Question", "Radiolab", "Forschung aktuell"];
      for (const term of searchTerms) {
        try {
          let data = null;
          try {
            const res = await fetch(`/api/search-directory?term=${encodeURIComponent(term)}&limit=1`);
            if (res.ok) data = await res.json();
          } catch (_) {}

          // if (!data || !data.results || data.results.length === 0) {
          //   try {
          //     const res = await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(term)}&entity=podcast&limit=1`);
          //     if (res.ok) data = await res.json();
          //   } catch (_) {}
          // }

          if (data && data.results && data.results[0] && data.results[0].feedUrl) {
            const feedUrl = data.results[0].feedUrl;
            if (!state.feeds.includes(feedUrl)) {
              state.feeds.push(feedUrl);
              saveFeedToD1(feedUrl, data.results[0].collectionName, data.results[0].artworkUrl600);
            }
          }
        } catch (e) {}
      }

      saveFeedsToStorage();
      refreshAllFeeds();
    });
  }

  // Replace elements.btnClearDownloads listener:
  if (elements.btnClearDownloads) {
    elements.btnClearDownloads.addEventListener('click', () => {
      const count = Object.keys(state.downloadedEpisodes || {}).length;
      if (count === 0) return;
      openConfirmDialog({
        title: 'Remove Downloads',
        message: `Remove all ${count} downloaded podcast episodes from this device?`,
        actionLabel: 'Remove All',
        onConfirm: () => {
          clearAllDownloads();
        }
      });
    });
  }

  const btnRefreshAllFeeds = document.getElementById('btn-refresh-all-feeds');
  if (btnRefreshAllFeeds) {
    btnRefreshAllFeeds.addEventListener('click', async () => {
      try {
        await refreshAllFeeds();
      } catch (err) {
        console.error('[Refresh All Feeds Error]:', err);
        showStatus('Failed to update some feeds.');
        setTimeout(hideStatus, 2500);
      }
    });
  }

  if (elements.btnReloadCache) {
    elements.btnReloadCache.addEventListener('click', async () => {
      showStatus('Refreshing app cache & checking updates...');
      try {
        if ('caches' in window) {
          const keys = await caches.keys();
          await Promise.all(
            keys.map(k => k !== 'anypod-audio-v1' ? caches.delete(k) : Promise.resolve())
          );
        }
        if ('serviceWorker' in navigator) {
          const registrations = await navigator.serviceWorker.getRegistrations();
          for (const reg of registrations) {
            await reg.update();
          }
        }
      } catch (err) {
        console.warn('Cache refresh error:', err);
      }
      window.location.reload(true);
    });
  }

  // Diagnostics & Live Session Logs in Settings
  const btnCopyDiagReport = document.getElementById('btn-copy-diag-report');
  if (btnCopyDiagReport) {
    btnCopyDiagReport.addEventListener('click', () => {
      const report = generatePlayerDiagnosticReport();
      navigator.clipboard.writeText(report).then(() => {
        showStatus('Copied live diagnostic report to clipboard');
        logPlayerDiagnostic('diagnostics.copied', 'User copied report from settings');
      }).catch(() => {
        window.prompt('Copy diagnostic report:', report);
      });
    });
  }

  const btnClearDiagLogs = document.getElementById('btn-clear-diag-logs');
  if (btnClearDiagLogs) {
    btnClearDiagLogs.addEventListener('click', () => {
      playerDiagnosticLogs.length = 0;
      updateSettingsTelemetryUI();
      showStatus('Diagnostic logs cleared');
    });
  }

  // Replace elements.btnClearStorage listener:
  if (elements.btnClearStorage) {
    elements.btnClearStorage.addEventListener('click', () => {
      openConfirmDialog({
        title: 'Reset Library & Storage',
        message: 'Are you sure you want to clear all feeds, queue, and stored listening history on this device?',
        actionLabel: 'Reset Everything',
        onConfirm: () => {
          storage.clear();
          if ('caches' in window) {
            caches.delete('anypod-audio-v1').catch(() => {});
          }
          state.downloadedEpisodes = {};
          state.feeds = [];
          state.mutedFeeds = [];
          state.feedMetadata = {};
          state.allEpisodes = [];
          state.filteredEpisodes = [];
          state.queue = [];
          state.currentEpisode = null;
          state.playbackStatus = 'idle';
          if (elements.playerBar) elements.playerBar.classList.remove('active-episode');
          document.body.classList.remove('has-active-episode', 'has-mini-player', 'has-full-player');
          pauseCurrentEngine();
          syncPlaybackButtons();
          updateFeedCountUI();
          updateQueueUI();
          updateDownloadedCountUI();
          renderContinueShelf();
          renderTimeline();
          renderFeedsGrid();
        }
      });
    });
  }

  if (elements.btnPlayerShare) {
    elements.btnPlayerShare.addEventListener('click', (e) => {
      e.stopPropagation();
      shareCurrentEpisode();
    });
  }

  if (elements.miniOpenQueue) {
    elements.miniOpenQueue.addEventListener('click', (e) => {
      e.stopPropagation();
      openQueueModal();
    });
  }

  if (elements.miniPlayerShare) {
    elements.miniPlayerShare.addEventListener('click', (e) => {
      e.stopPropagation();
      shareCurrentEpisode();
    });
  }

  if (elements.btnCollapsePlayer) {
    elements.btnCollapsePlayer.addEventListener('click', () => {
      setPlayerCollapsed(true);
    });
  }

  if (elements.miniToggle) {
    elements.miniToggle.addEventListener('click', (e) => {
      e.stopPropagation();
      setPlayerCollapsed(false);
    });
  }

  if (elements.miniExpandZone) {
    elements.miniExpandZone.addEventListener('click', () => {
      setPlayerCollapsed(false);
    });
    elements.miniExpandZone.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        setPlayerCollapsed(false);
      }
    });
  }

  if (elements.miniPlayToggle) {
    elements.miniPlayToggle.addEventListener('click', (e) => {
      e.stopPropagation();
      if (elements.btnPlayToggle) {
        elements.btnPlayToggle.click();
      }
    });
  }

  if (elements.statusBanner) {
    elements.statusBanner.addEventListener('click', () => {
      elements.statusBanner.classList.toggle('is-expanded');
    });
  }

  let lastScrollY = window.scrollY;
  let scrollCollapseTimer = null;

  window.addEventListener('scroll', () => {
    const currentScrollY = Math.max(0, window.scrollY);
    const delta = currentScrollY - lastScrollY;
    lastScrollY = currentScrollY;

    // Ignore bounce / elastic overscroll
    if (currentScrollY <= 0 || delta <= 30) return;

    if (scrollCollapseTimer) return;
    scrollCollapseTimer = setTimeout(() => {
      scrollCollapseTimer = null;
      if (Date.now() - (state._lastPlayerExpandTime || 0) < 3000) return;

      if (document.body.classList.contains('has-active-episode')) {
        if (currentScrollY > 260 && !document.body.classList.contains('has-mini-player')) {
          setPlayerCollapsed(true, false);
        }
      }
    }, 150);
  }, { passive: true });



  wireEmptyStateEvents();
}

function openAddModal() {
  elements.addModal.classList.remove('hidden');
  if (elements.addModalBody) {
    elements.addModalBody.scrollTop = 0;
  }
  if (elements.addModalNav) {
    const links = elements.addModalNav.querySelectorAll('.modal-scroll-link');
    links.forEach((l, idx) => {
      if (idx === 0) l.classList.add('active');
      else l.classList.remove('active');
    });
  }
  if (window.innerWidth > 768 && elements.podcastSearchQuery) {
    elements.podcastSearchQuery.focus();
  }
  if (!elements.podcastSearchQuery.value.trim() && elements.searchDirectoryResults) {
    elements.searchDirectoryResults.innerHTML = buildStarterSuggestionsHTML('all');
    wireStarterSuggestionsEvents(elements.searchDirectoryResults);
  }
  window.history.pushState({ modal: 'add' }, '', window.location.hash);
}

function closeAddModal() {
  setDirectoryEnlarged(false);
  elements.podcastSearchQuery.value = '';
  if (elements.btnClearModalSearch) {
    elements.btnClearModalSearch.classList.add('hidden');
  }
  elements.searchDirectoryResults.innerHTML = '';
  elements.feedUrlInput.value = '';
  if (elements.modalSubgenreChips) {
    elements.modalSubgenreChips.innerHTML = '';
    elements.modalSubgenreChips.classList.add('hidden');
  }
  if (elements.dirResultsTitle) {
    elements.dirResultsTitle.textContent = 'podcasts';
  }
  document.querySelectorAll('#modal-category-chips .category-chip').forEach(c => c.classList.remove('active'));
  if (elements.addModalNav) {
    const links = elements.addModalNav.querySelectorAll('.modal-scroll-link');
    links.forEach((l, idx) => {
      if (idx === 0) l.classList.add('active');
      else l.classList.remove('active');
    });
  }
  if (window.history.state && window.history.state.modal) {
    window.history.back();
  } else if (elements.addModal) {
    elements.addModal.classList.add('hidden');
  }
}

function openSleepModal() {
  updateSleepTimerUI();
  elements.sleepModal.classList.remove('hidden');
  window.history.pushState({ modal: 'sleep' }, '', window.location.hash);
}

function closeSleepModal() {
  if (window.history.state && window.history.state.modal) {
    window.history.back();
  } else if (elements.sleepModal) {
    elements.sleepModal.classList.add('hidden');
  }
}

function showStatus(msg, progressPct = null) {
  if (!elements.statusBanner) return;
  elements.statusBanner.textContent = msg;
  elements.statusBanner.title = msg;
  if (typeof progressPct === 'number') {
    elements.statusBanner.style.setProperty('--progress', `${Math.min(100, Math.max(0, progressPct))}%`);
  } else {
    elements.statusBanner.style.removeProperty('--progress');
  }
  elements.statusBanner.classList.remove('hidden');
}

function hideStatus() {
  if (!elements.statusBanner) return;
  elements.statusBanner.classList.add('hidden');
  elements.statusBanner.classList.remove('is-expanded');
  elements.statusBanner.style.removeProperty('--progress');
}

// ─────────────────────────────────────────────────────────────────────────
// SECTION 28 · Utilities
// ─────────────────────────────────────────────────────────────────────────

const formatTime = window.AnypodShared.formatTime;
const decodeHtmlEntities = window.AnypodShared.decodeHtmlEntities;
const escapeHtml = window.AnypodShared.escapeHtml;

function highlightText(str, query) {
  if (!str) return '';
  const safe = escapeHtml(str);
  if (!query) return safe;
  const q = query.trim();
  if (q.length < 2) return safe;

  const terms = q.split(/\s+/).filter(t => t.length >= 2);
  if (terms.length === 0) return safe;

  const pattern = terms.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
  const regex = new RegExp(`(${pattern})`, 'gi');
  return safe.replace(regex, '<mark class="search-highlight">$1</mark>');
}

function formatHighlightedDesc(fullText, query) {
  if (!fullText) return '';
  // Strip HTML tags for card snippet view if full content was provided
  let cleanText = fullText.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  if (!query || query.trim().length < 2) {
    return escapeHtml(cleanText.length > 240 ? cleanText.substring(0, 240) + '…' : cleanText);
  }
  const q = query.trim();
  const lowerText = cleanText.toLowerCase();
  const terms = q.toLowerCase().split(/\s+/).filter(t => t.length >= 2);

  // Find earliest match index among all query terms
  let matchIdx = -1;
  for (const term of terms) {
    const idx = lowerText.indexOf(term);
    if (idx !== -1 && (matchIdx === -1 || idx < matchIdx)) {
      matchIdx = idx;
    }
  }

  if (matchIdx === -1) {
    return escapeHtml(cleanText.length > 240 ? cleanText.substring(0, 240) + '…' : cleanText);
  }

  if (matchIdx <= 120) {
    const snippet = cleanText.length > 260 ? cleanText.slice(0, 260).trim() + ' …' : cleanText;
    return highlightText(snippet, q);
  }

  const startIdx = Math.max(0, cleanText.lastIndexOf(' ', matchIdx - 35));
  const endIdx = Math.min(cleanText.length, cleanText.indexOf(' ', matchIdx + 160));
  const actualEnd = endIdx === -1 ? cleanText.length : endIdx;

  const prefix = startIdx > 0 ? '… ' : '';
  const suffix = actualEnd < cleanText.length ? ' …' : '';
  const excerpt = prefix + cleanText.slice(startIdx, actualEnd).trim() + suffix;

  return highlightText(excerpt, q);
}

