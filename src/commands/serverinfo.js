const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('serverinfo')
    .setDescription('Show basic information about this server.'),

  async execute(interaction) {
    const guild = interaction.guild;
    const channels = await guild.channels.fetch();
    const textChannels = channels.filter(c => c?.isTextBased()).size;
    const voiceChannels = channels.filter(c => c?.isVoiceBased()).size;

    const embed = new EmbedBuilder()
      .setTitle(`Server info: ${guild.name}`)
      .setThumbnail(guild.iconURL({ size: 256 }))
      .addFields(
        { name: 'Server ID', value: `\`${guild.id}\``, inline: true },
        { name: 'Owner ID', value: `\`${guild.ownerId}\``, inline: true },
        { name: 'Members', value: `${guild.memberCount}`, inline: true },
        { name: 'Roles', value: `${guild.roles.cache.size}`, inline: true },
        { name: 'Text channels', value: `${textChannels}`, inline: true },
        { name: 'Voice channels', value: `${voiceChannels}`, inline: true },
        { name: 'Created', value: `<t:${Math.floor(guild.createdTimestamp / 1000)}:F>`, inline: false }
      )
      .setTimestamp();

    await interaction.reply({ embeds: [embed], ephemeral: true });
  }
};

