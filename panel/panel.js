// panel.js src/panel/panel.js

console.log('panel.js loaded');

(() => {
    // 手動設定版本號
    const VERSION = '2025.10.13-2'; // 請每次更新時手動修改
    const elVersion = document.getElementById('version');
    if (elVersion) elVersion.textContent = `版本：${VERSION}`;
    const elMarket = document.getElementById('market');
    const elMsg = document.getElementById('msg');
    const elLeaderboard = document.getElementById('leaderboard');
    const elSelfInfo = document.getElementById('self-info');

    // 依據本機或上線設定 EBS 位址
    const EBS_BASE = (location.hostname === 'localhost')
    ? 'http://localhost:8081'
    : 'https://specialty-outdoors-positioning-routine.trycloudflare.com' // TODO: 替換成你的本機 EBS 網址
    // : 'https://ebs.example.com'; // TODO: 替換成你的 EBS 網址

    let authToken = null;
    let channelId = null;

    // 設定訊息顯示
    function setMsg(text, ok = true) {
        elMsg.textContent = text || '';
        elMsg.style.color = ok ? '#8ef58e' : '#ff7575'; 
    }

    // 渲染賭盤列表
    function renderSnapshots(data) {
        elMarket.innerHTML = '';
        if (!data || !data.market) {
            elMarket.innerHTML = '<div class="card">目前沒有進行中的賭盤</div>';
            return;
        }
    const m = data.market;

    // 賭盤標題與狀態
    const wrapper = document.createElement('div');
    wrapper.className = 'card';
    wrapper.innerHTML = `
        <div><strong>${m.title}</strong></div>
        <div class="small">狀態: ${m.status}</div>
        <div class="row" id="options"></div>
        <div class="small">最後更新: ${new Date(m.deadline).toLocaleString()}</div>
    `;
    elMarket.appendChild(wrapper);

    // 產生選項按鈕
    const row = wrapper.querySelector('#options');
    m.options.forEach(opt => {
        const count = (m.counts && m.counts[opt.id]) || 0;
        const btn = document.createElement('button');
        btn.className = 'btn option';
        btn.textContent = `${opt.name} (${count})`;
        btn.disabled = (m.status !== 'OPEN');
        btn.addEventListener('click', async () => {
            try {
                setMsg('送出投票中...');
                const resp = await fetch(`${EBS_BASE}/vote`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        ...(authToken ? { 'Authorization': `Bearer ${authToken}` } : {})
                    },
                    body: JSON.stringify({ 
                        market_id: m.id,
                        option_id: opt.id
                    })
                });
                if (!resp.ok) {
                    const err = await resp.json().catch(() => ({}));
                    throw new Error(err.message || `HTTP ${resp.status}`);
                }
                setMsg('投票成功！', true);
                await fetchSnapshots();
            } catch (e) {
                setMsg(`發生錯誤：${e.message}`, false);
            }
        });
        row.appendChild(btn);
    });
}


    // 渲染排行榜
    function renderLeaderboard(leaderboard) {
        if (!elLeaderboard) return;
        if (!leaderboard || leaderboard.length === 0) {
            elLeaderboard.innerHTML = '<div>暫無排行榜資料</div>';
            return;
        }
        let html = '<div style="font-weight:bold;margin-bottom:4px;">🏆 排行榜</div>';
        html += '<table style="width:100%;font-size:13px;text-align:center;"><thead><tr><th>名次</th><th>用戶</th><th>分數</th><th>勝場</th><th>投票</th><th>勝率</th></tr></thead><tbody>';
        leaderboard.forEach((row, idx) => {
            html += `<tr><td>${idx+1}</td><td>${row.user.replace(/^(user:|opaque:)/,'')}</td><td>${row.total_points}</td><td>${row.win_count}</td><td>${row.total_votes}</td><td>${(row.win_rate*100).toFixed(0)}%</td></tr>`;
        });
        html += '</tbody></table>';
        elLeaderboard.innerHTML = html;
    }

    // 渲染個人分數/排名
    function renderSelfInfo(selfData) {
        if (!elSelfInfo) return;
        if (!selfData) {
            elSelfInfo.innerHTML = '';
            return;
        }
        let html = '<div style="font-weight:bold;">你的成績</div>';
        html += `<div>分數：<span style="color:#ffd700;font-weight:bold;">${selfData.selfPoints ?? 0}</span>　排名：<span style="color:#ffd700;font-weight:bold;">${selfData.selfRank ?? '-'}</span></div>`;
        elSelfInfo.innerHTML = html;
    }

    // 取得賭盤資料
    async function fetchSnapshots() {
        try {
            const resp = await fetch(`${EBS_BASE}/snapshot`, {
                headers: { ...(authToken ? { 'Authorization': `Bearer ${authToken}` } : {}) }
            });
            if (!resp.ok) {
                // 嘗試取得錯誤訊息
                let errMsg = `HTTP ${resp.status}`;
                try {
                    const err = await resp.json();
                    if (err && err.message) errMsg = err.message;
                } catch {}
                setMsg(`無法取得賭盤資料：${errMsg}`, false);
                elMarket.innerHTML = `<div class="card" style="color:#ff7575">無法取得賭盤資料：${errMsg}</div>`;
                if (elLeaderboard) elLeaderboard.innerHTML = '';
                if (elSelfInfo) elSelfInfo.innerHTML = '';
                return;
            }
            const data = await resp.json();
            renderSnapshots(data);
            renderLeaderboard(data.leaderboard);
            renderSelfInfo(data.selfData);
        } catch (e) {
            setMsg(`無法取得賭盤資料：${e.message}`, false);
            elMarket.innerHTML = `<div class="card" style="color:#ff7575">無法取得賭盤資料：${e.message}</div>`;
            if (elLeaderboard) elLeaderboard.innerHTML = '';
            if (elSelfInfo) elSelfInfo.innerHTML = '';
        }
    }

    // twitch extension helper
    if (window.Twitch && window.Twitch.ext) {
        window.Twitch.ext.onAuthorized(auth => {
            authToken = auth.token;
            channelId = auth.channelId;
            fetchSnapshots();
        });
    } else {
        // 非hosted Test環境 (localhost)
        fetchSnapshots();
    }

})();