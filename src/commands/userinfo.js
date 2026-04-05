const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('userinfo')
    .setDescription('Show basic information about a server member.')
    .addUserOption(option =>
      option
        .setName('user')
        .setDescription('User to inspect (defaults to yourself)')
        .setRequired(false)
    ),

  async execute(interaction) {
    const user = interaction.options.getUser('user', false) || interaction.user;
    const member = await interaction.guild.members.fetch(user.id).catch(() => null);

    const roles = member
      ? member.roles.cache
          .filter(r => r.id !== interaction.guild.id)
          .map(r => `<@&${r.id}>`)
          .slice(0, 15)
      : [];

    const embed = new EmbedBuilder()
      .setTitle(`User info: ${user.tag}`)
      .setThumbnail(user.displayAvatarURL({ size: 256 }))
      .addFields(
        { name: 'User ID', value: `\`${user.id}\``, inline: true },
        { name: 'Bot account', value: user.bot ? 'Yes' : 'No', inline: true },
        { name: 'Created', value: `<t:${Math.floor(user.createdTimestamp / 1000)}:F>`, inline: false },
        {
          name: 'Joined server',
          value: member ? `<t:${Math.floor(member.joinedTimestamp / 1000)}:F>` : 'Unknown',
          inline: false
        },
        { name: 'Nickname', value: member?.nickname || 'None', inline: true },
        { name: 'Roles', value: roles.length ? roles.join(', ') : 'None', inline: false }
      )
      .setTimestamp();

    await interaction.reply({ embeds: [embed], ephemeral: true });
  }
};

