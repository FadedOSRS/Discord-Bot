const {
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionFlagsBits,
  EmbedBuilder
} = require('discord.js');
const fs = require('fs-extra');
const path = require('path');
const { getBossThumbnail, filterGroupBosses } = require('../data/lfgGroupBosses');
const { COMMON_TIMEZONE_CHOICES, resolveEventTimeUnix } = require('../utils/eventTimeParse');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('lfg')
    .setDescription('Create a bossing event / LFG post.')
    .addStringOption(option =>
      option
        .setName('boss')
        .setDescription('Group boss or activity — type to search the full list')
        .setRequired(true)
        .setAutocomplete(true)
    )
    .addStringOption(option =>
      option
        .setName('time')
        .setDescription(
          'When? e.g. 8pm CST, ISO date/time, <t:unix>, or in 30m. Use `timezone` if you omit CST/EST.'
        )
        .setRequired(true)
    )
    .addStringOption(option => {
      option
        .setName('timezone')
        .setDescription('Your zone if the time has no CST/EST (enables local <t:…> for everyone)')
        .setRequired(false);
      for (const tz of COMMON_TIMEZONE_CHOICES) {
        option.addChoices({ name: `${tz.label} (${tz.value})`, value: tz.value });
      }
      return option;
    })
    .addIntegerOption(option =>
      option
        .setName('max')
        .setDescription('Maximum number of players (optional)')
        .setRequired(false)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.SendMessages),

  async autocomplete(interaction) {
    const focused = interaction.options.getFocused(true);
    if (focused.name !== 'boss') return;
    const matches = filterGroupBosses(String(focused.value || ''));
    await interaction.respond(
      matches.map(b => ({
        name: b.name.length > 100 ? `${b.name.slice(0, 97)}...` : b.name,
        value: b.value.length > 100 ? b.value.slice(0, 100) : b.value
      }))
    );
  },

  async execute(interaction) {
    const boss = interaction.options.getString('boss', true);
    const time = interaction.options.getString('time', true);
    const tzOption = interaction.options.getString('timezone');
    const maxPlayers = interaction.options.getInteger('max', false);
    const targetChannel = interaction.channel;

    const host = interaction.user;

    const { unixSeconds, discordSnippet } = resolveEventTimeUnix(time, tzOption || null);
    const timeDisplay =
      discordSnippet != null
        ? `**Time:** ${time}\n${discordSnippet}`
        : `**Time:** ${time}`;

    const embed = new EmbedBuilder()
      .setTitle(`LFG: ${boss}`)
      .setDescription(
        `**Host:** ${host}\n${timeDisplay}${
          maxPlayers ? `\n**Max players:** ${maxPlayers}` : ''
        }`
      )
      .addFields(
        {
          name: '✅ Going',
          value: `${host}`,
          inline: false
        },
        {
          name: '🤔 Maybe',
          value: 'No one yet',
          inline: false
        }
      )
      .setFooter({ text: 'Click a button below to join or show interest.' })
      .setTimestamp();

    const thumb = getBossThumbnail(boss);
    if (thumb) {
      embed.setThumbnail(thumb);
    }

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('lfg:going:placeholder')
        .setLabel('✅ Going')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId('lfg:maybe:placeholder')
        .setLabel('🤔 Maybe')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId('lfg:not:placeholder')
        .setLabel('❌ Not going')
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId('lfg:voice:placeholder')
        .setLabel('🎧 Create temp voice')
        .setStyle(ButtonStyle.Primary)
    );

    const message = await targetChannel.send({
      embeds: [embed],
      components: [row]
    });

    // Update custom IDs with actual message ID
    const fixedRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`lfg:going:${message.id}`)
        .setLabel('✅ Going')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`lfg:maybe:${message.id}`)
        .setLabel('🤔 Maybe')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(`lfg:not:${message.id}`)
        .setLabel('❌ Not going')
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId(`lfg:voice:${message.id}`)
        .setLabel('🎧 Create temp voice')
        .setStyle(ButtonStyle.Primary)
    );

    await message.edit({ components: [fixedRow] });

    // Persist event for button updates
    const dataDir = process.env.DATA_DIR || './data';
    const lfgStorePath = path.join(dataDir, 'lfgEvents.json');

    const existing = fs.existsSync(lfgStorePath)
      ? fs.readJsonSync(lfgStorePath)
      : {};

    existing[message.id] = {
      messageId: message.id,
      guildId: interaction.guildId,
      channelId: targetChannel.id,
      boss,
      time,
      timeUnix: unixSeconds,
      maxPlayers: maxPlayers || null,
      hostId: host.id,
      going: [host.id],
      maybe: [],
      notGoing: [],
      tempVoiceChannelId: null,
      tempVoiceCreatedAt: null
    };

    fs.writeJsonSync(lfgStorePath, existing, { spaces: 2 });

    // Acknowledge without creating another visible message
    if (!interaction.replied && !interaction.deferred) {
      await interaction.deferReply({ ephemeral: true });
      await interaction.deleteReply().catch(() => null);
    }
  }
};

