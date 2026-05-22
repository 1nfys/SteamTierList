let gNetReqs = 0;
const G_NET_LIMIT = 1000;
const usrLim = new Map();
let curDay = new Date().getUTCDate();
const USR_DAY_LIM = 20;
const usrIpReqs = new Map();

const getIp = (req) => {
  return req.headers.get('cf-connecting-ip') || req.headers.get('x-forwarded-for') || '127.0.0.1';
};

const checkRateLimit = (ip) => {
  const now = Date.now();
  if (!usrIpReqs.has(ip)) {
    usrIpReqs.set(ip, []);
  }

  const ts = usrIpReqs.get(ip).filter(t => t > now - 60000);
  
  if (ts.length >= 3) {
    usrIpReqs.set(ip, ts);
    return false;
  }
  
  ts.push(now);
  usrIpReqs.set(ip, ts);
  return true;
};

const chkRstLims = () => {
  const now = new Date();
  if (now.getUTCDate() !== curDay) {
    usrLim.clear();
    curDay = now.getUTCDate();
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

    if (origin === 'http://localhost:3000' && decodeURIComponent(req.headers.get('x-local-password') || '') !== env.LOCAL_PASSWORD) {
      return new Response(JSON.stringify({ error: 'Unauthorized local access' }), { 
        status: 401, 
        headers: corsHeaders 
      });
    }

    const url = new URL(req.url);
    const path = url.pathname.replace(/\/+/g, '/');
    const ip = getIp(req);

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
      chkRstLims();
      const now = new Date();
      const nextMidnight = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
      
      return jsonRes({
        global_used: gNetReqs,
        global_limit: G_NET_LIMIT,
        user_used: usrLim.get(ip) || 0,
        user_limit: USR_DAY_LIM,
        reset_time_utc: '00:00 UTC',
        hours_to_reset: Math.floor((nextMidnight.getTime() - now.getTime()) / 3600000)
      });
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

    if ((path === '/api/workers-ai' || path === '/api/openrouter') && req.method === 'POST') {
      if (!checkRateLimit(ip)) {
        return jsonRes({ error: 'Too many requests' }, 429);
      }

      let body;
      try {
        body = await req.json();
      } catch (e) {
        return jsonRes({ error: 'Invalid JSON body' }, 400);
      }

      if (path === '/api/workers-ai') {
        chkRstLims();
        const cost = Math.ceil((body.game_count || 25) / 25);
        const used = usrLim.get(ip) || 0;
        
        if (used + cost > USR_DAY_LIM) {
          return jsonRes({ error: 'User daily limit reached' }, 429);
        }
        if (!env.AI) {
          return jsonRes({ error: 'Workers AI not configured' }, 503);
        }
        
        usrLim.set(ip, used + cost);
        gNetReqs += cost;

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

      if (path === '/api/openrouter') {
        try {
          const r = await fetch('https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST',
            headers: { 
              'Content-Type': 'application/json', 
              'Authorization': `Bearer ${env.OPENROUTER_API_KEY || ''}`, 
              'HTTP-Referer': url.origin, 
              'X-Title': 'Steam Tier List Proxy' 
            },
            body: JSON.stringify(body)
          });
          return jsonRes(await r.json(), r.status);
        } catch (e) {
          return jsonRes({ error: e.message }, 500);
        }
      }
    }

    return jsonRes({ error: 'Endpoint not found' }, 404);
  }
};
