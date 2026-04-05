const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { findItemMeta, getLatestPrice } = require('../utils/osrsPrice');
const { loadGeWatches, saveGeWatches } = require('../utils/geWatchStore');
const {
  CHANGE_THRESHOLD_GP,
  buildAlertEmbed,
  priceReference,
  runGrandExchangeWatchScan
} = require('../utils/grandExchangeAlerts');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('grandexchange')
    .setDescription('OSRS Exchange watchlist and alerts.')
    .addSubcommand(sub =>
      sub
        .setName('setchannel')
        .setDescription('Set the locked channel where GE alerts are posted.')
        .addChannelOption(opt =>
          opt
            .setName('channel')
            .setDescription('Channel to lock GE alerts to')
            .setRequired(true)
        )
    )
    .addSubcommand(sub =>
      sub
        .setName('setthreshold')
        .setDescription('Set price movement threshold for GE alerts.')
        .addIntegerOption(opt =>
          opt
            .setName('gp')
            .setDescription('Threshold in gp (example: 25000)')
            .setRequired(true)
            .setMinValue(1)
            .setMaxValue(500000000)
        )
    )
    .addSubcommand(sub =>
      sub
        .setName('watch')
        .setDescription('Watch an item and alert when movement exceeds threshold on the daily GE scan.')
        .addStringOption(opt =>
          opt
            .setName('item')
            .setDescription('Item name')
            .setRequired(true)
            .setMaxLength(100)
        )
    )
    .addSubcommand(sub =>
      sub
        .setName('unwatch')
        .setDescription('Remove an item from GE watchlist.')
        .addStringOption(opt =>
          opt
            .setName('item')
            .setDescription('Item name')
            .setRequired(true)
            .setMaxLength(100)
        )
    )
    .addSubcommand(sub => sub.setName('list').setDescription('List watched GE items.'))
    .addSubcommand(sub => sub.setName('check').setDescription('Run a GE scan now (posts to locked channel).'))
    .addSubcommand(sub =>
      sub
        .setName('lookup')
        .setDescription('Lookup an item now and preview full info.')
        .addStringOption(opt =>
          opt
            .setName('item')
            .setDescription('Item name')
            .setRequired(true)
            .setMaxLength(100)
        )
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.SendMessages),

  async execute(interaction, { config, saveConfig }) {
    const sub = interaction.options.getSubcommand(true);
    const thresholdRaw = Number(config.geThresholdGp ?? CHANGE_THRESHOLD_GP);
    const currentThreshold =
      Number.isFinite(thresholdRaw) && thresholdRaw > 0 ? Math.round(thresholdRaw) : CHANGE_THRESHOLD_GP;

    if (sub === 'setchannel') {
      if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
        await interaction.reply({ content: 'You need Manage Server to set this channel.', ephemeral: true });
        return;
      }
      const channel = interaction.options.getChannel('channel', true);
      if (!channel.isTextBased()) {
        await interaction.reply({ content: 'Choose a text channel.', ephemeral: true });
        return;
      }
      config.geChannelId = channel.id;
      saveConfig();
      await interaction.reply({
        content: `Grand Exchange alerts are now locked to ${channel}. Automatic scan: daily after 7:00 AM US Central (America/Chicago). Threshold: ${currentThreshold.toLocaleString('en-US')} gp.`,
        ephemeral: true
      });
      return;
    }

    if (sub === 'setthreshold') {
      if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
        await interaction.reply({ content: 'You need Manage Server to change threshold.', ephemeral: true });
        return;
      }
      const gp = interaction.options.getInteger('gp', true);
      config.geThresholdGp = gp;
      saveConfig();
      await interaction.reply({
        content: `GE alert threshold set to **${Number(gp).toLocaleString('en-US')} gp**.`,
        ephemeral: true
      });
      return;
    }

    const geChannelId = config.geChannelId || null;
    if (!geChannelId) {
      await interaction.reply({
        content: 'No GE channel set yet. Run `/grandexchange setchannel channel:#your-channel` first.',
        ephemeral: true
      });
      return;
    }

    if (sub === 'watch') {
      const query = interaction.options.getString('item', true).trim();
      await interaction.deferReply({ ephemeral: true });

      const meta = await findItemMeta(query);
      if (!meta) {
        await interaction.editReply(`No item matched **${query}**.`);
        return;
      }

      const latest = await getLatestPrice(meta.id);
      if (!latest) {
        await interaction.editReply(`Found **${meta.name}** but could not load live prices.`);
        return;
      }

      const ref = priceReference(latest);
      if (ref == null) {
        await interaction.editReply(`Found **${meta.name}** but no usable price reference was available.`);
        return;
      }

      const store = loadGeWatches();
      store[String(meta.id)] = {
        itemId: meta.id,
        itemName: meta.name,
        lastRefPrice: ref,
        lastHigh: latest.high ?? null,
        lastLow: latest.low ?? null,
        lastScannedAt: new Date().toISOString(),
        lastAlertAt: null,
        createdBy: interaction.user.id,
        createdAt: new Date().toISOString()
      };
      saveGeWatches(store);

      await interaction.editReply(
        `Watching **${meta.name}**. Alerts post in <#${geChannelId}> when movement is >= ${currentThreshold.toLocaleString('en-US')} gp on the daily 7:00 AM Central scan (or when you run /grandexchange check).`
      );
      return;
    }

    if (sub === 'unwatch') {
      const query = interaction.options.getString('item', true).trim();
      await interaction.deferReply({ ephemeral: true });
      const meta = await findItemMeta(query);
      if (!meta) {
        await interaction.editReply(`No item matched **${query}**.`);
        return;
      }
      const store = loadGeWatches();
      if (!store[String(meta.id)]) {
        await interaction.editReply(`**${meta.name}** is not being watched.`);
        return;
      }
      delete store[String(meta.id)];
      saveGeWatches(store);
      await interaction.editReply(`Stopped watching **${meta.name}**.`);
      return;
    }

    if (sub === 'list') {
      const store = loadGeWatches();
      const rows = Object.values(store);
      if (!rows.length) {
        await interaction.reply({ content: `No watched items yet. Alerts channel: <#${geChannelId}>.`, ephemeral: true });
        return;
      }
      const lines = rows
        .sort((a, b) => String(a.itemName).localeCompare(String(b.itemName)))
        .map(r => `• **${r.itemName}** (id: ${r.itemId})`)
        .slice(0, 80);
      await interaction.reply({
        content: `Locked alerts channel: <#${geChannelId}>\nThreshold: ${currentThreshold.toLocaleString('en-US')} gp\n\n${lines.join('\n')}`,
        ephemeral: true
      });
      return;
    }

    if (sub === 'check') {
      if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
        await interaction.reply({ content: 'You need Manage Server to run manual scans.', ephemeral: true });
        return;
      }
      await interaction.deferReply({ ephemeral: true });
      await runGrandExchangeWatchScan(interaction.client, config);
      await interaction.editReply(`Scan complete. Any qualifying alerts were posted in <#${geChannelId}>.`);
      return;
    }

    if (sub === 'lookup') {
      const query = interaction.options.getString('item', true).trim();
      await interaction.deferReply({ ephemeral: true });

      const meta = await findItemMeta(query);
      if (!meta) {
        await interaction.editReply(`No item matched **${query}**.`);
        return;
      }
      const latest = await getLatestPrice(meta.id);
      if (!latest) {
        await interaction.editReply(`Found **${meta.name}** but could not load live prices.`);
        return;
      }
      const embed = buildAlertEmbed(meta, latest, 0, currentThreshold);
      await interaction.editReply({ embeds: [embed] });
      return;
    }
  }
};

