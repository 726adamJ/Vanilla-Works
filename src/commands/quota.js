const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { hasManagementRole } = require('../utils/permissions');
const { baseEmbed } = require('../utils/embeds');
const { db } = require('../database');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('quota')
    .setDescription('View how many outreaches a staff member logged in the last 7 days')
    .addUserOption(o =>
      o.setName('member')
        .setDescription('Staff member to check (leave empty for all staff summary)')
        .setRequired(false)
    ),

  async execute(interaction) {
    if (!hasManagementRole(interaction.member)) {
      return interaction.reply({ content: 'Only management can use this command.', flags: MessageFlags.Ephemeral });
    }

    const member = interaction.options.getUser('member');
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    if (member) {
      const mutual = db.prepare(
        "SELECT COUNT(*) as c FROM outreach_logs WHERE user_id = ? AND type = 'Mutual' AND created_at >= ?"
      ).get(member.id, weekAgo)?.c || 0;
      const partner = db.prepare(
        "SELECT COUNT(*) as c FROM outreach_logs WHERE user_id = ? AND type = 'Partner' AND created_at >= ?"
      ).get(member.id, weekAgo)?.c || 0;
      const total = mutual + partner;

      const embed = baseEmbed()
        .setColor(0x000000)
        .setTitle('7-Day Quota — ' + member.tag)
        .setDescription('Outreach logged in the last 7 days for <@' + member.id + '>.')
        .addFields(
          { name: 'Mutual Giveaways', value: '**' + mutual + '**', inline: true },
          { name: 'Partnerships', value: '**' + partner + '**', inline: true },
          { name: 'Total', value: '**' + total + '**', inline: true }
        );

      return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }

    // All staff summary for last 7 days
    const rows = db.prepare(`
      SELECT user_id,
        SUM(CASE WHEN type = 'Mutual' THEN 1 ELSE 0 END) as mutuals,
        SUM(CASE WHEN type = 'Partner' THEN 1 ELSE 0 END) as partners,
        COUNT(*) as total
      FROM outreach_logs
      WHERE created_at >= ?
      GROUP BY user_id
      ORDER BY total DESC
    `).all(weekAgo);

    const lines = rows.length
      ? rows.map((r, i) =>
          (i + 1) + '. <@' + r.user_id + '> — **' + r.total + '** (M:' + r.mutuals + ' / P:' + r.partners + ')'
        ).join('\n')
      : 'No outreach logged in the last 7 days.';

    const embed = baseEmbed()
      .setColor(0x000000)
      .setTitle('7-Day Quota — All Staff')
      .setDescription(lines.slice(0, 4000));

    return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  }
};
