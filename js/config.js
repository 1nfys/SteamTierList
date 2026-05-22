export const CLOUDFLARE_WORKER_URL = 'https://stl.curly2089.workers.dev/';
export const WORKER_BASE = CLOUDFLARE_WORKER_URL.replace(/\/$/, '');

let localPwd = '';
if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    localPwd = localStorage.getItem('localPwd');
    if (!localPwd) {
        localPwd = prompt('Enter local password for worker:') || '';
        if (localPwd) localStorage.setItem('localPwd', localPwd);
    }
}

export const getHeaders = () => {
    const h = { 'Content-Type': 'application/json' };
    if (localPwd) h['x-local-password'] = encodeURIComponent(localPwd);
    return h;
};

export const state = {
    allGames: [],
    rawSteamGames: [],
    draggedItem: null,
    currentLang: 'ru'
};
