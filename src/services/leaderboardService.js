// src/services/leaderboardService.js
const { db } = require('../services/store');
const dbClient = require('./db');
const { getTwitchUserName } = require('../utils/twitchUserCache');

// 更新排行榜
function updateLeaderboard(userKey, { win, points }) {
    // 取得或初始化使用者資料
    const cur = db.leaderboard.get(userKey) || { 
        total_points: 0,
        win_count: 0,
        total_votes: 0,
        last_active: 0
    };
    // 更新資料
    cur.total_points += points || 0;
    cur.total_votes += 1;
    if (win) cur.win_count += 1;
    cur.last_active = Date.now();
    db.leaderboard.set(userKey, cur);
    try {
        // persist to sqlite if available
        dbClient.upsertLeaderboardRow({
            user_key: userKey,
            total_points: cur.total_points,
            win_count: cur.win_count,
            total_votes: cur.total_votes,
            last_active: cur.last_active,
        });
    } catch (e) {
        // ignore if DB not available
    }
}

function extractDisplayName(userKey) {
    // user:12345678 取 12345678，opaque:xxxx 取 xxxx
    console.log('extractDisplayName:', userKey); // 調試用
    if (!userKey) return '';
    if (userKey.startsWith('user:')) return userKey.slice(5);
    if (userKey.startsWith('opaque:')) return userKey.slice(7);
    return userKey;
}

async function getTop(n = 10) {
    // 將排行榜轉為陣列並排序，並嘗試將 user:xxxxx 轉為 display name（呼叫 Twitch API，會使用快取）
    const arr = [];
    for (const [userKey, row] of db.leaderboard.entries()) {
        const win_rate = row.total_votes > 0 ? (row.win_count / row.total_votes) : 0;
        arr.push({ user: userKey, displayName: extractDisplayName(userKey), ...row, win_rate });
    }
    // 先排序再取 top N 的 key，然後為這些 item 並行查詢 display name（避免為整個 leaderboard 查詢）
    arr.sort((a, b) => b.total_points - a.total_points || b.win_rate - a.win_rate);
    const top = arr.slice(0, n);

    // 並行查詢 display name（僅對 user: 前綴的項目呼叫 Helix）
    await Promise.all(top.map(async item => {
        try {
            if (item.user && item.user.startsWith('user:')) {
                const userId = item.user.slice(5);
                const name = await getTwitchUserName(userId);
                if (name) item.displayName = name;
            }
        } catch (e) {
            // ignore lookup errors and keep fallback displayName
        }
    }));

    return top;
}

module.exports = { updateLeaderboard, getTop, extractDisplayName };

// Load persisted leaderboard rows on startup if DB is available
try {
    const rows = dbClient.loadLeaderboardRows();
    if (Array.isArray(rows) && rows.length > 0) {
        for (const r of rows) {
            db.leaderboard.set(r.user_key, {
                total_points: r.total_points || 0,
                win_count: r.win_count || 0,
                total_votes: r.total_votes || 0,
                last_active: r.last_active || 0,
            });
        }
        console.log(`[DB] Loaded ${rows.length} leaderboard rows from DB`);
    }
} catch (e) {
    // If DB not present or load fails, continue with in-memory only
}