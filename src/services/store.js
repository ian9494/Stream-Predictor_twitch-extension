// src/services/store.js
// db is organized per-channel to support channel isolation.
// Structure:
// channels: Map channelId -> {
//    markets: Map marketId -> marketObj,
//    votesByMarket: Map marketId -> Map(userKey -> option_id),
//    history: Array of settled entries,
//    leaderboard: Map userKey -> stats
// }

const LEGACY_BUCKET = '__legacy__';

const db = {
    channels: new Map(), // channelId -> { markets, votesByMarket, history, leaderboard }
    backups: [], // { ts, channelId (optional), leaderboardSnapshot }
};

function ensureChannelBucket(channelId = LEGACY_BUCKET) {
    if (!db.channels.has(channelId)) {
        db.channels.set(channelId, {
            markets: new Map(),
            votesByMarket: new Map(),
            history: [],
            leaderboard: new Map(),
        });
    }
    return db.channels.get(channelId);
}

function createLeaderboardBackup(channelId) {
    const bucket = channelId ? ensureChannelBucket(channelId) : null;
    const target = bucket ? bucket.leaderboard : new Map();
    const snapshot = JSON.stringify(Array.from(target.entries()));
    db.backups.push({ ts: Date.now(), channelId: channelId || null, leaderboardSnapshot: snapshot });
    if (db.backups.length > 20) db.backups.shift();
    return db.backups[db.backups.length - 1];
}

function restoreLeaderboardBackup(index = -1) {
    if (db.backups.length === 0) return false;
    const idx = index === -1 ? db.backups.length - 1 : index;
    const b = db.backups[idx];
    if (!b) return false;
    try {
        const arr = JSON.parse(b.leaderboardSnapshot);
        const m = new Map(arr);
        if (b.channelId) {
            const bucket = ensureChannelBucket(b.channelId);
            bucket.leaderboard = m;
        } else {
            // restore to legacy bucket
            const bucket = ensureChannelBucket(LEGACY_BUCKET);
            bucket.leaderboard = m;
        }
        return true;
    } catch (e) {
        return false;
    }
}

function userKeyOf({ user_id, opaque_user_id }) {
    return user_id ? `user:${user_id}` : `opaque:${opaque_user_id}`;
}

module.exports = {
    db,
    ensureChannelBucket,
    createLeaderboardBackup,
    restoreLeaderboardBackup,
    userKeyOf,
    LEGACY_BUCKET,
};
