const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { logModerationAction } = require('../utils/modlog');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('unban')
    .setDescription('Unban a user by ID.')
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
    .addStringOption(option =>
      option
        .setName('user_id')
        .setDescription('Discord user ID to unban')
        .setRequired(true)
    )
    .addStringOption(option =>
      option
        .setName('reason')
        .setDescription('Reason for unban')
        .setRequired(false)
    ),

  async execute(interaction, { config }) {
    const userId = interaction.options.getString('user_id', true).trim();
    const reason = interaction.options.getString('reason') || 'No reason provided';

    if (!/^\d{17,20}$/.test(userId)) {
      await interaction.reply({ content: 'Please provide a valid Discord user ID.', ephemeral: true });
      return;
    }

    const bans = await interaction.guild.bans.fetch().catch(() => null);
    if (!bans || !bans.has(userId)) {
      await interaction.reply({ content: 'That user is not currently banned.', ephemeral: true });
      return;
    }

    await interaction.guild.members.unban(userId, reason).catch(() => null);

    await interaction.reply({
      content: `Unbanned user ID ${userId}. Reason: ${reason}`,
      ephemeral: true
    });

    await logModerationAction(interaction, config, {
      action: 'Unban',
      targetId: userId,
      details: `Reason: ${reason}`
    });
  }
};
