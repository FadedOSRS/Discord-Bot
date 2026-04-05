const { SlashCommandBuilder, PermissionFlagsBits, ChannelType } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('announce')
    .setDescription('Post a staff announcement into a channel.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addStringOption(option =>
      option
        .setName('message')
        .setDescription('Announcement content')
        .setRequired(true)
        .setMaxLength(2000)
    )
    .addChannelOption(option =>
      option
        .setName('channel')
        .setDescription('Where to post it (defaults to current channel)')
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
        .setRequired(false)
    ),

  async execute(interaction) {
    const message = interaction.options.getString('message', true);
    const channel = interaction.options.getChannel('channel', false) || interaction.channel;

    if (!channel || !channel.isTextBased()) {
      await interaction.reply({ content: 'Pick a valid text channel.', ephemeral: true });
      return;
    }

    await channel.send(`📢 **Announcement**\n${message}`).catch(() => null);

    await interaction.reply({
      content: `Announcement posted in ${channel}.`,
      ephemeral: true
    });
  }
};

