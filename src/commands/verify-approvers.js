const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('verify-approvers')
    .setDescription('Choose which roles can approve or deny nickname verification requests.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand(sub =>
      sub
        .setName('add')
        .setDescription('Allow a role to use Accept / Deny on verify logs.')
        .addRoleOption(opt =>
          opt.setName('role').setDescription('Role that can approve verifications').setRequired(true)
        )
    )
    .addSubcommand(sub =>
      sub
        .setName('remove')
        .setDescription('Remove a role from the approver list.')
        .addRoleOption(opt => opt.setName('role').setDescription('Role to remove').setRequired(true))
    )
    .addSubcommand(sub => sub.setName('list').setDescription('List roles that can approve verifications.'))
    .addSubcommand(sub =>
      sub
        .setName('clear')
        .setDescription('Remove all custom approver roles (only Admin / Manage Server can approve).')
    ),

  async execute(interaction, { config, saveConfig }) {
    const sub = interaction.options.getSubcommand(true);

    if (!Array.isArray(config.verificationApproverRoleIds)) {
      config.verificationApproverRoleIds = [];
    }

    if (sub === 'add') {
      const role = interaction.options.getRole('role', true);
      if (!config.verificationApproverRoleIds.includes(role.id)) {
        config.verificationApproverRoleIds.push(role.id);
      }
      saveConfig();
      await interaction.reply({
        content: `${role} can now approve or deny verification requests (in addition to people with **Administrator** or **Manage Server**).`,
        ephemeral: true
      });
      return;
    }

    if (sub === 'remove') {
      const role = interaction.options.getRole('role', true);
      config.verificationApproverRoleIds = config.verificationApproverRoleIds.filter(id => id !== role.id);
      saveConfig();
      await interaction.reply({
        content: `Removed ${role} from verification approvers.`,
        ephemeral: true
      });
      return;
    }

    if (sub === 'list') {
      const ids = config.verificationApproverRoleIds || [];
      if (!ids.length) {
        await interaction.reply({
          content:
            'No extra approver roles configured. Only members with **Administrator** or **Manage Server** can approve/deny.',
          ephemeral: true
        });
        return;
      }
      const lines = ids.map(id => `• <@&${id}> (\`${id}\`)`);
      await interaction.reply({
        content: `Roles that can approve/deny verifications:\n${lines.join('\n')}\n\n**Administrator** and **Manage Server** always can.`,
        ephemeral: true
      });
      return;
    }

    if (sub === 'clear') {
      config.verificationApproverRoleIds = [];
      saveConfig();
      await interaction.reply({
        content: 'Cleared custom verification approvers. Only **Administrator** / **Manage Server** can approve now.',
        ephemeral: true
      });
    }
  }
};
