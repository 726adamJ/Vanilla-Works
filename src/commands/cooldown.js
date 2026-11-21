const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  MessageFlags,
  ChannelType,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder
} = require('discord.js');
const { hasManagementRole } = require('../utils/permissions');
const { baseEmbed, SUCCESS_COLOR, DANGER_COLOR } = require('../utils/embeds');
const { db, setConfig, getConfig } = require('../database');
const {
  buildCooldownEmbed,
  refreshCooldownPanel,
  formatRemaining,
  parseCooldownList
} = require('../utils/cooldownPanel');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('cooldown')
    .setDescription('Manage server outreach cooldowns')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand(sub =>
      sub.setName('panel')
        .setDescription('Post or refresh the cooldown panel')
        .addChannelOption(o =>
          o.setName('channel')
            .setDescription('Channel to post the panel in (required first time)')
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
            .setRequired(false)
        )
    )
    .addSubcommand(sub =>
      sub.setName('add')
        .setDescription('Manually put one server on cooldown')
        .addStringOption(o =>
          o.setName('server_name')
            .setDescription('Server name')
            .setRequired(true)
            .setMaxLength(100)
        )
        .addNumberOption(o =>
          o.setName('days')
            .setDescription('How many days on cooldown (default 10)')
            .setRequired(false)
            .setMinValue(0.1)
            .setMaxValue(365)
        )
    )
    .addSubcommand(sub =>
      sub.setName('import')
        .setDescription('Bulk-import cooldowns from a DD/MM/YYYY - Server list')
    )
    .addSubcommand(sub =>
      sub.setName('remove')
        .setDescription('Remove a server from cooldown early')
        .addStringOption(o =>
          o.setName('server_name')
            .setDescription('Exact server name on the list')
            .setRequired(true)
            .setMaxLength(100)
        )
    )
    .addSubcommand(sub =>
      sub.setName('list')
        .setDescription('Show current cooldowns (ephemeral)')
    ),

  async execute(interaction, client) {
    if (!hasManagementRole(interaction.member)) {
      return interaction.reply({
        content: 'Only management can manage cooldowns.',
        flags: MessageFlags.Ephemeral
      });
    }

    const sub = interaction.options.getSubcommand();

    if (sub === 'panel') {
      const channelOpt = interaction.options.getChannel('channel');
      let channelId = getConfig('cooldown_panel_channel');
      let messageId = getConfig('cooldown_panel_message');

      if (channelOpt) channelId = channelOpt.id;

      if (!channelId) {
        return interaction.reply({
          content: 'Provide a **channel** the first time you run `/cooldown panel`.',
          flags: MessageFlags.Ephemeral
        });
      }

      const channel = await client.channels.fetch(channelId).catch(() => null);
      if (!channel || !channel.isTextBased()) {
        return interaction.reply({
          content: 'Could not access that channel.',
          flags: MessageFlags.Ephemeral
        });
      }

      const embed = buildCooldownEmbed();

      if (messageId) {
        const existing = await channel.messages.fetch(messageId).catch(() => null);
        if (existing) {
          await existing.edit({ embeds: [embed] });
          setConfig('cooldown_panel_channel', channelId);
          setConfig('cooldown_panel_message', existing.id);
          return interaction.reply({
            content: 'Cooldown panel updated in <#' + channelId + '>.',
            flags: MessageFlags.Ephemeral
          });
        }
      }

      const msg = await channel.send({ embeds: [embed] });
      setConfig('cooldown_panel_channel', channelId);
      setConfig('cooldown_panel_message', msg.id);
      return interaction.reply({
        content: 'Cooldown panel posted in <#' + channelId + '>.',
        flags: MessageFlags.Ephemeral
      });
    }

    if (sub === 'import') {
      const modal = new ModalBuilder()
        .setCustomId('modal_cooldown_import')
        .setTitle('Import Cooldown List');

      modal.addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('list')
            .setLabel('Paste list (DD/MM/YYYY - Server Name)')
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(true)
            .setMaxLength(4000)
            .setPlaceholder('28/11/2026 - Voidcrafts\n27/11/2026 - Cyntra\n26/11/2026 - Codex Customs')
        )
      );

      return interaction.showModal(modal);
    }

    if (sub === 'add') {
      const serverName = interaction.options.getString('server_name').trim();
      const days = interaction.options.getNumber('days') ?? 10;

      const existing = db.prepare(
        'SELECT id FROM server_cooldowns WHERE lower(server_name) = lower(?) AND expires_at > ?'
      ).get(serverName, new Date().toISOString());

      if (existing) {
        return interaction.reply({
          content: '**' + serverName + '** is already on cooldown. Remove it first or wait for it to expire.',
          flags: MessageFlags.Ephemeral
        });
      }

      const expires = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
      db.prepare(
        'INSERT INTO server_cooldowns (server_name, expires_at, duration_days, added_by) VALUES (?, ?, ?, ?)'
      ).run(serverName, expires, days, interaction.user.id);

      await refreshCooldownPanel(client);

      return interaction.reply({
        embeds: [
          baseEmbed()
            .setColor(SUCCESS_COLOR)
            .setTitle('Server Added to Cooldown')
            .setDescription(
              '**Server:** ' + serverName + '\n' +
              '**Duration:** ' + days + ' day(s)\n' +
              '**Remaining:** ' + formatRemaining(expires) + '\n' +
              'Ends <t:' + Math.floor(new Date(expires).getTime() / 1000) + ':R>'
            )
        ],
        flags: MessageFlags.Ephemeral
      });
    }

    if (sub === 'remove') {
      const serverName = interaction.options.getString('server_name').trim();
      const row = db.prepare(
        'SELECT id FROM server_cooldowns WHERE lower(server_name) = lower(?)'
      ).get(serverName);

      if (!row) {
        return interaction.reply({
          content: 'No cooldown found for **' + serverName + '**.',
          flags: MessageFlags.Ephemeral
        });
      }

      db.prepare('DELETE FROM server_cooldowns WHERE id = ?').run(row.id);
      await refreshCooldownPanel(client);

      return interaction.reply({
        embeds: [
          baseEmbed()
            .setColor(DANGER_COLOR)
            .setTitle('Cooldown Removed')
            .setDescription('**' + serverName + '** has been removed from the cooldown list.')
        ],
        flags: MessageFlags.Ephemeral
      });
    }

    if (sub === 'list') {
      const embed = buildCooldownEmbed();
      return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }
  }
};

// Modal handler (called from interactionCreate)
async function handleCooldownImportModal(interaction, client) {
  const { hasManagementRole } = require('../utils/permissions');
  if (!hasManagementRole(interaction.member)) {
    return interaction.reply({
      content: 'Only management can import cooldowns.',
      flags: MessageFlags.Ephemeral
    });
  }

  const text = interaction.fields.getTextInputValue('list');
  const { results, skipped } = parseCooldownList(text);

  if (!results.length) {
    return interaction.reply({
      content:
        'No valid lines found. Use format:\n`28/11/2026 - Server Name`' +
        (skipped.length ? '\n\nSkipped:\n' + skipped.slice(0, 10).join('\n') : ''),
      flags: MessageFlags.Ephemeral
    });
  }

  let added = 0;
  let updated = 0;
  const names = [];

  const insert = db.prepare(
    'INSERT INTO server_cooldowns (server_name, expires_at, duration_days, added_by) VALUES (?, ?, ?, ?)'
  );
  const findActive = db.prepare(
    'SELECT id FROM server_cooldowns WHERE lower(server_name) = lower(?) AND expires_at > ?'
  );
  const del = db.prepare('DELETE FROM server_cooldowns WHERE id = ?');

  for (const item of results) {
    const existing = findActive.get(item.serverName, new Date().toISOString());
    if (existing) {
      del.run(existing.id);
      updated++;
    } else {
      added++;
    }
    insert.run(item.serverName, item.expiresAt, item.durationDays, interaction.user.id);
    names.push(item.serverName);
  }

  await refreshCooldownPanel(client);

  const skipText = skipped.length
    ? '\n\n**Skipped (' + skipped.length + '):**\n' + skipped.slice(0, 15).map(s => '• ' + s).join('\n')
    : '';

  return interaction.reply({
    embeds: [
      baseEmbed()
        .setColor(SUCCESS_COLOR)
        .setTitle('Cooldown Import Complete')
        .setDescription(
          '**Added:** ' + added + '\n' +
          '**Updated:** ' + updated + '\n' +
          '**Total processed:** ' + results.length + '\n\n' +
          names.slice(0, 25).map(n => '• ' + n).join('\n') +
          (names.length > 25 ? '\n…and ' + (names.length - 25) + ' more' : '') +
          skipText +
          '\n\nPanel sorted **longest → shortest**. Run `/cooldown panel` if the panel is not posted yet.'
        )
    ],
    flags: MessageFlags.Ephemeral
  });
}

module.exports.handleCooldownImportModal = handleCooldownImportModal;
