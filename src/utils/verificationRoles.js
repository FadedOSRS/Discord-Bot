const NEW_MEMBER_ROLE_NAME = 'New-Member';
const FULL_MEMBER_ROLE_NAME = 'Member';
const PROMOTION_AFTER_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * @param {import('discord.js').Guild} guild
 * @param {string} roleName
 * @param {number} [color]
 */
async function ensureRole(guild, roleName, color) {
  const existing = guild.roles.cache.find(r => r.name === roleName);
  if (existing) return existing;
  try {
    return await guild.roles.create({
      name: roleName,
      color: color ?? undefined,
      reason: 'Verification rank (auto-created by bot)',
      permissions: []
    });
  } catch (err) {
    console.error(`Failed to create role ${roleName}:`, err);
    return null;
  }
}

/**
 * @param {import('discord.js').GuildMember} member
 */
async function applyNewMemberRank(member) {
  const role = await ensureRole(member.guild, NEW_MEMBER_ROLE_NAME, 0x95a5a6);
  if (role) await member.roles.add(role).catch(err => console.error('applyNewMemberRank add:', err));
}

/**
 * Strip verification ranks + optional legacy verified role id.
 * @param {import('discord.js').GuildMember} member
 * @param {string | null} legacyVerifiedRoleId
 */
async function stripVerificationRoles(member, legacyVerifiedRoleId) {
  const guild = member.guild;
  const nm = guild.roles.cache.find(r => r.name === NEW_MEMBER_ROLE_NAME);
  const m = guild.roles.cache.find(r => r.name === FULL_MEMBER_ROLE_NAME);
  if (nm) await member.roles.remove(nm).catch(() => null);
  if (m) await member.roles.remove(m).catch(() => null);
  if (legacyVerifiedRoleId) {
    const leg = guild.roles.cache.get(legacyVerifiedRoleId);
    if (leg) await member.roles.remove(leg).catch(() => null);
  }
}

/**
 * Promote approved users from New-Member → Member after 30 days.
 * @param {import('discord.js').Client} client
 * @param {Record<string, object>} verifications
 * @param {() => void} saveVerifications
 */
async function runScheduledMemberPromotions(client, verifications, saveVerifications) {
  const now = Date.now();

  for (const guild of client.guilds.cache.values()) {
    for (const [userId, record] of Object.entries(verifications)) {
      if (!record || record.status !== 'approved') continue;
      if (record.promotedToMemberAt) continue;

      const approvedRaw = record.approvedAt || record.reviewedAt;
      if (!approvedRaw) continue;

      const approvedMs = new Date(approvedRaw).getTime();
      if (!Number.isFinite(approvedMs) || now - approvedMs < PROMOTION_AFTER_MS) continue;

      const member = await guild.members.fetch(userId).catch(() => null);
      if (!member) continue;

      const memRole = await ensureRole(guild, FULL_MEMBER_ROLE_NAME, 0x57f287);
      const newMemRole = guild.roles.cache.find(r => r.name === NEW_MEMBER_ROLE_NAME);
      if (!memRole) continue;

      await member.roles.add(memRole).catch(err => console.error('Promotion add Member:', err));
      if (newMemRole && member.roles.cache.has(newMemRole.id)) {
        await member.roles.remove(newMemRole).catch(() => null);
      }

      record.promotedToMemberAt = new Date().toISOString();
      verifications[userId] = record;
      saveVerifications();
    }
  }
}

module.exports = {
  NEW_MEMBER_ROLE_NAME,
  FULL_MEMBER_ROLE_NAME,
  PROMOTION_AFTER_MS,
  ensureRole,
  applyNewMemberRank,
  stripVerificationRoles,
  runScheduledMemberPromotions
};
