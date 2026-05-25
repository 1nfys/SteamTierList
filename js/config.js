export const PROXY_URL = 'https://stlp.onrender.com/';
export const PROXY_BASE = PROXY_URL.replace(/\/$/, '');
export const TURNSTILE_SITEKEY = '0x4AAAAAADVmLjENOqJicyxs';

let localPwd = '';
if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    localPwd = localStorage.getItem('localPwd');
    if (!localPwd) {
        localPwd = prompt('Enter local password for worker:') || '';
        if (localPwd) localStorage.setItem('localPwd', localPwd);
    }
}

export const getHeaders = () => {
    const h = {
        'Content-Type': 'application/json'
    };
    if (localPwd) h['x-local-password'] = encodeURIComponent(localPwd);
    return h;
};

export const state = {
    allGames: [],
    rawSteamGames: [],
    draggedItem: null,
    currentLang: 'ru'
};
