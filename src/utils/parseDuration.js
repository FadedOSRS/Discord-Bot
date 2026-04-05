/**
 * Parse duration like 2h, 30m, 1d12h, 90 (minutes if plain integer).
 * @returns {number | null} milliseconds or null
 */
function parseDurationToMs(input) {
  const s = String(input).trim().toLowerCase();
  if (!s) return null;

  let total = 0;
  const re = /(\d+)\s*(days?|d|hours?|hrs?|h|minutes?|mins?|m|seconds?|secs?|s)\b/gi;
  let m;
  let found = false;
  while ((m = re.exec(s)) !== null) {
    found = true;
    const n = parseInt(m[1], 10);
    if (!Number.isFinite(n) || n < 0) continue;
    const u = m[2].toLowerCase();
    if (u.startsWith('d')) total += n * 86400000;
    else if (u.startsWith('h')) total += n * 3600000;
    else if (u.startsWith('m')) total += n * 60000;
    else if (u.startsWith('s')) total += n * 1000;
  }
  if (found && total > 0) return total;

  if (/^\d+$/.test(s)) {
    const num = parseInt(s, 10);
    if (num > 0) return num * 60000;
  }

  return null;
}

module.exports = { parseDurationToMs };
