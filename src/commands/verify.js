const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { buildVerifyMessagePayload } = require('../utils/verifyStickyMessage');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('setup-verify')
    .setDescription('Create a verification message so new members can verify themselves.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addChannelOption(option =>
      option
        .setName('channel')
        .setDescription('Channel where the verify button should be posted')
        .setRequired(true)
    )
    .addChannelOption(option =>
      option
        .setName('log_channel')
        .setDescription('Channel where verification logs / approve buttons are posted')
        .setRequired(false)
    )
    .addRoleOption(option =>
      option
        .setName('legacy_role')
        .setDescription(
          'Optional verified role to grant on approval and remove on deny'
        )
        .setRequired(false)
    ),

  async execute(interaction, { config, saveConfig }) {
    const targetChannel = interaction.options.getChannel('channel', true);
    const logChannel = interaction.options.getChannel('log_channel', false);
    const legacyRole = interaction.options.getRole('legacy_role', false);

    if (!targetChannel.isTextBased()) {
      await interaction.reply({
        content: 'Please select a text channel for verification.',
        ephemeral: true
      });
      return;
    }

    if (config.verificationMessageId) {
      await targetChannel.messages.delete(config.verificationMessageId).catch(() => null);
    }

    const sent = await targetChannel.send(buildVerifyMessagePayload());

    config.verificationChannelId = targetChannel.id;
    config.verificationMessageId = sent.id;
    config.verifiedRoleId = legacyRole?.id ?? null;
    if (logChannel) config.logChannelId = logChannel.id;
    saveConfig();

    const extra = legacyRole ? ` On approval it grants ${legacyRole}; on deny it removes it.` : '';
    await interaction.reply({
      content: `Verification message created in ${targetChannel}.${logChannel ? ` Logs: ${logChannel}.` : ''}${extra}`,
      ephemeral: true
    });
  }
};
