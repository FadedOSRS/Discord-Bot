const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChannelType,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder
} = require('discord.js');

function parseEmojiInput(input) {
  if (!input) return null;
  const raw = input.trim();
  if (!raw) return null;

  // Custom emoji format: <:name:id> or <a:name:id>
  const custom = raw.match(/^<(a?):([a-zA-Z0-9_]+):(\d+)>$/);
  if (custom) {
    return {
      animated: custom[1] === 'a',
      name: custom[2],
      id: custom[3]
    };
  }

  // Unicode emoji fallback.
  return raw;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('rolepanel')
    .setDescription('Create a button role panel (toggle roles).')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
    .addStringOption(option =>
      option
        .setName('title')
        .setDescription('Panel title')
        .setRequired(true)
        .setMaxLength(100)
    )
    .addRoleOption(option => option.setName('role1').setDescription('Role 1').setRequired(true))
    .addRoleOption(option => option.setName('role2').setDescription('Role 2').setRequired(false))
    .addRoleOption(option => option.setName('role3').setDescription('Role 3').setRequired(false))
    .addRoleOption(option => option.setName('role4').setDescription('Role 4').setRequired(false))
    .addRoleOption(option => option.setName('role5').setDescription('Role 5').setRequired(false))
    .addStringOption(option => option.setName('emoji1').setDescription('Emoji for role1').setRequired(false).setMaxLength(64))
    .addStringOption(option => option.setName('emoji2').setDescription('Emoji for role2').setRequired(false).setMaxLength(64))
    .addStringOption(option => option.setName('emoji3').setDescription('Emoji for role3').setRequired(false).setMaxLength(64))
    .addStringOption(option => option.setName('emoji4').setDescription('Emoji for role4').setRequired(false).setMaxLength(64))
    .addStringOption(option => option.setName('emoji5').setDescription('Emoji for role5').setRequired(false).setMaxLength(64))
    .addStringOption(option =>
      option
        .setName('description')
        .setDescription('Panel description')
        .setRequired(false)
        .setMaxLength(1000)
    )
    .addChannelOption(option =>
      option
        .setName('channel')
        .setDescription('Channel to post in (defaults to current)')
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
        .setRequired(false)
    ),

  async execute(interaction) {
    const title = interaction.options.getString('title', true);
    const description = interaction.options.getString('description', false) || 'Click a button to toggle a role.';
    const targetChannel = interaction.options.getChannel('channel', false) || interaction.channel;

    const pairs = [1, 2, 3, 4, 5]
      .map(i => ({
        role: interaction.options.getRole(`role${i}`, false),
        emoji: parseEmojiInput(interaction.options.getString(`emoji${i}`, false))
      }))
      .filter(p => p.role);

    const roles = pairs.map(p => p.role);

    if (!roles.length) {
      await interaction.reply({ content: 'Add at least one role.', ephemeral: true });
      return;
    }

    const embed = new EmbedBuilder()
      .setTitle(title)
      .setDescription(description)
      .addFields({
        name: 'Available roles',
        value: roles.map(r => `• <@&${r.id}>`).join('\n'),
        inline: false
      })
      .setTimestamp();

    const row = new ActionRowBuilder();
    for (const pair of pairs) {
      const btn = new ButtonBuilder()
        .setCustomId(`rolepanel:toggle:${pair.role.id}`)
        .setLabel(pair.role.name.slice(0, 80))
        .setStyle(ButtonStyle.Secondary);

      if (pair.emoji) {
        try {
          btn.setEmoji(pair.emoji);
        } catch {
          // Ignore invalid emoji input and keep button usable.
        }
      }

      row.addComponents(btn);
    }

    await targetChannel.send({ embeds: [embed], components: [row] });
    await interaction.reply({ content: `Role panel posted in ${targetChannel}.`, ephemeral: true });
  }
};
