const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const { db } = require('../database');
const { generateEmbedId } = require('../utils/ids');
const { baseEmbed, BRAND_COLOR } = require('../utils/embeds');
const { canCreateEmbeds } = require('../utils/permissions');

// Temporary store for embed drafts (in-memory, cleared after use or timeout)
const draftStore = new Map();

module.exports = {
  data: new SlashCommandBuilder()
    .setName('embed')
    .setDescription('Create, edit or delete custom embeds')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addSubcommand(sub =>
      sub.setName('create')
        .setDescription('Start the custom embed creation wizard')
        .addChannelOption(o => o.setName('channel').setDescription('Destination channel').setRequired(true))
        .addStringOption(o => o.setName('title').setDescription('Embed title').setRequired(false).setMaxLength(256))
        .addStringOption(o => o.setName('description').setDescription('Embed description').setRequired(false).setMaxLength(4000))
        .addStringOption(o => o.setName('color').setDescription('HEX colour (e.g. #9B59B6) or preset name').setRequired(false))
        .addStringOption(o => o.setName('image').setDescription('Image URL').setRequired(false))
        .addStringOption(o => o.setName('thumbnail').setDescription('Thumbnail URL').setRequired(false))
        .addStringOption(o => o.setName('footer').setDescription('Footer text').setRequired(false))
        .addStringOption(o => o.setName('author').setDescription('Author name').setRequired(false))
        .addStringOption(o => o.setName('ping').setDescription('Optional role/user ping').setRequired(false))
    )
    .addSubcommand(sub =>
      sub.setName('delete')
        .setDescription('Delete a bot-generated custom embed')
        .addStringOption(o => o.setName('embed_id').setDescription('Embed ID').setRequired(true))
    ),

  async execute(interaction) {
    if (!canCreateEmbeds(interaction.member)) {
      return interaction.reply({ content: 'You do not have permission to manage custom embeds.', flags: MessageFlags.Ephemeral });
    }

    const sub = interaction.options.getSubcommand();

    if (sub === 'create') {
      const channel = interaction.options.getChannel('channel');
      const title = interaction.options.getString('title');
      const description = interaction.options.getString('description');
      let colorInput = interaction.options.getString('color') || '#9B59B6';
      const image = interaction.options.getString('image');
      const thumbnail = interaction.options.getString('thumbnail');
      const footer = interaction.options.getString('footer');
      const author = interaction.options.getString('author');
      const ping = interaction.options.getString('ping');

      // Parse colour
      let color = BRAND_COLOR;
      const presets = {
        purple: 0x9B59B6, blue: 0x3498DB, green: 0x2ECC71, red: 0xE74C3C,
        orange: 0xE67E22, yellow: 0xF1C40F, grey: 0x95A5A6, pink: 0xE91E63
      };
      if (presets[colorInput.toLowerCase()]) {
        color = presets[colorInput.toLowerCase()];
      } else if (/^#?[0-9A-Fa-f]{6}$/.test(colorInput)) {
        color = parseInt(colorInput.replace('#', ''), 16);
      }

      const embed = new (require('discord.js').EmbedBuilder)()
        .setColor(color)
        .setTimestamp();

      if (title) embed.setTitle(title);
      if (description) embed.setDescription(description);
      if (image) embed.setImage(image);
      if (thumbnail) embed.setThumbnail(thumbnail);
      if (footer) embed.setFooter({ text: footer });
      if (author) embed.setAuthor({ name: author });

      const draftId = generateEmbedId();
      draftStore.set(draftId, {
        embedData: {
          title, description, color, image, thumbnail, footer, author, ping
        },
        channelId: channel.id,
        creatorId: interaction.user.id,
        expires: Date.now() + 5 * 60 * 1000
      });

      // Cleanup old drafts
      for (const [k, v] of draftStore) {
        if (v.expires < Date.now()) draftStore.delete(k);
      }

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`embed_publish_${draftId}`).setLabel('Publish').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`embed_cancel_${draftId}`).setLabel('Cancel').setStyle(ButtonStyle.Secondary)
      );

      await interaction.reply({
        content: `**Preview** — Review the embed below. Click **Publish** to send it to <#${channel.id}> or **Cancel**.`,
        embeds: [embed],
        components: [row],
        flags: MessageFlags.Ephemeral
      });
    }

    if (sub === 'delete') {
      const embedId = interaction.options.getString('embed_id');
      const record = db.prepare('SELECT * FROM custom_embeds WHERE id = ?').get(embedId);
      if (!record) {
        return interaction.reply({ content: 'Custom embed not found in database.', flags: MessageFlags.Ephemeral });
      }

      try {
        const channel = await interaction.client.channels.fetch(record.channel_id);
        const msg = await channel.messages.fetch(record.message_id);
        await msg.delete();
      } catch {}

      db.prepare('DELETE FROM custom_embeds WHERE id = ?').run(embedId);
      await interaction.reply({ content: `Embed \`${embedId}\` has been deleted.`, flags: MessageFlags.Ephemeral });
    }
  }
};

// Export draftStore so interactionCreate can access it
module.exports.draftStore = draftStore;
