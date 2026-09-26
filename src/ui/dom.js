/**
 * @file dom.js
 * @description DOM element caching and query helpers.
 */

export const elements = {};

/**
 * Initializes and caches all DOM node references for fast lookups.
 */
export function initElementsCache() {
  if (typeof document === 'undefined') return elements;

  const get = (id) => document.getElementById(id);
  const query = (sel) => document.querySelector(sel);
  const queryAll = (sel) => document.querySelectorAll(sel);

  Object.assign(elements, {
    // Auth & Account
    authModal: get('auth-modal'),
    btnCloseAuth: get('btn-close-auth'),
    btnCancelAuth: get('btn-cancel-auth'),
    magicAuthForm: get('magic-auth-form'),
    magicEmailInput: get('magic-email-input'),
    btnSubmitMagic: get('btn-submit-magic'),
    magicStatusMsg: get('magic-status-msg'),
    userSyncStatus: get('user-sync-status'),
    btnShowLogin: get('btn-show-login'),
    userStatusPill: get('user-status-pill'),
    statusIndicator: get('status-indicator'),
    userEmailLabel: get('user-email-label'),
    btnAccountToggle: get('btn-account-toggle'),

    // Modals
    confirmModal: get('confirm-modal'),
    confirmModalMsg: get('confirm-modal-msg'),
    btnConfirmCancel: get('btn-confirm-cancel'),
    btnConfirmDelete: get('btn-confirm-delete'),

    // Player buttons
    btnPrev15: get('btn-prev-15'),
    btnNext15: get('btn-next-15'),
    btnSkipEpisode: get('btn-skip-episode'),
    btnPlayerMarkPlayed: get('btn-player-mark-played'),
    btnPlayToggle: get('btn-play-toggle'),
    iconPlay: query('.icon-play'),
    iconPause: query('.icon-pause'),
    iconSpinner: query('.icon-spinner'),
    btnSpeedToggle: get('btn-speed-toggle'),
    btnPlayerFav: get('btn-player-fav'),
    btnPlayerShare: get('btn-player-share'),
    btnCollapsePlayer: get('btn-collapse-player'),

    // Navigation & Tabs
    tabs: queryAll('.nav-tab'),
    panels: queryAll('.tab-panel'),
    tabFeeds: get('tab-feeds'),
    tabTimeline: get('tab-timeline'),
    tabFavorites: get('tab-favorites'),
    tabDownloads: get('tab-downloads'),
    tabSettings: get('tab-settings'),
    panelFeeds: get('panel-feeds'),
    panelTimeline: get('panel-timeline'),
    panelFavorites: get('panel-favorites'),
    panelDownloads: get('panel-downloads'),
    panelFeedDetail: get('panel-feed-detail'),
    feedDetailHeader: get('feed-detail-header'),
    feedDetailEpisodes: get('feed-detail-episodes'),
    favoritesEpisodesList: get('favorites-episodes-list'),
    favoritesHeaderCount: get('favorites-header-count'),
    themeBtns: queryAll('.btn-theme'),
    feedCount: get('feed-count'),
    favoritesTabCount: get('favorites-tab-count'),
    downloadsTabCount: get('downloads-tab-count'),
    btnOpenSettings: get('btn-open-settings'),

    // Omnibar & Search
    omnibar: get('omnibar'),
    searchInput: get('omnibar') || get('search-input'),
    searchBarWrap: get('search-bar-wrap'),
    btnClearSearch: get('btn-clear-search'),
    sortOrderSelect: get('sort-order'),
    btnOpenAddModal: get('btn-open-add-modal'),
    btnRefreshAll: get('btn-refresh-all'),
    statusBanner: get('status-banner'),

    // Lists & Containers
    timelineList: get('timeline-list'),
    feedsFilterBar: get('feeds-filter-bar'),
    feedsFilterChips: get('feeds-filter-chips'),
    feedsGrid: get('feeds-grid'),
    continueShelf: get('continue-shelf'),
    continueGrid: get('continue-grid'),
    continueCount: get('continue-count'),
    btnToggleContinue: get('btn-toggle-continue'),
    continueToggleLabel: get('continue-toggle-label'),
    continueStickyBar: get('continue-sticky-bar'),
    btnContinueStickyCollapse: get('btn-continue-sticky-collapse'),
    playedCount: get('played-count'),
    downloadedCount: get('downloaded-count'),
    offlineBadge: get('offline-badge'),

    // Audio element
    audio: get('audio-engine') || get('audio-player'),
    playerBar: get('player-bar'),
    playerTrackInfo: query('.player-track-info'),
    playerArtwork: get('player-artwork'),
    playerTitle: get('player-title'),
    playerPodcast: get('player-podcast'),
    seekBar: get('seek-bar'),
    currentTime: get('current-time'),
    totalDuration: get('total-duration'),

    // Add Podcast Modal
    addModal: get('add-modal'),
    feedUrlInput: get('feed-url-input'),
    btnCloseAdd: get('btn-close-add'),
    btnCancelAdd: get('btn-cancel-add'),
    btnSubmitFeed: get('btn-submit-feed')
  });

  return elements;
}
