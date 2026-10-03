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

  // 2. dj.anypod.org bedient die DJ-App an der Root
  if (hostname === 'dj.anypod.org') {
    if (url.pathname === '/' || url.pathname === '/index.html') {
      // Direktes Umschreiben des Pfads auf das Ziel-Asset
      const assetUrl = new URL('/dj.html', url.origin);
      return context.env.ASSETS.fetch(assetUrl);
    }
  }

  return context.next();
}