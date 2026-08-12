const G_NET_LIMIT = 500;
const USR_DAY_LIM = 40;
const ALLOWED_MODELS = ['@cf/google/gemma-4-26b-a4b-it'];
const clientReqs = new Map();
let globalReqs = [];

const securityHeaders = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer'
};

const PROD_ORIGIN = 'https://1nfys.github.io';
const isLocalhost = (origin) => /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
const isAllowedOrigin = (origin) => origin === PROD_ORIGIN || isLocalhost(origin);
const isBrowserRequest = (req) => req.headers.has('Sec-Fetch-Mode') && req.headers.has('Sec-Fetch-Site');

const checkGlobalRateLimit = () => {
  const now = Date.now();
  globalReqs = globalReqs.filter(t => t > now - 60000);
  if (globalReqs.length >= 30) {
    return false;
  }
  globalReqs.push(now);
  return true;
};

const getClientId = (req, env) => {
  const proxySecret = req.headers.get('x-proxy-secret');
  if (proxySecret && env.PROXY_SECRET && proxySecret === env.PROXY_SECRET) {
    const forwarded = req.headers.get('x-forwarded-for');
    if (forwarded) return forwarded.split(',')[0].trim();
  }
  return req.headers.get('cf-connecting-ip') || 'unknown_ip';
};

const checkRateLimit = (clientId) => {
  const now = Date.now();
  if (!clientReqs.has(clientId)) {
    clientReqs.set(clientId, []);
  }

  const ts = clientReqs.get(clientId).filter(t => t > now - 60000);

  if (ts.length >= 12) {
    clientReqs.set(clientId, ts);
    return false;
  }

  ts.push(now);
  clientReqs.set(clientId, ts);
  return true;
};

const getUsage = async (kv, key) => {
  try {
    const val = await kv.get(key);
    return val ? parseInt(val, 10) : 0;
  } catch (e) {
    return 0;
  }
};

const putUsage = async (kv, key, val) => {
  try {
    const now = Date.now();
    const tomorrow = new Date();
    tomorrow.setUTCHours(24, 0, 0, 0);
    const ttl = Math.max(60, Math.ceil((tomorrow.getTime() - now) / 1000));
    await kv.put(key, val.toString(), { expirationTtl: ttl });
  } catch (e) {
  }
};

export default {
  async fetch(req, env) {
    const origin = req.headers.get('Origin') || '';
    const isAllowed = isAllowedOrigin(origin) && isBrowserRequest(req);

    const corsHeaders = {
      ...securityHeaders,
      'Access-Control-Allow-Origin': isAllowed ? origin : PROD_ORIGIN,
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-local-password',
      'Access-Control-Max-Age': '86400'
    };

    if (!isAllowed) {
      return new Response(JSON.stringify({ error: 'Access forbidden' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json', ...securityHeaders }
      });
    }

    if (req.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    if (!checkGlobalRateLimit()) {
      return new Response(JSON.stringify({ error: 'Global limit reached' }), {
        status: 429,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    if (isLocalhost(origin) && decodeURIComponent(req.headers.get('x-local-password') || '') !== env.LOCAL_PASSWORD) {
      return new Response(JSON.stringify({ error: 'Unauthorized local access' }), {
        status: 401,
        headers: corsHeaders
      });
    }

    const url = new URL(req.url);
    const path = url.pathname.replace(/\/+/g, '/');
    const ip = getClientId(req, env);
    const dateStr = new Date().toISOString().split('T')[0];
    const userKey = `user_${ip}_${dateStr}`;
    const globalKey = `global_${dateStr}`;

    const jsonRes = (data, s = 200) => {
      return new Response(JSON.stringify(data), {
        status: s,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    };

    const fetchJson = async (tgt) => {
      try {
        const response = await fetch(tgt);
        return jsonRes(await response.json());
      } catch (e) {
        return jsonRes({ error: e.message }, 500);
      }
    };

    if (path === '/api/stats') {
      if (!env.LIMITS_KV) {
        return jsonRes({ error: 'CRITICAL: LIMITS_KV database is not bound in Cloudflare Settings! Please follow step 6 in README.' }, 500);
      }
      const now = new Date();
      const nextMidnight = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));

      const globalUsed = await getUsage(env.LIMITS_KV, globalKey);
      const userUsed = await getUsage(env.LIMITS_KV, userKey);

      return jsonRes({
        global_used: globalUsed,
        global_limit: G_NET_LIMIT,
        user_used: userUsed,
        user_limit: USR_DAY_LIM,
        reset_time_utc: '00:00 UTC',
        hours_to_reset: Math.floor((nextMidnight.getTime() - now.getTime()) / 3600000)
      });
    }

    if (['/api/steam-resolve', '/api/steam-games', '/api/workers-ai'].includes(path)) {
      if (!checkRateLimit(ip)) {
        return jsonRes({ error: 'Too many requests' }, 429);
      }
    }

    if (path === '/api/steam-resolve') {
      const v = url.searchParams.get('vanityurl');
      if (!v) return jsonRes({ error: 'Missing vanityurl' }, 400);
      return fetchJson(`https://api.steampowered.com/ISteamUser/ResolveVanityURL/v0001/?key=${env.STEAM_API_KEY || ''}&vanityurl=${encodeURIComponent(v)}`);
    }

    if (path === '/api/steam-games') {
      const s = url.searchParams.get('steamid');
      const incFree = url.searchParams.get('include_free') === '1';
      if (!s) return jsonRes({ error: 'Missing steamid' }, 400);
      if (!/^\d{17}$/.test(s)) return jsonRes({ error: 'Invalid steamid' }, 400);
      const safeId = encodeURIComponent(s);
      let apiTgt = `https://api.steampowered.com/IPlayerService/GetOwnedGames/v0001/?key=${env.STEAM_API_KEY || ''}&steamid=${safeId}&include_appinfo=1&format=json`;
      if (incFree) apiTgt += '&include_played_free_games=1&include_free_sub=1';
      return fetchJson(apiTgt);
    }

    if (path === '/api/workers-ai' && req.method === 'POST') {

      let body;
      try {
        body = await req.json();
      } catch (e) {
        return jsonRes({ error: 'Invalid JSON body' }, 400);
      }

      const isLocal = isLocalhost(origin) && decodeURIComponent(req.headers.get('x-local-password') || '') === env.LOCAL_PASSWORD;

      if (!isLocal) {
        const token = body.turnstile_token;
        if (!token) return jsonRes({ error: 'Отсутствует токен безопасности (Turnstile)' }, 403);
        if (!env.TURNSTILE_SECRET) {
          return jsonRes({ error: 'CRITICAL: TURNSTILE_SECRET is not configured' }, 500);
        }

        const formData = new FormData();
        formData.append('secret', env.TURNSTILE_SECRET);
        formData.append('response', token);
        formData.append('remoteip', ip);

        try {
          const tsRes = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
            method: 'POST',
            body: formData
          });
          const tsOutcome = await tsRes.json();
          if (!tsOutcome.success) {
            return jsonRes({ error: 'Проверка безопасности не пройдена' }, 403);
          }
        } catch (e) {
          return jsonRes({ error: 'Ошибка верификации Turnstile' }, 500);
        }
      }

      if (!env.LIMITS_KV) {
        return jsonRes({ error: 'CRITICAL: LIMITS_KV database is not bound in Cloudflare Settings! Please follow step 6 in README.' }, 500);
      }
      const gameCount = body.game_count || 25;
      const categoryCount = body.category_count || 6;
      const tierCostAddition = categoryCount > 6 ? (categoryCount - 6) * 2 : 0;
      const cost = Math.ceil(gameCount / 25) + tierCostAddition;
      const userUsed = await getUsage(env.LIMITS_KV, userKey);
      const globalUsed = await getUsage(env.LIMITS_KV, globalKey);

      if (userUsed + cost > USR_DAY_LIM) {
        return jsonRes({ error: 'User daily limit reached' }, 429);
      }
      if (!env.AI) {
        return jsonRes({ error: 'Workers AI not configured' }, 503);
      }
      const model = body.model || '@cf/google/gemma-4-26b-a4b-it';
      if (!ALLOWED_MODELS.includes(model)) {
        return jsonRes({ error: 'Model not allowed' }, 403);
      }

      await putUsage(env.LIMITS_KV, userKey, userUsed + cost);
      await putUsage(env.LIMITS_KV, globalKey, globalUsed + cost);

      try {
        const runOpts = {
          messages: body.messages,
          chat_template_kwargs: { enable_thinking: false }
        };

        if (body.max_tokens) runOpts.max_tokens = body.max_tokens;
        if (body.response_format) runOpts.response_format = body.response_format;

        const r = await env.AI.run(model, runOpts);
        const c = r.choices?.[0]?.message?.content ||
          r.choices?.[0]?.message?.reasoning ||
          r.response ||
          r.result?.choices?.[0]?.message?.content ||
          r.result?.response ||
          (typeof r.result === 'string' ? r.result : null) ||
          JSON.stringify(r.result || r);

        return jsonRes({ choices: [{ message: { content: c } }] });
      } catch (e) {
        return jsonRes({ error: e.message }, 500);
      }
    }

    return jsonRes({ error: 'Endpoint not found' }, 404);
  }
};
