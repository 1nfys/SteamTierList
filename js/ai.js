import { PROXY_BASE, state, getHeaders, TURNSTILE_SITEKEY } from 'config';
import { getI18n } from 'i18n';

export function parseMarkdownFallback(text) {
    const categoryIds = state.categories.map(c => c.id.toLowerCase());
    const tierMap = new Map(categoryIds.map(id => [id, []]));
    const reasonsMap = new Map();
    let currentTier = null;

    for (let line of text.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        const categoryPattern = categoryIds.map(id => id.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')).join('|');
        const lineWithTierMatch = trimmed.match(new RegExp(`^\\*?\\s*(\\d+)\\s*[:.-]\\s*([^(+-]+)(?:\\(([^)]+)\\))?\\s*(?:->|=>|->\\s*Tier|=>\\s*Tier)\\s*(${categoryPattern})`, 'i'));
        if (lineWithTierMatch) {
            const appid = Number(lineWithTierMatch[1]);
            const reason = lineWithTierMatch[3] ? lineWithTierMatch[3].trim() : (getI18n().defaultVerdict || 'Приятная игра в коллекции');
            const tierChar = lineWithTierMatch[4].trim().toLowerCase();
            if (categoryIds.includes(tierChar)) {
                tierMap.get(tierChar).push(appid);
                reasonsMap.set(appid, reason);
                continue;
            }
        }

        const tierHeaderMatch = trimmed.match(new RegExp(`^\\*?\\*?\\s*(${categoryPattern})-Tier\\s*(?:\\([^)]*\\))?\\s*:?\\*?\\*?`, 'i'));
        if (tierHeaderMatch) {
            currentTier = tierHeaderMatch[1].toLowerCase();
            continue;
        }

        const gameMatch = trimmed.match(/^\*?\s*(\d+)\s*[:.-]\s*([^(*]+)(?:\(([^)]+)\))?/);
        if (gameMatch && currentTier) {
            const appid = Number(gameMatch[1]);
            const reason = gameMatch[3] ? gameMatch[3].trim() : '';
            if (tierMap.has(currentTier)) {
                tierMap.get(currentTier).push(appid);
                if (reason) reasonsMap.set(appid, reason);
            }
        }
    }
    return { tierMap, reasonsMap };
}

export async function fetchStats() {
    const resp = await fetch(`${PROXY_BASE}/api/stats?_=${Date.now()}`, { headers: getHeaders() });
    if (resp.status === 401) {
        localStorage.removeItem('localPwd');
        alert("Неверный локальный пароль. Страница будет перезагружена.");
        location.reload();
        throw new Error('Unauthorized');
    }
    if (!resp.ok) throw new Error('Failed to fetch stats');
    return await resp.json();
}

export async function callAI(messages, updateStatusCallback) {
    let limitReached = false;
    try {
        const stats = await fetchStats();
        const numCats = state.categories ? state.categories.length : 6;
        const tierCostAddition = numCats > 6 ? (numCats - 6) * 2 : 0;
        const energyCost = Math.ceil(state.allGames.length / 25) + tierCostAddition;
        if (stats.user_used + energyCost > stats.user_limit) limitReached = true;
    } catch (e) {
        console.error('Failed to pre-check stats:', e);
    }

    if (limitReached) {
        throw new Error(getI18n().aiCfLimitReached || "Лимит энергии ИИ исчерпан.");
    }

    try {
        let turnstileToken = 'bypass';
        const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
        
        if (!isLocal) {
            updateStatusCallback(getI18n().tsChecking || "Проверка безопасности...", 'loading');
            const container = document.getElementById('turnstile-container');
            if (container) container.style.display = 'flex';
            
            turnstileToken = await new Promise((resolve, reject) => {
                if (typeof turnstile === 'undefined') {
                    reject(new Error(getI18n().tsScriptMissing || "Скрипт защиты не загрузился."));
                    return;
                }
                
                if (window.turnstileWidgetId !== undefined) {
                    turnstile.reset(window.turnstileWidgetId);
                }
                
                window.turnstileWidgetId = turnstile.render('#turnstile-container', {
                    sitekey: TURNSTILE_SITEKEY,
                    callback: function(token) { 
                        if (container) container.style.display = 'none';
                        resolve(token); 
                    },
                    "error-callback": function() { 
                        reject(new Error(getI18n().tsFailed || "Ошибка проверки безопасности (Turnstile).")); 
                    }
                });
            });
        }

        updateStatusCallback(getI18n().aiRequestCf, 'loading');
        const requestPayload = {
            messages,
            game_count: state.allGames.length,
            category_count: state.categories.length,
            chat_template_kwargs: { enable_thinking: false },
            response_format: { type: 'json_object' },
            model: '@cf/google/gemma-4-26b-a4b-it',
            lang: state.currentLang,
            turnstile_token: turnstileToken
        };
        console.log("AI API Request:", requestPayload);

        const response = await fetch(`${PROXY_BASE}/api/workers-ai`, {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify(requestPayload)
        });
        if (response.ok) {
            const data = await response.json();
            console.log("AI API Response Data:", data);
            const choice = data.choices?.[0];
            if (choice?.message) {
                const msg = choice.message;
                if (msg.refusal) {
                    console.error("AI Refusal:", msg.refusal);
                    throw new Error("AI refused: " + msg.refusal);
                } else if (msg.content) {
                    console.log("AI Generated Content:", msg.content);
                    return { content: msg.content, source: 'cf' };
                }
            }
        } else {
            console.error("AI API Error HTTP Status:", response.status);
            try {
                const errData = await response.json();
                console.error("AI API Error Body:", errData);
                if (errData.error === 'Too many requests') {
                    throw new Error(getI18n().errorRateLimitIp || "Превышен лимит запросов с вашего IP.");
                } else if (errData.error === 'Global limit reached') {
                    throw new Error(getI18n().errorRateLimitGlobal || "Превышен общий лимит сети.");
                } else if (errData.error) {
                    throw new Error(errData.error);
                }
            } catch (jsonErr) {
                if (response.status === 429) {
                    throw new Error(getI18n().errorRateLimitIp || "Превышен лимит запросов с вашего IP.");
                }
                throw jsonErr;
            }
        }
        throw new Error(getI18n().aiCfUnavailable || "Workers AI недоступен.");
    } catch (e) {
        throw new Error(e.message || getI18n().aiCfFailed || "Сбой Workers AI.");
    }
}

export function parseAIResponse(aiText) {
    let cleanedText = aiText.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
    cleanedText = cleanedText.replace(/```json/gi, '').replace(/```/g, '').trim();

    const jsonMatch = cleanedText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error(getI18n().errorNoJson);

    const categoryIds = state.categories.map(c => c.id.toLowerCase());
    let tierMap = new Map(categoryIds.map(id => [id, []]));
    let reasonsMap = new Map();
    let parsedSuccess = false;

    try {
        const parsed = JSON.parse(jsonMatch[0]);
        if (parsed.games && Array.isArray(parsed.games)) {
            parsed.games.forEach(game => {
                const lTier = String(game.tier || '').toLowerCase().trim();
                if (categoryIds.includes(lTier)) {
                    tierMap.get(lTier).push(Number(game.appid));
                }
                if (game.verdict || game.reason) {
                    reasonsMap.set(Number(game.appid), String(game.verdict || game.reason));
                }
            });
            parsedSuccess = true;
        } else {
            const rawTiers = parsed.tiers || parsed;
            const rawReasons = parsed.reasons || {};

            Object.entries(rawTiers).forEach(([key, val]) => {
                const lKey = key.toLowerCase();
                if (categoryIds.includes(lKey)) {
                    tierMap.set(lKey, Array.isArray(val) ? val.map(Number) : []);
                }
            });
            Object.entries(rawReasons).forEach(([key, val]) => {
                reasonsMap.set(Number(key), String(val));
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
                const categoryPattern = categoryIds.map(id => id.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')).join('|');
                const tierMatch = block.match(new RegExp(`"tier"\\s*:\\s*"(${categoryPattern})"`, 'i'));
                const verdictMatch = block.match(/"verdict"\s*:\s*"([^"]+)"/i) || block.match(/"reason"\s*:\s*"([^"]+)"/i);

                if (idMatch && tierMatch) {
                    const appid = Number(idMatch[1]);
                    const tier = tierMatch[1].toLowerCase();
                    if (tierMap.has(tier)) tierMap.get(tier).push(appid);
                    if (verdictMatch) reasonsMap.set(appid, verdictMatch[1]);
                }
            });
            let totalExtracted = 0;
            for (let arr of tierMap.values()) totalExtracted += arr.length;
            if (totalExtracted > 0) parsedSuccess = true;
        }
    }

    if (!parsedSuccess) {
        const categoryPattern = categoryIds.map(id => id.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')).join('|');
        const regex = new RegExp(`"(${categoryPattern})"` + '\\s*:\\s*\\[([^\\]]*)\\]', 'ig');
        let match;
        while ((match = regex.exec(cleanedText)) !== null) {
            const t = match[1].toLowerCase();
            const ids = match[2].match(/\d+/g);
            if (ids && tierMap.has(t)) tierMap.set(t, ids.map(Number));
        }
        const reasonsMatch = cleanedText.match(/"reasons"\s*:\s*\{([^}]+)\}/i);
        if (reasonsMatch) {
            const pairs = reasonsMatch[1].match(/"(\d+)"\s*:\s*"([^"]+)"/g);
            if (pairs) pairs.forEach(pair => {
                const m = pair.match(/"(\d+)"\s*:\s*"([^"]+)"/);
                if (m) reasonsMap.set(Number(m[1]), m[2]);
            });
        }
    }

    let totalAssigned = 0;
    for (let arr of tierMap.values()) totalAssigned += arr.length;
    if (totalAssigned === 0) {
        const mdResult = parseMarkdownFallback(cleanedText) || parseMarkdownFallback(aiText);
        if (mdResult) {
            let mdTotal = 0;
            for (let arr of mdResult.tierMap.values()) mdTotal += arr.length;
            if (mdTotal > 0) { tierMap = mdResult.tierMap; reasonsMap = mdResult.reasonsMap; totalAssigned = mdTotal; }
        }
    }
    if (totalAssigned === 0) throw new Error(getI18n().errorEmptyDistribution || "ИИ вернул пустой список распределения.");

    return { tierMap, reasonsMap };
}
