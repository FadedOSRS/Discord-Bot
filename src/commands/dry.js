const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

/**
 * @returns {number | null} probability per roll (0<p<=1)
 */
function parseDropRate(input) {
  const s = String(input).trim();
  const oneOver = s.match(/^1\s*\/\s*(\d[\d,]*)$/);
  if (oneOver) {
    const d = parseInt(oneOver[1].replace(/,/g, ''), 10);
    if (d > 0) return 1 / d;
  }
  const frac = s.match(/^(\d+)\s*\/\s*(\d+)$/);
  if (frac) {
    const a = parseInt(frac[1], 10);
    const b = parseInt(frac[2], 10);
    if (b > 0 && a >= 0 && a <= b) return a / b;
  }
  const n = parseFloat(s.replace(/,/g, ''));
  if (!Number.isFinite(n) || n <= 0) return null;
  if (n <= 1) return n;
  return 1 / n;
}

function pct(x) {
  if (!Number.isFinite(x)) return '—';
  if (x < 0.0001) return `${(x * 100).toExponential(2)}%`;
  if (x < 0.01) return `${(x * 100).toFixed(4)}%`;
  return `${(x * 100).toFixed(2)}%`;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('dry')
    .setDescription('Dry streak math: chance of no drop in N kills (independent rolls).')
    .addStringOption(o =>
      o
        .setName('rate')
        .setDescription('Drop rate: 1/512, 512, or 0.002 per kill')
        .setRequired(true)
        .setMaxLength(32)
    )
    .addIntegerOption(o =>
      o.setName('kc').setDescription('Your kill count (no drop yet)').setRequired(true).setMinValue(1).setMaxValue(1_000_000)
    ),

  async execute(interaction) {
    const rateRaw = interaction.options.getString('rate', true);
    const kc = interaction.options.getInteger('kc', true);
    const p = parseDropRate(rateRaw);

    if (p == null || p <= 0 || p > 1) {
      await interaction.reply({
        content:
          'Invalid **rate**. Use `1/512`, `512` (same as 1/512), a fraction like `3/100`, or a probability like `0.01`.',
        ephemeral: true
      });
      return;
    }

    const pNone = Math.pow(1 - p, kc);
    const pAtLeastOne = 1 - pNone;
    const expected = 1 / p;

    const embed = new EmbedBuilder()
      .setColor(0x9b59b6)
      .setTitle('Dry streak odds')
      .setDescription(
        `Assuming **${pct(p)}** per kill and **${kc.toLocaleString()}** kills with no drop yet (independent rolls):`
      )
      .addFields(
        {
          name: 'Chance of going this dry (or worse)',
          value: pct(pNone),
          inline: false
        },
        {
          name: `Chance of ≥1 drop in ${kc.toLocaleString()} kills`,
          value: pct(pAtLeastOne),
          inline: false
        },
        {
          name: 'Expected kills for one drop (mean)',
          value: `~${Math.round(expected).toLocaleString()} (not a guarantee)`,
          inline: false
        }
      )
      .setFooter({ text: 'Simplified model: each kill rolls the same odds, no bad luck mitigation.' });

    await interaction.reply({ embeds: [embed], ephemeral: true });
  }
};
