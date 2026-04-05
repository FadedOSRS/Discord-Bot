const { SlashCommandBuilder, PermissionFlagsBits, ChannelType } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('modlog')
    .setDescription('Configure moderation logging channel.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand(sub =>
      sub
        .setName('set')
        .setDescription('Set the moderation log channel.')
        .addChannelOption(option =>
          option
            .setName('channel')
            .setDescription('Channel to receive moderation logs')
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
            .setRequired(true)
        )
    )
    .addSubcommand(sub =>
      sub
        .setName('clear')
        .setDescription('Disable moderation logging.')
    )
    .addSubcommand(sub =>
      sub
        .setName('view')
        .setDescription('Show current moderation log channel.')
    ),

  async execute(interaction, { config, saveConfig }) {
    const sub = interaction.options.getSubcommand(true);

    if (sub === 'set') {
      const channel = interaction.options.getChannel('channel', true);
      config.modLogChannelId = channel.id;
      saveConfig();
      await interaction.reply({ content: `Moderation logs will be sent to ${channel}.`, ephemeral: true });
      return;
    }

    if (sub === 'clear') {
      config.modLogChannelId = null;
      saveConfig();
      await interaction.reply({ content: 'Moderation logging disabled.', ephemeral: true });
      return;
    }

    const current = config.modLogChannelId ? `<#${config.modLogChannelId}>` : 'Not configured';
    await interaction.reply({ content: `Current mod log channel: ${current}`, ephemeral: true });
  }
};
