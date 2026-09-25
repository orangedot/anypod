/**
 * settings.js – Initialise experimental feature flags.
 *
 * All experimental settings default to OFF for brand-new installs.
 * The values are stored under the same key that app.js already uses
 * (anypod_experimental_settings), so the toggles in Settings reflect
 * the correct state immediately.
 *
 * This script must be loaded BEFORE app.js.
 */

(function () {
  var EXP_KEY = 'anypod_experimental_settings';
  var FIRST_LAUNCH_KEY = 'anypod_first_launch';

  // Only set defaults if this is a fresh install (no first-launch marker).
  if (!localStorage.getItem(FIRST_LAUNCH_KEY)) {
    var defaults = {
      enableVisualizer: false,
      enableAudioClassifier: false,
      autoSkipSpeech: false,
      enableTranscript: false
    };
    localStorage.setItem(EXP_KEY, JSON.stringify(defaults));
    localStorage.setItem(FIRST_LAUNCH_KEY, 'true');
  }
})();
