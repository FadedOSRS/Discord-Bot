const { Events } = require('discord.js');
const { handleAutocomplete, handleChatInput } = require('./interaction/chatInput');
const { handleButtons } = require('./interaction/buttons');
const { handleModals } = require('./interaction/modals');

function registerInteractionHandler(client, deps) {
  client.on(Events.InteractionCreate, async interaction => {
    try {
      if (await handleAutocomplete(interaction, client)) return;
      if (await handleChatInput(interaction, client, deps)) return;
      if (await handleButtons(interaction, deps)) return;
      if (await handleModals(interaction, deps)) return;
    } catch (err) {
      console.error('Error handling interaction:', err);
      if (interaction.isRepliable() && !interaction.replied && !interaction.deferred) {
        await interaction.reply({
          content: 'Something went wrong while executing that interaction.',
          ephemeral: true
        }).catch(() => null);
      }
    }
  });
}

module.exports = { registerInteractionHandler };
