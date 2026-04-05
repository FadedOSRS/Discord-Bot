const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder
} = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('giveaway')
    .setDescription('Create a giveaway with a modal form.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  async execute(interaction) {
    const modal = new ModalBuilder()
      .setCustomId('giveaway:create')
      .setTitle('Create Giveaway');

    const winnersInput = new TextInputBuilder()
      .setCustomId('winners')
      .setLabel('Number of winners')
      .setRequired(true)
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('1');

    const nameInput = new TextInputBuilder()
      .setCustomId('name')
      .setLabel('Name of Giveaway')
      .setRequired(true)
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('10M OSRS GP / Bond / Discord Nitro');

    const endInput = new TextInputBuilder()
      .setCustomId('end')
      .setLabel('End date & time (ISO or Discord timestamp)')
      .setRequired(true)
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('2026-03-26 21:00 or <t:1774568400:F>');

    const descInput = new TextInputBuilder()
      .setCustomId('description')
      .setLabel('Description')
      .setRequired(true)
      .setStyle(TextInputStyle.Paragraph)
      .setPlaceholder('How to enter, eligibility, notes...');

    modal.addComponents(
      new ActionRowBuilder().addComponents(winnersInput),
      new ActionRowBuilder().addComponents(nameInput),
      new ActionRowBuilder().addComponents(endInput),
      new ActionRowBuilder().addComponents(descInput)
    );

    await interaction.showModal(modal);
  }
};

