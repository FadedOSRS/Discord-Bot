const { SlashCommandBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ping')
    .setDescription('Check bot response time.'),

  async execute(interaction) {
    const sent = Date.now();
    await interaction.reply({ content: 'Pinging...', ephemeral: true });
    const latency = Date.now() - sent;
    await interaction.editReply(`🏓 Pong! Approx latency: ${latency}ms`);
  }
};

