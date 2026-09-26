import { hashToken, timingSafeEqual } from './utils.js';

/**
 * Constant-time verification of a provided token against a stored token hash.
 * Uses Web Crypto SHA-256 and constant-time buffer comparison.
 *
 * @param {string} provided - The raw token string supplied by client.
 * @param {string} storedHash - The SHA-256 hash stored in D1/SQLite.
 * @returns {Promise<boolean>} True if matching, false otherwise.
 */
export async function verifyToken(provided, storedHash) {
  if (!provided || !storedHash) return false;
  try {
    const providedHash = await hashToken(String(provided).trim());
    return timingSafeEqual(providedHash, storedHash);
  } catch (_) {
    return false;
  }
}
