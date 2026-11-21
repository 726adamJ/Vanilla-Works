const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const { hasManagementRole } = require('../utils/permissions');
const { baseEmbed, SUCCESS_COLOR, WARNING_COLOR } = require('../utils/embeds');
const { db } = require('../database');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('audit')
    .setDescription('Audit bot data against Discord')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand(sub =>
      sub.setName('logs')
        .setDescription('Remove outreach logs whose Discord messages were deleted')
        .addBooleanOption(o =>
          o.setName('dry_run')
            .setDescription('Only report — do not delete (default false)')
            .setRequired(false)
        )
    ),

  async execute(interaction, client) {
    if (!hasManagementRole(interaction.member)) {
      return interaction.reply({
        content: 'Only management can run audits.',
        flags: MessageFlags.Ephemeral
      });
    }

    const sub = interaction.options.getSubcommand();
    if (sub !== 'logs') return;

    const dryRun = interaction.options.getBoolean('dry_run') || false;

    await interaction.reply({
      embeds: [
        baseEmbed()
          .setColor(WARNING_COLOR)
          .setTitle('Auditing Outreach Logs…')
          .setDescription('Checking Discord for deleted log messages. This may take a moment.')
      ],
      flags: MessageFlags.Ephemeral
    });

    const rows = db.prepare(
      'SELECT id, user_id, type, message_id, channel_id, thread_id FROM outreach_logs WHERE message_id IS NOT NULL'
    ).all();

    const missing = [];
    const checked = rows.length;
    let errors = 0;

    // Cache channel fetches
    const channelCache = new Map();

    for (const row of rows) {
      const channelId = row.channel_id || row.thread_id;
      if (!channelId || !row.message_id) {
        missing.push(row);
        continue;
      }

      try {
        let channel = channelCache.get(channelId);
        if (channel === undefined) {
          channel = await client.channels.fetch(channelId).catch(() => null);
          channelCache.set(channelId, channel);
        }
        if (!channel) {
          missing.push(row);
          continue;
        }
        const msg = await channel.messages.fetch(row.message_id).catch(() => null);
        if (!msg) missing.push(row);
      } catch {
        errors++;
        missing.push(row);
      }
    }

    // Also count logs with no message_id at all (can't verify)
    const noMsgId = db.prepare(
      'SELECT COUNT(*) as c FROM outreach_logs WHERE message_id IS NULL OR message_id = \'\''
    ).get()?.c || 0;

    if (!dryRun && missing.length) {
      const del = db.prepare('DELETE FROM outreach_logs WHERE id = ?');
      const tx = db.transaction((list) => {
        for (const r of list) del.run(r.id);
      });
      tx(missing);
    }

    const sample = missing.slice(0, 15).map(r =>
      '• `' + r.id + '` — <@' + r.user_id + '> (' + (r.type || '?') + ')'
    ).join('\n');

    return interaction.editReply({
      embeds: [
        baseEmbed()
          .setColor(SUCCESS_COLOR)
          .setTitle(dryRun ? 'Log Audit (Dry Run)' : 'Log Audit Complete')
          .setDescription(
            '**Checked:** ' + checked + ' log(s) with message IDs\n' +
            '**Missing / deleted on Discord:** ' + missing.length + '\n' +
            '**Removed from database:** ' + (dryRun ? '0 (dry run)' : String(missing.length)) + '\n' +
            '**Logs with no message ID (skipped):** ' + noMsgId + '\n' +
            (errors ? '**Fetch errors:** ' + errors + '\n' : '') +
            (sample ? '\n**Sample:**\n' + sample : '') +
            (dryRun && missing.length
              ? '\n\nRun `/audit logs` without dry_run to delete these from the database.'
              : '')
          )
      ]
    });
  }
};
