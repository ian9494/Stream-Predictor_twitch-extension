// src/utils/adminTokens.js
// 提供多管理員 token 驗證
const fs = require('fs');
const path = require('path');

const TOKENS_PATH = path.join(__dirname, '../admin-tokens.json');

function getAdminTokens() {
    try {
        const raw = fs.readFileSync(TOKENS_PATH, 'utf8');
        return JSON.parse(raw);
    } catch (e) {
        return [];
    }
}

function getAdminByToken(token) {
    if (!token) return null;
    const tokens = getAdminTokens();
    return tokens.find(admin => admin.token === token) || null;
}

function isValidAdminToken(token) {
    return !!getAdminByToken(token);
}

module.exports = { isValidAdminToken, getAdminByToken };
