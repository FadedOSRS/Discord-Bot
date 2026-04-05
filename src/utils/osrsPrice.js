const WIKI_PRICE_UA =
  'OSRS-Community-Discord-Bot/1.0 (Grand Exchange prices; https://oldschool.runescape.wiki/wiki/RuneScape:Real-time_Pricing)';

const MAPPING_URL = 'https://prices.runescape.wiki/api/v1/osrs/mapping';
const LATEST_URL = id => `https://prices.runescape.wiki/api/v1/osrs/latest?id=${id}`;
const LATEST_ALL_URL = 'https://prices.runescape.wiki/api/v1/osrs/latest';

let mappingCache = null;
let mappingLoadedAt = 0;
const MAPPING_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours

async function fetchJson(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': WIKI_PRICE_UA }
  });
  if (!res.ok) return null;
  return res.json().catch(() => null);
}

async function getMapping() {
  const now = Date.now();
  if (mappingCache && now - mappingLoadedAt < MAPPING_TTL_MS) {
    return mappingCache;
  }
  const data = await fetchJson(MAPPING_URL);
  if (!Array.isArray(data) || !data.length) return mappingCache || [];
  mappingCache = data;
  mappingLoadedAt = now;
  return mappingCache;
}

/**
 * @param {string} query
 * @returns {Promise<{ id: number; name: string } | null>}
 */
async function findItem(query) {
  const q = query.trim().toLowerCase();
  if (!q) return null;
  const mapping = await getMapping();
  if (!mapping.length) return null;

  const exact = mapping.find(i => i.name && i.name.toLowerCase() === q);
  if (exact) return { id: exact.id, name: exact.name };

  const starts = mapping.filter(i => i.name && i.name.toLowerCase().startsWith(q));
  if (starts.length === 1) return { id: starts[0].id, name: starts[0].name };
  if (starts.length > 1) {
    starts.sort((a, b) => a.name.length - b.name.length);
    return { id: starts[0].id, name: starts[0].name };
  }

  const includes = mapping.filter(i => i.name && i.name.toLowerCase().includes(q));
  if (!includes.length) return null;
  includes.sort((a, b) => a.name.length - b.name.length);
  return { id: includes[0].id, name: includes[0].name };
}

/**
 * @param {string} query
 * @returns {Promise<{
 *   id: number;
 *   name: string;
 *   icon: string | null;
 *   limit: number | null;
 *   members: boolean | null;
 *   lowalch: number | null;
 *   highalch: number | null;
 *   value: number | null;
 * } | null>}
 */
async function findItemMeta(query) {
  const q = query.trim().toLowerCase();
  if (!q) return null;
  const mapping = await getMapping();
  if (!mapping.length) return null;

  const pick = row => ({
    id: row.id,
    name: row.name,
    icon: row.icon ?? null,
    limit: row.limit ?? null,
    members: row.members ?? null,
    lowalch: row.lowalch ?? null,
    highalch: row.highalch ?? null,
    value: row.value ?? null
  });

  const exact = mapping.find(i => i.name && i.name.toLowerCase() === q);
  if (exact) return pick(exact);

  const starts = mapping.filter(i => i.name && i.name.toLowerCase().startsWith(q));
  if (starts.length === 1) return pick(starts[0]);
  if (starts.length > 1) {
    starts.sort((a, b) => a.name.length - b.name.length);
    return pick(starts[0]);
  }

  const includes = mapping.filter(i => i.name && i.name.toLowerCase().includes(q));
  if (!includes.length) return null;
  includes.sort((a, b) => a.name.length - b.name.length);
  return pick(includes[0]);
}

/**
 * @param {number} id
 */
async function getLatestPrice(id) {
  const data = await fetchJson(LATEST_URL(id));
  if (!data || !data.data || !data.data[String(id)]) return null;
  const row = data.data[String(id)];
  return {
    high: row.high ?? null,
    highTime: row.highTime ?? null,
    low: row.low ?? null,
    lowTime: row.lowTime ?? null
  };
}

/**
 * @returns {Promise<Record<string, { high: number | null; highTime: number | null; low: number | null; lowTime: number | null }>>}
 */
async function getLatestAllPrices() {
  const data = await fetchJson(LATEST_ALL_URL);
  const rows = data?.data;
  if (!rows || typeof rows !== 'object') return {};

  /** @type {Record<string, { high: number | null; highTime: number | null; low: number | null; lowTime: number | null }>} */
  const out = {};
  for (const [id, row] of Object.entries(rows)) {
    out[id] = {
      high: row?.high ?? null,
      highTime: row?.highTime ?? null,
      low: row?.low ?? null,
      lowTime: row?.lowTime ?? null
    };
  }
  return out;
}

function formatGp(n) {
  if (n == null || !Number.isFinite(Number(n))) return '—';
  return Number(n).toLocaleString('en-US') + ' gp';
}

module.exports = {
  findItem,
  findItemMeta,
  getLatestPrice,
  getLatestAllPrices,
  formatGp,
  getMapping
};
