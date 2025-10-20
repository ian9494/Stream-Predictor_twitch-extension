const fetch = require('node-fetch');

const CLIENT_ID = process.env.TWITCH_CLIENT_ID;
const CLIENT_SECRET = process.env.TWITCH_CLIENT_SECRET;
const CACHE_TTL = parseInt(process.env.HELIX_CACHE_TTL || '600', 10) * 1000; // ms
const RETRY = parseInt(process.env.HELIX_RETRY_COUNT || '2', 10);

let appToken = null;
let appTokenExpiresAt = 0;
const cache = new Map(); // key -> { ts, data }

async function getAppAccessToken() {
  if (!CLIENT_ID || !CLIENT_SECRET) {
    throw new Error('TWITCH_CLIENT_ID/SECRET not set');
  }
  const now = Date.now();
  if (appToken && appTokenExpiresAt > now + 5000) return appToken;

  const url = `https://id.twitch.tv/oauth2/token?client_id=${CLIENT_ID}&client_secret=${CLIENT_SECRET}&grant_type=client_credentials`;
  const res = await fetch(url, { method: 'POST' });
  if (!res.ok) throw new Error('Failed to get app access token');
  const body = await res.json();
  appToken = body.access_token;
  // expires_in is in seconds
  appTokenExpiresAt = now + ((body.expires_in || 1800) * 1000);
  return appToken;
}

async function helixFetch(path, opts = {}) {
  const token = await getAppAccessToken();
  const headers = Object.assign({}, opts.headers || {}, {
    'Client-Id': CLIENT_ID,
    'Authorization': `Bearer ${token}`,
  });
  const url = `https://api.twitch.tv/helix/${path}`;
  for (let i = 0; i <= RETRY; i++) {
    try {
      const res = await fetch(url, Object.assign({}, opts, { headers }));
      if (res.status === 429) {
        // rate limited, wait and retry
        const wait = Math.pow(2, i) * 200;
        await new Promise(r => setTimeout(r, wait));
        continue;
      }
      if (!res.ok) {
        const txt = await res.text();
        throw new Error(`Helix ${res.status}: ${txt}`);
      }
      return await res.json();
    } catch (e) {
      if (i === RETRY) throw e;
      const wait = Math.pow(2, i) * 200;
      await new Promise(r => setTimeout(r, wait));
    }
  }
}

async function getUserByLogin(login) {
  if (!login) return null;
  const key = `login:${login.toLowerCase()}`;
  const now = Date.now();
  const cached = cache.get(key);
  if (cached && (now - cached.ts) < CACHE_TTL) return cached.data;
  try {
    const json = await helixFetch(`users?login=${encodeURIComponent(login)}`);
    const user = (json && json.data && json.data[0]) || null;
    if (user) cache.set(key, { ts: now, data: user });
    return user;
  } catch (e) {
    return null;
  }
}

async function getUserById(id) {
  if (!id) return null;
  const key = `id:${id}`;
  const now = Date.now();
  const cached = cache.get(key);
  if (cached && (now - cached.ts) < CACHE_TTL) return cached.data;
  try {
    const json = await helixFetch(`users?id=${encodeURIComponent(id)}`);
    const user = (json && json.data && json.data[0]) || null;
    if (user) cache.set(key, { ts: now, data: user });
    return user;
  } catch (e) {
    return null;
  }
}

module.exports = { getUserByLogin, getUserById, getAppAccessToken };
