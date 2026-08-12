# Steam Tier List

строит тир-лист по твоей библиотеке steam. загрузи игры, раскидай по тирам вручную или дай ии всё сделать, сохрани картинку.

## что умеет

- загрузка игр по steam id или ссылке на профиль
- ручная сортировка перетаскиванием по тирам (s, a, b, c, d, f или свои)
- авто-сортировка нейросетью (cloudflare workers ai, gemma 4)
- ии пишет короткий вердикт к каждой игре
- свои категории: название, цвет, количество
- сохранение тир-листа в картинку
- интерфейс на русском и английском

## как пользоваться

1. вставь steam id или ссылку на профиль в строку поиска
2. выбери, сколько игр грузить
3. нажми загрузить
4. перетаскивай игры вручную или жми авто-сортировку
5. сохрани картинку

> профиль в steam должен быть открыт (включая игровую активность), иначе игры не подгрузятся

## локальный запуск

нужен node.js и развернутый воркер.

1. задеплой `worker.js` в cloudflare workers
2. добавь секреты: `STEAM_API_KEY`, `LOCAL_PASSWORD`, `TURNSTILE_SECRET`
3. привяжи workers ai (binding `AI`) и kv namespace (binding `LIMITS_KV`)
4. в `js/config.js` укажи свой `TURNSTILE_SITEKEY` и `API_URL`
5. запусти `npx serve` и открой `http://localhost:3000`

при первом открытии спросит локальный пароль (тот, что в `LOCAL_PASSWORD`).

## прокси на верселе

сайт ходит в воркер не напрямую, а через прокси на верселе. он подмешивает `x-proxy-secret` и подставляет реальный ip, чтобы лимиты считались правильно.

1. задеплой папку `proxy` в версел
2. добавь секрет `PROXY_SECRET` (такой же, как у воркера)
3. запусти `vercel --prod`
4. в `js/config.js` впиши в `API_URL` адрес прокси, например `https://steam-tier-list-tau.vercel.app/`

## как это устроено

- фронт на чистом js/html/css, без фреймворков
- бэк это cloudflare worker, он прячет ключи и держит лимиты запросов
- steam api и нейросеть дергаются только через воркер, ключи наружу не уходят
- сайт общается с воркером через прокси на верселе, он скрывает адрес воркера и подмешивает секрет

---

# Steam Tier List

builds a tier list from your steam library. load your games, sort them into tiers by hand or let the ai do it, export a picture.

## features

- load games by steam id or profile link
- drag and drop games into tiers (s, a, b, c, d, f or custom)
- auto-sort with ai (cloudflare workers ai, gemma 4)
- ai writes a short verdict for every game
- custom categories: name, color, count
- export the tier list as an image
- ui in english and russian

## usage

1. paste your steam id or profile link into the search box
2. pick how many games to load
3. hit load
4. drag games around or hit auto-sort
5. save the image

> your steam profile must be public (including game details), otherwise nothing loads

## local setup

you need node.js and a deployed worker.

1. deploy `worker.js` to cloudflare workers
2. add secrets: `STEAM_API_KEY`, `LOCAL_PASSWORD`, `TURNSTILE_SECRET`
3. bind workers ai (binding `AI`) and a kv namespace (binding `LIMITS_KV`)
4. set your `TURNSTILE_SITEKEY` and `API_URL` in `js/config.js`
5. run `npx serve` and open `http://localhost:3000`

it asks for the local password (the one in `LOCAL_PASSWORD`) on first open.

## vercel proxy

the site does not call the worker directly, it goes through a proxy on vercel. it adds `x-proxy-secret` and the real client ip so limits are counted right.

1. deploy the `proxy` folder to vercel
2. add the `PROXY_SECRET` secret (the same as the worker's)
3. run `vercel --prod`
4. put the proxy url into `API_URL` in `js/config.js`, for example `https://steam-tier-list-tau.vercel.app/`

## how it works

- frontend is plain js/html/css, no frameworks
- backend is a cloudflare worker that hides keys and enforces request limits
- steam api and the ai are only reachable through the worker, keys never leave the server
- the site talks to the worker through a proxy on vercel, it hides the worker url and adds the secret
