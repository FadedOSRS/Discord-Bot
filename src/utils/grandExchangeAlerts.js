const { EmbedBuilder } = require('discord.js');
const { DateTime } = require('luxon');
const { findItemMeta, getLatestPrice, getLatestAllPrices, getMapping, formatGp } = require('./osrsPrice');
const { loadGeWatches, saveGeWatches } = require('./geWatchStore');
const { loadGeMarketState, saveGeMarketState } = require('./geMarketStateStore');

const CHANGE_THRESHOLD_GP = 25_000;
/** Tick interval to evaluate whether the daily Chicago 7:00 scan should run. */
const GE_DAILY_SCHEDULER_TICK_MS = 60 * 1000;
const GE_SCAN_TZ = 'America/Chicago';
const GE_SCAN_HOUR = 7;
const GE_SCAN_MINUTE = 0;
const GE_MAX_ALERTS_PER_SCAN = 25;

function iconUrlFromName(iconName) {
  if (!iconName) return null;
  const normalized = String(iconName).trim().replace(/ /g, '_');
  if (!normalized) return null;
  return `https://oldschool.runescape.wiki/w/Special:FilePath/${encodeURIComponent(normalized)}`;
}

function priceReference(latest) {
  const hi = Number(latest?.high);
  const lo = Number(latest?.low);
  if (Number.isFinite(hi) && Number.isFinite(lo) && hi > 0 && lo > 0) {
    return Math.round((hi + lo) / 2);
  }
  if (Number.isFinite(hi) && hi > 0) return Math.round(hi);
  if (Number.isFinite(lo) && lo > 0) return Math.round(lo);
  return null;
}

function deathCofferEstimateGp(latest) {
  const ref = priceReference(latest);
  if (ref == null) return null;
  return Math.round(ref * 1.05);
}

function buildAlertEmbed(meta, latest, delta, thresholdGp = CHANGE_THRESHOLD_GP) {
  const nowUnix = Math.floor(Date.now() / 1000);
  const ref = priceReference(latest);
  const pct = ref && ref !== 0 ? ((delta / (ref - delta)) * 100) : null;
  const deltaText = `${delta >= 0 ? '+' : ''}${Number(delta).toLocaleString('en-US')} gp`;
  const pctText = Number.isFinite(pct) ? ` (${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%)` : '';
  const wikiLink = `https://oldschool.runescape.wiki/w/${encodeURIComponent(
    String(meta.name || '').replace(/ /g, '_')
  )}`;
  const exchangeLink = `https://www.osrs.exchange/item/${meta.id}`;

  const embed = new EmbedBuilder()
    .setColor(delta >= 0 ? 0x57f287 : 0xed4245)
    .setTitle(`Grand Exchange Alert: ${meta.name}`)
    .setDescription(
      `Price moved by **${deltaText}${pctText}** (threshold: ${Number(thresholdGp).toLocaleString('en-US')} gp).`
    )
    .addFields(
      { name: 'High', value: formatGp(latest.high), inline: true },
      { name: 'Low', value: formatGp(latest.low), inline: true },
      { name: 'Reference', value: formatGp(ref), inline: true },
      { name: "Death's Coffer (est.)", value: formatGp(deathCofferEstimateGp(latest)), inline: true },
      { name: 'GE Limit', value: meta.limit != null ? String(meta.limit) : '—', inline: true },
      { name: 'Members Item', value: meta.members == null ? '—' : (meta.members ? 'Yes' : 'No'), inline: true },
      { name: 'High Alch', value: formatGp(meta.highalch), inline: true },
      { name: 'Low Alch', value: formatGp(meta.lowalch), inline: true },
      { name: 'Last Scan', value: `<t:${nowUnix}:F>`, inline: true },
      {
        name: 'Links',
        value: `[OSRS Exchange](${exchangeLink}) | [OSRS Wiki](${wikiLink})`,
        inline: false
      }
    )
    .setFooter({ text: "Death's Coffer shown as ~105% of reference GE value." })
    .setTimestamp();

  const iconUrl = iconUrlFromName(meta.icon);
  if (iconUrl) embed.setThumbnail(iconUrl);
  return embed;
}

/** @returns {Promise<boolean>} true if a full scan ran and state was saved */
async function runGrandExchangeWatchScan(client, config) {
  const channelId = config?.geChannelId || null;
  if (!channelId) return false;
  const defaultThreshold = Number(config?.geThresholdGp ?? CHANGE_THRESHOLD_GP);
  const effectiveDefaultThreshold =
    Number.isFinite(defaultThreshold) && defaultThreshold > 0 ? Math.round(defaultThreshold) : CHANGE_THRESHOLD_GP;

  const channel = await client.channels.fetch(channelId).catch(() => null);
  if (!channel || !channel.isTextBased()) return false;

  const store = loadGeWatches();
  const entries = Object.entries(store);
  const marketState = loadGeMarketState();
  if (!marketState.lastRefById || typeof marketState.lastRefById !== 'object') {
    marketState.lastRefById = {};
  }

  // 1) Always keep watched items updated (existing behavior).
  // 2) Also scan entire GE feed and auto-alert across all items.
  const latestAll = await getLatestAllPrices();
  const mapping = await getMapping();
  if (!mapping.length || !Object.keys(latestAll).length) {
    if (entries.length) saveGeWatches(store);
    return false;
  }

  const marketAlerts = [];

  for (const m of mapping) {
    const id = String(m.id);
    const latest = latestAll[id];
    if (!latest) continue;
    const currentRef = priceReference(latest);
    if (currentRef == null) continue;

    const prev = Number(marketState.lastRefById[id]);
    const hasPrev = Number.isFinite(prev);
    const delta = hasPrev ? currentRef - prev : 0;
    marketState.lastRefById[id] = currentRef;

    if (!hasPrev || Math.abs(delta) < effectiveDefaultThreshold) continue;
    marketAlerts.push({ id: m.id, name: m.name, latest, delta });
  }

  marketAlerts.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));

  let posted = 0;
  const marketPostedIds = new Set();
  for (const a of marketAlerts) {
    if (posted >= GE_MAX_ALERTS_PER_SCAN) break;
    const meta = await findItemMeta(a.name);
    if (!meta) continue;
    const embed = buildAlertEmbed(meta, a.latest, a.delta, effectiveDefaultThreshold);
    await channel.send({ embeds: [embed] }).catch(() => null);
    marketPostedIds.add(String(a.id));
    posted += 1;
  }

  if (marketAlerts.length > GE_MAX_ALERTS_PER_SCAN) {
    const remaining = marketAlerts.length - GE_MAX_ALERTS_PER_SCAN;
    await channel
      .send(
        `GE auto-scan found **${marketAlerts.length.toLocaleString('en-US')}** movers >= **${effectiveDefaultThreshold.toLocaleString('en-US')} gp** this scan; posted top **${GE_MAX_ALERTS_PER_SCAN}**. (${remaining.toLocaleString('en-US')} not posted to avoid spam.)`
      )
      .catch(() => null);
  }

  for (const [itemIdKey, watch] of entries) {
    const watchThreshold = effectiveDefaultThreshold;
    const itemId = Number(itemIdKey);
    if (!Number.isFinite(itemId)) continue;
    if (marketPostedIds.has(String(itemId))) {
      // Skip duplicate post when full-market scan already posted this item.
      continue;
    }

    const latest = await getLatestPrice(itemId);
    if (!latest) continue;
    const currentRef = priceReference(latest);
    if (currentRef == null) continue;

    const previousRef = Number(watch.lastRefPrice);
    const hasPrev = Number.isFinite(previousRef);
    const delta = hasPrev ? currentRef - previousRef : 0;

    watch.lastRefPrice = currentRef;
    watch.lastHigh = latest.high ?? null;
    watch.lastLow = latest.low ?? null;
    watch.lastScannedAt = new Date().toISOString();

    if (!hasPrev || Math.abs(delta) < watchThreshold) {
      store[itemIdKey] = watch;
      continue;
    }

    const meta = await findItemMeta(watch.itemName || '');
    if (!meta) {
      store[itemIdKey] = watch;
      continue;
    }

    const embed = buildAlertEmbed(meta, latest, delta, watchThreshold);
    await channel.send({ embeds: [embed] }).catch(() => null);
    watch.lastAlertAt = new Date().toISOString();
    store[itemIdKey] = watch;
  }

  saveGeWatches(store);
  saveGeMarketState(marketState);
  return true;
}

/**
 * Runs the GE watch scan once per calendar day in America/Chicago, after 07:00 local.
 * Does not mark the day complete if the scan bails (e.g. empty API data).
 */
async function maybeRunDailyGrandExchangeScan(client, config) {
  const channelId = config?.geChannelId || null;
  if (!channelId) return;

  const now = DateTime.now().setZone(GE_SCAN_TZ);
  const trigger = now.startOf('day').set({
    hour: GE_SCAN_HOUR,
    minute: GE_SCAN_MINUTE,
    second: 0,
    millisecond: 0
  });
  if (now < trigger) return;

  const todayKey = now.toFormat('yyyy-LL-dd');
  const state = loadGeMarketState();
  if (state.lastGeDailyScanDate === todayKey) return;

  const channel = await client.channels.fetch(channelId).catch(() => null);
  if (!channel || !channel.isTextBased()) return;

  const ok = await runGrandExchangeWatchScan(client, config);
  if (!ok) return;

  const next = loadGeMarketState();
  next.lastGeDailyScanDate = todayKey;
  saveGeMarketState(next);
}

module.exports = {
  CHANGE_THRESHOLD_GP,
  GE_DAILY_SCHEDULER_TICK_MS,
  GE_SCAN_TZ,
  iconUrlFromName,
  priceReference,
  deathCofferEstimateGp,
  buildAlertEmbed,
  runGrandExchangeWatchScan,
  maybeRunDailyGrandExchangeScan
};

