const JWT_SECRET_RAW = "DMN2026_SecretKey_99887766";
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
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
  if (request.method !== "POST") {
    return Response.json({ ok: false, msg: "仅支持POST提交" }, { status:405, headers:corsHeaders });
  }

  // 登录鉴权
  let loginInfo;
  try {
    loginInfo = await verifyLogin(request);
  } catch (e) {
    return Response.json({ ok: false, msg: e.message }, { status: 401, headers: corsHeaders });
  }
  // 限制仅管理员可操作
  if (loginInfo.role !== "admin" && loginInfo.role !== "super") {
    return Response.json({ ok: false, msg: "无权限修改选手数据" }, { headers: corsHeaders });
  }

  try {
    const body = await request.json();
    const { username, total_kill, total_match, total_win, total_damage, historical_total_kd, remark, adminName } = body;

    // 1、查询选手id
    const playerInfo = await env.DB.prepare(`SELECT id FROM admin WHERE username = ?`).bind(username).first();
    if (!playerInfo) return Response.json({ok:false,msg:"该选手账号不存在"},{headers:corsHeaders});
    const playerId = playerInfo.id;

    // 2、判断该选手是否已有统计数据，存在则更新，不存在则新增
    const statInfo = await env.DB.prepare(`SELECT id FROM player_stats WHERE player_id = ?`).bind(playerId).first();
    if(statInfo){
      await env.DB.prepare(`
        UPDATE player_stats 
        SET total_kill = ?, total_match = ?, total_win = ?, total_damage = ?, historical_total_kd = ?
        WHERE player_id = ?
      `).bind(total_kill, total_match, total_win, total_damage, historical_total_kd, playerId).run();
    }else{
      await env.DB.prepare(`
        INSERT INTO player_stats (player_id, total_kill, total_match, total_win, total_damage, historical_total_kd)
        VALUES (?,?,?,?,?,?)
      `).bind(playerId, total_kill, total_match, total_win, total_damage, historical_total_kd).run();
    }

    // 3、写入审计日志，留存管理员修改记录
    const adminInfo = await env.DB.prepare(`SELECT id FROM admin WHERE username = ?`).bind(adminName).first();
    if(adminInfo){
      await env.DB.prepare(`
        INSERT INTO audit_logs (admin_id, operate_type, target_type, target_id, detail)
        VALUES (?, '修改选手KD数据', 'player', ?, ?)
      `).bind(adminInfo.id, playerId, JSON.stringify(body)).run();
    }

    return Response.json({ok:true,msg:"选手数据修改成功"},{headers:corsHeaders});
  } catch (err) {
    return Response.json({ok:false,msg:"操作失败："+err.message},{status:500,headers:corsHeaders});
  }
}
