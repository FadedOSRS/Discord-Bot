const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChannelType
} = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('stick')
    .setDescription('Keep a message pinned to the bottom of a channel (auto-reposts when others chat).')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addSubcommand(sub =>
      sub
        .setName('set')
        .setDescription('Set or update the sticky message for a channel.')
        .addStringOption(opt =>
          opt
            .setName('content')
            .setDescription('Text to show at the bottom of the channel')
            .setRequired(true)
            .setMaxLength(2000)
        )
        .addChannelOption(opt =>
          opt
            .setName('channel')
            .setDescription('Channel (defaults to this channel)')
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
        )
    )
    .addSubcommand(sub =>
      sub
        .setName('clear')
        .setDescription('Remove the sticky from a channel.')
        .addChannelOption(opt =>
          opt
            .setName('channel')
            .setDescription('Channel (defaults to this channel)')
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
        )
    ),

  async execute(interaction, { stickies, saveStickies }) {
    const sub = interaction.options.getSubcommand(true);
    const channel = interaction.options.getChannel('channel') ?? interaction.channel;

    if (!channel || !channel.isTextBased()) {
      await interaction.reply({ content: 'Use this in a text channel.', ephemeral: true });
      return;
    }

    const chId = channel.id;

    if (sub === 'set') {
      const content = interaction.options.getString('content', true);

      const existing = stickies[chId];
      if (existing?.messageId) {
        await channel.messages.delete(existing.messageId).catch(() => null);
      }

      const msg = await channel.send({ content });
      stickies[chId] = {
        content,
        messageId: msg.id,
        channelId: chId,
        setBy: interaction.user.id,
        setAt: new Date().toISOString()
      };
      saveStickies();

      await interaction.reply({
        content: `Sticky is set in ${channel}. It will move to the bottom when people send messages.`,
        ephemeral: true
      });
      return;
    }

    if (sub === 'clear') {
      const existing = stickies[chId];
      if (existing?.messageId) {
        await channel.messages.delete(existing.messageId).catch(() => null);
      }
      delete stickies[chId];
      saveStickies();

      await interaction.reply({
        content: existing ? `Sticky removed from ${channel}.` : `No sticky was set for ${channel}.`,
        ephemeral: true
      });
    }
  }
};
