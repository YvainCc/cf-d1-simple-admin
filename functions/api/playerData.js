import { jwtVerify } from 'jose';
const JWT_SECRET = new TextEncoder("DMN2026_SecretKey_99887766");
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type,Authorization"
};
function getBearerToken(req) {
  const auth = req.headers.get("Authorization") || "";
  return auth.startsWith("Bearer ") ? auth.slice(7) : null;
}
async function verifyLogin(req) {
  const token = getBearerToken(req);
  if (!token) throw new Error("未登录，请重新登录");
  const { payload } = await jwtVerify(token);
  return payload;
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
    return Response.json({ ok:false, msg:e.message },{status:401, headers:corsHeaders});
  }
  const url = new URL(request.url);
  const username = url.searchParams.get("username");
  const season = url.searchParams.get("season") || "all";
  if (!username) {
    return Response.json({ ok: false, msg: "缺少username参数" }, { headers: corsHeaders });
  }
  // 普通队员只能查看自己
  if(loginInfo.role === "member" && username !== loginInfo.username){
    return Response.json({ok:false,msg:"无权查看他人数据"},{headers:corsHeaders});
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
