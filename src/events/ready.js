const { ActivityType, EmbedBuilder } = require('discord.js');

module.exports = {
  name: 'ready',
  once: true,
  execute(client) {
    console.log(`Logged in as ${client.user.tag}`);
    client.user.setActivity('Vanilla Works PR', { type: ActivityType.Watching });

    // Poll expiration checker (every minute)
    setInterval(async () => {
      try {
        const { db } = require('../database');
        const now = new Date().toISOString();
        const expired = db.prepare(`
          SELECT * FROM polls WHERE status = 'active' AND ends_at IS NOT NULL AND ends_at <= ?
        `).all(now);

        for (const poll of expired) {
          db.prepare(`UPDATE polls SET status = 'closed' WHERE id = ?`).run(poll.id);

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
                  return `**${i + 1}. ${o}** — ${count} vote${count !== 1 ? 's' : ''} (${pct}%)`;
                }).join('\n');

                const newEmbed = EmbedBuilder.from(msg.embeds[0] || {})
                  .setColor(0x95A5A6)
                  .setTitle('📊 Department Poll — CLOSED')
                  .spliceFields(0, 25)
                  .addFields(
                    { name: 'Final Results', value: results || 'No votes', inline: false },
                    { name: 'Total Votes', value: String(total), inline: true }
                  )
                  .setFooter({ text: 'Poll closed • Vanilla Works | Public Relations' });

                await msg.edit({ embeds: [newEmbed], components: [] }).catch(() => {});
              }
            }
          } catch (e) {
            // ignore individual update failures
          }
        }
      } catch (err) {
        console.error('Poll checker error:', err);
      }
    }, 60 * 1000);
  }
};
