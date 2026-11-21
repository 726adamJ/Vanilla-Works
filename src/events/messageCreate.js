const { EmbedBuilder } = require('discord.js');

async function resolveOwnerId(client) {
  if (process.env.OWNER_ID && /^\d{17,20}$/.test(process.env.OWNER_ID.trim())) {
    return process.env.OWNER_ID.trim();
  }
  try {
    const app = client.application || await client.application.fetch();
    if (app.owner) {
      // Team owner vs user owner
      if (app.owner.id) return app.owner.id;
      if (app.owner.ownerId) return app.owner.ownerId;
    }
  } catch (e) {
    console.warn('Could not resolve application owner:', e.message);
  }
  return null;
}

module.exports = {
  name: 'messageCreate',
  async execute(message, client) {
    try {
      // Only DMs
      if (message.guildId || message.guild) return;
      if (!message.author || message.author.bot) return;

      // Ensure we have full content when possible
      if (message.partial) {
        try { await message.fetch(); } catch { /* ignore */ }
      }

      const ownerId = await resolveOwnerId(client);
      if (!ownerId) {
        console.warn('[DM Forward] No OWNER_ID set and could not resolve app owner. Set OWNER_ID in env.');
        return;
      }

      // Don't forward the owner's own messages back to them
      if (message.author.id === ownerId) return;

      const owner = await client.users.fetch(ownerId).catch(() => null);
      if (!owner) {
        console.warn('[DM Forward] Could not fetch owner user ' + ownerId);
        return;
      }

      const content = (message.content && message.content.trim())
        ? message.content.trim().slice(0, 1024)
        : '*[no text content]*';

      const embed = new EmbedBuilder()
        .setColor(0x3498DB)
        .setTitle('New DM to Bot')
        .addFields(
          { name: 'From', value: (message.author.tag || 'Unknown') + ' (`' + message.author.id + '`)', inline: false },
          { name: 'User', value: '<@' + message.author.id + '>', inline: true },
          { name: 'Date', value: '<t:' + Math.floor((message.createdTimestamp || Date.now()) / 1000) + ':F>', inline: true },
          { name: 'Message', value: content }
        )
        .setTimestamp(message.createdAt || new Date())
        .setFooter({ text: 'Vanilla Works | DM Forward' });

      try {
        embed.setThumbnail(message.author.displayAvatarURL({ size: 128 }));
      } catch { /* ignore */ }

      if (message.attachments && message.attachments.size > 0) {
        const links = [...message.attachments.values()].map(a => a.url).join('\n');
        embed.addFields({ name: 'Attachments', value: links.slice(0, 1024) });
      }

      if (message.stickers && message.stickers.size > 0) {
        embed.addFields({
          name: 'Stickers',
          value: [...message.stickers.values()].map(s => s.name).join(', ').slice(0, 256)
        });
      }

      await owner.send({ embeds: [embed] });
      console.log('[DM Forward] Forwarded DM from ' + message.author.tag + ' to owner');
    } catch (err) {
      console.error('[DM Forward] Failed:', err.message);
      // Common cause: owner has DMs closed and does not share a server with the bot
    }
  }
};
