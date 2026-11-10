/**
 * shared/cover-art.js — Quiet placeholder covers for shows without artwork.
 *
 * Returns an SVG data URI: soft warm-stone tint + the show's initials in beige.
 * No icons, no pure-black squares. Deterministic per title so a show always
 * keeps the same cover. Used by the client (app.min.js) and, via
 * scripts/generate_discover_shell.js, by the pre-rendered Discover shell.
 */
function makeCoverArt(title) {
  var palette = [
    ['#2b2724', '#38322d'],
    ['#272a28', '#323632'],
    ['#2a2726', '#3a3330'],
    ['#262829', '#313538'],
    ['#2c2825', '#3b352e'],
    ['#282628', '#352f35']
  ];
  var text = String(title || '').replace(/\([^)]*\)/g, '').trim();
  var words = text.split(/\s+/).filter(function (w) { return /[A-Za-z0-9\u00C0-\u024F]/.test(w); });
  var initials = (words.length > 1 ? words[0][0] + words[1][0] : (words[0] || '?').slice(0, 2)).toUpperCase();

  var hash = 0;
  for (var i = 0; i < text.length; i++) hash = (hash * 31 + text.charCodeAt(i)) >>> 0;
  var pair = palette[hash % palette.length];

  var svg =
    '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120" viewBox="0 0 120 120">' +
    '<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">' +
    '<stop offset="0" stop-color="' + pair[0] + '"/><stop offset="1" stop-color="' + pair[1] + '"/>' +
    '</linearGradient></defs>' +
    '<rect width="120" height="120" fill="url(#g)"/>' +
    '<text x="60" y="68" text-anchor="middle" font-family="-apple-system,Segoe UI,Roboto,sans-serif" ' +
    'font-size="34" font-weight="600" letter-spacing="1" fill="#d8cdbe" fill-opacity="0.78">' +
    initials.replace(/&/g, '&amp;').replace(/</g, '&lt;') + '</text></svg>';

  return 'data:image/svg+xml,' + encodeURIComponent(svg);
}
