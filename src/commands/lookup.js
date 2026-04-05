const { SlashCommandBuilder } = require('discord.js');
const { buildLookupEmbed } = require('../utils/osrsLookup');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('lookup')
    .setDescription('Look up an OSRS account on the hiscores and check Runewatch.')
    .addStringOption(opt =>
      opt
        .setName('rsn')
        .setDescription('RuneScape name (spaces allowed)')
        .setRequired(true)
        .setMinLength(1)
        .setMaxLength(32)
    ),

  async execute(interaction) {
    const rsnRaw = interaction.options.getString('rsn', true).trim();
    if (!rsnRaw) {
      await interaction.reply({ content: 'Enter a RuneScape name.', ephemeral: true });
      return;
    }

    await interaction.deferReply();

    const embed = await buildLookupEmbed(rsnRaw);
    await interaction.editReply({ embeds: [embed] });
  }
};
