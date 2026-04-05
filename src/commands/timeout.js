const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { logModerationAction } = require('../utils/modlog');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('timeout')
    .setDescription('Temporarily mute a member (timeout).')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption(option =>
      option
        .setName('user')
        .setDescription('The member to timeout')
        .setRequired(true)
    )
    .addIntegerOption(option =>
      option
        .setName('minutes')
        .setDescription('Duration in minutes (1–4320, up to 3 days)')
        .setRequired(true)
    )
    .addStringOption(option =>
      option
        .setName('reason')
        .setDescription('Reason for the timeout')
        .setRequired(false)
    ),

  async execute(interaction, { config }) {
    const target = interaction.options.getMember('user');
    const minutes = interaction.options.getInteger('minutes');
    const reason = interaction.options.getString('reason') || 'No reason provided';

    if (!target) {
      await interaction.reply({ content: 'I could not find that member.', ephemeral: true });
      return;
    }

    if (!target.moderatable) {
      await interaction.reply({ content: 'I cannot timeout that member (role hierarchy or permissions).', ephemeral: true });
      return;
    }

    if (minutes < 1 || minutes > 4320) {
      await interaction.reply({
        content: 'Please provide a timeout duration between 1 and 4320 minutes (up to 3 days).',
        ephemeral: true
      });
      return;
    }

    const ms = minutes * 60 * 1000;
    await target.timeout(ms, reason).catch(() => null);

    await interaction.reply({
      content: `Timed out ${target.user.tag} for ${minutes} minute(s). Reason: ${reason}`,
      ephemeral: true
    });

    await logModerationAction(interaction, config, {
      action: 'Timeout',
      targetId: target.id,
      details: `Duration: ${minutes}m; Reason: ${reason}`
    });
  }
};
