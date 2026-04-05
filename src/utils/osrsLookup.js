const { EmbedBuilder } = require('discord.js');

const SKILLS = [
  'Attack',
  'Defence',
  'Strength',
  'Hitpoints',
  'Ranged',
  'Prayer',
  'Magic',
  'Cooking',
  'Woodcutting',
  'Fletching',
  'Fishing',
  'Firemaking',
  'Crafting',
  'Smithing',
  'Mining',
  'Herblore',
  'Agility',
  'Thieving',
  'Slayer',
  'Farming',
  'Runecraft',
  'Hunter',
  'Construction'
];

const HISCORES_URL = 'https://secure.runescape.com/m=hiscore_oldschool/index_lite.ws';
const RUNEWATCH_URL = 'https://runewatch.com/api/cases';

const BROWSER_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  Accept: 'application/json,text/plain,*/*'
};

function fetchWithTimeout(url, ms = 15_000, init = {}) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), ms);
  return fetch(url, { ...init, signal: controller.signal }).finally(() => clearTimeout(id));
}

function normalizeRunewatchPayload(raw) {
  if (raw == null) return { ok: false, reason: 'empty' };
  if (Array.isArray(raw)) return { ok: true, items: raw };
  if (typeof raw === 'object') {
    for (const key of ['cases', 'data', 'results', 'items']) {
      if (Array.isArray(raw[key])) return { ok: true, items: raw[key] };
    }
  }
  return { ok: false, reason: 'shape' };
}

function parseHiscoresLite(text) {
  const lines = text.trim().split('\n').filter(Boolean);
  if (lines.length < 24) return null;

  const overallParts = lines[0].split(',');
  if (overallParts.length < 3) return null;

  const overallRank = overallParts[0];
  const totalLevel = overallParts[1];
  const totalXp = overallParts[2];

  const skills = [];
  for (let i = 0; i < 23; i += 1) {
    const parts = lines[i + 1].split(',');
    const rank = parts[0];
    const level = parts[1];
    const xp = parts[2];
    skills.push({ name: SKILLS[i], rank, level, xp });
  }

  const notFound =
    overallRank === '-1' &&
    totalLevel === '-1' &&
    (totalXp === '-1' || totalXp === undefined);

  return {
    overallRank,
    totalLevel,
    totalXp,
    skills,
    notFound
  };
}

function topSkillsByLevel(skills, n = 5) {
  return [...skills]
    .map(s => ({
      ...s,
      lv: Number.parseInt(s.level, 10) || 0,
      rk: Number.parseInt(s.rank, 10)
    }))
    .sort((a, b) => b.lv - a.lv || (a.rk > 0 && b.rk > 0 ? a.rk - b.rk : 0))
    .slice(0, n);
}

function summarizeRunewatchCases(data) {
  if (!Array.isArray(data)) {
    return {
      status: 'error',
      summary: 'Could not read Runewatch data (unexpected format).',
      listed: false
    };
  }

  if (data.length === 1 && data[0] && typeof data[0] === 'object' && data[0].error) {
    return {
      status: 'error',
      summary: String(data[0].error),
      listed: false
    };
  }

  const cases = data.filter(c => c && typeof c === 'object' && !c.error);

  if (cases.length === 0) {
    return {
      status: 'ok',
      summary: 'No Runewatch listing for this RSN.',
      listed: false,
      cases: []
    };
  }

  const lines = cases.slice(0, 3).map((c, idx) => {
    const id = c.id ?? c.case_id ?? c.caseId ?? c.uuid ?? null;
    const offence = c.offence ?? c.offense ?? c.title ?? c.reason ?? null;
    const status = c.status ?? c.state ?? null;
    const link = c.url ?? (id ? `https://runewatch.com/case/${id}` : null);
    const bits = [`**#${idx + 1}**`];
    if (offence) bits.push(String(offence));
    if (status) bits.push(`(${status})`);
    if (link) bits.push(`\n${link}`);
    return bits.join(' ');
  });

  return {
    status: 'ok',
    summary: `**${cases.length}** Runewatch case(s).`,
    listed: true,
    cases,
    lines
  };
}

/**
 * Same data as `/lookup`: HiScores + Runewatch in one embed (for verify queue + slash command).
 */
async function buildLookupEmbed(rsnRaw, options = {}) {
  const trimmed = (rsnRaw || '').trim();
  if (!trimmed) {
    return new EmbedBuilder()
      .setTitle('Player lookup')
      .setDescription('No RSN provided.')
      .setColor(0xf1c40f)
      .setTimestamp();
  }

  const hiscoreParam = encodeURIComponent(trimmed.replace(/ /g, '\u00a0'));
  const rwParam = encodeURIComponent(trimmed);

  let hiRes;
  let rwRes;
  try {
    [hiRes, rwRes] = await Promise.all([
      fetchWithTimeout(`${HISCORES_URL}?player=${hiscoreParam}`),
      fetchWithTimeout(`${RUNEWATCH_URL}/${rwParam}`, 15_000, { headers: BROWSER_HEADERS })
    ]);
  } catch {
    return new EmbedBuilder()
      .setTitle(`Player lookup: ${trimmed}`)
      .setDescription('Lookup failed (network timeout). Try again in a moment.')
      .setColor(0xf1c40f)
      .setTimestamp();
  }

  let hiscoreBlock = '';
  if (!hiRes.ok) {
    hiscoreBlock = `**HiScores:** request failed (\`HTTP ${hiRes.status}\`).`;
  } else {
    const hiText = await hiRes.text();
    const parsed = parseHiscoresLite(hiText);
    if (!parsed || parsed.notFound) {
      hiscoreBlock = `**HiScores:** no data for **${trimmed}** (wrong name, HCIM/GIM separate hiscores, or not ranked).`;
    } else {
      const top = topSkillsByLevel(parsed.skills, 5)
        .map(s => `${s.name}: **${s.level}** (rank ${s.rank === '-1' ? '—' : Number(s.rank).toLocaleString()})`)
        .join('\n');
      hiscoreBlock = [
        `**HiScores — ${trimmed}**`,
        `• Total level: **${parsed.totalLevel}** · XP: **${Number(parsed.totalXp).toLocaleString()}** · Overall rank: **${
          parsed.overallRank === '-1' ? '—' : Number(parsed.overallRank).toLocaleString()
        }**`,
        `• Top skills:\n${top}`,
        `[Open hiscores](https://secure.runescape.com/m=hiscore_oldschool/hiscorepersonal?user_name=${encodeURIComponent(
          trimmed
        )})`
      ].join('\n');
    }
  }

  let rwBlock = '';
  let rwListed = false;
  let rwClear = false;
  if (!rwRes.ok) {
    rwBlock = `**Runewatch:** request failed (\`HTTP ${rwRes.status}\`). [Runewatch](https://runewatch.com/cases)`;
  } else {
    const rwText = await rwRes.text();
    const head = rwText.trim().slice(0, 200).toLowerCase();

    if (!rwText.trim() || head.startsWith('<!doctype') || head.includes('<html')) {
      rwBlock =
        '**Runewatch:** the API returned a web page instead of JSON (often Cloudflare / bot filtering). ' +
        'HiScores above may still be valid — **check Runewatch manually:** ' +
        '[runewatch.com/cases](https://runewatch.com/cases)';
    } else {
      let raw;
      try {
        raw = JSON.parse(rwText);
      } catch {
        raw = null;
      }

      const norm = normalizeRunewatchPayload(raw);
      if (!norm.ok) {
        rwBlock =
          '**Runewatch:** response was not usable JSON. ' +
          `[Cases index](https://runewatch.com/cases) — raw prefix: \`${rwText.trim().slice(0, 80).replace(/`/g, "'")}\``;
      } else {
        const summary = summarizeRunewatchCases(norm.items);
        if (summary.status === 'error') {
          rwBlock = `**Runewatch:** ${summary.summary}`;
        } else if (!summary.listed) {
          rwClear = true;
          rwBlock = `**Runewatch:** no listing found for **${trimmed}**.\n[Cases index](https://runewatch.com/cases)`;
        } else {
          rwListed = true;
          rwBlock = [`**Runewatch — flagged**`, summary.summary, ...summary.lines].join('\n');
        }
      }
    }
  }

  const embedColor = rwListed ? 0xe74c3c : rwClear ? 0x2ecc71 : 0xf1c40f;

  let description = [hiscoreBlock, '', rwBlock].join('\n');
  if (description.length > 4096) {
    description = `${description.slice(0, 4090)}…`;
  }

  const embed = new EmbedBuilder()
    .setTitle(`Player lookup: ${trimmed}`)
    .setDescription(description)
    .setColor(embedColor)
    .setTimestamp();

  if (options.footer) {
    embed.setFooter({ text: options.footer });
  }

  return embed;
}

module.exports = {
  buildLookupEmbed
};
