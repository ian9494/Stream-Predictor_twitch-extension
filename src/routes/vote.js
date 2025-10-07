// src/routes/vote.js

const express = require('express');
const { vote } = require('../services/marketService');
const { userKeyOf } = require('../services/store');

const router = express.Router();

// 投票 API
router.post('/', async (req, res) => {
    const { option_id, market_id } = req.body || {}; // 由前端傳來的投票選項與市集 ID
    if (!option_id) return res.status(400).json({ error: 'option_id is required' });

    // 若未指定 market_id，則使用當前市集
    const mid = market_id || (req.app.locals?.currentMarketId);

    const userKey = userKeyOf({
        user_id: req.twitch.user_id,
        opaque_user_id: req.twitch.opaque_user_id,
    }); // 從 JWT 中取得使用者識別

    // 執行投票
    const result = vote({ userKey, option_id, marketId: mid || (req.twitch.channel_id + ':current') });

    // 處理投票結果
    if (!result.ok) {
        const map = {
            NO_ACTIVE_MARKET: 409,
            MARKET_CLOSED: 409,
        };
        return res.status(map[result.code] || 400).json({ error: result.code });
    }

    // 投票成功
    res.json({ ok: true });
});

module.exports = router;