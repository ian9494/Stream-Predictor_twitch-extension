// src/routes/snapshot.js
const express = require('express');
const { getSnapshot } = require('../services/marketService');

const router = express.Router();

router.get('/snapshot', async (req, res) => {
    res.json(await getSnapshot());
});

module.exports = router;