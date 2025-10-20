// src/services/leaderboardService.js
const { db } = require('../services/store');
const dbClient = require('./db');
const { ensureChannelBucket } = require('../services/store');

// 更新排行榜
function updateLeaderboard(userKey, { win, points }, channelId) {
    // 取得或初始化使用者資料
    // in-memory per-channel leaderboard
    const bucket = ensureChannelBucket(channelId);
    const cur = bucket.leaderboard.get(userKey) || { 
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
    bucket.leaderboard.set(userKey, cur);
    try {
        // persist to sqlite if available, with channel_id
        dbClient.upsertLeaderboardRow({
            channel_id: channelId || null,
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

function getTop(n = 10, channelId) {
    // 將排行榜轉為陣列並排序，並加上 displayName
    const arr = [];
    const bucket = ensureChannelBucket(channelId);
    for (const [userKey, row] of bucket.leaderboard.entries()) {
        const win_rate = row.total_votes > 0 ? (row.win_count / row.total_votes) : 0;
        arr.push({ user: userKey, displayName: extractDisplayName(userKey), ...row, win_rate });
    }
    arr.sort((a, b) => b.total_points - a.total_points || b.win_rate - a.win_rate);
    return arr.slice(0, n);
}

module.exports = { updateLeaderboard, getTop, extractDisplayName };

// Note: persisted leaderboard rows are now channel-scoped. We do not auto-load all channels here.
// Consumers can call dbClient.loadLeaderboardRows(channel_id) to load a specific channel into memory if desired.