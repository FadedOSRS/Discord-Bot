const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { loadWarnings, keyFor } = require('../utils/warningsStore');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('warnings')
    .setDescription('View a member\'s warning history.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption(option =>
      option
        .setName('user')
        .setDescription('Member to view warnings for')
        .setRequired(true)
    ),

  async execute(interaction) {
    const member = interaction.options.getMember('user');

    if (!member) {
      await interaction.reply({ content: 'I could not find that member.', ephemeral: true });
      return;
    }

    const store = loadWarnings();
    const key = keyFor(interaction.guildId, member.id);
    const list = Array.isArray(store[key]) ? store[key] : [];

    if (!list.length) {
      await interaction.reply({ content: `${member.user.tag} has no warnings.`, ephemeral: true });
      return;
    }

    const lines = list
      .slice(-10)
      .map((w, idx) => `${idx + 1}. ${w.reason} — <@${w.moderatorId}> (${new Date(w.createdAt).toLocaleString()})`);

    await interaction.reply({
      content: `Warnings for ${member.user.tag} (showing up to 10):\n${lines.join('\n')}`,
      ephemeral: true
    });
  }
};
