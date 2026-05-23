import { state, WORKER_BASE, getHeaders } from './config.js';
import { i18n } from './i18n.js';
import { resolveSteamId } from './steam.js';
import { callAI, parseAIResponse } from './ai.js';
import {
    dom, initDOM, setStatus, checkWorkerStatus,
    updateSliderUI, updateAIResourceUI, setLanguage,
    renderGames, distributeGamesFromAI
} from './ui.js';

document.addEventListener('DOMContentLoaded', () => {
    initDOM();

    let lang = localStorage.getItem('stl_lang');
    if (!lang) {
        const sysLang = (navigator.language || navigator.userLanguage || 'ru').toLowerCase();
        lang = /^(ru|be|uk|kk)/.test(sysLang) ? 'ru' : 'en';
    }
    setLanguage(lang);

    if (dom.langToggleCheckbox) {
        dom.langToggleCheckbox.checked = (state.currentLang === 'en');
        dom.langToggleCheckbox.addEventListener('change', e => setLanguage(e.target.checked ? 'en' : 'ru'));
    }

    if (dom.slider) {
        dom.slider.addEventListener('input', () => {
            updateSliderUI();
        });
    }

    dom.aiSortTrigger.addEventListener('click', (e) => {
        e.stopPropagation();
        dom.aiSortDropdown.classList.toggle('open');
    });

    document.addEventListener('click', (e) => {
        if (!dom.aiSortDropdown.contains(e.target)) {
            dom.aiSortDropdown.classList.remove('open');
        }
    });

    checkWorkerStatus();
    updateAIResourceUI(true);

    let lastLoadClickTime = 0;
    dom.loadBtn.addEventListener('click', async () => {
        const now = Date.now();
        if (now - lastLoadClickTime < 12000) return;
        lastLoadClickTime = now;

        const rawInput = dom.steamIdInput.value.trim();
        if (!rawInput) { setStatus(i18n[state.currentLang].statusPleaseEnter, 'error'); return; }

        setStatus(i18n[state.currentLang].statusResolving, 'loading');
        dom.loadBtn.disabled = true;

        try {
            const steamId = await resolveSteamId(rawInput);
            setStatus(i18n[state.currentLang].statusLoading, 'loading');

            const response = await fetch(`${WORKER_BASE}/api/steam-games?steamid=${steamId}`, { headers: getHeaders() });
            if (response.status === 429) {
                let errMsg = i18n[state.currentLang].errorRateLimitIp || "Превышен лимит запросов.";
                try {
                    const errData = await response.json();
                    if (errData.error === 'Global limit reached') {
                        errMsg = i18n[state.currentLang].errorRateLimitGlobal || "Превышен общий лимит сети.";
                    }
                } catch (_) {}
                throw new Error(errMsg);
            }
            if (!response.ok) throw new Error(i18n[state.currentLang].errorNetwork);

            const data = await response.json();
            if (!data.response?.games) throw new Error(i18n[state.currentLang].errorProfileHidden);

            state.rawSteamGames = data.response.games
                .sort((a, b) => b.playtime_forever - a.playtime_forever);

            const count = dom.slider ? parseInt(dom.slider.value) : 25;
            state.allGames = state.rawSteamGames.slice(0, count);

            renderGames(state.allGames);
            setStatus(i18n[state.currentLang].statusSuccess.replace('{count}', state.allGames.length), 'success');
            updateSliderUI();
            dom.controlsContainer.classList.remove('hidden');
            dom.exportBtn.disabled = false;
            dom.aiTierBtn.disabled = false;
        } catch (error) {
            console.error(error);
            setStatus(error.message || i18n[state.currentLang].statusErrorLoad, 'error');
        } finally {
            dom.loadBtn.disabled = false;
        }
    });

    dom.aiTierBtn.addEventListener('click', async () => {
        if (!state.allGames.length) { setStatus(i18n[state.currentLang].statusPleaseEnter, 'error'); return; }

        dom.aiSortDropdown.classList.remove('open');

        setStatus(i18n[state.currentLang].statusSortStart, 'loading');
        dom.aiTierBtn.disabled = true;
        document.querySelectorAll('.game-item').forEach(item => item.classList.add('ai-sorting'));

        try {
            const gamesText = state.allGames.map(g => `${g.appid}: "${g.name}"`).join('\n');
            const messages = [
                { role: 'system', content: i18n[state.currentLang].promptSystem },
                {
                    role: 'user',
                    content: `${i18n[state.currentLang].promptUser}\n\nФормат ответа JSON:\n{\n  "games": [\n    {\n      "appid": 12345,\n      "tier": "s",\n      "verdict": "краткий вердикт"\n    }\n  ]\n}\n\nСписок игр:\n${gamesText}`
                }
            ];

            const aiResult = await callAI(messages, setStatus);
            if (!aiResult?.content) throw new Error(i18n[state.currentLang].errorNoAiResponse);

            const { tierMap, reasonsMap } = parseAIResponse(aiResult.content);

            distributeGamesFromAI(tierMap, reasonsMap);
            setStatus(i18n[state.currentLang].statusSortSuccess, 'success');

            updateAIResourceUI(true);
        } catch (error) {
            console.error(error);
            setStatus(error.message || i18n[state.currentLang].errorAiConnection, 'error');
        } finally {
            dom.aiTierBtn.disabled = false;
            document.querySelectorAll('.game-item').forEach(item => item.classList.remove('ai-sorting'));
        }
    });

    dom.dropzones.forEach(zone => {
        zone.addEventListener('dragover', e => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            zone.classList.add('drag-over');
        });
        zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
        zone.addEventListener('drop', e => {
            e.preventDefault();
            zone.classList.remove('drag-over');
            zone.querySelector('.empty-pool-text')?.remove();

            if (state.draggedItem) {
                zone.appendChild(state.draggedItem);
                const newTier = zone.getAttribute('data-tier');
                if (newTier && newTier !== 'pool') {
                    state.draggedItem.setAttribute('data-tier', newTier);
                }
            }
        });
    });

    dom.exportBtn.addEventListener('click', () => {
        setStatus('Генерация изображения...', 'loading');
        dom.exportBtn.disabled = true;

        const targetElement = document.querySelector('.tier-list-container');
        if (!targetElement) return;

        html2canvas(targetElement, { backgroundColor: '#0c0c0e', scale: 2, useCORS: true, logging: false })
            .then(canvas => {
                const link = document.createElement('a');
                link.download = 'steam-tier-list.png';
                link.href = canvas.toDataURL('image/png');
                link.click();
                setStatus('Изображение успешно скачано!', 'success');
                dom.exportBtn.disabled = false;
            })
            .catch(err => {
                console.error(err);
                setStatus('Не удалось сгенерировать изображение.', 'error');
                dom.exportBtn.disabled = false;
            });
    });
});
