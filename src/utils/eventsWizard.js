const crypto = require('crypto');
const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle
} = require('discord.js');
const { resolveEventTimeUnix } = require('./eventTimeParse');
const {
  postTerpinheimerCustomEvent,
  shouldSkipDiscordChannelPost
} = require('./terpinheimerEvents');

const TTL_MS = 15 * 60 * 1000;
/** Default when start/end text has no timezone (see placeholders). */
const DEFAULT_TZ = 'America/Chicago';

/** @type {Map<string, object>} */
const sessions = new Map();

function cleanupSessions() {
  const now = Date.now();
  for (const [id, s] of sessions) {
    if (s.expiresAt < now) sessions.delete(id);
  }
}

function newSessionId() {
  return crypto.randomBytes(12).toString('hex');
}

function createSession(data) {
  cleanupSessions();
  const id = newSessionId();
  sessions.set(id, {
    ...data,
    expiresAt: Date.now() + TTL_MS
  });
  return id;
}

function getSession(id) {
  cleanupSessions();
  const s = sessions.get(id);
  if (!s || s.expiresAt < Date.now()) {
    sessions.delete(id);
    return null;
  }
  return s;
}

function toAbsoluteWikiImageUrl(src) {
  if (!src) return null;
  let url = src.trim();
  if (url.startsWith('//')) url = `https:${url}`;
  if (url.startsWith('/')) url = `https://oldschool.runescape.wiki${url}`;
  return url;
}

function deThumb(url) {
  return url.replace(/\/thumb(\/.+?)\/\d+px-[^/]+$/i, '$1');
}

function pickFirstImageFromHtml(html) {
  const m = String(html || '').match(/<img\b[^>]*src="([^"]+)"[^>]*>/i);
  if (!m) return null;
  const abs = toAbsoluteWikiImageUrl(m[1]);
  return abs ? deThumb(abs) : null;
}

async function fetchOsrsLogoForEventName(eventName) {
  const raw = String(eventName || '').trim();
  if (!raw) return null;

  let query = raw;
  const skillMatch = raw.match(/skill\s+of\s+the\s+week\s+(.+)/i);
  if (skillMatch && skillMatch[1]) {
    query = skillMatch[1].trim();
  }

  if (!query) return null;

  const apiUrl =
    'https://oldschool.runescape.wiki/api.php?action=parse&format=json&formatversion=2&prop=text&page=' +
    encodeURIComponent(query);

  try {
    const res = await fetch(apiUrl);
    if (!res.ok) return null;
    const data = await res.json().catch(() => null);
    const html = data?.parse?.text || '';
    if (!html) return null;
    return pickFirstImageFromHtml(html);
  } catch {
    return null;
  }
}

/** Discord TextInput placeholder max 100 chars */
const TIME_PLACEHOLDER = 'Example: 03/30 9pm CST (numeric date + time + timezone).';

function buildPart1Modal(sessionId) {
  const modal = new ModalBuilder().setCustomId(`events:part1:${sessionId}`).setTitle('Create event — step 1 of 2');

  const name = new TextInputBuilder()
    .setCustomId('ev_name')
    .setLabel('Event name')
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(100);

  const start = new TextInputBuilder()
    .setCustomId('ev_start')
    .setLabel('Start time')
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(true)
    .setMaxLength(500)
    .setPlaceholder(TIME_PLACEHOLDER);

  const end = new TextInputBuilder()
    .setCustomId('ev_end')
    .setLabel('End time')
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(true)
    .setMaxLength(500)
    .setPlaceholder(TIME_PLACEHOLDER);

  const desc = new TextInputBuilder()
    .setCustomId('ev_description')
    .setLabel('Description')
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(false)
    .setMaxLength(1000);

  modal.addComponents(
    new ActionRowBuilder().addComponents(name),
    new ActionRowBuilder().addComponents(start),
    new ActionRowBuilder().addComponents(end),
    new ActionRowBuilder().addComponents(desc)
  );

  return modal;
}

function buildPart2Modal(sessionId) {
  const modal = new ModalBuilder().setCustomId(`events:part2:${sessionId}`).setTitle('Create event — podium (2/2)');

  const first = new TextInputBuilder()
    .setCustomId('ev_first')
    .setLabel('1st place')
    .setStyle(TextInputStyle.Short)
    .setRequired(false)
    .setMaxLength(200);

  const second = new TextInputBuilder()
    .setCustomId('ev_second')
    .setLabel('2nd place')
    .setStyle(TextInputStyle.Short)
    .setRequired(false)
    .setMaxLength(200);

  const third = new TextInputBuilder()
    .setCustomId('ev_third')
    .setLabel('3rd place')
    .setStyle(TextInputStyle.Short)
    .setRequired(false)
    .setMaxLength(200);

  const pets = new TextInputBuilder()
    .setCustomId('ev_pets')
    .setLabel('Pets')
    .setStyle(TextInputStyle.Short)
    .setRequired(false)
    .setMaxLength(200);

  modal.addComponents(
    new ActionRowBuilder().addComponents(first),
    new ActionRowBuilder().addComponents(second),
    new ActionRowBuilder().addComponents(third),
    new ActionRowBuilder().addComponents(pets)
  );

  return modal;
}

function buildPostedEmbed(session, startUnix, endUnix, tag) {
  const dash = v => (v ? v : '—');
  return new EmbedBuilder()
    .setColor(0x57f287)
    .setTitle(session.eventName)
    .setDescription(session.description || null)
    .addFields(
      {
        name: 'Event time',
        value: `**Starts:** <t:${startUnix}:F> · <t:${startUnix}:R>\n**Ends:** <t:${endUnix}:F> · <t:${endUnix}:R>`,
        inline: false
      },
      { name: '1st', value: dash(session.first), inline: true },
      { name: '2nd', value: dash(session.second), inline: true },
      { name: '3rd', value: dash(session.third), inline: true },
      { name: 'Pets', value: dash(session.pets), inline: true }
    )
    .setFooter({ text: `Posted by ${tag}` })
    .setTimestamp();
}

async function executeEventsCommand(interaction) {
  const sessionId = createSession({
    userId: interaction.user.id,
    guildId: interaction.guildId,
    channelId: interaction.channelId
  });

  await interaction.showModal(buildPart1Modal(sessionId));
}

/**
 * @returns {Promise<boolean>}
 */
async function handleEventsButton(interaction) {
  if (!interaction.isButton()) return false;
  if (!interaction.customId.startsWith('events:more:')) return false;

  const sessionId = interaction.customId.slice('events:more:'.length);
  const session = getSession(sessionId);

  if (!session || session.userId !== interaction.user.id) {
    await interaction.reply({
      content: 'This setup expired or is not yours. Run `/events` again.',
      ephemeral: true
    });
    return true;
  }

  if (!session.part1Done) {
    await interaction.reply({ content: 'Finish step 1 first.', ephemeral: true });
    return true;
  }

  await interaction.showModal(buildPart2Modal(sessionId));
  return true;
}

/**
 * @param {import('discord.js').ModalSubmitInteraction} interaction
 * @param {{ siteEventChannelId?: string | null }} [config]
 * @returns {Promise<boolean>}
 */
async function handleEventsModalSubmit(interaction, config = {}) {
  if (!interaction.isModalSubmit()) return false;

  const id = interaction.customId;

  if (id.startsWith('events:part1:')) {
    const sessionId = id.slice('events:part1:'.length);
    const session = getSession(sessionId);

    if (!session || session.userId !== interaction.user.id) {
      await interaction.reply({
        content: 'This setup expired or is not yours.',
        ephemeral: true
      });
      return true;
    }

    session.eventName = interaction.fields.getTextInputValue('ev_name').trim().slice(0, 200);
    session.startRaw = interaction.fields.getTextInputValue('ev_start').trim();
    session.endRaw = interaction.fields.getTextInputValue('ev_end').trim();
    session.description = interaction.fields.getTextInputValue('ev_description').trim().slice(0, 1000);
    session.part1Done = true;
    session.expiresAt = Date.now() + TTL_MS;
    sessions.set(sessionId, session);

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`events:more:${sessionId}`)
        .setLabel('Continue — podium & pets (2/2)')
        .setStyle(ButtonStyle.Primary)
    );

    await interaction.reply({
      content:
        '**Step 1 saved.** Discord has no built-in calendar in modals — you typed start/end in text; we will convert them to local timestamps next.\n\nClick **Continue** for **1st**, **2nd**, **3rd**, and **Pets**.',
      components: [row],
      ephemeral: true
    });
    return true;
  }

  if (id.startsWith('events:part2:')) {
    const sessionId = id.slice('events:part2:'.length);
    const session = getSession(sessionId);

    if (!session || session.userId !== interaction.user.id || !session.part1Done) {
      await interaction.reply({
        content: 'This setup expired or is not yours. Run `/events` again.',
        ephemeral: true
      });
      return true;
    }

    session.first = interaction.fields.getTextInputValue('ev_first').trim().slice(0, 200);
    session.second = interaction.fields.getTextInputValue('ev_second').trim().slice(0, 200);
    session.third = interaction.fields.getTextInputValue('ev_third').trim().slice(0, 200);
    session.pets = interaction.fields.getTextInputValue('ev_pets').trim().slice(0, 200);

    const startRes = resolveEventTimeUnix(session.startRaw, DEFAULT_TZ);
    const endRes = resolveEventTimeUnix(session.endRaw, DEFAULT_TZ);

    if (startRes.unixSeconds == null || endRes.unixSeconds == null) {
      await interaction.reply({
        content:
          `Could not understand **start** and/or **end** time.\n\nTry things like:\n- \`Mar 30 8pm\`\n- \`Mar 30 2026 8pm\`\n- \`in 30 minutes\`\n- a Discord time like \`<t:1735689600:F>\`\n\nAll times are treated as US Central.\n\nStart: ${
            startRes.unixSeconds == null ? '❌' : '✅'
          }\nEnd: ${endRes.unixSeconds == null ? '❌' : '✅'}\n\nRun \`/events\` again.`,
        ephemeral: true
      });
      sessions.delete(sessionId);
      return true;
    }

    const startUnix = startRes.unixSeconds;
    const endUnix = endRes.unixSeconds;

    if (endUnix <= startUnix) {
      await interaction.reply({
        content: '**End** must be after **start**. Run `/events` again.',
        ephemeral: true
      });
      sessions.delete(sessionId);
      return true;
    }

    const preferredId = config.siteEventChannelId || session.channelId;
    let channel =
      interaction.guild.channels.cache.get(preferredId) ||
      (await interaction.guild.channels.fetch(preferredId).catch(() => null));

    const usedFallback =
      Boolean(config.siteEventChannelId) &&
      config.siteEventChannelId !== session.channelId &&
      (!channel || !channel.isTextBased());

    if (usedFallback) {
      channel =
        interaction.guild.channels.cache.get(session.channelId) ||
        (await interaction.guild.channels.fetch(session.channelId).catch(() => null));
    }

    if (!channel || !channel.isTextBased()) {
      await interaction.reply({ content: 'Could not find the channel to post in.', ephemeral: true });
      sessions.delete(sessionId);
      return true;
    }

    const embed = buildPostedEmbed(session, startUnix, endUnix, interaction.user.tag);

    const logoUrl = await fetchOsrsLogoForEventName(session.eventName);
    if (logoUrl) {
      embed.setThumbnail(logoUrl);
    }

    const terpinheimerPayload = {
      eventName: session.eventName,
      description: session.description || '',
      startUnix,
      endUnix,
      startIso: new Date(startUnix * 1000).toISOString(),
      endIso: new Date(endUnix * 1000).toISOString(),
      first: session.first || '',
      second: session.second || '',
      third: session.third || '',
      pets: session.pets || '',
      authorTag: interaction.user.tag,
      authorId: interaction.user.id,
      channelId: channel.id,
      guildId: session.guildId
    };

    const apiResult = await postTerpinheimerCustomEvent(terpinheimerPayload);
    const skipChannel = shouldSkipDiscordChannelPost();
    const postedToSite = !apiResult.skipped && apiResult.ok;

    if (!skipChannel || !postedToSite) {
      await channel.send({ embeds: [embed] });
    }

    sessions.delete(sessionId);

    let reply =
      skipChannel && postedToSite
        ? 'Event submitted to the clan site. If the site posts via webhook, check that channel.'
        : skipChannel && !postedToSite && !apiResult.skipped
          ? `Could not sync to the clan site (${apiResult.status || apiResult.error || 'error'}); posted in ${channel} instead.`
          : `Posted in ${channel}. Everyone sees **Start** and **End** in their own timezone.`;

    if (usedFallback) {
      reply += ' (Configured site event channel was invalid; used the channel where you ran `/events`.)';
    }

    if (!skipChannel && postedToSite) {
      reply += ' Synced to clan site.';
    } else if (!skipChannel && !postedToSite && !apiResult.skipped) {
      reply += ` Clan site sync failed (${apiResult.status || apiResult.error || 'error'}).`;
    }

    await interaction.reply({
      content: reply,
      ephemeral: true
    });
    return true;
  }

  return false;
}

module.exports = {
  executeEventsCommand,
  handleEventsButton,
  handleEventsModalSubmit
};
