const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { hasManagementRole } = require('../utils/permissions');
const { baseEmbed, dmEmbed, SUCCESS_COLOR } = require('../utils/embeds');
const { db, getConfig } = require('../database');
const { generateLogId } = require('../utils/ids');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('add')
    .setDescription('Management tools for adding data')
    .addSubcommand(sub =>
      sub.setName('log')
        .setDescription('Log outreach on behalf of a staff member')
        .addUserOption(o =>
          o.setName('member')
            .setDescription('Staff member to log for')
            .setRequired(true)
        )
        .addStringOption(o =>
          o.setName('type')
            .setDescription('Outreach type')
            .setRequired(true)
            .addChoices(
              { name: 'Mutual Giveaway', value: 'Mutual' },
              { name: 'Partnership', value: 'Partner' }
            )
        )
        .addStringOption(o =>
          o.setName('server_invite')
            .setDescription('Server invite link')
            .setRequired(true)
        )
        .addStringOption(o =>
          o.setName('pings')
            .setDescription('Pings used')
            .setRequired(true)
        )
        .addStringOption(o =>
          o.setName('evidence')
            .setDescription('Optional evidence link')
            .setRequired(false)
        )
    ),

  async execute(interaction, client) {
    if (!hasManagementRole(interaction.member)) {
      return interaction.reply({ content: 'Only management can use this command.', flags: MessageFlags.Ephemeral });
    }

    const member = interaction.options.getUser('member');
    const type = interaction.options.getString('type');
    const serverInvite = interaction.options.getString('server_invite');
    const pings = interaction.options.getString('pings');
    const evidenceLink = interaction.options.getString('evidence') || null;
    const userId = member.id;
    const logId = generateLogId();

    let targetChannel = null;
    const assignment = db.prepare('SELECT thread_id FROM staff_threads WHERE user_id = ?').get(userId);
    if (assignment && assignment.thread_id) {
      targetChannel = await client.channels.fetch(assignment.thread_id).catch(() => null);
    }
    if (!targetChannel) {
      const channelId = getConfig('outreach_channel') || getConfig('approval_channel');
      if (channelId) targetChannel = await client.channels.fetch(channelId).catch(() => null);
    }
    if (!targetChannel) {
      return interaction.reply({
        content: 'No log channel/thread available. Set Outreach Log Channel or assign a staff thread with /staff log.',
        flags: MessageFlags.Ephemeral
      });
    }

    const embed = baseEmbed()
      .setColor(0x000000)
      .setTitle('Outreach Log — ' + type)
      .setDescription('**Log ID:** `' + logId + '`\n*Logged by management on behalf of staff*')
      .addFields(
        { name: 'Staff', value: '<@' + userId + '>', inline: true },
        { name: 'Type', value: type, inline: true },
        { name: 'Logged by', value: '<@' + interaction.user.id + '>', inline: true },
        { name: 'Server Invite', value: serverInvite },
        { name: 'Pings Used', value: pings }
      );

    if (evidenceLink) {
      embed.addFields({ name: 'Evidence', value: '[View](' + evidenceLink + ')' });
      if (/\.(png|jpe?g|gif|webp)/i.test(evidenceLink) || evidenceLink.includes('media.discordapp') || evidenceLink.includes('cdn.discordapp')) {
        embed.setImage(evidenceLink);
      }
    }

    const pingRole = getConfig('outreach_ping_role');
    const content = pingRole ? '<@&' + pingRole + '>' : null;
    const msg = await targetChannel.send({ content, embeds: [embed] });

    db.prepare(
      'INSERT INTO outreach_logs (id, user_id, server_invite, pings, type, evidence_url, thread_id, message_id, channel_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(logId, userId, serverInvite, pings, type, evidenceLink, targetChannel.id, msg.id, targetChannel.id);

    await interaction.reply({
      embeds: [baseEmbed()
        .setColor(SUCCESS_COLOR)
        .setTitle('Log Added')
        .setDescription('Logged **' + type + '** for <@' + userId + '>\n**Log ID:** `' + logId + '`')
      ],
      flags: MessageFlags.Ephemeral
    });

    try {
      await member.send({
        embeds: [dmEmbed(
          'Outreach Logged for You',
          'Management logged a **' + type + '** outreach on your behalf.\n**Log ID:** `' + logId + '`',
          SUCCESS_COLOR
        )]
      });
    } catch {}
  }
};
