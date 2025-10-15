// src/routes/admin.js
const express = require('express');
const { openMarket, closeMarket, settleMarket, getMarketStatus } = require('../services/marketService');
const { route } = require('./snapshot');

const router = express.Router();

// 多管理員 token 驗證
const { isValidAdminToken } = require('../utils/adminTokens');
function requireAdmin(req, res, next) {
    const token = req.headers['x-admin-token'];
    if (!isValidAdminToken(token)) {
        return res.status(403).json({ error: '存取權限不足, 無效的管理員代碼' });
    }
    next();
}

// 開啟市集 API
router.post('/open', requireAdmin, (req, res) => {
    const { id, title, options } = req.body || {};
    if (!id || !title || !options || !Array.isArray(options) || options.length < 2) {
        return res.status(400).json({ error: 'id/title/options are required and options must be an array of at least 2 items' });
    }

    openMarket({ id, title, options });
    res.json({ ok: true });
});

// 關閉市集 API
router.post('/close', requireAdmin, (req, res) => {
    closeMarket();
    res.json({ ok: true });
});

router.post('/settle', requireAdmin, (req, res) => {
    const { correct_option_id } = req.body || {};
    if (!correct_option_id) return res.status(400).json({ error: 'correct_option_id is required' });
    settleMarket(correct_option_id);
    res.json({ ok: true });
});

module.exports = router;