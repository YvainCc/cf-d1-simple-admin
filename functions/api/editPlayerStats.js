import { corsHeaders, getAuthToken, verifyToken } from "./auth.js";
export async function onRequest({ request, env }) {
  if (request.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  if (request.method !== "POST") {
    return Response.json({ ok: false, msg: "仅支持POST提交" }, { status:405, headers:corsHeaders });
  }
  let loginInfo;
  try {
    const token = getAuthToken(request);
    loginInfo = await verifyToken(token);
    if(loginInfo.role !== "admin" && loginInfo.role !== "super"){
      return Response.json({ok:false,msg:"权限不足"},{headers:corsHeaders,status:403});
    }
  }catch(e){
    return Response.json({ok:false,msg:e.message},{status:401,headers:corsHeaders});
  }
  try {
    const body = await request.json();
    const { username, total_kill, total_match, total_win, total_damage, historical_total_kd, remark } = body;
    const playerInfo = await env.DB.prepare(`SELECT id FROM admin WHERE username = ?`).bind(username).first();
    if (!playerInfo) return Response.json({ok:false,msg:"该选手账号不存在"},{headers:corsHeaders});
    const playerId = playerInfo.id;
    const statInfo = await env.DB.prepare(`SELECT id FROM player_stats WHERE player_id = ?`).bind(playerId).first();
    if(statInfo){
      await env.DB.prepare(`
        UPDATE player_stats 
        SET total_kill = ?, total_match = ?, total_win = ?, total_damage = ?, historical_total_kd = ?
        WHERE playerId = ?
      `).bind(total_kill, total_match, total_win, total_damage, historical_total_kd, playerId).run();
    }else{
      await env.DB.prepare(`
        INSERT INTO player_stats (player_id, total_kill, total_match, total_win, total_damage, historical_total_kd)
        VALUES (?,?,?,?,?,?)
      `).bind(playerId, total_kill, total_match, total_win, total_damage).run();
    }
    return Response.json({ok:true,msg:"选手数据修改成功"},{headers:corsHeaders})
  } catch (err) {
    return Response.json({ok:false,msg:"操作失败："+err.message},{status:500,headers:corsHeaders})
  }
}
