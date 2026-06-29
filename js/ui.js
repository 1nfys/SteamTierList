import { state, PROXY_BASE, getHeaders, DEFAULT_CATEGORIES } from 'config';
import { i18n, getI18n } from 'i18n';
import { fetchStats } from 'ai';

export const dom = {};

let hasShownCategoriesWarning = false;

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
    const numCats = state.categories ? state.categories.length : 6;
    const tierCostAddition = numCats > 6 ? (numCats - 6) * 2 : 0;
    const cost = Math.ceil(count / 25) + tierCostAddition;

    const countLabel = document.getElementById('gameCountLabel');
    const costLabel = document.getElementById('energyCostLabel');

    if (countLabel && getI18n().gamesToLoad) {
        countLabel.textContent = getI18n().gamesToLoad.replace('{count}', count);
    }
    if (costLabel) {
        const isLoaded = (state.allGames && state.allGames.length > 0);
        if (isLoaded) {
            const loadedCost = Math.ceil(state.allGames.length / 25) + tierCostAddition;
            costLabel.textContent = (getI18n().finalCost || "Итоговый расход энергии: {cost}").replace('{cost}', loadedCost);
        } else {
            costLabel.textContent = (getI18n().estimatedCost || "Ожидаемый расход энергии: {cost}").replace('{cost}', cost);
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
    document.documentElement.setAttribute('lang', lang);
    document.title = i18n[lang].pageTitle || document.title;
    
    const metaDesc = document.querySelector('meta[name="description"]');
    if (metaDesc && i18n[lang].siteDescription) {
        metaDesc.setAttribute('content', i18n[lang].siteDescription);
    }
    
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
        img.src = `https://cdn.cloudflare.steamstatic.com/steam/apps/${game.appid}/capsule_184x69.jpg`;
        img.alt = game.name;
        img.onerror = function() {
            if (this.src.includes('cdn.cloudflare.steamstatic.com')) {
                this.src = `https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/${game.appid}/capsule_184x69.jpg`;
            } else if (this.src.includes('shared.fastly.steamstatic.com')) {
                this.src = `https://steamcdn-a.akamaihd.net/steam/apps/${game.appid}/capsule_184x69.jpg`;
            } else {
                this.onerror = null;
                this.style.display = 'none';
                gameEl.classList.add('img-failed');
            }
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
    const normalizedTierMap = new Map();
    state.categories.forEach(cat => {
        normalizedTierMap.set(cat.id.toLowerCase(), []);
    });

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
            const fallbackTierId = state.categories.at(Math.floor(state.categories.length / 2))?.id || state.categories.at(0)?.id;
            if (fallbackTierId) {
                normalizedTierMap.get(fallbackTierId.toLowerCase())?.push(id);
            }
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
            const fallbackTier = state.categories.at(Math.floor(state.categories.length / 2))?.id || state.categories.at(0)?.id;
            const fallbackZone = document.querySelector(`.tier-dropzone[data-tier="${fallbackTier}"]`);
            if (fallbackZone) fallbackZone.appendChild(game);
        });
    }, 1200);
}

function getContrastColor(hexColor) {
    if (!hexColor || hexColor.charAt(0) !== '#') return 'rgba(0,0,0,0.9)';
    const r = parseInt(hexColor.substr(1, 2), 16);
    const g = parseInt(hexColor.substr(3, 2), 16);
    const b = parseInt(hexColor.substr(5, 2), 16);
    const yiq = ((r * 299) + (g * 587) + (b * 114)) / 1000;
    return (yiq >= 128) ? 'rgba(0,0,0,0.9)' : 'rgba(255,255,255,0.9)';
}

export function bindDropzoneListeners() {
    const dropzones = document.querySelectorAll('.tier-dropzone');
    dropzones.forEach(zone => {
        const newZone = zone.cloneNode(true);
        zone.parentNode.replaceChild(newZone, zone);
        
        newZone.addEventListener('dragover', e => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            newZone.classList.add('drag-over');
        });
        newZone.addEventListener('dragleave', () => newZone.classList.remove('drag-over'));
        newZone.addEventListener('drop', e => {
            e.preventDefault();
            newZone.classList.remove('drag-over');
            newZone.querySelector('.empty-pool-text')?.remove();

            if (state.draggedItem) {
                newZone.appendChild(state.draggedItem);
                const newTier = newZone.getAttribute('data-tier');
                if (newTier && newTier !== 'pool') {
                    state.draggedItem.setAttribute('data-tier', newTier);
                } else {
                    state.draggedItem.removeAttribute('data-tier');
                }
            }
        });
    });
    dom.dropzones = document.querySelectorAll('.tier-dropzone');
    dom.gamePool = document.getElementById('gamePool');
}

export function renderTierList() {
    const container = document.querySelector('.tier-list-container');
    if (!container) return;

    const savedGames = new Map();
    state.categories.forEach(cat => {
        savedGames.set(cat.id, []);
    });

    document.querySelectorAll('.tier-row').forEach(row => {
        const dz = row.querySelector('.tier-dropzone');
        if (!dz) return;
        const tierId = dz.getAttribute('data-tier');
        const games = Array.from(dz.querySelectorAll('.game-item'));
        if (savedGames.has(tierId)) {
            savedGames.set(tierId, games);
        } else {
            if (dom.gamePool) {
                games.forEach(g => {
                    g.removeAttribute('data-tier');
                    g.removeAttribute('data-tooltip');
                    g.classList.remove('has-tooltip');
                    dom.gamePool.appendChild(g);
                });
            }
        }
    });

    container.innerHTML = '';

    const gearBtn = document.createElement('button');
    gearBtn.id = 'editCategoriesBtn';
    gearBtn.className = 'categories-gear-btn';
    gearBtn.title = state.currentLang === 'ru' ? 'Настройки категорий' : 'Category Settings';
    gearBtn.innerHTML = '⚙';
    container.appendChild(gearBtn);

    state.categories.forEach(cat => {
        const row = document.createElement('div');
        row.className = 'tier-row';

        const label = document.createElement('div');
        label.className = 'tier-label';
        label.style.backgroundColor = cat.color;
        label.style.color = getContrastColor(cat.color);
        label.textContent = cat.label;

        const len = cat.label.length;
        if (len > 12) {
            label.style.fontSize = '0.85rem';
        } else if (len > 8) {
            label.style.fontSize = '1.05rem';
        } else if (len > 5) {
            label.style.fontSize = '1.3rem';
        } else if (len > 2) {
            label.style.fontSize = '1.6rem';
        } else {
            label.style.fontSize = '2rem';
        }

        const dz = document.createElement('div');
        dz.className = 'tier-dropzone';
        dz.setAttribute('data-tier', cat.id);

        row.appendChild(label);
        row.appendChild(dz);
        container.appendChild(row);

        if (savedGames.has(cat.id)) {
            savedGames.get(cat.id).forEach(game => dz.appendChild(game));
        }
    });

    bindDropzoneListeners();
    setupGearBtnListener();
}

function setupGearBtnListener() {
    const gearBtn = document.getElementById('editCategoriesBtn');
    if (gearBtn) {
        gearBtn.onclick = () => openCategoriesModal();
    }
}

function openCategoriesModal() {
    const modal = document.getElementById('categoriesModal');
    const list = document.getElementById('modalCategoriesList');
    if (!modal || !list) return;

    list.innerHTML = '';
    
    state.categories.forEach((cat, index) => {
        const row = document.createElement('div');
        row.className = 'category-edit-row';
        row.dataset.index = index;

        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'category-input';
        input.name = `category_name_${index}`;
        input.id = `category_name_${index}`;
        input.value = cat.label;
        input.placeholder = state.currentLang === 'ru' ? 'Имя категории...' : 'Category name...';

        const colorPicker = document.createElement('input');
        colorPicker.type = 'color';
        colorPicker.className = 'category-color-picker';
        colorPicker.name = `category_color_${index}`;
        colorPicker.id = `category_color_${index}`;
        colorPicker.value = cat.color.startsWith('#') ? cat.color : '#7f7f7f';

        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'category-delete-btn';
        deleteBtn.innerHTML = '&times;';
        deleteBtn.addEventListener('click', () => {
            row.remove();
        });

        row.appendChild(input);
        row.appendChild(colorPicker);
        row.appendChild(deleteBtn);
        list.appendChild(row);
    });

    const warningOverlay = document.getElementById('categoriesWarningOverlay');
    const modalBody = document.getElementById('categoriesModalBody');
    if (warningOverlay && modalBody) {
        if (!hasShownCategoriesWarning) {
            warningOverlay.classList.remove('hidden');
            modalBody.classList.add('blurred');
            hasShownCategoriesWarning = true;
        } else {
            warningOverlay.classList.add('hidden');
            modalBody.classList.remove('blurred');
        }
    }

    modal.classList.remove('hidden');
}

export function initCategoriesManager() {
    const modal = document.getElementById('categoriesModal');
    const closeBtn = document.getElementById('closeCategoriesBtn');
    const addBtn = document.getElementById('addCategoryBtn');
    const saveBtn = document.getElementById('saveCategoriesBtn');
    const resetBtn = document.getElementById('resetCategoriesBtn');
    const warningOkBtn = document.getElementById('warningOkBtn');
    const warningOverlay = document.getElementById('categoriesWarningOverlay');
    const modalBody = document.getElementById('categoriesModalBody');

    if (warningOkBtn && warningOverlay && modalBody) {
        warningOkBtn.addEventListener('click', () => {
            warningOverlay.classList.add('hidden');
            modalBody.classList.remove('blurred');
        });
    }

    if (closeBtn && modal) {
        closeBtn.addEventListener('click', () => modal.classList.add('hidden'));
    }

    if (addBtn) {
        addBtn.addEventListener('click', () => {
            const list = document.getElementById('modalCategoriesList');
            if (!list) return;

            const row = document.createElement('div');
            row.className = 'category-edit-row';

            const currentIndex = document.querySelectorAll('.category-edit-row').length;

            const input = document.createElement('input');
            input.type = 'text';
            input.className = 'category-input';
            input.name = `category_name_new_${currentIndex}`;
            input.id = `category_name_new_${currentIndex}`;
            input.value = '';
            input.placeholder = state.currentLang === 'ru' ? 'Новая категория...' : 'New category...';

            const colorPicker = document.createElement('input');
            colorPicker.type = 'color';
            colorPicker.className = 'category-color-picker';
            colorPicker.name = `category_color_new_${currentIndex}`;
            colorPicker.id = `category_color_new_${currentIndex}`;
            
            const colors = ['#ff2020', '#ff8000', '#F9FF10', '#00ff00', '#0060ff', '#7f7f7f', '#a855f7', '#ec4899'];
            colorPicker.value = colors.at(Math.floor(Math.random() * colors.length));

            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'category-delete-btn';
            deleteBtn.innerHTML = '&times;';
            deleteBtn.addEventListener('click', () => {
                row.remove();
            });

            row.appendChild(input);
            row.appendChild(colorPicker);
            row.appendChild(deleteBtn);
            list.appendChild(row);
        });
    }

    if (saveBtn && modal) {
        saveBtn.addEventListener('click', () => {
            const rows = document.querySelectorAll('.category-edit-row');
            const newCategories = [];
            
            rows.forEach((row, i) => {
                const input = row.querySelector('.category-input');
                const colorPicker = row.querySelector('.category-color-picker');
                if (!input || !colorPicker) return;

                let label = input.value.trim();
                if (!label) {
                    label = `Tier ${i + 1}`;
                }
                
                const cleanLabel = label.toLowerCase().replace(/[^a-z0-9]/g, '');
                const id = cleanLabel ? `${cleanLabel}_${i}` : `tier_${i}`;

                newCategories.push({
                    id: id,
                    label: label,
                    color: colorPicker.value
                });
            });

            if (newCategories.length === 0) {
                alert(state.currentLang === 'ru' ? 'Необходимо добавить хотя бы одну категорию!' : 'You must have at least one category!');
                return;
            }

            state.categories = newCategories;
            localStorage.setItem('stl_categories', JSON.stringify(newCategories));
            
            renderTierList();
            updateSliderUI();
            modal.classList.add('hidden');
        });
    }

    if (resetBtn) {
        resetBtn.addEventListener('click', () => {
            state.categories = DEFAULT_CATEGORIES;
            localStorage.setItem('stl_categories', JSON.stringify(DEFAULT_CATEGORIES));
            
            renderTierList();
            updateSliderUI();
            modal.classList.add('hidden');
        });
    }

    setupGearBtnListener();
}
