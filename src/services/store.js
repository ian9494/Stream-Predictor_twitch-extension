// src/services/store.js

// per-channel in-memory buckets
const LEGACY_BUCKET = '__legacy__';

function createBucket() {
    return {
        markets: new Map(),    // marketId -> market
        votesByMarket: new Map(),   // marketId -> Map (userKey -> option_id)
        history: [],        // settled market snapshots
        leaderboard: new Map(), // userKey -> { total_points, win_count, total_votes, last_active }
    };
}

const db = {
    channels: new Map(), // channelId -> bucket
};

// ensure legacy bucket exists and keep backward compatibility
if (!db.channels.has(LEGACY_BUCKET)) db.channels.set(LEGACY_BUCKET, createBucket());

function ensureChannelBucket(channelId) {
    const id = channelId || LEGACY_BUCKET;
    if (!db.channels.has(id)) db.channels.set(id, createBucket());
    return db.channels.get(id);
}

function userKeyOf({ user_id, opaque_user_id }) {
    return user_id ? `user:${user_id}` : `opaque:${opaque_user_id}`;
}

function getChannelIdFromReq(req) {
    // priority: req.twitch.channelId (from JWT) -> header x-channel-id -> query.channel_id -> body.channel_id
    if (req && req.twitch && req.twitch.channelId) return req.twitch.channelId;
    const h = req && req.headers && (req.headers['x-channel-id'] || req.headers['x-channel-id'.toLowerCase()]);
    if (h) return h;
    if (req && req.query && req.query.channel_id) return req.query.channel_id;
    if (req && req.body && req.body.channel_id) return req.body.channel_id;
    return null;
}

module.exports = {
    db,
    ensureChannelBucket,
    userKeyOf,
    getChannelIdFromReq,
    LEGACY_BUCKET,
};
