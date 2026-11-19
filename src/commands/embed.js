const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  MessageFlags,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  ChannelType
} = require('discord.js');
const { db } = require('../database');
const { generateEmbedId } = require('../utils/ids');
const { BRAND_COLOR } = require('../utils/embeds');
const { canCreateEmbeds } = require('../utils/permissions');

// Temporary store for embed drafts (in-memory)
const draftStore = new Map();

function parseColor(colorInput) {
  const presets = {
    purple: 0x9B59B6,
    blue: 0x3498DB,
    green: 0x2ECC71,
    red: 0xE74C3C,
    orange: 0xE67E22,
    yellow: 0xF1C40F,
    grey: 0x95A5A6,
    gray: 0x95A5A6,
    pink: 0xE91E63,
    black: 0x000000
  };
  if (!colorInput) return BRAND_COLOR;
  const key = String(colorInput).toLowerCase().trim();
  if (presets[key]) return presets[key];
  if (/^#?[0-9A-Fa-f]{6}$/.test(key)) return parseInt(key.replace('#', ''), 16);
  return BRAND_COLOR;
}

function buildEmbedFromData(data) {
  const embed = new EmbedBuilder().setColor(data.color || BRAND_COLOR).setTimestamp();
  if (data.title) embed.setTitle(data.title);
  if (data.description) embed.setDescription(data.description);
  if (data.image) {
    try { embed.setImage(data.image); } catch {}
  }
  if (data.thumbnail) {
    try { embed.setThumbnail(data.thumbnail); } catch {}
  }
  if (data.footer) embed.setFooter({ text: data.footer });
  if (data.author) embed.setAuthor({ name: data.author });
  return embed;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('embed')
    .setDescription('Create or delete custom embeds')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addSubcommand(sub =>
      sub.setName('create')
        .setDescription('Create and preview a custom embed')
        .addChannelOption(o =>
          o.setName('channel')
            .setDescription('Destination channel')
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
            .setRequired(true)
        )
        .addStringOption(o => o.setName('title').setDescription('Embed title').setRequired(false).setMaxLength(256))
        .addStringOption(o => o.setName('description').setDescription('Embed description').setRequired(false).setMaxLength(4000))
        .addStringOption(o => o.setName('color').setDescription('HEX colour (e.g. #9B59B6) or preset name').setRequired(false))
        .addStringOption(o => o.setName('image').setDescription('Image URL').setRequired(false))
        .addStringOption(o => o.setName('thumbnail').setDescription('Thumbnail URL').setRequired(false))
        .addStringOption(o => o.setName('footer').setDescription('Footer text').setRequired(false).setMaxLength(2048))
        .addStringOption(o => o.setName('author').setDescription('Author name').setRequired(false).setMaxLength(256))
        .addStringOption(o => o.setName('ping').setDescription('Optional role/user ping text').setRequired(false))
    )
    .addSubcommand(sub =>
      sub.setName('delete')
        .setDescription('Delete a bot-generated custom embed')
        .addStringOption(o => o.setName('embed_id').setDescription('Embed ID').setRequired(true))
    ),

  async execute(interaction) {
    if (!canCreateEmbeds(interaction.member)) {
      return interaction.reply({
        content: 'You do not have permission to manage custom embeds.',
        flags: MessageFlags.Ephemeral
      });
    }

    const sub = interaction.options.getSubcommand();

    if (sub === 'create') {
      const channel = interaction.options.getChannel('channel');
      const title = interaction.options.getString('title');
      const description = interaction.options.getString('description');
      const colorInput = interaction.options.getString('color');
      const image = interaction.options.getString('image');
      const thumbnail = interaction.options.getString('thumbnail');
      const footer = interaction.options.getString('footer');
      const author = interaction.options.getString('author');
      const ping = interaction.options.getString('ping');

      if (!title && !description) {
        return interaction.reply({
          content: 'You must provide at least a **title** or a **description**.',
          flags: MessageFlags.Ephemeral
        });
      }

      if (!channel || !channel.isTextBased()) {
        return interaction.reply({
          content: 'Please choose a text channel.',
          flags: MessageFlags.Ephemeral
        });
      }

      const color = parseColor(colorInput);
      const embedData = { title, description, color, image, thumbnail, footer, author, ping };
      const embed = buildEmbedFromData(embedData);

      const draftId = generateEmbedId();
      draftStore.set(draftId, {
        embedData,
        channelId: channel.id,
        creatorId: interaction.user.id,
        expires: Date.now() + 10 * 60 * 1000
      });

      for (const [k, v] of draftStore) {
        if (v.expires < Date.now()) draftStore.delete(k);
      }

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('embed_publish_' + draftId)
          .setLabel('Publish')
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId('embed_cancel_' + draftId)
          .setLabel('Cancel')
          .setStyle(ButtonStyle.Secondary)
      );

      return interaction.reply({
        content: '**Preview** — Review the embed below. Click **Publish** to send it to <#' + channel.id + '> or **Cancel**.',
        embeds: [embed],
        components: [row],
        flags: MessageFlags.Ephemeral
      });
    }

    if (sub === 'delete') {
      const embedId = interaction.options.getString('embed_id');
      const record = db.prepare('SELECT * FROM custom_embeds WHERE id = ?').get(embedId);
      if (!record) {
        return interaction.reply({
          content: 'Custom embed not found in database.',
          flags: MessageFlags.Ephemeral
        });
      }

      try {
        const channel = await interaction.client.channels.fetch(record.channel_id);
        const msg = await channel.messages.fetch(record.message_id);
        await msg.delete();
      } catch {}

      db.prepare('DELETE FROM custom_embeds WHERE id = ?').run(embedId);
      return interaction.reply({
        content: 'Embed `' + embedId + '` has been deleted.',
        flags: MessageFlags.Ephemeral
      });
    }
  },

  draftStore,
  buildEmbedFromData
};
