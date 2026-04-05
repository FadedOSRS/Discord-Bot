const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { findItem, getLatestPrice, formatGp } = require('./osrsPrice');

function buildPriceSlash(name, description) {
  return new SlashCommandBuilder()
    .setName(name)
    .setDescription(description)
    .addStringOption(o =>
      o
        .setName('item')
        .setDescription('Item name (Grand Exchange)')
        .setRequired(true)
        .setMaxLength(100)
    );
}

async function executePriceLookup(interaction) {
  const query = interaction.options.getString('item', true).trim();
  await interaction.deferReply({ ephemeral: true });

  const item = await findItem(query);
  if (!item) {
    await interaction.editReply({
      content: `No GE item matched **${query}**. Try a shorter or different name.`
    });
    return;
  }

  const latest = await getLatestPrice(item.id);
  if (!latest) {
    await interaction.editReply({
      content: `Found **${item.name}** but couldn’t load live prices. Try the [wiki](https://oldschool.runescape.wiki/w/${encodeURIComponent(item.name.replace(/ /g, '_'))}).`
    });
    return;
  }

  const embed = new EmbedBuilder()
    .setColor(0xf0c040)
    .setTitle(item.name)
    .addFields(
      { name: 'High', value: formatGp(latest.high), inline: true },
      { name: 'Low', value: formatGp(latest.low), inline: true }
    )
    .setFooter({
      text: 'OSRS Wiki real-time prices API — instant buys/sells vary.'
    });

  await interaction.editReply({ embeds: [embed] });
}

module.exports = { buildPriceSlash, executePriceLookup };
