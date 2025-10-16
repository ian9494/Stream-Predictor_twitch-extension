// src/routes/snapshot.js
const express = require('express');
const { getSnapshot } = require('../services/marketService');

const router = express.Router();

const { userKeyOf } = require('../services/store');

router.get('/snapshot', async (req, res) => {
    // 支援 query 參數 user_id/opaque_user_id
    const { user_id, opaque_user_id, channel_id, channelId } = req.query;
    const userKey = userKeyOf({ user_id, opaque_user_id });
    const channelIdToUse = (req.twitch && req.twitch.channelId) || channel_id || channelId;
    console.log('[snapshot] user_id:', user_id, 'opaque_user_id:', opaque_user_id, 'channelId:', channelIdToUse, '=> userKey:', userKey);
    const result = await getSnapshot(userKey, channelIdToUse);
    res.json(result);
});

module.exports = router;