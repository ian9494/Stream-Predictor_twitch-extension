// panel.js src/panel/panel.js
(() => {
    const elMarket = document.getElementById('market');
    const elMsg = document.getElementById('msg');

    // 依據本機或上線設定 EBS 位址
    const EBS_BASE = (location.hostname === 'localhost')
    ? 'http://localhost:8080'
    : 'https://ebs.example.com'; // TODO: 替換成你的 EBS 網址

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

    // 取得賭盤資料
    async function fetchSnapshots() {
        try {
            const resp = await fetch(`${EBS_BASE}/snapshot`, {
                headers: { ...EBS_BASE(authToken ? { 'Authorization': `Bearer ${authToken}` } : {}) }
            });

            const data = await resp.json();
            renderSnapshots(data);
        } catch (e) {
            setMsg(`無法取得賭盤資料：${e.message}`, false);
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