// src/server.js

// 載入環境變數
require('dotenv').config();

// 載入必要模組
const express = require('express');
const ratelimit = require('express-rate-limit');

// 載入自訂模組
const cors = require('./utils/cors');
const verifyExtensionJwt = require('./middleware/verifyExtensionJwt');
const snapshotRouter = require('./routes/snapshot');
const voteRouter = require('./routes/vote');
const adminRouter = require('./routes/admin');
const { openMarker, openMarket } = require('./services/marketService');


// 初始化 Express 應用
const app = express();

// middeware 設定
app.use(express.json());
app.use(cors);
app.set('trust proxy', 1); // 如果在 proxy 後面運行 (如 Heroku)，需要設定這個

// Health
app.get('/health', (req, res) => res.json({ ok: true, ts: Date.now() }));

// Route 設定
app.use(snapshotRouter);
app.use('/vote', ratelimit({ windowMs: 30 * 1000, max: 3 }), verifyExtensionJwt, voteRouter); // 30 秒內最多 3 次請求
app.use('/admin', adminRouter);

// 啟動時建立示範 market
openMarket({
    id: 'demo',
    title: '示範市集',
    options: [
        { id: 'A', label: 'Team A' },
        { id: 'B', label: 'Team B' },
        { id: 'C', label: 'Team C' },
    ],
});


// 啟動伺服器
const PORT = process.env.PORT || 8081; // 預設埠號 8081
app.listen(PORT, () => {
    console.log(`[EBS] Server is running on port ${PORT}`);
});