// src/routes/snapshot.js
const express = require('express');
const { getSnapshot } = require('../services/marketService');

const router = express.Router();

const { userKeyOf } = require('../services/store');
const { getChannelIdFromReq } = require('../services/store');

router.get('/snapshot', async (req, res) => {
    // 支援 query 參數 user_id/opaque_user_id
    const { user_id, opaque_user_id } = req.query;
    const userKey = userKeyOf({ user_id, opaque_user_id });
    const channelId = getChannelIdFromReq(req);
    console.log('[snapshot] user_id:', user_id, 'opaque_user_id:', opaque_user_id, 'channelId:', channelId, '=> userKey:', userKey);
    const result = await getSnapshot(userKey, channelId);
    res.json(result);
});

module.exports = router;