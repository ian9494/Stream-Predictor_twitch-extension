// src/services/marketService.js
const { db } = require('../services/store');
const { updateLeaderboard, getTop } = require('./leaderboardService');
const dbClient = require('./db');
const { getTwitchUserName } = require('../utils/twitchUserCache');

function ensureOptionList(rawOptions) {
    if (!Array.isArray(rawOptions) || rawOptions.length < 2) {
        throw new Error('OPTIONS_INVALID');
    }
    return rawOptions.map(o => {
        if (!o || !o.id || !o.label) {
            throw new Error('OPTIONS_INVALID');
        }
        return {
            id: o.id,
            label: o.label,
        };
    });
}

function normalizeRewardPoints(rawReward) {
    if (rawReward === undefined || rawReward === null || rawReward === '') {
        return 1;
    }
    const reward = Number.parseInt(rawReward, 10);
    if (!Number.isFinite(reward) || reward <= 0) {
        throw new Error('REWARD_INVALID');
    }
    return reward;
}

function openMarket({ id, title, options, reward_points }) {
    if (!id || !title) {
        throw new Error('MARKET_PAYLOAD_INVALID');
    }
    if (db.markets.has(id)) {
        const existing = db.markets.get(id);
        if (existing.status !== 'settled') {
            throw new Error('MARKET_ALREADY_OPEN');
        }
    }

    const market = {
        id,
        title,
        options: ensureOptionList(options),
        status: 'open',
        started_at: Date.now(),
        closed_at: null,
        settled_at: null,
        correct_option_id: null,
        reward_points: normalizeRewardPoints(reward_points),
    };

    db.markets.set(id, market);
    if (!db.votesByMarket.has(id)) db.votesByMarket.set(id, new Map());

    return market;
}

function closeMarket(marketId) {
    const market = db.markets.get(marketId);
    if (!market) {
        return { ok: false, code: 'MARKET_NOT_FOUND' };
    }
    if (market.status === 'open') {
        market.status = 'closed';
        market.closed_at = Date.now();
    }
    return { ok: true, market };
}

function tallyCounts(marketId, options) {
    const votes = db.votesByMarket.get(marketId) || new Map();
    const counts = {};
    for (const option of options) counts[option.id] = 0;
    for (const [, option_id] of votes.entries()) {
        if (counts[option_id] !== undefined) counts[option_id] += 1;
    }
    return counts;
}

function settleMarket({ marketId, correct_option_id }) {
    const market = db.markets.get(marketId);
    if (!market) {
        return { ok: false, code: 'MARKET_NOT_FOUND' };
    }
    if (market.status === 'open') {
        closeMarket(marketId);
    }
    if (market.status === 'settled') {
        return { ok: true, market, alreadySettled: true };
    }

    market.status = 'settled';
    market.settled_at = Date.now();
    market.correct_option_id = correct_option_id;

    const votes = db.votesByMarket.get(marketId) || new Map();
    const rewardPoints = normalizeRewardPoints(market.reward_points);
    for (const [userKey, option_id] of votes.entries()) {
        const win = option_id === correct_option_id;
        updateLeaderboard(userKey, { win, points: win ? rewardPoints : 0 });
    }

    db.history.push({
        id: market.id,
        title: market.title,
        correct_option_id,
        settled_at: market.settled_at,
        counts: tallyCounts(market.id, market.options),
        reward_points: rewardPoints,
    });

    // try to persist history
    try {
        dbClient.insertHistoryRow({
            id: market.id,
            title: market.title,
            correct_option_id,
            settled_at: market.settled_at,
            counts_json: JSON.stringify(tallyCounts(market.id, market.options)),
            reward_points: rewardPoints,
        });
    } catch (e) {
        // ignore if DB not available
    }

    db.markets.delete(marketId);
    db.votesByMarket.delete(marketId);
    // delete persisted votes for this market if present
    try {
        dbClient.deleteVotesForMarket(marketId);
    } catch (e) {
        // ignore
    }

    return { ok: true, market };
}

async function getSnapshot(userKey) {
    const markets = Array.from(db.markets.values())
        .map(market => ({
            ...market,
            counts: tallyCounts(market.id, market.options),
        }))
        .sort((a, b) => (a.started_at || 0) - (b.started_at || 0));

    const history = db.history.slice(-10);

    let selfData = { selfPoints: 0, selfRank: null, selfVotes: 0, selfWin: 0, displayName: '' };
    if (userKey) {
        const row = db.leaderboard.get(userKey);
        if (row) {
            selfData.selfPoints = row.total_points || 0;
            selfData.selfVotes = row.total_votes || 0;
            selfData.selfWin = row.win_count || 0;
        }
        const all = Array.from(db.leaderboard.entries())
            .sort((a, b) => (b[1].total_points - a[1].total_points)
                || ((b[1].win_count / ((b[1].total_votes || 1))) - (a[1].win_count / ((a[1].total_votes || 1)))));
        const idx = all.findIndex(([key]) => key === userKey);
        if (idx !== -1) selfData.selfRank = idx + 1;
        selfData.displayName = await getTwitchUserName(
            userKey.startsWith('user:') ? userKey.slice(5) : ''
        );
    }

    const leaderboard = getTop(10);

    return {
        market: markets[0] || null, // legacy single-market clients
        markets,
        history,
        leaderboard,
        selfData,
        server_ts: Date.now(),
    };
}

function vote({ userKey, option_id, marketId }) {
    if (!marketId) {
        return { ok: false, code: 'MARKET_ID_REQUIRED' };
    }
    const market = db.markets.get(marketId);
    if (!market) {
        return { ok: false, code: 'NO_ACTIVE_MARKET' };
    }
    if (market.status !== 'open') {
        return { ok: false, code: 'MARKET_CLOSED' };
    }
    if (!market.options.some(option => option.id === option_id)) {
        return { ok: false, code: 'INVALID_OPTION' };
    }

    const votes = db.votesByMarket.get(marketId) || new Map();
    votes.set(userKey, option_id);
    db.votesByMarket.set(marketId, votes);

    // persist vote to DB if available
    try {
        dbClient.upsertVoteRow({ market_id: marketId, user_key: userKey, option_id });
    } catch (e) {
        // ignore
    }

    return { ok: true };
}

module.exports = {
    openMarket,
    closeMarket,
    settleMarket,
    getSnapshot,
    vote,
};
