/**
 * @file url.js
 * @description External URL validation with hostname security checks and port whitelisting.
 */

const ALLOWED_PORTS = new Set([80, 443, 8080, 8443]);

/**
 * Validates that an input URL is an external HTTP/HTTPS URL with an allowed port.
 * Blocks private/local networks, loopbacks, and invalid schemes.
 * 
 * @param {string} urlStr
 * @returns {boolean}
 */
export function isValidExternalUrl(urlStr) {
  if (!urlStr || typeof urlStr !== 'string') return false;
  try {
    const parsed = new URL(urlStr.trim());
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return false;
    }

    const host = parsed.hostname.toLowerCase();
    if (!host || host === 'localhost' || host.endsWith('.local') || host.endsWith('.internal') || host.endsWith('.lan')) {
      return false;
    }

    if (host === '127.0.0.1' || host === '::1' || host === '0.0.0.0') {
      return false;
    }

    // Check IPv4 private ranges
    const ipv4Match = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
    if (ipv4Match) {
      if ([ipv4Match[1], ipv4Match[2], ipv4Match[3], ipv4Match[4]].some(s => s.length > 1 && s.startsWith('0'))) {
        return false;
      }
      const octets = [Number(ipv4Match[1]), Number(ipv4Match[2]), Number(ipv4Match[3]), Number(ipv4Match[4])];
      if (octets.some(o => o < 0 || o > 255)) return false;
      if (octets[0] === 127 || octets[0] === 0 || octets[0] === 10) return false;
      if (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) return false;
      if (octets[0] === 192 && octets[1] === 168) return false;
      if (octets[0] === 169 && octets[1] === 254) return false;
      if (octets[0] === 100 && octets[1] >= 64 && octets[1] <= 127) return false;
    }

    // Check port against whitelist {80, 443, 8080, 8443}
    const port = parsed.port ? parseInt(parsed.port, 10) : (parsed.protocol === 'https:' ? 443 : 80);
    if (!ALLOWED_PORTS.has(port)) {
      return false;
    }

    return true;
  } catch (_) {
    return false;
  }
}
