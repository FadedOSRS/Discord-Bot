const { Events } = require('discord.js');
const { clearAfk, getAfk } = require('../utils/afkStore');

function registerMessageHandler(client, scheduleChannelBottomStickies) {
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
          const { buildMemberCommandsEmbed } = require('../utils/memberCommandsHelp');
          await message.channel
            .send({ embeds: [buildMemberCommandsEmbed(prefix)] })
            .catch(err => console.error('Prefix member-commands help:', err));
        } else if (firstWord === 'botw') {
          const { buildBossOfTheWeekEmbed } = require('../utils/osrsWeeklyPicks');
          await message.channel
            .send({ embeds: [buildBossOfTheWeekEmbed()] })
            .catch(err => console.error('Prefix !BOTW:', err));
        } else if (firstWord === 'sotw') {
          const { buildSkillOfTheWeekEmbed } = require('../utils/osrsWeeklyPicks');
          await message.channel
            .send({ embeds: [buildSkillOfTheWeekEmbed()] })
            .catch(err => console.error('Prefix !SOTW:', err));
        }
      }
    } catch (err) {
      console.error('Sticky MessageCreate error:', err);
    }
  });
}

module.exports = { registerMessageHandler };
