const { EmbedBuilder } = require('discord.js');
const { GROUP_BOSSES } = require('../data/lfgGroupBosses');

/** All OSRS skills (23). */
const OSRS_SKILLS = [
  'Attack',
  'Strength',
  'Defence',
  'Ranged',
  'Prayer',
  'Magic',
  'Runecraft',
  'Construction',
  'Hitpoints',
  'Agility',
  'Herblore',
  'Thieving',
  'Crafting',
  'Fletching',
  'Slayer',
  'Hunter',
  'Mining',
  'Smithing',
  'Fishing',
  'Cooking',
  'Firemaking',
  'Woodcutting',
  'Farming'
];

/**
 * Bosses from /boss wiki map and other notable PvM — merged with server LFG list, deduped.
 */
const ADDITIONAL_BOSSES = [
  'Abyssal Sire',
  'Alchemical Hydra',
  'Cerberus',
  'Kraken',
  'Sarachnis',
  'Thermonuclear Smoke Devil',
  'The Gauntlet',
  'Vardorvis',
  'Vorkath',
  'Zulrah',
  "Phosani's Nightmare",
  'Duke Sucellus',
  'The Leviathan',
  'The Whisperer',
  'Phantom Muspah',
  'Grotesque Guardians',
  'Hespori'
];

function allBossesPool() {
  const fromLfg = GROUP_BOSSES.map(b => b.value);
  return [...new Set([...fromLfg, ...ADDITIONAL_BOSSES])];
}

function wikiPageUrl(pageTitle) {
  const path = encodeURIComponent(pageTitle.replace(/ /g, '_'));
  return `https://oldschool.runescape.wiki/w/${path}`;
}

function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function buildBossOfTheWeekEmbed() {
  const boss = pickRandom(allBossesPool());
  const url = wikiPageUrl(boss);
  return new EmbedBuilder()
    .setColor(0xc27c0e)
    .setTitle('Boss of the week')
    .setDescription(`**${boss}**\n\n[Open on OSRS Wiki](${url})`)
    .setFooter({ text: 'Random pick — run !BOTW again for another boss' });
}

function buildSkillOfTheWeekEmbed() {
  const skill = pickRandom(OSRS_SKILLS);
  const url = wikiPageUrl(skill);
  return new EmbedBuilder()
    .setColor(0x2ecc71)
    .setTitle('Skill of the week')
    .setDescription(`**${skill}**\n\n[Open on OSRS Wiki](${url})`)
    .setFooter({ text: 'Random pick — run !SOTW again for another skill' });
}

module.exports = {
  OSRS_SKILLS,
  buildBossOfTheWeekEmbed,
  buildSkillOfTheWeekEmbed
};
