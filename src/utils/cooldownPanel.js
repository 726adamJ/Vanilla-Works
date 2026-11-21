const { EmbedBuilder } = require('discord.js');
const { db, getConfig, setConfig } = require('../database');

function purgeExpiredCooldowns() {
  const now = new Date().toISOString();
  const info = db.prepare('DELETE FROM server_cooldowns WHERE expires_at <= ?').run(now);
  return info.changes || 0;
}

function formatRemaining(expiresAt) {
  const end = new Date(expiresAt).getTime();
  const diff = end - Date.now();
  if (diff <= 0) return 'Expired';
  const totalMin = Math.floor(diff / 60000);
  const days = Math.floor(totalMin / (60 * 24));
  const hours = Math.floor((totalMin % (60 * 24)) / 60);
  const mins = totalMin % 60;
  const parts = [];
  if (days) parts.push(days + 'd');
  if (hours) parts.push(hours + 'h');
  if (mins || !parts.length) parts.push(mins + 'm');
  return parts.join(' ');
}

function buildCooldownEmbed() {
  purgeExpiredCooldowns();
  const rows = db.prepare(
    'SELECT * FROM server_cooldowns WHERE expires_at > ? ORDER BY expires_at ASC'
  ).all(new Date().toISOString());

  const embed = new EmbedBuilder()
    .setColor(0x000000)
    .setTitle('Server Cooldown List')
    .setTimestamp()
    .setFooter({ text: 'Vanilla Works | Cooldown Panel · auto-updates' });

  if (!rows.length) {
    embed.setDescription('No servers are currently on cooldown.\n\nUse `/cooldown add` to add one.');
    return embed;
  }

  const blocks = rows.map((r, i) => {
    const remaining = formatRemaining(r.expires_at);
    const endsUnix = Math.floor(new Date(r.expires_at).getTime() / 1000);
    return (
      '**' + (i + 1) + '. ' + r.server_name + '**\n' +
      '⏱ Remaining: **' + remaining + '**\n' +
      'Ends: <t:' + endsUnix + ':R> (<t:' + endsUnix + ':f>)'
    );
  });

  // Separate each server with a divider
  let description = blocks.join('\n\n──────────────\n\n');
  if (description.length > 4000) {
    description = description.slice(0, 3990) + '\n…';
  }
  embed.setDescription(description);
  embed.addFields({ name: 'Total on cooldown', value: String(rows.length), inline: true });
  return embed;
}

async function refreshCooldownPanel(client) {
  const channelId = getConfig('cooldown_panel_channel');
  const messageId = getConfig('cooldown_panel_message');
  if (!channelId || !messageId) return false;

  try {
    const channel = await client.channels.fetch(channelId).catch(() => null);
    if (!channel) return false;
    const msg = await channel.messages.fetch(messageId).catch(() => null);
    if (!msg) return false;
    await msg.edit({ embeds: [buildCooldownEmbed()] });
    return true;
  } catch (e) {
    console.error('refreshCooldownPanel error:', e.message);
    return false;
  }
}

module.exports = {
  purgeExpiredCooldowns,
  formatRemaining,
  buildCooldownEmbed,
  refreshCooldownPanel
};
