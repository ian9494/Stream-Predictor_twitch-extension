// src/routes/admin.js
const express = require('express');
const fs = require('fs');
const path = require('path');
// node >=18 has global fetch; for older versions fallback to node-fetch if available
let fetchFn = global.fetch;
try {
    if (!fetchFn) fetchFn = require('node-fetch');
} catch (e) {
    // node-fetch not installed; assume global fetch exists
}
const fetch = fetchFn;
const { openMarket, closeMarket, settleMarket, getSnapshot, createLeaderboardBackup, restoreLeaderboardBackup } = require('../services/marketService');
const { rebuildLeaderboard, adjustUser } = require('../services/leaderboardService');
const { isValidAdminToken, getAdminByToken } = require('../utils/adminTokens');

const router = express.Router();

function requireAdmin(req, res, next) {
    const token = req.headers['x-admin-token'];
    if (!token) return res.status(403).json({ error: 'Permission denied. Admin token is missing.' });
    const admin = getAdminByToken(token);
    if (!admin) return res.status(403).json({ error: 'Permission denied. Admin token is invalid.' });
    // attach admin info to req for downstream
    req.admin = { username: admin.username, allowedChannels: admin.allowedChannels || [] };
    next();
}

router.post('/open', requireAdmin, (req, res) => {
    // open handled below
    const { id, title, options, reward_points, channel_id, channelId } = req.body || {};
    const channelIdToUse = (req.twitch && req.twitch.channelId) || channel_id || channelId;
    if (!id || !title || !Array.isArray(options) || options.length < 2) {
        return res.status(400).json({ error: 'id/title/options are required and options must contain at least two entries.' });
    }
    try {
        const market = openMarket({ id, title, options, reward_points, channelId: channelIdToUse });
        res.json({ ok: true, market });
    } catch (error) {
        const map = {
            MARKET_ALREADY_OPEN: 409,
            OPTIONS_INVALID: 400,
            MARKET_PAYLOAD_INVALID: 400,
            REWARD_INVALID: 400,
        };
        const status = map[error.message] || 500;
        res.status(status).json({ error: error.message });
    }
});

router.post('/close', requireAdmin, (req, res) => {
    const { market_id, channel_id, channelId } = req.body || {};
    const channelIdToUse = (req.twitch && req.twitch.channelId) || channel_id || channelId;
    if (!market_id) {
        return res.status(400).json({ error: 'market_id is required' });
    }
    const result = closeMarket(market_id, channelIdToUse);
    if (!result.ok) {
        return res.status(404).json({ error: result.code });
    }
    res.json({ ok: true, market: result.market });
});

router.post('/settle', requireAdmin, (req, res) => {
    const { market_id, correct_option_id, channel_id, channelId } = req.body || {};
    const channelIdToUse = (req.twitch && req.twitch.channelId) || channel_id || channelId;
    if (!market_id || !correct_option_id) {
        return res.status(400).json({ error: 'market_id and correct_option_id are required' });
    }
    const result = settleMarket({ marketId: market_id, correct_option_id, channelId: channelIdToUse });
    if (!result.ok) {
        return res.status(404).json({ error: result.code });
    }
    res.json({ ok: true, market: result.market });
});

// 重新依據 history 重建排行榜
router.post('/rebuild', requireAdmin, (req, res) => {
    const { channel_id, channelId } = req.body || {};
    const channelIdToUse = (req.twitch && req.twitch.channelId) || channel_id || channelId;
    const snapshot = getSnapshot(null, channelIdToUse);
    const history = snapshot.history || [];
    rebuildLeaderboard(history, channelIdToUse);
    res.json({ ok: true });
});

// 修正歷史某個市集的正確選項並重建排行榜
router.post('/correct-settle', requireAdmin, (req, res) => {
    const { market_id, correct_option_id, channel_id, channelId } = req.body || {};
    if (!market_id || !correct_option_id) return res.status(400).json({ error: 'market_id and correct_option_id are required' });
    const channelIdToUse = (req.twitch && req.twitch.channelId) || channel_id || channelId;
    // 自動備份 leaderboard
    createLeaderboardBackup(channelIdToUse);

    // 找到 history entry（在指定 channel 的 history）
    const snapshot = getSnapshot(null, channelIdToUse);
    const history = snapshot.history || [];
    const idx = history.findIndex(h => h.id === market_id);
    if (idx === -1) return res.status(404).json({ error: 'HISTORY_ENTRY_NOT_FOUND' });

    const entry = history[idx];
    const oldCorrect = entry.correct_option_id;
    if (oldCorrect === correct_option_id) return res.json({ ok: true, message: 'No change' });

    // 計算 delta：對每位 user 調整分數與勝場
    const votes = entry.votes || {};
    const reward = entry.reward_points || 1;
    for (const [userKey, optionId] of Object.entries(votes)) {
        const wasWin = optionId === oldCorrect;
        const nowWin = optionId === correct_option_id;
        const pointsDelta = (nowWin ? reward : 0) - (wasWin ? reward : 0);
        const winDelta = (nowWin ? 1 : 0) - (wasWin ? 1 : 0);
        if (pointsDelta !== 0 || winDelta !== 0) {
            adjustUser(userKey, { pointsDelta, winDelta }, channelIdToUse);
        }
    }

    // 寫回 history
    entry.correct_option_id = correct_option_id;

    res.json({ ok: true });
});

// 刪除超過 days 的 votes 資料，避免占用過多空間
router.post('/purge-old-votes', requireAdmin, (req, res) => {
    const { days = 30 } = req.body || {};
    const cutoff = Date.now() - (Number(days) * 24 * 3600 * 1000);
    const { channel_id, channelId } = req.body || {};
    const channelIdToUse = (req.twitch && req.twitch.channelId) || channel_id || channelId;
    const snapshot = getSnapshot(null, channelIdToUse);
    let removed = 0;
    for (const h of snapshot.history) {
        if ((h.settled_at || 0) < cutoff && h.votes) {
            delete h.votes;
            removed++;
        }
    }
    res.json({ ok: true, removed });
});

// 建立一個 leaderboard 備份
router.post('/backup-leaderboard', requireAdmin, (req, res) => {
    const { channel_id, channelId } = req.body || {};
    const channelIdToUse = (req.twitch && req.twitch.channelId) || channel_id || channelId;
    const b = createLeaderboardBackup(channelIdToUse);
    res.json({ ok: true, backup: b });
});

// 還原最近一個備份 (或用 index)
router.post('/restore-backup', requireAdmin, (req, res) => {
    const { index } = req.body || {};
    const ok = restoreLeaderboardBackup(index === undefined ? -1 : index);
    if (!ok) return res.status(500).json({ error: 'RESTORE_FAILED' });
    res.json({ ok: true });
});

// 回傳目前 admin token 對應的資訊（username, allowedChannels）
router.get('/whoami', requireAdmin, (req, res) => {
    const admin = req.admin || { username: null, allowedChannels: [] };
    res.json({ ok: true, admin });
});

// 解析 channel login -> channel_id (需要在 server env 設定 TWITCH_CLIENT_ID/TWITCH_CLIENT_SECRET)
router.get('/resolve-channel', requireAdmin, async (req, res) => {
    const { login } = req.query || {};
    if (!login) return res.status(400).json({ error: 'login query required' });

    const clientId = process.env.TWITCH_CLIENT_ID;
    const clientSecret = process.env.TWITCH_CLIENT_SECRET;
    if (!clientId || !clientSecret) return res.status(500).json({ error: 'TWITCH client credentials not configured' });

    try {
        // get app token
        const tokenRes = await fetch(`https://id.twitch.tv/oauth2/token?client_id=${clientId}&client_secret=${clientSecret}&grant_type=client_credentials`, { method: 'POST' });
        const tokenJson = await tokenRes.json();
        const appToken = tokenJson.access_token;
        if (!appToken) return res.status(500).json({ error: 'failed to obtain twitch app token' });

        const usersRes = await fetch(`https://api.twitch.tv/helix/users?login=${encodeURIComponent(login)}`, {
            headers: { 'Client-ID': clientId, 'Authorization': `Bearer ${appToken}` }
        });
        const usersJson = await usersRes.json();
        if (!usersJson || !usersJson.data || usersJson.data.length === 0) return res.status(404).json({ error: 'user not found' });
        const user = usersJson.data[0];
        return res.json({ ok: true, channel_id: user.id, login: user.login, display_name: user.display_name });
    } catch (err) {
        console.error('resolve-channel error', err);
        return res.status(500).json({ error: 'resolve failed', detail: (err && err.message) || String(err) });
    }
});

// 把 channel_id 新增到目前 admin token 的 allowedChannels（需 POST: { channel_id }）
router.post('/add-channel', requireAdmin, (req, res) => {
    const { channel_id } = req.body || {};
    if (!channel_id) return res.status(400).json({ error: 'channel_id required' });

    // 直接修改 src/admin-tokens.json
    const tokensPath = path.join(__dirname, '../admin-tokens.json');
    try {
        const raw = fs.readFileSync(tokensPath, 'utf8');
        const arr = JSON.parse(raw);
        const token = req.headers['x-admin-token'];
        const idx = arr.findIndex(a => a.token === token);
        if (idx === -1) return res.status(403).json({ error: 'admin token not found in storage' });
        arr[idx].allowedChannels = arr[idx].allowedChannels || [];
        if (!arr[idx].allowedChannels.includes(channel_id)) arr[idx].allowedChannels.push(channel_id);
        fs.writeFileSync(tokensPath, JSON.stringify(arr, null, 2), 'utf8');
        return res.json({ ok: true, allowedChannels: arr[idx].allowedChannels });
    } catch (err) {
        console.error('add-channel error', err);
        return res.status(500).json({ error: 'failed to update tokens file', detail: err.message });
    }
});

module.exports = router;
