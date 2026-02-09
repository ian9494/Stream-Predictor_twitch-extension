// src/utils/twitchUserCache.js
// 快取 user_id -> twitch display_name
// src/utils/twitchUserCache.js
// 快取 user_id -> twitch display_name
// 這個模組會嘗試用 global.fetch，若不存在則嘗試載入 node-fetch（用於舊版 Node）

const cache = new Map(); // user_id -> { name, ts }
const CACHE_TTL = 60 * 60 * 1000; // 1小時

const CLIENT_ID = process.env.TWITCH_CLIENT_ID;
// ACCESS_TOKEN will be obtained dynamically via twitchAuth module (supports client credentials and caching)
const { getAppAccessToken } = require('./twitchAuth');

// fetch 回退：Node 18+ 有 global.fetch，否則嘗試 node-fetch
let fetchFn = typeof fetch !== 'undefined' ? fetch : null;
if (!fetchFn) {
    try {
        // node-fetch v3 is ESM and exposes default; support both v2 (function) and v3 (default)
        // eslint-disable-next-line global-require
        const nf = require('node-fetch');
        fetchFn = nf && (nf.default || nf);
        console.log('[twitchUserCache] using node-fetch fallback', !!fetchFn);
    } catch (e) {
        // 沒有 node-fetch，可在啟動環境安裝或升級 Node
        fetchFn = null;
    }
}

async function getTwitchUserName(userId) {
    if (!userId) return '';

    // [修改重點 1] 強制正規化 ID
    // Twitch Extension 傳來的 ID 格式通常是 "U" + 數字 (例如 U449285560)
    // 但 Helix API 只吃純數字，所以我們用正則表達式把開頭的非數字 (^\D+) 切掉
    const normalizedId = String(userId).replace(/^\D+/, '');

    // 如果切完之後是空的 (例如原本是 A 開頭的匿名 ID)，就直接回傳空字串，不浪費 API
    if (!normalizedId) {
        // console.log(`[twitchUserCache] 忽略匿名或無效 ID: ${userId}`);
        return '';
    }

    // 先查快取 (Cache Key 維持用原始 userId，避免影響其他邏輯)
    const cached = cache.get(userId);
    if (cached && Date.now() - cached.ts < CACHE_TTL) {
        // console.log(`[twitchUserCache] cache hit for userId=${userId}, name=${cached.name}`);
        return cached.name;
    }

    if (!CLIENT_ID) {
        console.warn('[twitchUserCache] TWITCH_CLIENT_ID not configured.');
        return '';
    }

    if (!fetchFn) {
        console.error('[twitchUserCache] fetch is not available.');
        return '';
    }

    // 取得 Access Token
    const ACCESS_TOKEN = await getAppAccessToken();
    if (!ACCESS_TOKEN) {
        console.warn('[twitchUserCache] no app access token available');
        return '';
    }

    // [修改重點 2] 這裡是最關鍵的地方！
    // 網址參數一定要用我們剛剛處理過的 'normalizedId' (純數字)，絕對不能用原始的 userId
    const url = `https://api.twitch.tv/helix/users?id=${encodeURIComponent(normalizedId)}`;
    
    try {
        // console.log(`[twitchUserCache] fetching twitch user for userId=${userId} (normalized=${normalizedId})`);
        const resp = await fetchFn(url, {
            headers: {
                'Client-ID': CLIENT_ID,
                'Authorization': `Bearer ${ACCESS_TOKEN}`
            }
        });

        if (resp && !resp.ok) {
            let text = '';
            try { text = await resp.text(); } catch (e) { text = String(e); }
            console.warn(`[twitchUserCache] Twitch API non-ok for userId=${userId} (normalized=${normalizedId}) status=${resp.status} body=${text}`);
            return '';
        }

        const data = await resp.json();
        if (data && data.data && data.data.length > 0) {
            const name = data.data[0].display_name || data.data[0].login || '';
            cache.set(userId, { name, ts: Date.now() });
            console.log(`[twitchUserCache] fetched from API userId=${userId}, name=${name}`);
            return name;
        }

        return '';
    } catch (err) {
        console.error('[twitchUserCache] fetch error:', err);
        return '';
    }
}

module.exports = { getTwitchUserName };
