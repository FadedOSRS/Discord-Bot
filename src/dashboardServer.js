const http = require('http');

/**
 * Minimal staff dashboard served by the bot process (no extra dependencies).
 * Set BOT_DASHBOARD_URL on the Terpinheimer site to this URL (e.g. http://127.0.0.1:3847/).
 */
function startDashboardServer({ port, host, getStatus, clientId }) {
  const listenHost = host || '127.0.0.1';

  function htmlPage() {
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
    :root { --gold: #d4a544; --bg: #0f1218; --card: #161b26; --text: #e8e4dc; --muted: #8a9199; }
    * { box-sizing: border-box; }
    body { font-family: system-ui, Segoe UI, sans-serif; background: var(--bg); color: var(--text); margin: 0; padding: 2rem 1.25rem; line-height: 1.5; }
    .wrap { max-width: 36rem; margin: 0 auto; }
    h1 { font-size: 1.35rem; font-weight: 700; color: var(--gold); margin: 0 0 0.5rem; }
    .card { background: var(--card); border: 1px solid rgba(212, 165, 68, 0.2); border-radius: 12px; padding: 1.25rem 1.35rem; margin-top: 1rem; }
    .status { display: inline-flex; align-items: center; gap: 0.5rem; font-weight: 600; }
    .dot { width: 10px; height: 10px; border-radius: 50%; background: ${ready ? '#3fb950' : '#d4a544'}; }
    p { color: var(--muted); margin: 0.75rem 0 0; font-size: 0.95rem; }
    ul { margin: 1rem 0 0; padding-left: 1.2rem; color: var(--muted); font-size: 0.9rem; }
    a { color: var(--gold); }
    .tag { font-family: ui-monospace, monospace; color: var(--text); }
  </style>
</head>
<body>
  <div class="wrap">
    <h1>OSRS community bot</h1>
    <p class="status"><span class="dot" aria-hidden="true"></span> ${ready ? 'Connected to Discord' : 'Starting…'}</p>
    <div class="card">
      <div class="status">Bot: <span class="tag">${tag}</span></div>
      <p>This page is served by the same Node process as your Discord bot (Terpinheimer site links here when <code>BOT_DASHBOARD_URL</code> is set).</p>
      <ul>
        <li>Use slash commands in your server for verification, LFG, mod tools, etc.</li>
        <li>After command changes, run <code>npm run deploy-commands</code> in the bot folder.</li>
        <li>See <code>COMMANDS.md</code> in the bot repo for the full list.</li>
      </ul>
      <p style="margin-top:1rem"><a href="${devUrl}" target="_blank" rel="noopener">Discord Developer Portal →</a></p>
    </div>
  </div>
</body>
</html>`;
  }

  const server = http.createServer((req, res) => {
    const path = (req.url || '').split('?')[0];

    if (req.method === 'GET' && path === '/health') {
      const st = typeof getStatus === 'function' ? getStatus() : {};
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.end(
        JSON.stringify({
          ok: true,
          botReady: Boolean(st.botReady),
          tag: st.tag || null,
        }),
      );
      return;
    }

    if (req.method === 'GET' && (path === '/' || path === '/index.html')) {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store');
      res.end(htmlPage());
      return;
    }

    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not found');
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
