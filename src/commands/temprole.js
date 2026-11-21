const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  MessageFlags
} = require('discord.js');
const { hasManagementRole } = require('../utils/permissions');
const { baseEmbed, SUCCESS_COLOR, DANGER_COLOR } = require('../utils/embeds');
const { db } = require('../database');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('temprole')
    .setDescription('Temporarily add a role to a member')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
    .addSubcommand(sub =>
      sub.setName('add')
        .setDescription('Give a role for a limited time')
        .addUserOption(o =>
          o.setName('member')
            .setDescription('Member to role')
            .setRequired(true)
        )
        .addRoleOption(o =>
          o.setName('role')
            .setDescription('Role to add temporarily')
            .setRequired(true)
        )
        .addIntegerOption(o =>
          o.setName('duration')
            .setDescription('How long')
            .setRequired(true)
            .setMinValue(1)
        )
        .addStringOption(o =>
          o.setName('unit')
            .setDescription('Time unit')
            .setRequired(true)
            .addChoices(
              { name: 'Minutes', value: 'minutes' },
              { name: 'Hours', value: 'hours' },
              { name: 'Days', value: 'days' }
            )
        )
    )
    .addSubcommand(sub =>
      sub.setName('remove')
        .setDescription('Remove a temp role early')
        .addUserOption(o =>
          o.setName('member')
            .setDescription('Member')
            .setRequired(true)
        )
        .addRoleOption(o =>
          o.setName('role')
            .setDescription('Temp role to remove')
            .setRequired(true)
        )
    )
    .addSubcommand(sub =>
      sub.setName('list')
        .setDescription('List active temporary roles in this server')
    ),

  async execute(interaction) {
    if (!hasManagementRole(interaction.member)) {
      return interaction.reply({
        content: 'Only management can use temp roles.',
        flags: MessageFlags.Ephemeral
      });
    }

    const sub = interaction.options.getSubcommand();
    const guild = interaction.guild;

    if (sub === 'add') {
      const user = interaction.options.getUser('member');
      const role = interaction.options.getRole('role');
      const duration = interaction.options.getInteger('duration');
      const unit = interaction.options.getString('unit');

      if (role.managed) {
        return interaction.reply({
          content: 'That role is managed by an integration and cannot be assigned.',
          flags: MessageFlags.Ephemeral
        });
      }

      const me = guild.members.me;
      if (!me.permissions.has('ManageRoles')) {
        return interaction.reply({
          content: 'I need the **Manage Roles** permission.',
          flags: MessageFlags.Ephemeral
        });
      }
      if (role.position >= me.roles.highest.position) {
        return interaction.reply({
          content: 'I cannot assign that role because it is higher than or equal to my highest role.',
          flags: MessageFlags.Ephemeral
        });
      }

      const member = await guild.members.fetch(user.id).catch(() => null);
      if (!member) {
        return interaction.reply({
          content: 'Member not found in this server.',
          flags: MessageFlags.Ephemeral
        });
      }

      let ms = duration * 60 * 1000;
      if (unit === 'hours') ms = duration * 60 * 60 * 1000;
      if (unit === 'days') ms = duration * 24 * 60 * 60 * 1000;

      // Cap at 30 days
      if (ms > 30 * 24 * 60 * 60 * 1000) {
        return interaction.reply({
          content: 'Maximum temp role duration is 30 days.',
          flags: MessageFlags.Ephemeral
        });
      }

      try {
        await member.roles.add(role.id, 'Temp role by ' + interaction.user.tag);
      } catch (e) {
        return interaction.reply({
          content: 'Failed to add role: ' + (e.message || 'unknown error'),
          flags: MessageFlags.Ephemeral
        });
      }

      const expiresAt = new Date(Date.now() + ms).toISOString();

      // Replace existing temp entry for same user+role in this guild
      db.prepare(
        'DELETE FROM temp_roles WHERE guild_id = ? AND user_id = ? AND role_id = ?'
      ).run(guild.id, user.id, role.id);

      db.prepare(
        'INSERT INTO temp_roles (guild_id, user_id, role_id, expires_at, added_by) VALUES (?, ?, ?, ?, ?)'
      ).run(guild.id, user.id, role.id, expiresAt, interaction.user.id);

      const endsUnix = Math.floor(new Date(expiresAt).getTime() / 1000);

      return interaction.reply({
        embeds: [
          baseEmbed()
            .setColor(SUCCESS_COLOR)
            .setTitle('Temporary Role Added')
            .setDescription(
              '**Member:** <@' + user.id + '>\n' +
              '**Role:** <@&' + role.id + '>\n' +
              '**Duration:** ' + duration + ' ' + unit + '\n' +
              '**Removes:** <t:' + endsUnix + ':R> (<t:' + endsUnix + ':f>)\n\n' +
              'Only this role will be removed when the timer ends.'
            )
        ],
        flags: MessageFlags.Ephemeral
      });
    }

    if (sub === 'remove') {
      const user = interaction.options.getUser('member');
      const role = interaction.options.getRole('role');

      const row = db.prepare(
        'SELECT id FROM temp_roles WHERE guild_id = ? AND user_id = ? AND role_id = ?'
      ).get(guild.id, user.id, role.id);

      if (!row) {
        return interaction.reply({
          content: 'No active temp role entry for that member + role.',
          flags: MessageFlags.Ephemeral
        });
      }

      db.prepare('DELETE FROM temp_roles WHERE id = ?').run(row.id);

      const member = await guild.members.fetch(user.id).catch(() => null);
      if (member && member.roles.cache.has(role.id)) {
        try {
          await member.roles.remove(role.id, 'Temp role removed early by ' + interaction.user.tag);
        } catch (e) {
          return interaction.reply({
            content: 'Removed from database but failed to remove role in Discord: ' + e.message,
            flags: MessageFlags.Ephemeral
          });
        }
      }

      return interaction.reply({
        embeds: [
          baseEmbed()
            .setColor(DANGER_COLOR)
            .setTitle('Temp Role Removed')
            .setDescription('<@&' + role.id + '> removed from <@' + user.id + '>.')
        ],
        flags: MessageFlags.Ephemeral
      });
    }

    if (sub === 'list') {
      const rows = db.prepare(
        'SELECT * FROM temp_roles WHERE guild_id = ? AND expires_at > ? ORDER BY expires_at ASC'
      ).all(guild.id, new Date().toISOString());

      if (!rows.length) {
        return interaction.reply({
          content: 'No active temporary roles in this server.',
          flags: MessageFlags.Ephemeral
        });
      }

      const lines = rows.map((r, i) => {
        const ends = Math.floor(new Date(r.expires_at).getTime() / 1000);
        return (i + 1) + '. <@' + r.user_id + '> → <@&' + r.role_id + '> · ends <t:' + ends + ':R>';
      });

      return interaction.reply({
        embeds: [
          baseEmbed()
            .setTitle('Active Temporary Roles')
            .setDescription(lines.join('\n').slice(0, 4000))
        ],
        flags: MessageFlags.Ephemeral
      });
    }
  }
};
