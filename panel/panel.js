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

})();