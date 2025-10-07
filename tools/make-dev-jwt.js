// tools/make-dev-jwt.js
require('dotenv').config();
const jwt = require('jsonwebtoken');

const base64 = process.env.EXTENSION_SECRET_BASE64 || '';
const secret = Buffer.from(base64, 'base64');

const now = Math.floor(Date.now() / 1000);
const payload = {
  channel_id: '123456',      // 測試值
  opaque_user_id: 'U123456', // 測試觀眾
  role: 'viewer',
  pubsub_perms: { listen: ['broadcast'], send: [] },
  exp: now + 3600,
  iat: now
};

const token = jwt.sign(payload, secret, { algorithm: 'HS256' });
console.log(token);
