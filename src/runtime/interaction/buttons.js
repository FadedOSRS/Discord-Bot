const { ChannelType } = require('discord.js');
const fs = require('fs-extra');
const path = require('path');
const {
  stripVerificationRoles,
  ensureRole,
  FULL_MEMBER_ROLE_NAME
} = require('../../utils/verificationRoles');
const { ensureLfgVoiceCategory } = require('../../utils/lfgVoiceCategory');
const { handleEventsButton } = require('../../utils/eventsWizard');
const { canApproveNicknameVerification } = require('../../utils/verifyApprovers');

async function handleButtons(interaction, deps) {
  if (!interaction.isButton()) return false;
  if (await handleEventsButton(interaction)) return true;

  const {
    config,
    verifications,
    saveVerifications,
    giveaways,
    saveGiveaways,
    dataDir
  } = deps;

  const [type, action] = interaction.customId.split(':');

  if (type === 'verify') {
    if (action === 'start') {
      const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require('discord.js');
      const modal = new ModalBuilder()
        .setCustomId('verify:submit')
        .setTitle('Verify your OSRS account');
      const usernameInput = new TextInputBuilder()
        .setCustomId('osrs_name')
        .setLabel('Enter your exact OSRS username')
        .setPlaceholder('Iron Chad')
        .setRequired(true)
        .setStyle(TextInputStyle.Short);
      const firstActionRow = new ActionRowBuilder().addComponents(usernameInput);
      modal.addComponents(firstActionRow);
      await interaction.showModal(modal);
    }
    return true;
  }

  if (type === 'rolepanel') {
    const [, actionType, roleId] = interaction.customId.split(':');
    if (actionType !== 'toggle') return true;
    const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
    const role = interaction.guild.roles.cache.get(roleId);
    if (!member || !role) {
      await interaction.reply({ content: 'That role is no longer available.', ephemeral: true });
      return true;
    }
    const hasRole = member.roles.cache.has(roleId);
    if (hasRole) {
      const removed = await member.roles.remove(role).catch(() => null);
      if (!removed) {
        await interaction.reply({ content: 'I could not remove that role (permissions/hierarchy).', ephemeral: true });
        return true;
      }
      await interaction.reply({ content: `Removed role: <@&${roleId}>`, ephemeral: true });
    } else {
      const added = await member.roles.add(role).catch(() => null);
      if (!added) {
        await interaction.reply({ content: 'I could not add that role (permissions/hierarchy).', ephemeral: true });
        return true;
      }
      await interaction.reply({ content: `Added role: <@&${roleId}>`, ephemeral: true });
    }
    return true;
  }

  if (type === 'verifylog') {
    const [, actionType, targetUserId] = interaction.customId.split(':');
    const actingMember =
      interaction.member ??
      (interaction.guild
        ? await interaction.guild.members.fetch(interaction.user.id).catch(() => null)
        : null);
    if (!canApproveNicknameVerification(actingMember, config)) {
      await interaction.reply({
        content:
          'You do not have permission to approve or deny verifications. Ask a server admin to add your role with `/verify-approvers add`.',
        ephemeral: true
      });
      return true;
    }
    const record = verifications[targetUserId];
    if (!record) {
      await interaction.reply({ content: 'No verification record found for that user.', ephemeral: true });
      return true;
    }
    if (record.status === 'denied' || record.status === 'approved') {
      await interaction.reply({ content: `This verification is already **${record.status}**.`, ephemeral: true });
      return true;
    }
    if (actionType !== 'approve' && actionType !== 'deny') {
      await interaction.reply({ content: 'Invalid verification action.', ephemeral: true });
      return true;
    }

    await interaction.deferReply({ ephemeral: true });
    const { EmbedBuilder } = require('discord.js');
    const guild = interaction.guild;

    try {
      const member = await guild.members.fetch(targetUserId).catch(() => null);
      if (actionType === 'approve') {
        const nowIso = new Date().toISOString();
        record.status = 'approved';
        record.approvedAt = nowIso;
        record.reviewedAt = nowIso;
        record.reviewedBy = interaction.user.id;
        verifications[targetUserId] = record;
        saveVerifications();
        if (member) {
          if (record.osrsName) {
            await member.setNickname(record.osrsName, 'Verification approved').catch(() => null);
          }
          const memberRank = await ensureRole(guild, FULL_MEMBER_ROLE_NAME, 0x57f287);
          if (memberRank) await member.roles.add(memberRank).catch(() => null);
          if (config.verifiedRoleId) {
            const extraRole = guild.roles.cache.get(config.verifiedRoleId);
            if (extraRole && extraRole.id !== memberRank?.id) {
              await member.roles.add(extraRole).catch(() => null);
            }
          }
        }
        await interaction.editReply({
          content: `Approved verification for <@${targetUserId}> — granted **${FULL_MEMBER_ROLE_NAME}**.`
        });
      } else {
        record.status = 'denied';
        record.reviewedAt = new Date().toISOString();
        record.reviewedBy = interaction.user.id;
        verifications[targetUserId] = record;
        saveVerifications();
        if (member) await stripVerificationRoles(member, config.verifiedRoleId);
        if (member) {
          const previous = record.previousNickname ?? null;
          await member.setNickname(previous, 'Verification denied').catch(() => null);
        }
        await interaction.editReply({
          content: `Denied verification for <@${targetUserId}> (**${FULL_MEMBER_ROLE_NAME}** / optional verified role removed if present).`
        });
      }

      const approved = actionType === 'approve';
      const statusText = approved ? 'Approved' : 'Denied';
      const osrsName = record.osrsName || 'Unknown';
      const thumbUser = member?.user ?? (await interaction.client.users.fetch(targetUserId).catch(() => null));
      const avatarUrl = thumbUser?.displayAvatarURL({ size: 256 }) ?? null;

      async function resolveLogMessage() {
        let m = interaction.message;
        if (m?.partial) m = await m.fetch().catch(() => null);
        if (m?.editable) return m;
        const mid = record.logMessageId || null;
        if (!mid || !config.logChannelId) return null;
        const ch = await guild.channels.fetch(config.logChannelId).catch(() => null);
        if (!ch?.isTextBased()) return null;
        return ch.messages.fetch(mid).catch(() => null);
      }

      const msg = await resolveLogMessage();
      if (msg?.editable) {
        const mainEmbed = new EmbedBuilder()
          .setColor(approved ? 0x57f287 : 0xed4245)
          .setTitle(approved ? '✅ Nickname request approved' : '❌ Nickname request denied')
          .setDescription(
            approved
              ? `<@${targetUserId}>'s verification was **approved** by <@${interaction.user.id}>.`
              : `<@${targetUserId}>'s verification was **denied** by <@${interaction.user.id}>.`
          )
          .addFields(
            { name: 'Status', value: `**${statusText}**`, inline: true },
            { name: 'Requested name', value: osrsName, inline: true },
            { name: 'Discord ID', value: `\`${targetUserId}\``, inline: false },
            { name: 'Reviewed by', value: `<@${interaction.user.id}>`, inline: false }
          )
          .setTimestamp();
        if (avatarUrl) mainEmbed.setThumbnail(avatarUrl);
        const preserved =
          msg.embeds.length > 1
            ? msg.embeds.slice(1).map(e => {
                const d = e.data ?? e;
                return d && typeof d === 'object' ? EmbedBuilder.from(d) : null;
              }).filter(Boolean)
            : [];
        await msg.edit({ embeds: [mainEmbed, ...preserved], components: [] }).catch(err =>
          console.error('verifylog: failed to edit log message:', err)
        );
      }
    } catch (err) {
      console.error('verifylog handler:', err);
      await interaction
        .editReply({ content: 'Something went wrong while processing that verification. Check the console / bot logs.' })
        .catch(() => null);
    }
    return true;
  }

  if (type === 'lfg') {
    const [, actionType, messageId] = interaction.customId.split(':');
    const lfgStorePath = path.join(dataDir, 'lfgEvents.json');
    let lfgEvents = {};
    if (fs.existsSync(lfgStorePath)) {
      try {
        lfgEvents = fs.readJsonSync(lfgStorePath);
      } catch (err) {
        console.error('Failed to read lfgEvents.json', err);
      }
    }

    const event = lfgEvents[messageId];
    if (!event) return true;

    if (actionType === 'voice') {
      if (event.tempVoiceChannelId) {
        await interaction.reply({
          content: `A temp voice channel already exists for this LFG: <#${event.tempVoiceChannelId}>`,
          ephemeral: true
        });
        return true;
      }
      const guild = interaction.guild;
      const channelName = `${event.boss} - LFG`;
      const parentCategory = await ensureLfgVoiceCategory(guild);
      if (!parentCategory) {
        await interaction.reply({
          content:
            'I could not create or find the **LFG — Temporary** category (needs **Manage Channels**). Also ensure a **General** category exists if you want it ordered directly below it.',
          ephemeral: true
        });
        return true;
      }
      const voiceChannel = await guild.channels
        .create({
          name: channelName.substring(0, 90),
          type: ChannelType.GuildVoice,
          parent: parentCategory.id,
          reason: `Temp LFG voice channel created by ${interaction.user.tag}`
        })
        .catch(err => {
          console.error('Failed to create temp voice channel:', err);
          return null;
        });
      if (!voiceChannel) {
        await interaction.reply({
          content: 'I could not create a temp voice channel. Please check my permissions and hierarchy.',
          ephemeral: true
        });
        return true;
      }
      event.tempVoiceChannelId = voiceChannel.id;
      event.tempVoiceCreatedAt = new Date().toISOString();
      lfgEvents[messageId] = event;
      fs.writeJsonSync(lfgStorePath, lfgEvents, { spaces: 2 });
      await interaction.reply({ content: `Created temp voice channel: ${voiceChannel}`, ephemeral: true });
      return true;
    }

    await interaction.deferUpdate();
    const userId = interaction.user.id;
    const sets = {
      going: new Set(event.going || []),
      maybe: new Set(event.maybe || []),
      notGoing: new Set(event.notGoing || [])
    };
    for (const key of Object.keys(sets)) sets[key].delete(userId);
    if (actionType === 'going') sets.going.add(userId);
    if (actionType === 'maybe') sets.maybe.add(userId);
    if (actionType === 'not') sets.notGoing.add(userId);
    event.going = Array.from(sets.going);
    event.maybe = Array.from(sets.maybe);
    event.notGoing = Array.from(sets.notGoing);
    lfgEvents[messageId] = event;
    fs.writeJsonSync(lfgStorePath, lfgEvents, { spaces: 2 });

    const channel = await interaction.guild.channels.fetch(event.channelId).catch(() => null);
    if (!channel || !channel.isTextBased()) return true;
    const message = await channel.messages.fetch(messageId).catch(() => null);
    if (!message) return true;
    const embed = message.embeds[0];
    if (!embed) return true;
    const goingList = event.going.length ? event.going.map(id => `<@${id}>`).join(', ') : 'No one yet';
    const maybeList = event.maybe.length ? event.maybe.map(id => `<@${id}>`).join(', ') : 'No one yet';
    const updatedEmbed = embed.toJSON();
    updatedEmbed.fields = [
      { name: '✅ Going', value: goingList, inline: false },
      { name: '🤔 Maybe', value: maybeList, inline: false }
    ];
    await message.edit({ embeds: [updatedEmbed] });
    return true;
  }

  if (type === 'giveaway') {
    const [, actionType, messageId] = interaction.customId.split(':');
    if (actionType !== 'enter') return true;
    const g = giveaways[messageId];
    if (!g || g.ended) {
      await interaction.reply({ content: 'This giveaway is no longer active.', ephemeral: true });
      return true;
    }
    const userId = interaction.user.id;
    g.entrants = Array.isArray(g.entrants) ? g.entrants : [];
    if (g.entrants.includes(userId)) {
      await interaction.reply({ content: 'You are already entered!', ephemeral: true });
      return true;
    }
    g.entrants.push(userId);
    giveaways[messageId] = g;
    saveGiveaways();
    await interaction.reply({ content: `You’ve entered **${g.name}**!`, ephemeral: true });
    return true;
  }

  return true;
}

module.exports = { handleButtons };
