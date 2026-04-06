const fs = require('fs-extra');
const path = require('path');
const { loadReminders, saveReminders } = require('../utils/remindStore');
const { GE_DAILY_SCHEDULER_TICK_MS, maybeRunDailyGrandExchangeScan } = require('../utils/grandExchangeAlerts');
const { WOM_SCAN_INTERVAL_MS, runWomCompetitionReminderScan } = require('../utils/wiseOldManCompetitions');

const LFG_EMPTY_EXPIRY_MS = 5 * 60 * 1000;

function registerSchedulers({
  client,
  getConfig,
  giveaways,
  saveGiveaways,
  birthdays,
  saveBirthdays,
  flushRuntimeState,
  dataDir
}) {
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
      await maybeRunDailyGrandExchangeScan(client, getConfig());
    } catch (err) {
      console.error('Grand Exchange scanner error:', err);
    }
  }, GE_DAILY_SCHEDULER_TICK_MS);

  // Wise Old Man competition reminders (starts-in-1-hour and starts-in-5-minutes), scanned every minute.
  setInterval(async () => {
    try {
      await runWomCompetitionReminderScan(client, getConfig());
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
}

module.exports = { registerSchedulers };
