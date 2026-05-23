const G_NET_LIMIT = 1000;
const USR_DAY_LIM = 40;
const usrIpReqs = new Map();
let globalReqs = [];

const checkGlobalRateLimit = () => {
  const now = Date.now();
  globalReqs = globalReqs.filter(t => t > now - 60000);
  if (globalReqs.length >= 30) {
    return false;
  }
  globalReqs.push(now);
  return true;
};

const getIp = (req) => {
  return req.headers.get('cf-connecting-ip') || req.headers.get('x-forwarded-for') || '127.0.0.1';
};

const checkRateLimit = (ip) => {
  const now = Date.now();
  if (!usrIpReqs.has(ip)) {
    usrIpReqs.set(ip, []);
  }

  const ts = usrIpReqs.get(ip).filter(t => t > now - 60000);
  
  if (ts.length >= 12) {
    usrIpReqs.set(ip, ts);
    return false;
  }
  
  ts.push(now);
  usrIpReqs.set(ip, ts);
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
    const isAllowed = !origin || ['https://1nfys.github.io', 'http://localhost:3000'].includes(origin);
    
    const corsHeaders = {
      'Access-Control-Allow-Origin': origin && isAllowed ? origin : 'https://1nfys.github.io',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-local-password',
      'Access-Control-Max-Age': '86400'
    };

    if (!isAllowed) {
      return new Response(JSON.stringify({ error: 'Access forbidden' }), { 
        status: 403, 
        headers: { 'Content-Type': 'application/json' } 
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

    if (origin === 'http://localhost:3000' && decodeURIComponent(req.headers.get('x-local-password') || '') !== env.LOCAL_PASSWORD) {
      return new Response(JSON.stringify({ error: 'Unauthorized local access' }), { 
        status: 401, 
        headers: corsHeaders 
      });
    }

    const url = new URL(req.url);
    const path = url.pathname.replace(/\/+/g, '/');
    const ip = getIp(req);
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
      if (!s) return jsonRes({ error: 'Missing steamid' }, 400);
      return fetchJson(`https://api.steampowered.com/IPlayerService/GetOwnedGames/v0001/?key=${env.STEAM_API_KEY || ''}&steamid=${s}&include_appinfo=1&format=json`);
    }

    if (path === '/api/workers-ai' && req.method === 'POST') {

      let body;
      try {
        body = await req.json();
      } catch (e) {
        return jsonRes({ error: 'Invalid JSON body' }, 400);
      }

      if (!env.LIMITS_KV) {
        return jsonRes({ error: 'CRITICAL: LIMITS_KV database is not bound in Cloudflare Settings! Please follow step 6 in README.' }, 500);
      }
      const cost = Math.ceil((body.game_count || 25) / 25);
      const userUsed = await getUsage(env.LIMITS_KV, userKey);
      const globalUsed = await getUsage(env.LIMITS_KV, globalKey);
      
      if (userUsed + cost > USR_DAY_LIM) {
        return jsonRes({ error: 'User daily limit reached' }, 429);
      }
      if (!env.AI) {
        return jsonRes({ error: 'Workers AI not configured' }, 503);
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
        
        const r = await env.AI.run(body.model || '@cf/google/gemma-4-26b-a4b-it', runOpts);
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
