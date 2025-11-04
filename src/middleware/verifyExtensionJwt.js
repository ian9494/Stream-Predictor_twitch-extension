// src/middleware/verifyExtensionJwt.js

const jwt = require('jsonwebtoken');
require('dotenv').config();

// 從環境變數取得 base64 編碼的密鑰，並解碼
const base64Secret = process.env.EXTENSION_SECRET_BASE64 || '';
const secret = Buffer.from(base64Secret, 'base64');

// 驗證來自瀏覽器擴充功能的 JWT
module.exports = function verifyExtensionJwt(req, res, next) {
    try {
        // 從 Authorization 標頭取得 Bearer token
        const header = req.headers['authorization'] || '';
        const [, token] = header.split(' ');
        if (!token) {
            console.error('JWT missing bearer token');
            return res.status(401).json({ error: 'Missing bearer token' });
        }

        // 驗證 JWT
        const payload = jwt.verify(token, secret, {
            algorithms: ['HS256'],
            clockTolerance: 90, // 允許 90 秒的時間偏差
        });

        // 期待欄位
        const {
            channel_id,
            user_id,    // 可能undefined (匿名用戶)
            opaque_user_id, // 以'U'開頭的Twitch匿名用戶ID
            role,   // viewer/moderator/broadcaster
        } = payload;
        const channelId = channel_id;

        // 可由環境變數 DEBUG_JWT=1 開啟詳細 payload 訊息（只在開發/偵錯時使用）
        if (process.env.DEBUG_JWT === '1') {
            try {
                console.log('[verifyExtensionJwt] payload:', JSON.stringify(payload));
            } catch (e) {
                console.log('[verifyExtensionJwt] payload (non-serializable):', payload);
            }
        }

        // 確保必要欄位存在
        if (!channelId || !opaque_user_id) { 
            console.error('JWT payload missing channelId or opaque_user_id', payload);
            return res.status(401).json({ error: 'Invalid token payload' });
        }

        // 將驗證後的資訊附加到 req 物件，供後續中介軟體或路由使用
        req.twitch = { channelId, user_id, opaque_user_id, role, token };
        next(); // 繼續處理請求
    } catch (err) {
        // JWT 驗證失敗
        console.error('JWT verification error:', err && (err.stack || err.message || err));
        return res.status(401).json({ error: 'JWT verification failed', detail: err && err.message });
    }
};