// Copyright (c) 2024-2026 nich (@nichxbt). Licensed under Apache-2.0.
// @author nich (@nichxbt)

/** Local dashboard access is a UI browsing mode, not an authenticated account. */
export function isLocalDashboardEnabled() {
  return process.env.XACTIONS_LOCAL_DASHBOARD === '1' && process.env.NODE_ENV !== 'production';
}

/** Reject remote connections and foreign browser origins in the local launcher. */
export function localDashboardGuard(req, res, next) {
  if (!isLocalDashboardEnabled()) return next();

  const peer = req.socket.remoteAddress;
  const loopback = peer === '127.0.0.1' || peer === '::1' || peer === '::ffff:127.0.0.1';
  let allowedHost = false;
  try {
    const host = new URL(`http://${req.headers.host}`);
    allowedHost = ['127.0.0.1', 'localhost', '[::1]'].includes(host.hostname)
      && !host.username && !host.password && host.pathname === '/' && !host.search && !host.hash
      && Number(host.port || 80) === req.socket.localPort;
  } catch { /* An invalid Host is never a local dashboard request. */ }

  const origin = req.headers.origin;
  const sameOrigin = !origin || origin === `${req.protocol}://${req.headers.host}`;
  if (!loopback || !allowedHost || !sameOrigin || req.headers['sec-fetch-site'] === 'cross-site') {
    return res.status(403).json({ error: 'This dashboard is available only from its local browser origin.' });
  }
  next();
}
