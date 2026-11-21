const { EmbedBuilder } = require('discord.js');
const { db, getConfig } = require('../database');

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

function formatEndDate(expiresAt) {
  const d = new Date(expiresAt);
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const yyyy = d.getUTCFullYear();
  return dd + '/' + mm + '/' + yyyy;
}

function buildCooldownEmbed() {
  purgeExpiredCooldowns();
  // Longest remaining first (latest end date first)
  const rows = db.prepare(
    'SELECT * FROM server_cooldowns WHERE expires_at > ? ORDER BY expires_at DESC'
  ).all(new Date().toISOString());

  const embed = new EmbedBuilder()
    .setColor(0x000000)
    .setTitle('Server Cooldown')
    .setTimestamp()
    .setFooter({ text: 'Vanilla Works | Cooldown Panel · auto-updates' });

  const header =
    '**Day/Month/Year**\n' +
    '*Longest to Shortest dates.*\n\n' +
    '────────────────────';

  if (!rows.length) {
    embed.setDescription(
      header + '\n\nNo servers are currently on cooldown.\n\nUse `/cooldown add` or `/cooldown import` to add some.'
    );
    return embed;
  }

  const blocks = rows.map((r) => {
    const remaining = formatRemaining(r.expires_at);
    const endsUnix = Math.floor(new Date(r.expires_at).getTime() / 1000);
    const dateStr = formatEndDate(r.expires_at);
    return (
      '**' + dateStr + ' — ' + r.server_name + '**\n' +
      '⏱ Remaining: **' + remaining + '** · Ends <t:' + endsUnix + ':R>'
    );
  });

  let body = blocks.join('\n\n──────────────\n\n');
  let description = header + '\n\n' + body;
  if (description.length > 4090) {
    description = description.slice(0, 4080) + '\n…';
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

/** Parse lines like: 28/11/2026 - Voidcrafts */
function parseCooldownList(text) {
  const results = [];
  const skipped = [];
  const lines = String(text || '').split(/\r?\n/);

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith('#')) continue;
    if (line.startsWith('**') && !/\d/.test(line)) continue;
    if (/^[_—\-\s]+$/.test(line)) continue;
    if (/longest to shortest/i.test(line)) continue;
    if (/day\s*\/?\s*month\s*\/?\s*year/i.test(line)) continue;

    // DD/MM/YYYY - Name  (also allow - – —)
    const m = line.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s*[-–—]\s*(.+)$/);
    if (!m) {
      if (line.length > 2) skipped.push(line);
      continue;
    }

    const day = parseInt(m[1], 10);
    const month = parseInt(m[2], 10);
    const year = parseInt(m[3], 10);
    const serverName = m[4].trim();
    if (!serverName) continue;

    // End of that calendar day UTC
    const expires = new Date(Date.UTC(year, month - 1, day, 23, 59, 59));
    if (Number.isNaN(expires.getTime())) {
      skipped.push(line + ' (invalid date)');
      continue;
    }
    if (expires.getTime() <= Date.now()) {
      skipped.push(serverName + ' (date already passed)');
      continue;
    }

    const durationDays = (expires.getTime() - Date.now()) / (24 * 60 * 60 * 1000);
    results.push({
      serverName,
      expiresAt: expires.toISOString(),
      durationDays: Math.round(durationDays * 100) / 100
    });
  }

  return { results, skipped };
}

module.exports = {
  purgeExpiredCooldowns,
  formatRemaining,
  formatEndDate,
  buildCooldownEmbed,
  refreshCooldownPanel,
  parseCooldownList
};
