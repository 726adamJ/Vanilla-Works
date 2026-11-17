const {
  MessageFlags,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle
} = require('discord.js');
const { hasStaffRole, canApproveRequests } = require('../utils/permissions');
const { dmEmbed, baseEmbed, statusColor, SUCCESS_COLOR, DANGER_COLOR } = require('../utils/embeds');

const tempData = new Map();

module.exports = {
  name: 'interactionCreate',
  async execute(interaction, client) {
    if (!client.tempData) client.tempData = tempData;
    try {
      if (interaction.isChatInputCommand()) {
        const command = client.commands.get(interaction.commandName);
        if (!command) return;
        await command.execute(interaction, client);
        return;
      }
      if (interaction.isButton()) return handleButton(interaction, client);
      if (interaction.isModalSubmit()) return handleModal(interaction, client);
    } catch (error) {
      console.error('Interaction error:', error);
      const payload = { content: 'An unexpected error occurred. Please try again or contact management.', flags: MessageFlags.Ephemeral };
      if (interaction.replied || interaction.deferred) await interaction.followUp(payload).catch(() => {});
      else await interaction.reply(payload).catch(() => {});
    }
  }
};

function pingContent(roleId) {
  return roleId ? '<@&' + roleId + '>' : null;
}

async function handleButton(interaction, client) {
  const id = interaction.customId;

  if (id === 'pr_post_request') {
    if (!hasStaffRole(interaction.member)) {
      return interaction.reply({ content: 'You do not have permission to use this feature.', flags: MessageFlags.Ephemeral });
    }
    const { requestTypeSelect } = require('../utils/embeds');
    return interaction.reply({
      content: 'Select the type of request you would like to submit:',
      components: [requestTypeSelect()],
      flags: MessageFlags.Ephemeral
    });
  }

  if (id === 'request_mutual') {
    const modal = new ModalBuilder().setCustomId('modal_mutual_giveaway').setTitle('Mutual Giveaway Request');
    const fields = [
      { id: 'invite', label: 'Discord Server Invite' },
      { id: 'prize', label: 'Their Prize' },
      { id: 'their_ping', label: 'Their Ping (role/user)' },
      { id: 'our_ping', label: 'Our Ping (role/user)' },
      { id: 'duration', label: 'Duration (+ winners e.g. 24h, 3 winners)' }
    ];
    modal.addComponents(...fields.map(f =>
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId(f.id).setLabel(f.label).setStyle(TextInputStyle.Short).setRequired(true)
      )
    ));
    return interaction.showModal(modal);
  }

  if (id === 'request_partnership') {
    const modal = new ModalBuilder().setCustomId('modal_partnership').setTitle('Partnership Request');
    modal.addComponents(
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('server_name').setLabel('Server Name').setStyle(TextInputStyle.Short).setRequired(true)),
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('our_ping').setLabel('Our Ping').setStyle(TextInputStyle.Short).setRequired(true)),
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('their_ping').setLabel('Their Ping').setStyle(TextInputStyle.Short).setRequired(true)),
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('partners_ad').setLabel('Partners Ad').setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(4000))
    );
    return interaction.showModal(modal);
  }

  if (id === 'pr_log_outreach') {
    if (!hasStaffRole(interaction.member)) {
      return interaction.reply({ content: 'You do not have permission to use this feature.', flags: MessageFlags.Ephemeral });
    }
    const modal = new ModalBuilder().setCustomId('modal_outreach').setTitle('Log Outreach');
    modal.addComponents(
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('server_invite').setLabel('Server Invite').setStyle(TextInputStyle.Short).setRequired(true)),
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('pings').setLabel('Pings Used').setStyle(TextInputStyle.Short).setRequired(true)),
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('type').setLabel('Type (Mutual or Partner)').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('Mutual or Partner')),
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('evidence_link').setLabel('Evidence Link (optional)').setStyle(TextInputStyle.Short).setRequired(false).setPlaceholder('https://...'))
    );
    return interaction.showModal(modal);
  }

  if (id === 'pr_total_outreach') {
    if (!hasStaffRole(interaction.member)) {
      return interaction.reply({ content: 'You do not have permission to use this feature.', flags: MessageFlags.Ephemeral });
    }
    return showTotalOutreach(interaction);
  }

  if (id === 'pr_request_blacklist') {
    if (!hasStaffRole(interaction.member)) {
      return interaction.reply({ content: 'You do not have permission to use this feature.', flags: MessageFlags.Ephemeral });
    }
    const modal = new ModalBuilder().setCustomId('modal_blacklist').setTitle('Request a Blacklist');
    modal.addComponents(
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('server_name').setLabel('Server Name').setStyle(TextInputStyle.Short).setRequired(true)),
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('server_link').setLabel('Server Link / Invite').setStyle(TextInputStyle.Short).setRequired(true)),
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('reason').setLabel('Reason for requesting blacklist').setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(1000)),
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('incident_date').setLabel('Date this incident occurred').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('e.g. 2026-11-15')),
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('evidence_link').setLabel('Evidence Link (optional)').setStyle(TextInputStyle.Short).setRequired(false))
    );
    return interaction.showModal(modal);
  }

  if (id.startsWith('approve_req_')) return handleApprove(interaction, id.replace('approve_req_', ''), client);
  if (id.startsWith('reject_req_')) {
    const reqId = id.replace('reject_req_', '');
    const modal = new ModalBuilder().setCustomId('modal_reject_' + reqId).setTitle('Rejection Reason');
    modal.addComponents(new ActionRowBuilder().addComponents(
      new TextInputBuilder().setCustomId('reason').setLabel('Reason for rejection').setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(1000)
    ));
    return interaction.showModal(modal);
  }

  if (id.startsWith('approve_bl_')) return handleBlacklistApprove(interaction, id.replace('approve_bl_', ''), client);
  if (id.startsWith('reject_bl_')) {
    const blId = id.replace('reject_bl_', '');
    const modal = new ModalBuilder().setCustomId('modal_reject_bl_' + blId).setTitle('Blacklist Rejection Reason');
    modal.addComponents(new ActionRowBuilder().addComponents(
      new TextInputBuilder().setCustomId('reason').setLabel('Reason for rejection').setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(1000)
    ));
    return interaction.showModal(modal);
  }
}

async function handleModal(interaction, client) {
  const id = interaction.customId;
  if (id === 'modal_mutual_giveaway') return handleMutualSubmit(interaction, client);
  if (id === 'modal_partnership') return handlePartnershipSubmit(interaction, client);
  if (id === 'modal_outreach') return handleOutreachSubmit(interaction, client);
  if (id === 'modal_blacklist') return handleBlacklistSubmit(interaction, client);
  if (id.startsWith('modal_reject_bl_')) return handleBlacklistReject(interaction, id.replace('modal_reject_bl_', ''), client);
  if (id.startsWith('modal_reject_')) return handleReject(interaction, id.replace('modal_reject_', ''), client);
}

async function showTotalOutreach(interaction) {
  const { db } = require('../database');
  const userId = interaction.user.id;
  const mutual = db.prepare("SELECT COUNT(*) as c FROM outreach_logs WHERE user_id = ? AND type = 'Mutual'").get(userId)?.c || 0;
  const partner = db.prepare("SELECT COUNT(*) as c FROM outreach_logs WHERE user_id = ? AND type = 'Partner'").get(userId)?.c || 0;
  const total = mutual + partner;
  const embed = baseEmbed()
    .setColor(0x000000)
    .setTitle("Your Total Outreach's")
    .setDescription('Here is a summary of all outreach you have logged:')
    .addFields(
      { name: 'Mutual Giveaways', value: '**' + mutual + '**', inline: true },
      { name: 'Partnerships', value: '**' + partner + '**', inline: true },
      { name: 'Total Logged', value: '**' + total + '**', inline: true }
    )
    .setFooter({ text: 'Staff: ' + interaction.user.tag });
  return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
}

// ===================== REQUESTS =====================

async function handleMutualSubmit(interaction, client) {
  const { db, getConfig } = require('../database');
  const { generateRequestId } = require('../utils/ids');

  const durationRaw = interaction.fields.getTextInputValue('duration');
  let winners = '1';
  const m = durationRaw.match(/(\d+)\s*winners?/i);
  if (m) winners = m[1];

  const data = {
    invite: interaction.fields.getTextInputValue('invite'),
    prize: interaction.fields.getTextInputValue('prize'),
    their_ping: interaction.fields.getTextInputValue('their_ping'),
    our_ping: interaction.fields.getTextInputValue('our_ping'),
    duration: durationRaw,
    winners
  };

  const reqId = generateRequestId();
  const submitter = interaction.user;

  db.prepare("INSERT INTO requests (id, type, submitter_id, status, data) VALUES (?, 'mutual_giveaway', ?, 'pending', ?)").run(reqId, submitter.id, JSON.stringify(data));

  const approvalChannelId = getConfig('approval_channel');
  if (!approvalChannelId) {
    return interaction.reply({ content: 'Approval channel is not configured. Ask an admin to set it with /config.', flags: MessageFlags.Ephemeral });
  }

  const channel = await client.channels.fetch(approvalChannelId).catch(() => null);
  if (!channel) {
    return interaction.reply({ content: 'Could not find the approval channel.', flags: MessageFlags.Ephemeral });
  }

  const embed = baseEmbed()
    .setColor(statusColor('pending'))
    .setTitle('Mutual Giveaway Request')
    .setDescription('**Request ID:** `' + reqId + '`\n**Status:** Pending Approval')
    .addFields(
      { name: 'Submitted by', value: '<@' + submitter.id + '>', inline: true },
      { name: 'Server Invite', value: data.invite },
      { name: 'Their Prize', value: data.prize, inline: true },
      { name: 'Duration', value: data.duration, inline: true },
      { name: 'Winners', value: data.winners, inline: true },
      { name: 'Their Ping', value: data.their_ping, inline: true },
      { name: 'Our Ping', value: data.our_ping, inline: true }
    );

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('approve_req_' + reqId).setLabel('Approve').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('reject_req_' + reqId).setLabel('Reject').setStyle(ButtonStyle.Danger)
  );

  const content = pingContent(getConfig('request_ping_role'));
  const msg = await channel.send({ content, embeds: [embed], components: [row] });
  db.prepare('UPDATE requests SET message_id = ?, channel_id = ? WHERE id = ?').run(msg.id, channel.id, reqId);

  await interaction.reply({
    content: 'Your Mutual Giveaway request has been submitted.\n**Reference ID:** `' + reqId + '`',
    flags: MessageFlags.Ephemeral
  });

  try {
    await submitter.send({
      embeds: [dmEmbed('Request Submitted', 'Your **Mutual Giveaway** request (`' + reqId + '`) has been submitted and is pending approval.', 0xF39C12)]
    });
  } catch {}
}

async function handlePartnershipSubmit(interaction, client) {
  const { db, getConfig } = require('../database');
  const { generateRequestId } = require('../utils/ids');

  const data = {
    server_name: interaction.fields.getTextInputValue('server_name'),
    our_ping: interaction.fields.getTextInputValue('our_ping'),
    their_ping: interaction.fields.getTextInputValue('their_ping'),
    partners_ad: interaction.fields.getTextInputValue('partners_ad')
  };

  const reqId = generateRequestId();
  const submitter = interaction.user;

  db.prepare("INSERT INTO requests (id, type, submitter_id, status, data) VALUES (?, 'partnership', ?, 'pending', ?)").run(reqId, submitter.id, JSON.stringify(data));

  const approvalChannelId = getConfig('approval_channel');
  if (!approvalChannelId) {
    return interaction.reply({ content: 'Approval channel is not configured.', flags: MessageFlags.Ephemeral });
  }

  const channel = await client.channels.fetch(approvalChannelId).catch(() => null);
  if (!channel) {
    return interaction.reply({ content: 'Could not find the approval channel.', flags: MessageFlags.Ephemeral });
  }

  const embed = baseEmbed()
    .setColor(statusColor('pending'))
    .setTitle('Partnership Request')
    .setDescription('**Request ID:** `' + reqId + '`\n**Status:** Pending Approval')
    .addFields(
      { name: 'Submitted by', value: '<@' + submitter.id + '>', inline: true },
      { name: 'Server Name', value: data.server_name, inline: true },
      { name: 'Our Ping', value: data.our_ping, inline: true },
      { name: 'Their Ping', value: data.their_ping, inline: true },
      { name: 'Partners Ad', value: data.partners_ad.slice(0, 1024) || '—' }
    );

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('approve_req_' + reqId).setLabel('Approve').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('reject_req_' + reqId).setLabel('Reject').setStyle(ButtonStyle.Danger)
  );

  const content = pingContent(getConfig('request_ping_role'));
  const msg = await channel.send({ content, embeds: [embed], components: [row] });
  db.prepare('UPDATE requests SET message_id = ?, channel_id = ? WHERE id = ?').run(msg.id, channel.id, reqId);

  await interaction.reply({
    content: 'Your Partnership request has been submitted.\n**Reference ID:** `' + reqId + '`',
    flags: MessageFlags.Ephemeral
  });

  try {
    await submitter.send({
      embeds: [dmEmbed('Request Submitted', 'Your **Partnership** request (`' + reqId + '`) has been submitted and is pending approval.', 0xF39C12)]
    });
  } catch {}
}

async function handleApprove(interaction, reqId, client) {
  const { db } = require('../database');
  if (!canApproveRequests(interaction.member)) {
    return interaction.reply({ content: 'Only authorised management can approve requests.', flags: MessageFlags.Ephemeral });
  }

  const req = db.prepare('SELECT * FROM requests WHERE id = ?').get(reqId);
  if (!req) return interaction.reply({ content: 'Request not found.', flags: MessageFlags.Ephemeral });
  if (req.status !== 'pending') {
    return interaction.reply({ content: 'This request has already been ' + req.status + '.', flags: MessageFlags.Ephemeral });
  }

  db.prepare("UPDATE requests SET status = 'approved', manager_id = ?, processed_at = datetime('now') WHERE id = ?").run(interaction.user.id, reqId);

  try {
    const channel = await client.channels.fetch(req.channel_id);
    const msg = await channel.messages.fetch(req.message_id);
    const data = JSON.parse(req.data);
    const embed = baseEmbed()
      .setColor(statusColor('approved'))
      .setTitle(req.type === 'mutual_giveaway' ? 'Mutual Giveaway Request' : 'Partnership Request')
      .setDescription('**Request ID:** `' + reqId + '`\n**Status:** Approved by <@' + interaction.user.id + '>');

    if (req.type === 'mutual_giveaway') {
      embed.addFields(
        { name: 'Submitted by', value: '<@' + req.submitter_id + '>', inline: true },
        { name: 'Server Invite', value: data.invite },
        { name: 'Prize', value: data.prize, inline: true },
        { name: 'Duration', value: data.duration, inline: true }
      );
    } else {
      embed.addFields(
        { name: 'Submitted by', value: '<@' + req.submitter_id + '>', inline: true },
        { name: 'Server Name', value: data.server_name },
        { name: 'Partners Ad', value: (data.partners_ad || '').slice(0, 1024) }
      );
    }
    await msg.edit({ embeds: [embed], components: [] });
  } catch (e) { console.error(e); }

  try {
    const user = await client.users.fetch(req.submitter_id);
    await user.send({
      embeds: [dmEmbed('Request Approved', 'Your request **' + reqId + '** has been **approved**.\nProcessed by: ' + interaction.user.tag, SUCCESS_COLOR)]
    });
  } catch {}

  await interaction.reply({ content: 'Request ' + reqId + ' has been approved.', flags: MessageFlags.Ephemeral });
}

async function handleReject(interaction, reqId, client) {
  const { db } = require('../database');
  if (!canApproveRequests(interaction.member)) {
    return interaction.reply({ content: 'Only authorised management can reject requests.', flags: MessageFlags.Ephemeral });
  }

  const reason = interaction.fields.getTextInputValue('reason');
  const req = db.prepare('SELECT * FROM requests WHERE id = ?').get(reqId);
  if (!req) return interaction.reply({ content: 'Request not found.', flags: MessageFlags.Ephemeral });
  if (req.status !== 'pending') {
    return interaction.reply({ content: 'This request has already been ' + req.status + '.', flags: MessageFlags.Ephemeral });
  }

  db.prepare("UPDATE requests SET status = 'rejected', manager_id = ?, rejection_reason = ?, processed_at = datetime('now') WHERE id = ?").run(interaction.user.id, reason, reqId);

  try {
    const channel = await client.channels.fetch(req.channel_id);
    const msg = await channel.messages.fetch(req.message_id);
    const embed = baseEmbed()
      .setColor(statusColor('rejected'))
      .setTitle(req.type === 'mutual_giveaway' ? 'Mutual Giveaway Request' : 'Partnership Request')
      .setDescription('**Request ID:** `' + reqId + '`\n**Status:** Rejected by <@' + interaction.user.id + '>\n**Reason:** ' + reason);
    await msg.edit({ embeds: [embed], components: [] });
  } catch (e) { console.error(e); }

  try {
    const user = await client.users.fetch(req.submitter_id);
    await user.send({
      embeds: [dmEmbed('Request Rejected', 'Your request **' + reqId + '** has been **rejected**.\n**Reason:** ' + reason + '\nProcessed by: ' + interaction.user.tag, DANGER_COLOR)]
    });
  } catch {}

  await interaction.reply({ content: 'Request ' + reqId + ' has been rejected.', flags: MessageFlags.Ephemeral });
}

// ===================== LOG OUTREACH (FIXED) =====================
// No longer requires a personal staff thread.
// Posts to outreach_channel, or falls back to approval_channel.

async function handleOutreachSubmit(interaction, client) {
  const { db, getConfig } = require('../database');
  const { generateLogId } = require('../utils/ids');

  const serverInvite = interaction.fields.getTextInputValue('server_invite');
  const pings = interaction.fields.getTextInputValue('pings');
  let type = interaction.fields.getTextInputValue('type').trim();
  const evidenceLink = (interaction.fields.getTextInputValue('evidence_link') || '').trim() || null;

  if (!['Mutual', 'Partner'].includes(type)) {
    type = type.toLowerCase().includes('partner') ? 'Partner' : 'Mutual';
  }

  const userId = interaction.user.id;
  const logId = generateLogId();

  // Prefer personal thread if assigned, otherwise use outreach_channel / approval_channel
  let targetChannel = null;
  const assignment = db.prepare('SELECT thread_id FROM staff_threads WHERE user_id = ?').get(userId);

  if (assignment && assignment.thread_id) {
    targetChannel = await client.channels.fetch(assignment.thread_id).catch(() => null);
  }

  if (!targetChannel) {
    const channelId = getConfig('outreach_channel') || getConfig('approval_channel');
    if (!channelId) {
      return interaction.reply({
        content: 'No outreach log channel is configured. Ask an admin to set **Outreach Log Channel** with /config.',
        flags: MessageFlags.Ephemeral
      });
    }
    targetChannel = await client.channels.fetch(channelId).catch(() => null);
  }

  if (!targetChannel) {
    return interaction.reply({
      content: 'Could not find the outreach log channel. Please contact management.',
      flags: MessageFlags.Ephemeral
    });
  }

  const embed = baseEmbed()
    .setColor(0x000000)
    .setTitle('Outreach Log')
    .setDescription('**Log ID:** `' + logId + '`')
    .addFields(
      { name: 'Staff', value: '<@' + userId + '>', inline: true },
      { name: 'Type', value: type, inline: true },
      { name: 'Server Invite', value: serverInvite },
      { name: 'Pings Used', value: pings }
    );

  if (evidenceLink) {
    embed.addFields({ name: 'Evidence', value: '[View Evidence](' + evidenceLink + ')' });
    if (/\.(png|jpe?g|gif|webp)/i.test(evidenceLink) || evidenceLink.includes('media.discordapp') || evidenceLink.includes('cdn.discordapp')) {
      embed.setImage(evidenceLink);
    }
  }

  const content = pingContent(getConfig('outreach_ping_role'));
  const msg = await targetChannel.send({ content, embeds: [embed] });

  db.prepare(
    'INSERT INTO outreach_logs (id, user_id, server_invite, pings, type, evidence_url, thread_id, message_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(logId, userId, serverInvite, pings, type, evidenceLink, targetChannel.id, msg.id);

  const confirmEmbed = dmEmbed(
    'Outreach Logged',
    'Your outreach has been recorded.\n**Log ID:** `' + logId + '`\n**Type:** ' + type,
    SUCCESS_COLOR
  );

  await interaction.reply({ embeds: [confirmEmbed], flags: MessageFlags.Ephemeral });

  try {
    const user = await client.users.fetch(userId);
    await user.send({ embeds: [confirmEmbed] });
  } catch {}
}

// ===================== BLACKLIST =====================

async function handleBlacklistSubmit(interaction, client) {
  const { db, getConfig } = require('../database');
  const { generateBlacklistId } = require('../utils/ids');

  const serverName = interaction.fields.getTextInputValue('server_name');
  const serverLink = interaction.fields.getTextInputValue('server_link');
  const reason = interaction.fields.getTextInputValue('reason');
  const incidentDate = interaction.fields.getTextInputValue('incident_date');
  const evidenceLink = (interaction.fields.getTextInputValue('evidence_link') || '').trim() || null;

  const userId = interaction.user.id;
  const blId = generateBlacklistId();
  const evidenceArr = evidenceLink ? [evidenceLink] : [];

  db.prepare(
    "INSERT INTO blacklist_requests (id, submitter_id, server_name, server_link, reason, incident_date, evidence_urls, status) VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')"
  ).run(blId, userId, serverName, serverLink, reason, incidentDate, JSON.stringify(evidenceArr));

  const channelId = getConfig('blacklist_channel') || getConfig('approval_channel');
  if (!channelId) {
    return interaction.reply({ content: 'No blacklist/approval channel configured. Ask an admin to set it with /config.', flags: MessageFlags.Ephemeral });
  }

  const channel = await client.channels.fetch(channelId).catch(() => null);
  if (!channel) {
    return interaction.reply({ content: 'Could not find the blacklist channel.', flags: MessageFlags.Ephemeral });
  }

  const embed = baseEmbed()
    .setColor(statusColor('pending'))
    .setTitle('Blacklist Request')
    .setDescription('**Request ID:** `' + blId + '`\n**Status:** Pending Review')
    .addFields(
      { name: 'Submitted by', value: '<@' + userId + '>', inline: true },
      { name: 'Server Name', value: serverName, inline: true },
      { name: 'Server Link', value: serverLink },
      { name: 'Incident Date', value: incidentDate, inline: true },
      { name: 'Reason', value: reason.slice(0, 1024) }
    );

  if (evidenceLink) {
    embed.addFields({ name: 'Evidence', value: '[View Evidence](' + evidenceLink + ')' });
    if (/\.(png|jpe?g|gif|webp)/i.test(evidenceLink) || evidenceLink.includes('media.discordapp')) {
      embed.setImage(evidenceLink);
    }
  }

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('approve_bl_' + blId).setLabel('Approve Blacklist').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId('reject_bl_' + blId).setLabel('Reject').setStyle(ButtonStyle.Secondary)
  );

  const content = pingContent(getConfig('blacklist_ping_role'));
  const msg = await channel.send({ content, embeds: [embed], components: [row] });
  db.prepare('UPDATE blacklist_requests SET message_id = ?, channel_id = ? WHERE id = ?').run(msg.id, channel.id, blId);

  await interaction.reply({
    embeds: [dmEmbed('Blacklist Request Submitted', 'Your blacklist request **' + blId + '** for **' + serverName + '** has been submitted for review.', 0xF39C12)],
    flags: MessageFlags.Ephemeral
  });

  try {
    const user = await client.users.fetch(userId);
    await user.send({
      embeds: [dmEmbed('Blacklist Request Submitted', 'Your blacklist request (`' + blId + '`) for **' + serverName + '** is pending review.', 0xF39C12)]
    });
  } catch {}
}

async function handleBlacklistApprove(interaction, blId, client) {
  const { db } = require('../database');
  if (!canApproveRequests(interaction.member)) {
    return interaction.reply({ content: 'Only management can approve blacklist requests.', flags: MessageFlags.Ephemeral });
  }

  const req = db.prepare('SELECT * FROM blacklist_requests WHERE id = ?').get(blId);
  if (!req) return interaction.reply({ content: 'Blacklist request not found.', flags: MessageFlags.Ephemeral });
  if (req.status !== 'pending') {
    return interaction.reply({ content: 'This request has already been ' + req.status + '.', flags: MessageFlags.Ephemeral });
  }

  db.prepare("UPDATE blacklist_requests SET status = 'approved', manager_id = ?, processed_at = datetime('now') WHERE id = ?").run(interaction.user.id, blId);

  try {
    const channel = await client.channels.fetch(req.channel_id);
    const msg = await channel.messages.fetch(req.message_id);
    const embed = baseEmbed()
      .setColor(statusColor('approved'))
      .setTitle('Blacklist Request — APPROVED')
      .setDescription('**Request ID:** `' + blId + '`\n**Status:** Approved by <@' + interaction.user.id + '>')
      .addFields(
        { name: 'Server Name', value: req.server_name },
        { name: 'Server Link', value: req.server_link },
        { name: 'Reason', value: req.reason.slice(0, 1024) }
      );
    await msg.edit({ embeds: [embed], components: [] });
  } catch (e) { console.error(e); }

  try {
    const user = await client.users.fetch(req.submitter_id);
    await user.send({
      embeds: [dmEmbed('Blacklist Approved', 'Your blacklist request **' + blId + '** for **' + req.server_name + '** has been **approved**.', SUCCESS_COLOR)]
    });
  } catch {}

  await interaction.reply({ content: 'Blacklist request ' + blId + ' has been approved.', flags: MessageFlags.Ephemeral });
}

async function handleBlacklistReject(interaction, blId, client) {
  const { db } = require('../database');
  if (!canApproveRequests(interaction.member)) {
    return interaction.reply({ content: 'Only management can reject blacklist requests.', flags: MessageFlags.Ephemeral });
  }

  const reason = interaction.fields.getTextInputValue('reason');
  const req = db.prepare('SELECT * FROM blacklist_requests WHERE id = ?').get(blId);
  if (!req) return interaction.reply({ content: 'Blacklist request not found.', flags: MessageFlags.Ephemeral });
  if (req.status !== 'pending') {
    return interaction.reply({ content: 'This request has already been ' + req.status + '.', flags: MessageFlags.Ephemeral });
  }

  db.prepare("UPDATE blacklist_requests SET status = 'rejected', manager_id = ?, rejection_reason = ?, processed_at = datetime('now') WHERE id = ?").run(interaction.user.id, reason, blId);

  try {
    const channel = await client.channels.fetch(req.channel_id);
    const msg = await channel.messages.fetch(req.message_id);
    const embed = baseEmbed()
      .setColor(statusColor('rejected'))
      .setTitle('Blacklist Request — REJECTED')
      .setDescription('**Request ID:** `' + blId + '`\n**Status:** Rejected by <@' + interaction.user.id + '>\n**Reason:** ' + reason);
    await msg.edit({ embeds: [embed], components: [] });
  } catch (e) { console.error(e); }

  try {
    const user = await client.users.fetch(req.submitter_id);
    await user.send({
      embeds: [dmEmbed('Blacklist Rejected', 'Your blacklist request **' + blId + '** for **' + req.server_name + '** has been **rejected**.\n**Reason:** ' + reason, DANGER_COLOR)]
    });
  } catch {}

  await interaction.reply({ content: 'Blacklist request ' + blId + ' has been rejected.', flags: MessageFlags.Ephemeral });
}
