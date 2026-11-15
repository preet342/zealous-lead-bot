const crypto = require('crypto');

const AUTH_CONFIG = {
  username: process.env.ADMIN_USERNAME || 'biswa342',
  password: process.env.ADMIN_PASSWORD || 'Biswa4404@',
  cookieName: 'bwb_auth_token',
  secret: process.env.SESSION_SECRET || 'bwb_media_secret_key_998877665544332211',
  maxAgeSeconds: 7 * 24 * 60 * 60 // 7 days
};

/**
 * Validate username and password
 */
function validateCredentials(user, pass) {
  if (!user || !pass) return false;
  return user.trim() === AUTH_CONFIG.username && pass === AUTH_CONFIG.password;
}

/**
 * Generate signed session token: <base64payload>.<signature>
 */
function createSessionToken(username) {
  const payload = JSON.stringify({
    u: username,
    exp: Date.now() + (AUTH_CONFIG.maxAgeSeconds * 1000)
  });
  const b64Payload = Buffer.from(payload).toString('base64url');
  const hmac = crypto.createHmac('sha256', AUTH_CONFIG.secret);
  hmac.update(b64Payload);
  const sig = hmac.digest('base64url');
  return `${b64Payload}.${sig}`;
}

/**
 * Verify signed session token
 */
function verifySessionToken(token) {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;

  const [b64Payload, sig] = parts;
  const hmac = crypto.createHmac('sha256', AUTH_CONFIG.secret);
  hmac.update(b64Payload);
  const expectedSig = hmac.digest('base64url');

  if (sig !== expectedSig) return null;

  try {
    const jsonStr = Buffer.from(b64Payload, 'base64url').toString('utf8');
    const data = JSON.parse(jsonStr);
    if (!data || !data.exp || Date.now() > data.exp) {
      return null; // Expired
    }
    return data;
  } catch (err) {
    return null;
  }
}

/**
 * Helper to parse cookies from raw Cookie header string
 */
function parseCookies(cookieHeader = '') {
  const list = {};
  if (!cookieHeader) return list;
  cookieHeader.split(';').forEach(cookie => {
    let [name, ...rest] = cookie.split('=');
    name = name?.trim();
    if (!name) return;
    const value = rest.join('=').trim();
    list[name] = decodeURIComponent(value);
  });
  return list;
}

/**
 * Express Middleware to require authentication on protected routes
 */
function requireAuth(req, res, next) {
  const cookies = parseCookies(req.headers.cookie);
  const token = cookies[AUTH_CONFIG.cookieName];
  const session = verifySessionToken(token);

  if (session && session.u) {
    req.user = { username: session.u };
    return next();
  }

  // Not authenticated
  const isApi = req.path.startsWith('/api/') || 
                req.xhr || 
                (req.headers.accept && req.headers.accept.includes('application/json'));

  if (isApi) {
    return res.status(401).json({ success: false, error: 'Unauthorized. Please login first.' });
  }

  // Web redirect to login
  const returnUrl = req.originalUrl || '/groups';
  return res.redirect(`/login?redirect=${encodeURIComponent(returnUrl)}`);
}

module.exports = {
  AUTH_CONFIG,
  validateCredentials,
  createSessionToken,
  verifySessionToken,
  parseCookies,
  requireAuth
};
