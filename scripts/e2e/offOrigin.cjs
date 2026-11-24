// Records any request that leaves the serving origin (the owner's managed Chromebook blocks GitHub and most CDNs,
// so the game must never reach outside the host that served it). Pushes a message into `errors` for each one.
module.exports = function watchOffOrigin(target, base, errors) {
  const origin = new URL(base).origin;
  const wsOrigin = origin.replace(/^http/, 'ws');
  const check = (url) => {
    if (url.startsWith(origin) || url.startsWith(wsOrigin) || url.startsWith('data:') || url.startsWith('blob:')) return;
    errors.push('off-origin request: ' + url);
    console.log('[off-origin]', url);
  };
  target.on('request', (r) => check(r.url()));
  target.on('websocket', (ws) => check(ws.url()));
  target.on('console', (m) => {
    if (m.text().includes('Content Security Policy')) {
      errors.push('CSP: ' + m.text());
      console.log('[csp]', m.text().slice(0, 300));
    }
  });
};
