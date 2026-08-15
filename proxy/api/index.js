const WORKER_URL = 'https://stl.curly2089.workers.dev';

const PROD_ORIGIN = 'https://1nfys.github.io';
const isLocalhost = (origin) => /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
const isAllowedOrigin = (origin) => {
  if (!origin) return false;
  if (origin === PROD_ORIGIN || isLocalhost(origin)) return true;
  return !!origin.endsWith('.vercel.app');

};

const getCorsHeaders = (req) => {
  const origin = req.headers.origin || '';
  const allowed = isAllowedOrigin(origin);
  return {
    'Access-Control-Allow-Origin': allowed ? origin : PROD_ORIGIN,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-local-password, x-proxy-secret',
    'Access-Control-Max-Age': '86400',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer'
  };
};

const collectBody = (req) => new Promise((resolve, reject) => {
  const chunks = [];
  req.on('data', (c) => chunks.push(c));
  req.on('end', () => resolve(Buffer.concat(chunks)));
  req.on('error', reject);
});

const FORWARDED_HEADERS = [
  'accept',
  'accept-encoding',
  'accept-language',
  'authorization',
  'content-type',
  'origin',
  'referer',
  'sec-fetch-mode',
  'sec-fetch-site',
  'x-local-password'
];

const sanitizeHeaderValue = (val) => {
  if (typeof val !== 'string') return String(val);
  return val.replace(/[^\x00-\xFF]/g, '');
};

export default async function handler(req, res) {
  const cors = getCorsHeaders(req);
  for (const [k, v] of Object.entries(cors)) {
    res.setHeader(k, v);
  }

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    return res.end();
  }

  const PROXY_SECRET = process.env.PROXY_SECRET;

  let requestedPath = req.headers['x-matched-path'] || req.url || '/api/stats';
  if (requestedPath === '/api' && req.headers['x-matched-path']) {
    requestedPath = req.headers['x-matched-path'];
  }

  let query = '';
  const qIdx = (req.url || '').indexOf('?');
  if (qIdx !== -1) {
    query = req.url.substring(qIdx);
  }
  const baseRequestedPath = requestedPath.split('?')[0];

  let finalPath = baseRequestedPath;
  if (!finalPath.startsWith('/api/') && finalPath !== '/api') {
    finalPath = '/api' + (finalPath.startsWith('/') ? finalPath : '/' + finalPath);
  }

  const target = WORKER_URL + finalPath + (query && !finalPath.includes('?') ? query : '');

  const headers = {};
  for (const name of FORWARDED_HEADERS) {
    const val = req.headers[name];
    if (val) {
      headers[name] = sanitizeHeaderValue(val);
    }
  }

  const clientIp = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '';
  if (PROXY_SECRET) headers['x-proxy-secret'] = sanitizeHeaderValue(PROXY_SECRET);
  if (clientIp) headers['x-forwarded-for'] = sanitizeHeaderValue(clientIp);

  const opts = { method: req.method, headers };
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    opts.body = await collectBody(req);
  }

  try {
    const upstream = await fetch(target, opts);
    const buf = Buffer.from(await upstream.arrayBuffer());

    res.statusCode = upstream.status;
    for (const [key, value] of upstream.headers.entries()) {
      const lower = key.toLowerCase();
      if (['content-length', 'content-encoding', 'transfer-encoding', 'access-control-allow-origin', 'access-control-allow-methods', 'access-control-allow-headers', 'access-control-max-age'].includes(lower)) continue;
      res.setHeader(key, value);
    }
    res.setHeader('content-length', buf.length);
    res.end(buf);
  } catch (e) {
    res.statusCode = 502;
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ error: e.message }));
  }
}
