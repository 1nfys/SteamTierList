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

const cyrb53 = (str, seed = 0) => {
    let h1 = 0xdeadbeef ^ seed, h2 = 0x41c6ce57 ^ seed;
    for (let i = 0, ch; i < str.length; i++) {
        ch = str.charCodeAt(i);
        h1 = Math.imul(h1 ^ ch, 2654435761);
        h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
    h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
    h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return 4294967296 * (2097151 & h2) + (h1 >>> 0);
};

export const getBrowserFingerprint = () => {
    const components = [
        navigator.userAgent,
        navigator.language,
        screen.colorDepth,
        screen.width + 'x' + screen.height,
        new Date().getTimezoneOffset()
    ];
    return cyrb53(components.join('|')).toString(36);
};

export const getHeaders = () => {
    const h = { 
        'Content-Type': 'application/json',
        'x-browser-fingerprint': getBrowserFingerprint()
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
