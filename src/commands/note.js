const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const { loadNotes, saveNotes, keyFor } = require('../utils/modNotesStore');

const MAX_NOTES_STORED = 50;
const LIST_SHOW = 15;

module.exports = {
  data: new SlashCommandBuilder()
    .setName('note')
    .setDescription('Staff-only internal notes on a member (not warnings).')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addSubcommand(sub =>
      sub
        .setName('add')
        .setDescription('Add a private mod note')
        .addUserOption(o => o.setName('user').setDescription('Member').setRequired(true))
        .addStringOption(o =>
          o.setName('text').setDescription('Note text').setRequired(true).setMaxLength(1000)
        )
    )
    .addSubcommand(sub =>
      sub
        .setName('list')
        .setDescription('List mod notes for a member')
        .addUserOption(o => o.setName('user').setDescription('Member').setRequired(true))
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand(true);

    if (sub === 'add') {
      const member = interaction.options.getMember('user');
      const text = interaction.options.getString('text', true).trim();
      if (!member) {
        await interaction.reply({ content: 'Member not found.', ephemeral: true });
        return;
      }

      const store = loadNotes();
      const key = keyFor(interaction.guildId, member.id);
      const list = Array.isArray(store[key]) ? store[key] : [];
      list.push({
        text,
        moderatorId: interaction.user.id,
        at: new Date().toISOString()
      });
      while (list.length > MAX_NOTES_STORED) list.shift();
      store[key] = list;
      saveNotes(store);

      await interaction.reply({
        content: `Note **#${list.length}** saved for ${member.user.tag}. Only staff using \`/note list\` can see these.`,
        ephemeral: true
      });
      return;
    }

    if (sub === 'list') {
      const member = interaction.options.getMember('user');
      if (!member) {
        await interaction.reply({ content: 'Member not found.', ephemeral: true });
        return;
      }

      const store = loadNotes();
      const key = keyFor(interaction.guildId, member.id);
      const list = Array.isArray(store[key]) ? store[key] : [];
      if (!list.length) {
        await interaction.reply({
          content: `No mod notes on record for **${member.user.tag}**.`,
          ephemeral: true
        });
        return;
      }

      const total = list.length;
      const slice = list.slice(-LIST_SHOW).reverse();
      const lines = slice.map((n, i) => {
        const noteNum = total - i;
        const ts = Math.floor(new Date(n.at).getTime() / 1000);
        return `**#${noteNum}** ${n.text}\n— <@${n.moderatorId}>, <t:${ts}:F> (<t:${ts}:R>)`;
      });

      const embed = new EmbedBuilder()
        .setColor(0x95a5a6)
        .setTitle(`Mod notes — ${member.user.tag}`)
        .setDescription(lines.join('\n\n').slice(0, 4000))
        .setFooter({ text: `Ephemeral — ${list.length} note(s) total` });

      await interaction.reply({ embeds: [embed], ephemeral: true });
    }
  }
};
