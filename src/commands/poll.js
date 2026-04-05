
const {
  SlashCommandBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder
} = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('poll')
    .setDescription('Create a multi-choice poll via modal.'),

  async execute(interaction) {
    const modal = new ModalBuilder().setCustomId('poll:create').setTitle('Create a new poll');

    const question = new TextInputBuilder()
      .setCustomId('question')
      .setLabel('Question (required)')
      .setStyle(TextInputStyle.Short)
      .setRequired(true)
      .setMaxLength(300)
      .setPlaceholder('The question you want to ask other members');

    const first = new TextInputBuilder()
      .setCustomId('choice1')
      .setLabel('First choice (required)')
      .setStyle(TextInputStyle.Short)
      .setRequired(true)
      .setMaxLength(100)
      .setPlaceholder('The first choice other members can vote for');

    const second = new TextInputBuilder()
      .setCustomId('choice2')
      .setLabel('Second choice (required)')
      .setStyle(TextInputStyle.Short)
      .setRequired(true)
      .setMaxLength(100)
      .setPlaceholder('The second choice other members can vote for');

    const third = new TextInputBuilder()
      .setCustomId('choice3')
      .setLabel('Third choice (optional)')
      .setStyle(TextInputStyle.Short)
      .setRequired(false)
      .setMaxLength(100)
      .setPlaceholder('The third choice other members can vote for');

    const others = new TextInputBuilder()
      .setCustomId('choice_more')
      .setLabel('Other choices (optional)')
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(false)
      .setMaxLength(1000)
      .setPlaceholder('The other choices other members can vote for\nOne per line, up to 7 extra');

    modal.addComponents(
      new ActionRowBuilder().addComponents(question),
      new ActionRowBuilder().addComponents(first),
      new ActionRowBuilder().addComponents(second),
      new ActionRowBuilder().addComponents(third),
      new ActionRowBuilder().addComponents(others)
    );

    await interaction.showModal(modal);
  }
};
