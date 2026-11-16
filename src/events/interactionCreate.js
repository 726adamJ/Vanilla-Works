const { MessageFlags, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, EmbedBuilder } = require('discord.js');
const { hasStaffRole, hasManagementRole, canApproveRequests } = require('../utils/permissions');

// In-memory temporary storage for outreach evidence collection
const tempOutreach = new Map();

module.exports = {
  name: 'interactionCreate',
  async execute(interaction, client) {
    if (!client.tempOutreach) client.tempOutreach = tempOutreach;

    try {
      // Slash commands
      if (interaction.isChatInputCommand()) {
        const command = client.commands.get(interaction.commandName);
        if (!command) return;
        await command.execute(interaction, client);
        return;
      }

      // Buttons
      if (interaction.isButton()) {
        const id = interaction.customId;

        // ===== Central Panel buttons =====
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

          // Discord modals max 5 components. Include the 5 most critical fields.
          const fields = [
            { id: 'invite', label: 'Discord Server Invite', style: TextInputStyle.Short },
            { id: 'prize', label: 'Their Prize', style: TextInputStyle.Short },
            { id: 'their_ping', label: 'Their Ping (role/user)', style: TextInputStyle.Short },
            { id: 'our_ping', label: 'Our Ping (role/user)', style: TextInputStyle.Short },
            { id: 'duration', label: 'Duration (+ winners e.g. 24h, 3 winners)', style: TextInputStyle.Short }
          ];

          modal.addComponents(...fields.map(f =>
            new ActionRowBuilder().addComponents(
              new TextInputBuilder()
                .setCustomId(f.id)
                .setLabel(f.label)
                .setStyle(f.style)
                .setRequired(true)
            )
          ));
          return interaction.showModal(modal);
        }

        if (id === 'request_partnership') {
          const modal = new ModalBuilder()
            .setCustomId('modal_partnership')
            .setTitle('Partnership Request');

          modal.addComponents(
            new ActionRowBuilder().addComponents(
              new TextInputBuilder().setCustomId('server_name').setLabel('Server Name').setStyle(TextInputStyle.Short).setRequired(true)
            ),
            new ActionRowBuilder().addComponents(
              new TextInputBuilder().setCustomId('our_ping').setLabel('Our Ping').setStyle(TextInputStyle.Short).setRequired(true)
            ),
            new ActionRowBuilder().addComponents(
              new TextInputBuilder().setCustomId('their_ping').setLabel('Their Ping').setStyle(TextInputStyle.Short).setRequired(true)
            ),
            new ActionRowBuilder().addComponents(
              new TextInputBuilder().setCustomId('partners_ad').setLabel('Partners Ad').setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(4000)
            )
          );
          return interaction.showModal(modal);
        }

        if (id === 'pr_log_outreach') {
          if (!hasStaffRole(interaction.member)) {
            return interaction.reply({ content: 'You do not have permission to use this feature.', flags: MessageFlags.Ephemeral });
          }
          const modal = new ModalBuilder()
            .setCustomId('modal_outreach')
            .setTitle('Log Outreach');

          modal.addComponents(
            new ActionRowBuilder().addComponents(
              new TextInputBuilder().setCustomId('server_invite').setLabel('Server Invite').setStyle(TextInputStyle.Short).setRequired(true)
            ),
            new ActionRowBuilder().addComponents(
              new TextInputBuilder().setCustomId('pings').setLabel('Pings Used').setStyle(TextInputStyle.Short).setRequired(true)
            ),
            new ActionRowBuilder().addComponents(
              new TextInputBuilder().setCustomId('type').setLabel('Type (Mutual or Partner)').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('Mutual or Partner')
            )
          );
          return interaction.showModal(modal);
        }

        if (id === 'pr_department_polls') {
          return interaction.reply({
            content: 'Use `/poll create` (management only) to create a new department poll.\nActive polls appear in the designated poll channel.',
            flags: MessageFlags.Ephemeral
          });
        }

        if (id === 'pr_staff_posts') {
          return interaction.reply({
            content: 'Use `/post create` to publish a staff post with caption, photo and optional ping.',
            flags: MessageFlags.Ephemeral
          });
        }

        // ===== Approval / Rejection =====
        if (id.startsWith('approve_req_')) {
          return handleApprove(interaction, id.replace('approve_req_', ''), client);
        }

        if (id.startsWith('reject_req_')) {
          const reqId = id.replace('reject_req_', '');
          const modal = new ModalBuilder()
            .setCustomId(`modal_reject_${reqId}`)
            .setTitle('Rejection Reason');
          modal.addComponents(
            new ActionRowBuilder().addComponents(
              new TextInputBuilder()
                .setCustomId('reason')
                .setLabel('Reason for rejection (required)')
                .setStyle(TextInputStyle.Paragraph)
                .setRequired(true)
                .setMaxLength(1000)
            )
          );
          return interaction.showModal(modal);
        }

        // ===== Like button =====
        if (id.startsWith('like_post_')) {
          return handleLike(interaction, id.replace('like_post_', ''), client);
        }

        // ===== Poll vote buttons =====
        if (id.startsWith('poll_vote_')) {
          const parts = id.split('_');
          const pollId = parts[2];
          const optionIndex = parseInt(parts[3], 10);
          return handlePollVote(interaction, pollId, optionIndex, client);
        }

        // ===== Embed publish / cancel =====
        if (id.startsWith('embed_publish_')) {
          return handleEmbedPublish(interaction, id.replace('embed_publish_', ''), client);
        }
        if (id.startsWith('embed_cancel_')) {
          const draftId = id.replace('embed_cancel_', '');
          try {
            const { draftStore } = require('../commands/embed');
            draftStore.delete(draftId);
          } catch {}
          return interaction.update({ content: 'Embed creation cancelled.', embeds: [], components: [] });
        }

        // ===== Outreach evidence skip =====
        if (id.startsWith('outreach_skip_')) {
          const userId = id.replace('outreach_skip_', '');
          if (interaction.user.id !== userId) {
            return interaction.reply({ content: 'This is not your submission.', flags: MessageFlags.Ephemeral });
          }
          return finalizeOutreach(interaction, userId, null, client);
        }

        return;
      }

      // ===== Modals =====
      if (interaction.isModalSubmit()) {
        const id = interaction.customId;

        if (id === 'modal_mutual_giveaway') return handleMutualSubmit(interaction, client);
        if (id === 'modal_partnership') return handlePartnershipSubmit(interaction, client);
        if (id === 'modal_outreach') return handleOutreachSubmit(interaction, client);
        if (id.startsWith('modal_reject_')) {
          return handleReject(interaction, id.replace('modal_reject_', ''), client);
        }
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

// ==================== Handlers ====================

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

  db.prepare(`
    INSERT INTO requests (id, type, submitter_id, status, data)
    VALUES (?, 'mutual_giveaway', ?, 'pending', ?)
  `).run(reqId, submitter.id, JSON.stringify(data));

  const approvalChannelId = getConfig('approval_channel');
  if (!approvalChannelId) {
    return interaction.reply({ content: 'Approval channel is not configured. Please contact an administrator.', flags: MessageFlags.Ephemeral });
  }

  const channel = await client.channels.fetch(approvalChannelId).catch(() => null);
  if (!channel) {
    return interaction.reply({ content: 'Could not find the approval channel.', flags: MessageFlags.Ephemeral });
  }

  const embed = baseEmbed()
    .setColor(statusColor('pending'))
    .setTitle('Mutual Giveaway Request')
    .setDescription(`**Request ID:** \`${reqId}\`\n**Status:** Pending Approval`)
    .addFields(
      { name: 'Submitted by', value: `<@${submitter.id}> (${submitter.tag})`, inline: true },
      { name: 'Server Invite', value: data.invite, inline: false },
      { name: 'Their Prize', value: data.prize, inline: true },
      { name: 'Duration', value: data.duration, inline: true },
      { name: 'Winners', value: data.winners, inline: true },
      { name: 'Their Ping', value: data.their_ping, inline: true },
      { name: 'Our Ping', value: data.our_ping, inline: true }
    )
    .setTimestamp();

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`approve_req_${reqId}`).setLabel('Approve').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`reject_req_${reqId}`).setLabel('Reject').setStyle(ButtonStyle.Danger)
  );

  const msg = await channel.send({ embeds: [embed], components: [row] });
  db.prepare(`UPDATE requests SET message_id = ?, channel_id = ? WHERE id = ?`).run(msg.id, channel.id, reqId);

  await interaction.reply({
    content: `Your Mutual Giveaway request has been submitted.\n**Reference ID:** \`${reqId}\`\nManagement has been notified.`,
    flags: MessageFlags.Ephemeral
  });

  try {
    await submitter.send(`Your Mutual Giveaway request (\`${reqId}\`) has been submitted and is pending approval.`);
  } catch {}
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

  db.prepare(`
    INSERT INTO requests (id, type, submitter_id, status, data)
    VALUES (?, 'partnership', ?, 'pending', ?)
  `).run(reqId, submitter.id, JSON.stringify(data));

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
    .setDescription(`**Request ID:** \`${reqId}\`\n**Status:** Pending Approval`)
    .addFields(
      { name: 'Submitted by', value: `<@${submitter.id}> (${submitter.tag})`, inline: true },
      { name: 'Server Name', value: data.server_name, inline: true },
      { name: 'Our Ping', value: data.our_ping, inline: true },
      { name: 'Their Ping', value: data.their_ping, inline: true },
      { name: 'Partners Ad', value: data.partners_ad.slice(0, 1024) || '—', inline: false }
    )
    .setTimestamp();

  if (data.partners_ad.length > 1024) {
    embed.addFields({ name: 'Partners Ad (continued)', value: data.partners_ad.slice(1024, 2048) });
  }

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`approve_req_${reqId}`).setLabel('Approve').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`reject_req_${reqId}`).setLabel('Reject').setStyle(ButtonStyle.Danger)
  );

  const msg = await channel.send({ embeds: [embed], components: [row] });
  db.prepare(`UPDATE requests SET message_id = ?, channel_id = ? WHERE id = ?`).run(msg.id, channel.id, reqId);

  await interaction.reply({
    content: `Your Partnership request has been submitted.\n**Reference ID:** \`${reqId}\``,
    flags: MessageFlags.Ephemeral
  });

  try {
    await submitter.send(`Your Partnership request (\`${reqId}\`) has been submitted and is pending approval.`);
  } catch {}
}

async function handleApprove(interaction, reqId, client) {
  const { db } = require('../database');
  const { baseEmbed, statusColor } = require('../utils/embeds');

  if (!canApproveRequests(interaction.member)) {
    return interaction.reply({ content: 'Only authorised management can approve requests.', flags: MessageFlags.Ephemeral });
  }

  const req = db.prepare('SELECT * FROM requests WHERE id = ?').get(reqId);
  if (!req) return interaction.reply({ content: 'Request not found.', flags: MessageFlags.Ephemeral });
  if (req.status !== 'pending') {
    return interaction.reply({ content: `This request has already been ${req.status}.`, flags: MessageFlags.Ephemeral });
  }

  db.prepare(`UPDATE requests SET status = 'approved', manager_id = ?, processed_at = datetime('now') WHERE id = ?`)
    .run(interaction.user.id, reqId);

  try {
    const channel = await client.channels.fetch(req.channel_id);
    const msg = await channel.messages.fetch(req.message_id);
    const data = JSON.parse(req.data);
    const embed = baseEmbed()
      .setColor(statusColor('approved'))
      .setTitle(req.type === 'mutual_giveaway' ? 'Mutual Giveaway Request' : 'Partnership Request')
      .setDescription(`**Request ID:** \`${reqId}\`\n**Status:** ✅ Approved by <@${interaction.user.id}>`)
      .setTimestamp();

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
  } catch (e) {
    console.error('Failed to update approval message', e);
  }

  try {
    const user = await client.users.fetch(req.submitter_id);
    await user.send(`✅ Your request **${reqId}** has been **approved** by management.\nProcessed by: ${interaction.user.tag}`);
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
  if (req.status !== 'pending') {
    return interaction.reply({ content: `This request has already been ${req.status}.`, flags: MessageFlags.Ephemeral });
  }

  db.prepare(`UPDATE requests SET status = 'rejected', manager_id = ?, rejection_reason = ?, processed_at = datetime('now') WHERE id = ?`)
    .run(interaction.user.id, reason, reqId);

  try {
    const channel = await client.channels.fetch(req.channel_id);
    const msg = await channel.messages.fetch(req.message_id);
    const embed = baseEmbed()
      .setColor(statusColor('rejected'))
      .setTitle(req.type === 'mutual_giveaway' ? 'Mutual Giveaway Request' : 'Partnership Request')
      .setDescription(`**Request ID:** \`${reqId}\`\n**Status:** ❌ Rejected by <@${interaction.user.id}>\n**Reason:** ${reason}`)
      .setTimestamp();
    await msg.edit({ embeds: [embed], components: [] });
  } catch (e) {
    console.error(e);
  }

  try {
    const user = await client.users.fetch(req.submitter_id);
    await user.send(`❌ Your request **${reqId}** has been **rejected**.\n**Reason:** ${reason}\nProcessed by: ${interaction.user.tag}`);
  } catch {}

  await interaction.reply({ content: `Request ${reqId} has been rejected.`, flags: MessageFlags.Ephemeral });
}

async function handleOutreachSubmit(interaction, client) {
  const { db } = require('../database');

  const serverInvite = interaction.fields.getTextInputValue('server_invite');
  const pings = interaction.fields.getTextInputValue('pings');
  let type = interaction.fields.getTextInputValue('type').trim();
  if (!['Mutual', 'Partner'].includes(type)) {
    type = type.toLowerCase().includes('partner') ? 'Partner' : 'Mutual';
  }

  const userId = interaction.user.id;
  const assignment = db.prepare('SELECT thread_id FROM staff_threads WHERE user_id = ?').get(userId);

  if (!assignment) {
    return interaction.reply({
      content: 'Your outreach logging setup is incomplete. Please ask an administrator to run `/staff log setup` for you.',
      flags: MessageFlags.Ephemeral
    });
  }

  // Store temporarily and ask for evidence
  client.tempOutreach.set(userId, {
    serverInvite,
    pings,
    type,
    threadId: assignment.thread_id,
    expires: Date.now() + 60 * 1000
  });

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`outreach_skip_${userId}`)
      .setLabel('Skip Evidence')
      .setStyle(ButtonStyle.Secondary)
  );

  await interaction.reply({
    content: 'Please **upload the photographic evidence** (image) as a reply to this message within **60 seconds**, or click **Skip Evidence**.',
    components: [row],
    flags: MessageFlags.Ephemeral
  });

  // Collector for image
  const filter = m => m.author.id === userId && m.attachments.size > 0;
  const collector = interaction.channel.createMessageCollector({ filter, time: 60000, max: 1 });

  collector.on('collect', async (msg) => {
    const attachment = msg.attachments.first();
    const evidenceUrl = attachment && attachment.contentType?.startsWith('image/') ? attachment.url : null;
    await finalizeOutreach(interaction, userId, evidenceUrl, client);
    try { await msg.delete(); } catch {}
  });

  collector.on('end', async (collected) => {
    if (collected.size === 0 && client.tempOutreach.has(userId)) {
      // Timed out – still finalize without evidence if not already done
      await finalizeOutreach(interaction, userId, null, client);
    }
  });
}

async function finalizeOutreach(interaction, userId, evidenceUrl, client) {
  const { db, getConfig } = require('../database');
  const { generateLogId } = require('../utils/ids');
  const { baseEmbed } = require('../utils/embeds');

  const temp = client.tempOutreach.get(userId);
  if (!temp) return;
  client.tempOutreach.delete(userId);

  const logId = generateLogId();
  const thread = await client.channels.fetch(temp.threadId).catch(() => null);
  if (!thread) {
    try {
      await interaction.followUp({ content: 'Could not find your assigned thread. Please contact management.', flags: MessageFlags.Ephemeral });
    } catch {}
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
    )
    .setTimestamp();

  if (evidenceUrl) {
    embed.setImage(evidenceUrl);
  }

  const notifyRole = getConfig('outreach_ping_role');
  const content = notifyRole ? `<@&${notifyRole}>` : null;

  const msg = await thread.send({ content, embeds: [embed] });

  db.prepare(`
    INSERT INTO outreach_logs (id, user_id, server_invite, pings, type, evidence_url, thread_id, message_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(logId, userId, temp.serverInvite, temp.pings, temp.type, evidenceUrl, temp.threadId, msg.id);

  try {
    const user = await client.users.fetch(userId);
    await user.send(`Your outreach log **${logId}** has been recorded successfully.`);
  } catch {}

  try {
    await interaction.editReply({ content: `Outreach log **${logId}** recorded successfully.`, components: [] });
  } catch {
    try {
      await interaction.followUp({ content: `Outreach log **${logId}** recorded successfully.`, flags: MessageFlags.Ephemeral });
    } catch {}
  }
}

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
    new ButtonBuilder()
      .setCustomId(`like_post_${postId}`)
      .setLabel(`❤️ ${likes} Likes`)
      .setStyle(ButtonStyle.Secondary)
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
  if (!multi) {
    db.prepare('DELETE FROM poll_votes WHERE poll_id = ? AND user_id = ?').run(pollId, interaction.user.id);
  }

  const already = db.prepare('SELECT 1 FROM poll_votes WHERE poll_id = ? AND user_id = ? AND option_index = ?').get(pollId, interaction.user.id, optionIndex);
  if (already && multi) {
    db.prepare('DELETE FROM poll_votes WHERE poll_id = ? AND user_id = ? AND option_index = ?').run(pollId, interaction.user.id, optionIndex);
  } else if (!already) {
    db.prepare('INSERT INTO poll_votes (poll_id, user_id, option_index) VALUES (?, ?, ?)').run(pollId, interaction.user.id, optionIndex);
  }

  // Update embed with live results
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
        { name: 'Current Results', value: results || 'No votes yet', inline: false },
        { name: 'Total Votes', value: String(total), inline: true },
        { name: 'Poll ID', value: `\`${pollId}\``, inline: true }
      )
      .setFooter({ text: `Created by management • Ends <t:${Math.floor(new Date(poll.ends_at).getTime() / 1000)}:R>` });

    await interaction.message.edit({ embeds: [embed] });
  } catch (e) {
    console.error('Failed to update poll embed', e);
  }

  await interaction.reply({ content: 'Your vote has been recorded.', flags: MessageFlags.Ephemeral });
}

async function handleEmbedPublish(interaction, draftId, client) {
  let draftStore;
  try {
    ({ draftStore } = require('../commands/embed'));
  } catch {
    return interaction.update({ content: 'Draft system unavailable.', embeds: [], components: [] });
  }

  const draft = draftStore.get(draftId);
  if (!draft || draft.expires < Date.now()) {
    draftStore.delete(draftId);
    return interaction.update({ content: 'This draft has expired. Please create a new embed.', embeds: [], components: [] });
  }

  if (draft.creatorId !== interaction.user.id) {
    return interaction.reply({ content: 'This is not your draft.', flags: MessageFlags.Ephemeral });
  }

  const { generateEmbedId } = require('../utils/ids');
  const { db } = require('../database');

  const d = draft.embedData;
  const embed = new EmbedBuilder()
    .setColor(d.color || 0x9B59B6)
    .setTimestamp();

  if (d.title) embed.setTitle(d.title);
  if (d.description) embed.setDescription(d.description);
  if (d.image) embed.setImage(d.image);
  if (d.thumbnail) embed.setThumbnail(d.thumbnail);
  if (d.footer) embed.setFooter({ text: d.footer });
  if (d.author) embed.setAuthor({ name: d.author });

  const channel = await client.channels.fetch(draft.channelId).catch(() => null);
  if (!channel) {
    return interaction.update({ content: 'Destination channel no longer available.', embeds: [], components: [] });
  }

  const content = d.ping ? (d.ping.startsWith('<') ? d.ping : `<@&${d.ping}>`) : undefined;
  const msg = await channel.send({ content: content || undefined, embeds: [embed] });

  const embedId = generateEmbedId();
  db.prepare(`
    INSERT INTO custom_embeds (id, creator_id, channel_id, message_id, data)
    VALUES (?, ?, ?, ?, ?)
  `).run(embedId, interaction.user.id, channel.id, msg.id, JSON.stringify(d));

  draftStore.delete(draftId);

  await interaction.update({
    content: `Embed published successfully to <#${channel.id}>.\n**Embed ID:** \`${embedId}\``,
    embeds: [],
    components: []
  });
}
