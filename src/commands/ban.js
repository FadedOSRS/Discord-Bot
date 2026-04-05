const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { logModerationAction } = require('../utils/modlog');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ban')
    .setDescription('Ban a member from the server.')
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
    .addUserOption(option =>
      option
        .setName('user')
        .setDescription('The member to ban')
        .setRequired(true)
    )
    .addIntegerOption(option =>
      option
        .setName('days')
        .setDescription('Delete message history (0–7 days)')
        .setRequired(false)
    )
    .addStringOption(option =>
      option
        .setName('reason')
        .setDescription('Reason for the ban')
        .setRequired(false)
    ),

  async execute(interaction, { config }) {
    const target = interaction.options.getMember('user');
    const days = interaction.options.getInteger('days') ?? 0;
    const reason = interaction.options.getString('reason') || 'No reason provided';

    if (!target) {
      await interaction.reply({ content: 'I could not find that member.', ephemeral: true });
      return;
    }

    if (!target.bannable) {
      await interaction.reply({ content: 'I cannot ban that member (role hierarchy or permissions).', ephemeral: true });
      return;
    }

    const deleteMessageSeconds = Math.min(Math.max(days, 0), 7) * 24 * 60 * 60;

    await target.ban({
      deleteMessageSeconds,
      reason
    }).catch(() => null);

    await interaction.reply({
      content: `Banned ${target.user.tag}. Reason: ${reason}`,
      ephemeral: true
    });

    await logModerationAction(interaction, config, {
      action: 'Ban',
      targetId: target.id,
      details: `Reason: ${reason}; Delete history days: ${days}`
    });
  }
};
