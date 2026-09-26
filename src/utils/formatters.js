/**
 * @file formatters.js
 * @description Pure formatting functions for time, durations, dates, byte sizes, and HTML sanitization.
 */

/**
 * Formats seconds into a digital timestamp string (e.g. "12:34" or "1:02:03").
 * @param {number} seconds
 * @returns {string}
 */
export function formatTime(seconds) {
  if (!seconds || isNaN(seconds)) return '0:00';
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  const secStr = secs < 10 ? `0${secs}` : `${secs}`;
  if (hrs > 0) {
    const minStr = mins < 10 ? `0${mins}` : `${mins}`;
    return `${hrs}:${minStr}:${secStr}`;
  }
  return `${mins}:${secStr}`;
}

/**
 * Parses duration strings (HH:MM:SS or MM:SS or integer seconds) to total seconds.
 * @param {string|number} durStr
 * @returns {number}
 */
export function parseDurationSeconds(durStr) {
  if (!durStr) return 0;
  if (typeof durStr === 'number') return durStr;
  const str = String(durStr).trim();
  if (!str.includes(':')) {
    const parsed = parseFloat(str);
    return isNaN(parsed) ? 0 : parsed;
  }
  const parts = str.split(':').map(Number);
  if (parts.some(isNaN)) return 0;
  if (parts.length === 3) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  } else if (parts.length === 2) {
    return parts[0] * 60 + parts[1];
  } else if (parts.length === 1) {
    return parts[0];
  }
  return 0;
}

/**
 * Formats a date into a compact string (e.g. "today", "yesterday", "3d ago", "2w ago").
 * @param {string|number|Date} dateInput
 * @returns {string}
 */
export function formatCompactDate(dateInput) {
  if (!dateInput) return '';
  const d = new Date(dateInput);
  if (isNaN(d.getTime())) return '';
  const now = new Date();
  const diffSec = Math.floor((now - d) / 1000);
  const diffDays = Math.floor(diffSec / 86400);
  if (diffDays === 0) return 'today';
  if (diffDays === 1) return 'yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }).toLowerCase();
}

/**
 * Formats durations compactly (e.g. "45m", "1h 15m").
 * @param {string|number} durStr
 * @returns {string}
 */
export function formatDurationCompact(durStr) {
  if (!durStr) return '';
  const sec = parseDurationSeconds(durStr);
  if (!sec) return '';
  const mins = Math.round(sec / 60);
  if (mins >= 60) {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
  }
  return `${mins}m`;
}

/**
 * Formats dates into human-relative phrases in lowercase.
 * @param {string|number|Date} dateInput
 * @returns {string}
 */
export function formatHumanRelativeDate(dateInput) {
  if (!dateInput) return '';
  const d = new Date(dateInput);
  if (isNaN(d.getTime())) return '';
  const now = new Date();
  const diffSec = Math.floor((now - d) / 1000);
  if (diffSec < 0 || diffSec < 60) return 'just now';
  if (diffSec < 3600) {
    const m = Math.floor(diffSec / 60);
    return `${m}m ago`;
  }
  const diffHours = Math.floor(diffSec / 3600);
  if (diffHours < 24) {
    return `${diffHours}h ago`;
  }
  const diffDays = Math.floor(diffSec / 86400);
  if (diffDays === 1) return 'yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 14) return '1 week ago';
  if (diffDays < 30) {
    const weeks = Math.floor(diffDays / 7);
    return `${weeks} weeks ago`;
  }
  if (diffDays < 60) return '1 month ago';
  if (diffDays < 365) {
    const months = Math.floor(diffDays / 30);
    return `${months} months ago`;
  }
  const years = Math.floor(diffDays / 365);
  return `${years} ${years === 1 ? 'year' : 'years'} ago`;
}

/**
 * Cleans and normalizes episode duration display strings.
 * @param {string|number} durStr
 * @returns {string}
 */
export function formatEpisodeDuration(durStr) {
  if (!durStr) return '';
  const trimmed = String(durStr).trim();
  if (trimmed === '0:00' || trimmed === '0' || trimmed === '00:00' || trimmed === '00:00:00') {
    return '';
  }
  if (trimmed.startsWith('00:')) {
    return trimmed.slice(3);
  }
  const sec = parseDurationSeconds(trimmed);
  if (!sec || sec <= 0) return '';
  return formatTime(sec);
}

/**
 * Formats raw byte numbers to MB or GB strings in lowercase.
 * @param {number} bytes
 * @returns {string}
 */
export function formatBytes(bytes) {
  if (!bytes || isNaN(bytes) || bytes <= 0) return '0 mb';
  const mb = bytes / (1024 * 1024);
  if (mb < 1000) {
    return `${mb.toFixed(1)} mb`;
  }
  return `${(mb / 1024).toFixed(2)} gb`;
}

/**
 * Decodes HTML entities into normal text characters.
 * @param {string} str
 * @returns {string}
 */
export function decodeHtmlEntities(str) {
  if (!str) return '';
  return String(str)
    .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(Number(dec)))
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/&ndash;/g, '–')
    .replace(/&mdash;/g, '—')
    .replace(/&hellip;/g, '…')
    .replace(/&bull;/g, '•')
    .replace(/&rsquo;/g, '’')
    .replace(/&lsquo;/g, '‘')
    .replace(/&rdquo;/g, '”')
    .replace(/&ldquo;/g, '“')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

/**
 * Escapes unsafe HTML characters to prevent XSS.
 * @param {string} str
 * @returns {string}
 */
export function escapeHtml(str) {
  if (!str) return '';
  const decoded = decodeHtmlEntities(str);
  return decoded
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
