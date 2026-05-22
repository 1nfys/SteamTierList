# Steam Tier List Builder

[Русский](#русский) | [English](#english)

---

<a name="русский"></a>
## Русский
### ВНИМАНИЕ!: CloudFlare заблокирован в рф, вследствие этого используйте КВН или запрет
Бесплатное Web-приложение для создания тир-листов (рейтингов) на основе вашей библиотеки игр Steam. 

Проект состоит из клиентской части (Frontend на чистом JS/HTML/CSS) и серверной части (Cloudflare Worker), которая выступает в роли прокси для безопасного взаимодействия с API Steam и нейросетями.

### Основной функционал

*   **Загрузка библиотеки Steam:** Получение списка игр пользователя по Steam ID или ссылке на профиль.
*   **Ручная сортировка:** Интерфейс drag-and-drop для распределения игр по категориям (S, A, B, C, D, F).
*   **Автоматическая сортировка (ИИ):** Возможность автоматического распределения игр по тирам с помощью Cloudflare Workers AI (модель Gemma 4) или резервных моделей через OpenRouter (например, Nemotron). Нейросеть также генерирует краткий вердикт для каждой игры.
*   **Экспорт:** Сохранение готового тир-листа в формате изображения (PNG).
*   **Мультиязычность:** Поддержка русского и английского интерфейса.

### Архитектура проекта

Проект не использует тяжелые фреймворки (React, Vue) или сборщики (Webpack, Vite). 
*   **Frontend:** Каталог `js/` содержит модули ES6 (`app.js`, `ui.js`, `steam.js`, `ai.js`, `config.js`, `i18n.js`).
*   **Backend:** Файл `worker.js` предназначен для запуска в среде Cloudflare Workers. Он скрывает API-ключи, решает проблемы с CORS и контролирует лимиты запросов к нейросетям (Rate Limiting).

### Как развернуть у себя на ПК (Локальная разработка)

Для полноценной работы проекта локально вам потребуется запустить как Frontend, так и Backend (Worker).

#### 1. Настройка Backend (Cloudflare Worker)

Развернуть воркер можно двумя путями: через веб-интерфейс Cloudflare (самый простой) или через консоль (Wrangler).

**Способ А: Через Cloudflare Dashboard (Простой)**
1. Зайдите в панель управления [Cloudflare](https://dash.cloudflare.com/) и перейдите в раздел **Workers & Pages**.
2. Нажмите **Create application** -> **Create Worker**, задайте имя (например, `steam-tier-list-worker`) и нажмите **Deploy**.
3. Нажмите **Edit code**, скопируйте всё содержимое локального файла `worker.js` и вставьте в редактор кода Cloudflare (заменив стандартный код).
   * **Важно:** В коде `worker.js` найдите ссылки на `https://1nfys.github.io` (строки CORS) и замените их на ваш собственный домен (например, вашу ссылку на GitHub Pages). Иначе воркер будет блокировать запросы с вашего сайта!
   Затем нажмите **Deploy** (сохранить).
4. Перейдите в настройки созданного воркера: **Settings** -> **Variables and Secrets**. Добавьте три переменные (тип Secret):
   *   `STEAM_API_KEY`
   *   `OPENROUTER_API_KEY`
   *   `LOCAL_PASSWORD` *(пароль для защиты локальной версии от сторонних запросов)*
5. Перейдите в левом меню в раздел **Storage & Databases** -> **KV** и создайте пространство имен (Create namespace) с любым именем.
6. В настройках воркера перейдите в **Settings** -> **Bindings**.
   * Добавьте привязку **Workers AI**: Variable name: `AI`
   * Добавьте привязку **KV Namespace bindings**: Variable name: `LIMITS_KV`, KV namespace: (выберите созданное на предыдущем шаге пространство).
7. Скопируйте ссылку на ваш воркер (вида `https://ваше-имя.ваша-сеть.workers.dev`).

**Способ Б: Через консоль (Wrangler)**
Вам потребуется аккаунт Cloudflare и установленный Node.js.
1. Установите CLI для Cloudflare:
   `npm install -g wrangler`
2. Авторизуйтесь в Cloudflare:
   `wrangler login`
3. Создайте файл `wrangler.toml` в корне проекта (если его нет) со следующим содержимым:
   ```toml
   name = "steam-tier-list-worker"
   main = "worker.js"
   compatibility_date = "2024-01-01"

   [ai]
   binding = "AI"

   [[kv_namespaces]]
   binding = "LIMITS_KV"
   id = "ВАШ_KV_ID"
   ```
4. Добавьте необходимые секреты (API ключи) в Cloudflare:
   `wrangler secret put STEAM_API_KEY`
   `wrangler secret put OPENROUTER_API_KEY`
   `wrangler secret put LOCAL_PASSWORD`
5. Создайте базу данных KV для лимитов:
   `wrangler kv:namespace create LIMITS_KV`
   *(Вставьте полученный ID в `wrangler.toml` вместо "ВАШ_KV_ID")*
6. Запустите воркер локально:
   `wrangler dev` (По умолчанию воркер запустится по адресу http://localhost:8787)

#### 2. Настройка Frontend

1. Откройте файл `js/config.js`.
2. Убедитесь, что константа `CLOUDFLARE_WORKER_URL` указывает на ваш локальный воркер (например, `http://localhost:8787/`) или на ваш опубликованный рабочий воркер в Cloudflare.
3. Запустите локальный веб-сервер в корневой папке проекта. Проще всего использовать `serve`:
   `npx serve`
4. Откройте предложенный адрес (обычно `http://localhost:3000`) в браузере.
5. При первой загрузке скрипт запросит локальный пароль (тот, что вы указали в `LOCAL_PASSWORD`). Введите его.

### Как пользоваться

1. Убедитесь, что ваш профиль Steam открыт настройках приватности Steam (включая игровую активность).
2. Вставьте свой Steam ID или ссылку на профиль в строку поиска на сайте.
3. Настройте ползунком количество игр, которые хотите загрузить (загружаются самые популярные по времени в игре).
4. Нажмите "Загрузить игры".
5. Перетаскивайте игры вручную или нажмите "Авто-сортировка", чтобы доверить распределение нейросети.
6. Нажмите "Сохранить изображение" для скачивания результата.

---

<a name="english"></a>
## English

A free Web application for creating tier lists (ratings) based on your Steam game library.

The project consists of a client side (Vanilla JS/HTML/CSS Frontend) and a server side (Cloudflare Worker), which acts as a proxy for secure communication with the Steam API and neural networks.

### Main Features

*   **Load Steam Library:** Retrieve a user's game list via Steam ID or profile link.
*   **Manual Sorting:** Drag-and-drop interface for distributing games into categories (S, A, B, C, D, F).
*   **Automated Sorting (AI):** Automatically distribute games into tiers using Cloudflare Workers AI (Gemma 4 model) or fallback models via OpenRouter (e.g. Nemotron). The AI also generates a short verdict for each game.
*   **Export:** Save the completed tier list as an image (PNG).
*   **Multilingual:** Supports Russian and English interfaces.

### Project Architecture

The project does not use heavy frameworks (React, Vue) or bundlers (Webpack, Vite).
*   **Frontend:** The `js/` directory contains ES6 modules (`app.js`, `ui.js`, `steam.js`, `ai.js`, `config.js`, `i18n.js`).
*   **Backend:** The `worker.js` file is designed to run in Cloudflare Workers. It hides API keys, resolves CORS issues, and controls rate limits for AI requests.

### Local Development Setup

To run the project locally, you need to start both the Frontend and the Backend (Worker).

#### 1. Backend Setup (Cloudflare Worker)

You can deploy the worker in two ways: via the Cloudflare web interface (easiest) or via the console (Wrangler).

**Method A: Cloudflare Dashboard (Easy)**
1. Go to the [Cloudflare Dashboard](https://dash.cloudflare.com/) and navigate to **Workers & Pages**.
2. Click **Create application** -> **Create Worker**, name it (e.g., `steam-tier-list-worker`), and click **Deploy**.
3. Click **Edit code**, copy the entire contents of the local `worker.js` file, paste it into the Cloudflare code editor (replacing the default code).
   * **Important:** In the `worker.js` code, find the references to `https://1nfys.github.io` (the CORS allowed origins) and replace them with your own domain (e.g., your GitHub Pages URL). Otherwise, the worker will block requests from your site!
   Click **Deploy** (save).
4. Go to the worker settings: **Settings** -> **Variables and Secrets**. Add three variables (type Secret):
   *   `STEAM_API_KEY`
   *   `OPENROUTER_API_KEY`
   *   `LOCAL_PASSWORD` *(password to protect your local worker from third-party requests)*
5. In the left menu, go to **Storage & Databases** -> **KV** and create a new namespace.
6. In the worker settings, go to **Settings** -> **Bindings**:
   * Add a **Workers AI** binding: Variable name: `AI`
   * Add a **KV Namespace** binding: Variable name: `LIMITS_KV`, select the namespace you just created.
7. Copy the link to your worker (e.g., `https://your-name.your-subdomain.workers.dev`).

**Method B: Console (Wrangler)**
You will need a Cloudflare account and Node.js installed.
1. Install the Cloudflare CLI:
   `npm install -g wrangler`
2. Log in to Cloudflare:
   `wrangler login`
3. Create a `wrangler.toml` file in the project root with the following content:
   ```toml
   name = "steam-tier-list-worker"
   main = "worker.js"
   compatibility_date = "2024-01-01"

   [ai]
   binding = "AI"

   [[kv_namespaces]]
   binding = "LIMITS_KV"
   id = "YOUR_KV_ID"
   ```
4. Add the required secrets:
   `wrangler secret put STEAM_API_KEY`
   `wrangler secret put OPENROUTER_API_KEY`
   `wrangler secret put LOCAL_PASSWORD`
5. Create a KV namespace for rate limits:
   `wrangler kv:namespace create LIMITS_KV`
   *(Paste the generated ID into `wrangler.toml` replacing "YOUR_KV_ID")*
6. Run locally:
   `wrangler dev` (runs on http://localhost:8787 by default)

#### 2. Frontend Setup

1. Open the file `js/config.js`.
2. Ensure the `CLOUDFLARE_WORKER_URL` constant points to your local worker (e.g., `http://localhost:8787/`) or your deployed Cloudflare worker URL.
3. Run a local web server in the project root. The easiest way is using `serve`: 
   `npx serve`
4. Open the provided address (usually `http://localhost:3000`) in your browser.
5. On the first load, the script will ask for the local password (the one you specified in `LOCAL_PASSWORD`). Enter it.

### How to use

1. Ensure your Steam profile privacy settings are set to public (including Game details).
2. Paste your Steam ID or profile link into the search bar.
3. Use the slider to adjust the number of games you want to load.
4. Click "Load Games".
5. Drag and drop games manually or click "Auto-Sort" to let the AI distribute them.
6. Click "Save Image" to download the result.
