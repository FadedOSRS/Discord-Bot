const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');

const TZ_PREFIX = 'TZ | ';

const TIMEZONES = [
  { label: 'US Pacific', value: 'America/Los_Angeles' },
  { label: 'US Mountain', value: 'America/Denver' },
  { label: 'US Central', value: 'America/Chicago' },
  { label: 'US Eastern', value: 'America/New_York' },
  { label: 'Atlantic Canada', value: 'America/Halifax' },
  { label: 'Brazil', value: 'America/Sao_Paulo' },
  { label: 'UK', value: 'Europe/London' },
  { label: 'Central Europe', value: 'Europe/Berlin' },
  { label: 'Eastern Europe', value: 'Europe/Bucharest' },
  { label: 'Turkey', value: 'Europe/Istanbul' },
  { label: 'India', value: 'Asia/Kolkata' },
  { label: 'Pakistan', value: 'Asia/Karachi' },
  { label: 'Bangladesh', value: 'Asia/Dhaka' },
  { label: 'Thailand', value: 'Asia/Bangkok' },
  { label: 'China/Singapore', value: 'Asia/Singapore' },
  { label: 'Japan', value: 'Asia/Tokyo' },
  { label: 'Korea', value: 'Asia/Seoul' },
  { label: 'Australia East', value: 'Australia/Sydney' },
  { label: 'New Zealand', value: 'Pacific/Auckland' },
  { label: 'UTC', value: 'Etc/UTC' }
];

function roleNameForTz(tzValue) {
  const found = TIMEZONES.find(t => t.value === tzValue);
  const label = found ? found.label : tzValue;
  return `${TZ_PREFIX}${label}`;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('timezone')
    .setDescription('Set or clear your timezone role.')
    .addSubcommand(sub =>
      sub
        .setName('set')
        .setDescription('Set your timezone role.')
        .addStringOption(option => {
          option
            .setName('zone')
            .setDescription('Your timezone')
            .setRequired(true);

          for (const tz of TIMEZONES) {
            option.addChoices({ name: `${tz.label} (${tz.value})`, value: tz.value });
          }
          return option;
        })
    )
    .addSubcommand(sub =>
      sub
        .setName('clear')
        .setDescription('Remove your timezone role.')
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand(true);
    const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
    if (!member) {
      await interaction.reply({ content: 'Could not find your server member record.', ephemeral: true });
      return;
    }

    const allTzRoles = interaction.guild.roles.cache.filter(r => r.name.startsWith(TZ_PREFIX));

    if (sub === 'clear') {
      const currentRoles = member.roles.cache.filter(r => r.name.startsWith(TZ_PREFIX));
      if (!currentRoles.size) {
        await interaction.reply({ content: 'You do not currently have a timezone role.', ephemeral: true });
        return;
      }

      await member.roles.remove(currentRoles.map(r => r.id)).catch(() => null);
      await interaction.reply({ content: 'Your timezone role was removed.', ephemeral: true });
      return;
    }

    const tzValue = interaction.options.getString('zone', true);
    const desiredRoleName = roleNameForTz(tzValue);
    let role = interaction.guild.roles.cache.find(r => r.name === desiredRoleName) || null;

    if (!role) {
      // Create timezone role on demand.
      role = await interaction.guild.roles.create({
        name: desiredRoleName,
        mentionable: false,
        hoist: false,
        permissions: []
      }).catch(() => null);
    }

    if (!role) {
      await interaction.reply({
        content: 'I could not create/find that timezone role. Check my Manage Roles permission and role hierarchy.',
        ephemeral: true
      });
      return;
    }

    const existingTzRoleIds = allTzRoles
      .filter(r => member.roles.cache.has(r.id))
      .map(r => r.id)
      .filter(id => id !== role.id);

    if (existingTzRoleIds.length) {
      await member.roles.remove(existingTzRoleIds).catch(() => null);
    }

    await member.roles.add(role).catch(() => null);

    await interaction.reply({
      content: `Timezone role set to <@&${role.id}>.`,
      ephemeral: true
    });
  }
};

