// src/services/store.js

// 最小記憶體狀態 
const db = {
    currentMarket: null,    // {id, title, options: [{id, label}], status}
    votesByMarket: {},   // { marketId -> Map (userKey -> option_id)
    history: [],        // 已結算
    leaderboard: new Map(), // userKey -> { totalPoints, winCount, total_votes, last_active }
}

function userKeyOf({ user_id, opaque_user_id }) {
    return user_id ? `user:${user_id}` : `opaque:${opaque_user_id}`;
}

module.exports = {
    db,
    userKeyOf,
};