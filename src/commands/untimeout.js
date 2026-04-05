const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { logModerationAction } = require('../utils/modlog');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('untimeout')
    .setDescription('Remove timeout from a member.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption(option =>
      option
        .setName('user')
        .setDescription('Member to remove timeout from')
        .setRequired(true)
    )
    .addStringOption(option =>
      option
        .setName('reason')
        .setDescription('Reason for removing timeout')
        .setRequired(false)
    ),

  async execute(interaction, { config }) {
    const member = interaction.options.getMember('user');
    const reason = interaction.options.getString('reason') || 'No reason provided';

    if (!member) {
      await interaction.reply({ content: 'I could not find that member.', ephemeral: true });
      return;
    }

    if (!member.moderatable) {
      await interaction.reply({ content: 'I cannot modify this member (role hierarchy or permissions).', ephemeral: true });
      return;
    }

    await member.timeout(null, reason).catch(() => null);

    await interaction.reply({
      content: `Removed timeout from ${member.user.tag}. Reason: ${reason}`,
      ephemeral: true
    });

    await logModerationAction(interaction, config, {
      action: 'Remove timeout',
      targetId: member.id,
      details: `Reason: ${reason}`
    });
  }
};
