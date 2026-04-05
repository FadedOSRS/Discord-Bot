const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('avatar')
    .setDescription('Show a user avatar.')
    .addUserOption(option =>
      option
        .setName('user')
        .setDescription('User to show avatar for (defaults to yourself)')
        .setRequired(false)
    ),

  async execute(interaction) {
    const user = interaction.options.getUser('user', false) || interaction.user;
    const url = user.displayAvatarURL({ size: 1024 });

    const embed = new EmbedBuilder()
      .setTitle(`${user.tag}'s avatar`)
      .setImage(url)
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  }
};

