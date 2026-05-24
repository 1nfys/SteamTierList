const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');

const app = express();
const PORT = process.env.PORT || 20124;
const PROXY_SECRET = process.env.PROXY_SECRET || 'ВАШ_СЕКРЕТНЫЙ_ПАРОЛЬ_ЗДЕСЬ';
const WORKER_URL = 'https://stl.curly2089.workers.dev';

// Healthcheck для Pterodactyl
app.get('/ping', (req, res) => res.send('pong'));

// Настраиваем проксирование
app.use('/', createProxyMiddleware({
    target: WORKER_URL,
    changeOrigin: true,
    ws: true,
    on: {
        proxyReq: (proxyReq, req, res) => {
            // Пытаемся получить IP от Ngrok (x-forwarded-for) или берем прямое подключение
            const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
            
            if (clientIp) {
                // Передаем реальный IP в Воркер
                proxyReq.setHeader('x-forwarded-for', clientIp);
            }
            
            // Добавляем наш секрет, чтобы Воркер знал, что нам можно доверять
            proxyReq.setHeader('x-proxy-secret', PROXY_SECRET);
        }
    }
}));

app.listen(PORT, () => {
    console.log(`Прокси-сервер запущен на порту ${PORT}`);
    console.log(`Перенаправление запросов на: ${WORKER_URL}`);
    console.log('ВАЖНО: Убедитесь, что PROXY_SECRET совпадает с настройками в Cloudflare Worker!');
});
