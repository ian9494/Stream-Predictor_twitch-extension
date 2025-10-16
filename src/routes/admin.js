// src/routes/admin.js
const express = require('express');
const { openMarket, closeMarket, settleMarket } = require('../services/marketService');
const { isValidAdminToken } = require('../utils/adminTokens');

const router = express.Router();

function requireAdmin(req, res, next) {
    const token = req.headers['x-admin-token'];
    if (!isValidAdminToken(token)) {
        return res.status(403).json({ error: 'Permission denied. Admin token is invalid.' });
    }
    next();
}

router.post('/open', requireAdmin, (req, res) => {
    const { id, title, options } = req.body || {};
    if (!id || !title || !Array.isArray(options) || options.length < 2) {
        return res.status(400).json({ error: 'id/title/options are required and options must contain at least two entries.' });
    }
    try {
        const market = openMarket({ id, title, options });
        res.json({ ok: true, market });
    } catch (error) {
        const map = {
            MARKET_ALREADY_OPEN: 409,
            OPTIONS_INVALID: 400,
            MARKET_PAYLOAD_INVALID: 400,
        };
        const status = map[error.message] || 500;
        res.status(status).json({ error: error.message });
    }
});

router.post('/close', requireAdmin, (req, res) => {
    const { market_id } = req.body || {};
    if (!market_id) {
        return res.status(400).json({ error: 'market_id is required' });
    }
    const result = closeMarket(market_id);
    if (!result.ok) {
        return res.status(404).json({ error: result.code });
    }
    res.json({ ok: true, market: result.market });
});

router.post('/settle', requireAdmin, (req, res) => {
    const { market_id, correct_option_id } = req.body || {};
    if (!market_id || !correct_option_id) {
        return res.status(400).json({ error: 'market_id and correct_option_id are required' });
    }
    const result = settleMarket({ marketId: market_id, correct_option_id });
    if (!result.ok) {
        return res.status(404).json({ error: result.code });
    }
    res.json({ ok: true, market: result.market });
});

module.exports = router;
