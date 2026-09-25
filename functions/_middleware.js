/**
 * Cloudflare Pages Middleware
 * 
 * 1. Canonical Domain Redirection:
 *    Redirects 'www.anypod.org' -> 'anypod.org' (HTTP 301 Permanent).
 *    In modern web apps (Spotify, GitHub, Stripe), having both www and apex serve
 *    the app splits localStorage (cached audio, history, downloads) and sessions.
 *    Enforcing apex anypod.org ensures single unified storage, single auth state, and optimal SEO.
 * 
 * 2. Security & Caching headers.
 */

export async function onRequest(context) {
  const url = new URL(context.request.url);

  // Canonical Redirect www.anypod.org -> anypod.org
  if (url.hostname.toLowerCase() === 'www.anypod.org') {
    url.hostname = 'anypod.org';
    return Response.redirect(url.toString(), 301);
  }

  return context.next();
}
