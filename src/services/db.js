const path = require('path');
const fs = require('fs');

// lazy require so project can run even without native addon installed
let Database;
try {
  Database = require('better-sqlite3');
} catch (err) {
  Database = null;
}

const DB_PATH = process.env.SQLITE_PATH || path.join(__dirname, '..', '..', 'data', 'shotcall.db');

let db = null;

function init() {
  if (!Database) {
    console.warn('[DB] better-sqlite3 not installed; leaderboard persistence disabled');
    return null;
  }

  // ensure dir
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  db = new Database(DB_PATH);

  // initialize schema
  db.prepare(`
    CREATE TABLE IF NOT EXISTS leaderboard (
      user_key TEXT PRIMARY KEY,
      total_points INTEGER DEFAULT 0,
      win_count INTEGER DEFAULT 0,
      total_votes INTEGER DEFAULT 0,
      last_active INTEGER DEFAULT 0
    )
  `).run();

  // votes table: store individual votes per market (for rebuild/migration)
  db.prepare(`
    CREATE TABLE IF NOT EXISTS votes (
      market_id TEXT,
      user_key TEXT,
      option_id TEXT,
      PRIMARY KEY (market_id, user_key)
    )
  `).run();

  // history table: settled market snapshots
  db.prepare(`
    CREATE TABLE IF NOT EXISTS history (
      id TEXT PRIMARY KEY,
      title TEXT,
      correct_option_id TEXT,
      settled_at INTEGER,
      counts_json TEXT,
      reward_points INTEGER
    )
  `).run();

  return db;
}

function getDb() {
  return db;
}

function loadLeaderboardRows() {
  if (!db) return [];
  return db.prepare('SELECT * FROM leaderboard ORDER BY total_points DESC').all();
}

function upsertLeaderboardRow({ user_key, total_points, win_count, total_votes, last_active }) {
  if (!db) return;
  const stmt = db.prepare(`
    INSERT INTO leaderboard (user_key, total_points, win_count, total_votes, last_active)
    VALUES (@user_key, @total_points, @win_count, @total_votes, @last_active)
    ON CONFLICT(user_key) DO UPDATE SET
      total_points = excluded.total_points,
      win_count = excluded.win_count,
      total_votes = excluded.total_votes,
      last_active = excluded.last_active
  `);
  stmt.run({ user_key, total_points, win_count, total_votes, last_active });
}

function upsertVoteRow({ market_id, user_key, option_id }) {
  if (!db) return;
  const stmt = db.prepare(`
    INSERT INTO votes (market_id, user_key, option_id)
    VALUES (@market_id, @user_key, @option_id)
    ON CONFLICT(market_id, user_key) DO UPDATE SET option_id = excluded.option_id
  `);
  stmt.run({ market_id, user_key, option_id });
}

function deleteVotesForMarket(market_id) {
  if (!db) return;
  db.prepare('DELETE FROM votes WHERE market_id = ?').run(market_id);
}

function insertHistoryRow({ id, title, correct_option_id, settled_at, counts_json, reward_points }) {
  if (!db) return;
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO history (id, title, correct_option_id, settled_at, counts_json, reward_points)
    VALUES (@id, @title, @correct_option_id, @settled_at, @counts_json, @reward_points)
  `);
  stmt.run({ id, title, correct_option_id, settled_at, counts_json, reward_points });
}

function loadHistory(limit = 50) {
  if (!db) return [];
  return db.prepare('SELECT * FROM history ORDER BY settled_at DESC LIMIT ?').all(limit);
}

function clearLeaderboardRows() {
  if (!db) return;
  db.prepare('DELETE FROM leaderboard').run();
}

module.exports = {
  init,
  getDb,
  loadLeaderboardRows,
  upsertLeaderboardRow,
  upsertVoteRow,
  deleteVotesForMarket,
  insertHistoryRow,
  loadHistory,
};
