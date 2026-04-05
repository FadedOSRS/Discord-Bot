const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { loadWarnings, saveWarnings, keyFor } = require('../utils/warningsStore');
const { logModerationAction } = require('../utils/modlog');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('warn')
    .setDescription('Issue a warning to a member.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption(option =>
      option
        .setName('user')
        .setDescription('Member to warn')
        .setRequired(true)
    )
    .addStringOption(option =>
      option
        .setName('reason')
        .setDescription('Reason for warning')
        .setRequired(true)
        .setMaxLength(500)
    ),

  async execute(interaction, { config }) {
    const member = interaction.options.getMember('user');
    const reason = interaction.options.getString('reason', true);

    if (!member) {
      await interaction.reply({ content: 'I could not find that member.', ephemeral: true });
      return;
    }

    const store = loadWarnings();
    const key = keyFor(interaction.guildId, member.id);
    const list = Array.isArray(store[key]) ? store[key] : [];

    list.push({
      reason,
      moderatorId: interaction.user.id,
      createdAt: new Date().toISOString()
    });

    store[key] = list;
    saveWarnings(store);

    await interaction.reply({
      content: `Warned ${member.user.tag}. Total warnings: ${list.length}`,
      ephemeral: true
    });

    await logModerationAction(interaction, config, {
      action: 'Warn',
      targetId: member.id,
      details: `Reason: ${reason}; Total warnings: ${list.length}`
    });
  }
};
