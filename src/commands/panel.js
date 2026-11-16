const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const { panelEmbed, panelButtons } = require('../utils/embeds');
const { db } = require('../database');
const { hasManagementRole } = require('../utils/permissions');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('panel')
    .setDescription('Create or update the central Staff PR Panel')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand(sub =>
      sub.setName('create')
        .setDescription('Create the permanent Staff PR Panel in this channel')
    )
    .addSubcommand(sub =>
      sub.setName('update')
        .setDescription('Update the existing Staff PR Panel message')
    ),

  async execute(interaction) {
    if (!hasManagementRole(interaction.member) && !interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({ content: 'Only administrators/management can manage the panel.', flags: MessageFlags.Ephemeral });
    }

    const sub = interaction.options.getSubcommand();

    if (sub === 'create') {
      const embed = panelEmbed();
      const components = [panelButtons()];

      const msg = await interaction.channel.send({ embeds: [embed], components });

      db.prepare(`
        INSERT OR REPLACE INTO panel (guild_id, channel_id, message_id)
        VALUES (?, ?, ?)
      `).run(interaction.guildId, interaction.channelId, msg.id);

      // Also store channel for convenience
      require('../database').setConfig('panel_channel', interaction.channelId);

      await interaction.reply({
        content: 'Staff PR Panel has been created successfully.',
        flags: MessageFlags.Ephemeral
      });
    } else if (sub === 'update') {
      const row = db.prepare('SELECT * FROM panel WHERE guild_id = ?').get(interaction.guildId);
      if (!row) {
        return interaction.reply({ content: 'No panel found. Use `/panel create` first.', flags: MessageFlags.Ephemeral });
      }

      try {
        const channel = await interaction.client.channels.fetch(row.channel_id);
        const msg = await channel.messages.fetch(row.message_id);
        await msg.edit({ embeds: [panelEmbed()], components: [panelButtons()] });
        await interaction.reply({ content: 'Panel updated.', flags: MessageFlags.Ephemeral });
      } catch (e) {
        await interaction.reply({ content: 'Failed to update panel. It may have been deleted. Use `/panel create` again.', flags: MessageFlags.Ephemeral });
      }
    }
  }
};
