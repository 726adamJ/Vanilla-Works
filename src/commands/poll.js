const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { db, getConfig } = require('../database');
const { generatePollId } = require('../utils/ids');
const { baseEmbed, BRAND_COLOR } = require('../utils/embeds');
const { canCreatePolls } = require('../utils/permissions');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('poll')
    .setDescription('Create and manage department polls')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand(sub =>
      sub.setName('create')
        .setDescription('Create a new department poll')
        .addStringOption(o => o.setName('question').setDescription('Poll question').setRequired(true).setMaxLength(256))
        .addStringOption(o => o.setName('options').setDescription('Comma-separated options (2-10)').setRequired(true))
        .addStringOption(o => o.setName('description').setDescription('Optional description').setRequired(false).setMaxLength(1000))
        .addIntegerOption(o => o.setName('duration').setDescription('Duration in minutes (default 60)').setRequired(false).setMinValue(1).setMaxValue(10080))
        .addBooleanOption(o => o.setName('anonymous').setDescription('Anonymous voting?').setRequired(false))
        .addBooleanOption(o => o.setName('multi').setDescription('Allow multiple selections?').setRequired(false))
        .addChannelOption(o => o.setName('channel').setDescription('Channel to post the poll (defaults to configured poll channel)').setRequired(false))
    )
    .addSubcommand(sub =>
      sub.setName('end')
        .setDescription('Manually end an active poll')
        .addStringOption(o => o.setName('poll_id').setDescription('Poll ID').setRequired(true))
    ),

  async execute(interaction) {
    if (!canCreatePolls(interaction.member)) {
      return interaction.reply({ content: 'Only management can manage polls.', flags: MessageFlags.Ephemeral });
    }

    const sub = interaction.options.getSubcommand();

    if (sub === 'create') {
      const question = interaction.options.getString('question');
      const optionsRaw = interaction.options.getString('options');
      const description = interaction.options.getString('description') || null;
      const duration = interaction.options.getInteger('duration') || 60;
      const anonymous = interaction.options.getBoolean('anonymous') ?? false;
      const multi = interaction.options.getBoolean('multi') ?? false;
      let channel = interaction.options.getChannel('channel');

      const options = optionsRaw.split(',').map(o => o.trim()).filter(Boolean);
      if (options.length < 2 || options.length > 10) {
        return interaction.reply({ content: 'Please provide between 2 and 10 options, separated by commas.', flags: MessageFlags.Ephemeral });
      }

      if (!channel) {
        const pollChannelId = getConfig('poll_channel');
        if (pollChannelId) {
          channel = await interaction.client.channels.fetch(pollChannelId).catch(() => null);
        }
      }
      if (!channel) {
        return interaction.reply({ content: 'No poll channel configured and none provided. Use `/config` to set a poll channel or specify one.', flags: MessageFlags.Ephemeral });
      }

      const pollId = generatePollId();
      const endsAt = new Date(Date.now() + duration * 60 * 1000).toISOString();

      db.prepare(`
        INSERT INTO polls (id, question, description, options, duration_minutes, anonymous, multi, creator_id, channel_id, status, ends_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?)
      `).run(
        pollId,
        question,
        description,
        JSON.stringify(options),
        duration,
        anonymous ? 1 : 0,
        multi ? 1 : 0,
        interaction.user.id,
        channel.id,
        endsAt
      );

      const embed = baseEmbed()
        .setColor(BRAND_COLOR)
        .setTitle('📊 Department Poll')
        .setDescription(`**${question}**\n\n${description || ''}`)
        .addFields(
          { name: 'Options', value: options.map((o, i) => `**${i + 1}.** ${o}`).join('\n'), inline: false },
          { name: 'Duration', value: `${duration} minutes`, inline: true },
          { name: 'Type', value: `${anonymous ? 'Anonymous' : 'Public'} • ${multi ? 'Multi-select' : 'Single choice'}`, inline: true },
          { name: 'Poll ID', value: `\`${pollId}\``, inline: true }
        )
        .setFooter({ text: `Created by ${interaction.user.tag} • Ends <t:${Math.floor(new Date(endsAt).getTime() / 1000)}:R>` });

      // Create vote buttons (max 5 per row)
      const rows = [];
      let currentRow = new ActionRowBuilder();
      options.forEach((opt, i) => {
        currentRow.addComponents(
          new ButtonBuilder()
            .setCustomId(`poll_vote_${pollId}_${i}`)
            .setLabel(`${i + 1}. ${opt.slice(0, 70)}`)
            .setStyle(ButtonStyle.Primary)
        );
        if ((i + 1) % 5 === 0 || i === options.length - 1) {
          rows.push(currentRow);
          currentRow = new ActionRowBuilder();
        }
      });

      const msg = await channel.send({ embeds: [embed], components: rows });
      db.prepare('UPDATE polls SET message_id = ? WHERE id = ?').run(msg.id, pollId);

      await interaction.reply({
        content: `Poll created successfully in <#${channel.id}>.\n**Poll ID:** \`${pollId}\``,
        flags: MessageFlags.Ephemeral
      });
    }

    if (sub === 'end') {
      const pollId = interaction.options.getString('poll_id');
      const poll = db.prepare('SELECT * FROM polls WHERE id = ?').get(pollId);
      if (!poll) {
        return interaction.reply({ content: 'Poll not found.', flags: MessageFlags.Ephemeral });
      }
      if (poll.status !== 'active') {
        return interaction.reply({ content: 'This poll is already closed.', flags: MessageFlags.Ephemeral });
      }

      db.prepare(`UPDATE polls SET status = 'closed' WHERE id = ?`).run(pollId);

      // Update message
      try {
        const channel = await interaction.client.channels.fetch(poll.channel_id);
        const msg = await channel.messages.fetch(poll.message_id);
        const options = JSON.parse(poll.options);
        const votes = db.prepare('SELECT option_index, COUNT(*) as count FROM poll_votes WHERE poll_id = ? GROUP BY option_index').all(pollId);
        const voteMap = Object.fromEntries(votes.map(v => [v.option_index, v.count]));
        const total = votes.reduce((s, v) => s + v.count, 0);

        const results = options.map((o, i) => {
          const count = voteMap[i] || 0;
          const pct = total ? Math.round((count / total) * 100) : 0;
          return `**${i + 1}. ${o}** — ${count} vote${count !== 1 ? 's' : ''} (${pct}%)`;
        }).join('\n');

        const embed = baseEmbed()
          .setColor(0x95A5A6)
          .setTitle('📊 Department Poll — CLOSED')
          .setDescription(`**${poll.question}**\n\n${poll.description || ''}`)
          .addFields(
            { name: 'Final Results', value: results || 'No votes', inline: false },
            { name: 'Total Votes', value: String(total), inline: true },
            { name: 'Poll ID', value: `\`${pollId}\``, inline: true }
          )
          .setFooter({ text: 'Poll closed • Vanilla Works | Public Relations' });

        await msg.edit({ embeds: [embed], components: [] });
      } catch (e) {
        console.error('Failed to update poll message', e);
      }

      await interaction.reply({ content: `Poll \`${pollId}\` has been closed.`, flags: MessageFlags.Ephemeral });
    }
  }
};
