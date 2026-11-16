const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { db, getConfig } = require('../database');
const { generatePostId } = require('../utils/ids');
const { baseEmbed, BRAND_COLOR } = require('../utils/embeds');
const { canCreatePosts } = require('../utils/permissions');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('post')
    .setDescription('Create and manage staff posts')
    .addSubcommand(sub =>
      sub.setName('create')
        .setDescription('Publish a new staff post')
        .addStringOption(o => o.setName('caption').setDescription('Post caption').setRequired(true).setMaxLength(2000))
        .addAttachmentOption(o => o.setName('photo').setDescription('Photo/image for the post').setRequired(true))
        .addStringOption(o => o.setName('title').setDescription('Optional title').setRequired(false).setMaxLength(256))
        .addStringOption(o => o.setName('ping').setDescription('Optional role or user to ping (mention or ID)').setRequired(false))
        .addChannelOption(o => o.setName('channel').setDescription('Destination channel (defaults to configured staff post channel)').setRequired(false))
    )
    .addSubcommand(sub =>
      sub.setName('remove')
        .setDescription('Remove a staff post')
        .addStringOption(o => o.setName('post_id').setDescription('Post ID').setRequired(true))
    ),

  async execute(interaction) {
    if (!canCreatePosts(interaction.member)) {
      return interaction.reply({ content: 'You do not have permission to create staff posts.', flags: MessageFlags.Ephemeral });
    }

    const sub = interaction.options.getSubcommand();

    if (sub === 'create') {
      const caption = interaction.options.getString('caption');
      const photo = interaction.options.getAttachment('photo');
      const title = interaction.options.getString('title');
      const ping = interaction.options.getString('ping');
      let channel = interaction.options.getChannel('channel');

      if (!photo.contentType?.startsWith('image/')) {
        return interaction.reply({ content: 'The photo must be an image file.', flags: MessageFlags.Ephemeral });
      }

      if (!channel) {
        const postChannelId = getConfig('staff_post_channel');
        if (postChannelId) {
          channel = await interaction.client.channels.fetch(postChannelId).catch(() => null);
        }
      }
      if (!channel) {
        return interaction.reply({ content: 'No staff post channel configured and none provided.', flags: MessageFlags.Ephemeral });
      }

      const postId = generatePostId();

      const embed = baseEmbed()
        .setColor(BRAND_COLOR)
        .setTitle(title || 'Staff Post')
        .setDescription(caption)
        .setImage(photo.url)
        .addFields(
          { name: 'Author', value: `<@${interaction.user.id}>`, inline: true },
          { name: 'Post ID', value: `\`${postId}\``, inline: true }
        )
        .setTimestamp();

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`like_post_${postId}`)
          .setLabel('❤️ 0 Likes')
          .setStyle(ButtonStyle.Secondary)
      );

      const content = ping ? (ping.startsWith('<') ? ping : `<@&${ping}>`) : undefined;

      const msg = await channel.send({
        content: content || undefined,
        embeds: [embed],
        components: [row]
      });

      db.prepare(`
        INSERT INTO posts (id, author_id, caption, title, image_url, ping, channel_id, message_id, likes)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)
      `).run(postId, interaction.user.id, caption, title, photo.url, ping, channel.id, msg.id);

      await interaction.reply({
        content: `Staff post published in <#${channel.id}>.\n**Post ID:** \`${postId}\``,
        flags: MessageFlags.Ephemeral
      });
    }

    if (sub === 'remove') {
      const postId = interaction.options.getString('post_id');
      const post = db.prepare('SELECT * FROM posts WHERE id = ?').get(postId);
      if (!post) {
        return interaction.reply({ content: 'Post not found.', flags: MessageFlags.Ephemeral });
      }

      // Only author or management
      const { hasManagementRole } = require('../utils/permissions');
      if (post.author_id !== interaction.user.id && !hasManagementRole(interaction.member)) {
        return interaction.reply({ content: 'You can only remove your own posts (or be management).', flags: MessageFlags.Ephemeral });
      }

      try {
        const channel = await interaction.client.channels.fetch(post.channel_id);
        const msg = await channel.messages.fetch(post.message_id);
        await msg.delete();
      } catch {}

      db.prepare('DELETE FROM post_likes WHERE post_id = ?').run(postId);
      db.prepare('DELETE FROM posts WHERE id = ?').run(postId);

      await interaction.reply({ content: `Post \`${postId}\` has been removed.`, flags: MessageFlags.Ephemeral });
    }
  }
};
