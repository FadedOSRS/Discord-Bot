const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

const VERIFY_MESSAGE_CONTENT =
  'Click **Verify** and enter your OSRS username. Staff will review your request. When approved, you’ll receive the **Member** role (and any extra role your server has configured).';

function buildVerifyMessagePayload() {
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('verify:start:0')
      .setLabel('Verify')
      .setStyle(ButtonStyle.Success)
  );
  return { content: VERIFY_MESSAGE_CONTENT, components: [row] };
}

module.exports = { VERIFY_MESSAGE_CONTENT, buildVerifyMessagePayload };
