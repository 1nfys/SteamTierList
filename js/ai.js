import { WORKER_BASE, state, getHeaders } from './config.js';
import { i18n } from './i18n.js';

export function parseMarkdownFallback(text) {
    const tierMap = { s: [], a: [], b: [], c: [], d: [], f: [] };
    const reasonsMap = {};
    let currentTier = null;

    for (let line of text.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        const lineWithTierMatch = trimmed.match(/^\*?\s*(\d+)\s*[:.-]\s*([^(+-]+)(?:\(([^)]+)\))?\s*(?:->|=>|->\s*Tier|=>\s*Tier)\s*([SABCDFsabcdef](?:\s+or\s+[SABCDFsabcdef])?)/i);
        if (lineWithTierMatch) {
            const appid = Number(lineWithTierMatch[1]);
            const reason = lineWithTierMatch[3] ? lineWithTierMatch[3].trim() : 'Интересная игра в коллекции';
            const tierChar = lineWithTierMatch[4].trim().charAt(0).toLowerCase();
            if (['s', 'a', 'b', 'c', 'd', 'f'].includes(tierChar)) {
                tierMap[tierChar].push(appid);
                reasonsMap[appid] = reason;
                continue;
            }
        }

        const tierHeaderMatch = trimmed.match(/^\*?\*?\s*(S|A|B|C|D|F)-Tier\s*(?:\([^)]*\))?\s*:?\*?\*?/i);
        if (tierHeaderMatch) {
            currentTier = tierHeaderMatch[1].toLowerCase();
            continue;
        }

        const gameMatch = trimmed.match(/^\*?\s*(\d+)\s*[:.-]\s*([^(*]+)(?:\(([^)]+)\))?/);
        if (gameMatch && currentTier) {
            const appid = Number(gameMatch[1]);
            const reason = gameMatch[3] ? gameMatch[3].trim() : '';
            tierMap[currentTier].push(appid);
            if (reason) reasonsMap[appid] = reason;
        }
    }
    return { tierMap, reasonsMap };
}

export async function fetchStats() {
    const resp = await fetch(`${WORKER_BASE}/api/stats?_=${Date.now()}`, { headers: getHeaders() });
    if (resp.status === 401) {
        localStorage.removeItem('localPwd');
        alert("Неверный локальный пароль. Страница будет перезагружена.");
        location.reload();
        throw new Error('Unauthorized');
    }
    if (!resp.ok) throw new Error('Failed to fetch stats');
    return await resp.json();
}

export async function callAI(messages, updateStatusCallback, isUnlimited) {
    const selectedModel = isUnlimited ? 'mistral' : 'gemma';

    if (selectedModel === 'gemma') {
        let limitReached = false;
        try {
            const stats = await fetchStats();
            const energyCost = Math.ceil(state.allGames.length / 25);
            if (stats.user_used + energyCost > stats.user_limit) limitReached = true;
        } catch (e) {
            console.error('Failed to pre-check stats:', e);
        }

        if (!limitReached) {
            try {
                updateStatusCallback(i18n[state.currentLang].aiRequestCf, 'loading');
                const response = await fetch(`${WORKER_BASE}/api/workers-ai`, {
                    method: 'POST',
                    headers: getHeaders(),
                    body: JSON.stringify({
                        messages,
                        game_count: state.allGames.length,
                        chat_template_kwargs: { enable_thinking: false },
                        response_format: { type: 'json_object' },
                        model: '@cf/google/gemma-4-26b-a4b-it',
                        lang: state.currentLang
                    })
                });
                if (response.ok) {
                    const data = await response.json();
                    if (data.choices?.[0]?.message?.content) {
                        return { content: data.choices[0].message.content, source: 'cf' };
                    }
                }
                updateStatusCallback(i18n[state.currentLang].aiCfUnavailable, 'loading');
                await new Promise(r => setTimeout(r, 1000));
            } catch {
                updateStatusCallback(i18n[state.currentLang].aiCfFailed, 'loading');
                await new Promise(r => setTimeout(r, 1000));
            }
        } else {
            updateStatusCallback(i18n[state.currentLang].aiCfLimitReached, 'loading');
            await new Promise(r => setTimeout(r, 1000));
        }
    }

    const models = [
        'mistral-large-2512',
        'ministral-3b-2512',
        'ministral-8b-2512'
    ];

    let lastError = null;
    for (let i = 0; i < models.length; i++) {
        const model = models[i];
        try {
            updateStatusCallback(i18n[state.currentLang].aiRequestMistral.replace('{i}', i + 1).replace('{total}', models.length).replace('{model}', model), 'loading');
            const response = await fetch(`${WORKER_BASE}/api/mistral`, {
                method: 'POST',
                headers: getHeaders(),
                body: JSON.stringify({
                    messages,
                    model,
                    lang: state.currentLang
                })
            });
            if (!response.ok) {
                const err = await response.json().catch(() => ({}));
                throw new Error(err.error?.message || `HTTP ${response.status}`);
            }
            const data = await response.json();
            if (data.choices?.[0]?.message?.content) {
                return { content: data.choices[0].message.content, source: 'mistral' };
            }
            throw new Error(i18n[state.currentLang].errorInvalidFormat);
        } catch (e) {
            lastError = e.message || e;
            if (i < models.length - 1) {
                updateStatusCallback(i18n[state.currentLang].modelOverloaded.replace('{model}', model), 'loading');
                await new Promise(r => setTimeout(r, 1000));
            }
        }
    }
    throw new Error(i18n[state.currentLang].errorAllModelsFailed.replace('{error}', lastError));
}

export function parseAIResponse(aiText) {
    let cleanedText = aiText.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
    cleanedText = cleanedText.replace(/```json/gi, '').replace(/```/g, '').trim();

    const jsonMatch = cleanedText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error(i18n[state.currentLang].errorNoJson);

    let tierMap = { s: [], a: [], b: [], c: [], d: [], f: [] };
    let reasonsMap = {};
    let parsedSuccess = false;

    try {
        const parsed = JSON.parse(jsonMatch[0]);
        if (parsed.games && Array.isArray(parsed.games)) {
            parsed.games.forEach(g => {
                const appid = Number(g.appid);
                const tier = String(g.tier || '').toLowerCase().trim();
                const verdict = g.verdict || g.reason || '';

                if (appid && ['s', 'a', 'b', 'c', 'd', 'f'].includes(tier)) {
                    tierMap[tier].push(appid);
                    if (verdict) reasonsMap[appid] = verdict;
                }
            });
            parsedSuccess = true;
        } else {
            const rawTiers = parsed.tiers || parsed;
            const rawReasons = parsed.reasons || {};

            Object.keys(rawTiers).forEach(key => {
                const lKey = key.toLowerCase();
                if (['s', 'a', 'b', 'c', 'd', 'f'].includes(lKey)) {
                    tierMap[lKey] = Array.isArray(rawTiers[key]) ? rawTiers[key].map(Number) : [];
                }
            });
            Object.keys(rawReasons).forEach(key => {
                reasonsMap[Number(key)] = String(rawReasons[key]);
            });
            parsedSuccess = true;
        }
    } catch (jsonErr) {
        console.warn("JSON parsing failed, trying regex extraction:", jsonErr);
    }

    if (!parsedSuccess) {
        const gameBlockMatches = cleanedText.match(/\{\s*"appid"\s*:\s*\d+[\s\S]*?\}/gi);
        if (gameBlockMatches && gameBlockMatches.length > 0) {
            gameBlockMatches.forEach(block => {
                const idMatch = block.match(/"appid"\s*:\s*(\d+)/i);
                const tierMatch = block.match(/"tier"\s*:\s*"([sabcdef])"/i);
                const verdictMatch = block.match(/"verdict"\s*:\s*"([^"]+)"/i) || block.match(/"reason"\s*:\s*"([^"]+)"/i);

                if (idMatch && tierMatch) {
                    const appid = Number(idMatch[1]);
                    const tier = tierMatch[1].toLowerCase();
                    tierMap[tier].push(appid);
                    if (verdictMatch) reasonsMap[appid] = verdictMatch[1];
                }
            });
            const totalExtracted = Object.values(tierMap).reduce((sum, arr) => sum + arr.length, 0);
            if (totalExtracted > 0) parsedSuccess = true;
        }
    }

    if (!parsedSuccess) {
        ['s', 'a', 'b', 'c', 'd', 'f'].forEach(t => {
            const match = cleanedText.match(new RegExp(`"${t}"\\s*:\\s*\\[([^\\]]*)\\]`, 'i'));
            if (match) {
                const ids = match[1].match(/\d+/g);
                if (ids) tierMap[t] = ids.map(Number);
            }
        });
        const reasonsMatch = cleanedText.match(/"reasons"\s*:\s*\{([^}]+)\}/i);
        if (reasonsMatch) {
            const pairs = reasonsMatch[1].match(/"(\d+)"\s*:\s*"([^"]+)"/g);
            if (pairs) pairs.forEach(pair => {
                const m = pair.match(/"(\d+)"\s*:\s*"([^"]+)"/);
                if (m) reasonsMap[Number(m[1])] = m[2];
            });
        }
    }

    let totalAssigned = Object.values(tierMap).reduce((sum, arr) => sum + arr.length, 0);
    if (totalAssigned === 0) {
        const mdResult = parseMarkdownFallback(cleanedText) || parseMarkdownFallback(aiText);
        if (mdResult) {
            const mdTotal = Object.values(mdResult.tierMap).reduce((sum, arr) => sum + arr.length, 0);
            if (mdTotal > 0) { tierMap = mdResult.tierMap; reasonsMap = mdResult.reasonsMap; totalAssigned = mdTotal; }
        }
    }
    if (totalAssigned === 0) throw new Error(i18n[state.currentLang].errorEmptyDistribution);

    return { tierMap, reasonsMap };
}
