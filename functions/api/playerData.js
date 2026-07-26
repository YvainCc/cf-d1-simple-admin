const JWT_SECRET_RAW = "DMN2026_SecretKey_99887766";
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type,Authorization"
};

async function getSecretKey() {
  const encoder = new TextEncoder();
  const rawKey = encoder.encode(JWT_SECRET_RAW);
  return crypto.subtle.importKey("raw", rawKey, { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

async function verifyJWT(token) {
  const key = await getSecretKey();
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("未登录或Token格式错误");
  const [header, body, sig] = parts;
  const payload = JSON.parse(atob(body));
  const data = `${header}.${body}`;
  const sigBytes = Uint8Array.from(atob(sig), c => c.charCodeAt(0));
  const valid = await crypto.subtle.verify("HMAC", key, sigBytes, new TextEncoder().encode(data));
  if (!valid) throw new Error("登录凭证无效");
  const now = Math.floor(Date.now() / 1000);
  if (payload.exp < now) throw new Error("登录已过期，请重新登录");
  return payload;
}

function getBearerToken(req) {
  const auth = req.headers.get("Authorization") || "";
  return auth.startsWith("Bearer ") ? auth.slice(7) : null;
}

async function verifyLogin(req) {
  const token = getBearerToken(req);
  if (!token) throw new Error("未登录，请重新登录");
  return await verifyJWT(token);
}

export async function onRequest({ request, env }) {
  if (request.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  if (request.method !== "GET") {
    return Response.json({ ok: false, msg: "仅支持GET" }, { status: 405, headers: corsHeaders });
  }
  let loginInfo;
  try {
    loginInfo = await verifyLogin(request);
  } catch (e) {
    return Response.json({ ok: false, msg: e.message }, { status: 401, headers: corsHeaders });
  }
  const url = new URL(request.url);
  const username = url.searchParams.get("username");
  const season = url.searchParams.get("season") || "all";
  if (!username) {
    return Response.json({ ok: false, msg: "缺少username参数" }, { headers: corsHeaders });
  }
  // 普通队员只能查看自己
  if (loginInfo.role === "member" && username !== loginInfo.username) {
    return Response.json({ ok: false, msg: "无权查看他人数据" }, { headers: corsHeaders });
  }
  let sql, params;
  if (season === "all") {
    sql = `
      SELECT 
        IFNULL(SUM(s.total_kill),0) AS total_kill,
        IFNULL(SUM(s.total_match),0) AS total_match,
        IFNULL(SUM(s.total_win),0) AS total_win,
        IFNULL(SUM(s.total_damage),0) AS total_damage,
        IFNULL(SUM(s.total_death),0) AS total_death
      FROM admin a
      LEFT JOIN player_stats s ON a.id = s.player_id
      WHERE a.username = ? AND a.active = 1
    `;
    params = [username];
  } else {
    sql = `
      SELECT 
        IFNULL(s.total_kill,0) AS total_kill,
        IFNULL(s.total_match,0) AS total_match,
        IFNULL(s.total_win,0) AS total_win,
        IFNULL(s.total_damage,0) AS total_damage,
        IFNULL(s.total_death,0) AS total_death,
        IFNULL(s.historical_total_kd,0) AS historical_total_kd
      FROM admin a
      LEFT JOIN player_stats s ON a.id = s.player_id
      WHERE a.username = ? AND a.active = 1 AND s.season = ?
    `;
    params = [username, season];
  }
  const row = await env.DB.prepare(sql).bind(...params).first();
  const data = row || {
    total_kill:0,
    total_match:0,
    total_win:0,
    total_damage:0,
    total_death:0,
    historical_total_kd:0
  };
  data.username = username;
  if (season === "all") {
    const death = Number(data.total_death) || 0;
    const kill = Number(data.total_kill) || 0;
    data.historical_total_kd = death > 0 ? parseFloat((kill/death).toFixed(2)) : 0;
  }
  return Response.json({ ok:true, data }, { headers:corsHeaders });
}
