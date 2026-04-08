const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');

const MAX_SCAN_MESSAGES = 5000;
const PAGE_SIZE = 100;
const MIN_COMPACT_MATCH_LEN = 3;

function normalizeName(s) {
  return String(s || '')
    .trim()
    .replace(/^@+/, '')
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

/** Strip legacy discriminator and collapse separators so "Cool_Guy" matches "cool guy". */
function compareKey(s) {
  let t = String(s || '')
    .trim()
    .replace(/#\d{4}\s*$/i, '')
    .replace(/^@+/, '');
  t = normalizeName(t).replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
  return t;
}

/** Letters/digits only — helps when posts use "RsName" but Discord shows "rs name". */
function compactKey(s) {
  return compareKey(s).replace(/[^a-z0-9]/g, '');
}

function cleanPostedDonorName(raw) {
  let t = String(raw || '').trim();
  t = t.replace(/^\[[^\]]*]\s*/g, '');
  t = t.replace(/^\{[^}]*}\s*/g, '');
  t = t.replace(/\*+/g, '').replace(/_+/g, ' ').trim();
  return t;
}

function addNameVariants(set, raw) {
  const ck = compareKey(raw);
  if (ck) set.add(ck);
  const cp = compactKey(raw);
  if (cp.length >= MIN_COMPACT_MATCH_LEN) set.add(`__cmp:${cp}`);
}

/** Split "Main/Alt", "a | b", etc. so coffer posts under an alt still match the Discord display name. */
function collectAltSegments(raw) {
  const full = String(raw || '').trim();
  if (!full) return [];
  return full
    .split(/[/\\|｜]+/)
    .flatMap(part => part.split(/\s*·\s*/))
    .map(s => s.trim())
    .filter(Boolean);
}

function buildAliasVariantSet(targetUser, member) {
  const set = new Set();
  const candidates = [
    targetUser.username,
    targetUser.globalName,
    member?.displayName,
    member?.nickname,
    targetUser.tag
  ].filter(Boolean);
  for (const c of candidates) {
    addNameVariants(set, c);
    for (const seg of collectAltSegments(c)) addNameVariants(set, seg);
  }
  return set;
}

function piecesMatchAliases(cleanedPiece, aliasVariants) {
  const donorCompare = compareKey(cleanedPiece);
  const donorCompact = compactKey(cleanedPiece);
  if (donorCompare && aliasVariants.has(donorCompare)) return true;
  if (donorCompact.length >= MIN_COMPACT_MATCH_LEN && aliasVariants.has(`__cmp:${donorCompact}`)) return true;
  return false;
}

function donorMatchesAliases(donorRaw, aliasVariants) {
  const cleaned = cleanPostedDonorName(donorRaw);
  const pieces = new Set([cleaned, ...collectAltSegments(cleaned)]);
  for (const piece of pieces) {
    if (piece && piecesMatchAliases(piece, aliasVariants)) return true;
  }
  return false;
}

function extractMentionId(text) {
  const m = String(text || '').match(/^<@!?(\d+)>$/);
  return m ? m[1] : null;
}

function findCofferChannel(guild) {
  const channels = guild.channels.cache
    .filter(ch => ch.isTextBased() && !ch.isThread())
    .sort((a, b) => a.rawPosition - b.rawPosition);

  // Prefer clear channel names first.
  const strict = channels.find(ch => /coffer/.test(ch.name) && /donation|donate/.test(ch.name));
  if (strict) return strict;

  const broad = channels.find(ch => /coffer/.test(ch.name));
  if (broad) return broad;

  return null;
}

function parseDonationFromMessage(message) {
  const blobs = [];
  for (const e of message.embeds || []) {
    blobs.push(String(e.title || ''));
    blobs.push(String(e.description || ''));
    blobs.push(String(e.author?.name || ''));
  }
  blobs.push(String(message.content || ''));
  const combined = blobs.join('\n');

  if (!/coffer/i.test(combined) || !/deposit/i.test(combined)) return null;

  const full = combined.match(/(.+?)\s+has\s+deposited\s+([\d,]+)\s+coins?\s+into\s+the\s+coffer/i);
  const amountOnly = combined.match(/deposited\s+([\d,]+)\s+coins?/i);
  if (!full && !amountOnly) return null;

  const donor = full ? full[1].trim() : String(message.embeds?.[0]?.author?.name || '').trim();
  const rawAmount = (full ? full[2] : amountOnly[1]).replace(/,/g, '');
  const amount = Number(rawAmount);
  if (!Number.isFinite(amount) || amount <= 0) return null;

  return {
    donorRaw: donor,
    amount
  };
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('history')
    .setDescription('Show a user’s clan coffer donation history and total.')
    .addUserOption(opt =>
      opt
        .setName('user')
        .setDescription('Discord user to look up')
        .setRequired(false)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.SendMessages),

  async execute(interaction) {
    const targetUser = interaction.options.getUser('user') || interaction.user;
    const guild = interaction.guild;
    if (!guild) {
      await interaction.reply({ content: 'This command can only be used in a server.', ephemeral: true });
      return;
    }

    const member = await guild.members.fetch(targetUser.id).catch(() => null);
    const aliasVariants = buildAliasVariantSet(targetUser, member);

    await interaction.deferReply();

    const channel = findCofferChannel(guild);
    if (!channel) {
      await interaction.editReply('Could not find a coffer donation channel (expected name containing `coffer`).');
      return;
    }

    let scanned = 0;
    let before = null;
    let total = 0;
    const entries = [];

    while (scanned < MAX_SCAN_MESSAGES) {
      // eslint-disable-next-line no-await-in-loop
      const batch = await channel.messages.fetch({ limit: PAGE_SIZE, before }).catch(() => null);
      if (!batch || !batch.size) break;
      scanned += batch.size;

      for (const msg of batch.values()) {
        const parsed = parseDonationFromMessage(msg);
        if (!parsed) continue;

        const donorId = extractMentionId(parsed.donorRaw);
        const isMatch =
          (donorId && donorId === targetUser.id) || donorMatchesAliases(parsed.donorRaw, aliasVariants);
        if (!isMatch) continue;

        total += parsed.amount;
        entries.push({
          amount: parsed.amount,
          createdAtMs: msg.createdTimestamp
        });
      }

      before = batch.last().id;
      if (batch.size < PAGE_SIZE) break;
    }

    entries.sort((a, b) => b.createdAtMs - a.createdAtMs);
    const recent = entries.slice(0, 10);

    const embed = new EmbedBuilder()
      .setColor(0x57f287)
      .setTitle(`Coffer Donation History: ${member?.displayName || targetUser.username}`)
      .setThumbnail(targetUser.displayAvatarURL({ size: 256 }))
      .addFields(
        { name: 'Total Donated', value: `${total.toLocaleString('en-US')} coins`, inline: true },
        { name: 'Donation Entries', value: `${entries.length.toLocaleString('en-US')}`, inline: true },
        { name: 'Channel Scanned', value: `<#${channel.id}>`, inline: true }
      )
      .setFooter({ text: `Scanned ${Math.min(scanned, MAX_SCAN_MESSAGES).toLocaleString('en-US')} messages` })
      .setTimestamp();

    if (recent.length) {
      const lines = recent.map(e => {
        const unix = Math.floor(e.createdAtMs / 1000);
        return `• <t:${unix}:d> — **${e.amount.toLocaleString('en-US')}** coins`;
      });
      if (entries.length > recent.length) {
        lines.push(`• …and ${String(entries.length - recent.length)} more`);
      }
      embed.addFields({ name: 'Recent Donations', value: lines.join('\n'), inline: false });
    } else {
      embed.addFields({ name: 'Recent Donations', value: 'No coffer donations found for this user.', inline: false });
    }

    await interaction.editReply({ embeds: [embed] });
  }
};
