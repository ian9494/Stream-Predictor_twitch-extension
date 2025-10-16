// src/services/store.js

const db = {
    markets: new Map(),    // marketId -> { id, title, options, status, started_at, closed_at, settled_at, correct_option_id }
    votesByMarket: new Map(),   // marketId -> Map (userKey -> option_id)
    history: [],        // settled market snapshots
    leaderboard: new Map(), // userKey -> { total_points, win_count, total_votes, last_active }
};

function userKeyOf({ user_id, opaque_user_id }) {
    return user_id ? `user:${user_id}` : `opaque:${opaque_user_id}`;
}

module.exports = {
    db,
    userKeyOf,
};
