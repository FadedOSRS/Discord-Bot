const DEFAULT_TIMEOUT_MS = 15_000;

function normalizeSiteUrl(raw) {
  let s = String(raw || '').trim();
  const hash = s.indexOf('#');
  if (hash >= 0) s = s.slice(0, hash).trim();
  return s.replace(/\/+$/, '');
}

function getTerpinheimerConfig() {
  const base = normalizeSiteUrl(process.env.TERPINHEIMER_SITE_URL || '');
  const secret = String(process.env.TERPINHEIMER_EVENTS_SECRET || '').trim();
  if (!base || !secret) return null;
  return { base, secret };
}

/**
 * POST JSON to {TERPINHEIMER_SITE_URL}/api/custom-events.
 * Body includes CLAN_EVENTS_SECRET (same value as the site’s CLAN_EVENTS_SECRET / TERPINHEIMER_EVENTS_SECRET)
 * plus an event object the site can read.
 *
 * @param {object} eventFields — no secret; caller provides name, times, podium, etc.
 * @returns {Promise<{ skipped?: true, ok: boolean, status?: number, detail?: string, error?: string }>}
 */
async function postTerpinheimerCustomEvent(eventFields) {
  const cfg = getTerpinheimerConfig();
  if (!cfg) return { skipped: true, ok: true };

  const url = `${cfg.base}/api/custom-events`;
  const body = {
    CLAN_EVENTS_SECRET: cfg.secret,
    ...eventFields
  };

  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), DEFAULT_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body),
      signal: ac.signal
    });
    const text = await res.text();
    if (!res.ok) {
      return { ok: false, status: res.status, detail: text.slice(0, 500) };
    }
    return { ok: true, status: res.status };
  } catch (err) {
    const msg = err?.name === 'AbortError' ? 'Request timed out' : String(err?.message || err);
    return { ok: false, error: msg };
  } finally {
    clearTimeout(timer);
  }
}

function shouldSkipDiscordChannelPost() {
  const v = String(process.env.TERPINHEIMER_SKIP_CHANNEL_POST || '').toLowerCase();
  return v === '1' || v === 'true' || v === 'yes';
}

module.exports = {
  getTerpinheimerConfig,
  postTerpinheimerCustomEvent,
  shouldSkipDiscordChannelPost
};
