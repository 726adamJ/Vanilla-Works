const { ActivityType, EmbedBuilder } = require('discord.js');

module.exports = {
  name: 'ready',
  once: true,
  execute(client) {
    console.log('Logged in as ' + client.user.tag);
    client.user.setActivity('Vanilla Works PR', { type: ActivityType.Watching });

    // Poll expiration every minute
    setInterval(async () => {
      try {
        const { db } = require('../database');
        const now = new Date().toISOString();
        const expired = db.prepare(
          "SELECT * FROM polls WHERE status = 'active' AND ends_at IS NOT NULL AND ends_at <= ?"
        ).all(now);

        for (const poll of expired) {
          db.prepare("UPDATE polls SET status = 'closed' WHERE id = ?").run(poll.id);
          try {
            const channel = await client.channels.fetch(poll.channel_id).catch(() => null);
            if (channel && poll.message_id) {
              const msg = await channel.messages.fetch(poll.message_id).catch(() => null);
              if (msg) {
                const options = JSON.parse(poll.options || '[]');
                const votes = db.prepare('SELECT option_index, COUNT(*) as count FROM poll_votes WHERE poll_id = ? GROUP BY option_index').all(poll.id);
                const voteMap = Object.fromEntries(votes.map(v => [v.option_index, v.count]));
                const total = votes.reduce((s, v) => s + v.count, 0);
                const results = options.map((o, i) => {
                  const count = voteMap[i] || 0;
                  const pct = total ? Math.round((count / total) * 100) : 0;
                  return '**' + (i + 1) + '. ' + o + '** — ' + count + ' (' + pct + '%)';
                }).join('\n');
                const newEmbed = EmbedBuilder.from(msg.embeds[0] || {})
                  .setColor(0x95A5A6)
                  .setTitle('Department Poll — CLOSED')
                  .spliceFields(0, 25)
                  .addFields(
                    { name: 'Final Results', value: results || 'No votes' },
                    { name: 'Total Votes', value: String(total), inline: true }
                  );
                await msg.edit({ embeds: [newEmbed], components: [] }).catch(() => {});
              }
            }
          } catch {}
        }
      } catch (err) {
        console.error('Poll checker error:', err);
      }
    }, 60 * 1000);

    // Temp roles + cooldown panel maintenance every 30s
    setInterval(async () => {
      try {
        const { db } = require('../database');
        const now = new Date().toISOString();

        // Expire temp roles — remove only that role
        const expiredRoles = db.prepare(
          'SELECT * FROM temp_roles WHERE expires_at <= ?'
        ).all(now);

        for (const row of expiredRoles) {
          try {
            const guild = await client.guilds.fetch(row.guild_id).catch(() => null);
            if (guild) {
              const member = await guild.members.fetch(row.user_id).catch(() => null);
              if (member && member.roles.cache.has(row.role_id)) {
                await member.roles.remove(row.role_id, 'Temporary role expired').catch((e) => {
                  console.error('Temp role remove failed:', e.message);
                });
              }
            }
          } catch (e) {
            console.error('Temp role expiry error:', e.message);
          }
          db.prepare('DELETE FROM temp_roles WHERE id = ?').run(row.id);
          console.log('[TempRole] Removed role ' + row.role_id + ' from user ' + row.user_id);
        }

        // Purge expired cooldowns + refresh panel
        const { purgeExpiredCooldowns, refreshCooldownPanel } = require('../utils/cooldownPanel');
        const removed = purgeExpiredCooldowns();
        if (removed > 0) {
          console.log('[Cooldown] Removed ' + removed + ' expired server cooldown(s)');
        }
        await refreshCooldownPanel(client);
      } catch (err) {
        console.error('TempRole/Cooldown maintenance error:', err);
      }
    }, 30 * 1000);

    // Weekly tracking report — Sunday 12:00 AM EST (05:00 UTC)
    setInterval(async () => {
      try {
        const now = new Date();
        const utcDay = now.getUTCDay();
        const utcHour = now.getUTCHours();
        const utcMin = now.getUTCMinutes();

        if (utcDay !== 0 || utcHour !== 5 || utcMin > 1) return;

        const { db, getConfig, setConfig } = require('../database');
        const channelId = getConfig('tracking_channel');
        if (!channelId) return;

        const lastSent = getConfig('last_weekly_report');
        const todayKey = now.toISOString().slice(0, 10);
        if (lastSent === todayKey) return;

        const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
        const totalLogs = db.prepare('SELECT COUNT(*) as c FROM outreach_logs WHERE created_at >= ?').get(weekAgo)?.c || 0;
        const mutuals = db.prepare("SELECT COUNT(*) as c FROM outreach_logs WHERE type = 'Mutual' AND created_at >= ?").get(weekAgo)?.c || 0;
        const partners = db.prepare("SELECT COUNT(*) as c FROM outreach_logs WHERE type = 'Partner' AND created_at >= ?").get(weekAgo)?.c || 0;
        const reqs = db.prepare('SELECT COUNT(*) as c FROM requests WHERE created_at >= ?').get(weekAgo)?.c || 0;

        const topStaff = db.prepare(`
          SELECT user_id, COUNT(*) as c FROM outreach_logs
          WHERE created_at >= ? GROUP BY user_id ORDER BY c DESC LIMIT 8
        `).all(weekAgo);

        const topLines = topStaff.length
          ? topStaff.map((r, i) => (i + 1) + '. <@' + r.user_id + '> — **' + r.c + '**').join('\n')
          : 'No outreach logged this week.';

        const channel = await client.channels.fetch(channelId).catch(() => null);
        if (!channel) return;

        const embed = new EmbedBuilder()
          .setColor(0x000000)
          .setTitle('Weekly PR Activity Report')
          .setDescription('Summary of department activity for the past 7 days.')
          .addFields(
            { name: 'Total Outreach Logs', value: String(totalLogs), inline: true },
            { name: 'Mutual Giveaways', value: String(mutuals), inline: true },
            { name: 'Partnerships', value: String(partners), inline: true },
            { name: 'Requests Submitted', value: String(reqs), inline: true },
            { name: 'Most Active Staff', value: topLines }
          )
          .setTimestamp()
          .setFooter({ text: 'Vanilla Works | Weekly Tracking' });

        await channel.send({ embeds: [embed] });
        setConfig('last_weekly_report', todayKey);
      } catch (err) {
        console.error('Weekly report error:', err);
      }
    }, 60 * 1000);
  }
};
