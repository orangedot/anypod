/**
 * @file modals.js
 * @description Modals manager: Queue (drag/drop), sleep timer, and confirmation dialogs.
 */

import { state } from '../state/store.js';
import { elements } from './dom.js';

export function openModal(modalEl) {
  if (modalEl) modalEl.classList.remove('hidden');
}

export function closeModal(modalEl) {
  if (modalEl) modalEl.classList.add('hidden');
}

export function openConfirmDialog({ title, message, onConfirm }) {
  if (elements.confirmModalMsg) elements.confirmModalMsg.textContent = message || 'Are you sure?';
  openModal(elements.confirmModal);

  const cleanup = () => {
    closeModal(elements.confirmModal);
    elements.btnConfirmDelete?.removeEventListener('click', handleConfirm);
    elements.btnConfirmCancel?.removeEventListener('click', cleanup);
  };

  const handleConfirm = () => {
    cleanup();
    if (onConfirm) onConfirm();
  };

  elements.btnConfirmDelete?.addEventListener('click', handleConfirm, { once: true });
  elements.btnConfirmCancel?.addEventListener('click', cleanup, { once: true });
}
