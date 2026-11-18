const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const { db } = require('../database');
const { hasManagementRole } = require('../utils/permissions');
const { baseEmbed } = require('../utils/embeds');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('staff')
    .setDescription('Manage staff outreach log threads')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand(sub =>
      sub.setName('log')
        .setDescription('Assign or manage a staff member log thread')
        .addStringOption(opt =>
          opt.setName('action')
            .setDescription('Action')
            .setRequired(true)
            .addChoices(
              { name: 'setup', value: 'setup' },
              { name: 'edit', value: 'edit' },
              { name: 'remove', value: 'remove' },
              { name: 'view', value: 'view' }
            )
        )
        .addUserOption(opt => opt.setName('member').setDescription('Staff member').setRequired(true))
        .addStringOption(opt => opt.setName('thread').setDescription('Thread ID or link (for setup/edit)').setRequired(false))
    ),

  async execute(interaction) {
    if (!hasManagementRole(interaction.member)) {
      return interaction.reply({ content: 'Only management can manage staff log assignments.', flags: MessageFlags.Ephemeral });
    }

    const action = interaction.options.getString('action');
    const member = interaction.options.getUser('member');
    const threadInput = interaction.options.getString('thread');

    if (action === 'setup' || action === 'edit') {
      if (!threadInput) {
        return interaction.reply({ content: 'Provide a thread ID or thread link.', flags: MessageFlags.Ephemeral });
      }
      let threadId = threadInput.trim();
      const match = threadInput.match(/\/channels\/\d+\/(\d+)/) || threadInput.match(/^(\d+)$/);
      if (match) threadId = match[1];
      if (!/^\d{17,20}$/.test(threadId)) {
        return interaction.reply({ content: 'Invalid thread ID or link.', flags: MessageFlags.Ephemeral });
      }

      db.prepare(`
        INSERT OR REPLACE INTO staff_threads (user_id, thread_id, assigned_by, assigned_at)
        VALUES (?, ?, ?, datetime('now'))
      `).run(member.id, threadId, interaction.user.id);

      const embed = baseEmbed()
        .setTitle(action === 'setup' ? 'Staff Log Thread Assigned' : 'Staff Log Thread Updated')
        .setDescription('**Staff:** <@' + member.id + '> (' + member.tag + ')\n**Thread ID:** `' + threadId + '`')
        .setColor(0x2ECC71);

      return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }

    if (action === 'remove') {
      const existing = db.prepare('SELECT * FROM staff_threads WHERE user_id = ?').get(member.id);
      if (!existing) return interaction.reply({ content: 'No thread assignment found.', flags: MessageFlags.Ephemeral });
      db.prepare('DELETE FROM staff_threads WHERE user_id = ?').run(member.id);
      return interaction.reply({ content: 'Removed thread assignment for <@' + member.id + '>.', flags: MessageFlags.Ephemeral });
    }

    if (action === 'view') {
      const row = db.prepare('SELECT * FROM staff_threads WHERE user_id = ?').get(member.id);
      if (!row) return interaction.reply({ content: '<@' + member.id + '> has no outreach thread assigned.', flags: MessageFlags.Ephemeral });
      const embed = baseEmbed()
        .setTitle('Staff Log Assignment')
        .addFields(
          { name: 'Staff', value: '<@' + member.id + '>', inline: true },
          { name: 'Thread ID', value: '`' + row.thread_id + '`', inline: true },
          { name: 'Assigned by', value: row.assigned_by ? '<@' + row.assigned_by + '>' : 'Unknown', inline: true }
        );
      return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }
  }
};
