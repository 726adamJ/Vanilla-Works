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
              { name: 'Payment Channel', value: 'payment_channel' },
              { name: 'LOA Channel', value: 'loa_channel' },
              { name: 'Tracking Channel', value: 'tracking_channel' },
              { name: 'Panel Channel', value: 'panel_channel' },
              { name: 'Request Ping Role', value: 'request_ping_role' },
              { name: 'Outreach Ping Role', value: 'outreach_ping_role' },
              { name: 'Blacklist Ping Role', value: 'blacklist_ping_role' },
              { name: 'Payment Ping Role', value: 'payment_ping_role' },
              { name: 'LOA Ping Role', value: 'loa_ping_role' },
              { name: 'Junior PR Role', value: 'junior_pr_role' },
              { name: 'Senior PR Role', value: 'senior_pr_role' },
              { name: 'Management Roles (slash + approve)', value: 'management_roles' },
              { name: 'Staff Roles (panel only)', value: 'staff_roles' }
            )
        )
        .addChannelOption(o => o.setName('channel').setDescription('Channel').setRequired(false))
        .addRoleOption(o => o.setName('role').setDescription('Role').setRequired(false))
        .addStringOption(o => o.setName('roles').setDescription('Comma-separated role IDs/mentions for multi-role').setRequired(false))
    )
    .addSubcommand(sub =>
      sub.setName('view').setDescription('View current configuration')
    ),

  async execute(interaction) {
    if (!hasManagementRole(interaction.member)) {
      return interaction.reply({ content: 'Only management can change configuration.', flags: MessageFlags.Ephemeral });
    }

    const sub = interaction.options.getSubcommand();

    if (sub === 'view') {
      const ch = (k) => getConfig(k) ? '<#' + getConfig(k) + '>' : 'Not set';
      const rl = (k) => getConfig(k) ? '<@&' + getConfig(k) + '>' : 'Not set';
      const embed = baseEmbed()
        .setTitle('Bot Configuration')
        .addFields(
          { name: 'Approval Channel', value: ch('approval_channel'), inline: true },
          { name: 'Blacklist Channel', value: ch('blacklist_channel'), inline: true },
          { name: 'Outreach Log Channel', value: ch('outreach_channel'), inline: true },
          { name: 'Payment Channel', value: ch('payment_channel'), inline: true },
          { name: 'LOA Channel', value: ch('loa_channel'), inline: true },
          { name: 'Tracking Channel', value: ch('tracking_channel'), inline: true },
          { name: 'Request Ping', value: rl('request_ping_role'), inline: true },
          { name: 'Outreach Ping', value: rl('outreach_ping_role'), inline: true },
          { name: 'Blacklist Ping', value: rl('blacklist_ping_role'), inline: true },
          { name: 'Payment Ping', value: rl('payment_ping_role'), inline: true },
          { name: 'LOA Ping', value: rl('loa_ping_role'), inline: true },
          { name: 'Junior PR Role', value: rl('junior_pr_role'), inline: true },
          { name: 'Senior PR Role', value: rl('senior_pr_role'), inline: true },
          { name: 'Management Roles', value: (getConfigJSON('management_roles', []) || []).map(id => '<@&' + id + '>').join(', ') || 'Admins only', inline: false },
          { name: 'Staff Roles', value: (getConfigJSON('staff_roles', []) || []).map(id => '<@&' + id + '>').join(', ') || 'None', inline: false }
        );
      return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }

    if (sub === 'set') {
      const key = interaction.options.getString('key');
      const channel = interaction.options.getChannel('channel');
      const role = interaction.options.getRole('role');
      const rolesStr = interaction.options.getString('roles');

      const channelKeys = ['approval_channel', 'blacklist_channel', 'outreach_channel', 'payment_channel', 'loa_channel', 'tracking_channel', 'panel_channel'];
      const singleRoleKeys = ['request_ping_role', 'outreach_ping_role', 'blacklist_ping_role', 'payment_ping_role', 'loa_ping_role', 'junior_pr_role', 'senior_pr_role'];
      const multiRoleKeys = ['management_roles', 'staff_roles'];

      if (channelKeys.includes(key)) {
        if (!channel) return interaction.reply({ content: 'Provide a channel.', flags: MessageFlags.Ephemeral });
        setConfig(key, channel.id);
        return interaction.reply({ content: 'Set **' + key + '** to <#' + channel.id + '>.', flags: MessageFlags.Ephemeral });
      }

      if (singleRoleKeys.includes(key)) {
        if (!role) return interaction.reply({ content: 'Provide a role.', flags: MessageFlags.Ephemeral });
        setConfig(key, role.id);
        return interaction.reply({ content: 'Set **' + key + '** to <@&' + role.id + '>.', flags: MessageFlags.Ephemeral });
      }

      if (multiRoleKeys.includes(key)) {
        let ids = [];
        if (rolesStr) {
          ids = [...new Set((rolesStr.match(/\d{17,20}/g) || []))];
        } else if (role) {
          ids = [role.id];
        } else {
          return interaction.reply({ content: 'Provide role(s).', flags: MessageFlags.Ephemeral });
        }
        // Cap management roles at 2 as requested
        if (key === 'management_roles' && ids.length > 2) {
          ids = ids.slice(0, 2);
        }
        setConfigJSON(key, ids);
        return interaction.reply({ content: 'Set **' + key + '** to: ' + ids.map(id => '<@&' + id + '>').join(', '), flags: MessageFlags.Ephemeral });
      }

      return interaction.reply({ content: 'Unknown key.', flags: MessageFlags.Ephemeral });
    }
  }
};
