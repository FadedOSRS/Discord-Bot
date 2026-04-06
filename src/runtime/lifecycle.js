const { Events } = require('discord.js');

function registerLifecycle(client, flushRuntimeState) {
  client.once(Events.ClientReady, c => {
    console.log(`Logged in as ${c.user.tag}`);
  });

  process.on('SIGINT', () => {
    flushRuntimeState();
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    flushRuntimeState();
    process.exit(0);
  });

  process.on('exit', () => {
    flushRuntimeState();
  });
}

module.exports = { registerLifecycle };
