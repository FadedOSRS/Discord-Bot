const { SlashCommandBuilder } = require('discord.js');

const BOSS_WIKI_LINKS = {
  'Abyssal Sire': 'https://oldschool.runescape.wiki/w/Abyssal_Sire',
  'Alchemical Hydra': 'https://oldschool.runescape.wiki/w/Alchemical_Hydra',
  'Barrows': 'https://oldschool.runescape.wiki/w/Barrows',
  'Callisto': 'https://oldschool.runescape.wiki/w/Callisto',
  'Cerberus': 'https://oldschool.runescape.wiki/w/Cerberus',
  'Chambers of Xeric': 'https://oldschool.runescape.wiki/w/Chambers_of_Xeric',
  'Commander Zilyana': 'https://oldschool.runescape.wiki/w/Commander_Zilyana',
  'Corporeal Beast': 'https://oldschool.runescape.wiki/w/Corporeal_Beast',
  'General Graardor': 'https://oldschool.runescape.wiki/w/General_Graardor',
  'Giant Mole': 'https://oldschool.runescape.wiki/w/Giant_Mole',
  'Kalphite Queen': 'https://oldschool.runescape.wiki/w/Kalphite_Queen',
  'King Black Dragon': 'https://oldschool.runescape.wiki/w/King_Black_Dragon',
  'Kraken': 'https://oldschool.runescape.wiki/w/Kraken',
  'Kree\'arra': 'https://oldschool.runescape.wiki/w/Kree%27arra',
  'K\'ril Tsutsaroth': 'https://oldschool.runescape.wiki/w/K%27ril_Tsutsaroth',
  'Nex': 'https://oldschool.runescape.wiki/w/Nex',
  'Nightmare': 'https://oldschool.runescape.wiki/w/The_Nightmare',
  'Phosani\'s Nightmare': 'https://oldschool.runescape.wiki/w/Phosani%27s_Nightmare',
  'Sarachnis': 'https://oldschool.runescape.wiki/w/Sarachnis',
  'Scorpia': 'https://oldschool.runescape.wiki/w/Scorpia',
  'Skotizo': 'https://oldschool.runescape.wiki/w/Skotizo',
  'Tempoross': 'https://oldschool.runescape.wiki/w/Tempoross',
  'The Gauntlet': 'https://oldschool.runescape.wiki/w/The_Gauntlet',
  'Theatre of Blood': 'https://oldschool.runescape.wiki/w/Theatre_of_Blood',
  'Thermonuclear Smoke Devil': 'https://oldschool.runescape.wiki/w/Thermonuclear_smoke_devil',
  'Tombs of Amascut': 'https://oldschool.runescape.wiki/w/Tombs_of_Amascut',
  'Vardorvis': 'https://oldschool.runescape.wiki/w/Vardorvis',
  'Venenatis': 'https://oldschool.runescape.wiki/w/Venenatis',
  'Vet\'ion': 'https://oldschool.runescape.wiki/w/Vet%27ion',
  'Vorkath': 'https://oldschool.runescape.wiki/w/Vorkath',
  'Wintertodt': 'https://oldschool.runescape.wiki/w/Wintertodt',
  'Zalcano': 'https://oldschool.runescape.wiki/w/Zalcano',
  'Zulrah': 'https://oldschool.runescape.wiki/w/Zulrah'
};

module.exports = {
  data: new SlashCommandBuilder()
    .setName('boss')
    .setDescription('Get the OSRS Wiki page for a boss.')
    .addStringOption(option =>
      option
        .setName('bossname')
        .setDescription('Boss name (example: Vorkath, ToA, Nex)')
        .setRequired(true)
        .setMaxLength(100)
    ),

  async execute(interaction) {
    const bossName = interaction.options.getString('bossname', true).trim();

    const ephem = { ephemeral: true };

    const exact = BOSS_WIKI_LINKS[bossName];
    if (exact) {
      await interaction.reply({ content: `📘 **${bossName}** wiki: ${exact}`, ...ephem });
      return;
    }

    // Case-insensitive fallback for known names.
    const normalizedInput = bossName.toLowerCase();
    const key = Object.keys(BOSS_WIKI_LINKS).find(name => name.toLowerCase() === normalizedInput);
    if (key) {
      await interaction.reply({ content: `📘 **${key}** wiki: ${BOSS_WIKI_LINKS[key]}`, ...ephem });
      return;
    }

    // Smart aliases
    const aliases = {
      toa: 'Tombs of Amascut',
      tob: 'Theatre of Blood',
      cox: 'Chambers of Xeric',
      nm: 'Nightmare',
      pnm: 'Phosani\'s Nightmare',
      kbd: 'King Black Dragon',
      kq: 'Kalphite Queen',
      kq2: 'Kalphite Queen'
    };
    const aliasKey = aliases[normalizedInput];
    if (aliasKey && BOSS_WIKI_LINKS[aliasKey]) {
      await interaction.reply({
        content: `📘 **${aliasKey}** wiki: ${BOSS_WIKI_LINKS[aliasKey]}`,
        ...ephem
      });
      return;
    }

    const searchUrl = `https://oldschool.runescape.wiki/?search=${encodeURIComponent(bossName)}`;
    await interaction.reply({
      content: `📘 I couldn't find an exact boss match, so here's a Wiki search for **${bossName}**:\n${searchUrl}`,
      ...ephem
    });
  }
};

