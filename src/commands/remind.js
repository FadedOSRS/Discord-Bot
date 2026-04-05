const { SlashCommandBuilder } = require('discord.js');
const { addReminder } = require('../utils/remindStore');
const { parseDurationToMs } = require('../utils/parseDuration');

const MAX_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

module.exports = {
  data: new SlashCommandBuilder()
    .setName('remind')
    .setDescription('DM yourself a reminder after a delay.')
    .addStringOption(o =>
      o
        .setName('in')
        .setDescription('When (e.g. 2h, 45m, 1d, or plain minutes like 30)')
        .setRequired(true)
        .setMaxLength(40)
    )
    .addStringOption(o =>
      o.setName('message').setDescription('What to remind you').setRequired(true).setMaxLength(500)
    ),

  async execute(interaction) {
    const whenRaw = interaction.options.getString('in', true);
    const msg = interaction.options.getString('message', true).trim();
    const ms = parseDurationToMs(whenRaw);

    if (ms == null || ms < 10000) {
      await interaction.reply({
        content:
          'Could not parse that time. Use something like `30m`, `2h`, `1d`, or `45` (minutes). Minimum **10 seconds** (use `10s`).',
        ephemeral: true
      });
      return;
    }

    if (ms > MAX_MS) {
      await interaction.reply({
        content: 'Maximum reminder delay is **7 days**.',
        ephemeral: true
      });
      return;
    }

    const fireAtMs = Date.now() + ms;
    addReminder({ userId: interaction.user.id, message: msg, fireAtMs });

    const human =
      ms >= 86400000
        ? `${Math.round(ms / 86400000)}d`
        : ms >= 3600000
          ? `${Math.round(ms / 3600000)}h`
          : ms >= 60000
            ? `${Math.round(ms / 60000)}m`
            : `${Math.round(ms / 1000)}s`;

    await interaction.reply({
      content: `Got it — I’ll DM you in **${human}**:\n> ${msg.slice(0, 200)}${msg.length > 200 ? '…' : ''}`,
      ephemeral: true
    });
  }
};
