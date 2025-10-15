// API 伺服器的固定 base URL
const DEFAULT_BASE_URL = 'https://twitch-extension-api.noctration.dev/';
// 只儲存 adminToken
const STORAGE_KEYS = ['adminToken'];
const FALLBACK_STORAGE_KEY = 'shotcall-market-control-settings';

// 快速取得所有會用到的 DOM 元素
const elements = {
    refresh: document.getElementById('refresh'),
    status: document.getElementById('status'),
    statusText: document.getElementById('status-text'),
    // apiBase: document.getElementById('api-base'),
    adminToken: document.getElementById('admin-token'),
    saveSettings: document.getElementById('save-settings'),
    clearSettings: document.getElementById('clear-settings'),
    optionsContainer: document.getElementById('options-container'),
    addOption: document.getElementById('add-option'),
    openMarket: document.getElementById('open-market'),
    openId: document.getElementById('open-id'),
    openTitle: document.getElementById('open-title'),
    closeMarket: document.getElementById('close-market'),
    settleMarket: document.getElementById('settle-market'),
    settleOption: document.getElementById('settle-option'),
    settleCustomWrapper: document.getElementById('settle-custom-wrapper'),
    settleCustom: document.getElementById('settle-custom'),
    marketSummary: document.getElementById('market-summary'),
    optionTemplate: document.getElementById('option-template')
};

// 儲存與取得設定（優先用 chrome.storage，同步到 Google 帳號；否則用 localStorage）
const storage = (() => {
    if (typeof chrome !== 'undefined' && chrome.storage?.sync) {
        return {
            async get(keys) {
                return new Promise((resolve) => {
                    chrome.storage.sync.get(keys, (items) => {
                        resolve(items ?? {});
                    });
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
            }
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
        }
    };
})();

// 前端狀態（目前 baseUrl、adminToken、快照資料）
const state = {
    baseUrl: DEFAULT_BASE_URL,
    adminToken: '',
    snapshot: null
};

// 顯示狀態訊息（info/success/error）
function setStatus(message, type = 'info') {
    if (!elements.status) return;
    elements.status.classList.remove('hidden', 'success', 'error', 'info');
    const variant = type === 'success' ? 'success' : type === 'error' ? 'error' : 'info';
    elements.status.classList.add(variant);
    elements.statusText.textContent = message;
}

// 清除狀態訊息
function clearStatus() {
    if (!elements.status) return;
    elements.status.classList.add('hidden');
    elements.statusText.textContent = '';
}

// 按鈕進入 loading 狀態，避免重複點擊
function setLoading(button, loading, label = 'Working…') {
    if (!button) return;
    if (loading) {
        if (!button.dataset.originalText) {
            button.dataset.originalText = button.textContent;
        }
        button.textContent = label;
        button.disabled = true;
    } else {
        if (button.dataset.originalText) {
            button.textContent = button.dataset.originalText;
            delete button.dataset.originalText;
        }
        button.disabled = false;
    }
}

// 載入儲存的 adminToken 設定
async function loadSettings() {
    try {
        const data = await storage.get(STORAGE_KEYS);
        const adminToken = (data.adminToken || '').trim();
        state.baseUrl = DEFAULT_BASE_URL;
        state.adminToken = adminToken;
        elements.adminToken.value = adminToken;
    } catch (error) {
        console.error('Failed to load settings', error);
        setStatus(`Failed to load saved settings: ${error.message ?? error}`, 'error');
    }
}

// 儲存 adminToken 設定
async function saveSettings() {
    const adminToken = elements.adminToken.value.trim();
    if (!adminToken) {
        setStatus('Admin Token is required.', 'error');
        return;
    }
    try {
        await storage.set({ adminToken });
        state.baseUrl = DEFAULT_BASE_URL;
        state.adminToken = adminToken;
        setStatus('Token saved.', 'success');
        await refreshSnapshot(false);
    } catch (error) {
        setStatus(`Unable to save token: ${error.message ?? error}`, 'error');
    }
}

// 清除 adminToken 設定
async function clearSettings() {
    try {
        await storage.remove(STORAGE_KEYS);
        state.baseUrl = DEFAULT_BASE_URL;
        state.adminToken = '';
        elements.adminToken.value = '';
        setStatus('Token cleared.', 'success');
    } catch (error) {
        setStatus(`Unable to clear token: ${error.message ?? error}`, 'error');
    }
}

// 新增一個選項輸入列（for 開盤）
function addOptionRow(option = {}) {
    const clone = elements.optionTemplate.content.firstElementChild.cloneNode(true);
    const idInput = clone.querySelector('.option-id');
    const labelInput = clone.querySelector('.option-label');
    idInput.value = option.id ?? '';
    labelInput.value = option.label ?? '';

    const removeButton = clone.querySelector('.remove-option');
    removeButton.addEventListener('click', (event) => {
        event.preventDefault();
        if (elements.optionsContainer.children.length <= 2) {
            setStatus('At least two options are required.', 'error');
            return;
        }
        clone.remove();
        clearStatus();
        updateRemoveButtons();
    });

    elements.optionsContainer.appendChild(clone);
    updateRemoveButtons();
}

// 根據選項數量決定移除按鈕是否可用
function updateRemoveButtons() {
    const rows = [...elements.optionsContainer.querySelectorAll('.option-row')];
    const shouldDisable = rows.length <= 2;
    rows.forEach((row) => {
        const btn = row.querySelector('.remove-option');
        btn.disabled = shouldDisable;
    });
}

// 收集所有選項欄位的值，並檢查格式
function collectOptions() {
    const rows = [...elements.optionsContainer.querySelectorAll('.option-row')];
    const options = [];
    const ids = new Set();

    for (const row of rows) {
        const id = row.querySelector('.option-id').value.trim();
        const label = row.querySelector('.option-label').value.trim();
        if (!id || !label) {
            throw new Error('Each option needs both an ID and a label.');
        }
        if (ids.has(id)) {
            throw new Error(`Duplicate option ID detected: ${id}`);
        }
        ids.add(id);
        options.push({ id, label });
    }

    if (options.length < 2) {
        throw new Error('Provide at least two options.');
    }

    return options;
}

// 驗證 adminToken 是否已輸入，並回傳設定
function requireSettings() {
    const adminToken = elements.adminToken.value.trim();
    if (!adminToken) {
        throw new Error('Set the Admin Token first.');
    }
    state.baseUrl = DEFAULT_BASE_URL;
    state.adminToken = adminToken;
    return { baseUrl: DEFAULT_BASE_URL, adminToken };
}

// 封裝 fetch，帶上 adminToken，與錯誤處理
async function apiFetch(path, { method = 'GET', body, expectJson = true } = {}) {
    const url = new URL(path, state.baseUrl);
    const headers = {
        'Content-Type': 'application/json',
        ...(state.adminToken ? { 'x-admin-token': state.adminToken } : {})
    };

    const response = await fetch(url.toString(), {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined
    });

    if (!response.ok) {
        let message = `HTTP ${response.status}`;
        try {
            const errorData = await response.json();
            if (errorData?.error || errorData?.message) {
                message = errorData.error || errorData.message;
            }
        } catch (e) {
            // ignore
        }
        throw new Error(message);
    }

    if (!expectJson) return null;

    try {
        return await response.json();
    } catch (error) {
        throw new Error('Server returned an unexpected response.');
    }
}

// 處理「開啟市集」按鈕事件
async function handleOpenMarket() {
    let options;
    try {
        requireSettings();
        options = collectOptions();
    } catch (error) {
        setStatus(error.message, 'error');
        return;
    }

    const id = elements.openId.value.trim();
    const title = elements.openTitle.value.trim();

    if (!id) {
        setStatus('Market ID is required.', 'error');
        return;
    }
    if (!title) {
        setStatus('Market title is required.', 'error');
        return;
    }

    setStatus('Opening market...', 'info');
    setLoading(elements.openMarket, true, 'Opening…');

    try {
        await apiFetch('admin/open', {
            method: 'POST',
            body: { id, title, options }
        });
        setStatus('Market opened successfully.', 'success');
        await refreshSnapshot(false);
    } catch (error) {
        setStatus(`Failed to open market: ${error.message}`, 'error');
    } finally {
        setLoading(elements.openMarket, false);
    }
}

// 處理「關閉市集」按鈕事件
async function handleCloseMarket() {
    try {
        requireSettings();
    } catch (error) {
        setStatus(error.message, 'error');
        return;
    }

    setStatus('Closing market...', 'info');
    setLoading(elements.closeMarket, true, 'Closing…');

    try {
        await apiFetch('admin/close', { method: 'POST', expectJson: false });
        setStatus('Market closed. No more votes allowed.', 'success');
        await refreshSnapshot(false);
    } catch (error) {
        setStatus(`Failed to close market: ${error.message}`, 'error');
    } finally {
        setLoading(elements.closeMarket, false);
    }
}

// 處理「結算市集」按鈕事件
async function handleSettleMarket() {
    try {
        requireSettings();
    } catch (error) {
        setStatus(error.message, 'error');
        return;
    }

    let optionId = elements.settleOption.value;
    if (optionId === '_custom') {
        optionId = elements.settleCustom.value.trim();
        if (!optionId) {
            setStatus('Enter the winning option ID.', 'error');
            return;
        }
    }

    if (!optionId) {
        setStatus('Select the winning option.', 'error');
        return;
    }

    setStatus('Settling market...', 'info');
    setLoading(elements.settleMarket, true, 'Settling…');

    try {
        await apiFetch('admin/settle', {
            method: 'POST',
            body: { correct_option_id: optionId }
        });
        setStatus('Market settled and winnings distributed.', 'success');
        await refreshSnapshot(false);
    } catch (error) {
        setStatus(`Failed to settle market: ${error.message}`, 'error');
    } finally {
        setLoading(elements.settleMarket, false);
    }
}

// 重新取得市集快照，更新畫面
async function refreshSnapshot(showStatus = true) {
    try {
        requireSettings();
    } catch (error) {
        if (showStatus) setStatus(error.message, 'error');
        return;
    }

    if (showStatus) setStatus('Loading snapshot...', 'info');

    try {
        const snapshot = await apiFetch('snapshot');
        state.snapshot = snapshot;
        renderSnapshot(snapshot);
        if (showStatus) setStatus('Snapshot updated.', 'success');
    } catch (error) {
        state.snapshot = null;
        renderSnapshot(null);
        setStatus(`Unable to load snapshot: ${error.message}`, 'error');
    }
}

// 將市集快照渲染到畫面
function renderSnapshot(snapshot) {
    const container = elements.marketSummary;
    if (!container) return;

    if (!snapshot?.market) {
        container.classList.add('empty');
        container.innerHTML = 'No active market. Open a new one to start accepting votes.';
        updateSettleOptions([]);
        return;
    }

    const market = snapshot.market;
    const counts = market.counts ?? {};
    const startedAt = market.started_at ? new Date(market.started_at).toLocaleString() : '—';
    const options = market.options ?? [];

    const items = options.map((opt) => {
        const votes = counts[opt.id] ?? 0;
        return `<div class="option-item"><span>${opt.id} — ${opt.label}</span><span>${votes} vote${votes === 1 ? '' : 's'}</span></div>`;
    }).join('');

    container.classList.remove('empty');
    container.innerHTML = `
        <div><strong>${market.title}</strong></div>
        <div class="card-help">ID: ${market.id} &nbsp;•&nbsp; Status: <span style="text-transform:uppercase;">${market.status}</span></div>
        <div class="card-help">Started: ${startedAt}</div>
        <div class="options">${items}</div>
    `;

    updateSettleOptions(options);
}

// 更新結算下拉選單的選項
function updateSettleOptions(options) {
    elements.settleOption.innerHTML = '';

    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = options.length ? 'Select winning option' : 'No options available';
    elements.settleOption.appendChild(placeholder);

    options.forEach((opt) => {
        const option = document.createElement('option');
        option.value = opt.id;
        option.textContent = `${opt.id} — ${opt.label}`;
        elements.settleOption.appendChild(option);
    });

    const custom = document.createElement('option');
    custom.value = '_custom';
    custom.textContent = 'Enter option ID manually';
    elements.settleOption.appendChild(custom);

    elements.settleCustom.value = '';
    toggleCustomSettle(false);
}

// 切換自訂結算選項輸入欄位顯示/隱藏
function toggleCustomSettle(show) {
    if (show) {
        elements.settleCustomWrapper.classList.remove('hidden');
    } else {
        elements.settleCustomWrapper.classList.add('hidden');
        elements.settleCustom.value = '';
    }
}

// 預設至少有兩個選項欄位
function ensureOptionRows() {
    if (elements.optionsContainer.children.length === 0) {
        addOptionRow({ id: 'A', label: 'Team A' });
        addOptionRow({ id: 'B', label: 'Team B' });
    }
}

// 綁定所有按鈕與互動事件
function attachEventListeners() {
    elements.saveSettings.addEventListener('click', (event) => {
        event.preventDefault();
        saveSettings();
    });

    elements.clearSettings.addEventListener('click', (event) => {
        event.preventDefault();
        clearSettings();
    });

    elements.addOption.addEventListener('click', (event) => {
        event.preventDefault();
        addOptionRow();
    });

    elements.openMarket.addEventListener('click', (event) => {
        event.preventDefault();
        handleOpenMarket();
    });

    elements.closeMarket.addEventListener('click', (event) => {
        event.preventDefault();
        handleCloseMarket();
    });

    elements.settleMarket.addEventListener('click', (event) => {
        event.preventDefault();
        handleSettleMarket();
    });

    elements.refresh.addEventListener('click', (event) => {
        event.preventDefault();
        refreshSnapshot();
    });

    elements.settleOption.addEventListener('change', () => {
        toggleCustomSettle(elements.settleOption.value === '_custom');
    });
}

// 初始化頁面
async function init() {
    ensureOptionRows();
    attachEventListeners();
    await loadSettings();
    if (state.baseUrl && state.adminToken) {
        await refreshSnapshot(false);
    } else {
        clearStatus();
    }
}

// 頁面載入完成後執行初始化
document.addEventListener('DOMContentLoaded', init);
