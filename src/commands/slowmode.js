const { SlashCommandBuilder, PermissionFlagsBits, ChannelType } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('slowmode')
    .setDescription('Set slowmode for a text channel.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .addIntegerOption(option =>
      option
        .setName('seconds')
        .setDescription('Slowmode in seconds (0 to disable, max 21600)')
        .setRequired(true)
        .setMinValue(0)
        .setMaxValue(21600)
    )
    .addChannelOption(option =>
      option
        .setName('channel')
        .setDescription('Channel to update (defaults to current channel)')
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
        .setRequired(false)
    ),

  async execute(interaction) {
    const seconds = interaction.options.getInteger('seconds', true);
    const channel = interaction.options.getChannel('channel', false) || interaction.channel;

    if (!channel || !channel.isTextBased()) {
      await interaction.reply({ content: 'Pick a valid text channel.', ephemeral: true });
      return;
    }

    await channel.setRateLimitPerUser(seconds).catch(() => null);

    await interaction.reply({
      content: seconds === 0 ? `Slowmode disabled in ${channel}.` : `Set slowmode in ${channel} to ${seconds}s.`,
      ephemeral: true
    });
  }
};

