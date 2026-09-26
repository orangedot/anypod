/**
 * @file event.js
 * @description Lightweight CustomEvent dispatcher for pub/sub decoupling.
 */

/**
 * Emits a custom event on the window and document.
 * @param {string} name - The event name.
 * @param {any} [detail] - Optional data to attach to the event.
 */
export function emitEvent(name, detail) {
  if (typeof window === 'undefined') return;
  const event = new CustomEvent(name, { detail });
  window.dispatchEvent(event);
  if (typeof document !== 'undefined') {
    document.dispatchEvent(event);
  }
}

/**
 * Subscribes to a custom event.
 * @param {string} name
 * @param {EventListener} handler
 * @returns {() => void} Unsubscribe function
 */
export function onEvent(name, handler) {
  if (typeof window === 'undefined') return () => {};
  window.addEventListener(name, handler);
  return () => window.removeEventListener(name, handler);
}
