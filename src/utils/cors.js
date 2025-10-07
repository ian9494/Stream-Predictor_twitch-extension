// src/utils/cors.js

const PROD_REGEX = /\.ext-twitch\.tv$/i // 允許的生產環境網域

function corsOptions() {
    const isProd = process.env.NODE_ENV === 'production';
    return {
        origin: (origin, callback) => {
            if (!origin) return callback(null, true); // curl / health check
            if (!isProd) return callback(null, true); // 開發環境允許所有來源
            try {
                // 解析 origin 並檢查是否符合生產環境規則
                const host = new URL(origin).hostname;
                if (PROD_REGEX.test(host)) return callback(null, true);
            } catch (_) {}
                // 無效的 URL
                return callback(new Error('Not allowed by CORS'), false);
            },
        credentials: false,
        methods: ['GET', 'POST', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization'],
    };
}

module.exports = { corsOptions };