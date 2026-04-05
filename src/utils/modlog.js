async function logModerationAction(interaction, config, payload) {
  try {
    if (!config?.modLogChannelId) return;
    const channel = await interaction.guild.channels.fetch(config.modLogChannelId).catch(() => null);
    if (!channel || !channel.isTextBased()) return;

    const lines = [
      `🛡️ **${payload.action}**`,
      `**Moderator:** <@${interaction.user.id}> (\`${interaction.user.id}\`)`
    ];

    if (payload.targetId) {
      lines.push(`**Target:** <@${payload.targetId}> (\`${payload.targetId}\`)`);
    }

    if (payload.details) {
      lines.push(`**Details:** ${payload.details}`);
    }

    lines.push(`**Channel:** <#${interaction.channelId}>`);
    lines.push(`**At:** <t:${Math.floor(Date.now() / 1000)}:F>`);

    await channel.send(lines.join('\n'));
  } catch {
    // Best-effort logging only.
  }
}

module.exports = {
  logModerationAction
};

