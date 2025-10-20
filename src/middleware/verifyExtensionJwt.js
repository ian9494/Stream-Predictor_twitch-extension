// src/middleware/verifyExtensionJwt.js

const jwt = require('jsonwebtoken');
const helix = require('../services/twitchHelix');

// 從環境變數取得 base64 編碼的密鑰，並解碼
const base64Secret = process.env.EXTENSION_SECRET_BASE64 || '';
const secret = Buffer.from(base64Secret, 'base64');

// 驗證來自瀏覽器擴充功能的 JWT
module.exports = async function verifyExtensionJwt(req, res, next) {
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

        let channelId = channel_id;

        // if channelId missing, try fallback using helix and any available login-like fields
        if (!channelId) {
            // attempt to find a login in payload or query param
            const possible = (payload.channel_login || payload.channel_name || payload.login || req.query.channel_login || req.query.login || '').toString();
            if (possible) {
                try {
                    const user = await helix.getUserByLogin(possible);
                    if (user && user.id) {
                        channelId = user.id;
                        console.log('[verifyExtensionJwt] Resolved channelId via Helix for', possible, '->', channelId);
                    }
                } catch (e) {
                    console.warn('[verifyExtensionJwt] Helix lookup failed for', possible, e && e.message);
                }
            }
        }

        // 確保必要欄位存在
        if (!channelId || !opaque_user_id) {
            console.error('JWT payload missing channelId or opaque_user_id (after fallback)', { hasChannelId: !!channelId, hasOpaque: !!opaque_user_id });
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