const { SlashCommandBuilder, ChannelType, PermissionFlagsBits } = require('discord.js');

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

function isValidDateMd(date) {
  if (!/^\d{2}-\d{2}$/.test(date)) return false;
  const [mmStr, ddStr] = date.split('-');
  const mm = Number(mmStr);
  const dd = Number(ddStr);
  if (mm < 1 || mm > 12) return false;
  if (dd < 1 || dd > 31) return false;
  const maxByMonth = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return dd <= maxByMonth[mm - 1];
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('birthday')
    .setDescription('Set or clear your birthday announcement settings.')
    .addSubcommand(sub => {
      sub
        .setName('set')
        .setDescription('Set your birthday date and timezone.')
        .addStringOption(option =>
          option
            .setName('date')
            .setDescription('Birthday in MM-DD format (example: 07-15)')
            .setRequired(true)
        )
        .addStringOption(option => {
          option
            .setName('timezone')
            .setDescription('Timezone used to trigger midnight birthday post')
            .setRequired(true);
          for (const tz of TIMEZONES) {
            option.addChoices({ name: `${tz.label} (${tz.value})`, value: tz.value });
          }
          return option;
        })
        .addChannelOption(option =>
          option
            .setName('channel')
            .setDescription('Announcement channel (defaults to current channel)')
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
            .setRequired(false)
        );
      return sub;
    })
    .addSubcommand(sub =>
      sub
        .setName('clear')
        .setDescription('Clear your saved birthday settings.')
    )
    .addSubcommand(sub =>
      sub
        .setName('view')
        .setDescription('View your current birthday settings.')
    )
    .addSubcommand(sub =>
      sub
        .setName('list')
        .setDescription('List saved birthdays for this server (staff).')
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.SendMessages),

  async execute(interaction, { birthdays, saveBirthdays }) {
    const sub = interaction.options.getSubcommand(true);
    const store = birthdays;
    const key = `${interaction.guildId}:${interaction.user.id}`;

    if (sub === 'clear') {
      delete store[key];
      saveBirthdays();
      await interaction.reply({ content: 'Your birthday settings were cleared.', ephemeral: true });
      return;
    }

    if (sub === 'view') {
      const row = store[key];
      if (!row) {
        await interaction.reply({ content: 'No birthday settings found. Use `/birthday set` first.', ephemeral: true });
        return;
      }
      await interaction.reply({
        content: `Birthday: **${row.date}** | Timezone: **${row.timezone}** | Channel: <#${row.channelId}>`,
        ephemeral: true
      });
      return;
    }

    if (sub === 'list') {
      const rows = Object.values(store)
        .filter(row => row && row.guildId === interaction.guildId)
        .sort((a, b) => a.date.localeCompare(b.date));

      if (!rows.length) {
        await interaction.reply({ content: 'No birthdays saved for this server yet.', ephemeral: true });
        return;
      }

      const lines = rows
        .slice(0, 50)
        .map(row => `• **${row.date}** — <@${row.userId}> (${row.timezone}) in <#${row.channelId}>`);

      await interaction.reply({
        content: `Saved birthdays (showing ${lines.length}/${rows.length}):\n${lines.join('\n')}`,
        ephemeral: true
      });
      return;
    }

    const date = interaction.options.getString('date', true).trim();
    const timezone = interaction.options.getString('timezone', true);
    const channel = interaction.options.getChannel('channel', false) || interaction.channel;

    if (!isValidDateMd(date)) {
      await interaction.reply({ content: 'Use date format `MM-DD` (example: `07-15`).', ephemeral: true });
      return;
    }

    store[key] = {
      guildId: interaction.guildId,
      userId: interaction.user.id,
      date,
      timezone,
      channelId: channel.id,
      updatedAt: new Date().toISOString(),
      lastAnnouncedYear: null
    };
    saveBirthdays();

    await interaction.reply({
      content: `Saved! I will announce your birthday on **${date}** at midnight in **${timezone}** in ${channel}.`,
      ephemeral: true
    });
  }
};

