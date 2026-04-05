const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { executeEventsCommand } = require('../utils/eventsWizard');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('events')
    .setDescription('Create an event (modal: name, times, places; then podium & description).')
    .setDefaultMemberPermissions(PermissionFlagsBits.SendMessages),

  async execute(interaction) {
    await executeEventsCommand(interaction);
  }
};
