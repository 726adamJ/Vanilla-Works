const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const { db } = require('../database');
const { hasManagementRole } = require('../utils/permissions');
const { baseEmbed, statusColor } = require('../utils/embeds');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('pr')
    .setDescription('PR management and reporting commands')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand(sub =>
      sub.setName('stats')
        .setDescription('Department statistics overview')
    )
    .addSubcommand(sub =>
      sub.setName('pending')
        .setDescription('List all pending requests')
    )
    .addSubcommand(sub =>
      sub.setName('staff')
        .setDescription('List PR staff and their assigned threads')
    )
    .addSubcommand(sub =>
      sub.setName('history')
        .setDescription('View recent request history')
        .addIntegerOption(o => o.setName('limit').setDescription('Number of records (default 10)').setRequired(false).setMinValue(1).setMaxValue(25))
    )
    .addSubcommand(sub =>
      sub.setName('staffstats')
        .setDescription('View outreach & request stats for a staff member')
        .addUserOption(o => o.setName('member').setDescription('Staff member').setRequired(true))
    ),

  async execute(interaction) {
    if (!hasManagementRole(interaction.member)) {
      return interaction.reply({ content: 'Only management can use PR reporting commands.', flags: MessageFlags.Ephemeral });
    }

    const sub = interaction.options.getSubcommand();

    if (sub === 'stats') {
      const totalMutual = db.prepare(`SELECT COUNT(*) as c FROM requests WHERE type = 'mutual_giveaway'`).get().c;
      const totalPartner = db.prepare(`SELECT COUNT(*) as c FROM requests WHERE type = 'partnership'`).get().c;
      const approved = db.prepare(`SELECT COUNT(*) as c FROM requests WHERE status = 'approved'`).get().c;
      const rejected = db.prepare(`SELECT COUNT(*) as c FROM requests WHERE status = 'rejected'`).get().c;
      const pending = db.prepare(`SELECT COUNT(*) as c FROM requests WHERE status = 'pending'`).get().c;
      const logs = db.prepare(`SELECT COUNT(*) as c FROM outreach_logs`).get().c;
      const activeStaff = db.prepare(`SELECT COUNT(*) as c FROM staff_threads`).get().c;

      const embed = baseEmbed()
        .setTitle('📊 PR Department Statistics')
        .addFields(
          { name: 'Mutual Giveaway Requests', value: String(totalMutual), inline: true },
          { name: 'Partnership Requests', value: String(totalPartner), inline: true },
          { name: 'Pending', value: String(pending), inline: true },
          { name: 'Approved', value: String(approved), inline: true },
          { name: 'Rejected', value: String(rejected), inline: true },
          { name: 'Total Outreach Logs', value: String(logs), inline: true },
          { name: 'Active Staff (with threads)', value: String(activeStaff), inline: true }
        );

      return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }

    if (sub === 'pending') {
      const rows = db.prepare(`SELECT * FROM requests WHERE status = 'pending' ORDER BY created_at DESC LIMIT 15`).all();
      if (!rows.length) {
        return interaction.reply({ content: 'There are no pending requests.', flags: MessageFlags.Ephemeral });
      }

      const list = rows.map(r => {
        const data = JSON.parse(r.data);
        const label = r.type === 'mutual_giveaway' ? 'Mutual' : 'Partnership';
        return `• **${label}** \`${r.id}\` — <@${r.submitter_id}> — <t:${Math.floor(new Date(r.created_at).getTime()/1000)}:R>`;
      }).join('\n');

      const embed = baseEmbed()
        .setTitle('⏳ Pending Requests')
        .setDescription(list);

      return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }

    if (sub === 'staff') {
      const rows = db.prepare(`SELECT * FROM staff_threads ORDER BY assigned_at DESC`).all();
      if (!rows.length) {
        return interaction.reply({ content: 'No staff members have been assigned threads yet.', flags: MessageFlags.Ephemeral });
      }

      const list = rows.map(r => `• <@${r.user_id}> → Thread \`${r.thread_id}\``).join('\n');
      const embed = baseEmbed()
        .setTitle('👥 PR Staff Thread Assignments')
        .setDescription(list);

      return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }

    if (sub === 'history') {
      const limit = interaction.options.getInteger('limit') || 10;
      const rows = db.prepare(`SELECT * FROM requests ORDER BY created_at DESC LIMIT ?`).all(limit);

      if (!rows.length) {
        return interaction.reply({ content: 'No request history found.', flags: MessageFlags.Ephemeral });
      }

      const list = rows.map(r => {
        const statusEmoji = r.status === 'approved' ? '✅' : r.status === 'rejected' ? '❌' : '⏳';
        const label = r.type === 'mutual_giveaway' ? 'Mutual' : 'Partner';
        return `${statusEmoji} **${label}** \`${r.id}\` — <@${r.submitter_id}> — ${r.status}`;
      }).join('\n');

      const embed = baseEmbed()
        .setTitle('📜 Recent Request History')
        .setDescription(list);

      return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }

    if (sub === 'staffstats') {
      const member = interaction.options.getUser('member');
      const logs = db.prepare(`SELECT COUNT(*) as c FROM outreach_logs WHERE user_id = ?`).get(member.id).c;
      const requests = db.prepare(`SELECT COUNT(*) as c FROM requests WHERE submitter_id = ?`).get(member.id).c;
      const approved = db.prepare(`SELECT COUNT(*) as c FROM requests WHERE submitter_id = ? AND status = 'approved'`).get(member.id).c;
      const pending = db.prepare(`SELECT COUNT(*) as c FROM requests WHERE submitter_id = ? AND status = 'pending'`).get(member.id).c;
      const thread = db.prepare(`SELECT thread_id FROM staff_threads WHERE user_id = ?`).get(member.id);

      const embed = baseEmbed()
        .setTitle(`📈 Staff Stats — ${member.tag}`)
        .addFields(
          { name: 'Outreach Logs', value: String(logs), inline: true },
          { name: 'Total Requests', value: String(requests), inline: true },
          { name: 'Approved', value: String(approved), inline: true },
          { name: 'Pending', value: String(pending), inline: true },
          { name: 'Assigned Thread', value: thread ? `\`${thread.thread_id}\`` : 'Not assigned', inline: false }
        );

      return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }
  }
};
