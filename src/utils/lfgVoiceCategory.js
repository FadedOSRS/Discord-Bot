const { ChannelType } = require('discord.js');

/** Category that holds temporary /lfg voice channels (reused). */
const LFG_TEMP_CATEGORY_NAME = 'LFG — Temporary';

/**
 * Find the server category named "General" (case-insensitive, trimmed).
 * @param {import('discord.js').Guild} guild
 */
function findGeneralCategory(guild) {
  return guild.channels.cache.find(
    c => c.type === ChannelType.GuildCategory && c.name.toLowerCase().trim() === 'general'
  );
}

/**
 * Ensure LFG temp voice category exists and sits directly below **General**.
 * @param {import('discord.js').Guild} guild
 * @returns {Promise<import('discord.js').CategoryChannel | null>}
 */
async function ensureLfgVoiceCategory(guild) {
  const generalCat = findGeneralCategory(guild);

  let lfgCat = guild.channels.cache.find(
    c => c.type === ChannelType.GuildCategory && c.name === LFG_TEMP_CATEGORY_NAME
  );

  if (!lfgCat) {
    lfgCat = await guild.channels
      .create({
        name: LFG_TEMP_CATEGORY_NAME,
        type: ChannelType.GuildCategory,
        reason: 'Temporary LFG voice channels (auto-created by bot)'
      })
      .catch(err => {
        console.error('LFG: failed to create category:', err);
        return null;
      });
    if (!lfgCat) return null;
  }

  if (generalCat) {
    await lfgCat.setPosition(generalCat.position + 1).catch(() => null);
  }

  return lfgCat;
}

module.exports = {
  LFG_TEMP_CATEGORY_NAME,
  ensureLfgVoiceCategory
};
