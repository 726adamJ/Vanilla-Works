const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  MessageFlags,
  ChannelType,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} = require('discord.js');
const { hasManagementRole } = require('../utils/permissions');
const { baseEmbed, SUCCESS_COLOR, WARNING_COLOR } = require('../utils/embeds');
const { db } = require('../database');
const { generateLogId } = require('../utils/ids');

// Pending auto-log jobs awaiting approval (jobId -> data)
const pendingJobs = new Map();

module.exports = {
  pendingJobs,

  data: new SlashCommandBuilder()
    .setName('auto')
    .setDescription('Automatic tools for management')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand(sub =>
      sub.setName('log')
        .setDescription('Import messages from a channel into staff log threads')
        .addChannelOption(o =>
          o.setName('channel')
            .setDescription('Channel to read old staff logs from')
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement, ChannelType.PublicThread, ChannelType.PrivateThread)
            .setRequired(true)
        )
        .addStringOption(o =>
          o.setName('scope')
            .setDescription('Whose messages to import')
            .setRequired(true)
            .addChoices(
              { name: 'All staff with a log thread', value: 'all' },
              { name: 'One specific staff member', value: 'one' }
            )
        )
        .addUserOption(o =>
          o.setName('member')
            .setDescription('Staff member (required if scope is one)')
            .setRequired(false)
        )
        .addIntegerOption(o =>
          o.setName('limit')
            .setDescription('Max messages to scan (default 200, max 500)')
            .setRequired(false)
            .setMinValue(10)
            .setMaxValue(500)
        )
    ),

  async execute(interaction, client) {
    if (!hasManagementRole(interaction.member)) {
      return interaction.reply({
        content: 'Only management can use /auto log.',
        flags: MessageFlags.Ephemeral
      });
    }

    const sub = interaction.options.getSubcommand();
    if (sub !== 'log') return;

    const channel = interaction.options.getChannel('channel');
    const scope = interaction.options.getString('scope');
    const memberOpt = interaction.options.getUser('member');
    const limit = interaction.options.getInteger('limit') || 200;

    if (scope === 'one' && !memberOpt) {
      return interaction.reply({
        content: 'Pick a **member** when scope is "One specific staff member".',
        flags: MessageFlags.Ephemeral
      });
    }

    // Who is allowed to receive auto-logs
    const assignments = db.prepare('SELECT user_id, thread_id FROM staff_threads').all();
    const threadByUser = new Map(assignments.map(a => [a.user_id, a.thread_id]));

    if (!assignments.length) {
      return interaction.reply({
        content: 'No staff log threads are assigned yet. Use `/staff log action:setup` first.',
        flags: MessageFlags.Ephemeral
      });
    }

    let targetUserIds;
    if (scope === 'one') {
      if (!threadByUser.has(memberOpt.id)) {
        return interaction.reply({
          content: '<@' + memberOpt.id + '> has no log thread assigned. Set one with `/staff log` first.',
          flags: MessageFlags.Ephemeral
        });
      }
      targetUserIds = new Set([memberOpt.id]);
    } else {
      targetUserIds = new Set(threadByUser.keys());
    }

    await interaction.reply({
      embeds: [
        baseEmbed()
          .setColor(WARNING_COLOR)
          .setTitle('Auto Log — Calculating...')
          .setDescription(
            'Scanning <#' + channel.id + '> (up to **' + limit + '** messages).\n' +
            'Only messages from staff who have a log thread will be counted.\nPlease wait...'
          )
      ],
      flags: MessageFlags.Ephemeral
    });

    // Fetch messages
    const collected = [];
    let lastId;
    try {
      while (collected.length < limit) {
        const batch = await channel.messages.fetch({
          limit: Math.min(100, limit - collected.length),
          ...(lastId ? { before: lastId } : {})
        });
        if (!batch.size) break;
        for (const msg of batch.values()) collected.push(msg);
        lastId = batch.last().id;
        if (batch.size < 100) break;
      }
    } catch (e) {
      console.error('Auto log fetch failed:', e);
      return interaction.editReply({
        embeds: [
          baseEmbed()
            .setColor(0xE74C3C)
            .setTitle('Auto Log — Failed')
            .setDescription('Could not read messages from <#' + channel.id + '>. Check bot permissions (**Read Message History**).')
        ]
      });
    }

    // Oldest first so logs post in chronological order later
    collected.sort((a, b) => a.createdTimestamp - b.createdTimestamp);

    // Group by author — only target staff, skip bots / empty
    const byUser = new Map(); // userId -> [{ message, type, invite, text }]
    for (const msg of collected) {
      if (msg.author.bot) continue;
      if (!targetUserIds.has(msg.author.id)) continue;
      const text = (msg.content || '').trim();
      if (!text && msg.attachments.size === 0) continue;

      const type = detectType(text);
      const invite = extractInvite(text) || 'N/A';
      const entry = {
        messageId: msg.id,
        channelId: msg.channelId,
        content: text || '[attachment only]',
        type,
        invite,
        createdAt: msg.createdAt.toISOString(),
        url: msg.url
      };

      if (!byUser.has(msg.author.id)) byUser.set(msg.author.id, []);
      byUser.get(msg.author.id).push(entry);
    }

    if (!byUser.size) {
      return interaction.editReply({
        embeds: [
          baseEmbed()
            .setColor(0xE74C3C)
            .setTitle('Auto Log — Nothing Found')
            .setDescription(
              'No matching staff messages found in <#' + channel.id + '>.\n' +
              'Make sure staff have log threads assigned and that they authored messages in that channel.'
            )
        ]
      });
    }

    // Build summary
    const summaryLines = [];
    let totalLogs = 0;
    for (const [userId, entries] of byUser) {
      const mutual = entries.filter(e => e.type === 'Mutual').length;
      const partner = entries.filter(e => e.type === 'Partner').length;
      totalLogs += entries.length;
      summaryLines.push(
        '<@' + userId + '> — **' + entries.length + '** log(s) (M:' + mutual + ' / P:' + partner + ') → thread `' + threadByUser.get(userId) + '`'
      );
    }

    const jobId = 'AL' + Date.now().toString(36).toUpperCase();
    pendingJobs.set(jobId, {
      byUser: Object.fromEntries(byUser),
      threadByUser: Object.fromEntries(threadByUser),
      sourceChannelId: channel.id,
      guildId: interaction.guildId,
      requesterId: interaction.user.id,
      expires: Date.now() + 15 * 60 * 1000
    });

    // Cleanup old jobs
    for (const [k, v] of pendingJobs) {
      if (v.expires < Date.now()) pendingJobs.delete(k);
    }

    const embed = baseEmbed()
      .setColor(SUCCESS_COLOR)
      .setTitle('Auto Log — Calculated')
      .setDescription(
        'Scanned **' + collected.length + '** messages in <#' + channel.id + '>.\n' +
        'Found **' + totalLogs + '** log(s) across **' + byUser.size + '** staff member(s).\n\n' +
        summaryLines.join('\n').slice(0, 3500) + '\n\n' +
        'Click **Approve & Import** to post each log into that staff member\'s log thread and save it to the database.\n' +
        'Nothing is written until you approve.'
      )
      .setFooter({ text: 'Job ' + jobId + ' · expires in 15 minutes' });

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('auto_log_approve_' + jobId)
        .setLabel('Approve & Import')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId('auto_log_cancel_' + jobId)
        .setLabel('Cancel')
        .setStyle(ButtonStyle.Secondary)
    );

    return interaction.editReply({ embeds: [embed], components: [row] });
  }
};

function detectType(text) {
  const t = (text || '').toLowerCase();
  if (/partner|partnership|\bcollab\b/.test(t) && !/mutual/.test(t)) return 'Partner';
  if (/mutual|giveaway|gw\b/.test(t)) return 'Mutual';
  if (/partner|partnership/.test(t)) return 'Partner';
  return 'Mutual';
}

function extractInvite(text) {
  const m = (text || '').match(/(?:https?:\/\/)?(?:discord\.gg|discord\.com\/invite)\/([A-Za-z0-9-]+)/i);
  return m ? ('https://discord.gg/' + m[1]) : null;
}
