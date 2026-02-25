// src/routes/admin.js
const express = require('express');
const { openMarket, closeMarket, settleMarket } = require('../services/marketService');
const { isValidAdminToken, verifyAdminAsync } = require('../utils/adminTokens');

const router = express.Router();

function requireAdmin(req, res, next) {
    const token = req.headers['x-admin-token'];
    if (!isValidAdminToken(token)) {
        return res.status(403).json({ error: 'Permission denied. Admin token is invalid.' });
    }
    next();
}

router.post('/open', requireAdmin, (req, res) => {
    const { id, title, options, reward_points } = req.body || {};
    if (!id || !title || !Array.isArray(options) || options.length < 2) {
        return res.status(400).json({ error: 'id/title/options are required and options must contain at least two entries.' });
    }
    try {
        const market = openMarket({ id, title, options, reward_points });
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

// export votes as JSON (admin only)
// GET /admin/export-votes?market_id=demo
router.get('/export-votes', requireAdmin, (req, res) => {
    const { market_id } = req.query || {};
    const dbClient = require('../services/db');
    const store = require('../services/store');

    // if sqlite available, query votes table
    const sqlite = dbClient.getDb && dbClient.getDb();
    if (sqlite) {
        try {
            let rows;
            if (market_id) {
                rows = sqlite.prepare('SELECT market_id, user_key, option_id FROM votes WHERE market_id = ?').all(market_id);
            } else {
                rows = sqlite.prepare('SELECT market_id, user_key, option_id FROM votes').all();
            }
            const filename = `votes${market_id ? '-' + market_id : ''}-${Date.now()}.json`;
            res.setHeader('Content-Type', 'application/json');
            res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
            return res.send(JSON.stringify(rows, null, 2));
        } catch (e) {
            console.warn('[admin/export-votes] sqlite query failed', e && e.message);
        }
    }

    // fallback to in-memory
    const out = [];
    const votesMap = store.db.votesByMarket;
    if (market_id) {
        const m = votesMap.get(market_id) || new Map();
        for (const [userKey, option_id] of m.entries()) out.push({ market_id, user_key: userKey, option_id });
    } else {
        for (const [mId, mMap] of votesMap.entries()) {
            for (const [userKey, option_id] of mMap.entries()) out.push({ market_id: mId, user_key: userKey, option_id });
        }
    }
    const filename = `votes${market_id ? '-' + market_id : ''}-${Date.now()}.json`;
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(JSON.stringify(out, null, 2));
});

// reset leaderboard (admin only)
// POST /admin/reset-leaderboard with JSON { confirm: 'yes' }
router.post('/reset-leaderboard', requireAdmin, (req, res) => {
    const { confirm } = req.body || {};
    if (confirm !== 'yes') return res.status(400).json({ error: 'confirm=\'yes\' is required' });
    const dbClient = require('../services/db');
    const store = require('../services/store');

    // clear sqlite leaderboard if available
    try {
        dbClient.clearLeaderboardRows();
    } catch (e) {
        console.warn('[admin/reset-leaderboard] clear db failed', e && e.message);
    }

    // clear in-memory leaderboard
    try {
        store.db.leaderboard = new Map();
    } catch (e) {
        console.warn('[admin/reset-leaderboard] clear memory leaderboard failed', e && e.message);
    }

    res.json({ ok: true });
});

module.exports = router;
