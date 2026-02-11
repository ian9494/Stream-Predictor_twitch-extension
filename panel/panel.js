document.addEventListener('DOMContentLoaded', () => {
    const VERSION = '2025.10.16-multi';
    const FETCH_INTERVAL = 3000;
    const EBS_BASE = (location.hostname === 'localhost')
        ? 'http://localhost:8081'
        : 'https://twitch-extension-api.noctration.dev';

    const elVersion = document.getElementById('version');
    const elMarket = document.getElementById('market');
    const elMsg = document.getElementById('msg');
    const elLeaderboard = document.getElementById('leaderboard');
    const elSelfInfo = document.getElementById('self-info');

    if (elVersion) {
        elVersion.textContent = `版本：${VERSION}`;
    }

    let pollTimer = null;
    let authToken = null;
    let userId = null;
    let opaqueUserId = null;
    let isFetching = false;
    let pollTimeoutId = null;
    let pollingActive = false;
    let currentPollInterval = FETCH_INTERVAL;

    function setMsg(text = '', ok = true) {
        if (!elMsg) return;
        elMsg.textContent = text;
        elMsg.style.color = ok ? '#8ef58e' : '#ff7575';
    }

    function startPolling() {
        pollingActive = true;
        if (pollTimeoutId) clearTimeout(pollTimeoutId);
        // kick off recursive poll
        pollData();
    }

    function stopPolling() {
        pollingActive = false;
        if (pollTimeoutId) clearTimeout(pollTimeoutId);
        pollTimeoutId = null;
    }

    // 防堆積輪詢：如果上一個未結束則跳過，並使用 AbortController 做主動超時
    async function pollData() {
        if (!pollingActive) return;
        if (isFetching) {
            // 如果還在跑，就用目前的頻率重試，避免堆積過多請求
            pollTimeoutId = setTimeout(pollData, currentPollInterval);
            return;
        }
        isFetching = true;
        const controller = new AbortController();
        const fetchTimeout = setTimeout(() => controller.abort(), 8000);
        try {
            await fetchSnapshots(controller.signal);

            // 如果正常，回復正常的3秒輪詢頻率
            currentPollInterval = FETCH_INTERVAL;

        } catch (err) {
            console.log('pollData fetch error:', err && (err.message || err));

            // 如果是 fetch 失敗或超時，增加輪詢頻率到10秒，避免短時間內重複失敗
            currentPollInterval = 10000;
        } finally {
            clearTimeout(fetchTimeout);
            isFetching = false;
            if (pollingActive) {
                pollTimeoutId = setTimeout(pollData, currentPollInterval);
            }
        }
    }

    function renderMarkets(data) {
        if (!elMarket) return;

        elMarket.innerHTML = '';

        const markets = Array.isArray(data?.markets) && data.markets.length
            ? data.markets
            : (data?.market ? [data.market] : []);

        if (!markets.length) {
            elMarket.innerHTML = '<div class="card">目前沒有進行中的預測。</div>';
            return;
        }

        markets.forEach((market) => {
            const counts = market.counts || {};
            const card = document.createElement('div');
            card.className = 'card market-card';
            card.innerHTML = `
                <div class="market-title"><strong>${market.title}</strong></div>
                <div class="small">預測 ID：${market.id}</div>
                <div class="small">狀態：${market.status || '-'} </div>
                <div class="small">正確獲得積分：${market.reward_points ?? 1}</div>
                <div class="row market-options"></div>
                <div class="small">開始時間：${market.started_at ? new Date(market.started_at).toLocaleString() : '-'} </div>
                ${market.status === 'settled' && market.correct_option_id
                    ? `<div class="small">正確選項：${market.correct_option_id}</div>` : ''}
            `;

            const optionsRow = card.querySelector('.market-options');
            (market.options || []).forEach((opt) => {
                const count = counts[opt.id] || 0;
                const btn = document.createElement('button');
                btn.className = 'btn option';
                btn.disabled = market.status !== 'open';
                btn.textContent = `${opt.label} (${count})`;
                btn.addEventListener('click', async () => {
                    try {
                        setMsg('送出預測中…');
                        const resp = await fetch(`${EBS_BASE}/vote`, {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                                ...(authToken ? { 'Authorization': `Bearer ${authToken}` } : {}),
                            },
                            body: JSON.stringify({
                                market_id: market.id,
                                option_id: opt.id,
                            }),
                        });
                        if (!resp.ok) {
                            const err = await resp.json().catch(() => ({}));
                            throw new Error(err.error || err.message || `HTTP ${resp.status}`);
                        }
                        setMsg('預測成功！', true);
                        await fetchSnapshots();
                    } catch (error) {
                        setMsg(`預測失敗：${error.message}`, false);
                    }
                });
                optionsRow.appendChild(btn);
            });

            elMarket.appendChild(card);
        });
    }

    function renderLeaderboard(leaderboard) {
        if (!elLeaderboard) return;
        if (!Array.isArray(leaderboard) || leaderboard.length === 0) {
            elLeaderboard.innerHTML = '<div>暫無排行榜資料。</div>';
            return;
        }
        let html = '<div style="font-weight:bold;margin-bottom:4px;">排行榜</div>';
        html += '<table style="width:100%;font-size:13px;text-align:center;"><thead><tr><th>名次</th><th>玩家</th><th>積分</th><th>勝場</th><th>總預測數</th><th>勝率</th></tr></thead><tbody>';
        leaderboard.forEach((row, idx) => {
            const name = row.displayName || (row.user || '').replace(/^(user:|opaque:)/, '');
            const winRate = row.win_rate !== undefined ? `${(row.win_rate * 100).toFixed(0)}%` : '-';
            html += `<tr><td>${idx + 1}</td><td>${name}</td><td>${row.total_points || 0}</td><td>${row.win_count || 0}</td><td>${row.total_votes || 0}</td><td>${winRate}</td></tr>`;
        });
        html += '</tbody></table>';
        elLeaderboard.innerHTML = html;
    }

    function renderSelfInfo(selfData) {
        if (!elSelfInfo) return;
        if (!selfData) {
            elSelfInfo.innerHTML = '';
            return;
        }
        const name = selfData.displayName || '你';
        elSelfInfo.innerHTML = `
            <div style="font-weight:bold;">${name}</div>
            <div>積分：<span style="color:#ffd700;font-weight:bold;">${selfData.selfPoints ?? 0}</span></div>
            <div>排名：<span style="color:#ffd700;font-weight:bold;">${selfData.selfRank ?? '-'}</span></div>
        `;
    }

    async function fetchSnapshots(signal) {
        try {
            let query = '';
            if (userId) {
                query = `?user_id=${encodeURIComponent(userId)}`;
            } else if (opaqueUserId) {
                query = `?opaque_user_id=${encodeURIComponent(opaqueUserId)}`;
            }

            // 加入時間戳記，強迫瀏覽器不走快取
            const timestamp = Date.now();
            const separator = query ? '&' : '?';
            const url = `${EBS_BASE}/snapshot${query}${separator}_t=${timestamp}`;
            
            const resp = await fetch(url, {
                headers: {
                    ...(authToken ? { 'Authorization': `Bearer ${authToken}` } : {}),
                },
                signal,
                cache: 'no-store', // 禁用快取
                keepalive: true, // 允許在頁面卸載時完成請求
            });
            if (!resp.ok) {
                const err = await resp.json().catch(() => ({}));
                throw new Error(err.error || err.message || `HTTP ${resp.status}`);
            }
            const data = await resp.json();
            renderMarkets(data);
            renderLeaderboard(data.leaderboard);
            renderSelfInfo(data.selfData);
            setMsg('');
        } catch (error) {
            setMsg(`無法取得最新預測資訊：${error.message}`, false);
            if (elMarket) {
                elMarket.innerHTML = `<div class="card" style="color:#ff7575">無法取得最新預測資訊：${error.message}</div>`;
            }
            if (elLeaderboard) elLeaderboard.innerHTML = '';
            if (elSelfInfo) elSelfInfo.innerHTML = '';
            throw error;
        }
    }

    if (window.Twitch && window.Twitch.ext) {
        window.Twitch.ext.onAuthorized((auth) => {
            authToken = auth.token;
            userId = auth.userId;
            opaqueUserId = auth.opaqueUserId;
            fetchSnapshots().catch(() => {});
            startPolling();
        });
        window.Twitch.ext.onVisibilityChanged((isVisible) => {
            if (isVisible) {
                fetchSnapshots().catch(() => {});
                startPolling();
            } else {
                stopPolling();
            }
        });
    } else {
        fetchSnapshots().catch(() => {});
        startPolling();
    }
});
