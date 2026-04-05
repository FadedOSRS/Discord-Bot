const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { logModerationAction } = require('../utils/modlog');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('purge')
    .setDescription('Purge messages by amount or by specific user.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addIntegerOption(option =>
      option
        .setName('amount')
        .setDescription('How many messages to purge (1-100)')
        .setRequired(true)
        .setMinValue(1)
        .setMaxValue(100)
    )
    .addUserOption(option =>
      option
        .setName('user')
        .setDescription('Optional: only delete messages from this user')
        .setRequired(false)
    ),

  async execute(interaction, { config }) {
    const amount = interaction.options.getInteger('amount', true);
    const user = interaction.options.getUser('user', false);
    const channel = interaction.channel;

    if (!channel || !channel.isTextBased()) {
      await interaction.reply({ content: 'This command can only be used in a text channel.', ephemeral: true });
      return;
    }

    await interaction.deferReply({ ephemeral: true });

    // No user filter: simple bulk delete.
    if (!user) {
      const deleted = await channel.bulkDelete(amount, true).catch(() => null);
      if (!deleted) {
        await interaction.editReply('Could not purge messages in this channel.');
        return;
      }

      await interaction.editReply(
        `Purged ${deleted.size} message(s). (Discord only bulk deletes messages newer than 14 days.)`
      );

      await logModerationAction(interaction, config, {
        action: 'Purge messages',
        details: `Deleted ${deleted.size} message(s) in <#${channel.id}>`
      });
      return;
    }

    // User filter: scan recent messages and delete up to amount from that user.
    const fetched = await channel.messages.fetch({ limit: 100 }).catch(() => null);
    if (!fetched) {
      await interaction.editReply('Could not fetch messages to purge.');
      return;
    }

    const matches = fetched
      .filter(msg => msg.author.id === user.id)
      .first(amount);

    if (!matches.length) {
      await interaction.editReply(`No recent messages found from ${user.tag}.`);
      return;
    }

    const toDelete = matches.filter(msg => Date.now() - msg.createdTimestamp < 14 * 24 * 60 * 60 * 1000);
    const tooOldCount = matches.length - toDelete.length;

    let deletedCount = 0;
    if (toDelete.length === 1) {
      await toDelete[0].delete().catch(() => null);
      deletedCount = 1;
    } else if (toDelete.length > 1) {
      const deleted = await channel.bulkDelete(toDelete, true).catch(() => null);
      deletedCount = deleted ? deleted.size : 0;
    }

    await interaction.editReply(
      `Purged ${deletedCount} message(s) from ${user.tag}.${tooOldCount ? ` Skipped ${tooOldCount} older than 14 days.` : ''}`
    );

    await logModerationAction(interaction, config, {
      action: 'Purge by user',
      targetId: user.id,
      details: `Deleted ${deletedCount}; Skipped old: ${tooOldCount}; Channel: <#${channel.id}>`
    });
  }
};
