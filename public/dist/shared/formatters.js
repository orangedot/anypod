/**
 * shared/formatters.js — Shared Time, Duration, Date, Byte & HTML Formatting Utilities
 * Used across Anypod Main Player (app), DJ Studio (dj), and Workout Sequencer (sets).
 */
(function (global) {
  'use strict';

  const AnypodShared = (global.AnypodShared = global.AnypodShared || {});

  /**
   * Formats seconds into M:SS, MM:SS (if padMinutes=true), or H:MM:SS.
   */
  function formatTime(seconds, padMinutes = false) {
    if (!seconds || !isFinite(seconds) || seconds < 0) {
      return padMinutes ? '00:00' : '0:00';
    }
    const totalSecs = Math.floor(seconds);
    const hrs = Math.floor(totalSecs / 3600);
    const mins = Math.floor((totalSecs % 3600) / 60);
    const secs = totalSecs % 60;
    const secStr = secs < 10 ? `0${secs}` : `${secs}`;
    if (hrs > 0) {
      const minStr = mins < 10 ? `0${mins}` : `${mins}`;
      return `${hrs}:${minStr}:${secStr}`;
    }
    const minOut = padMinutes && mins < 10 ? `0${mins}` : `${mins}`;
    return `${minOut}:${secStr}`;
  }

  /**
   * Parses a duration string ("HH:MM:SS", "MM:SS", or numeric seconds) into seconds.
   */
  function parseDurationSeconds(durationStr) {
    if (typeof durationStr === 'number') {
      return isFinite(durationStr) && durationStr > 0 ? durationStr : 0;
    }
    if (!durationStr || typeof durationStr !== 'string') return 0;
    const parts = durationStr.trim().split(':').map(p => parseFloat(p) || 0);
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
   * Formats a flexible duration value (number or string) into M:SS / H:MM:SS.
   */
  function formatDuration(dur) {
    if (!dur) return '0:00';
    if (typeof dur === 'number') return formatTime(dur);
    const str = String(dur).trim();
    if (str.includes(':')) return str;
    const s = parseFloat(str);
    return isNaN(s) ? str : formatTime(s);
  }

  /**
   * Formats an episode duration for card display (omits zero durations, strips leading "00:").
   */
  function formatEpisodeDuration(durStr) {
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
   * Formats duration into compact human string ("1h 25m", "42m").
   */
  function formatDurationCompact(durStr) {
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
   * Formats a date into a compact relative label ("Today", "Yesterday", "3d ago", "2w ago", "Oct 12").
   */
  function formatCompactDate(dateInput) {
    if (!dateInput) return '';
    const d = new Date(dateInput);
    if (isNaN(d.getTime())) return '';
    const now = new Date();
    const diffSec = Math.floor((now - d) / 1000);
    const diffDays = Math.floor(diffSec / 86400);
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays}d ago`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }

  /**
   * Formats a date into a friendly relative string ("Just now", "5h ago", "Yesterday", "3 months ago").
   */
  function formatHumanRelativeDate(dateInput) {
    if (!dateInput) return '';
    const d = new Date(dateInput);
    if (isNaN(d.getTime())) return '';
    const now = new Date();
    const diffSec = Math.floor((now - d) / 1000);
    if (diffSec < 0 || diffSec < 60) return 'Just now';
    if (diffSec < 3600) {
      const m = Math.floor(diffSec / 60);
      return `${m}m ago`;
    }
    const diffHours = Math.floor(diffSec / 3600);
    if (diffHours < 24) {
      return `${diffHours}h ago`;
    }
    const diffDays = Math.floor(diffSec / 86400);
    if (diffDays === 1) return 'Yesterday';
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
   * Formats byte counts into KB / MB / GB.
   */
  function formatBytes(bytes) {
    if (!bytes || bytes <= 0) return '0 MB';
    const mb = bytes / (1024 * 1024);
    if (mb < 1) {
      const kb = Math.round(bytes / 1024);
      return `${kb} KB`;
    }
    if (mb >= 1024) {
      return `${(mb / 1024).toFixed(2)} GB`;
    }
    return `${mb.toFixed(1)} MB`;
  }

  /**
   * Decodes common HTML entities in RSS titles and descriptions.
   */
  function decodeHtmlEntities(str) {
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
   * Escapes a string for safe HTML insertion after decoding HTML entities.
   */
  function escapeHtml(str) {
    if (!str) return '';
    const decoded = decodeHtmlEntities(str);
    return decoded
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  Object.assign(AnypodShared, {
    formatTime,
    parseDurationSeconds,
    formatDuration,
    formatEpisodeDuration,
    formatDurationCompact,
    formatCompactDate,
    formatHumanRelativeDate,
    formatBytes,
    decodeHtmlEntities,
    escapeHtml
  });
})(window);
