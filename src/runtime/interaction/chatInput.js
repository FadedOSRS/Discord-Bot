async function handleAutocomplete(interaction, client) {
  if (!interaction.isAutocomplete()) return false;
  const command = client.commands.get(interaction.commandName);
  if (command?.autocomplete) {
    await command.autocomplete(interaction);
  }
  return true;
}

async function handleChatInput(interaction, client, deps) {
  if (!interaction.isChatInputCommand()) return false;
  const command = client.commands.get(interaction.commandName);
  if (!command) return true;

  const {
    config,
    saveConfig,
    verifications,
    saveVerifications,
    stickies,
    saveStickies,
    birthdays,
    saveBirthdays
  } = deps;

  await command.execute(interaction, {
    config,
    saveConfig,
    verifications,
    saveVerifications,
    stickies,
    saveStickies,
    birthdays,
    saveBirthdays
  });
  return true;
}

module.exports = {
  handleAutocomplete,
  handleChatInput
};
