const { MessageFlags, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, EmbedBuilder } = require('discord.js');
const { hasStaffRole, hasManagementRole, canApproveRequests } = require('../utils/permissions');

// Temporary storage for multi-step flows (outreach + blacklist evidence)
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

      if (interaction.isButton()) {
        const id = interaction.customId;

        // ===== PANEL BUTTONS =====
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
          const modal = new ModalBuilder()
            .setCustomId('modal_mutual_giveaway')
            .setTitle('Mutual Giveaway Request');

          const fields = [
            { id: 'invite', label: 'Discord Server Invite', style: TextInputStyle.Short },
            { id: 'prize', label: 'Their Prize', style: TextInputStyle.Short },
            { id: 'their_ping', label: 'Their Ping (role/user)', style: TextInputStyle.Short },
            { id: 'our_ping', label: 'Our Ping (role/user)', style: TextInputStyle.Short },
            { id: 'duration', label: 'Duration (+ winners e.g. 24h, 3 winners)', style: TextInputStyle.Short }
          ];

          modal.addComponents(...fields.map(f =>
            new ActionRowBuilder().addComponents(
              new TextInputBuilder().setCustomId(f.id).setLabel(f.label).setStyle(f.style).setRequired(true)
            )
          ));
          return interaction.showModal(modal);
        }

        if (id === 'request_partnership') {
          const modal = new ModalBuilder()
            .setCustomId('modal_partnership')
            .setTitle('Partnership Request');

          modal.addComponents(
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('server_name').setLabel('Server Name').setStyle(TextInputStyle.Short).setRequired(true)),
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('our_ping').setLabel('Our Ping').setStyle(TextInputStyle.Short).setRequired(true)),
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('their_ping').setLabel('Their Ping').setStyle(TextInputStyle.Short).setRequired(true)),
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('partners_ad').setLabel('Partners Ad').setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(4000))
          );
          return interaction.showModal(modal);
        }

        // ===== LOG OUTREACH =====
        if (id === 'pr_log_outreach') {
          if (!hasStaffRole(interaction.member)) {
            return interaction.reply({ content: 'You do not have permission to use this feature.', flags: MessageFlags.Ephemeral });
          }
          const modal = new ModalBuilder()
            .setCustomId('modal_outreach')
            .setTitle('Log Outreach');

          modal.addComponents(
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('server_invite').setLabel('Server Invite').setStyle(TextInputStyle.Short).setRequired(true)),
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('pings').setLabel('Pings Used').setStyle(TextInputStyle.Short).setRequired(true)),
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('type').setLabel('Type (Mutual or Partner)').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('Mutual or Partner')),
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('evidence_link').setLabel('Evidence Link (optional image/video URL)').setStyle(TextInputStyle.Short).setRequired(false).setPlaceholder('https://...'))
          );
          return interaction.showModal(modal);
        }

        // ===== REQUEST A BLACKLIST =====
        if (id === 'pr_request_blacklist') {
          if (!hasStaffRole(interaction.member)) {
            return interaction.reply({ content: 'You do not have permission to use this feature.', flags: MessageFlags.Ephemeral });
          }
          const modal = new ModalBuilder()
            .setCustomId('modal_blacklist')
            .setTitle('Request a Blacklist');

          modal.addComponents(
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('server_name').setLabel('Server Name').setStyle(TextInputStyle.Short).setRequired(true)),
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('server_link').setLabel('Server Link / Invite').setStyle(TextInputStyle.Short).setRequired(true)),
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('reason').setLabel('Reason for requesting blacklist').setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(1000)),
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('incident_date').setLabel('Date this incident occurred').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('e.g. 2026-11-15 or Nov 15 2026')),
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('evidence_link').setLabel('Evidence Link (optional)').setStyle(TextInputStyle.Short).setRequired(false).setPlaceholder('Image or video URL'))
          );
          return interaction.showModal(modal);
        }

        // ===== APPROVE / REJECT (normal requests) =====
        if (id.startsWith('approve_req_')) {
          return handleApprove(interaction, id.replace('approve_req_', ''), client);
        }
        if (id.startsWith('reject_req_')) {
          const reqId = id.replace('reject_req_', '');
          const modal = new ModalBuilder().setCustomId(`modal_reject_${reqId}`).setTitle('Rejection Reason');
          modal.addComponents(
            new ActionRowBuilder().addComponents(
              new TextInputBuilder().setCustomId('reason').setLabel('Reason for rejection (required)').setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(1000)
            )
          );
          return interaction.showModal(modal);
        }

        // ===== APPROVE / REJECT BLACKLIST =====
        if (id.startsWith('approve_bl_')) {
          return handleBlacklistApprove(interaction, id.replace('approve_bl_', ''), client);
        }
        if (id.startsWith('reject_bl_')) {
          const blId = id.replace('reject_bl_', '');
          const modal = new ModalBuilder().setCustomId(`modal_reject_bl_${blId}`).setTitle('Blacklist Rejection Reason');
          modal.addComponents(
            new ActionRowBuilder().addComponents(
              new TextInputBuilder().setCustomId('reason').setLabel('Reason for rejection').setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(1000)
            )
          );
          return interaction.showModal(modal);
        }

        // ===== Like / Poll / Embed (kept for compatibility) =====
        if (id.startsWith('like_post_')) return handleLike(interaction, id.replace('like_post_', ''), client);
        if (id.startsWith('poll_vote_')) {
          const parts = id.split('_');
          return handlePollVote(interaction, parts[2], parseInt(parts[3], 10), client);
        }
        if (id.startsWith('embed_publish_')) return handleEmbedPublish(interaction, id.replace('embed_publish_', ''), client);
        if (id.startsWith('embed_cancel_')) {
          try { require('../commands/embed').draftStore.delete(id.replace('embed_cancel_', '')); } catch {}
          return interaction.update({ content: 'Embed creation cancelled.', embeds: [], components: [] });
        }

        // ===== Evidence collectors skip buttons =====
        if (id.startsWith('outreach_skip_')) {
          const userId = id.replace('outreach_skip_', '');
          if (interaction.user.id !== userId) return interaction.reply({ content: 'This is not your submission.', flags: MessageFlags.Ephemeral });
          return finalizeOutreach(interaction, userId, null, client);
        }
        if (id.startsWith('blacklist_skip_')) {
          const userId = id.replace('blacklist_skip_', '');
          if (interaction.user.id !== userId) return interaction.reply({ content: 'This is not your submission.', flags: MessageFlags.Ephemeral });
          return finalizeBlacklist(interaction, userId, [], client);
        }

        return;
      }

      // ===== MODALS =====
      if (interaction.isModalSubmit()) {
        const id = interaction.customId;

        if (id === 'modal_mutual_giveaway') return handleMutualSubmit(interaction, client);
        if (id === 'modal_partnership') return handlePartnershipSubmit(interaction, client);
        if (id === 'modal_outreach') return handleOutreachSubmit(interaction, client);
        if (id === 'modal_blacklist') return handleBlacklistSubmit(interaction, client);
        if (id.startsWith('modal_reject_bl_')) return handleBlacklistReject(interaction, id.replace('modal_reject_bl_', ''), client);
        if (id.startsWith('modal_reject_')) return handleReject(interaction, id.replace('modal_reject_', ''), client);
        return;
      }

    } catch (error) {
      console.error('Interaction error:', error);
      const payload = { content: 'An unexpected error occurred. Please try again or contact management.', flags: MessageFlags.Ephemeral };
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp(payload).catch(() => {});
      } else {
        await interaction.reply(payload).catch(() => {});
      }
    }
  }
};

// ==================== HANDLERS ====================

async function handleMutualSubmit(interaction, client) {
  const { db, getConfig } = require('../database');
  const { generateRequestId } = require('../utils/ids');
  const { baseEmbed, statusColor } = require('../utils/embeds');

  const durationRaw = interaction.fields.getTextInputValue('duration');
  let winners = '1';
  const winnersMatch = durationRaw.match(/(\d+)\s*winners?/i);
  if (winnersMatch) winners = winnersMatch[1];

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

  db.prepare(`INSERT INTO requests (id, type, submitter_id, status, data) VALUES (?, 'mutual_giveaway', ?, 'pending', ?)`)\
    .run(reqId, submitter.id, JSON.stringify(data));

  const approvalChannelId = getConfig('approval_channel');
  if (!approvalChannelId) return interaction.reply({ content: 'Approval channel is not configured.', flags: MessageFlags.Ephemeral });

  const channel = await client.channels.fetch(approvalChannelId).catch(() => null);
  if (!channel) return interaction.reply({ content: 'Could not find the approval channel.', flags: MessageFlags.Ephemeral });

  const embed = baseEmbed()
    .setColor(statusColor('pending'))
    .setTitle('Mutual Giveaway Request')
    .setDescription(`**Request ID:** \`${reqId}\`\n**Status:** Pending Approval`)
    .addFields(
      { name: 'Submitted by', value: `<@${submitter.id}> (${submitter.tag})`, inline: true },
      { name: 'Server Invite', value: data.invite },
      { name: 'Their Prize', value: data.prize, inline: true },
      { name: 'Duration', value: data.duration, inline: true },
      { name: 'Winners', value: data.winners, inline: true },
      { name: 'Their Ping', value: data.their_ping, inline: true },
      { name: 'Our Ping', value: data.our_ping, inline: true }
    );

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`approve_req_${reqId}`).setLabel('Approve').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`reject_req_${reqId}`).setLabel('Reject').setStyle(ButtonStyle.Danger)
  );

  const msg = await channel.send({ embeds: [embed], components: [row] });
  db.prepare(`UPDATE requests SET message_id = ?, channel_id = ? WHERE id = ?`).run(msg.id, channel.id, reqId);

  await interaction.reply({ content: `Your Mutual Giveaway request has been submitted.\n**Reference ID:** \`${reqId}\``, flags: MessageFlags.Ephemeral });
  try { await submitter.send(`Your Mutual Giveaway request (\`${reqId}\`) is pending approval.`); } catch {}
}

async function handlePartnershipSubmit(interaction, client) {
  const { db, getConfig } = require('../database');
  const { generateRequestId } = require('../utils/ids');
  const { baseEmbed, statusColor } = require('../utils/embeds');

  const data = {
    server_name: interaction.fields.getTextInputValue('server_name'),
    our_ping: interaction.fields.getTextInputValue('our_ping'),
    their_ping: interaction.fields.getTextInputValue('their_ping'),
    partners_ad: interaction.fields.getTextInputValue('partners_ad')
  };

  const reqId = generateRequestId();
  const submitter = interaction.user;

  db.prepare(`INSERT INTO requests (id, type, submitter_id, status, data) VALUES (?, 'partnership', ?, 'pending', ?)`)\
    .run(reqId, submitter.id, JSON.stringify(data));

  const approvalChannelId = getConfig('approval_channel');
  if (!approvalChannelId) return interaction.reply({ content: 'Approval channel is not configured.', flags: MessageFlags.Ephemeral });

  const channel = await client.channels.fetch(approvalChannelId).catch(() => null);
  if (!channel) return interaction.reply({ content: 'Could not find the approval channel.', flags: MessageFlags.Ephemeral });

  const embed = baseEmbed()
    .setColor(statusColor('pending'))
    .setTitle('Partnership Request')
    .setDescription(`**Request ID:** \`${reqId}\`\n**Status:** Pending Approval`)
    .addFields(
      { name: 'Submitted by', value: `<@${submitter.id}> (${submitter.tag})`, inline: true },
      { name: 'Server Name', value: data.server_name, inline: true },
      { name: 'Our Ping', value: data.our_ping, inline: true },
      { name: 'Their Ping', value: data.their_ping, inline: true },
      { name: 'Partners Ad', value: data.partners_ad.slice(0, 1024) || '—' }
    );

  if (data.partners_ad.length > 1024) {
    embed.addFields({ name: 'Partners Ad (continued)', value: data.partners_ad.slice(1024, 2048) });
  }

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`approve_req_${reqId}`).setLabel('Approve').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`reject_req_${reqId}`).setLabel('Reject').setStyle(ButtonStyle.Danger)
  );

  const msg = await channel.send({ embeds: [embed], components: [row] });
  db.prepare(`UPDATE requests SET message_id = ?, channel_id = ? WHERE id = ?`).run(msg.id, channel.id, reqId);

  await interaction.reply({ content: `Your Partnership request has been submitted.\n**Reference ID:** \`${reqId}\``, flags: MessageFlags.Ephemeral });
  try { await submitter.send(`Your Partnership request (\`${reqId}\`) is pending approval.`); } catch {}
}

async function handleApprove(interaction, reqId, client) {
  const { db } = require('../database');
  const { baseEmbed, statusColor } = require('../utils/embeds');

  if (!canApproveRequests(interaction.member)) {
    return interaction.reply({ content: 'Only authorised management can approve requests.', flags: MessageFlags.Ephemeral });
  }

  const req = db.prepare('SELECT * FROM requests WHERE id = ?').get(reqId);
  if (!req) return interaction.reply({ content: 'Request not found.', flags: MessageFlags.Ephemeral });
  if (req.status !== 'pending') return interaction.reply({ content: `This request has already been ${req.status}.`, flags: MessageFlags.Ephemeral });

  db.prepare(`UPDATE requests SET status = 'approved', manager_id = ?, processed_at = datetime('now') WHERE id = ?`).run(interaction.user.id, reqId);

  try {
    const channel = await client.channels.fetch(req.channel_id);
    const msg = await channel.messages.fetch(req.message_id);
    const data = JSON.parse(req.data);
    const embed = baseEmbed()
      .setColor(statusColor('approved'))
      .setTitle(req.type === 'mutual_giveaway' ? 'Mutual Giveaway Request' : 'Partnership Request')
      .setDescription(`**Request ID:** \`${reqId}\`\n**Status:** ✅ Approved by <@${interaction.user.id}>`);

    if (req.type === 'mutual_giveaway') {
      embed.addFields(
        { name: 'Submitted by', value: `<@${req.submitter_id}>`, inline: true },
        { name: 'Server Invite', value: data.invite },
        { name: 'Prize', value: data.prize, inline: true },
        { name: 'Duration', value: data.duration, inline: true },
        { name: 'Winners', value: data.winners, inline: true }
      );
    } else {
      embed.addFields(
        { name: 'Submitted by', value: `<@${req.submitter_id}>`, inline: true },
        { name: 'Server Name', value: data.server_name },
        { name: 'Partners Ad', value: (data.partners_ad || '').slice(0, 1024) }
      );
    }

    await msg.edit({ embeds: [embed], components: [] });
  } catch (e) { console.error(e); }

  try {
    const user = await client.users.fetch(req.submitter_id);
    await user.send(`✅ Your request **${reqId}** has been **approved**.\nProcessed by: ${interaction.user.tag}`);
  } catch {}

  await interaction.reply({ content: `Request ${reqId} has been approved.`, flags: MessageFlags.Ephemeral });
}

async function handleReject(interaction, reqId, client) {
  const { db } = require('../database');
  const { baseEmbed, statusColor } = require('../utils/embeds');

  if (!canApproveRequests(interaction.member)) {
    return interaction.reply({ content: 'Only authorised management can reject requests.', flags: MessageFlags.Ephemeral });
  }

  const reason = interaction.fields.getTextInputValue('reason');
  const req = db.prepare('SELECT * FROM requests WHERE id = ?').get(reqId);
  if (!req) return interaction.reply({ content: 'Request not found.', flags: MessageFlags.Ephemeral });
  if (req.status !== 'pending') return interaction.reply({ content: `This request has already been ${req.status}.`, flags: MessageFlags.Ephemeral });

  db.prepare(`UPDATE requests SET status = 'rejected', manager_id = ?, rejection_reason = ?, processed_at = datetime('now') WHERE id = ?`).run(interaction.user.id, reason, reqId);

  try {
    const channel = await client.channels.fetch(req.channel_id);
    const msg = await channel.messages.fetch(req.message_id);
    const embed = baseEmbed()
      .setColor(statusColor('rejected'))
      .setTitle(req.type === 'mutual_giveaway' ? 'Mutual Giveaway Request' : 'Partnership Request')
      .setDescription(`**Request ID:** \`${reqId}\`\n**Status:** ❌ Rejected by <@${interaction.user.id}>\n**Reason:** ${reason}`);
    await msg.edit({ embeds: [embed], components: [] });
  } catch (e) { console.error(e); }

  try {
    const user = await client.users.fetch(req.submitter_id);
    await user.send(`❌ Your request **${reqId}** has been **rejected**.\n**Reason:** ${reason}\nProcessed by: ${interaction.user.tag}`);
  } catch {}

  await interaction.reply({ content: `Request ${reqId} has been rejected.`, flags: MessageFlags.Ephemeral });
}

// ==================== OUTREACH ====================

async function handleOutreachSubmit(interaction, client) {
  const { db } = require('../database');

  const serverInvite = interaction.fields.getTextInputValue('server_invite');
  const pings = interaction.fields.getTextInputValue('pings');
  let type = interaction.fields.getTextInputValue('type').trim();
  const evidenceLink = interaction.fields.getTextInputValue('evidence_link')?.trim() || null;

  if (!['Mutual', 'Partner'].includes(type)) {
    type = type.toLowerCase().includes('partner') ? 'Partner' : 'Mutual';
  }

  const userId = interaction.user.id;
  const assignment = db.prepare('SELECT thread_id FROM staff_threads WHERE user_id = ?').get(userId);

  if (!assignment) {
    return interaction.reply({
      content: 'Your outreach logging setup is incomplete. Ask an administrator to run `/staff log setup` for you.',
      flags: MessageFlags.Ephemeral
    });
  }

  // If they already provided a link, finalize immediately
  if (evidenceLink) {
    client.tempData.set(userId, { serverInvite, pings, type, threadId: assignment.thread_id });
    return finalizeOutreach(interaction, userId, evidenceLink, client);
  }

  // Otherwise offer to upload an image or skip
  client.tempData.set(userId, {
    serverInvite,
    pings,
    type,
    threadId: assignment.thread_id,
    expires: Date.now() + 90 * 1000
  });

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`outreach_skip_${userId}`).setLabel('Skip Evidence').setStyle(ButtonStyle.Secondary)
  );

  await interaction.reply({
    content: '**Optional Evidence**\nUpload an image as a reply to this message within 90 seconds, or click **Skip Evidence**.',
    components: [row],
    flags: MessageFlags.Ephemeral
  });

  const filter = m => m.author.id === userId && m.attachments.size > 0;
  const collector = interaction.channel.createMessageCollector({ filter, time: 90000, max: 1 });

  collector.on('collect', async (msg) => {
    const attachment = msg.attachments.first();
    const url = attachment && (attachment.contentType?.startsWith('image/') || attachment.contentType?.startsWith('video/'))
      ? attachment.url : null;
    await finalizeOutreach(interaction, userId, url, client);
    try { await msg.delete(); } catch {}
  });

  collector.on('end', async (collected) => {
    if (collected.size === 0 && client.tempData.has(userId)) {
      await finalizeOutreach(interaction, userId, null, client);
    }
  });
}

async function finalizeOutreach(interaction, userId, evidenceUrl, client) {
  const { db, getConfig } = require('../database');
  const { generateLogId } = require('../utils/ids');
  const { baseEmbed } = require('../utils/embeds');

  const temp = client.tempData.get(userId);
  if (!temp) return;
  client.tempData.delete(userId);

  const logId = generateLogId();
  const thread = await client.channels.fetch(temp.threadId).catch(() => null);
  if (!thread) {
    try { await interaction.followUp({ content: 'Could not find your assigned thread.', flags: MessageFlags.Ephemeral }); } catch {}
    return;
  }

  const embed = baseEmbed()
    .setTitle('Outreach Log')
    .setDescription(`**Log ID:** \`${logId}\``)
    .addFields(
      { name: 'Staff', value: `<@${userId}>`, inline: true },
      { name: 'Type', value: temp.type, inline: true },
      { name: 'Server Invite', value: temp.serverInvite },
      { name: 'Pings Used', value: temp.pings }
    );

  if (evidenceUrl) embed.setImage(evidenceUrl);

  const notifyRole = getConfig('outreach_ping_role');
  const content = notifyRole ? `<@&${notifyRole}>` : null;

  const msg = await thread.send({ content, embeds: [embed] });

  db.prepare(`
    INSERT INTO outreach_logs (id, user_id, server_invite, pings, type, evidence_url, thread_id, message_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(logId, userId, temp.serverInvite, temp.pings, temp.type, evidenceUrl, temp.threadId, msg.id);

  try {
    await interaction.editReply({ content: `Outreach log **${logId}** recorded successfully.`, components: [] });
  } catch {
    try { await interaction.followUp({ content: `Outreach log **${logId}** recorded successfully.`, flags: MessageFlags.Ephemeral }); } catch {}
  }
}

// ==================== BLACKLIST ====================

async function handleBlacklistSubmit(interaction, client) {
  const serverName = interaction.fields.getTextInputValue('server_name');
  const serverLink = interaction.fields.getTextInputValue('server_link');
  const reason = interaction.fields.getTextInputValue('reason');
  const incidentDate = interaction.fields.getTextInputValue('incident_date');
  const evidenceLink = interaction.fields.getTextInputValue('evidence_link')?.trim() || null;

  const userId = interaction.user.id;

  client.tempData.set(userId, {
    type: 'blacklist',
    serverName,
    serverLink,
    reason,
    incidentDate,
    evidence: evidenceLink ? [evidenceLink] : [],
    expires: Date.now() + 120 * 1000
  });

  // If they already gave a link, we can still offer more attachments
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`blacklist_skip_${userId}`).setLabel('Submit Now (no more evidence)').setStyle(ButtonStyle.Success)
  );

  await interaction.reply({
    content: '**Evidence (Images / Videos)**\nYou can upload images or videos as replies to this message (up to 2 minutes).\nClick the button when you are done, or if you already provided a link.',
    components: [row],
    flags: MessageFlags.Ephemeral
  });

  const filter = m => m.author.id === userId && m.attachments.size > 0;
  const collector = interaction.channel.createMessageCollector({ filter, time: 120000 });

  collector.on('collect', async (msg) => {
    const temp = client.tempData.get(userId);
    if (!temp) return;

    for (const att of msg.attachments.values()) {
      if (att.contentType?.startsWith('image/') || att.contentType?.startsWith('video/')) {
        temp.evidence.push(att.url);
      }
    }
    client.tempData.set(userId, temp);

    try { await msg.react('✅'); } catch {}
  });

  collector.on('end', async () => {
    // Auto-finalize if they never clicked the button
    if (client.tempData.has(userId)) {
      await finalizeBlacklist(interaction, userId, client.tempData.get(userId).evidence, client);
    }
  });
}

async function finalizeBlacklist(interaction, userId, extraEvidence, client) {
  const { db, getConfig } = require('../database');
  const { generateBlacklistId } = require('../utils/ids');
  const { baseEmbed, statusColor } = require('../utils/embeds');

  const temp = client.tempData.get(userId);
  if (!temp || temp.type !== 'blacklist') return;
  client.tempData.delete(userId);

  const evidence = [...(temp.evidence || []), ...(extraEvidence || [])];
  const uniqueEvidence = [...new Set(evidence.filter(Boolean))];

  const blId = generateBlacklistId();

  db.prepare(`
    INSERT INTO blacklist_requests (id, submitter_id, server_name, server_link, reason, incident_date, evidence_urls, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')
  `).run(blId, userId, temp.serverName, temp.serverLink, temp.reason, temp.incidentDate, JSON.stringify(uniqueEvidence));

  const approvalChannelId = getConfig('approval_channel');
  if (!approvalChannelId) {
    try { await interaction.followUp({ content: 'Approval channel is not configured.', flags: MessageFlags.Ephemeral }); } catch {}
    return;
  }

  const channel = await client.channels.fetch(approvalChannelId).catch(() => null);
  if (!channel) return;

  const embed = baseEmbed()
    .setColor(statusColor('pending'))
    .setTitle('⛔ Blacklist Request')
    .setDescription(`**Request ID:** \`${blId}\`\n**Status:** Pending Review`)
    .addFields(
      { name: 'Submitted by', value: `<@${userId}>`, inline: true },
      { name: 'Server Name', value: temp.serverName, inline: true },
      { name: 'Server Link', value: temp.serverLink },
      { name: 'Incident Date', value: temp.incidentDate, inline: true },
      { name: 'Reason', value: temp.reason.slice(0, 1024) }
    );

  if (uniqueEvidence.length > 0) {
    embed.addFields({ name: 'Evidence', value: uniqueEvidence.map((u, i) => `[Evidence ${i + 1}](${u})`).join('\n').slice(0, 1024) });
    // Show first image if available
    const firstImage = uniqueEvidence.find(u => /\.(png|jpg|jpeg|gif|webp)/i.test(u) || u.includes('media.discordapp'));
    if (firstImage) embed.setImage(firstImage);
  }

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`approve_bl_${blId}`).setLabel('Approve Blacklist').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId(`reject_bl_${blId}`).setLabel('Reject').setStyle(ButtonStyle.Secondary)
  );

  const msg = await channel.send({ embeds: [embed], components: [row] });
  db.prepare(`UPDATE blacklist_requests SET message_id = ?, channel_id = ? WHERE id = ?`).run(msg.id, channel.id, blId);

  try {
    await interaction.editReply({ content: `Blacklist request **${blId}** has been submitted for review.`, components: [] });
  } catch {
    try { await interaction.followUp({ content: `Blacklist request **${blId}** has been submitted for review.`, flags: MessageFlags.Ephemeral }); } catch {}
  }

  try {
    const user = await client.users.fetch(userId);
    await user.send(`Your blacklist request (\`${blId}\`) for **${temp.serverName}** has been submitted and is pending review.`);
  } catch {}
}

async function handleBlacklistApprove(interaction, blId, client) {
  const { db } = require('../database');
  const { baseEmbed, statusColor } = require('../utils/embeds');

  if (!canApproveRequests(interaction.member)) {
    return interaction.reply({ content: 'Only management can approve blacklist requests.', flags: MessageFlags.Ephemeral });
  }

  const req = db.prepare('SELECT * FROM blacklist_requests WHERE id = ?').get(blId);
  if (!req) return interaction.reply({ content: 'Blacklist request not found.', flags: MessageFlags.Ephemeral });
  if (req.status !== 'pending') return interaction.reply({ content: `This request has already been ${req.status}.`, flags: MessageFlags.Ephemeral });

  db.prepare(`UPDATE blacklist_requests SET status = 'approved', manager_id = ?, processed_at = datetime('now') WHERE id = ?`).run(interaction.user.id, blId);

  try {
    const channel = await client.channels.fetch(req.channel_id);
    const msg = await channel.messages.fetch(req.message_id);
    const embed = baseEmbed()
      .setColor(statusColor('approved'))
      .setTitle('⛔ Blacklist Request — APPROVED')
      .setDescription(`**Request ID:** \`${blId}\`\n**Status:** ✅ Approved by <@${interaction.user.id}>`)
      .addFields(
        { name: 'Server Name', value: req.server_name },
        { name: 'Server Link', value: req.server_link },
        { name: 'Reason', value: req.reason.slice(0, 1024) }
      );
    await msg.edit({ embeds: [embed], components: [] });
  } catch (e) { console.error(e); }

  try {
    const user = await client.users.fetch(req.submitter_id);
    await user.send(`✅ Your blacklist request **${blId}** for **${req.server_name}** has been **approved**.`);
  } catch {}

  await interaction.reply({ content: `Blacklist request ${blId} has been approved.`, flags: MessageFlags.Ephemeral });
}

async function handleBlacklistReject(interaction, blId, client) {
  const { db } = require('../database');
  const { baseEmbed, statusColor } = require('../utils/embeds');

  if (!canApproveRequests(interaction.member)) {
    return interaction.reply({ content: 'Only management can reject blacklist requests.', flags: MessageFlags.Ephemeral });
  }

  const reason = interaction.fields.getTextInputValue('reason');
  const req = db.prepare('SELECT * FROM blacklist_requests WHERE id = ?').get(blId);
  if (!req) return interaction.reply({ content: 'Blacklist request not found.', flags: MessageFlags.Ephemeral });
  if (req.status !== 'pending') return interaction.reply({ content: `This request has already been ${req.status}.`, flags: MessageFlags.Ephemeral });

  db.prepare(`UPDATE blacklist_requests SET status = 'rejected', manager_id = ?, rejection_reason = ?, processed_at = datetime('now') WHERE id = ?`).run(interaction.user.id, reason, blId);

  try {
    const channel = await client.channels.fetch(req.channel_id);
    const msg = await channel.messages.fetch(req.message_id);
    const embed = baseEmbed()
      .setColor(statusColor('rejected'))
      .setTitle('⛔ Blacklist Request — REJECTED')
      .setDescription(`**Request ID:** \`${blId}\`\n**Status:** ❌ Rejected by <@${interaction.user.id}>\n**Reason:** ${reason}`);
    await msg.edit({ embeds: [embed], components: [] });
  } catch (e) { console.error(e); }

  try {
    const user = await client.users.fetch(req.submitter_id);
    await user.send(`❌ Your blacklist request **${blId}** for **${req.server_name}** has been **rejected**.\n**Reason:** ${reason}`);
  } catch {}

  await interaction.reply({ content: `Blacklist request ${blId} has been rejected.`, flags: MessageFlags.Ephemeral });
}

// ==================== KEPT FOR COMPATIBILITY ====================

async function handleLike(interaction, postId, client) {
  const { db } = require('../database');
  const existing = db.prepare('SELECT 1 FROM post_likes WHERE post_id = ? AND user_id = ?').get(postId, interaction.user.id);
  if (existing) {
    db.prepare('DELETE FROM post_likes WHERE post_id = ? AND user_id = ?').run(postId, interaction.user.id);
    db.prepare('UPDATE posts SET likes = likes - 1 WHERE id = ?').run(postId);
  } else {
    db.prepare('INSERT INTO post_likes (post_id, user_id) VALUES (?, ?)').run(postId, interaction.user.id);
    db.prepare('UPDATE posts SET likes = likes + 1 WHERE id = ?').run(postId);
  }
  const post = db.prepare('SELECT likes FROM posts WHERE id = ?').get(postId);
  const likes = post ? post.likes : 0;
  const newRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`like_post_${postId}`).setLabel(`❤️ ${likes} Likes`).setStyle(ButtonStyle.Secondary)
  );
  await interaction.update({ components: [newRow] });
}

async function handlePollVote(interaction, pollId, optionIndex, client) {
  const { db } = require('../database');
  const { baseEmbed, BRAND_COLOR } = require('../utils/embeds');

  const poll = db.prepare('SELECT * FROM polls WHERE id = ?').get(pollId);
  if (!poll || poll.status !== 'active') {
    return interaction.reply({ content: 'This poll is closed or does not exist.', flags: MessageFlags.Ephemeral });
  }

  const multi = !!poll.multi;
  if (!multi) db.prepare('DELETE FROM poll_votes WHERE poll_id = ? AND user_id = ?').run(pollId, interaction.user.id);

  const already = db.prepare('SELECT 1 FROM poll_votes WHERE poll_id = ? AND user_id = ? AND option_index = ?').get(pollId, interaction.user.id, optionIndex);
  if (already && multi) {
    db.prepare('DELETE FROM poll_votes WHERE poll_id = ? AND user_id = ? AND option_index = ?').run(pollId, interaction.user.id, optionIndex);
  } else if (!already) {
    db.prepare('INSERT INTO poll_votes (poll_id, user_id, option_index) VALUES (?, ?, ?)').run(pollId, interaction.user.id, optionIndex);
  }

  try {
    const options = JSON.parse(poll.options || '[]');
    const votes = db.prepare('SELECT option_index, COUNT(*) as count FROM poll_votes WHERE poll_id = ? GROUP BY option_index').all(pollId);
    const voteMap = Object.fromEntries(votes.map(v => [v.option_index, v.count]));
    const total = votes.reduce((s, v) => s + v.count, 0);

    const results = options.map((o, i) => {
      const count = voteMap[i] || 0;
      const pct = total ? Math.round((count / total) * 100) : 0;
      return `**${i + 1}. ${o}** — ${count} (${pct}%)`;
    }).join('\n');

    const embed = baseEmbed()
      .setColor(BRAND_COLOR)
      .setTitle('📊 Department Poll')
      .setDescription(`**${poll.question}**\n\n${poll.description || ''}`)
      .addFields(
        { name: 'Current Results', value: results || 'No votes yet' },
        { name: 'Total Votes', value: String(total), inline: true },
        { name: 'Poll ID', value: `\`${pollId}\``, inline: true }
      );

    await interaction.message.edit({ embeds: [embed] });
  } catch (e) { console.error(e); }

  await interaction.reply({ content: 'Your vote has been recorded.', flags: MessageFlags.Ephemeral });
}

async function handleEmbedPublish(interaction, draftId, client) {
  let draftStore;
  try { ({ draftStore } = require('../commands/embed')); } catch {
    return interaction.update({ content: 'Draft system unavailable.', embeds: [], components: [] });
  }

  const draft = draftStore.get(draftId);
  if (!draft || draft.expires < Date.now()) {
    draftStore.delete(draftId);
    return interaction.update({ content: 'This draft has expired.', embeds: [], components: [] });
  }
  if (draft.creatorId !== interaction.user.id) {
    return interaction.reply({ content: 'This is not your draft.', flags: MessageFlags.Ephemeral });
  }

  const { generateEmbedId } = require('../utils/ids');
  const { db } = require('../database');

  const d = draft.embedData;
  const embed = new EmbedBuilder().setColor(d.color || 0x9B59B6).setTimestamp();
  if (d.title) embed.setTitle(d.title);
  if (d.description) embed.setDescription(d.description);
  if (d.image) embed.setImage(d.image);
  if (d.thumbnail) embed.setThumbnail(d.thumbnail);
  if (d.footer) embed.setFooter({ text: d.footer });
  if (d.author) embed.setAuthor({ name: d.author });

  const channel = await client.channels.fetch(draft.channelId).catch(() => null);
  if (!channel) return interaction.update({ content: 'Channel no longer available.', embeds: [], components: [] });

  const content = d.ping ? (d.ping.startsWith('<') ? d.ping : `<@&${d.ping}>`) : undefined;
  const msg = await channel.send({ content: content || undefined, embeds: [embed] });

  const embedId = generateEmbedId();
  db.prepare(`INSERT INTO custom_embeds (id, creator_id, channel_id, message_id, data) VALUES (?, ?, ?, ?, ?)`)\
    .run(embedId, interaction.user.id, channel.id, msg.id, JSON.stringify(d));

  draftStore.delete(draftId);
  await interaction.update({ content: `Embed published to <#${channel.id}>.\n**Embed ID:** \`${embedId}\``, embeds: [], components: [] });
}
