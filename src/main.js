/**
 * @file main.js
 * @description Application bootstrap entry point. Imports modular subsystems,
 * initializes state, elements cache, audio engine, and binds listeners.
 */

import { state } from './state/store.js';
import { initElementsCache } from './ui/dom.js';
import { setupAudioEngines } from './audio/engine.js';
import { initLiveDspGraph } from './audio/live-dsp.js';
import { setupOmnibar } from './ui/omnibar.js';
import { renderTimeline } from './ui/timeline.js';
import { renderFeedsGrid } from './ui/feeds-grid.js';

export function bootstrap() {
  initElementsCache();
  setupAudioEngines();

  // Initialize Omnibar search & quick-add
  setupOmnibar({
    onSubscribe: async (feedUrl, title, artwork) => {
      if (!state.feeds.includes(feedUrl)) {
        state.feeds.push(feedUrl);
        renderFeedsGrid();
      }
    },
    onSelectEpisode: (episode) => {
      // Play episode or show notes
    },
    onFilterChange: (query) => {
      renderTimeline();
    }
  });

  // Attach first-gesture listener for Web Audio DSP
  const onFirstGesture = () => {
    initLiveDspGraph();
    window.removeEventListener('click', onFirstGesture);
    window.removeEventListener('keydown', onFirstGesture);
    window.removeEventListener('touchstart', onFirstGesture);
  };
  window.addEventListener('click', onFirstGesture);
  window.addEventListener('keydown', onFirstGesture);
  window.addEventListener('touchstart', onFirstGesture);

  // Initial views
  renderTimeline();
  renderFeedsGrid();
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootstrap);
  } else {
    bootstrap();
  }
}
