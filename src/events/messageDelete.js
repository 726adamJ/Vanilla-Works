module.exports = {
  name: 'messageDelete',
  async execute(message) {
    try {
      // Partial messages may only have id
      const messageId = message.id;
      if (!messageId) return;

      const { db } = require('../database');
      const log = db.prepare('SELECT id, user_id, type FROM outreach_logs WHERE message_id = ?').get(messageId);
      if (!log) return;

      db.prepare('DELETE FROM outreach_logs WHERE id = ?').run(log.id);
      console.log(
        '[LogSync] Deleted outreach log ' + log.id +
        ' (type=' + (log.type || '?') +
        ', user=' + log.user_id +
        ') because Discord message ' + messageId + ' was deleted.'
      );
    } catch (err) {
      console.error('messageDelete log sync error:', err);
    }
  }
};
