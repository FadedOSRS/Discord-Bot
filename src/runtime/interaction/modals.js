const { handleEventsModalSubmit } = require('../../utils/eventsWizard');

async function handleModals(interaction, deps) {
  if (!interaction.isModalSubmit()) return false;
  const {
    config,
    verifications,
    saveVerifications,
    giveaways,
    saveGiveaways
  } = deps;

  if (await handleEventsModalSubmit(interaction, config)) return true;

  const [type, action] = interaction.customId.split(':');
  if (type === 'verify' && action === 'submit') {
    const osrsName = interaction.fields.getTextInputValue('osrs_name').trim();
    const memberForNick = await interaction.guild.members
      .fetch(interaction.user.id)
      .catch(() => null);
    const previousNickname = memberForNick?.nickname ?? null;
    verifications[interaction.user.id] = {
      osrsName,
      verifiedAt: new Date().toISOString(),
      status: 'pending',
      previousNickname
    };
    saveVerifications();

    await interaction.reply({
      content: `Thanks! Your OSRS name **${osrsName}** was submitted for review. A moderator will approve or deny your verification shortly.`,
      ephemeral: true
    });

    if (config.logChannelId) {
      const logChannel = await interaction.guild.channels.fetch(config.logChannelId).catch(() => null);
      if (logChannel && logChannel.isTextBased()) {
        const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
        const avatarUrl = interaction.user.displayAvatarURL({ size: 256 });
        const embed = new EmbedBuilder()
          .setTitle('Nickname Request')
          .setDescription(
            `<@${interaction.user.id}> is requesting a new nickname. To accept their request, click accept. Otherwise, click deny.`
          )
          .setThumbnail(avatarUrl)
          .addFields(
            { name: 'Requested Name', value: osrsName, inline: true },
            { name: 'Preview', value: osrsName, inline: true },
            { name: 'Discord ID', value: `\`${interaction.user.id}\``, inline: false }
          )
          .setTimestamp();

        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`verifylog:approve:${interaction.user.id}`)
            .setLabel('Accept')
            .setStyle(ButtonStyle.Success),
          new ButtonBuilder()
            .setCustomId(`verifylog:deny:${interaction.user.id}`)
            .setLabel('Deny')
            .setStyle(ButtonStyle.Danger)
        );

        const logMsg = await logChannel.send({ embeds: [embed], components: [row] });
        const current = verifications[interaction.user.id];
        verifications[interaction.user.id] = { ...current, logMessageId: logMsg.id };
        saveVerifications();

        try {
          const { buildLookupEmbed } = require('../../utils/osrsLookup');
          const lookupEmbed = await buildLookupEmbed(osrsName, {
            footer: 'HiScores + Runewatch (same as /lookup)'
          });
          await logMsg.edit({ embeds: [embed, lookupEmbed], components: [row] });
        } catch (err) {
          console.error('Verify: failed to attach lookup embed:', err);
        }
      }
    }
    return true;
  }

  if (interaction.customId === 'giveaway:create') {
    const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');
    const winnersRaw = interaction.fields.getTextInputValue('winners').trim();
    const winnersCount = Math.max(1, Math.min(50, Number.parseInt(winnersRaw, 10) || 1));
    const name = interaction.fields.getTextInputValue('name').trim();
    const endRaw = interaction.fields.getTextInputValue('end').trim();
    const description = interaction.fields.getTextInputValue('description').trim();

    let endAtMs = null;
    const discordTsMatch = endRaw.match(/<t:(\d+)(?::[a-zA-Z])?>/);
    if (discordTsMatch) endAtMs = Number(discordTsMatch[1]) * 1000;
    else if (/^\d{10}$/.test(endRaw)) endAtMs = Number(endRaw) * 1000;
    else {
      const normalized = endRaw.replace(' ', 'T');
      const parsed = Date.parse(normalized);
      if (!Number.isNaN(parsed)) endAtMs = parsed;
    }

    if (!endAtMs || endAtMs < Date.now() + 30_000) {
      await interaction.reply({
        content: 'End time could not be parsed, or it is too soon. Use `YYYY-MM-DD HH:mm` or a Discord timestamp like `<t:1774568400:F>`.',
        ephemeral: true
      });
      return true;
    }

    const endUnix = Math.floor(endAtMs / 1000);
    const embed = new EmbedBuilder()
      .setTitle(`🎁 Giveaway: ${name}`)
      .setDescription(description)
      .addFields(
        { name: 'Winners', value: `${winnersCount}`, inline: true },
        { name: 'Ends', value: `<t:${endUnix}:F> (<t:${endUnix}:R>)`, inline: true }
      )
      .setFooter({ text: 'Click Enter to join!' })
      .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('giveaway:enter:placeholder')
        .setLabel('🎟️ Enter')
        .setStyle(ButtonStyle.Success)
    );
    const message = await interaction.channel.send({ embeds: [embed], components: [row] });
    const fixedRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`giveaway:enter:${message.id}`)
        .setLabel('🎟️ Enter')
        .setStyle(ButtonStyle.Success)
    );
    await message.edit({ components: [fixedRow] });
    giveaways[message.id] = {
      messageId: message.id,
      guildId: interaction.guildId,
      channelId: interaction.channelId,
      name,
      description,
      endAtMs,
      winnersCount,
      createdAt: new Date().toISOString(),
      createdBy: interaction.user.id,
      entrants: [],
      ended: false,
      winnerIds: []
    };
    saveGiveaways();
    await interaction.reply({ content: `Giveaway created: **${name}**`, ephemeral: true });
    return true;
  }

  if (interaction.customId === 'poll:create') {
    const question = interaction.fields.getTextInputValue('question').trim();
    const c1 = interaction.fields.getTextInputValue('choice1').trim();
    const c2 = interaction.fields.getTextInputValue('choice2').trim();
    const c3 = interaction.fields.getTextInputValue('choice3')?.trim() || '';
    const moreRaw = interaction.fields.getTextInputValue('choice_more') || '';
    const options = [];
    if (c1) options.push(c1);
    if (c2) options.push(c2);
    if (c3) options.push(c3);
    const extra = moreRaw.split('\n').map(x => x.trim()).filter(Boolean);
    for (const line of extra) {
      if (options.length >= 10) break;
      options.push(line);
    }
    if (!question || options.length < 2) {
      await interaction.reply({ content: 'Please provide a question and at least two choices.', ephemeral: true });
      return true;
    }
    const emojis = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'];
    const lines = options.map((opt, idx) => `${emojis[idx]} ${opt}`);
    const content = `📊 **${question}**\n\n${lines.join('\n')}\n\n_Poll by ${interaction.user} — react below to vote._`;
    const message = await interaction.channel.send({
      content,
      allowedMentions: { repliedUser: false }
    });
    for (let i = 0; i < options.length && i < emojis.length; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      await message.react(emojis[i]).catch(() => null);
    }
    await interaction.reply({ content: 'Poll created.', ephemeral: true });
    return true;
  }

  return true;
}

module.exports = { handleModals };
