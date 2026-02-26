const DEFAULT_BASE_URL = 'https://twitch-extension-api.noctration.dev/';
const STORAGE_KEYS = ['adminToken', 'adminUsername'];
const FALLBACK_STORAGE_KEY = 'shotcall-market-control-settings';

const elements = {
    adminArea: document.getElementById('admin-area'),
    adminUsername: document.getElementById('admin-username'),
    refresh: document.getElementById('refresh'),
    status: document.getElementById('status'),
    statusText: document.getElementById('status-text'),
    adminToken: document.getElementById('admin-token'),
    saveSettings: document.getElementById('save-settings'),
    clearSettings: document.getElementById('clear-settings'),
    optionsContainer: document.getElementById('options-container'),
    addOption: document.getElementById('add-option'),
    openMarket: document.getElementById('open-market'),
    openTitle: document.getElementById('open-title'),
    openReward: document.getElementById('open-reward'),
    openDuration: document.getElementById('open-duration'),
    closeMarket: document.getElementById('close-market'),
    closeMarketSelect: document.getElementById('close-market-select'),
    settleMarket: document.getElementById('settle-market'),
    settleMarketSelect: document.getElementById('settle-market-select'),
    settleOption: document.getElementById('settle-option'),
    settleCustomWrapper: document.getElementById('settle-custom-wrapper'),
    settleCustom: document.getElementById('settle-custom'),
    marketSummary: document.getElementById('market-summary'),
    optionTemplate: document.getElementById('option-template'),
    resetLeaderboard: document.getElementById('reset-leaderboard'),
};

const storage = (() => {
    if (typeof chrome !== 'undefined' && chrome.storage?.sync) {
        return {
            async get(keys) {
                return new Promise((resolve) => {
                    chrome.storage.sync.get(keys, (items) => resolve(items ?? {}));
                });
            },
            async set(data) {
                return new Promise((resolve, reject) => {
                    chrome.storage.sync.set(data, () => {
                        const err = chrome.runtime.lastError;
                        if (err) reject(err);
                        else resolve();
                    });
                });
            },
            async remove(keys) {
                return new Promise((resolve, reject) => {
                    chrome.storage.sync.remove(keys, () => {
                        const err = chrome.runtime.lastError;
                        if (err) reject(err);
                        else resolve();
                    });
                });
            },
        };
    }

    return {
        async get(keys) {
            const raw = localStorage.getItem(FALLBACK_STORAGE_KEY);
            const data = raw ? JSON.parse(raw) : {};
            if (!Array.isArray(keys)) return data[keys];
            const result = {};
            keys.forEach((key) => {
                result[key] = data[key];
            });
            return result;
        },
        async set(newData) {
            const raw = localStorage.getItem(FALLBACK_STORAGE_KEY);
            const data = raw ? JSON.parse(raw) : {};
            localStorage.setItem(FALLBACK_STORAGE_KEY, JSON.stringify({ ...data, ...newData }));
        },
        async remove(keys) {
            const raw = localStorage.getItem(FALLBACK_STORAGE_KEY);
            const data = raw ? JSON.parse(raw) : {};
            (Array.isArray(keys) ? keys : [keys]).forEach((key) => {
                delete data[key];
            });
            localStorage.setItem(FALLBACK_STORAGE_KEY, JSON.stringify(data));
        },
    };
})();

const state = {
    baseUrl: DEFAULT_BASE_URL,
    adminToken: '',
    adminUsername: '',
    snapshot: null,
};

function updateAdminUsername() {
    if (!elements.adminUsername) return;
    elements.adminUsername.textContent = state.adminUsername ? `以 ${state.adminUsername} 身分登入` : '';
    
    // 任務 C: 根據驗證狀態動態切換管理介面顯示
    if (state.adminToken && state.adminUsername) {
        elements.adminArea?.classList.remove('hidden');
    } else {
        elements.adminArea?.classList.add('hidden');
    }
}

function setStatus(message, type = 'info') {
    if (!elements.status) return;
    elements.status.classList.remove('hidden', 'success', 'error', 'info');
    const variant = type === 'success' ? 'success' : type === 'error' ? 'error' : 'info';
    elements.status.classList.add(variant);
    elements.statusText.textContent = message;
}

function clearStatus() {
    if (!elements.status) return;
    elements.status.classList.add('hidden');
    elements.statusText.textContent = '';
}

function setLoading(button, loading, label) {
    if (!button) return;
    if (loading) {
        if (!button.dataset.originalText) {
            button.dataset.originalText = button.textContent;
        }
        button.disabled = true;
        if (label) button.textContent = label;
    } else {
        button.disabled = false;
        if (button.dataset.originalText) {
            button.textContent = button.dataset.originalText;
            delete button.dataset.originalText;
        }
    }
}

function requireSettings() {
    const token = state.adminToken?.trim();
    if (!token) {
        throw new Error('請先填寫並儲存管理者金鑰。');
    }
}

async function apiFetch(path, options = {}) {
    const {
        method = 'GET',
        body,
        expectJson = true,
        bypassSettingsCheck = false,
    } = options;

    if (!bypassSettingsCheck) {
        requireSettings();
    }

    const headers = {};
    if (state.adminToken) {
        headers['x-admin-token'] = state.adminToken.trim();
    }

    let payload;
    if (body !== undefined) {
        headers['Content-Type'] = 'application/json';
        payload = typeof body === 'string' ? body : JSON.stringify(body);
    }

    // [修改殭屍線路問題] 加入時間戳記 _t
    // 讓每次按按鈕都是「全新的請求」，Edge 就無法重用那條壞掉的連線
    // Ensure baseUrl is sane — fallback to DEFAULT_BASE_URL if empty
    const separator = path.includes('?') ? '&' : '?';
    const base = (state.baseUrl && String(state.baseUrl).trim())
        ? String(state.baseUrl).replace(/\/$/, '')
        : String(DEFAULT_BASE_URL).replace(/\/$/, '');
    const url = `${base}/${path}${separator}_t=${Date.now()}`;

    // Debugging: log constructed URL so failed requests can be diagnosed
    try {
        console.debug('[popup] apiFetch', method, url, headers, body ? JSON.parse(payload || '{}') : undefined);
    } catch (e) {
        console.debug('[popup] apiFetch', method, url, headers);
    }

    const response = await fetch(url, {
        method,
        headers,
        body: payload,
        cache: 'no-store' // [修改重點] 禁用快取
    });

    if (!response.ok) {
        let detail = '';
        try {
            const err = await response.json();
            detail = err?.error || err?.message || '';
        } catch (error) {
            detail = '';
        }
        const suffix = detail ? `: ${detail}` : '';
        throw new Error(`HTTP ${response.status}${suffix}`);
    }

    if (!expectJson) return null;
    return response.json();
}

function addOptionRow(value = { id: '', label: '' }) {
    if (!elements.optionTemplate || !elements.optionsContainer) return;
    const fragment = elements.optionTemplate.content.cloneNode(true);
    const row = fragment.querySelector('.option-row');
    const idInput = row.querySelector('.option-id');
    const labelInput = row.querySelector('.option-label');
    const removeBtn = row.querySelector('.remove-option');

    idInput.value = value.id || '';
    labelInput.value = value.label || '';

    removeBtn.addEventListener('click', (event) => {
        event.preventDefault();
        row.remove();
        ensureOptionRows();
    });

    elements.optionsContainer.appendChild(fragment);
}

function ensureOptionRows() {
    if (!elements.optionsContainer) return;
    if (elements.optionsContainer.querySelectorAll('.option-row').length === 0) {
        addOptionRow({ id: 'A', label: 'Team A' });
        addOptionRow({ id: 'B', label: 'Team B' });
    }
}

function collectOptions() {
    if (!elements.optionsContainer) return [];
    const rows = elements.optionsContainer.querySelectorAll('.option-row');
    const options = [];
    rows.forEach((row) => {
        const idInput = row.querySelector('.option-id');
        const labelInput = row.querySelector('.option-label');
        const id = idInput.value.trim();
        const label = labelInput.value.trim();
        if (!id || !label) {
            throw new Error('每個選項都需要填寫 ID 與標籤。');
        }
        options.push({ id, label });
    });
    if (options.length < 2) {
        throw new Error('至少需要兩個選項。');
    }
    return options;
}

function getRewardPoints() {
    const input = elements.openReward;
    const raw = input ? input.value.trim() : '';
    if (!raw) {
        return 1;
    }
    const reward = Number.parseInt(raw, 10);
    if (!Number.isFinite(reward) || reward <= 0) {
        throw new Error('正確獲得積分需為正整數');
    }
    if (input) input.value = String(reward);
    return reward;
}

async function saveSettings() {
    const token = elements.adminToken.value.trim();

    if (!token) {
        setStatus('金鑰不可留白。', 'error');
        return;
    }

    setStatus('驗證中...', 'info');
    setLoading(elements.saveSettings, true, '驗證中...');

    try {
        // 任務 B: 使用 fetch 發送 POST 請求到後端的 /verify
        const responseData = await apiFetch('admin/verify', {
            method: 'POST',
            body: { token },
            bypassSettingsCheck: true // 驗證時跳過 requireSettings
        });

        if (responseData.ok) {
            // 任務 C: 驗證成功時更新 state 並儲存
            state.adminToken = token;
            state.adminUsername = responseData.username || 'Admin';
            await storage.set({ adminToken: token, adminUsername: state.adminUsername });
            
            updateAdminUsername();
            setStatus('驗證成功！設定已儲存。', 'success');
            await refreshSnapshot(false);
        }
    } catch (error) {
        // 任務 D: 錯誤處理與提示
        let errorMsg = '連線失敗或管理員驗證錯誤。';
        if (error.message.includes('401')) {
            errorMsg = '帳號或金鑰錯誤，請重新確認。';
        } else if (error.message.includes('HTTP')) {
            errorMsg = `伺服器回傳錯誤: ${error.message}`;
        }
        
        setStatus(errorMsg, 'error');
        alert(`驗證失敗: ${errorMsg}`); // 添加彈窗提示
    } finally {
        setLoading(elements.saveSettings, false);
    }
}

async function clearSettings() {
    await storage.remove(STORAGE_KEYS);
    state.adminToken = '';
    state.adminUsername = '';
    if (elements.adminToken) elements.adminToken.value = '';
    updateAdminUsername();
    setStatus('帳號已登出。', 'success');
}

async function loadSettings() {
    const saved = await storage.get(STORAGE_KEYS);
    if (saved?.adminToken) {
        state.adminToken = saved.adminToken;
        if (elements.adminToken) elements.adminToken.value = saved.adminToken;
    }
    if (saved?.adminUsername) {
        state.adminUsername = saved.adminUsername;
    }
    updateAdminUsername();
}

function buildMarketSummaryItem(market) {
    const counts = market.counts || {};
    const options = market.options || [];
    const lines = options.map((opt) => {
        const votes = counts[opt.id] || 0;
        return `<div class="option-item"><span>${opt.id} · ${opt.label}</span><span>${votes} 票</span></div>`;
    }).join('');
    const startedAt = market.started_at ? new Date(market.started_at).toLocaleString() : '-';
    const rewardPoints = market.reward_points ?? 1;
    return `
        <div class="market-card">
            <div><strong>${market.title}</strong></div>
            <div class="card-help">預測 ID：${market.id}</div>
            <div class="card-help">狀態：<span style="text-transform:uppercase;">${market.status}</span></div>
            <div class="card-help">開始時間：${startedAt}</div>
            <div class="card-help">Reward points for correct pick: ${rewardPoints}</div>
            <div class="options">${lines}</div>
        </div>
    `;
}function renderSnapshot(snapshot) {
    const container = elements.marketSummary;
    if (!container) return;

    const markets = Array.isArray(snapshot?.markets) && snapshot.markets.length
        ? snapshot.markets
        : (snapshot?.market ? [snapshot.market] : []);

    if (!markets.length) {
        container.classList.add('empty');
        container.innerHTML = '目前沒有進行中的預測，請先建立新的預測。';
        populateMarketSelectors([]);
        return;
    }

    container.classList.remove('empty');
    container.innerHTML = markets.map(buildMarketSummaryItem).join('');
    populateMarketSelectors(markets);
}

function populateMarketSelectors(markets) {
    const closable = markets.filter((market) => market.status === 'open');
    const settleable = markets.filter((market) => market.status !== 'settled');

    updateSelect(elements.closeMarketSelect, closable, '選擇要關閉的預測');
    updateSelect(elements.settleMarketSelect, settleable, '選擇要結算的預測');

    updateSettleOptions(elements.settleMarketSelect.value, settleable);
}

function updateSelect(select, markets, placeholder) {
    if (!select) return;
    const currentValue = select.value;
    select.innerHTML = '';

    const placeholderOption = document.createElement('option');
    placeholderOption.value = '';
    placeholderOption.textContent = placeholder;
    select.appendChild(placeholderOption);

    markets.forEach((market) => {
        const option = document.createElement('option');
        option.value = market.id;
        option.textContent = `${market.id} · ${market.title}`;
        select.appendChild(option);
    });

    if (markets.some((market) => market.id === currentValue)) {
        select.value = currentValue;
    }
}

function updateSettleOptions(marketId, marketsFromArg) {
    if (!elements.settleOption) return;
    const markets = marketsFromArg ?? (Array.isArray(state.snapshot?.markets) ? state.snapshot.markets : []);
    const targetMarket = markets.find((market) => market.id === marketId);

    elements.settleOption.innerHTML = '';

    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = targetMarket ? '請選擇獲勝選項' : '沒有可用的選項';
    elements.settleOption.appendChild(placeholder);

    if (targetMarket) {
        (targetMarket.options || []).forEach((opt) => {
            const option = document.createElement('option');
            option.value = opt.id;
            option.textContent = `${opt.id} · ${opt.label}`;
            elements.settleOption.appendChild(option);
        });
    }

    const cancel = document.createElement('option');
    cancel.value = '_CANCEL_';
    cancel.textContent = '⛔ 流盤 (不發放積分)';
    elements.settleOption.appendChild(cancel);

    const custom = document.createElement('option');
    custom.value = '_custom';
    custom.textContent = '手動輸入選項 ID';
    elements.settleOption.appendChild(custom);

    elements.settleCustom.value = '';
    toggleCustomSettle(false);
}

function toggleCustomSettle(show) {
    if (!elements.settleCustomWrapper) return;
    if (show) {
        elements.settleCustomWrapper.classList.remove('hidden');
    } else {
        elements.settleCustomWrapper.classList.add('hidden');
        if (elements.settleCustom) elements.settleCustom.value = '';
    }
}

async function refreshSnapshot(showStatus = true) {
    try {
        if (showStatus) setStatus('載入預測資料中…', 'info');
        const snapshot = await apiFetch('snapshot');
        state.snapshot = snapshot;
        renderSnapshot(snapshot);
        if (showStatus) setStatus('預測資料已更新。', 'success');
    } catch (error) {
        state.snapshot = null;
        renderSnapshot(null);
        setStatus(`無法載入預測資料：${error.message}`, 'error');
    }
}

async function handleOpenMarket() {
    let options;
    let rewardPoints;
    try {
        options = collectOptions();
        rewardPoints = getRewardPoints();
        requireSettings();
    } catch (error) {
        setStatus(error.message, 'error');
        return;
    }

    const id = Math.random().toString(36).substring(2, 7).toUpperCase();
    const title = elements.openTitle.value.trim();
    const duration = elements.openDuration ? parseInt(elements.openDuration.value, 10) : 0;

    if (!title) {
        setStatus('請輸入預測標題。', 'error');
        return;
    }

    setStatus('開啟預測中…', 'info');
    setLoading(elements.openMarket, true, '開啟中…');

    try {
        await apiFetch('admin/open', {
            method: 'POST',
            body: { 
                id, 
                title, 
                options, 
                reward_points: rewardPoints,
                auto_close_seconds: isNaN(duration) || duration <= 0 ? null : duration
            },
        });
        setStatus('預測建立成功。', 'success');
        elements.openTitle.value = '';
        if (elements.openDuration) elements.openDuration.value = '';
        await refreshSnapshot(false);
    } catch (error) {
        setStatus(`預測建立失敗：${error.message}`, 'error');
    } finally {
        setLoading(elements.openMarket, false);
    }
}
async function handleCloseMarket() {
    const marketId = elements.closeMarketSelect?.value;
    if (!marketId) {
        setStatus('請選擇要關閉的預測。', 'error');
        return;
    }

    setStatus('關閉預測中…', 'info');
    setLoading(elements.closeMarket, true, '關閉中…');

    try {
        await apiFetch('admin/close', {
            method: 'POST',
            body: { market_id: marketId },
        });
        setStatus('預測已關閉，將停止接受玩家預測。', 'success');
        await refreshSnapshot(false);
    } catch (error) {
        setStatus(`關閉預測失敗：${error.message}`, 'error');
    } finally {
        setLoading(elements.closeMarket, false);
    }
}

async function handleSettleMarket() {
    const marketId = elements.settleMarketSelect?.value;
    if (!marketId) {
        setStatus('請選擇要結算的預測。', 'error');
        return;
    }

    let optionId = elements.settleOption.value;
    if (optionId === '_custom') {
        optionId = elements.settleCustom.value.trim();
        if (!optionId) {
            setStatus('請輸入獲勝選項的 ID。', 'error');
            return;
        }
    }

    if (!optionId) {
        setStatus('請選擇獲勝選項。', 'error');
        return;
    }

    setStatus('結算預測中…', 'info');
    setLoading(elements.settleMarket, true, '結算中…');

    try {
        await apiFetch('admin/settle', {
            method: 'POST',
            body: { market_id: marketId, correct_option_id: optionId },
        });
        setStatus('預測已成功結算。', 'success');
        await refreshSnapshot(false);
    } catch (error) {
        setStatus(`結算預測失敗：${error.message}`, 'error');
    } finally {
        setLoading(elements.settleMarket, false);
    }
}

async function handleResetLeaderboard() {
    if (!confirm('你確定要重設排行榜嗎？這將會清除所有玩家的積分數據，且無法復原！')) {
        return;
    }

    setStatus('正在重設排行榜...', 'info');
    setLoading(elements.resetLeaderboard, true, '重設中...');

    try {
        await apiFetch('admin/reset-leaderboard', {
            method: 'POST',
            body: { confirm: 'yes' },
        });
        setStatus('排行榜已成功重設。', 'success');
    } catch (error) {
        setStatus(`重設排行榜失敗：${error.message}`, 'error');
    } finally {
        setLoading(elements.resetLeaderboard, false);
    }
}

function attachEventListeners() {
    elements.saveSettings?.addEventListener('click', (event) => {
        event.preventDefault();
        saveSettings();
    });

    elements.clearSettings?.addEventListener('click', (event) => {
        event.preventDefault();
        clearSettings();
    });

    elements.addOption?.addEventListener('click', (event) => {
        event.preventDefault();
        addOptionRow();
    });

    elements.openMarket?.addEventListener('click', (event) => {
        event.preventDefault();
        handleOpenMarket();
    });

    elements.closeMarket?.addEventListener('click', (event) => {
        event.preventDefault();
        handleCloseMarket();
    });

    elements.settleMarket?.addEventListener('click', (event) => {
        event.preventDefault();
        handleSettleMarket();
    });

    elements.resetLeaderboard?.addEventListener('click', (event) => {
        event.preventDefault();
        handleResetLeaderboard();
    });

    elements.refresh?.addEventListener('click', (event) => {
        event.preventDefault();
        refreshSnapshot();
    });

    elements.settleOption?.addEventListener('change', () => {
        toggleCustomSettle(elements.settleOption.value === '_custom');
    });

    elements.settleMarketSelect?.addEventListener('change', () => {
        updateSettleOptions(elements.settleMarketSelect.value);
    });
}

async function init() {
    ensureOptionRows();
    attachEventListeners();
    await loadSettings();
    if (state.adminToken) {
        await refreshSnapshot(false);
    } else {
        clearStatus();
    }
}

document.addEventListener('DOMContentLoaded', init);
