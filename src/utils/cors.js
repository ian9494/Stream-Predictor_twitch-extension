// src/utils/cors.js

const cors = require('cors');
const allowed = [
    /https:\/\/client-.*\.ext-twitch\.tv$/,
    /https:\/\/extension-files\.twitch\.tv$/,
    /https:\/\/twitch-extension-api\.noctration\.dev$/,
];

const corsMiddleware = cors({
    origin: (o, cb) => (!o || allowed.some(r => r.test(o))) ? cb(null, true) : cb(new Error('CORS not allowed'), false),
    credentials: true,
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Extension-JWT'],
});

module.exports = corsMiddleware;