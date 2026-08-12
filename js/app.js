import { state, API_BASE, getHeaders } from 'config';
import { getI18n } from 'i18n';
import { resolveSteamId } from 'steam';
import { callAI, parseAIResponse } from 'ai';
import {
    dom, initDOM, setStatus, checkWorkerStatus, syncPoolHeight,
    updateSliderUI, updateAIResourceUI, setLanguage,
    renderGames, distributeGamesFromAI,
    renderTierList, initCategoriesManager
} from 'ui';

const LOAD_COOLDOWN_MS = 5000;
const CIS_LANG_REGEX = /^(ru|be|uk|kk|uz|ky|tg|hy|az|mo|tk|ka)/i;

let lastLoadClickTime = 0;

document.addEventListener('DOMContentLoaded', () => {
    initDOM();
    renderTierList();
    initCategoriesManager();

    setInitialLanguage();
    bindEvents();

    checkWorkerStatus();
    updateAIResourceUI(true);
    syncPoolHeight();
    window.addEventListener('resize', syncPoolHeight);
});

function setInitialLanguage() {
    const urlParams = new URLSearchParams(window.location.search);
    let lang = urlParams.get('lang');

    if (lang) {
        lang = lang.toLowerCase() === 'ru' ? 'ru' : 'en';
    } else {
        lang = localStorage.getItem('stl_lang');
    }
    if (!lang) {
        const sysLang = (navigator.language || navigator.userLanguage || '').toLowerCase();
        const isCis = CIS_LANG_REGEX.test(sysLang) ||
            (navigator.languages || []).some(l => CIS_LANG_REGEX.test(l));
        lang = isCis ? 'ru' : 'en';
    }

    setLanguage(lang);
    if (dom.langToggleCheckbox) {
        dom.langToggleCheckbox.checked = state.currentLang === 'en';
    }
}

function bindEvents() {
    if (dom.langToggleCheckbox) {
        dom.langToggleCheckbox.addEventListener('change', e => setLanguage(e.target.checked ? 'en' : 'ru'));
    }
    if (dom.slider) {
        dom.slider.addEventListener('input', updateSliderUI);
    }

    dom.aiSortTrigger.addEventListener('click', e => {
        e.stopPropagation();
        dom.aiSortDropdown.classList.toggle('open');
    });

    if (dom.aiSortCloseBtn) {
        dom.aiSortCloseBtn.addEventListener('click', e => {
            e.stopPropagation();
            dom.aiSortDropdown.classList.remove('open');
        });
    }

    document.addEventListener('click', e => {
        if (!dom.aiSortDropdown.contains(e.target) || e.target === dom.aiSortDropdown) {
            dom.aiSortDropdown.classList.remove('open');
        }
    });

    dom.loadBtn.addEventListener('click', handleLoadGames);
    dom.aiTierBtn.addEventListener('click', handleAutoSort);
    dom.exportBtn.addEventListener('click', handleExport);
}

async function handleLoadGames() {
    const now = Date.now();
    if (now - lastLoadClickTime < LOAD_COOLDOWN_MS) return;

    const rawInput = dom.steamIdInput.value.trim();
    if (!rawInput) {
        setStatus(getI18n().statusPleaseEnter, 'error');
        return;
    }

    lastLoadClickTime = now;
    setStatus(getI18n().statusResolving, 'loading');
    dom.loadBtn.disabled = true;

    try {
        const steamId = await resolveSteamId(rawInput);
        setStatus(getI18n().statusLoading, 'loading');

        const includeFree = (dom.freeGamesCheckbox && dom.freeGamesCheckbox.checked) ? 1 : 0;
        const response = await fetch(`${API_BASE}/api/steam-games?steamid=${steamId}&include_free=${includeFree}`, { headers: getHeaders() });

        if (response.status === 429) {
            throw new Error(await getRateLimitMessage(response));
        }
        if (!response.ok) throw new Error(getI18n().errorNetwork);

        const data = await response.json();
        if (!data.response?.games) throw new Error(getI18n().errorProfileHidden);

        state.rawSteamGames = data.response.games.sort((a, b) => b.playtime_forever - a.playtime_forever);
        const count = dom.slider ? parseInt(dom.slider.value) : 25;
        state.allGames = state.rawSteamGames.slice(0, count);

        renderGames(state.allGames);
        setStatus(getI18n().statusSuccess.replace('{count}', state.allGames.length), 'success');
        updateSliderUI();
        dom.controlsContainer.classList.remove('hidden');
        dom.exportBtn.disabled = false;
        dom.aiTierBtn.disabled = false;
    } catch (error) {
        console.error(error);
        setStatus(error.message || getI18n().statusErrorLoad, 'error');
    } finally {
        const remaining = Math.max(0, LOAD_COOLDOWN_MS - (Date.now() - lastLoadClickTime));
        setTimeout(() => { dom.loadBtn.disabled = false; }, remaining);
    }
}

async function handleAutoSort() {
    if (!state.allGames.length) {
        setStatus(getI18n().statusPleaseEnter, 'error');
        return;
    }

    dom.aiSortDropdown.classList.remove('open');
    setStatus(getI18n().statusSortStart, 'loading');
    dom.aiTierBtn.disabled = true;
    document.querySelectorAll('.game-item').forEach(item => item.classList.add('ai-sorting'));

    try {
        const messages = buildAIMessages();
        const aiResult = await callAI(messages, setStatus);
        if (!aiResult?.content) throw new Error(getI18n().errorNoAiResponse);

        const { tierMap, reasonsMap } = parseAIResponse(aiResult.content);
        distributeGamesFromAI(tierMap, reasonsMap);
        setStatus(getI18n().statusSortSuccess, 'success');

        updateAIResourceUI(true);
    } catch (error) {
        console.error(error);
        setStatus(error.message || getI18n().errorAiConnection, 'error');
    } finally {
        dom.aiTierBtn.disabled = false;
        document.querySelectorAll('.game-item').forEach(item => item.classList.remove('ai-sorting'));
    }
}

function buildAIMessages() {
    const categoryKeys = state.categories.map(c => c.id).join(', ');
    const categoryListDescription = state.categories.map(c => `"${c.id}" (${c.label})`).join(', ');

    const systemPrompt = getI18n().promptSystem
        .replace('{tiers}', categoryKeys)
        .replace('(s, a, b, c, d, f)', `(${categoryKeys})`)
        .replace('(S, A, B, C, D, F)', `(${categoryKeys.toUpperCase()})`);

    const userPrompt = getI18n().promptUser
        .replace('{tiers}', categoryKeys)
        .replace('(s, a, b, c, d, f)', `(${categoryKeys})`)
        .replace('(S, A, B, C, D, F)', `(${categoryKeys.toUpperCase()})`)
        + '\n\n' + getI18n().promptTiersHint.replace('{tiers}', categoryListDescription);

    const gamesText = state.allGames.map(g => `${g.appid}: "${g.name}"`).join('\n');
    const formatHint = getI18n().promptFormatHint.replace('{tier}', state.categories[0].id);

    return [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `${userPrompt}\n\n${formatHint}\n\n${getI18n().promptGamesList}\n${gamesText}` }
    ];
}

function handleExport() {
    setStatus(getI18n().exportingImage, 'loading');
    dom.exportBtn.disabled = true;

    const targetElement = document.querySelector('.tier-list-container');
    const gearBtn = document.getElementById('editCategoriesBtn');
    if (!targetElement) return;
    if (gearBtn) gearBtn.style.display = 'none';

    html2canvas(targetElement, { backgroundColor: '#0c0c0e', scale: 1.5, useCORS: true, logging: false })
        .then(canvas => {
            const link = document.createElement('a');
            link.download = 'steam-tier-list.jpg';
            link.href = canvas.toDataURL('image/jpeg', 0.85);
            link.click();
            setStatus(getI18n().exportSuccess, 'success');
        })
        .catch(err => {
            console.error(err);
            setStatus(getI18n().exportError, 'error');
        })
        .finally(() => {
            dom.exportBtn.disabled = false;
            if (gearBtn) gearBtn.style.display = '';
        });
}

async function getRateLimitMessage(response) {
    try {
        const errData = await response.json();
        if (errData.error === 'Global limit reached') {
            return getI18n().errorRateLimitGlobal;
        }
    } catch (_) {}
    return getI18n().errorRateLimitIp;
}
