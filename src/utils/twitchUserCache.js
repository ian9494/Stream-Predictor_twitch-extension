// src/utils/twitchUserCache.js
// 快取 user_id -> twitch display_name
// const fetch = require('node-fetch');

const cache = new Map(); // user_id -> { name, ts }
const CACHE_TTL = 60 * 60 * 1000; // 1小時

const CLIENT_ID = process.env.TWITCH_CLIENT_ID;
const ACCESS_TOKEN = process.env.TWITCH_APP_TOKEN; // 你要設定這個

async function getTwitchUserName(userId) {
    if (!userId) return '';
    // 先查快取
    const cached = cache.get(userId);
    if (cached && Date.now() - cached.ts < CACHE_TTL) {
        console.log(`[twitchUserCache] cache hit for userId=${userId}, name=${cached.name}`);
        return cached.name;
    }
    // 查 Twitch API
    const url = `https://api.twitch.tv/helix/users?id=${userId}`;
    const resp = await fetch(url, {
        headers: {
            'Client-ID': CLIENT_ID,
            'Authorization': `Bearer ${ACCESS_TOKEN}`
        }
    });
    const data = await resp.json();
    if (data.data && data.data.length > 0) {
        const name = data.data[0].display_name || data.data[0].login;
        cache.set(userId, { name, ts: Date.now() });
        console.log(`[twitchUserCache] fetched from API userId=${userId}, name=${name}`);
        return name;
    } else {
        console.warn(`[twitchUserCache] Twitch API 查無 userId=${userId}，不寫入 cache`);
        return '';
    }
}

module.exports = { getTwitchUserName };
