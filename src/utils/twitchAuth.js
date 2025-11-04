// src/utils/twitchAuth.js
// 管理 Twitch App Access Token（Client Credentials），自動快取與續期

// 使用 fetch 的回退機制（Node18+ 有 global.fetch，舊版嘗試 node-fetch）
let fetchFn = typeof fetch !== 'undefined' ? fetch : null;
if (!fetchFn) {
    try {
        fetchFn = require('node-fetch');
    } catch (e) {
        fetchFn = null;
    }
}

const CLIENT_ID = process.env.TWITCH_CLIENT_ID || '';
const CLIENT_SECRET = process.env.TWITCH_CLIENT_SECRET || '';
// optional pre-provided token (will be used if client secret is not available)
const STATIC_TOKEN = process.env.TWITCH_APP_TOKEN || '';

let cached = {
    token: STATIC_TOKEN || null,
    expiresAt: STATIC_TOKEN ? Infinity : 0, // if using static token, treat as long-lived
};

async function fetchAppToken() {
    if (!fetchFn) {
        console.error('[twitchAuth] fetch is not available. Install node-fetch or run on Node >=18.');
        return null;
    }
    if (!CLIENT_ID || !CLIENT_SECRET) {
        if (STATIC_TOKEN) {
            // fallback to static token
            return STATIC_TOKEN;
        }
        console.warn('[twitchAuth] TWITCH_CLIENT_ID or TWITCH_CLIENT_SECRET not configured.');
        return null;
    }

    const url = `https://id.twitch.tv/oauth2/token?client_id=${encodeURIComponent(CLIENT_ID)}&client_secret=${encodeURIComponent(CLIENT_SECRET)}&grant_type=client_credentials`;
    try {
        const resp = await fetchFn(url, { method: 'POST' });
        if (!resp || !resp.ok) {
            const text = await (resp && resp.text ? resp.text() : Promise.resolve(''));
            console.warn(`[twitchAuth] token endpoint returned status=${resp && resp.status} body=${text}`);
            return null;
        }
        const data = await resp.json();
        if (data && data.access_token) {
            const expires = Number.parseInt(data.expires_in || '0', 10) || 0;
            // set a small safety margin (60s)
            cached.token = data.access_token;
            cached.expiresAt = Date.now() + Math.max(0, expires - 60) * 1000;
            console.log('[twitchAuth] fetched new app access token, expires_in=', expires);
            return cached.token;
        }
        console.warn('[twitchAuth] token endpoint returned unexpected body', data);
        return null;
    } catch (err) {
        console.error('[twitchAuth] fetch error:', err && (err.stack || err.message || err));
        return null;
    }
}

async function getAppAccessToken() {
    // 如果token還有效，直接回傳快取
    if (cached.token && Date.now() < (cached.expiresAt || 0)) return cached.token;
    // 重新取得一個 token
    const t = await fetchAppToken();
    if (t) return t;
    // final fallback: if STATIC_TOKEN exists, return it
    if (STATIC_TOKEN) return STATIC_TOKEN;
    return null;
}

module.exports = { getAppAccessToken };
