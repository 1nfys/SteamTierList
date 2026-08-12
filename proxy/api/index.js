const WORKER_URL = 'https://stl.curly2089.workers.dev';

const collectBody = (req) => new Promise((resolve, reject) => {
  const chunks = [];
  req.on('data', (c) => chunks.push(c));
  req.on('end', () => resolve(Buffer.concat(chunks)));
  req.on('error', reject);
});

export default async function handler(req, res) {
  const PROXY_SECRET = process.env.PROXY_SECRET;

  const target = WORKER_URL + (req.url || '/');

  const headers = {};
  for (const [key, value] of Object.entries(req.headers)) {
    if (['host', 'content-length', 'connection'].includes(key)) continue;
    headers[key] = value;
  }

  const clientIp = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '';
  headers['x-proxy-secret'] = PROXY_SECRET;
  if (clientIp) headers['x-forwarded-for'] = clientIp;

  const opts = { method: req.method, headers };
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    opts.body = await collectBody(req);
  }

  try {
    const upstream = await fetch(target, opts);
    const buf = Buffer.from(await upstream.arrayBuffer());

    res.statusCode = upstream.status;
    for (const [key, value] of upstream.headers.entries()) {
      if (['content-length', 'content-encoding', 'transfer-encoding'].includes(key)) continue;
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
