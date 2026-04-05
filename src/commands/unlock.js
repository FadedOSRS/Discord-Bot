const { SlashCommandBuilder, PermissionFlagsBits, ChannelType } = require('discord.js');
const { logModerationAction } = require('../utils/modlog');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('unlock')
    .setDescription('Unlock a text channel for @everyone messages.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .addChannelOption(option =>
      option
        .setName('channel')
        .setDescription('Channel to unlock (defaults to current)')
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
        .setRequired(false)
    ),

  async execute(interaction, { config }) {
    const channel = interaction.options.getChannel('channel') || interaction.channel;

    if (!channel || !channel.isTextBased()) {
      await interaction.reply({ content: 'Pick a text channel.', ephemeral: true });
      return;
    }

    const everyoneRole = interaction.guild.roles.everyone;
    await channel.permissionOverwrites.edit(everyoneRole, { SendMessages: null }).catch(() => null);

    await interaction.reply({ content: `Unlocked ${channel}.`, ephemeral: true });

    await logModerationAction(interaction, config, {
      action: 'Unlock channel',
      details: `Unlocked <#${channel.id}>`
    });
  }
};
