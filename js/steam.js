import { API_BASE, getHeaders } from 'config';
import { getI18n } from 'i18n';

export function parseSteamInput(input) {
    input = input.trim().split(/[?#]/)[0].replace(/\/+$/, '');

    const profilesMatch = input.match(/(?:steamcommunity\.com|steampowered\.com)\/profiles\/(\d{17})/);
    if (profilesMatch) return { steamid: profilesMatch[1] };

    const idMatch = input.match(/(?:steamcommunity\.com|steampowered\.com)\/id\/([^/]+)/);
    if (idMatch) {
        if (/^\d{17}$/.test(idMatch[1])) return { steamid: idMatch[1] };
        return { vanity: idMatch[1] };
    }

    if (/^\d{17}$/.test(input)) return { steamid: input };
    if (/^[\w.-]+$/.test(input)) return { vanity: input };

    return null;
}

export async function resolveSteamId(input) {
    const parsed = parseSteamInput(input);
    if (!parsed) throw new Error(getI18n().errorInvalidSteamId);

    if (parsed.steamid) return parsed.steamid;

    const res = await fetch(`${API_BASE}/api/steam-resolve?vanityurl=${encodeURIComponent(parsed.vanity)}`, { headers: getHeaders() });
    if (res.status === 429) throw new Error(getI18n().errorRateLimitIp);
    if (!res.ok) throw new Error(getI18n().errorNetworkResolve);
    const data = await res.json();
    if (data.response?.success === 1) return data.response.steamid;
    throw new Error(getI18n().errorProfileNotFound);
}
