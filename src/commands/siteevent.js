const { SlashCommandBuilder, PermissionFlagsBits, ChannelType } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('siteevent')
    .setDescription('Configure where /events posts appear in this server.')
    .addSubcommand(sub =>
      sub
        .setName('setchannel')
        .setDescription('Post /events embeds in this channel (instead of where the command was run).')
        .addChannelOption(opt =>
          opt
            .setName('channel')
            .setDescription('Text channel for event posts')
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
            .setRequired(true)
        )
    )
    .addSubcommand(sub =>
      sub
        .setName('clear')
        .setDescription('Unset: /events will post in the channel where it was started.')
    )
    .addSubcommand(sub =>
      sub.setName('status').setDescription('Show which channel is configured for /events posts.')
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.SendMessages),

  async execute(interaction, { config, saveConfig }) {
    const sub = interaction.options.getSubcommand(true);

    if (sub === 'status') {
      const id = config.siteEventChannelId || null;
      if (!id) {
        await interaction.reply({
          content:
            'No site event channel is set. `/events` will post in **the channel where someone runs the command**.',
          ephemeral: true
        });
        return;
      }
      await interaction.reply({
        content: `/events posts are locked to <#${id}>.`,
        ephemeral: true
      });
      return;
    }

    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
      await interaction.reply({
        content: 'You need **Manage Server** to change the site event channel.',
        ephemeral: true
      });
      return;
    }

    if (sub === 'clear') {
      config.siteEventChannelId = null;
      saveConfig();
      await interaction.reply({
        content: 'Cleared. `/events` will post in the channel where it is run.',
        ephemeral: true
      });
      return;
    }

    if (sub === 'setchannel') {
      const channel = interaction.options.getChannel('channel', true);
      if (!channel.isTextBased()) {
        await interaction.reply({ content: 'Choose a text or announcement channel.', ephemeral: true });
        return;
      }
      config.siteEventChannelId = channel.id;
      saveConfig();
      await interaction.reply({
        content: `/events will post in ${channel}. Anyone can still **run** /events from anywhere; the embed goes here.`,
        ephemeral: true
      });
    }
  }
};
