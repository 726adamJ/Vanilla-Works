const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const dbPath = process.env.DATABASE_PATH || path.join(process.cwd(), 'data', 'bot.db');
const dir = path.dirname(dbPath);
if (!fs.existsSync(dir)) {
  fs.mkdirSync(dir, { recursive: true });
}

const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS config (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS staff_threads (
    user_id TEXT PRIMARY KEY,
    thread_id TEXT NOT NULL,
    assigned_by TEXT,
    assigned_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS requests (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    submitter_id TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    data TEXT NOT NULL,
    manager_id TEXT,
    rejection_reason TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    processed_at TEXT,
    message_id TEXT,
    channel_id TEXT
  );

  CREATE TABLE IF NOT EXISTS outreach_logs (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    server_invite TEXT,
    pings TEXT,
    type TEXT,
    evidence_url TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    thread_id TEXT,
    message_id TEXT,
    channel_id TEXT
  );

  CREATE TABLE IF NOT EXISTS blacklist_requests (
    id TEXT PRIMARY KEY,
    submitter_id TEXT NOT NULL,
    server_name TEXT NOT NULL,
    server_link TEXT NOT NULL,
    reason TEXT NOT NULL,
    incident_date TEXT NOT NULL,
    evidence_urls TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    manager_id TEXT,
    rejection_reason TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    processed_at TEXT,
    message_id TEXT,
    channel_id TEXT
  );

  CREATE TABLE IF NOT EXISTS payment_requests (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    roblox_username TEXT NOT NULL,
    rank TEXT NOT NULL,
    mutual_count INTEGER NOT NULL DEFAULT 0,
    partner_count INTEGER NOT NULL DEFAULT 0,
    total_pay INTEGER NOT NULL DEFAULT 0,
    log_ids TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    manager_id TEXT,
    rejection_reason TEXT,
    pay_scheduled_date TEXT,
    paid_at TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    processed_at TEXT,
    message_id TEXT,
    channel_id TEXT
  );

  CREATE TABLE IF NOT EXISTS loa_requests (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    username TEXT NOT NULL,
    length TEXT NOT NULL,
    reason TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    manager_id TEXT,
    rejection_reason TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    processed_at TEXT,
    message_id TEXT,
    channel_id TEXT
  );

  CREATE TABLE IF NOT EXISTS polls (
    id TEXT PRIMARY KEY,
    question TEXT NOT NULL,
    description TEXT,
    options TEXT NOT NULL,
    duration_minutes INTEGER,
    anonymous INTEGER DEFAULT 0,
    multi INTEGER DEFAULT 0,
    creator_id TEXT NOT NULL,
    channel_id TEXT,
    message_id TEXT,
    status TEXT DEFAULT 'active',
    ends_at TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS poll_votes (
    poll_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    option_index INTEGER NOT NULL,
    voted_at TEXT DEFAULT (datetime('now')),
    PRIMARY KEY (poll_id, user_id, option_index)
  );

  CREATE TABLE IF NOT EXISTS posts (
    id TEXT PRIMARY KEY,
    author_id TEXT NOT NULL,
    caption TEXT,
    title TEXT,
    image_url TEXT,
    ping TEXT,
    channel_id TEXT,
    message_id TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    likes INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS post_likes (
    post_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    liked_at TEXT DEFAULT (datetime('now')),
    PRIMARY KEY (post_id, user_id)
  );

  CREATE TABLE IF NOT EXISTS custom_embeds (
    id TEXT PRIMARY KEY,
    creator_id TEXT NOT NULL,
    channel_id TEXT NOT NULL,
    message_id TEXT NOT NULL,
    data TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT
  );

  CREATE TABLE IF NOT EXISTS panel (
    guild_id TEXT PRIMARY KEY,
    channel_id TEXT NOT NULL,
    message_id TEXT NOT NULL
  );
`);

// Migration: add channel_id to outreach_logs if missing
try {
  db.prepare('SELECT channel_id FROM outreach_logs LIMIT 1').get();
} catch {
  try { db.exec('ALTER TABLE outreach_logs ADD COLUMN channel_id TEXT'); } catch {}
}

const getConfig = (key, defaultValue = null) => {
  const row = db.prepare('SELECT value FROM config WHERE key = ?').get(key);
  return row ? row.value : defaultValue;
};

const setConfig = (key, value) => {
  db.prepare('INSERT OR REPLACE INTO config (key, value) VALUES (?, ?)').run(key, String(value));
};

const getConfigJSON = (key, defaultValue = null) => {
  const val = getConfig(key);
  if (!val) return defaultValue;
  try { return JSON.parse(val); } catch { return defaultValue; }
};

const setConfigJSON = (key, value) => {
  setConfig(key, JSON.stringify(value));
};

module.exports = {
  db,
  getConfig,
  setConfig,
  getConfigJSON,
  setConfigJSON
};
