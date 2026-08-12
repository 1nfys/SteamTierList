export const API_URL = 'https://steam-tier-list-tau.vercel.app/';
export const API_BASE = API_URL.replace(/\/$/, '');
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

export const DEFAULT_CATEGORIES = [
    { id: 's', label: 'S', color: '#ff2020' },
    { id: 'a', label: 'A', color: '#ff8000' },
    { id: 'b', label: 'B', color: '#F9FF10' },
    { id: 'c', label: 'C', color: '#00ff00' },
    { id: 'd', label: 'D', color: '#0060ff' },
    { id: 'f', label: 'F', color: '#7f7f7f' }
];

let savedCats = null;
try {
    const raw = localStorage.getItem('stl_categories');
    if (raw) savedCats = JSON.parse(raw);
} catch (e) {
    console.error('Failed to parse saved categories', e);
}

export const state = {
    allGames: [],
    rawSteamGames: [],
    draggedItem: null,
    currentLang: 'ru',
    categories: savedCats || DEFAULT_CATEGORIES
};
