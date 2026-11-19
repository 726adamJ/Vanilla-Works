const { EmbedBuilder } = require('discord.js');

module.exports = {
  name: 'messageCreate',
  async execute(message, client) {
    // Only handle DMs to the bot (not guild messages, not bot messages)
    if (message.guild) return;
    if (message.author.bot) return;

    const ownerId = process.env.OWNER_ID;
    if (!ownerId) {
      console.warn('OWNER_ID is not set — cannot forward DMs to owner.');
      return;
    }

    try {
      const owner = await client.users.fetch(ownerId).catch(() => null);
      if (!owner) return;

      const embed = new EmbedBuilder()
        .setColor(0x3498DB)
        .setTitle('New DM to Bot')
        .addFields(
          { name: 'From', value: message.author.tag + ' (`' + message.author.id + '`)', inline: false },
          { name: 'User', value: '<@' + message.author.id + '>', inline: true },
          { name: 'Date', value: '<t:' + Math.floor(message.createdTimestamp / 1000) + ':F>', inline: true },
          { name: 'Message', value: (message.content || '*[no text content]*').slice(0, 1024) }
        )
        .setTimestamp(message.createdAt)
        .setFooter({ text: 'Vanilla Works | DM Forward' });

      if (message.author.displayAvatarURL()) {
        embed.setThumbnail(message.author.displayAvatarURL({ size: 128 }));
      }

      const files = [];
      if (message.attachments.size > 0) {
        const links = [...message.attachments.values()].map(a => a.url).join('\n');
        embed.addFields({ name: 'Attachments', value: links.slice(0, 1024) });
      }

      await owner.send({ embeds: [embed] });
    } catch (err) {
      console.error('Failed to forward DM to owner:', err.message);
    }
  }
};
