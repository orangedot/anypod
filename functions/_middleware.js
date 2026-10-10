/**
 * Cloudflare Pages Middleware
 * 
 * 1. Canonical Domain Redirection:
 *    Leitet 'www.anypod.org' -> 'anypod.org' weiter (HTTP 301).
 * 
 * 2. Subdomain Routing:
 *    dj.anypod.org liefert an der Root '/' direkt /dj.html aus.
 */

export async function onRequest(context) {
  const url = new URL(context.request.url);
  const hostname = url.hostname.toLowerCase();

  // 1. Canonical Redirect www.anypod.org -> anypod.org
  if (hostname === 'www.anypod.org') {
    url.hostname = 'anypod.org';
    return Response.redirect(url.toString(), 301);
  }

  // 2. Subdomain Redirects to primary origin (ensures unpartitioned IndexedDB / storage access)
  if (hostname === 'dj.anypod.org') {
    const dest = new URL('/dj', 'https://anypod.org');
    dest.search = url.search;
    return Response.redirect(dest.toString(), 301);
  }

  // 3. sets.anypod.org & pulse.anypod.org -> anypod.org/sets
  if (hostname === 'sets.anypod.org' || hostname === 'pulse.anypod.org') {
    const dest = new URL('/sets', 'https://anypod.org');
    dest.search = url.search;
    return Response.redirect(dest.toString(), 301);
  }

  // 4. /dj, /dj/, and /dj.html rewrite directly to /dj.html
  if (url.pathname === '/dj' || url.pathname === '/dj/' || url.pathname === '/dj.html') {
    const assetUrl = new URL('/dj.html', url.origin);
    return context.env.ASSETS.fetch(assetUrl);
  }

  // 5. /audio and /audio/ rewrite directly to /audio.html
  if (url.pathname === '/audio' || url.pathname === '/audio/') {
    const assetUrl = new URL('/audio.html', url.origin);
    return context.env.ASSETS.fetch(assetUrl);
  }

  return context.next();
}