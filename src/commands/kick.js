const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { logModerationAction } = require('../utils/modlog');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('kick')
    .setDescription('Kick a member from the server.')
    .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers)
    .addUserOption(option =>
      option
        .setName('user')
        .setDescription('The member to kick')
        .setRequired(true)
    )
    .addStringOption(option =>
      option
        .setName('reason')
        .setDescription('Reason for the kick')
        .setRequired(false)
    ),

  async execute(interaction, { config }) {
    const target = interaction.options.getMember('user');
    const reason = interaction.options.getString('reason') || 'No reason provided';

    if (!target) {
      await interaction.reply({ content: 'I could not find that member.', ephemeral: true });
      return;
    }

    if (!target.kickable) {
      await interaction.reply({ content: 'I cannot kick that member (role hierarchy or permissions).', ephemeral: true });
      return;
    }

    await target.kick(reason).catch(() => null);

    await interaction.reply({
      content: `Kicked ${target.user.tag}. Reason: ${reason}`,
      ephemeral: true
    });

    await logModerationAction(interaction, config, {
      action: 'Kick',
      targetId: target.id,
      details: `Reason: ${reason}`
    });
  }
};
