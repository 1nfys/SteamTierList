import { PROXY_BASE, state, getHeaders } from './config.js?v=6';
import { i18n } from './i18n.js?v=6';

export async function resolveSteamId(input) {
    input = input.trim().replace(/\/$/, '');

    const profilesMatch = input.match(/steamcommunity\.com\/profiles\/(\d+)/);
    if (profilesMatch) return profilesMatch[1];

    const idMatch = input.match(/steamcommunity\.com\/id\/([^\/]+)/);
    let vanityName = idMatch ? idMatch[1] : (/^\d{17}$/.test(input) ? null : input);
    if (!vanityName && /^\d{17}$/.test(input)) return input;

    if (vanityName) {
        const res = await fetch(`${PROXY_BASE}/api/steam-resolve?vanityurl=${encodeURIComponent(vanityName)}`, { headers: getHeaders() });
        if (res.status === 429) throw new Error(i18n[state.currentLang].errorRateLimitIp || "Превышен лимит запросов.");
        if (!res.ok) throw new Error(i18n[state.currentLang].errorNetworkResolve);
        const data = await res.json();
        if (data.response?.success === 1) return data.response.steamid;
        throw new Error(i18n[state.currentLang].errorProfileNotFound);
    }
    throw new Error(i18n[state.currentLang].errorInvalidSteamId);
}
