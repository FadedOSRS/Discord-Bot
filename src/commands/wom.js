const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { WOM_GROUP_ID, fetchCompetitions, runWomCompetitionReminderScan } = require('../utils/wiseOldManCompetitions');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('wom')
    .setDescription('Wise Old Man competition reminder settings.')
    .addSubcommand(sub =>
      sub
        .setName('setchannel')
        .setDescription('Set channel for 1-hour competition reminders.')
        .addChannelOption(opt =>
          opt
            .setName('channel')
            .setDescription('Announcement channel')
            .setRequired(true)
        )
    )
    .addSubcommand(sub =>
      sub
        .setName('setrole')
        .setDescription('Optional role to ping on reminder messages.')
        .addRoleOption(opt =>
          opt
            .setName('role')
            .setDescription('Role to ping (omit to clear)')
            .setRequired(false)
        )
    )
    .addSubcommand(sub =>
      sub
        .setName('setverification')
        .setDescription('Set WOM group verification code used for 5-minute update-all.')
        .addStringOption(opt =>
          opt
            .setName('code')
            .setDescription('Wise Old Man group verification code')
            .setRequired(true)
            .setMaxLength(64)
        )
    )
    .addSubcommand(sub => sub.setName('status').setDescription('Show WOM reminder configuration.'))
    .addSubcommand(sub => sub.setName('check').setDescription('Run the WOM reminder scan now.'))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  async execute(interaction, { config, saveConfig }) {
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
      await interaction.reply({ content: 'You need Manage Server to use `/wom`.', ephemeral: true });
      return;
    }

    const sub = interaction.options.getSubcommand(true);

    if (sub === 'setchannel') {
      const channel = interaction.options.getChannel('channel', true);
      if (!channel.isTextBased()) {
        await interaction.reply({ content: 'Choose a text channel.', ephemeral: true });
        return;
      }
      config.womAnnouncementsChannelId = channel.id;
      saveConfig();
      await interaction.reply({
        content: `Wise Old Man 1-hour reminders will post in ${channel} (group ${WOM_GROUP_ID}).`,
        ephemeral: true
      });
      return;
    }

    if (sub === 'setrole') {
      const role = interaction.options.getRole('role', false);
      config.womPingRoleId = role?.id ?? null;
      saveConfig();
      await interaction.reply({
        content: role
          ? `WOM reminders will ping ${role}.`
          : 'WOM reminder role ping cleared.',
        ephemeral: true
      });
      return;
    }

    if (sub === 'setverification') {
      const code = interaction.options.getString('code', true).trim();
      config.womGroupId = WOM_GROUP_ID;
      config.womVerificationCode = code;
      saveConfig();
      await interaction.reply({
        content: `Stored WOM verification code for group **${WOM_GROUP_ID}**. 5-minute reminders will trigger update-all automatically.`,
        ephemeral: true
      });
      return;
    }

    if (sub === 'status') {
      const channel = config.womAnnouncementsChannelId
        ? `<#${config.womAnnouncementsChannelId}>`
        : 'Not set';
      const role = config.womPingRoleId ? `<@&${config.womPingRoleId}>` : 'No role ping';
      const competitions = await fetchCompetitions();
      await interaction.reply({
        content:
          `WOM group: **${WOM_GROUP_ID}**\n` +
          `Channel: ${channel}\n` +
          `Ping role: ${role}\n` +
          `Verification code: ${config.womVerificationCode ? 'Set' : 'Not set'}\n` +
          `Reminder timings: **1 hour** and **5 minutes** before start\n` +
          `Fetched competitions: **${competitions.length}**`,
        ephemeral: true
      });
      return;
    }

    if (sub === 'check') {
      await interaction.deferReply({ ephemeral: true });
      await runWomCompetitionReminderScan(interaction.client, config);
      await interaction.editReply('WOM reminder scan complete.');
    }
  }
};

