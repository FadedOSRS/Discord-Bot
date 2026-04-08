const crypto = require('crypto');
const http = require('http');

const SESSION_COOKIE = 'th_dash_sess';
const STATE_COOKIE = 'th_dash_oauth_state';
const SESSION_TTL_SECONDS = 60 * 60 * 8; // 8h
const OAUTH_STATE_TTL_SECONDS = 60 * 10; // 10m

function startDashboardServer({
  port,
  host,
  getStatus,
  clientId,
  oauthClientId,
  oauthClientSecret,
  oauthRedirectUri,
  ownerDiscordId,
  sessionSecret,
}) {
  const listenHost = host || '127.0.0.1';
  const oauthId = oauthClientId || clientId || '';
  const oauthEnabled = Boolean(oauthId && oauthClientSecret && oauthRedirectUri && ownerDiscordId);
  const signingSecret = String(sessionSecret || crypto.randomBytes(32).toString('hex'));
  if (!sessionSecret) {
    console.warn('[dashboard] DASHBOARD_SESSION_SECRET not set; generated ephemeral secret (sessions reset on restart).');
  }
  if (!oauthEnabled) {
    console.warn('[dashboard] OAuth owner-only login disabled: set DASHBOARD_DISCORD_CLIENT_ID, DASHBOARD_DISCORD_CLIENT_SECRET, DASHBOARD_DISCORD_REDIRECT_URI, DASHBOARD_OWNER_DISCORD_ID.');
  }

  function htmlPageAuthed() {
    const st = typeof getStatus === 'function' ? getStatus() : {};
    const ready = Boolean(st.botReady);
    const tag = st.tag ? escapeHtml(st.tag) : '—';
    const devUrl = clientId
      ? `https://discord.com/developers/applications/${encodeURIComponent(clientId)}`
      : 'https://discord.com/developers/applications';

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Discord bot · Staff</title>
  <style>
    :root { --gold: #d4a544; --bg: #0f1218; --card: #161b26; --text: #e8e4dc; --muted: #8a9199; --ok: #3fb950; --warn:#d4a544; }
    * { box-sizing: border-box; }
    body { font-family: system-ui, Segoe UI, sans-serif; background: var(--bg); color: var(--text); margin: 0; padding: 2rem 1.25rem; line-height: 1.5; }
    .wrap { max-width: 40rem; margin: 0 auto; }
    h1 { font-size: 1.35rem; font-weight: 700; color: var(--gold); margin: 0 0 0.5rem; }
    .card { background: var(--card); border: 1px solid rgba(212, 165, 68, 0.2); border-radius: 12px; padding: 1.25rem 1.35rem; margin-top: 1rem; }
    .status { display: inline-flex; align-items: center; gap: 0.5rem; font-weight: 600; }
    .dot { width: 10px; height: 10px; border-radius: 50%; background: ${ready ? 'var(--ok)' : 'var(--warn)'}; }
    p { color: var(--muted); margin: 0.75rem 0 0; font-size: 0.95rem; }
    ul { margin: 1rem 0 0; padding-left: 1.2rem; color: var(--muted); font-size: 0.9rem; }
    a { color: var(--gold); }
    .tag { font-family: ui-monospace, monospace; color: var(--text); }
    .logout { margin-top: 1rem; display: inline-block; }
  </style>
</head>
<body>
  <div class="wrap">
    <h1>OSRS community bot</h1>
    <p class="status"><span class="dot" aria-hidden="true"></span> ${ready ? 'Connected to Discord' : 'Starting…'}</p>
    <div class="card">
      <div class="status">Bot: <span class="tag">${tag}</span></div>
      <p>Owner-only dashboard unlocked through Discord OAuth.</p>
      <ul>
        <li>Use slash commands in your server for verification, LFG, mod tools, etc.</li>
        <li>After command changes, run <code>npm run deploy-commands</code> in the bot folder.</li>
        <li>See <code>COMMANDS.md</code> in the bot repo for the full list.</li>
      </ul>
      <p style="margin-top:1rem"><a href="${devUrl}" target="_blank" rel="noopener">Discord Developer Portal →</a></p>
      <a class="logout" href="/logout">Log out</a>
    </div>
  </div>
</body>
</html>`;
  }

  function htmlPageLogin() {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Discord bot · Login</title>
  <style>
    :root { --gold: #d4a544; --bg: #0f1218; --card: #161b26; --text: #e8e4dc; --muted: #8a9199; }
    * { box-sizing: border-box; }
    body { font-family: system-ui, Segoe UI, sans-serif; background: var(--bg); color: var(--text); margin: 0; padding: 2rem 1.25rem; line-height: 1.5; }
    .wrap { max-width: 34rem; margin: 0 auto; }
    .card { background: var(--card); border: 1px solid rgba(212, 165, 68, 0.2); border-radius: 12px; padding: 1.25rem 1.35rem; margin-top: 1rem; }
    h1 { margin: 0 0 0.55rem; color: var(--gold); font-size: 1.3rem; }
    p { color: var(--muted); margin: 0.6rem 0 0; }
    a.btn { display:inline-block; margin-top:1rem; background:#5865f2; color:#fff; text-decoration:none; border-radius:8px; padding:0.55rem 0.9rem; font-weight:700; }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="card">
      <h1>Owner dashboard login</h1>
      <p>Sign in with Discord. Only the configured owner account can access this page.</p>
      <a class="btn" href="/login">Login with Discord</a>
    </div>
  </div>
</body>
</html>`;
  }

  function htmlPageForbidden() {
    return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Forbidden</title></head><body style="font-family:system-ui;background:#0f1218;color:#e8e4dc;padding:1.25rem;"><h1 style="color:#d4a544;">Access denied</h1><p>This Discord account is not allowed to use the bot dashboard.</p><p><a href="/logout" style="color:#d4a544;">Sign out</a></p></body></html>`;
  }

  function sendJson(res, status, body) {
    res.writeHead(status, {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-store',
    });
    res.end(JSON.stringify(body));
  }

  function sendHtml(res, status, html) {
    res.writeHead(status, {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
    });
    res.end(html);
  }

  function sign(payload) {
    return crypto.createHmac('sha256', signingSecret).update(payload).digest('base64url');
  }

  function parseCookies(req) {
    const raw = req.headers.cookie || '';
    const out = {};
    for (const part of raw.split(';')) {
      const i = part.indexOf('=');
      if (i <= 0) continue;
      const k = part.slice(0, i).trim();
      const v = part.slice(i + 1).trim();
      out[k] = decodeURIComponent(v);
    }
    return out;
  }

  function setCookie(res, name, value, maxAgeSeconds) {
    const parts = [`${name}=${encodeURIComponent(value)}`, 'Path=/', 'HttpOnly', 'SameSite=Lax'];
    if (maxAgeSeconds != null) parts.push(`Max-Age=${Math.max(0, Math.floor(maxAgeSeconds))}`);
    res.setHeader('Set-Cookie', [...(res.getHeader('Set-Cookie') || []), parts.join('; ')]);
  }

  function clearCookie(res, name) {
    setCookie(res, name, '', 0);
  }

  function createSession(userId) {
    const now = Math.floor(Date.now() / 1000);
    const exp = now + SESSION_TTL_SECONDS;
    const payload = `${userId}.${exp}`;
    return `${payload}.${sign(payload)}`;
  }

  function verifySession(token) {
    if (!token || typeof token !== 'string') return null;
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const [userId, expRaw, sig] = parts;
    const payload = `${userId}.${expRaw}`;
    if (sig !== sign(payload)) return null;
    const exp = Number(expRaw);
    if (!Number.isFinite(exp) || Math.floor(Date.now() / 1000) > exp) return null;
    return { userId, exp };
  }

  function createOauthState() {
    const nonce = crypto.randomBytes(16).toString('hex');
    const now = Math.floor(Date.now() / 1000);
    const exp = now + OAUTH_STATE_TTL_SECONDS;
    const payload = `${nonce}.${exp}`;
    return `${payload}.${sign(payload)}`;
  }

  function verifyOauthState(token) {
    if (!token || typeof token !== 'string') return false;
    const parts = token.split('.');
    if (parts.length !== 3) return false;
    const [nonce, expRaw, sig] = parts;
    const payload = `${nonce}.${expRaw}`;
    if (sig !== sign(payload)) return false;
    const exp = Number(expRaw);
    if (!Number.isFinite(exp) || Math.floor(Date.now() / 1000) > exp) return false;
    return true;
  }

  async function exchangeCodeForToken(code) {
    const body = new URLSearchParams({
      client_id: oauthId,
      client_secret: String(oauthClientSecret),
      grant_type: 'authorization_code',
      code: String(code),
      redirect_uri: String(oauthRedirectUri),
    });
    const r = await fetch('https://discord.com/api/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
    if (!r.ok) throw new Error(`OAuth token exchange failed (${r.status})`);
    return r.json();
  }

  async function fetchDiscordUser(accessToken) {
    const r = await fetch('https://discord.com/api/users/@me', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!r.ok) throw new Error(`OAuth user fetch failed (${r.status})`);
    return r.json();
  }

  function requireAuth(req, res) {
    const cookies = parseCookies(req);
    const sess = verifySession(cookies[SESSION_COOKIE]);
    if (!sess || sess.userId !== String(ownerDiscordId)) {
      sendHtml(res, 200, htmlPageLogin());
      return null;
    }
    return sess;
  }

  const server = http.createServer(async (req, res) => {
    try {
      const u = new URL(req.url || '/', `http://${req.headers.host || '127.0.0.1'}`);
      const pathname = u.pathname;

      if (req.method === 'GET' && pathname === '/health') {
        const st = typeof getStatus === 'function' ? getStatus() : {};
        sendJson(res, 200, {
          ok: true,
          botReady: Boolean(st.botReady),
          tag: st.tag || null,
          authEnabled: oauthEnabled,
        });
        return;
      }

      if (req.method === 'GET' && pathname === '/logout') {
        clearCookie(res, SESSION_COOKIE);
        clearCookie(res, STATE_COOKIE);
        res.writeHead(302, { Location: '/' });
        res.end();
        return;
      }

      if (!oauthEnabled) {
        if (req.method === 'GET' && (pathname === '/' || pathname === '/index.html')) {
          sendHtml(res, 200, htmlPageAuthed());
          return;
        }
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Not found');
        return;
      }

      if (req.method === 'GET' && pathname === '/login') {
        const state = createOauthState();
        setCookie(res, STATE_COOKIE, state, OAUTH_STATE_TTL_SECONDS);
        const authUrl = new URL('https://discord.com/api/oauth2/authorize');
        authUrl.searchParams.set('client_id', oauthId);
        authUrl.searchParams.set('redirect_uri', String(oauthRedirectUri));
        authUrl.searchParams.set('response_type', 'code');
        authUrl.searchParams.set('scope', 'identify');
        authUrl.searchParams.set('prompt', 'consent');
        authUrl.searchParams.set('state', state);
        res.writeHead(302, { Location: authUrl.toString() });
        res.end();
        return;
      }

      if (req.method === 'GET' && pathname === '/auth/discord/callback') {
        const cookies = parseCookies(req);
        const stateCookie = cookies[STATE_COOKIE] || '';
        const stateQuery = u.searchParams.get('state') || '';
        const code = u.searchParams.get('code') || '';
        clearCookie(res, STATE_COOKIE);
        if (!code || !stateQuery || stateQuery !== stateCookie || !verifyOauthState(stateCookie)) {
          sendHtml(res, 400, '<h1>Invalid OAuth state</h1>');
          return;
        }
        let token;
        let user;
        try {
          token = await exchangeCodeForToken(code);
          user = await fetchDiscordUser(token.access_token);
        } catch (err) {
          console.error('[dashboard] OAuth callback error:', err.message);
          sendHtml(res, 502, '<h1>OAuth failed</h1>');
          return;
        }
        const userId = String(user?.id || '');
        if (!userId || userId !== String(ownerDiscordId)) {
          clearCookie(res, SESSION_COOKIE);
          sendHtml(res, 403, htmlPageForbidden());
          return;
        }
        const session = createSession(userId);
        setCookie(res, SESSION_COOKIE, session, SESSION_TTL_SECONDS);
        res.writeHead(302, { Location: '/' });
        res.end();
        return;
      }

      if (req.method === 'GET' && (pathname === '/' || pathname === '/index.html')) {
        if (!requireAuth(req, res)) return;
        sendHtml(res, 200, htmlPageAuthed());
        return;
      }

      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not found');
    } catch (err) {
      console.error('[dashboard] Request error:', err.message);
      res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Internal server error');
    }
  });

  server.listen(port, listenHost, () => {
    console.log(`[dashboard] http://${listenHost}:${port}/`);
  });

  server.on('error', err => {
    console.error('[dashboard] HTTP server error:', err.message);
  });

  return server;
}

function escapeHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

module.exports = { startDashboardServer };
