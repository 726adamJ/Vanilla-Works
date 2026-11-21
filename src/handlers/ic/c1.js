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

  if (id.startsWith('embed_publish_') || id.startsWith('embed_cancel_')) {
    return handleEmbedButton(interaction, client);
  }

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
    const { parseCopyCustomId } = require('../utils/copyFields');
    const parsed = parseCopyCustomId(id);
    if (!parsed) return interaction.reply({ content: 'Invalid copy button.', flags: MessageFlags.Ephemeral });
    return handleCopyField(interaction, parsed.reqId, parsed.fieldKey);
  }

  if (id.startsWith('auto_log_approve_') || id.startsWith('auto_log_cancel_')) {
    return handleAutoLogButton(interaction, client);
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
  if (id === 'modal_cooldown_import') {
    const { handleCooldownImportModal } = require('../commands/cooldown');
    return handleCooldownImportModal(interaction, client);
  }
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
  if (!req) return interaction.reply({ content: 'Request not found for ID `' + reqId + '` (field: ' + fieldKey + '). If this is an old request, re-submit it so copy buttons regenerate.', flags: MessageFlags.Ephemeral });
  let data; try { data = JSON.parse(req.data); } catch { data = {}; }
  const value = data[fieldKey];
  if (value === undefined || value === null || value === '') {
    return interaction.reply({ content: 'No value found for that field.', flags: MessageFlags.Ephemeral });
  }
  return interaction.reply({ content: '**' + fieldKey + '** — select and copy:\n```\n' + String(value) + '\n```', flags: MessageFlags.Ephemeral });
}
