import { state, PROXY_BASE, getHeaders } from './config.js?v=7';
import { i18n, getI18n } from './i18n.js?v=7';
import { fetchStats } from './ai.js?v=7';

export const dom = {};

export function initDOM() {
    dom.steamIdInput = document.getElementById('steamIdInput');
    dom.loadBtn = document.getElementById('loadBtn');
    dom.aiTierBtn = document.getElementById('aiTierBtn');
    dom.aiSortTrigger = document.getElementById('aiSortTrigger');
    dom.aiSortDropdown = document.getElementById('aiSortDropdown');
    dom.aiSortCloseBtn = document.getElementById('aiSortCloseBtn');
    dom.exportBtn = document.getElementById('exportBtn');
    dom.statusMessage = document.getElementById('statusMessage');
    dom.gamePool = document.getElementById('gamePool');
    dom.dropzones = document.querySelectorAll('.tier-dropzone');
    dom.aiResourceText = document.getElementById('aiResourceText');
    dom.aiResourceFill = document.getElementById('aiResourceFill');
    dom.aiEnergyChip = document.getElementById('aiEnergyChip');
    dom.controlsContainer = document.getElementById('controlsContainer');
    dom.slider = document.getElementById('gameCountSlider');
    dom.langToggleCheckbox = document.getElementById('langToggleCheckbox');
    dom.freeGamesCheckbox = document.getElementById('freeGamesCheckbox');
}

export function setStatus(msg, type) {
    if (dom.statusMessage) {
        dom.statusMessage.textContent = msg;
        dom.statusMessage.className = `status-message ${type}`;
    }
}

export async function checkWorkerStatus() {
    const renderDot = document.getElementById('renderStatusDot');
    if (renderDot) renderDot.className = 'cf-status-dot checking';

    try {
        const controller1 = new AbortController();
        const timeout1 = setTimeout(() => controller1.abort(), 5000);
        const respRender = await fetch(`${PROXY_BASE}/api/stats?_=${Date.now()}`, { signal: controller1.signal, headers: getHeaders() });
        clearTimeout(timeout1);
        if (renderDot) renderDot.className = respRender.ok ? 'cf-status-dot online' : 'cf-status-dot offline';
    } catch (e) {
        if (renderDot) renderDot.className = 'cf-status-dot offline';
    }
}

export function updateSliderUI() {
    if (!dom.slider) return;
    const count = parseInt(dom.slider.value);
    const cost = Math.ceil(count / 25);

    const countLabel = document.getElementById('gameCountLabel');
    const costLabel = document.getElementById('energyCostLabel');

    if (countLabel && getI18n().gamesToLoad) {
        countLabel.textContent = getI18n().gamesToLoad.replace('{count}', count);
    }
    if (costLabel) {
        const isLoaded = (state.allGames && state.allGames.length > 0);
        if (isLoaded) {
            const loadedCost = Math.ceil(state.allGames.length / 25);
            costLabel.textContent = (getI18n().finalCost || "Итоговый расход энергии: {cost} ⚡").replace('{cost}', loadedCost);
        } else {
            costLabel.textContent = (getI18n().estimatedCost || "Ожидаемый расход энергии: {cost} ⚡").replace('{cost}', cost);
        }
    }

    const warningEl = document.getElementById('sliderWarning');
    if (warningEl) {
        if (state.stats) {
            const remaining = Math.max(0, state.stats.user_limit - state.stats.user_used);
            if (cost > remaining) {
                warningEl.textContent = getI18n().insufficientEnergyWarning;
                warningEl.style.color = '#ef4444';
                warningEl.style.fontWeight = 'bold';
            } else {
                warningEl.textContent = getI18n().sliderWarning;
                warningEl.style.color = '';
                warningEl.style.fontWeight = '';
            }
        } else {
            warningEl.textContent = getI18n().sliderWarning;
            warningEl.style.color = '';
            warningEl.style.fontWeight = '';
        }
    }
}

export async function updateAIResourceUI(forceFetch = false) {
    try {
        if (!state.stats || forceFetch) {
            state.stats = await fetchStats();
        }
        const stats = state.stats;
        const remaining = Math.max(0, stats.user_limit - stats.user_used);
        const percent = (remaining / stats.user_limit) * 100;

        dom.aiResourceText.textContent = `${remaining} / ${stats.user_limit}`;
        if (remaining > 0) {
            dom.aiResourceText.style.color = 'var(--accent)';
            dom.aiResourceFill.style.background = 'var(--accent)';
        } else {
            dom.aiResourceText.style.color = '#ef4444';
            dom.aiResourceFill.style.background = '#ef4444';
        }
        dom.aiResourceFill.style.width = `${percent}%`;

        const timeString = getI18n().resetTimeText.replace('{hours}', stats.hours_to_reset);
        const resetTimeText = document.getElementById('resetTimeText');
        const globalResetTimeText = document.getElementById('globalResetTimeText');
        if (resetTimeText) resetTimeText.textContent = timeString;
        if (globalResetTimeText) globalResetTimeText.textContent = timeString;

        const globalText = document.getElementById('globalResourceText');
        const globalFill = document.getElementById('globalResourceFill');
        if (globalText && globalFill) {
            globalText.textContent = `${stats.global_used} / ${stats.global_limit}`;
            globalFill.style.width = `${Math.min(100, (stats.global_used / stats.global_limit) * 100)}%`;
        }

        updateSliderUI();
    } catch (e) {
        console.error('Failed to fetch stats:', e);
    }
}

export function setLanguage(lang) {
    lang = lang === 'en' ? 'en' : 'ru';
    state.currentLang = lang;
    localStorage.setItem('stl_lang', lang);
    document.title = i18n[lang].pageTitle || document.title;
    
    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        if (i18n[lang][key]) el.textContent = i18n[lang][key];
    });
    
    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
        const key = el.getAttribute('data-i18n-placeholder');
        if (i18n[lang][key]) el.placeholder = i18n[lang][key];
    });
    
    updateSliderUI();
    updateAIResourceUI();

    document.querySelectorAll('.game-item[data-tooltip]').forEach(gameEl => {
        const currentTooltip = gameEl.getAttribute('data-tooltip');
        if (currentTooltip === i18n.ru.aiShyToEvaluate || currentTooltip === i18n.en.aiShyToEvaluate) {
            gameEl.setAttribute('data-tooltip', i18n[lang].aiShyToEvaluate);
        } else if (currentTooltip === i18n.ru.defaultVerdict || currentTooltip === i18n.en.defaultVerdict) {
            gameEl.setAttribute('data-tooltip', i18n[lang].defaultVerdict);
        }
    });
}

export function renderGames(gamesList) {
    dom.gamePool.innerHTML = '';
    document.querySelectorAll('.tier-row .tier-dropzone').forEach(dz => dz.innerHTML = '');

    const fragment = document.createDocumentFragment();
    gamesList.forEach(game => {
        const gameEl = document.createElement('div');
        gameEl.className = 'game-item';
        gameEl.draggable = true;
        gameEl.id = `game-${game.appid}`;
        const img = document.createElement('img');
        img.src = `https://steamcdn-a.akamaihd.net/steam/apps/${game.appid}/capsule_184x69.jpg`;
        img.alt = game.name;
        img.onerror = function() {
            this.onerror = null;
            this.src = `https://steamcdn-a.akamaihd.net/steam/apps/${game.appid}/header.jpg`;
        };

        const title = document.createElement('div');
        title.className = 'game-title';
        title.textContent = game.name;

        gameEl.appendChild(img);
        gameEl.appendChild(title);
        gameEl.addEventListener('dragstart', handleDragStart);
        gameEl.addEventListener('dragend', handleDragEnd);
        fragment.appendChild(gameEl);
    });
    dom.gamePool.appendChild(fragment);
}

function handleDragStart(e) {
    state.draggedItem = this;
    setTimeout(() => this.classList.add('dragging'), 0);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/html', this.innerHTML);
}

function handleDragEnd() {
    this.classList.remove('dragging');
    state.draggedItem = null;
    dom.dropzones.forEach(dz => dz.classList.remove('drag-over'));
}

export function distributeGamesFromAI(tierMap, reasonsMap = new Map()) {
    dom.gamePool.querySelector('.empty-pool-text')?.remove();

    const assignedGames = new Set();
    const normalizedTierMap = new Map([['s', []], ['a', []], ['b', []], ['c', []], ['d', []], ['f', []]]);

    for (let [key, valArr] of tierMap.entries()) {
        const lKey = key.toLowerCase();
        if (normalizedTierMap.has(lKey)) {
            normalizedTierMap.set(lKey, normalizedTierMap.get(lKey).concat(valArr || []));
        }
    }

    state.allGames.forEach(game => {
        const id = game.appid;
        let inAnyTier = false;
        for (let arr of normalizedTierMap.values()) {
            if (arr.includes(id) || arr.includes(String(id)) || arr.includes(Number(id))) {
                inAnyTier = true; break;
            }
        }
        if (inAnyTier) return;

        const gameNameLower = game.name.toLowerCase().trim();
        let matchedTier = null;
        for (let [tierKey, arr] of normalizedTierMap.entries()) {
            if (arr.some(val => {
                if (typeof val !== 'string') return false;
                const v = val.toLowerCase().trim();
                return v === gameNameLower || gameNameLower.includes(v) || v.includes(gameNameLower);
            })) matchedTier = tierKey;
        }

        if (matchedTier) {
            normalizedTierMap.get(matchedTier).push(id);
        } else {
            normalizedTierMap.get('c').push(id);
            reasonsMap.set(id, getI18n().aiShyToEvaluate || "ИИ постеснялся оценить этот шедевр");
        }
    });

    state.allGames.forEach(game => {
        const gameEl = document.getElementById(`game-${game.appid}`);
        if (gameEl) {
            gameEl.removeAttribute('data-tooltip');
            gameEl.removeAttribute('data-tier');
            gameEl.classList.remove('has-tooltip');
        }
    });

    for (let [tierKey, arr] of normalizedTierMap.entries()) {
        const dropzone = document.querySelector(`.tier-dropzone[data-tier="${tierKey}"]`);
        if (!dropzone) continue;

        arr.forEach(id => {
            const numId = Number(id);
            if (assignedGames.has(numId)) return;
            assignedGames.add(numId);

            const gameEl = document.getElementById(`game-${numId}`);
            if (!gameEl) return;

            let reason = reasonsMap.get(numId) || reasonsMap.get(String(numId));
            if (!reason) {
                const game = state.allGames.find(g => g.appid === numId);
                if (game) {
                    const gameNameLower = game.name.toLowerCase().trim();
                    for (let [k, v] of reasonsMap.entries()) {
                        const kl = String(k).toLowerCase().trim();
                        if (kl === gameNameLower || gameNameLower.includes(kl) || kl.includes(gameNameLower)) {
                            reason = v; break;
                        }
                    }
                }
            }
            reason = reason || getI18n().defaultVerdict || "Приятная игра в коллекции";

            gameEl.setAttribute('data-tooltip', reason);
            gameEl.setAttribute('data-tier', tierKey);
            gameEl.classList.add('has-tooltip');

            setTimeout(() => dropzone.appendChild(gameEl), Math.random() * 500);
        });
    }

    setTimeout(() => {
        dom.gamePool.querySelectorAll('.game-item').forEach(game => {
            const cTier = document.querySelector('.tier-dropzone[data-tier="c"]');
            if (cTier) cTier.appendChild(game);
        });
    }, 1200);
}
