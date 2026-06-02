const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, '../data/app-stats.db'));

db.exec(`
  CREATE TABLE IF NOT EXISTS process_history (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    name      TEXT NOT NULL,
    ts        INTEGER NOT NULL,
    cpu       REAL,
    memory    INTEGER,
    status    TEXT
  );

  CREATE TABLE IF NOT EXISTS system_history (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    ts        INTEGER NOT NULL,
    cpu       REAL,
    mem_used  INTEGER,
    temp      REAL,
    net_in    INTEGER,
    net_out   INTEGER
  );

  CREATE TABLE IF NOT EXISTS alerts (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    ts        INTEGER NOT NULL,
    type      TEXT NOT NULL,
    title     TEXT NOT NULL,
    detail    TEXT
  );

  CREATE TABLE IF NOT EXISTS webauthn_credentials (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    username      TEXT NOT NULL,
    credential_id TEXT NOT NULL UNIQUE,
    public_key    TEXT NOT NULL,
    counter       INTEGER NOT NULL DEFAULT 0,
    created_at    INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_proc_history_name_ts ON process_history(name, ts);
  CREATE INDEX IF NOT EXISTS idx_sys_history_ts ON system_history(ts);
  CREATE INDEX IF NOT EXISTS idx_alerts_ts ON alerts(ts DESC);
  CREATE INDEX IF NOT EXISTS idx_webauthn_username ON webauthn_credentials(username);
`);

// Migrate: add columns (safe — throws if already exists)
try { db.exec('ALTER TABLE system_history ADD COLUMN disk_read INTEGER'); } catch {}
try { db.exec('ALTER TABLE system_history ADD COLUMN disk_write INTEGER'); } catch {}
try { db.exec('ALTER TABLE system_history ADD COLUMN nginx_req REAL'); } catch {}

// Prune data older than 25 hours every hour
setInterval(() => {
  const cutoff = Date.now() - 25 * 60 * 60 * 1000;
  db.prepare('DELETE FROM process_history WHERE ts < ?').run(cutoff);
  db.prepare('DELETE FROM system_history WHERE ts < ?').run(cutoff);
}, 60 * 60 * 1000);

module.exports = db;
