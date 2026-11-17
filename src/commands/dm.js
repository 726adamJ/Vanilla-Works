const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const { hasManagementRole } = require('../utils/permissions');
const { dmEmbed, BRAND_COLOR } = require('../utils/embeds');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('dm')
    .setDescription('Send a direct message to a staff member')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand(sub =>
      sub.setName('staff')
        .setDescription('Send a custom message to a staff member via DM')
        .addUserOption(o =>
          o.setName('member')
            .setDescription('The staff member to message')
            .setRequired(true)
        )
        .addStringOption(o =>
          o.setName('message')
            .setDescription('The message to send')
            .setRequired(true)
            .setMaxLength(2000)
        )
        .addStringOption(o =>
          o.setName('title')
            .setDescription('Optional embed title')
            .setRequired(false)
            .setMaxLength(256)
        )
    ),

  async execute(interaction) {
    if (!hasManagementRole(interaction.member) && !interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({ content: 'Only management can use this command.', flags: MessageFlags.Ephemeral });
    }

    const member = interaction.options.getUser('member');
    const message = interaction.options.getString('message');
    const title = interaction.options.getString('title') || 'Message from Management';

    const embed = dmEmbed(title, message, BRAND_COLOR)
      .addFields({ name: 'Sent by', value: `${interaction.user.tag}`, inline: true });

    try {
      await member.send({ embeds: [embed] });
      await interaction.reply({
        content: `Message successfully sent to **${member.tag}**.`,
        flags: MessageFlags.Ephemeral
      });
    } catch (err) {
      await interaction.reply({
        content: `Could not DM **${member.tag}**. They may have DMs disabled.`,
        flags: MessageFlags.Ephemeral
      });
    }
  }
};
