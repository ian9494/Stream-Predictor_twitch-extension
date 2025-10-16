// src/routes/vote.js

const express = require('express');
const { vote } = require('../services/marketService');
const { userKeyOf } = require('../services/store');

const router = express.Router();

router.post('/', async (req, res) => {
    const { option_id, market_id } = req.body || {};
    if (!option_id || !market_id) {
        return res.status(400).json({ error: 'option_id and market_id are required' });
    }

    const userKey = userKeyOf({
        user_id: req.twitch.user_id,
        opaque_user_id: req.twitch.opaque_user_id,
    });

    const result = vote({ userKey, option_id, marketId: market_id });

    if (!result.ok) {
        const map = {
            NO_ACTIVE_MARKET: 404,
            MARKET_CLOSED: 409,
            INVALID_OPTION: 400,
            MARKET_ID_REQUIRED: 400,
        };
        return res.status(map[result.code] || 400).json({ error: result.code });
    }

    res.json({ ok: true });
});

module.exports = router;
