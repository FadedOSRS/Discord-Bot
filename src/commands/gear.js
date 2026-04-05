const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

const KNOWN_BOSS_TITLES = {
  'Abyssal Sire': 'Abyssal Sire',
  'Alchemical Hydra': 'Alchemical Hydra',
  'Barrows': 'Barrows',
  'Callisto': 'Callisto',
  'Cerberus': 'Cerberus',
  'Chambers of Xeric': 'Chambers of Xeric',
  'Commander Zilyana': 'Commander Zilyana',
  'Corporeal Beast': 'Corporeal Beast',
  'General Graardor': 'General Graardor',
  'Giant Mole': 'Giant Mole',
  'Kalphite Queen': 'Kalphite Queen',
  'King Black Dragon': 'King Black Dragon',
  'Kraken': 'Kraken',
  'Kree\'arra': 'Kree\'arra',
  'K\'ril Tsutsaroth': 'K\'ril Tsutsaroth',
  'Nex': 'Nex',
  'Nightmare': 'The Nightmare',
  'Phosani\'s Nightmare': 'Phosani\'s Nightmare',
  'Sarachnis': 'Sarachnis',
  'Scorpia': 'Scorpia',
  'Skotizo': 'Skotizo',
  'Tempoross': 'Tempoross',
  'The Gauntlet': 'The Gauntlet',
  'Theatre of Blood': 'Theatre of Blood',
  'Thermonuclear Smoke Devil': 'Thermonuclear smoke devil',
  'Tombs of Amascut': 'Tombs of Amascut',
  'Vardorvis': 'Vardorvis',
  'Venenatis': 'Venenatis',
  'Vet\'ion': 'Vet\'ion',
  'Vorkath': 'Vorkath',
  'Wintertodt': 'Wintertodt',
  'Zalcano': 'Zalcano',
  'Zulrah': 'Zulrah'
};

const ALIASES = {
  toa: 'Tombs of Amascut',
  tob: 'Theatre of Blood',
  cox: 'Chambers of Xeric',
  nm: 'Nightmare',
  pnm: 'Phosani\'s Nightmare',
  kbd: 'King Black Dragon',
  kq: 'Kalphite Queen',
  kril: 'K\'ril Tsutsaroth',
  kree: 'Kree\'arra'
};

function decodeEntities(text) {
  return text
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, '\'')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function stripHtml(html) {
  return decodeEntities(
    html
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<li>/gi, '• ')
      .replace(/<\/li>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\[\d+]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
  );
}

function toAbsoluteWikiImageUrl(src) {
  if (!src) return null;
  let url = src.trim();
  if (url.startsWith('//')) url = `https:${url}`;
  if (url.startsWith('/')) url = `https://oldschool.runescape.wiki${url}`;
  return url;
}

function deThumb(url) {
  // MediaWiki thumbnails look like: /images/thumb/.../filename.png/320px-filename.png
  // Use original image URL when possible for cleaner embeds.
  return url.replace(/\/thumb(\/.+?)\/\d+px-[^/]+$/i, '$1');
}

function pickGearImageFromHtml(html) {
  const tags = [...html.matchAll(/<img\b[^>]*>/gi)].map(m => m[0]);
  if (!tags.length) return null;

  const parsed = tags.map(tag => {
    const srcMatch = tag.match(/\bsrc="([^"]+)"/i);
    const altMatch = tag.match(/\balt="([^"]*)"/i);
    return {
      src: srcMatch ? toAbsoluteWikiImageUrl(srcMatch[1]) : null,
      alt: altMatch ? decodeEntities(altMatch[1].toLowerCase()) : ''
    };
  }).filter(x => x.src);

  if (!parsed.length) return null;

  // Prefer explicit recommended equipment composite images.
  const preferred = parsed.find(
    x =>
      /recommended equipment|equipment for|gear setup/i.test(x.alt) ||
      /recommended[_\s-]?equipment|equipment[_\s-]?for/i.test(x.src)
  );
  if (preferred) return deThumb(preferred.src);

  // Fallback: first image in section.
  return deThumb(parsed[0].src);
}

/**
 * Parse item names from a template cell. Keeps wiki order; collapses duplicates.
 * Multiple plinks in one cell are usually sidegrades at the same tier (joined with " / " later).
 */
function extractItemsFromCell(raw, maxItems = 40) {
  if (!raw) return [];
  let text = raw;

  text = text
    .replace(/\{\{efn[\s\S]*?\}\}/gi, '')
    .replace(/<ref[\s\S]*?<\/ref>/gi, '')
    .replace(/<ref[^>]*\/>/gi, '');

  const items = [];
  const plinks = [...text.matchAll(/\{\{plink\|([^}|]+)(?:\|[^}]*)?\}\}/gi)].map(m => m[1].trim());
  items.push(...plinks);

  const wikilinks = [...text.matchAll(/\[\[([^|\]]+)(?:\|[^\]]+)?\]\]/g)].map(m => m[1].trim());
  for (const w of wikilinks) {
    if (!items.includes(w)) items.push(w);
  }

  const seen = new Set();
  const ordered = [];
  for (const it of items) {
    if (seen.has(it)) continue;
    seen.add(it);
    ordered.push(it);
    if (ordered.length >= maxItems) break;
  }
  return ordered;
}

function extractRecommendedGearFromWikitext(wikitext) {
  if (!wikitext) return [];

  // Collect every numbered tier per slot (1 = BiS on the wiki, higher = worse / budget swaps).
  const slotTiers = new Map();
  const re = /^\|([a-z]+)(\d)\s*=\s*(.+)$/gim;
  let match;
  while ((match = re.exec(wikitext)) !== null) {
    const slot = match[1].toLowerCase();
    const tier = Number(match[2]);
    const value = (match[3] || '').trim();
    if (!value || value.toUpperCase() === 'N/A' || Number.isNaN(tier)) continue;

    if (!slotTiers.has(slot)) slotTiers.set(slot, []);
    slotTiers.get(slot).push({ tier, value });
  }

  for (const slot of [...slotTiers.keys()]) {
    const rows = slotTiers.get(slot).sort((a, b) => a.tier - b.tier);
    const deduped = [];
    for (const row of rows) {
      if (deduped.length && deduped[deduped.length - 1].tier === row.tier) continue;
      deduped.push(row);
    }
    slotTiers.set(slot, deduped);
  }

  const labels = {
    head: 'Head',
    neck: 'Neck',
    cape: 'Cape',
    body: 'Body',
    legs: 'Legs',
    weapon: 'Weapon',
    shield: 'Shield',
    ammo: 'Ammo',
    hands: 'Hands',
    feet: 'Feet',
    ring: 'Ring'
  };

  const ordered = ['head', 'neck', 'cape', 'body', 'legs', 'weapon', 'shield', 'ammo', 'hands', 'feet', 'ring'];
  const lines = [];
  for (const slot of ordered) {
    const rows = slotTiers.get(slot);
    if (!rows?.length) continue;

    const tierLines = [];
    for (const row of rows) {
      const items = extractItemsFromCell(row.value);
      if (!items.length) continue;
      tierLines.push({ tier: row.tier, text: items.join(' / ') });
    }
    if (!tierLines.length) continue;

    const body = tierLines
      .map((t, idx) => {
        const tierNote = t.tier !== idx + 1 ? ` _(wiki row ${t.tier})_` : '';
        return `   **${idx + 1}.**${tierNote} ${t.text}`;
      })
      .join('\n');

    lines.push(`• **${labels[slot] || slot}** — best → worst\n${body}`);
  }

  return lines;
}

/**
 * Fit gear text into embed limits: description first, then a few continuation fields.
 * Discord caps total embed characters (~6000); we leave room for title + Source field.
 */
function allocateGearLinesToEmbed(lines) {
  const maxDesc = 3400;
  const maxField = 900;
  const joined = lines.join('\n\n');
  if (joined.length <= maxDesc) {
    return { description: joined, extraFields: [] };
  }

  let description = '';
  const fieldValues = [];
  let currentField = '';

  const flushField = () => {
    if (!currentField) return;
    while (currentField.length > maxField) {
      fieldValues.push(currentField.slice(0, maxField));
      currentField = currentField.slice(maxField);
    }
    if (currentField) {
      fieldValues.push(currentField);
      currentField = '';
    }
  };

  const appendToFields = text => {
    const sep = currentField ? '\n\n' : '';
    const next = currentField + sep + text;
    if (next.length <= maxField) {
      currentField = next;
      return;
    }
    flushField();
    currentField = text;
    while (currentField.length > maxField) {
      fieldValues.push(currentField.slice(0, maxField));
      currentField = currentField.slice(maxField);
    }
  };

  for (const line of lines) {
    const candidate = description ? `${description}\n\n${line}` : line;
    if (candidate.length <= maxDesc) {
      description = candidate;
      continue;
    }
    appendToFields(line);
  }
  flushField();

  const maxExtra = 3;
  if (!description.trim() && fieldValues.length) {
    description = fieldValues.shift();
  }

  const overflow = fieldValues.length > maxExtra;
  const used = overflow ? fieldValues.slice(0, maxExtra) : [...fieldValues];
  if (overflow && used.length) {
    const lastIdx = used.length - 1;
    used[lastIdx] =
      used[lastIdx].slice(0, Math.max(0, maxField - 120)).trimEnd() + '\n\n… *Full list on the wiki.*';
  }

  if (description && used.length) {
    description += '\n\n*More gear steps in the fields below.*';
  }

  const extraFields = used.map((value, i) => ({
    name: `Gear (continued ${i + 1})`,
    value,
    inline: false
  }));

  return { description, extraFields };
}

function resolveBossTitle(input) {
  const raw = input.trim();
  const exact = KNOWN_BOSS_TITLES[raw];
  if (exact) return exact;

  const lower = raw.toLowerCase();
  const alias = ALIASES[lower];
  if (alias && KNOWN_BOSS_TITLES[alias]) return KNOWN_BOSS_TITLES[alias];

  const ci = Object.keys(KNOWN_BOSS_TITLES).find(k => k.toLowerCase() === lower);
  if (ci) return KNOWN_BOSS_TITLES[ci];

  return raw;
}

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) return null;
  return res.json().catch(() => null);
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('gear')
    .setDescription('Get recommended gear from an OSRS boss strategy page.')
    .addStringOption(option =>
      option
        .setName('bossname')
        .setDescription('Boss name (example: Vorkath, ToA, Nex)')
        .setRequired(true)
        .setMaxLength(100)
    )
    .addStringOption(option =>
      option
        .setName('style')
        .setDescription('Preferred setup style')
        .setRequired(false)
        .addChoices(
          { name: 'Any (default)', value: 'any' },
          { name: 'Melee', value: 'melee' },
          { name: 'Range', value: 'range' },
          { name: 'Magic', value: 'magic' },
          { name: 'Budget / Low cost', value: 'budget' }
        )
    ),

  async execute(interaction) {
    const bossInput = interaction.options.getString('bossname', true);
    const style = interaction.options.getString('style', false) || 'any';
    const bossTitle = resolveBossTitle(bossInput);
    const strategyPage = `${bossTitle}/Strategies`;

    await interaction.deferReply({ ephemeral: true });

    const sectionsUrl =
      `https://oldschool.runescape.wiki/api.php?action=parse&format=json&formatversion=2` +
      `&page=${encodeURIComponent(strategyPage)}&prop=sections`;

    const sectionsData = await fetchJson(sectionsUrl);
    const sections = sectionsData?.parse?.sections || [];
    if (!sections.length) {
      const search = `https://oldschool.runescape.wiki/?search=${encodeURIComponent(`${bossInput} strategy gear`)}`;
      await interaction.editReply(`I couldn't find a strategy page for **${bossInput}**.\nTry: ${search}`);
      return;
    }

    const gearSection =
      sections.find(s => /recommended equipment|equipment|gear/i.test(String(s.line || ''))) || null;

    const strategyLink = `https://oldschool.runescape.wiki/w/${encodeURIComponent(strategyPage).replace(/%2F/g, '/')}`;

    if (!gearSection) {
      await interaction.editReply(
        `I found **${strategyPage}** but couldn't locate an explicit equipment section.\nStrategy page: ${strategyLink}`
      );
      return;
    }

    const sectionUrl =
      `https://oldschool.runescape.wiki/api.php?action=parse&format=json&formatversion=2` +
      `&page=${encodeURIComponent(strategyPage)}&prop=text&section=${encodeURIComponent(gearSection.index)}`;
    const sectionData = await fetchJson(sectionUrl);
    const html = sectionData?.parse?.text || '';

    const wikitextUrl =
      `https://oldschool.runescape.wiki/api.php?action=parse&format=json&formatversion=2` +
      `&page=${encodeURIComponent(strategyPage)}&prop=wikitext&section=${encodeURIComponent(gearSection.index)}`;
    const wikitextData = await fetchJson(wikitextUrl);
    const wikitext = wikitextData?.parse?.wikitext || '';

    if (!html && !wikitext) {
      await interaction.editReply(`I couldn't read the equipment section right now.\nStrategy page: ${strategyLink}`);
      return;
    }

    // If a style was requested, try to narrow to that style's tab/content first.
    let filteredWikitext = wikitext;
    if (style !== 'any' && wikitext) {
      const styleRegexMap = {
        melee: /(melee)/i,
        range: /(range|ranged)/i,
        magic: /(magic|mage)/i,
        budget: /(budget|cheap|low[- ]?cost)/i
      };
      const rx = styleRegexMap[style];

      // Try to isolate a tabber block line like "Magic=" ... in section text.
      if (rx) {
        const lines = wikitext.split('\n');
        const startIdx = lines.findIndex(l => rx.test(l) && /=\s*$/.test(l.trim()));
        if (startIdx >= 0) {
          const tail = lines.slice(startIdx + 1);
          const endRel = tail.findIndex(l => /^[A-Za-z0-9'()\/ -]+=/.test(l.trim()) || /<\/tabber>/i.test(l));
          const chunk = endRel >= 0 ? tail.slice(0, endRel) : tail;
          filteredWikitext = chunk.join('\n');
        }
      }
    }

    // First choice: extract structured recommended equipment by slot from wiki template fields.
    let lines = extractRecommendedGearFromWikitext(filteredWikitext || wikitext).slice(0, 12);

    // Fallback to rendered list items.
    if (!lines.length) {
      const liMatches = [...html.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi)].map(m => stripHtml(m[1]));
      lines = liMatches.filter(Boolean).slice(0, 12);
    }

    if (!lines.length) {
      // Fallback to plain section text snippet.
      const text = stripHtml(html || wikitext);
      lines = [text.slice(0, 900)];
    }

    const { description: gearDesc, extraFields } = allocateGearLinesToEmbed(lines);
    const imageUrl = pickGearImageFromHtml(html);
    const embed = new EmbedBuilder()
      .setTitle(`Gear guide: ${bossTitle}${style !== 'any' ? ` (${style})` : ''}`)
      .setDescription(gearDesc || 'No readable equipment data found.')
      .addFields(
        ...extraFields,
        { name: 'Source', value: `[${strategyPage}](${strategyLink})`, inline: false }
      )
      .setTimestamp();

    if (imageUrl) {
      embed.setImage(imageUrl);
    }

    await interaction.editReply({ embeds: [embed] });
  }
};

