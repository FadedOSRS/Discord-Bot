require('dotenv').config();

const { Client, GatewayIntentBits, Partials, Collection, Events, ChannelType } = require('discord.js');
const fs = require('fs-extra');
const path = require('path');
const { PermissionFlagsBits } = require('discord.js');
const { loadReminders, saveReminders } = require('./utils/remindStore');
const { clearAfk, getAfk } = require('./utils/afkStore');
const {
  stripVerificationRoles,
  ensureRole,
  FULL_MEMBER_ROLE_NAME
} = require('./utils/verificationRoles');
const { ensureLfgVoiceCategory } = require('./utils/lfgVoiceCategory');
const { handleEventsButton, handleEventsModalSubmit } = require('./utils/eventsWizard');
const { canApproveNicknameVerification } = require('./utils/verifyApprovers');
const { GE_DAILY_SCHEDULER_TICK_MS, maybeRunDailyGrandExchangeScan } = require('./utils/grandExchangeAlerts');
const { WOM_SCAN_INTERVAL_MS, runWomCompetitionReminderScan } = require('./utils/wiseOldManCompetitions');

const token = process.env.DISCORD_TOKEN;
const guildId = process.env.GUILD_ID;
const dataDir = process.env.DATA_DIR || './data';
const LFG_EMPTY_EXPIRY_MS = 5 * 60 * 1000;

// Ensure data directory exists
fs.ensureDirSync(dataDir);

// Basic config that you will customize inside Discord
const CONFIG_PATH = path.join(dataDir, 'config.json');
let config = {
  verificationChannelId: null,
  /** Latest verify sticky message id (reposted to channel bottom on activity). */
  verificationMessageId: null,
  geChannelId: null,
  geThresholdGp: 25000,
  womAnnouncementsChannelId: null,
  womPingRoleId: null,
  womGroupId: null,
  womVerificationCode: null,
  verifiedRoleId: null,
  /** Role IDs allowed to approve/deny verify log buttons (besides Admin / Manage Server). */
  verificationApproverRoleIds: [],
  lfgChannelId: null,
  logChannelId: null,
  modLogChannelId: null,
  /** When set, `/events` embeds post here instead of the channel where the command was started. */
  siteEventChannelId: null
};

if (fs.existsSync(CONFIG_PATH)) {
  try {
    const loaded = fs.readJsonSync(CONFIG_PATH);
    config = { ...config, ...loaded };
  } catch (err) {
    console.error('Failed to read config.json', err);
  }
}

function saveConfig() {
  fs.writeJsonSync(CONFIG_PATH, config, { spaces: 2 });
}

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
if (fs.existsSync(commandsPath)) {
  const commandFiles = fs
    .readdirSync(commandsPath)
    .filter(file => file.endsWith('.js'));

  for (const file of commandFiles) {
    // eslint-disable-next-line global-require, import/no-dynamic-require
    const command = require(path.join(commandsPath, file));
    if (command.data && command.execute) {
      client.commands.set(command.data.name, command);
    } else {
      console.warn(`[WARNING] The command at ${file} is missing "data" or "execute".`);
    }
  }
}

// Simple in-memory store mapping userId -> OSRS name
const VERIFICATIONS_PATH = path.join(dataDir, 'verifications.json');
let verifications = {};

if (fs.existsSync(VERIFICATIONS_PATH)) {
  try {
    verifications = fs.readJsonSync(VERIFICATIONS_PATH);
  } catch (err) {
    console.error('Failed to read verifications.json', err);
  }
}

function saveVerifications() {
  fs.writeJsonSync(VERIFICATIONS_PATH, verifications, { spaces: 2 });
}

// Giveaways persistence
const GIVEAWAYS_PATH = path.join(dataDir, 'giveaways.json');
let giveaways = {};

if (fs.existsSync(GIVEAWAYS_PATH)) {
  try {
    giveaways = fs.readJsonSync(GIVEAWAYS_PATH);
  } catch (err) {
    console.error('Failed to read giveaways.json', err);
  }
}

function saveGiveaways() {
  fs.writeJsonSync(GIVEAWAYS_PATH, giveaways, { spaces: 2 });
}

// Birthdays persistence
const BIRTHDAYS_PATH = path.join(dataDir, 'birthdays.json');
let birthdays = {};

if (fs.existsSync(BIRTHDAYS_PATH)) {
  try {
    birthdays = fs.readJsonSync(BIRTHDAYS_PATH);
  } catch (err) {
    console.error('Failed to read birthdays.json', err);
  }
}

function saveBirthdays() {
  fs.writeJsonSync(BIRTHDAYS_PATH, birthdays, { spaces: 2 });
}

// Sticky messages (reposted to stay at bottom of channel when others chat)
const STICKIES_PATH = path.join(dataDir, 'stickies.json');
let stickies = {};

if (fs.existsSync(STICKIES_PATH)) {
  try {
    stickies = fs.readJsonSync(STICKIES_PATH);
  } catch (err) {
    console.error('Failed to read stickies.json', err);
  }
}

function saveStickies() {
  fs.writeJsonSync(STICKIES_PATH, stickies, { spaces: 2 });
}

/**
 * Safety flush for reboot/crash scenarios.
 * Most writes are already immediate, but this guarantees in-memory stores are persisted on shutdown.
 */
function flushRuntimeState() {
  try {
    saveConfig();
    saveVerifications();
    saveGiveaways();
    saveBirthdays();
    saveStickies();
  } catch (err) {
    console.error('Failed to flush runtime state:', err);
  }
}

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

client.once(Events.ClientReady, c => {
  console.log(`Logged in as ${c.user.tag}`);
});

// Periodically end giveaways (simple scheduler)
setInterval(async () => {
  try {
    const now = Date.now();
    const active = Object.values(giveaways).filter(g => g && !g.ended && typeof g.endAtMs === 'number' && g.endAtMs <= now);
    for (const g of active) {
      const guild = client.guilds.cache.get(g.guildId);
      if (!guild) continue;
      const channel = await guild.channels.fetch(g.channelId).catch(() => null);
      if (!channel || !channel.isTextBased()) continue;
      const message = await channel.messages.fetch(g.messageId).catch(() => null);
      if (!message) continue;

      const entrants = Array.isArray(g.entrants) ? g.entrants : [];
      const winnersCountRaw = Number(g.winnersCount ?? 1);
      const winnersCount = Number.isFinite(winnersCountRaw) ? Math.max(1, Math.min(50, Math.floor(winnersCountRaw))) : 1;

      // Pick unique winners
      const pool = entrants.slice();
      for (let i = pool.length - 1; i > 0; i -= 1) {
        const j = Math.floor(Math.random() * (i + 1));
        [pool[i], pool[j]] = [pool[j], pool[i]];
      }
      const winnerIds = pool.slice(0, Math.min(winnersCount, pool.length));

      g.ended = true;
      g.endedAt = new Date().toISOString();
      g.winnerIds = winnerIds;
      giveaways[g.messageId] = g;
      saveGiveaways();

      const winnerText = winnerIds.length ? winnerIds.map(id => `<@${id}>`).join(', ') : 'No entrants';
      await channel.send(`🎉 Giveaway ended: **${g.name}** — Winner(s): ${winnerText}`);

      // Disable button + update embed footer
      const embed = message.embeds[0];
      if (embed) {
        const updated = embed.toJSON();
        updated.footer = { text: g.ended ? `Ended — Winner(s): ${winnerText}` : (updated.footer?.text || '') };
        await message.edit({ embeds: [updated], components: [] }).catch(() => null);
      } else {
        await message.edit({ components: [] }).catch(() => null);
      }
    }
  } catch (err) {
    console.error('Giveaway scheduler error:', err);
  }
}, 30_000);

// Birthday scheduler: announces at midnight in user's configured timezone.
setInterval(async () => {
  try {
    const entries = Object.entries(birthdays);
    if (!entries.length) return;

    for (const [key, row] of entries) {
      if (!row || !row.guildId || !row.userId || !row.date || !row.timezone || !row.channelId) continue;

      // Use locale-independent parts so we can compare MM-DD and HH:mm.
      const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: row.timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
      }).formatToParts(new Date());

      const map = Object.fromEntries(parts.map(p => [p.type, p.value]));
      const mmdd = `${map.month}-${map.day}`;
      const hm = `${map.hour}:${map.minute}`;
      const year = map.year;

      // Announce only exactly at 00:00 local time, once per year.
      if (mmdd !== row.date || hm !== '00:00') continue;
      if (String(row.lastAnnouncedYear || '') === String(year)) continue;

      const guild = client.guilds.cache.get(row.guildId);
      if (!guild) continue;
      const channel = await guild.channels.fetch(row.channelId).catch(() => null);
      if (!channel || !channel.isTextBased()) continue;

      await channel.send(`🎂 Happy Birthday <@${row.userId}>!`);

      row.lastAnnouncedYear = year;
      birthdays[key] = row;
      saveBirthdays();
    }
  } catch (err) {
    console.error('Birthday scheduler error:', err);
  }
}, 60_000);

// Deliver due /remind DMs
setInterval(async () => {
  try {
    const now = Date.now();
    const store = loadReminders();
    const entries = Object.entries(store).filter(
      ([, r]) => r && typeof r.fireAtMs === 'number' && r.fireAtMs <= now
    );
    for (const [id, r] of entries) {
      delete store[id];
      saveReminders(store);
      const user = await client.users.fetch(r.userId).catch(() => null);
      if (!user) continue;
      await user
        .send({
          content: `⏰ **Reminder**\n${r.message}\n\n_(from ${client.user?.tag || 'this server’s bot'})_`
        })
        .catch(() => null);
    }
  } catch (err) {
    console.error('Reminder scheduler error:', err);
  }
}, 15_000);

// Safety snapshot every 60s so unexpected restarts lose minimal state.
setInterval(() => {
  flushRuntimeState();
}, 60_000);

// GE watcher: one automatic scan per day after 07:00 America/Chicago (tick every minute).
setInterval(async () => {
  try {
    await maybeRunDailyGrandExchangeScan(client, config);
  } catch (err) {
    console.error('Grand Exchange scanner error:', err);
  }
}, GE_DAILY_SCHEDULER_TICK_MS);

// Wise Old Man competition reminders (starts-in-1-hour and starts-in-5-minutes), scanned every minute.
setInterval(async () => {
  try {
    await runWomCompetitionReminderScan(client, config);
  } catch (err) {
    console.error('WOM competition reminder scanner error:', err);
  }
}, WOM_SCAN_INTERVAL_MS);

// Auto-delete newly created temp LFG voice channels if nobody joins within 5 minutes.
// Uses persisted timestamps so behavior survives bot restarts.
setInterval(async () => {
  try {
    const lfgStorePath = path.join(dataDir, 'lfgEvents.json');
    if (!fs.existsSync(lfgStorePath)) return;

    const lfgEvents = fs.readJsonSync(lfgStorePath);
    const now = Date.now();
    let changed = false;

    for (const [messageId, event] of Object.entries(lfgEvents)) {
      if (!event?.tempVoiceChannelId) continue;
      if (!event.tempVoiceCreatedAt) continue;

      const createdAtMs = Date.parse(event.tempVoiceCreatedAt);
      if (Number.isNaN(createdAtMs)) continue;
      if (now - createdAtMs < LFG_EMPTY_EXPIRY_MS) continue;

      const guild = client.guilds.cache.get(event.guildId);
      if (!guild) continue;

      const channel = guild.channels.cache.get(event.tempVoiceChannelId)
        || (await guild.channels.fetch(event.tempVoiceChannelId).catch(() => null));

      if (!channel) {
        lfgEvents[messageId].tempVoiceChannelId = null;
        lfgEvents[messageId].tempVoiceCreatedAt = null;
        changed = true;
        continue;
      }

      if (channel.members.size === 0) {
        await channel.delete('Temp LFG voice expired (unused for 5 minutes).').catch(err =>
          console.error('Failed to delete expired temp voice channel:', err)
        );
        lfgEvents[messageId].tempVoiceChannelId = null;
        lfgEvents[messageId].tempVoiceCreatedAt = null;
        changed = true;
      }
    }

    if (changed) {
      fs.writeJsonSync(lfgStorePath, lfgEvents, { spaces: 2 });
    }
  } catch (err) {
    console.error('LFG temp-voice expiry scheduler error:', err);
  }
}, 60_000);

client.on(Events.InteractionCreate, async interaction => {
  try {
    if (interaction.isAutocomplete()) {
      const command = client.commands.get(interaction.commandName);
      if (command?.autocomplete) {
        await command.autocomplete(interaction);
      }
      return;
    }

    // Slash commands
    if (interaction.isChatInputCommand()) {
      const command = client.commands.get(interaction.commandName);
      if (!command) return;

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
      return;
    }

    // Buttons & modals for verification and LFG
    if (interaction.isButton()) {
      if (await handleEventsButton(interaction)) return;

      const [type, action, id] = interaction.customId.split(':');

      if (type === 'verify') {
        if (action === 'start') {
          // Show modal to collect OSRS name
          const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require('discord.js');

          const modal = new ModalBuilder()
            .setCustomId('verify:submit')
            .setTitle('Verify your OSRS account');

          const usernameInput = new TextInputBuilder()
            .setCustomId('osrs_name')
            .setLabel('Enter your exact OSRS username')
            .setPlaceholder('Iron Chad')
            .setRequired(true)
            .setStyle(TextInputStyle.Short);

          const firstActionRow = new ActionRowBuilder().addComponents(usernameInput);
          modal.addComponents(firstActionRow);

          await interaction.showModal(modal);
        }
      }

      if (type === 'rolepanel') {
        const [, actionType, roleId] = interaction.customId.split(':');
        if (actionType !== 'toggle') return;

        const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
        const role = interaction.guild.roles.cache.get(roleId);

        if (!member || !role) {
          await interaction.reply({ content: 'That role is no longer available.', ephemeral: true });
          return;
        }

        const hasRole = member.roles.cache.has(roleId);
        if (hasRole) {
          const removed = await member.roles.remove(role).catch(() => null);
          if (!removed) {
            await interaction.reply({ content: 'I could not remove that role (permissions/hierarchy).', ephemeral: true });
            return;
          }
          await interaction.reply({ content: `Removed role: <@&${roleId}>`, ephemeral: true });
        } else {
          const added = await member.roles.add(role).catch(() => null);
          if (!added) {
            await interaction.reply({ content: 'I could not add that role (permissions/hierarchy).', ephemeral: true });
            return;
          }
          await interaction.reply({ content: `Added role: <@&${roleId}>`, ephemeral: true });
        }
        return;
      }

      if (type === 'verifylog') {
        // Approve/deny for verification logs (Manage Server, or roles from /verify-approvers)
        const [, actionType, targetUserId] = interaction.customId.split(':');

        const actingMember =
          interaction.member ??
          (interaction.guild
            ? await interaction.guild.members.fetch(interaction.user.id).catch(() => null)
            : null);
        if (!canApproveNicknameVerification(actingMember, config)) {
          await interaction.reply({
            content:
              'You do not have permission to approve or deny verifications. Ask a server admin to add your role with `/verify-approvers add`.',
            ephemeral: true
          });
          return;
        }

        const record = verifications[targetUserId];
        if (!record) {
          await interaction.reply({ content: 'No verification record found for that user.', ephemeral: true });
          return;
        }

        if (record.status === 'denied' || record.status === 'approved') {
          await interaction.reply({ content: `This verification is already **${record.status}**.`, ephemeral: true });
          return;
        }

        if (actionType !== 'approve' && actionType !== 'deny') {
          await interaction.reply({ content: 'Invalid verification action.', ephemeral: true });
          return;
        }

        // Acknowledge within Discord's ~3s window; role/nick work can exceed that.
        await interaction.deferReply({ ephemeral: true });

        const { EmbedBuilder } = require('discord.js');
        const guild = interaction.guild;

        try {
          const member = await guild.members.fetch(targetUserId).catch(() => null);

          if (actionType === 'approve') {
            const nowIso = new Date().toISOString();
            record.status = 'approved';
            record.approvedAt = nowIso;
            record.reviewedAt = nowIso;
            record.reviewedBy = interaction.user.id;
            verifications[targetUserId] = record;
            saveVerifications();

            if (member) {
              if (record.osrsName) {
                await member
                  .setNickname(record.osrsName, 'Verification approved')
                  .catch(() => null);
              }

              const memberRank = await ensureRole(guild, FULL_MEMBER_ROLE_NAME, 0x57f287);
              if (memberRank) {
                await member.roles.add(memberRank).catch(() => null);
              }

              if (config.verifiedRoleId) {
                const extraRole = guild.roles.cache.get(config.verifiedRoleId);
                if (extraRole && extraRole.id !== memberRank?.id) {
                  await member.roles.add(extraRole).catch(() => null);
                }
              }
            }

            await interaction.editReply({
              content: `Approved verification for <@${targetUserId}> — granted **${FULL_MEMBER_ROLE_NAME}**.`
            });
          } else {
            record.status = 'denied';
            record.reviewedAt = new Date().toISOString();
            record.reviewedBy = interaction.user.id;
            verifications[targetUserId] = record;
            saveVerifications();

            if (member) {
              await stripVerificationRoles(member, config.verifiedRoleId);
            }

            if (member) {
              const previous = record.previousNickname ?? null;
              await member.setNickname(previous, 'Verification denied').catch(() => null);
            }

            await interaction.editReply({
              content: `Denied verification for <@${targetUserId}> (**${FULL_MEMBER_ROLE_NAME}** / optional verified role removed if present).`
            });
          }

          const approved = actionType === 'approve';
          const statusText = approved ? 'Approved' : 'Denied';
          const osrsName = record.osrsName || 'Unknown';
          const thumbUser = member?.user ?? (await interaction.client.users.fetch(targetUserId).catch(() => null));
          const avatarUrl = thumbUser?.displayAvatarURL({ size: 256 }) ?? null;

          async function resolveLogMessage() {
            let m = interaction.message;
            if (m?.partial) {
              m = await m.fetch().catch(() => null);
            }
            if (m?.editable) return m;
            const mid = record.logMessageId || null;
            if (!mid || !config.logChannelId) return null;
            const ch = await guild.channels.fetch(config.logChannelId).catch(() => null);
            if (!ch?.isTextBased()) return null;
            return ch.messages.fetch(mid).catch(() => null);
          }

          const msg = await resolveLogMessage();
          if (msg?.editable) {
            const mainEmbed = new EmbedBuilder()
              .setColor(approved ? 0x57f287 : 0xed4245)
              .setTitle(approved ? '✅ Nickname request approved' : '❌ Nickname request denied')
              .setDescription(
                approved
                  ? `<@${targetUserId}>'s verification was **approved** by <@${interaction.user.id}>.`
                  : `<@${targetUserId}>'s verification was **denied** by <@${interaction.user.id}>.`
              )
              .addFields(
                { name: 'Status', value: `**${statusText}**`, inline: true },
                { name: 'Requested name', value: osrsName, inline: true },
                { name: 'Discord ID', value: `\`${targetUserId}\``, inline: false },
                {
                  name: 'Reviewed by',
                  value: `<@${interaction.user.id}>`,
                  inline: false
                }
              )
              .setTimestamp();

            if (avatarUrl) mainEmbed.setThumbnail(avatarUrl);

            const preserved =
              msg.embeds.length > 1
                ? msg.embeds.slice(1).map(e => {
                    const d = e.data ?? e;
                    return d && typeof d === 'object' ? EmbedBuilder.from(d) : null;
                  }).filter(Boolean)
                : [];
            await msg.edit({ embeds: [mainEmbed, ...preserved], components: [] }).catch(err =>
              console.error('verifylog: failed to edit log message:', err)
            );
          }
        } catch (err) {
          console.error('verifylog handler:', err);
          await interaction
            .editReply({ content: 'Something went wrong while processing that verification. Check the console / bot logs.' })
            .catch(() => null);
        }

        return;
      }

      if (type === 'lfg') {
        const [, actionType, messageId] = interaction.customId.split(':');
        const lfgStorePath = path.join(dataDir, 'lfgEvents.json');
        let lfgEvents = {};
        if (fs.existsSync(lfgStorePath)) {
          try {
            lfgEvents = fs.readJsonSync(lfgStorePath);
          } catch (err) {
            console.error('Failed to read lfgEvents.json', err);
          }
        }

        const event = lfgEvents[messageId];
        if (!event) return;

        if (actionType === 'voice') {
          // Create a temporary voice channel for this LFG if one doesn't exist
          if (event.tempVoiceChannelId) {
            await interaction.reply({
              content: `A temp voice channel already exists for this LFG: <#${event.tempVoiceChannelId}>`,
              ephemeral: true
            });
            return;
          }

          const guild = interaction.guild;
          const channelName = `${event.boss} - LFG`;

          const parentCategory = await ensureLfgVoiceCategory(guild);
          if (!parentCategory) {
            await interaction.reply({
              content:
                'I could not create or find the **LFG — Temporary** category (needs **Manage Channels**). Also ensure a **General** category exists if you want it ordered directly below it.',
              ephemeral: true
            });
            return;
          }

          const voiceChannel = await guild.channels
            .create({
              name: channelName.substring(0, 90),
              type: ChannelType.GuildVoice,
              parent: parentCategory.id,
              reason: `Temp LFG voice channel created by ${interaction.user.tag}`
            })
            .catch(err => {
              console.error('Failed to create temp voice channel:', err);
              return null;
            });

          if (!voiceChannel) {
            await interaction.reply({
              content: 'I could not create a temp voice channel. Please check my permissions and hierarchy.',
              ephemeral: true
            });
            return;
          }

          event.tempVoiceChannelId = voiceChannel.id;
          event.tempVoiceCreatedAt = new Date().toISOString();
          lfgEvents[messageId] = event;
          fs.writeJsonSync(lfgStorePath, lfgEvents, { spaces: 2 });

          await interaction.reply({
            content: `Created temp voice channel: ${voiceChannel}`,
            ephemeral: true
          });
          return;
        }

        // Going / maybe / not going buttons
        await interaction.deferUpdate();

        const userId = interaction.user.id;
        const sets = {
          going: new Set(event.going || []),
          maybe: new Set(event.maybe || []),
          notGoing: new Set(event.notGoing || [])
        };

        // Remove from all first
        for (const key of Object.keys(sets)) {
          sets[key].delete(userId);
        }

        if (actionType === 'going') sets.going.add(userId);
        if (actionType === 'maybe') sets.maybe.add(userId);
        if (actionType === 'not') sets.notGoing.add(userId);

        event.going = Array.from(sets.going);
        event.maybe = Array.from(sets.maybe);
        event.notGoing = Array.from(sets.notGoing);

        lfgEvents[messageId] = event;
        fs.writeJsonSync(lfgStorePath, lfgEvents, { spaces: 2 });

        // Update embed
        const channel = await interaction.guild.channels.fetch(event.channelId).catch(() => null);
        if (!channel || !channel.isTextBased()) return;
        const message = await channel.messages.fetch(messageId).catch(() => null);
        if (!message) return;

        const embed = message.embeds[0];
        if (!embed) return;

        const goingList = event.going.length ? event.going.map(id => `<@${id}>`).join(', ') : 'No one yet';
        const maybeList = event.maybe.length ? event.maybe.map(id => `<@${id}>`).join(', ') : 'No one yet';

        const updatedEmbed = embed.toJSON();
        updatedEmbed.fields = [
          { name: '✅ Going', value: goingList, inline: false },
          { name: '🤔 Maybe', value: maybeList, inline: false }
        ];

        await message.edit({ embeds: [updatedEmbed] });
        return;
      }

      if (type === 'giveaway') {
        const [, actionType, messageId] = interaction.customId.split(':');
        if (actionType !== 'enter') return;

        const g = giveaways[messageId];
        if (!g || g.ended) {
          await interaction.reply({ content: 'This giveaway is no longer active.', ephemeral: true });
          return;
        }

        const userId = interaction.user.id;
        g.entrants = Array.isArray(g.entrants) ? g.entrants : [];
        if (g.entrants.includes(userId)) {
          await interaction.reply({ content: 'You are already entered!', ephemeral: true });
          return;
        }

        g.entrants.push(userId);
        giveaways[messageId] = g;
        saveGiveaways();

        await interaction.reply({ content: `You’ve entered **${g.name}**!`, ephemeral: true });
        return;
      }
    }

    if (interaction.isModalSubmit()) {
      if (await handleEventsModalSubmit(interaction, config)) return;

      const [type, action] = interaction.customId.split(':');
      if (type === 'verify' && action === 'submit') {
        const osrsName = interaction.fields.getTextInputValue('osrs_name').trim();

        const memberForNick = await interaction.guild.members
          .fetch(interaction.user.id)
          .catch(() => null);
        const previousNickname = memberForNick?.nickname ?? null;

        verifications[interaction.user.id] = {
          osrsName,
          verifiedAt: new Date().toISOString(),
          status: 'pending',
          previousNickname
        };
        saveVerifications();

        await interaction.reply({
          content: `Thanks! Your OSRS name **${osrsName}** was submitted for review. A moderator will approve or deny your verification shortly.`,
          ephemeral: true
        });

        if (config.logChannelId) {
          const logChannel = await interaction.guild.channels.fetch(config.logChannelId).catch(() => null);
          if (logChannel && logChannel.isTextBased()) {
            const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

            const avatarUrl = interaction.user.displayAvatarURL({ size: 256 });

            const embed = new EmbedBuilder()
              .setTitle('Nickname Request')
              .setDescription(
                `<@${interaction.user.id}> is requesting a new nickname. To accept their request, click accept. Otherwise, click deny.`
              )
              .setThumbnail(avatarUrl)
              .addFields(
                { name: 'Requested Name', value: osrsName, inline: true },
                { name: 'Preview', value: osrsName, inline: true },
                { name: 'Discord ID', value: `\`${interaction.user.id}\``, inline: false }
              )
              .setTimestamp();

            const row = new ActionRowBuilder().addComponents(
              new ButtonBuilder()
                .setCustomId(`verifylog:approve:${interaction.user.id}`)
                .setLabel('Accept')
                .setStyle(ButtonStyle.Success),
              new ButtonBuilder()
                .setCustomId(`verifylog:deny:${interaction.user.id}`)
                .setLabel('Deny')
                .setStyle(ButtonStyle.Danger)
            );

            const logMsg = await logChannel.send({ embeds: [embed], components: [row] });
            const current = verifications[interaction.user.id];
            verifications[interaction.user.id] = { ...current, logMessageId: logMsg.id };
            saveVerifications();

            try {
              const { buildLookupEmbed } = require('./utils/osrsLookup');
              const lookupEmbed = await buildLookupEmbed(osrsName, {
                footer: 'HiScores + Runewatch (same as /lookup)'
              });
              await logMsg.edit({ embeds: [embed, lookupEmbed], components: [row] });
            } catch (err) {
              console.error('Verify: failed to attach lookup embed:', err);
            }
          }
        }
      }

      if (interaction.customId === 'giveaway:create') {
        const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');

        const winnersRaw = interaction.fields.getTextInputValue('winners').trim();
        const winnersCount = Math.max(1, Math.min(50, Number.parseInt(winnersRaw, 10) || 1));
        const name = interaction.fields.getTextInputValue('name').trim();
        const endRaw = interaction.fields.getTextInputValue('end').trim();
        const description = interaction.fields.getTextInputValue('description').trim();

        // Parse end time:
        // - Accept Discord timestamps like <t:1234567890:F>
        // - Accept unix seconds "1234567890"
        // - Accept "YYYY-MM-DD HH:mm" (assumed local server time)
        let endAtMs = null;
        const discordTsMatch = endRaw.match(/<t:(\d+)(?::[a-zA-Z])?>/);
        if (discordTsMatch) {
          endAtMs = Number(discordTsMatch[1]) * 1000;
        } else if (/^\d{10}$/.test(endRaw)) {
          endAtMs = Number(endRaw) * 1000;
        } else {
          const normalized = endRaw.replace(' ', 'T');
          const parsed = Date.parse(normalized);
          if (!Number.isNaN(parsed)) endAtMs = parsed;
        }

        if (!endAtMs || endAtMs < Date.now() + 30_000) {
          await interaction.reply({
            content: 'End time could not be parsed, or it is too soon. Use `YYYY-MM-DD HH:mm` or a Discord timestamp like `<t:1774568400:F>`.',
            ephemeral: true
          });
          return;
        }

        const endUnix = Math.floor(endAtMs / 1000);
        const embed = new EmbedBuilder()
          .setTitle(`🎁 Giveaway: ${name}`)
          .setDescription(description)
          .addFields(
            { name: 'Winners', value: `${winnersCount}`, inline: true },
            { name: 'Ends', value: `<t:${endUnix}:F> (<t:${endUnix}:R>)`, inline: true }
          )
          .setFooter({ text: 'Click Enter to join!' })
          .setTimestamp();

        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId('giveaway:enter:placeholder')
            .setLabel('🎟️ Enter')
            .setStyle(ButtonStyle.Success)
        );

        const message = await interaction.channel.send({ embeds: [embed], components: [row] });

        const fixedRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`giveaway:enter:${message.id}`)
            .setLabel('🎟️ Enter')
            .setStyle(ButtonStyle.Success)
        );
        await message.edit({ components: [fixedRow] });

        giveaways[message.id] = {
          messageId: message.id,
          guildId: interaction.guildId,
          channelId: interaction.channelId,
          name,
          description,
          endAtMs,
          winnersCount,
          createdAt: new Date().toISOString(),
          createdBy: interaction.user.id,
          entrants: [],
          ended: false,
          winnerIds: []
        };
        saveGiveaways();

        await interaction.reply({ content: `Giveaway created: **${name}**`, ephemeral: true });
        return;
      }

      if (interaction.customId === 'poll:create') {
        const question = interaction.fields.getTextInputValue('question').trim();
        const c1 = interaction.fields.getTextInputValue('choice1').trim();
        const c2 = interaction.fields.getTextInputValue('choice2').trim();
        const c3 = interaction.fields.getTextInputValue('choice3')?.trim() || '';
        const moreRaw = interaction.fields.getTextInputValue('choice_more') || '';

        const options = [];
        if (c1) options.push(c1);
        if (c2) options.push(c2);
        if (c3) options.push(c3);

        const extra = moreRaw
          .split('\n')
          .map(x => x.trim())
          .filter(Boolean);

        for (const line of extra) {
          if (options.length >= 10) break;
          options.push(line);
        }

        if (!question || options.length < 2) {
          await interaction.reply({
            content: 'Please provide a question and at least two choices.',
            ephemeral: true
          });
          return;
        }

        const emojis = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'];
        const lines = options.map((opt, idx) => `${emojis[idx]} ${opt}`);

        const content = `📊 **${question}**\n\n${lines.join('\n')}\n\n_Poll by ${interaction.user} — react below to vote._`;

        const message = await interaction.channel.send({
          content,
          allowedMentions: { repliedUser: false }
        });

        for (let i = 0; i < options.length && i < emojis.length; i += 1) {
          // Ignore failures if the emoji can't be added for some reason
          // eslint-disable-next-line no-await-in-loop
          await message.react(emojis[i]).catch(() => null);
        }

        await interaction.reply({ content: 'Poll created.', ephemeral: true });
        return;
      }
    }
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

// Bump sticky to bottom when someone chats (Discord has no native "pin to bottom")
client.on(Events.MessageCreate, async message => {
  try {
    scheduleChannelBottomStickies(message);

    if (message.author.bot) return;

    if (message.guild) {
      clearAfk(message.guild.id, message.author.id);
    }

    if (
      message.guild &&
      message.mentions.users.size > 0 &&
      message.channel.isTextBased()
    ) {
      const parts = [];
      for (const user of message.mentions.users.values()) {
        if (user.bot) continue;
        if (user.id === message.author.id) continue;
        const row = getAfk(message.guild.id, user.id);
        if (row) {
          const ts = Math.floor(new Date(row.since).getTime() / 1000);
          const label = message.guild.members.cache.get(user.id)?.displayName || user.username;
          parts.push(`**${label}** is AFK — ${row.reason} _(since <t:${ts}:R>)_`);
        }
      }
      if (parts.length) {
        await message
          .reply({ content: parts.join('\n'), allowedMentions: { parse: [] } })
          .catch(() => null);
      }
    }

    const prefix = (process.env.DEFAULT_PREFIX || '!').trim();
    if (
      prefix &&
      message.content.startsWith(prefix) &&
      message.channel.isTextBased()
    ) {
      const firstWord = message.content.slice(prefix.length).trim().split(/\s+/)[0]?.toLowerCase();
      if (['commands', 'help', 'cmds', 'command', 'membercommands'].includes(firstWord)) {
        const { buildMemberCommandsEmbed } = require('./utils/memberCommandsHelp');
        await message.channel
          .send({ embeds: [buildMemberCommandsEmbed(prefix)] })
          .catch(err => console.error('Prefix member-commands help:', err));
      } else if (firstWord === 'botw') {
        const { buildBossOfTheWeekEmbed } = require('./utils/osrsWeeklyPicks');
        await message.channel
          .send({ embeds: [buildBossOfTheWeekEmbed()] })
          .catch(err => console.error('Prefix !BOTW:', err));
      } else if (firstWord === 'sotw') {
        const { buildSkillOfTheWeekEmbed } = require('./utils/osrsWeeklyPicks');
        await message.channel
          .send({ embeds: [buildSkillOfTheWeekEmbed()] })
          .catch(err => console.error('Prefix !SOTW:', err));
      }
    }
  } catch (err) {
    console.error('Sticky MessageCreate error:', err);
  }
});

// Auto-delete temp LFG voice channels when empty
client.on(Events.VoiceStateUpdate, async (oldState, newState) => {
  try {
    // Only care when users leave a voice channel
    if (!oldState.channelId || oldState.channelId === newState.channelId) return;

    const lfgStorePath = path.join(dataDir, 'lfgEvents.json');
    if (!fs.existsSync(lfgStorePath)) return;

    const lfgEvents = fs.readJsonSync(lfgStorePath);
    const tempChannelIds = Object.values(lfgEvents)
      .map(e => e.tempVoiceChannelId)
      .filter(Boolean);

    if (!tempChannelIds.includes(oldState.channelId)) return;

    const channel = oldState.guild.channels.cache.get(oldState.channelId);
    if (!channel || channel.members.size > 0) return;

    // Delete the voice channel
    await channel.delete('Temp LFG voice channel is now empty.').catch(err =>
      console.error('Failed to delete temp voice channel:', err)
    );

    // Remove tempVoiceChannelId from any events that used it
    for (const [messageId, event] of Object.entries(lfgEvents)) {
      if (event.tempVoiceChannelId === oldState.channelId) {
        lfgEvents[messageId].tempVoiceChannelId = null;
        lfgEvents[messageId].tempVoiceCreatedAt = null;
      }
    }

    fs.writeJsonSync(lfgStorePath, lfgEvents, { spaces: 2 });
  } catch (err) {
    console.error('Error in VoiceStateUpdate handler:', err);
  }
});

client.login(token);

// Graceful shutdown persistence hooks.
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
