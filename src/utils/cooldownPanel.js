const { EmbedBuilder } = require('discord.js');
const { db, getConfig } = require('../database');

function ensureTable() {
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS server_cooldowns (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        server_name TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        duration_days REAL NOT NULL,
        added_by TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        end_label TEXT
      )
    `);
  } catch (e) {
    console.error('ensureTable server_cooldowns:', e.message);
  }
  // end_label column migration
  try {
    db.prepare('SELECT end_label FROM server_cooldowns LIMIT 1').get();
  } catch {
    try { db.exec('ALTER TABLE server_cooldowns ADD COLUMN end_label TEXT'); } catch {}
  }
}

function purgeExpiredCooldowns() {
  ensureTable();
  const nowMs = Date.now();
  const rows = db.prepare('SELECT id, expires_at FROM server_cooldowns').all();
  let removed = 0;
  const del = db.prepare('DELETE FROM server_cooldowns WHERE id = ?');
  for (const r of rows) {
    const t = Date.parse(r.expires_at);
    if (!Number.isFinite(t) || t <= nowMs) {
      del.run(r.id);
      removed++;
    }
  }
  return removed;
}

function formatRemaining(expiresAt) {
  const end = Date.parse(expiresAt);
  if (!Number.isFinite(end)) return 'Unknown';
  const diff = end - Date.now();
  if (diff <= 0) return 'Expired';

  const totalSec = Math.floor(diff / 1000);
  const days = Math.floor(totalSec / 86400);
  const hours = Math.floor((totalSec % 86400) / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);

  const parts = [];
  if (days > 0) parts.push(days + 'd');
  if (hours > 0) parts.push(hours + 'h');
  if (days === 0 && (mins > 0 || parts.length === 0)) parts.push(mins + 'm');
  return parts.join(' ') || '0m';
}

function formatEndDate(expiresAt, endLabel) {
  if (endLabel && /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(endLabel)) return endLabel;
  const d = new Date(expiresAt);
  if (Number.isNaN(d.getTime())) return '??/??/????';
  // Use UTC date parts so imported DD/MM/YYYY stays stable
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const yyyy = d.getUTCFullYear();
  return dd + '/' + mm + '/' + yyyy;
}

function toUnix(expiresAt) {
  const t = Date.parse(expiresAt);
  if (!Number.isFinite(t)) return null;
  return Math.floor(t / 1000);
}

function buildCooldownEmbed() {
  ensureTable();
  purgeExpiredCooldowns();

  const nowIso = new Date().toISOString();
  let rows = [];
  try {
    rows = db.prepare(
      'SELECT * FROM server_cooldowns WHERE expires_at > ? ORDER BY expires_at DESC'
    ).all(nowIso);
  } catch (e) {
    console.error('buildCooldownEmbed query:', e.message);
    rows = [];
  }

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
    const endsUnix = toUnix(r.expires_at);
    const dateStr = formatEndDate(r.expires_at, r.end_label);
    const endsLine = endsUnix
      ? 'Ends <t:' + endsUnix + ':R> (<t:' + endsUnix + ':D>)'
      : 'Ends: ' + dateStr;
    return (
      '**' + dateStr + ' — ' + String(r.server_name || 'Unknown') + '**\n' +
      '⏱ Remaining: **' + remaining + '** · ' + endsLine
    );
  });

  let body = blocks.join('\n\n──────────────\n\n');
  let description = header + '\n\n' + body;
  if (description.length > 4000) {
    description = description.slice(0, 3990) + '\n…';
  }

  try {
    embed.setDescription(description);
    embed.addFields({ name: 'Total on cooldown', value: String(rows.length), inline: true });
  } catch (e) {
    embed.setDescription('Cooldown list loaded (' + rows.length + ' servers).');
  }
  return embed;
}

async function refreshCooldownPanel(client) {
  const channelId = getConfig('cooldown_panel_channel');
  const messageId = getConfig('cooldown_panel_message');
  if (!channelId || !messageId) return false;

  try {
    const channel = await client.channels.fetch(channelId).catch(() => null);
    if (!channel || !channel.isTextBased()) return false;
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
    if (/server cooldown/i.test(line)) continue;

    // DD/MM/YYYY - Name
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
    if (month < 1 || month > 12 || day < 1 || day > 31) {
      skipped.push(line + ' (invalid date)');
      continue;
    }

    // End of that calendar day UTC (23:59:59)
    const expiresMs = Date.UTC(year, month - 1, day, 23, 59, 59);
    if (!Number.isFinite(expiresMs)) {
      skipped.push(line + ' (invalid date)');
      continue;
    }
    if (expiresMs <= Date.now()) {
      skipped.push(serverName + ' (date already passed)');
      continue;
    }

    const endLabel =
      String(day).padStart(2, '0') + '/' +
      String(month).padStart(2, '0') + '/' +
      year;

    const durationDays = (expiresMs - Date.now()) / (24 * 60 * 60 * 1000);
    results.push({
      serverName,
      expiresAt: new Date(expiresMs).toISOString(),
      durationDays: Math.round(durationDays * 100) / 100,
      endLabel
    });
  }

  return { results, skipped };
}

function clearAllCooldowns() {
  ensureTable();
  const info = db.prepare('DELETE FROM server_cooldowns').run();
  return info.changes || 0;
}

module.exports = {
  ensureTable,
  purgeExpiredCooldowns,
  formatRemaining,
  formatEndDate,
  buildCooldownEmbed,
  refreshCooldownPanel,
  parseCooldownList,
  clearAllCooldowns
};
