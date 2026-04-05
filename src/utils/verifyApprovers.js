const { PermissionFlagsBits } = require('discord.js');

/**
 * Who may use Accept/Deny on verification (nickname) log messages.
 * If `config.verificationApproverRoleIds` is non-empty, any of those roles + Admin/Manage Guild.
 * If empty, only Manage Guild / Administrator (legacy behavior).
 * @param {import('discord.js').GuildMember | null} member
 * @param {object} config
 */
function canApproveNicknameVerification(member, config) {
  if (!member) return false;
  if (member.permissions.has(PermissionFlagsBits.Administrator)) return true;
  if (member.permissions.has(PermissionFlagsBits.ManageGuild)) return true;

  const ids = config?.verificationApproverRoleIds;
  if (!Array.isArray(ids) || ids.length === 0) {
    return false;
  }
  return ids.some(id => member.roles.cache.has(id));
}

module.exports = { canApproveNicknameVerification };
