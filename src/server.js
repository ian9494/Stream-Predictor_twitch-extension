// src/server.js

// 載入環境變數
require('dotenv').config();

// 載入必要模組
const express = require('express');
const ratelimit = require('express-rate-limit');

// 載入自訂模組
const cors = require('./utils/cors');
const verifyExtensionJwt = require('./middleware/verifyExtensionJwt');
// initialize DB early so modules that load persisted data can read it
const dbService = require('./services/db');
try {
    const d = dbService.init();
    if (d) console.log('[DB] SQLite initialized');
} catch (e) {
    console.warn('[DB] SQLite initialization failed:', e && e.message);
}

const snapshotRouter = require('./routes/snapshot');
const voteRouter = require('./routes/vote');
const adminRouter = require('./routes/admin');
const { openMarket } = require('./services/marketService');
const { verifyAdminAsync } = require('./utils/adminTokens');


// 初始化 Express 應用
const app = express();

// middeware 設定
app.use(express.json());
app.use(cors);
app.set('trust proxy', 1); // 如果在 proxy 後面運行 (如 Heroku)，需要設定這個

// Temporary request logger for debugging 404 issues (disabled in production)
if (process.env.NODE_ENV !== 'production') {
    app.use((req, res, next) => {
        try {
            console.log(`[REQ] ${new Date().toISOString()} ${req.method} ${req.originalUrl} host=${req.headers.host} origin=${req.headers.origin || ''}`);
        } catch (e) {
            console.log('[REQ] logger error', e && e.message);
        }
        next();
    });
}

// Health
app.get('/health', (req, res) => res.json({ ok: true, ts: Date.now() }));

// Route 設定
app.use(snapshotRouter);
app.use('/vote', ratelimit({ windowMs: 30 * 1000, max: 3 }), verifyExtensionJwt, voteRouter); // 30 秒內最多 3 次請求
app.use('/admin', adminRouter);

// 啟動時建立示範 market
// initialize DB (if available)
try {
    const d = dbService.init();
    if (d) console.log('[DB] SQLite initialized');
} catch (e) {
    console.warn('[DB] SQLite initialization failed:', e && e.message);
}

openMarket({
    id: 'demo',
    title: '示範市集',
    options: [
        { id: 'A', label: 'Team A' },
        { id: 'B', label: 'Team B' },
        { id: 'C', label: 'Team C' },
    ],
    reward_points: 1,
});

console.log("--- VERSION 2.0 BOOTED AT: " + new Date().toLocaleString() + " ---");

// 啟動伺服器
const PORT = process.env.PORT || 8081; // 預設埠號 8081
const server = app.listen(PORT, () => {
    console.log(`[EBS] Server is running on port ${PORT}`);
});

// [關鍵修復] 設定 Keep-Alive Timeout
// 必須大於 Cloudflared 的設定 (90000ms)，這裡設 120000ms (120秒)
// 這能確保後端不會在 Cloudflared 還想用連線時，突然把電話掛斷
server.keepAliveTimeout = 120 * 1000; 
server.headersTimeout = 121 * 1000; // 必須比 keepAliveTimeout 大