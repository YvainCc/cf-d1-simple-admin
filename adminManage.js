export async function onRequest({ request, env }) {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
  };
  if (request.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  // GET 1：获取所有选手数据（录入KD用）
  if (request.method === "GET") {
    const url = new URL(request.url);
    const opt = url.searchParams.get("opt");
    // 获取全部选手
    if(opt === "playerList"){
      const list = await env.DB.prepare(`
        SELECT a.id, a.username, s.total_kill, s.total_match, s.total_win, s.total_damage, s.historical_total_kd
        FROM admin a
        LEFT JOIN player_stats s ON a.id = s.player_id
        WHERE a.role = 'member'
      `).all();
      return Response.json({ok:true,list:list.results},{headers:corsHeaders});
    }
    // 获取所有战队报名记录（审核）
    if(opt === "regList"){
      const list = await env.DB.prepare(`
        SELECT r.id, t.team_name, r.sum_kd_at_submit, r.luxury_tax, r.status, r.create_time
        FROM registrations r
        LEFT JOIN teams t ON r.team_id = t.id
      `).all();
      return Response.json({ok:true,list:list.results},{headers:corsHeaders});
    }
  }

  // POST 两类操作：1.修改选手KD 2.审核报名状态
  if (request.method === "POST") {
    const body = await request.json();
    // 校验操作者是管理员账号
    const adminCheck = await env.DB.prepare(`
      SELECT role FROM admin WHERE username = ?
    `).bind(body.adminName).first();
    if(!adminCheck || adminCheck.role !== "admin"){
      return Response.json({ok:false,msg:"无管理员权限"},{headers:corsHeaders});
    }

    // 操作1：选手KD数据录入/修改
    if(body.type === "editPlayerStat"){
      const {playerId, total_kill, total_match, total_win, total_damage, historical_total_kd} = body;
      // 判断是否已有统计数据
      const exist = await env.DB.prepare(`SELECT id FROM player_stats WHERE player_id = ?`).bind(playerId).first();
      if(exist){
        await env.DB.prepare(`
          UPDATE player_stats SET total_kill=?,total_match=?,total_win=?,total_damage=?,historical_total_kd=? WHERE player_id=?
        `).bind(total_kill, total_match, total_win, total_damage, historical_total_kd, playerId).run();
      }else{
        await env.DB.prepare(`
          INSERT INTO player_stats (player_id,total_kill,total_match,total_win,total_damage,historical_total_kd)
          VALUES (?,?,?,?,?,?)
        `).bind(playerId, total_kill, total_match, total_win, total_damage, historical_total_kd).run();
      }
      return Response.json({ok:true,msg:"选手数据修改成功"},{headers:corsHeaders});
    }

    // 操作2：审核战队报名 通过/驳回
    if(body.type === "auditReg"){
      const {regId, newStatus} = body;
      await env.DB.prepare(`UPDATE registrations SET status = ? WHERE id = ?`).bind(newStatus, regId).run();
      return Response.json({ok:true,msg:"报名审核状态已更新"},{headers:corsHeaders});
    }
  }

  return Response.json({ok:false,msg:"非法请求"},{status:405,headers:corsHeaders});
}