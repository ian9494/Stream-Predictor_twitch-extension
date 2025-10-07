// src/services/marketService.js
const { db } = require('../services/store');
const { updateLeaderboard, getTop } = require('./leaderboardService');

// 開啟新市集
function openMarket({ id, title, options }) {
    db.currentMarkets = {
        id,
        title,
        options: options.map(o => ({ id: o.id, label: o.label })),
        status: 'open',
        started_at: Date.now(),
        closed_at: null,
        settled_at: null,
        correct_option_id: null
    };
    if (!db.votesByMarket.has(id)) db.votesByMarket.set(id, new Map());
}

// 關閉市集（停止接受投票）
function closeMarket() {
    if (db.currentMarkets && db.currentMarkets.status === 'open') {
        db.currentMarkets.status = 'closed';
        db.currentMarkets.closed_at = Date.now();
    }
}

// 封鎖市集（結算並公布結果）
function settleMarket(correct_option_id) {
    if (!db.currentMarkets) return;
    const market = db.currentMarkets;
    if (market.status === 'open') closeMarket();
    market.settled_at = Date.now();
    market.status = 'settled';
    market.correct_option_id = correct_option_id;

    // 計算得分並更新排行榜
    const votes = db.votesByMarket.get(market.id) || new Map();
    for (const [userKey, option_id] of votes.entries()) {
        const win = option_id === correct_option_id;
        updateLeaderboard(userKey, { win, points: win ? 1 : 0 });
    }

    // 推入歷史市集
    db.history.push({
        id: market.id,
        title: market.title,
        correct_option_id,
        settled_at: market.settled_at,
        counts: tallyCounts(market.id, market.options)
    });

    // 結束後清空當前市集
    db.currentMarkets = null;
}

// 計算各選項票數
function tallyCounts(marketId, options) {
    const votes = db.votesByMarket.get(marketId) || new Map();
    const counts = {};
    for (const option of options) counts[option.id] = 0;
    for (const [, option_id] of votes.entries()) {
        if (counts[option_id] !== undefined) counts[option_id]++;
    }
    return counts;
}

// 取得當前市集快照
function getSnapshot() {
    const market = db.currentMarkets
    ? { 
        ...db.currentMarkets,
        counts: tallyCounts(db.currentMarkets.id, db.currentMarkets.options)
    }
    : null;

    // 只取最近 10 筆歷史
    const history = db.history.slice(-10);

    return {
        market,
        history,
        leaderboard: getTop(10),
        server_ts: Date.now()
    };
}

// 使用者投票
function vote({ userKey, option_id, marketId }) {
    if (!db.currentMarkets || db.currentMarkets.id !== marketId) {
        return { ok: false, code: 'NO_ACTIVE_MARKET' };
    }
    if (db.currentMarkets.status !== 'open') {
        return { ok: false, code: 'MARKET_CLOSED' };
    }

    const votes = db.votesByMarket.get(marketId) || new Map();
    votes.set(userKey, option_id); // 一人一票，重複投票會覆蓋
    db.votesByMarket.set(marketId, votes);

    return { ok: true };
}

module.exports = {
    openMarket,
    closeMarket,
    settleMarket,
    getSnapshot,
    vote
};
