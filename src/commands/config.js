const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const { setConfig, getConfig, setConfigJSON, getConfigJSON } = require('../database');
const { hasManagementRole } = require('../utils/permissions');
const { baseEmbed } = require('../utils/embeds');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('config')
    .setDescription('Configure bot channels, roles and settings')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand(sub =>
      sub.setName('set')
        .setDescription('Set a configuration value')
        .addStringOption(o =>
          o.setName('key')
            .setDescription('Setting to configure')
            .setRequired(true)
            .addChoices(
              { name: 'Approval Channel', value: 'approval_channel' },
              { name: 'Blacklist Channel', value: 'blacklist_channel' },
              { name: 'Outreach Log Channel', value: 'outreach_channel' },
              { name: 'Panel Channel', value: 'panel_channel' },
              { name: 'Request Ping Role', value: 'request_ping_role' },
              { name: 'Outreach Ping Role', value: 'outreach_ping_role' },
              { name: 'Blacklist Ping Role', value: 'blacklist_ping_role' },
              { name: 'Management Roles', value: 'management_roles' },
              { name: 'Staff Roles', value: 'staff_roles' }
            )
        )
        .addChannelOption(o => o.setName('channel').setDescription('Channel (for channel settings)').setRequired(false))
        .addRoleOption(o => o.setName('role').setDescription('Role (for role settings)').setRequired(false))
        .addStringOption(o => o.setName('roles').setDescription('Comma-separated role IDs or mentions (for multi-role settings)').setRequired(false))
    )
    .addSubcommand(sub =>
      sub.setName('view')
        .setDescription('View current configuration')
    ),

  async execute(interaction) {
    if (!hasManagementRole(interaction.member) && !interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({ content: 'Only management/administrators can change configuration.', flags: MessageFlags.Ephemeral });
    }

    const sub = interaction.options.getSubcommand();

    if (sub === 'view') {
      const embed = baseEmbed()
        .setTitle('Bot Configuration')
        .addFields(
          { name: 'Approval Channel', value: getConfig('approval_channel') ? '<#' + getConfig('approval_channel') + '>' : 'Not set', inline: true },
          { name: 'Blacklist Channel', value: getConfig('blacklist_channel') ? '<#' + getConfig('blacklist_channel') + '>' : 'Not set', inline: true },
          { name: 'Outreach Log Channel', value: getConfig('outreach_channel') ? '<#' + getConfig('outreach_channel') + '>' : 'Not set', inline: true },
          { name: 'Request Ping Role', value: getConfig('request_ping_role') ? '<@&' + getConfig('request_ping_role') + '>' : 'Not set', inline: true },
          { name: 'Outreach Ping Role', value: getConfig('outreach_ping_role') ? '<@&' + getConfig('outreach_ping_role') + '>' : 'Not set', inline: true },
          { name: 'Blacklist Ping Role', value: getConfig('blacklist_ping_role') ? '<@&' + getConfig('blacklist_ping_role') + '>' : 'Not set', inline: true },
          { name: 'Management Roles', value: (getConfigJSON('management_roles', []) || []).map(id => '<@&' + id + '>').join(', ') || 'None (admins only)', inline: false },
          { name: 'Staff Roles', value: (getConfigJSON('staff_roles', []) || []).map(id => '<@&' + id + '>').join(', ') || 'None', inline: false }
        );
      return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }

    if (sub === 'set') {
      const key = interaction.options.getString('key');
      const channel = interaction.options.getChannel('channel');
      const role = interaction.options.getRole('role');
      const rolesStr = interaction.options.getString('roles');

      const channelKeys = ['approval_channel', 'blacklist_channel', 'outreach_channel', 'panel_channel'];
      const singleRoleKeys = ['request_ping_role', 'outreach_ping_role', 'blacklist_ping_role'];
      const multiRoleKeys = ['management_roles', 'staff_roles'];

      if (channelKeys.includes(key)) {
        if (!channel) return interaction.reply({ content: 'Please provide a channel for this setting.', flags: MessageFlags.Ephemeral });
        setConfig(key, channel.id);
        return interaction.reply({ content: 'Set **' + key + '** to <#' + channel.id + '>.', flags: MessageFlags.Ephemeral });
      }

      if (singleRoleKeys.includes(key)) {
        if (!role) return interaction.reply({ content: 'Please provide a role for this setting.', flags: MessageFlags.Ephemeral });
        setConfig(key, role.id);
        return interaction.reply({ content: 'Set **' + key + '** to <@&' + role.id + '>.', flags: MessageFlags.Ephemeral });
      }

      if (multiRoleKeys.includes(key)) {
        let ids = [];
        if (rolesStr) {
          const matches = rolesStr.match(/\d{17,20}/g) || [];
          ids = [...new Set(matches)];
        } else if (role) {
          ids = [role.id];
        } else {
          return interaction.reply({ content: 'Provide a role or a comma-separated list of role IDs/mentions.', flags: MessageFlags.Ephemeral });
        }
        setConfigJSON(key, ids);
        return interaction.reply({ content: 'Set **' + key + '** to: ' + ids.map(id => '<@&' + id + '>').join(', '), flags: MessageFlags.Ephemeral });
      }

      return interaction.reply({ content: 'Unknown configuration key.', flags: MessageFlags.Ephemeral });
    }
  }
};
