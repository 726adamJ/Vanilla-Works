const {
  MessageFlags,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle
} = require('discord.js');
const { hasStaffRole, canApproveRequests, canUseSlashCommands, getStaffRank, getPayRates } = require('../utils/permissions');
const { dmEmbed, baseEmbed, statusColor, SUCCESS_COLOR, DANGER_COLOR, logTypeSelect } = require('../utils/embeds');

const tempData = new Map();

module.exports = {
  name: 'interactionCreate',
  async execute(interaction, client) {
    if (!client.tempData) client.tempData = tempData;
    try {
      if (interaction.isChatInputCommand()) {
        if (!canUseSlashCommands(interaction.member)) {
          return interaction.reply({
            content: 'Only management can use slash commands. Staff should use the panel buttons.',
            flags: MessageFlags.Ephemeral
          });
        }
        const command = client.commands.get(interaction.commandName);
        if (!command) return;
        await command.execute(interaction, client);
        return;
      }
      if (interaction.isButton()) return handleButton(interaction, client);
      if (interaction.isModalSubmit()) return handleModal(interaction, client);
    } catch (error) {
      console.error('Interaction error:', error);
      const payload = {
        content: 'An unexpected error occurred. Please try again or contact management.',
        flags: MessageFlags.Ephemeral
      };
      if (interaction.replied || interaction.deferred) await interaction.followUp(payload).catch(() => {});
      else await interaction.reply(payload).catch(() => {});
    }
  }
};

function pingContent(roleId) {
  return roleId ? '<@&' + roleId + '>' : null;
}

function messageLink(guildId, channelId, messageId) {
  if (!guildId || !channelId || !messageId) return null;
  return 'https://discord.com/channels/' + guildId + '/' + channelId + '/' + messageId;
}

async function handleButton(interaction, client) {
  const id = interaction.customId;

  if (id === 'pr_post_request') {
    if (!hasStaffRole(interaction.member)) return interaction.reply({ content: 'You do not have permission.', flags: MessageFlags.Ephemeral });
    const { requestTypeSelect } = require('../utils/embeds');
    return interaction.reply({ content: 'Select the type of request:', components: [requestTypeSelect()], flags: MessageFlags.Ephemeral });
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
    modal.addComponents(...fields.map(f => new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId(f.id).setLabel(f.label).setStyle(TextInputStyle.Short).setRequired(true))));
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
    if (!hasStaffRole(interaction.member)) return interaction.reply({ content: 'You do not have permission.', flags: MessageFlags.Ephemeral });
    return interaction.reply({ content: 'What type of outreach are you logging?', components: [logTypeSelect()], flags: MessageFlags.Ephemeral });
  }

  if (id === 'log_type_mutual' || id === 'log_type_partner') {
    if (!hasStaffRole(interaction.member)) return interaction.reply({ content: 'You do not have permission.', flags: MessageFlags.Ephemeral });
    const logType = id === 'log_type_mutual' ? 'Mutual' : 'Partner';
    client.tempData.set('logtype_' + interaction.user.id, logType);
    const modal = new ModalBuilder().setCustomId('modal_outreach').setTitle('Log ' + logType + ' Outreach');
    modal.addComponents(
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('server_invite').setLabel('Server Invite').setStyle(TextInputStyle.Short).setRequired(true)),
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('pings').setLabel('Pings Used').setStyle(TextInputStyle.Short).setRequired(true)),
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('evidence_link').setLabel('Evidence Link (optional)').setStyle(TextInputStyle.Short).setRequired(false).setPlaceholder('https://...'))
    );
    return interaction.showModal(modal);
  }

  if (id === 'pr_total_outreach') {
    if (!hasStaffRole(interaction.member)) return interaction.reply({ content: 'You do not have permission.', flags: MessageFlags.Ephemeral });
    return showTotalOutreach(interaction);
  }

  if (id === 'pr_payment_request') {
    if (!hasStaffRole(interaction.member)) return interaction.reply({ content: 'You do not have permission.', flags: MessageFlags.Ephemeral });
    return startPaymentRequest(interaction, client);
  }

  if (id === 'pr_loa_request') {
    if (!hasStaffRole(interaction.member)) return interaction.reply({ content: 'You do not have permission.', flags: MessageFlags.Ephemeral });
    const modal = new ModalBuilder().setCustomId('modal_loa').setTitle('LOA Request');
    modal.addComponents(
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('username').setLabel('Username').setStyle(TextInputStyle.Short).setRequired(true)),
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('length').setLabel('Length of LOA').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('e.g. 7 days, 2 weeks')),
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('reason').setLabel('Reason of LOA').setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(1000))
    );
    return interaction.showModal(modal);
  }

  if (id === 'pr_request_blacklist') {
    if (!hasStaffRole(interaction.member)) return interaction.reply({ content: 'You do not have permission.', flags: MessageFlags.Ephemeral });
    const modal = new ModalBuilder().setCustomId('modal_blacklist').setTitle('Request a Blacklist');
    modal.addComponents(
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('server_name').setLabel('Server Name').setStyle(TextInputStyle.Short).setRequired(true)),
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('server_link').setLabel('Server Link / Invite').setStyle(TextInputStyle.Short).setRequired(true)),
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('reason').setLabel('Reason for requesting blacklist').setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(1000)),
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('incident_date').setLabel('Date this incident occurred').setStyle(TextInputStyle.Short).setRequired(true)),
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('evidence_link').setLabel('Evidence Link (optional)').setStyle(TextInputStyle.Short).setRequired(false))
    );
    return interaction.showModal(modal);
  }

  if (id.startsWith('copy_')) {
    const payload = id.slice(5);
    const parts = payload.split('_');
    const fieldKey = parts.pop();
    const reqId = parts.join('_');
    return handleCopyField(interaction, reqId, fieldKey);
  }

  if (id.startsWith('approve_req_')) return handleApprove(interaction, id.replace('approve_req_', ''), client);
  if (id.startsWith('reject_req_')) {
    const reqId = id.replace('reject_req_', '');
    const modal = new ModalBuilder().setCustomId('modal_reject_' + reqId).setTitle('Rejection Reason');
    modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('reason').setLabel('Reason for rejection').setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(1000)));
    return interaction.showModal(modal);
  }

  if (id.startsWith('approve_bl_')) return handleBlacklistApprove(interaction, id.replace('approve_bl_', ''), client);
  if (id.startsWith('reject_bl_')) {
    const blId = id.replace('reject_bl_', '');
    const modal = new ModalBuilder().setCustomId('modal_reject_bl_' + blId).setTitle('Blacklist Rejection Reason');
    modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('reason').setLabel('Reason for rejection').setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(1000)));
    return interaction.showModal(modal);
  }

  if (id.startsWith('approve_pay_')) {
    const payId = id.replace('approve_pay_', '');
    const modal = new ModalBuilder().setCustomId('modal_approve_pay_' + payId).setTitle('Schedule Payment');
    modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('pay_date').setLabel('Date pay is scheduled').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('e.g. 2026-11-25')));
    return interaction.showModal(modal);
  }
  if (id.startsWith('reject_pay_')) {
    const payId = id.replace('reject_pay_', '');
    const modal = new ModalBuilder().setCustomId('modal_reject_pay_' + payId).setTitle('Payment Rejection Reason');
    modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('reason').setLabel('Reason for rejection').setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(1000)));
    return interaction.showModal(modal);
  }
  if (id.startsWith('paid_pay_')) return handlePaymentPaid(interaction, id.replace('paid_pay_', ''), client);

  if (id.startsWith('approve_loa_')) return handleLoaApprove(interaction, id.replace('approve_loa_', ''), client);
  if (id.startsWith('reject_loa_')) {
    const loaId = id.replace('reject_loa_', '');
    const modal = new ModalBuilder().setCustomId('modal_reject_loa_' + loaId).setTitle('LOA Rejection Reason');
    modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('reason').setLabel('Reason for rejection').setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(1000)));
    return interaction.showModal(modal);
  }
}

async function handleModal(interaction, client) {
  const id = interaction.customId;
  if (id === 'modal_mutual_giveaway') return handleMutualSubmit(interaction, client);
  if (id === 'modal_partnership') return handlePartnershipSubmit(interaction, client);
  if (id === 'modal_outreach') return handleOutreachSubmit(interaction, client);
  if (id === 'modal_blacklist') return handleBlacklistSubmit(interaction, client);
  if (id === 'modal_loa') return handleLoaSubmit(interaction, client);
  if (id === 'modal_payment') return handlePaymentSubmit(interaction, client);
  if (id.startsWith('modal_reject_bl_')) return handleBlacklistReject(interaction, id.replace('modal_reject_bl_', ''), client);
  if (id.startsWith('modal_reject_pay_')) return handlePaymentReject(interaction, id.replace('modal_reject_pay_', ''), client);
  if (id.startsWith('modal_approve_pay_')) return handlePaymentApprove(interaction, id.replace('modal_approve_pay_', ''), client);
  if (id.startsWith('modal_reject_loa_')) return handleLoaReject(interaction, id.replace('modal_reject_loa_', ''), client);
  if (id.startsWith('modal_reject_')) return handleReject(interaction, id.replace('modal_reject_', ''), client);
}

async function showTotalOutreach(interaction) {
  const { db } = require('../database');
  const userId = interaction.user.id;
  const mutual = db.prepare("SELECT COUNT(*) as c FROM outreach_logs WHERE user_id = ? AND type = 'Mutual'").get(userId)?.c || 0;
  const partner = db.prepare("SELECT COUNT(*) as c FROM outreach_logs WHERE user_id = ? AND type = 'Partner'").get(userId)?.c || 0;
  const total = mutual + partner;
  const embed = baseEmbed().setColor(0x000000).setTitle("Your Total Outreach's").setDescription('Based on your logged outreach only.')
    .addFields(
      { name: 'Mutual Giveaways', value: '**' + mutual + '**', inline: true },
      { name: 'Partnerships', value: '**' + partner + '**', inline: true },
      { name: 'Total Logged', value: '**' + total + '**', inline: true }
    ).setFooter({ text: 'Staff: ' + interaction.user.tag });
  return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
}

async function handleCopyField(interaction, reqId, fieldKey) {
  const { db } = require('../database');
  const req = db.prepare('SELECT * FROM requests WHERE id = ?').get(reqId);
  if (!req) return interaction.reply({ content: 'Request not found.', flags: MessageFlags.Ephemeral });
  let data; try { data = JSON.parse(req.data); } catch { data = {}; }
  const value = data[fieldKey];
  if (value === undefined || value === null || value === '') {
    return interaction.reply({ content: 'No value found for that field.', flags: MessageFlags.Ephemeral });
  }
  return interaction.reply({ content: '**' + fieldKey + '** — select and copy:\n```\n' + String(value) + '\n```', flags: MessageFlags.Ephemeral });
}

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
  if (!approvalChannelId) return interaction.reply({ content: 'Approval channel is not configured.', flags: MessageFlags.Ephemeral });
  const channel = await client.channels.fetch(approvalChannelId).catch(() => null);
  if (!channel) return interaction.reply({ content: 'Could not find approval channel.', flags: MessageFlags.Ephemeral });
  const embed = baseEmbed().setColor(statusColor('pending')).setTitle('Mutual Giveaway Request')
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
  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('approve_req_' + reqId).setLabel('Approve').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('reject_req_' + reqId).setLabel('Reject').setStyle(ButtonStyle.Danger)
  );
  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('copy_' + reqId + '_invite').setLabel('Copy Invite').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('copy_' + reqId + '_prize').setLabel('Copy Prize').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('copy_' + reqId + '_their_ping').setLabel('Copy Their Ping').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('copy_' + reqId + '_our_ping').setLabel('Copy Our Ping').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('copy_' + reqId + '_duration').setLabel('Copy Duration').setStyle(ButtonStyle.Secondary)
  );
  const content = pingContent(getConfig('request_ping_role'));
  const msg = await channel.send({ content, embeds: [embed], components: [row1, row2] });
  db.prepare('UPDATE requests SET message_id = ?, channel_id = ? WHERE id = ?').run(msg.id, channel.id, reqId);
  await interaction.reply({ content: 'Mutual Giveaway request submitted.\n**Reference ID:** `' + reqId + '`', flags: MessageFlags.Ephemeral });
  try { await submitter.send({ embeds: [dmEmbed('Request Submitted', 'Your Mutual Giveaway request (`' + reqId + '`) is pending approval.', 0xF39C12)] }); } catch {}
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
  if (!approvalChannelId) return interaction.reply({ content: 'Approval channel is not configured.', flags: MessageFlags.Ephemeral });
  const channel = await client.channels.fetch(approvalChannelId).catch(() => null);
  if (!channel) return interaction.reply({ content: 'Could not find approval channel.', flags: MessageFlags.Ephemeral });
  const embed = baseEmbed().setColor(statusColor('pending')).setTitle('Partnership Request')
    .setDescription('**Request ID:** `' + reqId + '`\n**Status:** Pending Approval')
    .addFields(
      { name: 'Submitted by', value: '<@' + submitter.id + '>', inline: true },
      { name: 'Server Name', value: data.server_name, inline: true },
      { name: 'Our Ping', value: data.our_ping, inline: true },
      { name: 'Their Ping', value: data.their_ping, inline: true },
      { name: 'Partners Ad', value: data.partners_ad.slice(0, 1024) || '—' }
    );
  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('approve_req_' + reqId).setLabel('Approve').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('reject_req_' + reqId).setLabel('Reject').setStyle(ButtonStyle.Danger)
  );
  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('copy_' + reqId + '_server_name').setLabel('Copy Server Name').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('copy_' + reqId + '_our_ping').setLabel('Copy Our Ping').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('copy_' + reqId + '_their_ping').setLabel('Copy Their Ping').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('copy_' + reqId + '_partners_ad').setLabel('Copy Partners Ad').setStyle(ButtonStyle.Secondary)
  );
  const content = pingContent(getConfig('request_ping_role'));
  const msg = await channel.send({ content, embeds: [embed], components: [row1, row2] });
  db.prepare('UPDATE requests SET message_id = ?, channel_id = ? WHERE id = ?').run(msg.id, channel.id, reqId);
  await interaction.reply({ content: 'Partnership request submitted.\n**Reference ID:** `' + reqId + '`', flags: MessageFlags.Ephemeral });
  try { await submitter.send({ embeds: [dmEmbed('Request Submitted', 'Your Partnership request (`' + reqId + '`) is pending approval.', 0xF39C12)] }); } catch {}
}

async function handleApprove(interaction, reqId, client) {
  const { db } = require('../database');
  if (!canApproveRequests(interaction.member)) return interaction.reply({ content: 'Only management can approve requests.', flags: MessageFlags.Ephemeral });
  const req = db.prepare('SELECT * FROM requests WHERE id = ?').get(reqId);
  if (!req) return interaction.reply({ content: 'Request not found.', flags: MessageFlags.Ephemeral });
  if (req.status !== 'pending') return interaction.reply({ content: 'Already ' + req.status + '.', flags: MessageFlags.Ephemeral });
  db.prepare("UPDATE requests SET status = 'approved', manager_id = ?, processed_at = datetime('now') WHERE id = ?").run(interaction.user.id, reqId);
  try {
    const channel = await client.channels.fetch(req.channel_id);
    const msg = await channel.messages.fetch(req.message_id);
    const data = JSON.parse(req.data);
    const embed = baseEmbed().setColor(statusColor('approved')).setTitle(req.type === 'mutual_giveaway' ? 'Mutual Giveaway Request' : 'Partnership Request')
      .setDescription('**Request ID:** `' + reqId + '`\n**Status:** Approved by <@' + interaction.user.id + '>');
    if (req.type === 'mutual_giveaway') {
      embed.addFields({ name: 'Submitted by', value: '<@' + req.submitter_id + '>', inline: true }, { name: 'Server Invite', value: data.invite }, { name: 'Prize', value: data.prize, inline: true }, { name: 'Duration', value: data.duration, inline: true });
    } else {
      embed.addFields({ name: 'Submitted by', value: '<@' + req.submitter_id + '>', inline: true }, { name: 'Server Name', value: data.server_name }, { name: 'Partners Ad', value: (data.partners_ad || '').slice(0, 1024) });
    }
    await msg.edit({ embeds: [embed], components: [] });
  } catch (e) { console.error(e); }
  try {
    const user = await client.users.fetch(req.submitter_id);
    await user.send({ embeds: [dmEmbed('Request Approved', 'Your request **' + reqId + '** was approved by ' + interaction.user.tag, SUCCESS_COLOR)] });
  } catch {}
  await interaction.reply({ content: 'Request ' + reqId + ' approved.', flags: MessageFlags.Ephemeral });
}

async function handleReject(interaction, reqId, client) {
  const { db } = require('../database');
  if (!canApproveRequests(interaction.member)) return interaction.reply({ content: 'Only management can reject requests.', flags: MessageFlags.Ephemeral });
  const reason = interaction.fields.getTextInputValue('reason');
  const req = db.prepare('SELECT * FROM requests WHERE id = ?').get(reqId);
  if (!req) return interaction.reply({ content: 'Request not found.', flags: MessageFlags.Ephemeral });
  if (req.status !== 'pending') return interaction.reply({ content: 'Already ' + req.status + '.', flags: MessageFlags.Ephemeral });
  db.prepare("UPDATE requests SET status = 'rejected', manager_id = ?, rejection_reason = ?, processed_at = datetime('now') WHERE id = ?").run(interaction.user.id, reason, reqId);
  try {
    const channel = await client.channels.fetch(req.channel_id);
    const msg = await channel.messages.fetch(req.message_id);
    const embed = baseEmbed().setColor(statusColor('rejected')).setTitle(req.type === 'mutual_giveaway' ? 'Mutual Giveaway Request' : 'Partnership Request')
      .setDescription('**Request ID:** `' + reqId + '`\n**Status:** Rejected by <@' + interaction.user.id + '>\n**Reason:** ' + reason);
    await msg.edit({ embeds: [embed], components: [] });
  } catch (e) { console.error(e); }
  try {
    const user = await client.users.fetch(req.submitter_id);
    await user.send({ embeds: [dmEmbed('Request Rejected', 'Your request **' + reqId + '** was rejected.\n**Reason:** ' + reason, DANGER_COLOR)] });
  } catch {}
  await interaction.reply({ content: 'Request ' + reqId + ' rejected.', flags: MessageFlags.Ephemeral });
}

async function handleOutreachSubmit(interaction, client) {
  const { db, getConfig } = require('../database');
  const { generateLogId } = require('../utils/ids');
  const serverInvite = interaction.fields.getTextInputValue('server_invite');
  const pings = interaction.fields.getTextInputValue('pings');
  const evidenceLink = (interaction.fields.getTextInputValue('evidence_link') || '').trim() || null;
  let type = client.tempData.get('logtype_' + interaction.user.id) || 'Mutual';
  client.tempData.delete('logtype_' + interaction.user.id);
  const userId = interaction.user.id;
  const logId = generateLogId();
  let targetChannel = null;
  const assignment = db.prepare('SELECT thread_id FROM staff_threads WHERE user_id = ?').get(userId);
  if (assignment && assignment.thread_id) {
    targetChannel = await client.channels.fetch(assignment.thread_id).catch(() => null);
  }
  if (!targetChannel) {
    const channelId = getConfig('outreach_channel') || getConfig('approval_channel');
    if (!channelId) {
      return interaction.reply({ content: 'No outreach log channel configured, and you have no personal log thread. Ask management to set Outreach Log Channel or assign a thread with /staff log.', flags: MessageFlags.Ephemeral });
    }
    targetChannel = await client.channels.fetch(channelId).catch(() => null);
  }
  if (!targetChannel) return interaction.reply({ content: 'Could not find the log channel/thread.', flags: MessageFlags.Ephemeral });
  const embed = baseEmbed().setColor(0x000000).setTitle('Outreach Log — ' + type).setDescription('**Log ID:** `' + logId + '`')
    .addFields(
      { name: 'Staff', value: '<@' + userId + '>', inline: true },
      { name: 'Type', value: type, inline: true },
      { name: 'Server Invite', value: serverInvite },
      { name: 'Pings Used', value: pings }
    );
  if (evidenceLink) {
    embed.addFields({ name: 'Evidence', value: '[View](' + evidenceLink + ')' });
    if (/\.(png|jpe?g|gif|webp)/i.test(evidenceLink) || evidenceLink.includes('media.discordapp') || evidenceLink.includes('cdn.discordapp')) embed.setImage(evidenceLink);
  }
  const content = pingContent(getConfig('outreach_ping_role'));
  const msg = await targetChannel.send({ content, embeds: [embed] });
  db.prepare('INSERT INTO outreach_logs (id, user_id, server_invite, pings, type, evidence_url, thread_id, message_id, channel_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run(logId, userId, serverInvite, pings, type, evidenceLink, targetChannel.id, msg.id, targetChannel.id);
  const confirmEmbed = dmEmbed('Outreach Logged', 'Logged successfully.\n**Log ID:** `' + logId + '`\n**Type:** ' + type, SUCCESS_COLOR);
  await interaction.reply({ embeds: [confirmEmbed], flags: MessageFlags.Ephemeral });
  try { const user = await client.users.fetch(userId); await user.send({ embeds: [confirmEmbed] }); } catch {}
}

async function startPaymentRequest(interaction, client) {
  const { db } = require('../database');
  const userId = interaction.user.id;
  const mutual = db.prepare("SELECT COUNT(*) as c FROM outreach_logs WHERE user_id = ? AND type = 'Mutual'").get(userId)?.c || 0;
  const partner = db.prepare("SELECT COUNT(*) as c FROM outreach_logs WHERE user_id = ? AND type = 'Partner'").get(userId)?.c || 0;
  const total = mutual + partner;
  if (total < 10) {
    return interaction.reply({ content: 'You are not eligible to request pay yet.\nYou need at least **10** outreach logs (Mutual + Partnership).\nYou currently have **' + total + '**.', flags: MessageFlags.Ephemeral });
  }
  const pending = db.prepare("SELECT id FROM payment_requests WHERE user_id = ? AND status IN ('pending','scheduled')").get(userId);
  if (pending) return interaction.reply({ content: 'You already have a payment request pending (`' + pending.id + '`).', flags: MessageFlags.Ephemeral });
  const modal = new ModalBuilder().setCustomId('modal_payment').setTitle('Payment Request');
  modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('roblox_username').setLabel('Roblox Username').setStyle(TextInputStyle.Short).setRequired(true)));
  return interaction.showModal(modal);
}

async function handlePaymentSubmit(interaction, client) {
  const { db, getConfig } = require('../database');
  const { generatePaymentId } = require('../utils/ids');
  const roblox = interaction.fields.getTextInputValue('roblox_username').trim();
  const userId = interaction.user.id;
  const rank = getStaffRank(interaction.member);
  const rates = getPayRates(rank);
  const logs = db.prepare('SELECT * FROM outreach_logs WHERE user_id = ? ORDER BY created_at ASC').all(userId);
  const mutual = logs.filter(l => l.type === 'Mutual').length;
  const partner = logs.filter(l => l.type === 'Partner').length;
  const total = mutual + partner;
  if (total < 10) return interaction.reply({ content: 'Not eligible. Need at least 10 logs. You have ' + total + '.', flags: MessageFlags.Ephemeral });
  const totalPay = (mutual * rates.mutual) + (partner * rates.partnership);
  const payId = generatePaymentId();
  const logIds = logs.map(l => l.id);
  const guildId = interaction.guildId;
  const linkLines = logs.slice(0, 25).map(l => {
    const link = messageLink(guildId, l.channel_id || l.thread_id, l.message_id);
    return link ? '[' + l.id + ' — ' + l.type + '](' + link + ')' : l.id + ' — ' + l.type;
  });
  if (logs.length > 25) linkLines.push('...and ' + (logs.length - 25) + ' more');
  db.prepare("INSERT INTO payment_requests (id, user_id, roblox_username, rank, mutual_count, partner_count, total_pay, log_ids, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending')").run(payId, userId, roblox, rank, mutual, partner, totalPay, JSON.stringify(logIds));
  const channelId = getConfig('payment_channel') || getConfig('approval_channel');
  if (!channelId) return interaction.reply({ content: 'Payment channel is not configured.', flags: MessageFlags.Ephemeral });
  const channel = await client.channels.fetch(channelId).catch(() => null);
  if (!channel) return interaction.reply({ content: 'Could not find payment channel.', flags: MessageFlags.Ephemeral });
  const embed = baseEmbed().setColor(statusColor('pending')).setTitle('Payment Request')
    .setDescription('**Pay Reference:** `' + payId + '`\n**Status:** Pending Review')
    .addFields(
      { name: 'Staff', value: '<@' + userId + '>', inline: true },
      { name: 'Roblox Username', value: roblox, inline: true },
      { name: 'Rank', value: rank + ' PR', inline: true },
      { name: 'Partnerships', value: String(partner) + ' x ' + rates.partnership + 'R$ = **' + (partner * rates.partnership) + 'R$**', inline: true },
      { name: 'Mutual Giveaways', value: String(mutual) + ' x ' + rates.mutual + 'R$ = **' + (mutual * rates.mutual) + 'R$**', inline: true },
      { name: 'Total Pay', value: '**' + totalPay + 'R$**', inline: true },
      { name: 'Log Links', value: linkLines.join('\n').slice(0, 1024) || 'None' }
    );
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('approve_pay_' + payId).setLabel('Approve & Schedule').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('reject_pay_' + payId).setLabel('Reject').setStyle(ButtonStyle.Danger)
  );
  const content = pingContent(getConfig('payment_ping_role'));
  const msg = await channel.send({ content, embeds: [embed], components: [row] });
  db.prepare('UPDATE payment_requests SET message_id = ?, channel_id = ? WHERE id = ?').run(msg.id, channel.id, payId);
  await interaction.reply({ embeds: [dmEmbed('Payment Request Submitted', '**Pay Reference:** `' + payId + '`\n**Roblox:** ' + roblox + '\n**Partnerships:** ' + partner + '\n**Mutuals:** ' + mutual + '\n**Total Pay:** **' + totalPay + 'R$**', 0xF39C12)], flags: MessageFlags.Ephemeral });
  try {
    const user = await client.users.fetch(userId);
    await user.send({ embeds: [dmEmbed('Payment Request Submitted', '**Pay Reference:** `' + payId + '`\n**Total Pay:** **' + totalPay + 'R$**\nPending management review.', 0xF39C12)] });
  } catch {}
}

async function handlePaymentApprove(interaction, payId, client) {
  const { db } = require('../database');
  if (!canApproveRequests(interaction.member)) return interaction.reply({ content: 'Only management can approve payments.', flags: MessageFlags.Ephemeral });
  const payDate = interaction.fields.getTextInputValue('pay_date').trim();
  const req = db.prepare('SELECT * FROM payment_requests WHERE id = ?').get(payId);
  if (!req) return interaction.reply({ content: 'Payment request not found.', flags: MessageFlags.Ephemeral });
  if (req.status !== 'pending') return interaction.reply({ content: 'Already ' + req.status + '.', flags: MessageFlags.Ephemeral });
  db.prepare("UPDATE payment_requests SET status = 'scheduled', manager_id = ?, pay_scheduled_date = ?, processed_at = datetime('now') WHERE id = ?").run(interaction.user.id, payDate, payId);
  try {
    const channel = await client.channels.fetch(req.channel_id);
    const msg = await channel.messages.fetch(req.message_id);
    const embed = baseEmbed().setColor(statusColor('scheduled')).setTitle('Payment Request — SCHEDULED')
      .setDescription('**Pay Reference:** `' + payId + '`\n**Status:** Scheduled by <@' + interaction.user.id + '>\n**Pay Date:** ' + payDate)
      .addFields(
        { name: 'Staff', value: '<@' + req.user_id + '>', inline: true },
        { name: 'Roblox Username', value: req.roblox_username, inline: true },
        { name: 'Rank', value: req.rank + ' PR', inline: true },
        { name: 'Partnerships', value: String(req.partner_count), inline: true },
        { name: 'Mutual Giveaways', value: String(req.mutual_count), inline: true },
        { name: 'Total Pay', value: '**' + req.total_pay + 'R$**', inline: true }
      );
    const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('paid_pay_' + payId).setLabel('Mark as Paid').setStyle(ButtonStyle.Success));
    await msg.edit({ embeds: [embed], components: [row] });
  } catch (e) { console.error(e); }
  try {
    const user = await client.users.fetch(req.user_id);
    await user.send({ embeds: [dmEmbed('Payment Scheduled', '**Pay Reference:** `' + payId + '`\n**Total:** **' + req.total_pay + 'R$**\n**Scheduled date:** ' + payDate, SUCCESS_COLOR)] });
  } catch {}
  await interaction.reply({ content: 'Payment ' + payId + ' scheduled for ' + payDate + '.', flags: MessageFlags.Ephemeral });
}

async function handlePaymentReject(interaction, payId, client) {
  const { db } = require('../database');
  if (!canApproveRequests(interaction.member)) return interaction.reply({ content: 'Only management can reject payments.', flags: MessageFlags.Ephemeral });
  const reason = interaction.fields.getTextInputValue('reason');
  const req = db.prepare('SELECT * FROM payment_requests WHERE id = ?').get(payId);
  if (!req) return interaction.reply({ content: 'Payment request not found.', flags: MessageFlags.Ephemeral });
  if (req.status !== 'pending' && req.status !== 'scheduled') return interaction.reply({ content: 'Already ' + req.status + '.', flags: MessageFlags.Ephemeral });
  db.prepare("UPDATE payment_requests SET status = 'rejected', manager_id = ?, rejection_reason = ?, processed_at = datetime('now') WHERE id = ?").run(interaction.user.id, reason, payId);
  try {
    const channel = await client.channels.fetch(req.channel_id);
    const msg = await channel.messages.fetch(req.message_id);
    const embed = baseEmbed().setColor(statusColor('rejected')).setTitle('Payment Request — REJECTED')
      .setDescription('**Pay Reference:** `' + payId + '`\n**Status:** Rejected by <@' + interaction.user.id + '>\n**Reason:** ' + reason)
      .addFields({ name: 'Staff', value: '<@' + req.user_id + '>' }, { name: 'Total Pay', value: req.total_pay + 'R$' });
    await msg.edit({ embeds: [embed], components: [] });
  } catch (e) { console.error(e); }
  try {
    const user = await client.users.fetch(req.user_id);
    await user.send({ embeds: [dmEmbed('Payment Rejected', '**Pay Reference:** `' + payId + '`\n**Reason:** ' + reason, DANGER_COLOR)] });
  } catch {}
  await interaction.reply({ content: 'Payment ' + payId + ' rejected.', flags: MessageFlags.Ephemeral });
}

async function handlePaymentPaid(interaction, payId, client) {
  const { db } = require('../database');
  if (!canApproveRequests(interaction.member)) return interaction.reply({ content: 'Only management can mark payments as paid.', flags: MessageFlags.Ephemeral });
  const req = db.prepare('SELECT * FROM payment_requests WHERE id = ?').get(payId);
  if (!req) return interaction.reply({ content: 'Payment request not found.', flags: MessageFlags.Ephemeral });
  if (req.status !== 'scheduled') return interaction.reply({ content: 'Payment must be scheduled first. Status: ' + req.status, flags: MessageFlags.Ephemeral });
  db.prepare("UPDATE payment_requests SET status = 'paid', paid_at = datetime('now') WHERE id = ?").run(payId);
  try {
    const channel = await client.channels.fetch(req.channel_id);
    const msg = await channel.messages.fetch(req.message_id);
    const embed = baseEmbed().setColor(statusColor('paid')).setTitle('Payment Request — PAID')
      .setDescription('**Pay Reference:** `' + payId + '`\n**Status:** Paid (marked by <@' + interaction.user.id + '>)')
      .addFields(
        { name: 'Staff', value: '<@' + req.user_id + '>', inline: true },
        { name: 'Roblox Username', value: req.roblox_username, inline: true },
        { name: 'Total Paid', value: '**' + req.total_pay + 'R$**', inline: true },
        { name: 'Scheduled Date', value: req.pay_scheduled_date || '—', inline: true }
      );
    await msg.edit({ embeds: [embed], components: [] });
  } catch (e) { console.error(e); }
  try {
    const user = await client.users.fetch(req.user_id);
    await user.send({ embeds: [dmEmbed('You Have Been Paid', '**Pay Reference:** `' + payId + '`\n**Amount:** **' + req.total_pay + 'R$**\n**Roblox:** ' + req.roblox_username + '\n\nYour payment has been completed.', SUCCESS_COLOR)] });
  } catch {}
  await interaction.reply({ content: 'Payment ' + payId + ' marked as paid. Staff notified.', flags: MessageFlags.Ephemeral });
}

async function handleLoaSubmit(interaction, client) {
  const { db, getConfig } = require('../database');
  const { generateLoaId } = require('../utils/ids');
  const username = interaction.fields.getTextInputValue('username');
  const length = interaction.fields.getTextInputValue('length');
  const reason = interaction.fields.getTextInputValue('reason');
  const userId = interaction.user.id;
  const loaId = generateLoaId();
  db.prepare("INSERT INTO loa_requests (id, user_id, username, length, reason, status) VALUES (?, ?, ?, ?, ?, 'pending')").run(loaId, userId, username, length, reason);
  const channelId = getConfig('loa_channel') || getConfig('approval_channel');
  if (!channelId) return interaction.reply({ content: 'LOA channel is not configured.', flags: MessageFlags.Ephemeral });
  const channel = await client.channels.fetch(channelId).catch(() => null);
  if (!channel) return interaction.reply({ content: 'Could not find LOA channel.', flags: MessageFlags.Ephemeral });
  const embed = baseEmbed().setColor(statusColor('pending')).setTitle('LOA Request')
    .setDescription('**LOA ID:** `' + loaId + '`\n**Status:** Pending Review')
    .addFields(
      { name: 'Staff', value: '<@' + userId + '>', inline: true },
      { name: 'Username', value: username, inline: true },
      { name: 'Length of LOA', value: length, inline: true },
      { name: 'Reason of LOA', value: reason.slice(0, 1024) }
    );
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('approve_loa_' + loaId).setLabel('Approve').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('reject_loa_' + loaId).setLabel('Reject').setStyle(ButtonStyle.Danger)
  );
  const content = pingContent(getConfig('loa_ping_role'));
  const msg = await channel.send({ content, embeds: [embed], components: [row] });
  db.prepare('UPDATE loa_requests SET message_id = ?, channel_id = ? WHERE id = ?').run(msg.id, channel.id, loaId);
  await interaction.reply({ embeds: [dmEmbed('LOA Request Submitted', '**LOA ID:** `' + loaId + '`\nPending review.', 0xF39C12)], flags: MessageFlags.Ephemeral });
}

async function handleLoaApprove(interaction, loaId, client) {
  const { db } = require('../database');
  if (!canApproveRequests(interaction.member)) return interaction.reply({ content: 'Only management can approve LOA requests.', flags: MessageFlags.Ephemeral });
  const req = db.prepare('SELECT * FROM loa_requests WHERE id = ?').get(loaId);
  if (!req) return interaction.reply({ content: 'LOA request not found.', flags: MessageFlags.Ephemeral });
  if (req.status !== 'pending') return interaction.reply({ content: 'Already ' + req.status + '.', flags: MessageFlags.Ephemeral });
  db.prepare("UPDATE loa_requests SET status = 'approved', manager_id = ?, processed_at = datetime('now') WHERE id = ?").run(interaction.user.id, loaId);
  try {
    const channel = await client.channels.fetch(req.channel_id);
    const msg = await channel.messages.fetch(req.message_id);
    const embed = baseEmbed().setColor(statusColor('approved')).setTitle('LOA Request — APPROVED')
      .setDescription('**LOA ID:** `' + loaId + '`\n**Status:** Approved by <@' + interaction.user.id + '>')
      .addFields({ name: 'Staff', value: '<@' + req.user_id + '>' }, { name: 'Username', value: req.username }, { name: 'Length', value: req.length }, { name: 'Reason', value: req.reason.slice(0, 1024) });
    await msg.edit({ embeds: [embed], components: [] });
  } catch (e) { console.error(e); }
  try {
    const user = await client.users.fetch(req.user_id);
    await user.send({ embeds: [dmEmbed('LOA Approved', 'Your LOA **' + loaId + '** was approved.\nLength: ' + req.length, SUCCESS_COLOR)] });
  } catch {}
  await interaction.reply({ content: 'LOA ' + loaId + ' approved.', flags: MessageFlags.Ephemeral });
}

async function handleLoaReject(interaction, loaId, client) {
  const { db } = require('../database');
  if (!canApproveRequests(interaction.member)) return interaction.reply({ content: 'Only management can reject LOA requests.', flags: MessageFlags.Ephemeral });
  const reason = interaction.fields.getTextInputValue('reason');
  const req = db.prepare('SELECT * FROM loa_requests WHERE id = ?').get(loaId);
  if (!req) return interaction.reply({ content: 'LOA request not found.', flags: MessageFlags.Ephemeral });
  if (req.status !== 'pending') return interaction.reply({ content: 'Already ' + req.status + '.', flags: MessageFlags.Ephemeral });
  db.prepare("UPDATE loa_requests SET status = 'rejected', manager_id = ?, rejection_reason = ?, processed_at = datetime('now') WHERE id = ?").run(interaction.user.id, reason, loaId);
  try {
    const channel = await client.channels.fetch(req.channel_id);
    const msg = await channel.messages.fetch(req.message_id);
    const embed = baseEmbed().setColor(statusColor('rejected')).setTitle('LOA Request — REJECTED')
      .setDescription('**LOA ID:** `' + loaId + '`\n**Status:** Rejected by <@' + interaction.user.id + '>\n**Reason:** ' + reason);
    await msg.edit({ embeds: [embed], components: [] });
  } catch (e) { console.error(e); }
  try {
    const user = await client.users.fetch(req.user_id);
    await user.send({ embeds: [dmEmbed('LOA Rejected', 'Your LOA **' + loaId + '** was rejected.\n**Reason:** ' + reason, DANGER_COLOR)] });
  } catch {}
  await interaction.reply({ content: 'LOA ' + loaId + ' rejected.', flags: MessageFlags.Ephemeral });
}

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
  db.prepare("INSERT INTO blacklist_requests (id, submitter_id, server_name, server_link, reason, incident_date, evidence_urls, status) VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')").run(blId, userId, serverName, serverLink, reason, incidentDate, JSON.stringify(evidenceLink ? [evidenceLink] : []));
  const channelId = getConfig('blacklist_channel') || getConfig('approval_channel');
  if (!channelId) return interaction.reply({ content: 'Blacklist channel not configured.', flags: MessageFlags.Ephemeral });
  const channel = await client.channels.fetch(channelId).catch(() => null);
  if (!channel) return interaction.reply({ content: 'Could not find blacklist channel.', flags: MessageFlags.Ephemeral });
  const embed = baseEmbed().setColor(statusColor('pending')).setTitle('Blacklist Request')
    .setDescription('**Request ID:** `' + blId + '`\n**Status:** Pending Review')
    .addFields(
      { name: 'Submitted by', value: '<@' + userId + '>', inline: true },
      { name: 'Server Name', value: serverName, inline: true },
      { name: 'Server Link', value: serverLink },
      { name: 'Incident Date', value: incidentDate, inline: true },
      { name: 'Reason', value: reason.slice(0, 1024) }
    );
  if (evidenceLink) {
    embed.addFields({ name: 'Evidence', value: '[View](' + evidenceLink + ')' });
    if (/\.(png|jpe?g|gif|webp)/i.test(evidenceLink) || evidenceLink.includes('media.discordapp')) embed.setImage(evidenceLink);
  }
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('approve_bl_' + blId).setLabel('Approve Blacklist').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId('reject_bl_' + blId).setLabel('Reject').setStyle(ButtonStyle.Secondary)
  );
  const content = pingContent(getConfig('blacklist_ping_role'));
  const msg = await channel.send({ content, embeds: [embed], components: [row] });
  db.prepare('UPDATE blacklist_requests SET message_id = ?, channel_id = ? WHERE id = ?').run(msg.id, channel.id, blId);
  await interaction.reply({ embeds: [dmEmbed('Blacklist Request Submitted', 'Request **' + blId + '** for **' + serverName + '** submitted.', 0xF39C12)], flags: MessageFlags.Ephemeral });
}

async function handleBlacklistApprove(interaction, blId, client) {
  const { db } = require('../database');
  if (!canApproveRequests(interaction.member)) return interaction.reply({ content: 'Only management can approve blacklist requests.', flags: MessageFlags.Ephemeral });
  const req = db.prepare('SELECT * FROM blacklist_requests WHERE id = ?').get(blId);
  if (!req) return interaction.reply({ content: 'Not found.', flags: MessageFlags.Ephemeral });
  if (req.status !== 'pending') return interaction.reply({ content: 'Already ' + req.status + '.', flags: MessageFlags.Ephemeral });
  db.prepare("UPDATE blacklist_requests SET status = 'approved', manager_id = ?, processed_at = datetime('now') WHERE id = ?").run(interaction.user.id, blId);
  try {
    const channel = await client.channels.fetch(req.channel_id);
    const msg = await channel.messages.fetch(req.message_id);
    const embed = baseEmbed().setColor(statusColor('approved')).setTitle('Blacklist Request — APPROVED')
      .setDescription('**Request ID:** `' + blId + '`\n**Status:** Approved by <@' + interaction.user.id + '>')
      .addFields({ name: 'Server Name', value: req.server_name }, { name: 'Server Link', value: req.server_link }, { name: 'Reason', value: req.reason.slice(0, 1024) });
    await msg.edit({ embeds: [embed], components: [] });
  } catch (e) { console.error(e); }
  try {
    const user = await client.users.fetch(req.submitter_id);
    await user.send({ embeds: [dmEmbed('Blacklist Approved', 'Your blacklist request **' + blId + '** for **' + req.server_name + '** was approved.', SUCCESS_COLOR)] });
  } catch {}
  await interaction.reply({ content: 'Blacklist ' + blId + ' approved.', flags: MessageFlags.Ephemeral });
}

async function handleBlacklistReject(interaction, blId, client) {
  const { db } = require('../database');
  if (!canApproveRequests(interaction.member)) return interaction.reply({ content: 'Only management can reject blacklist requests.', flags: MessageFlags.Ephemeral });
  const reason = interaction.fields.getTextInputValue('reason');
  const req = db.prepare('SELECT * FROM blacklist_requests WHERE id = ?').get(blId);
  if (!req) return interaction.reply({ content: 'Not found.', flags: MessageFlags.Ephemeral });
  if (req.status !== 'pending') return interaction.reply({ content: 'Already ' + req.status + '.', flags: MessageFlags.Ephemeral });
  db.prepare("UPDATE blacklist_requests SET status = 'rejected', manager_id = ?, rejection_reason = ?, processed_at = datetime('now') WHERE id = ?").run(interaction.user.id, reason, blId);
  try {
    const channel = await client.channels.fetch(req.channel_id);
    const msg = await channel.messages.fetch(req.message_id);
    const embed = baseEmbed().setColor(statusColor('rejected')).setTitle('Blacklist Request — REJECTED')
      .setDescription('**Request ID:** `' + blId + '`\n**Status:** Rejected by <@' + interaction.user.id + '>\n**Reason:** ' + reason);
    await msg.edit({ embeds: [embed], components: [] });
  } catch (e) { console.error(e); }
  try {
    const user = await client.users.fetch(req.submitter_id);
    await user.send({ embeds: [dmEmbed('Blacklist Rejected', 'Your blacklist request **' + blId + '** was rejected.\n**Reason:** ' + reason, DANGER_COLOR)] });
  } catch {}
  await interaction.reply({ content: 'Blacklist ' + blId + ' rejected.', flags: MessageFlags.Ephemeral });
}
