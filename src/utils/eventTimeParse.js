const { DateTime } = require('luxon');

/** Same regions as `/birthday` — used for `/lfg timezone` choices. */
const COMMON_TIMEZONE_CHOICES = [
  { label: 'US Pacific', value: 'America/Los_Angeles' },
  { label: 'US Mountain', value: 'America/Denver' },
  { label: 'US Central', value: 'America/Chicago' },
  { label: 'US Eastern', value: 'America/New_York' },
  { label: 'Atlantic Canada', value: 'America/Halifax' },
  { label: 'Brazil', value: 'America/Sao_Paulo' },
  { label: 'UK', value: 'Europe/London' },
  { label: 'Central Europe', value: 'Europe/Berlin' },
  { label: 'Eastern Europe', value: 'Europe/Bucharest' },
  { label: 'Turkey', value: 'Europe/Istanbul' },
  { label: 'India', value: 'Asia/Kolkata' },
  { label: 'Pakistan', value: 'Asia/Karachi' },
  { label: 'Bangladesh', value: 'Asia/Dhaka' },
  { label: 'Thailand', value: 'Asia/Bangkok' },
  { label: 'China/Singapore', value: 'Asia/Singapore' },
  { label: 'Japan', value: 'Asia/Tokyo' },
  { label: 'Korea', value: 'Asia/Seoul' },
  { label: 'Australia East', value: 'Australia/Sydney' },
  { label: 'New Zealand', value: 'Pacific/Auckland' },
  { label: 'UTC', value: 'Etc/UTC' }
];

const TZ_ABBR_TO_IANA = {
  UTC: 'Etc/UTC',
  GMT: 'Etc/UTC',
  EST: 'America/New_York',
  EDT: 'America/New_York',
  CST: 'America/Chicago',
  CDT: 'America/Chicago',
  MST: 'America/Denver',
  MDT: 'America/Denver',
  PST: 'America/Los_Angeles',
  PDT: 'America/Los_Angeles'
};

// Formats for full date + time like "Mar 30 8pm" or "March 30 2026 8pm"
const ABSOLUTE_DATE_FORMATS = [
  'MMM d yyyy h:mm a',
  'MMM d yyyy h:mm:ss a',
  'MMM d yyyy H:mm',
  'MMM d yyyy H:mm:ss',
  'MMM d h:mm a', // assume current year
  'MMM d h:mm:ss a',
  'MMM d yyyy ha',
  'MMM d ha',
  'MMMM d yyyy h:mm a',
  'MMMM d yyyy h:mm:ss a',
  'MMMM d h:mm a', // assume current year
  'MMMM d h:mm:ss a',
  'M/d/yyyy h:mm a',
  'M/d/yyyy H:mm',
  'M/d h:mm a', // assume current year, with minutes
  'M/d ha', // assume current year, hour + am/pm (e.g. 3/30 9pm)
  'M/d H:mm'
];

function extractDiscordUnix(raw) {
  const m = String(raw).match(/<t:(\d{9,12})(?::[a-zA-Z])?>/);
  if (!m) return null;
  const sec = Number(m[1]);
  return Number.isFinite(sec) ? sec : null;
}

function parseRelativeUnix(raw) {
  const t = raw.trim().toLowerCase();
  const m = t.match(
    /^in\s+(\d+)\s*(second|seconds|sec|secs|s|minute|minutes|min|mins|m|hour|hours|hr|hrs|h|day|days|d)\b/
  );
  if (!m) return null;
  const n = Number(m[1]);
  if (!Number.isFinite(n) || n < 0) return null;
  const u = m[2];
  let ms = 0;
  if (u === 's' || u.startsWith('sec')) ms = n * 1000;
  else if (u === 'm' || u.startsWith('min')) ms = n * 60 * 1000;
  else if (u === 'h' || u.startsWith('hr') || u.startsWith('hour')) ms = n * 3600 * 1000;
  else ms = n * 86400 * 1000;
  return Math.floor((Date.now() + ms) / 1000);
}

function tryIsoUnix(raw) {
  let dt = DateTime.fromISO(raw, { setZone: true });
  if (dt.isValid) return Math.floor(dt.toSeconds());
  dt = DateTime.fromHTTP(raw);
  if (dt.isValid) return Math.floor(dt.toSeconds());
  const asNum = Number(raw);
  if (/^\d{10}$/.test(raw)) return asNum;
  if (/^\d{13}$/.test(raw)) return Math.floor(asNum / 1000);
  return null;
}

function tryAbsoluteDateUnix(raw, zone) {
  if (!zone) return null;
  const trimmed = String(raw).trim();
  if (!trimmed) return null;

  const now = DateTime.now().setZone(zone);

  for (const fmt of ABSOLUTE_DATE_FORMATS) {
    let dt = DateTime.fromFormat(trimmed, fmt, { zone });
    if (!dt.isValid && (fmt.startsWith('MMM d ') || fmt.startsWith('M/d '))) {
      // Try again assuming current year when year is omitted
      dt = DateTime.fromFormat(`${now.year} ${trimmed}`, `yyyy ${fmt}`, { zone });
    }
    if (dt.isValid) {
      return Math.floor(dt.toSeconds());
    }
  }

  return null;
}

function extractTrailingTzAbbrev(full) {
  let text = String(full).trim();
  let iana = null;
  const m = text.match(/\b(UTC|GMT|EST|EDT|CST|CDT|MST|MDT|PST|PDT)\b\s*$/i);
  if (m) {
    const key = m[1].toUpperCase();
    iana = TZ_ABBR_TO_IANA[key] || null;
    text = text.slice(0, m.index).trim();
  }
  return { text, iana };
}

function normalizeClockFragment(s) {
  return s
    .replace(/\btonight\b/gi, '')
    .replace(/\btoday\b/gi, '')
    .replace(/\btomorrow\b/gi, '')
    .replace(/^at\s+/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Parse a user-facing event time into Unix seconds for Discord `<t:…>` (each viewer sees local time).
 * @param {string} rawTime - Free text or `<t:…>` or ISO / `in 30 minutes`
 * @param {string | null} timezoneOption - IANA zone from slash option when the text has no CST/EST/etc.
 * @returns {{ unixSeconds: number | null, discordSnippet: string | null }}
 */
function resolveEventTimeUnix(rawTime, timezoneOption) {
  const raw0 = String(rawTime).trim();
  if (!raw0) return { unixSeconds: null, discordSnippet: null };

  const fromDiscord = extractDiscordUnix(raw0);
  if (fromDiscord !== null) {
    return {
      unixSeconds: fromDiscord,
      discordSnippet: `<t:${fromDiscord}:F> · <t:${fromDiscord}:R>`
    };
  }

  const rel = parseRelativeUnix(raw0);
  if (rel !== null) {
    return { unixSeconds: rel, discordSnippet: `<t:${rel}:F> · <t:${rel}:R>` };
  }

  const iso = tryIsoUnix(raw0);
  if (iso !== null) {
    return { unixSeconds: iso, discordSnippet: `<t:${iso}:F> · <t:${iso}:R>` };
  }

  const { text: withoutAbbr, iana: abbrIana } = extractTrailingTzAbbrev(raw0);
  const zone = timezoneOption || abbrIana;
  if (!zone) {
    return { unixSeconds: null, discordSnippet: null };
  }

  // Absolute calendar dates like "Mar 30 8pm", "March 30 10PM", or "Mar 30 2026 8pm" in a known zone
  const abs = tryAbsoluteDateUnix(withoutAbbr, zone);
  if (abs !== null) {
    return { unixSeconds: abs, discordSnippet: `<t:${abs}:F> · <t:${abs}:R>` };
  }

  const isTomorrow = /\btomorrow\b/i.test(raw0);
  let fragment = normalizeClockFragment(withoutAbbr);
  if (!fragment) {
    return { unixSeconds: null, discordSnippet: null };
  }

  const now = DateTime.now().setZone(zone);
  let baseDay = now.startOf('day');
  if (isTomorrow) baseDay = baseDay.plus({ days: 1 });

  const dated = `${baseDay.toFormat('yyyy-MM-dd')} ${fragment}`;
  const formats = [
    'yyyy-MM-dd h:mm a',
    'yyyy-MM-dd h:mma',
    'yyyy-MM-dd ha',
    'yyyy-MM-dd h a',
    'yyyy-MM-dd H:mm',
    'yyyy-MM-dd H:mm:ss',
    'yyyy-MM-dd h:mm:ss a'
  ];

  let candidate = null;
  for (const fmt of formats) {
    const dt = DateTime.fromFormat(dated, fmt, { zone });
    if (dt.isValid) {
      candidate = dt;
      break;
    }
  }

  if (!candidate) {
    return { unixSeconds: null, discordSnippet: null };
  }

  if (!isTomorrow && candidate < now) {
    candidate = candidate.plus({ days: 1 });
  }

  const u = Math.floor(candidate.toSeconds());
  return { unixSeconds: u, discordSnippet: `<t:${u}:F> · <t:${u}:R>` };
}

module.exports = {
  COMMON_TIMEZONE_CHOICES,
  resolveEventTimeUnix
};
