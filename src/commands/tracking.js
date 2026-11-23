const { SlashCommandBuilder, MessageFlags, PermissionFlagsBits } = require('discord.js');
const { db, getConfig, setConfig } = require('../database');
const { hasManagementRole } = require('../utils/permissions');
const { baseEmbed, SUCCESS_COLOR, WARNING_COLOR } = require('../utils/embeds');

function trackingSinceISO() {
  // Prefer explicit reset timestamp; otherwise no lower bound
  return getConfig('tracking_reset_at') || null;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('tracking')
    .setDescription('View or reset outreach tracking')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand(sub =>
      sub.setName('view')
        .setDescription('View outreach totals and staff activity summary')
    )
    .addSubcommand(sub =>
      sub.setName('reset')
        .setDescription('Reset tracking counts and start counting from now')
        .addBooleanOption(o =>
          o.setName('confirm')
            .setDescription('Must be True to confirm reset')
            .setRequired(true)
        )
    ),

  async execute(interaction) {
    if (!hasManagementRole(interaction.member)) {
      return interaction.reply({
        content: 'Only management can use this command.',
        flags: MessageFlags.Ephemeral
      });
    }

    const sub = interaction.options.getSubcommand();

    if (sub === 'reset') {
      const confirm = interaction.options.getBoolean('confirm');
      if (!confirm) {
        return interaction.reply({
          embeds: [
            baseEmbed()
              .setColor(WARNING_COLOR)
              .setTitle('Tracking Reset Cancelled')
              .setDescription(
                'You must set **confirm** to **True** to reset tracking.\n\n' +
                'This does **not** delete staff logs used for pay.\n' +
                'It only resets when tracking / weekly reports start counting from.'
              )
          ],
          flags: MessageFlags.Ephemeral
        });
      }

      const now = new Date().toISOString();
      setConfig('tracking_reset_at', now);
      // Allow the next weekly report to send again after reset
      setConfig('last_weekly_report', '');

      const embed = baseEmbed()
        .setColor(SUCCESS_COLOR)
        .setTitle('Tracking Reset')
        .setDescription(
          'Tracking has been reset.\n\n' +
          '**New period starts:** <t:' + Math.floor(Date.now() / 1000) + ':F>\n\n' +
          '• `/tracking view` totals restart from this moment\n' +
          '• Weekly activity reports count from this moment\n' +
          '• Staff **payment logs are not deleted**\n\n' +
          'Use `/tracking view` anytime to see the new totals.'
        )
        .setFooter({ text: 'Reset by ' + interaction.user.tag });

      return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }

    // view
    const since = trackingSinceISO();
    const sinceClause = since ? ' WHERE created_at >= ?' : '';
    const sinceParams = since ? [since] : [];

    const totalLogs = db.prepare('SELECT COUNT(*) as c FROM outreach_logs' + sinceClause).get(...sinceParams)?.c || 0;
    const mutuals = db.prepare(
      "SELECT COUNT(*) as c FROM outreach_logs" + (since ? " WHERE type = 'Mutual' AND created_at >= ?" : " WHERE type = 'Mutual'")
    ).get(...sinceParams)?.c || 0;
    const partners = db.prepare(
      "SELECT COUNT(*) as c FROM outreach_logs" + (since ? " WHERE type = 'Partner' AND created_at >= ?" : " WHERE type = 'Partner'")
    ).get(...sinceParams)?.c || 0;

    const pendingReqs = db.prepare(
      "SELECT COUNT(*) as c FROM requests WHERE status = 'pending'" +
      (since ? ' AND created_at >= ?' : '')
    ).get(...sinceParams)?.c || 0;
    const approvedReqs = db.prepare(
      "SELECT COUNT(*) as c FROM requests WHERE status = 'approved'" +
      (since ? ' AND created_at >= ?' : '')
    ).get(...sinceParams)?.c || 0;

    // Top staff: last 7 days, but not before tracking reset
    let weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    if (since && since > weekAgo) weekAgo = since;

    const topStaff = db.prepare(`
      SELECT user_id, COUNT(*) as c FROM outreach_logs
      WHERE created_at >= ?
      GROUP BY user_id ORDER BY c DESC LIMIT 10
    `).all(weekAgo);

    const topLines = topStaff.length
      ? topStaff.map((r, i) => (i + 1) + '. <@' + r.user_id + '> — **' + r.c + '** log(s)').join('\n')
      : 'No activity in this tracking period.';

    const periodNote = since
      ? 'Counting since <t:' + Math.floor(new Date(since).getTime() / 1000) + ':f> (last reset).'
      : 'Counting all-time (no reset set yet).';

    const embed = baseEmbed()
      .setColor(0x000000)
      .setTitle('PR Tracking Report')
      .setDescription('Overview of department outreach and activity.\n' + periodNote)
      .addFields(
        { name: 'Total Outreach Logs', value: String(totalLogs), inline: true },
        { name: 'Mutual Giveaways', value: String(mutuals), inline: true },
        { name: 'Partnerships', value: String(partners), inline: true },
        { name: 'Pending Requests', value: String(pendingReqs), inline: true },
        { name: 'Approved Requests', value: String(approvedReqs), inline: true },
        { name: 'Top Staff (Recent)', value: topLines }
      );

    return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  }
};
