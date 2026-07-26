import { corsHeaders, getAuthToken, verifyToken } from "./auth.js";
export async function onRequest({ request, env }) {
  if (request.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  let loginUser;
  try {
    const token = getAuthToken(request);
    loginUser = await verifyToken(token);
    if (loginUser.role !== "admin" && loginUser.role !== "super") {
      return Response.json({ ok: false, msg: "仅管理员可操作" }, { status: 403, headers: corsHeaders });
    }
  } catch (e) {
    return Response.json({ ok: false, msg: e.message }, { status: 401, headers: corsHeaders });
  }
  if (request.method === "GET") {
    const url = new URL(request.url);
    const opt = url.searchParams.get("opt");
    if(opt === "playerList"){
      const list = await env.DB.prepare(`
        SELECT a.id, a.username, s.total_kill, s.total_match, s.total_win, s.total_damage, s.historical_total_kd
        FROM admin a
        LEFT JOIN player_stats s ON a.id = s.player_id
        WHERE a.role = 'member'
      `).all();
      return Response.json({ok:true,list:list.results},{headers:corsHeaders});
    }
    if(opt === "regList"){
      const list = await env.DB.prepare(`
        SELECT r.id, t.team_name, r.sum_kd_at_submit, r.luxury_tax, r.status, r.create_time
        FROM registrations r
        LEFT JOIN teams t ON r.team_id
      `).all();
      return Response.json({ok:true,list:list.results},{headers:corsHeaders});
    }
  }
  if (request.method === "POST") {
    const body = await request.json();
    if(body.type === "editPlayerStat"){
      const {playerId, total_kill, total_match, total_win, total_damage, historical_total_kd} = body;
      const existStat = await env.DB.prepare(`SELECT id FROM player_stats WHERE player_id = ?`).bind(playerId).first();
      if(existStat){
        await env.DB.prepare(`
          UPDATE player_stats 
          SET total_kill = ?, total_match = ?, total_win = ?, total_damage = ?, historical_total_kd = ?
          WHERE player_id = ?
        `).bind(total_kill, total_match, total_win, total_damage, historical_total_kd, playerId).run();
      }else{
        await env.DB.prepare(`
          INSERT INTO player_stats (player_id, total_kill, total_match, total_win, total_damage, historical_total_kd)
          VALUES (?,?,?,?,?,?)
        `).bind(playerId, total_kill, total_match, total_win, total_damage).run();
      }
      return Response.json({ok:true,msg:"选手数据修改成功"},{headers:corsHeaders});
    }
    if(body.type === "auditReg"){
      const {regId, newStatus} = body;
      await env.DB.prepare(`UPDATE registrations SET status = ? WHERE id = ?`).bind(newStatus, regId).run();
      return Response.json({ok:true,msg:"审核完成"},{headers:corsHeaders});
    }
  }
  return Response.json({ ok: false, msg: "不支持该请求方式" }, { status: 405, headers: corsHeaders });
}
