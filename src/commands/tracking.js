const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { db } = require('../database');
const { hasManagementRole } = require('../utils/permissions');
const { baseEmbed } = require('../utils/embeds');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('tracking')
    .setDescription('View outreach totals and staff activity summary'),

  async execute(interaction) {
    if (!hasManagementRole(interaction.member)) {
      return interaction.reply({ content: 'Only management can use this command.', flags: MessageFlags.Ephemeral });
    }

    const totalLogs = db.prepare('SELECT COUNT(*) as c FROM outreach_logs').get()?.c || 0;
    const mutuals = db.prepare("SELECT COUNT(*) as c FROM outreach_logs WHERE type = 'Mutual'").get()?.c || 0;
    const partners = db.prepare("SELECT COUNT(*) as c FROM outreach_logs WHERE type = 'Partner'").get()?.c || 0;
    const pendingReqs = db.prepare("SELECT COUNT(*) as c FROM requests WHERE status = 'pending'").get()?.c || 0;
    const approvedReqs = db.prepare("SELECT COUNT(*) as c FROM requests WHERE status = 'approved'").get()?.c || 0;

    // Top staff by logs (last 7 days)
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const topStaff = db.prepare(`
      SELECT user_id, COUNT(*) as c FROM outreach_logs
      WHERE created_at >= ?
      GROUP BY user_id ORDER BY c DESC LIMIT 10
    `).all(weekAgo);

    const topLines = topStaff.length
      ? topStaff.map((r, i) => (i + 1) + '. <@' + r.user_id + '> — **' + r.c + '** log(s)').join('\n')
      : 'No activity in the last 7 days.';

    const embed = baseEmbed()
      .setColor(0x000000)
      .setTitle('PR Tracking Report')
      .setDescription('Overview of department outreach and activity.')
      .addFields(
        { name: 'Total Outreach Logs', value: String(totalLogs), inline: true },
        { name: 'Mutual Giveaways', value: String(mutuals), inline: true },
        { name: 'Partnerships', value: String(partners), inline: true },
        { name: 'Pending Requests', value: String(pendingReqs), inline: true },
        { name: 'Approved Requests', value: String(approvedReqs), inline: true },
        { name: 'Top Staff (Last 7 Days)', value: topLines }
      );

    return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  }
};
