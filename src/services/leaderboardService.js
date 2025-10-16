// src/services/leaderboardService.js
const { db, ensureChannelBucket, LEGACY_BUCKET } = require('../services/store');

// 更新排行榜
function updateLeaderboard(userKey, { win, points }, channelId) {
    const bucket = ensureChannelBucket(channelId || LEGACY_BUCKET);
    const cur = bucket.leaderboard.get(userKey) || {
        total_points: 0,
        win_count: 0,
        total_votes: 0,
        last_active: 0
    };
    cur.total_points += points || 0;
    cur.total_votes += 1;
    if (win) cur.win_count += 1;
    cur.last_active = Date.now();
    bucket.leaderboard.set(userKey, cur);
}

// 直接調整使用者分數/勝場（可以為負值），不改變 total_votes
function adjustUser(userKey, { pointsDelta = 0, winDelta = 0 }, channelId) {
    const bucket = ensureChannelBucket(channelId || LEGACY_BUCKET);
    const cur = bucket.leaderboard.get(userKey) || {
        total_points: 0,
        win_count: 0,
        total_votes: 0,
        last_active: 0
    };
    cur.total_points = (cur.total_points || 0) + (pointsDelta || 0);
    cur.win_count = (cur.win_count || 0) + (winDelta || 0);
    bucket.leaderboard.set(userKey, cur);
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
    const bucket = ensureChannelBucket(channelId || LEGACY_BUCKET);
    const arr = [];
    for (const [userKey, row] of bucket.leaderboard.entries()) {
        const win_rate = row.total_votes > 0 ? (row.win_count / row.total_votes) : 0;
        arr.push({ user: userKey, displayName: extractDisplayName(userKey), ...row, win_rate });
    }
    arr.sort((a, b) => b.total_points - a.total_points || b.win_rate - a.win_rate);
    return arr.slice(0, n);
}

// 透過 history 重建排行榜
function rebuildLeaderboard(history, channelId) {
    const bucket = ensureChannelBucket(channelId || LEGACY_BUCKET);
    bucket.leaderboard = new Map();
    // history 預期為從最舊到最新的陣列
    for (const entry of history) {
        const reward = entry.reward_points || 1;
        const votes = entry.votes || {};
        for (const [userKey, optionId] of Object.entries(votes)) {
            const win = optionId === entry.correct_option_id;
            updateLeaderboard(userKey, { win, points: win ? reward : 0 }, channelId);
        }
    }
}

module.exports = { updateLeaderboard, getTop, extractDisplayName, rebuildLeaderboard, adjustUser };