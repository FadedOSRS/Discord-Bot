const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { loadWarnings, saveWarnings, keyFor } = require('../utils/warningsStore');
const { logModerationAction } = require('../utils/modlog');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('clear-warnings')
    .setDescription('Clear all warnings for a member.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption(option =>
      option
        .setName('user')
        .setDescription('Member to clear warnings for')
        .setRequired(true)
    ),

  async execute(interaction, { config }) {
    const member = interaction.options.getMember('user');

    if (!member) {
      await interaction.reply({ content: 'I could not find that member.', ephemeral: true });
      return;
    }

    const store = loadWarnings();
    const key = keyFor(interaction.guildId, member.id);
    const previous = Array.isArray(store[key]) ? store[key].length : 0;

    delete store[key];
    saveWarnings(store);

    await interaction.reply({
      content: `Cleared ${previous} warning(s) for ${member.user.tag}.`,
      ephemeral: true
    });

    await logModerationAction(interaction, config, {
      action: 'Clear warnings',
      targetId: member.id,
      details: `Cleared warnings count: ${previous}`
    });
  }
};
