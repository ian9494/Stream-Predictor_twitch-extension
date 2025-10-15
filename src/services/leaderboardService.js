// src/services/leaderboardService.js
const { db } = require('../services/store');

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
}

function extractDisplayName(userKey) {
    // user:12345678 取 12345678，opaque:xxxx 取 xxxx
    console.log('extractDisplayName:', userKey); // 調試用
    if (!userKey) return '';
    if (userKey.startsWith('user:')) return userKey.slice(5);
    if (userKey.startsWith('opaque:')) return userKey.slice(7);
    return userKey;
}

function getTop(n = 10) {
    // 將排行榜轉為陣列並排序，並加上 displayName
    const arr = [];
    for (const [userKey, row] of db.leaderboard.entries()) {
        const win_rate = row.total_votes > 0 ? (row.win_count / row.total_votes) : 0;
        arr.push({ user: userKey, displayName: extractDisplayName(userKey), ...row, win_rate });
    }
    arr.sort((a, b) => b.total_points - a.total_points || b.win_rate - a.win_rate);
    return arr.slice(0, n);
}

module.exports = { updateLeaderboard, getTop, extractDisplayName };