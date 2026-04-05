const { SlashCommandBuilder } = require('discord.js');
const { setAfk, clearAfk, getAfk } = require('../utils/afkStore');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('afk')
    .setDescription('Set or clear your AFK status (others get a reply when they ping you).')
    .addSubcommand(sub =>
      sub
        .setName('set')
        .setDescription('Mark yourself AFK')
        .addStringOption(o =>
          o.setName('reason').setDescription('Optional message').setRequired(false).setMaxLength(200)
        )
    )
    .addSubcommand(sub => sub.setName('clear').setDescription('Remove your AFK status')),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand(true);
    const guildId = interaction.guildId;

    if (!guildId) {
      await interaction.reply({ content: 'Use this in a server.', ephemeral: true });
      return;
    }

    if (sub === 'clear') {
      const had = clearAfk(guildId, interaction.user.id);
      await interaction.reply({
        content: had ? 'AFK status cleared.' : 'You were not marked AFK.',
        ephemeral: true
      });
      return;
    }

    const reason = interaction.options.getString('reason')?.trim() || 'AFK';
    setAfk(guildId, interaction.user.id, reason);
    await interaction.reply({
      content: `You’re now **AFK**: ${reason}\nI’ll reply when someone mentions you in this server. Send any message here to clear AFK automatically.`,
      ephemeral: true
    });
  }
};
