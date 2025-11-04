// src/utils/twitchUserCache.js
// 快取 user_id -> twitch display_name
// src/utils/twitchUserCache.js
// 快取 user_id -> twitch display_name
// 這個模組會嘗試用 global.fetch，若不存在則嘗試載入 node-fetch（用於舊版 Node）

const cache = new Map(); // user_id -> { name, ts }
const CACHE_TTL = 60 * 60 * 1000; // 1小時

const CLIENT_ID = process.env.TWITCH_CLIENT_ID;
const ACCESS_TOKEN = process.env.TWITCH_APP_TOKEN; // 必須設定

// fetch 回退：Node 18+ 有 global.fetch，否則嘗試 node-fetch
let fetchFn = typeof fetch !== 'undefined' ? fetch : null;
if (!fetchFn) {
    try {
        // node-fetch v3 exports ESM default; require returns function in CommonJS when installed as compatibility
        // 對於大多數環境，require('node-fetch') 可用於回退
        // eslint-disable-next-line global-require
        fetchFn = require('node-fetch');
    } catch (e) {
        // 沒有 node-fetch，可在啟動環境安裝或升級 Node
        fetchFn = null;
    }
}

async function getTwitchUserName(userId) {
    if (!userId) return '';

    // 先查快取
    const cached = cache.get(userId);
    if (cached && Date.now() - cached.ts < CACHE_TTL) {
        console.log(`[twitchUserCache] cache hit for userId=${userId}, name=${cached.name}`);
        return cached.name;
    }

    if (!CLIENT_ID || !ACCESS_TOKEN) {
        console.warn('[twitchUserCache] TWITCH_CLIENT_ID or TWITCH_APP_TOKEN not configured. Set them in environment (.env) to enable name lookup.');
        return '';
    }

    if (!fetchFn) {
        console.error('[twitchUserCache] fetch is not available. Install node-fetch or run on Node >=18.');
        return '';
    }

    // 查 Twitch API
    const url = `https://api.twitch.tv/helix/users?id=${userId}`;
    try {
        const resp = await fetchFn(url, {
            headers: {
                'Client-ID': CLIENT_ID,
                'Authorization': `Bearer ${ACCESS_TOKEN}`
            }
        });

        if (!resp || !resp.ok) {
            console.warn(`[twitchUserCache] Twitch API request failed for userId=${userId}, status=${resp && resp.status}`);
            return '';
        }

        const data = await resp.json();
        if (data && data.data && data.data.length > 0) {
            const name = data.data[0].display_name || data.data[0].login || '';
            cache.set(userId, { name, ts: Date.now() });
            console.log(`[twitchUserCache] fetched from API userId=${userId}, name=${name}`);
            return name;
        }

        console.warn(`[twitchUserCache] Twitch API 查無 userId=${userId}，不寫入 cache`);
        return '';
    } catch (err) {
        console.error('[twitchUserCache] fetch error:', err && (err.stack || err.message || err));
        return '';
    }
}

module.exports = { getTwitchUserName };
