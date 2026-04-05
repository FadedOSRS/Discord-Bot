const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { logModerationAction } = require('../utils/modlog');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('clear')
    .setDescription('Bulk delete a number of messages in this channel.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addIntegerOption(option =>
      option
        .setName('amount')
        .setDescription('Number of recent messages to delete (1–100)')
        .setRequired(true)
    ),

  async execute(interaction, { config }) {
    const amount = interaction.options.getInteger('amount');

    if (amount < 1 || amount > 100) {
      await interaction.reply({
        content: 'Please provide an amount between 1 and 100.',
        ephemeral: true
      });
      return;
    }

    const channel = interaction.channel;

    await interaction.deferReply({ ephemeral: true });

    const messages = await channel.messages.fetch({ limit: amount }).catch(() => null);
    if (!messages) {
      await interaction.editReply('Could not fetch messages to delete.');
      return;
    }

    await channel.bulkDelete(messages, true).catch(() => null);

    await interaction.editReply(`Deleted ${messages.size} message(s).`);

    await logModerationAction(interaction, config, {
      action: 'Clear messages',
      details: `Deleted: ${messages.size} in <#${channel.id}>`
    });
  }
};
