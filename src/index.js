require('dotenv').config();

const { Client, GatewayIntentBits, Partials, Collection } = require('discord.js');
const path = require('path');
const { loadCommands } = require('./runtime/loadCommands');
const { registerMessageHandler } = require('./runtime/messageHandler');
const { registerVoiceHandler } = require('./runtime/voiceHandler');
const { registerInteractionHandler } = require('./runtime/interactionHandler');
const { createRuntimeState } = require('./runtime/stateStore');
const { registerSchedulers } = require('./runtime/schedulers');
const { registerLifecycle } = require('./runtime/lifecycle');

const token = process.env.DISCORD_TOKEN;
const dataDir = process.env.DATA_DIR || './data';
const runtimeState = createRuntimeState(dataDir);
const config = runtimeState.config;
const saveConfig = runtimeState.saveConfig;
const verifications = runtimeState.verifications;
const saveVerifications = runtimeState.saveVerifications;
const giveaways = runtimeState.giveaways;
const saveGiveaways = runtimeState.saveGiveaways;
const birthdays = runtimeState.birthdays;
const saveBirthdays = runtimeState.saveBirthdays;
const stickies = runtimeState.stickies;
const saveStickies = runtimeState.saveStickies;
const flushRuntimeState = runtimeState.flushRuntimeState;

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent // Required for prefix text commands (!commands, etc.)
  ],
  partials: [Partials.GuildMember]
});

const { startDashboardServer } = require('./dashboardServer');
const dashPort = parseInt(process.env.DASHBOARD_PORT || '3847', 10);
if (!Number.isNaN(dashPort) && dashPort > 0) {
  startDashboardServer({
    port: dashPort,
    host: process.env.DASHBOARD_HOST || undefined,
    clientId: process.env.CLIENT_ID || null,
    getStatus: () => ({
      botReady: client.isReady(),
      tag: client.user ? client.user.tag : null
    })
  });
} else {
  console.log('[dashboard] HTTP dashboard disabled (set DASHBOARD_PORT>0 to enable).');
}

client.commands = new Collection();

// Load commands dynamically from src/commands
const commandsPath = path.join(__dirname, 'commands');
loadCommands(client, commandsPath);


/**
 * Text sticky first, then verify post — so Verify stays the last (bottom) message when both exist.
 * Runs on any message including other bots; skips only this bot to avoid loops.
 * @type {Map<string, Promise<void>>}
 */
const bottomStickiesQueues = new Map();

function queueBottomStickiesBump(channelId, fn) {
  const prev = bottomStickiesQueues.get(channelId) || Promise.resolve();
  const next = prev.then(fn).catch(err => console.error('Bottom stickies bump error:', err));
  bottomStickiesQueues.set(channelId, next);
  return next;
}

/**
 * @param {import('discord.js').Message} message
 */
function scheduleChannelBottomStickies(message) {
  if (!client.user || !message.guild || !message.channel.isTextBased()) return;

  const chId = message.channel.id;
  const sticky = stickies[chId];
  const hasSticky = !!(sticky?.content);
  const hasVerify =
    config.verificationChannelId === chId && !!config.verificationMessageId;

  if (!hasSticky && !hasVerify) return;
  if (message.author.id === client.user.id) return;
  if (hasSticky && sticky.messageId && message.id === sticky.messageId) return;

  queueBottomStickiesBump(chId, async () => {
    const channel = message.channel;

    const latest = stickies[chId];
    if (latest?.content) {
      if (latest.messageId) {
        await channel.messages.delete(latest.messageId).catch(() => null);
      }
      const sent = await channel.send({ content: latest.content });
      latest.messageId = sent.id;
      stickies[chId] = latest;
      saveStickies();
    }

    if (config.verificationChannelId === chId && config.verificationMessageId) {
      const oldId = config.verificationMessageId;
      await channel.messages.delete(oldId).catch(() => null);
      const { buildVerifyMessagePayload } = require('./utils/verifyStickyMessage');
      const vSent = await channel.send(buildVerifyMessagePayload());
      config.verificationMessageId = vSent.id;
      saveConfig();
    }
  });
}

registerLifecycle(client, flushRuntimeState);
registerSchedulers({
  client,
  getConfig: () => config,
  giveaways,
  saveGiveaways,
  birthdays,
  saveBirthdays,
  flushRuntimeState,
  dataDir
});

registerInteractionHandler(client, {
  config,
  saveConfig,
  verifications,
  saveVerifications,
  stickies,
  saveStickies,
  birthdays,
  saveBirthdays,
  giveaways,
  saveGiveaways,
  dataDir
});

// Bump sticky/verify messages and handle AFK + prefix helpers.
registerMessageHandler(client, scheduleChannelBottomStickies);

// Auto-delete temp LFG voice channels when empty.
registerVoiceHandler(client, dataDir);

client.login(token);
