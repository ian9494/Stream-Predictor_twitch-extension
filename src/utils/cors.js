// src/utils/cors.js

const cors = require('cors');
const allowed = [
    /https:\/\/.*\.ext-twitch\.tv$/,
    /https:\/\/extension-files\.twitch\.tv$/,
    /https:\/\/twitch-extension-api\.noctration\.dev$/, // 後端伺服器
    /chrome-extension:\/\/.+/, // 允許 Chrome Extension
];

const corsMiddleware = cors({
    origin: (o, cb) => (!o || allowed.some(r => r.test(o))) ? cb(null, true) : cb(new Error('CORS not allowed'), false),
    credentials: true,
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Extension-JWT', 'x-admin-token'],
});

module.exports = corsMiddleware;