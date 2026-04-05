const { loadWomAnnouncements, saveWomAnnouncements } = require('./womCompetitionAnnouncementsStore');

const WOM_GROUP_ID = 23745;
const WOM_COMPETITIONS_URL = `https://api.wiseoldman.net/v2/groups/${WOM_GROUP_ID}/competitions`;
const WOM_UPDATE_ALL_URL = groupId => `https://api.wiseoldman.net/v2/groups/${groupId}/update-all`;
const WOM_SCAN_INTERVAL_MS = 60 * 1000; // every 1 minute (needed for 5-minute reminders)
const ONE_HOUR_MS = 60 * 60 * 1000;
const FIVE_MIN_MS = 5 * 60 * 1000;

async function fetchCompetitions() {
  const res = await fetch(WOM_COMPETITIONS_URL);
  if (!res.ok) return [];
  const data = await res.json().catch(() => []);
  return Array.isArray(data) ? data : [];
}

async function triggerUpdateAllOutdatedMembers(groupId, verificationCode) {
  if (!groupId || !verificationCode) {
    return { ok: false, message: 'Missing group id or verification code.' };
  }
  try {
    const res = await fetch(WOM_UPDATE_ALL_URL(groupId), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ verificationCode: String(verificationCode) })
    });
    const data = await res.json().catch(() => ({}));
    const message = data?.message || (res.ok ? 'Update-all request accepted.' : 'Update-all request failed.');
    return { ok: res.ok, message };
  } catch (err) {
    return { ok: false, message: err?.message || 'Unknown request error.' };
  }
}

function makeAnnouncementKey(comp, marker) {
  return `${comp.id}:${comp.startsAt}:${marker}`;
}

async function runWomCompetitionReminderScan(client, config) {
  const channelId = config?.womAnnouncementsChannelId || null;
  if (!channelId) return;
  const groupId = Number(config?.womGroupId || WOM_GROUP_ID);
  const verificationCode = config?.womVerificationCode || process.env.WOM_VERIFICATION_CODE || null;

  const competitions = await fetchCompetitions();
  if (!competitions.length) return;

  const channel = await client.channels.fetch(channelId).catch(() => null);
  if (!channel || !channel.isTextBased()) return;

  const announced = loadWomAnnouncements();
  const now = Date.now();
  const pingPrefix = config?.womPingRoleId ? `<@&${config.womPingRoleId}> ` : '';

  for (const comp of competitions) {
    const startsAt = Date.parse(comp.startsAt || '');
    if (Number.isNaN(startsAt)) continue;
    const diff = startsAt - now;

    const compUrl = `https://wiseoldman.net/competitions/${comp.id}`;
    const startUnix = Math.floor(startsAt / 1000);
    const title = comp.title || `Competition #${comp.id}`;
    const metric = comp.metric || (Array.isArray(comp.metrics) && comp.metrics[0]) || 'unknown';
    const participants = Number.isFinite(Number(comp.participantCount))
      ? Number(comp.participantCount).toLocaleString('en-US')
      : '—';

    if (diff > 0 && diff <= ONE_HOUR_MS) {
      const key1h = makeAnnouncementKey(comp, '1h');
      if (!announced[key1h]) {
        const content =
          `${pingPrefix}⏰ **Wise Old Man event starts in 1 hour**\n` +
          `**${title}**\n` +
          `Starts: <t:${startUnix}:F> (<t:${startUnix}:R>)\n` +
          `Metric: **${metric}** · Participants: **${participants}**\n` +
          `${compUrl}`;
        await channel.send({ content, allowedMentions: { parse: ['roles'] } }).catch(() => null);
        announced[key1h] = {
          competitionId: comp.id,
          title,
          startsAt: comp.startsAt,
          marker: '1h',
          announcedAt: new Date().toISOString()
        };
      }
    }

    if (diff > 0 && diff <= FIVE_MIN_MS) {
      const key5m = makeAnnouncementKey(comp, '5m');
      if (!announced[key5m]) {
        const updateRes = await triggerUpdateAllOutdatedMembers(groupId, verificationCode);
        const content =
          `🚨 **Wise Old Man event starts in 5 minutes**\n` +
          `**${title}**\n` +
          `Starts: <t:${startUnix}:F> (<t:${startUnix}:R>)\n` +
          `Metric: **${metric}** · Participants: **${participants}**\n` +
          `Auto-update members: ${updateRes.ok ? '✅' : '❌'} ${updateRes.message}\n` +
          `${compUrl}`;
        await channel.send({ content, allowedMentions: { parse: ['roles'] } }).catch(() => null);
        announced[key5m] = {
          competitionId: comp.id,
          title,
          startsAt: comp.startsAt,
          marker: '5m',
          announcedAt: new Date().toISOString()
        };
      }
    }
  }

  saveWomAnnouncements(announced);
}

module.exports = {
  WOM_GROUP_ID,
  WOM_COMPETITIONS_URL,
  WOM_UPDATE_ALL_URL,
  WOM_SCAN_INTERVAL_MS,
  fetchCompetitions,
  triggerUpdateAllOutdatedMembers,
  runWomCompetitionReminderScan
};

