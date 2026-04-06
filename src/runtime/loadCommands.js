const fs = require('fs-extra');
const path = require('path');

function loadCommands(client, commandsDir) {
  if (!fs.existsSync(commandsDir)) return;
  const commandFiles = fs
    .readdirSync(commandsDir)
    .filter(file => file.endsWith('.js'));

  for (const file of commandFiles) {
    // eslint-disable-next-line global-require, import/no-dynamic-require
    const command = require(path.join(commandsDir, file));
    if (command.data && command.execute) {
      client.commands.set(command.data.name, command);
    } else {
      console.warn(`[WARNING] The command at ${file} is missing "data" or "execute".`);
    }
  }
}

module.exports = { loadCommands };
