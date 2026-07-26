export async function onRequest({ request, env }) {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
  };
  if (request.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  // GET 接口：获取选手列表 / 报名审核列表
  if (request.method === "GET") {
    const url = new URL(request.url);
    const opt = url.searchParams.get("opt");
    // 获取全部参赛选手
    if(opt === "playerList"){
      const list = await env.DB.prepare(`
        SELECT a.id, a.username, s.total_kill, s.total_match, s.total_win, s.total_damage, s.historical_total_kd
        FROM admin a
        LEFT JOIN player_stats s ON a.id = s.player_id
        WHERE a.role = 'member'
      `).all();
      return Response.json({ok:true,list:list.results},{headers:corsHeaders});
    }
    // 获取所有战队赛季报名记录
    if(opt === "regList"){
      const list = await env.DB.prepare(`
        SELECT r.id, t.team_name, r.sum_kd_at_submit, r.luxury_tax, r.status, r.create_time
        FROM registrations r
        LEFT JOIN teams t ON r.team_id = t.id
      `).all();
      return Response.json({ok:true,list:list.results},{headers:corsHeaders});
    }
  }

  // POST 接口：修改选手KD / 审核战队报名
  if (request.method === "POST") {
    const body = await request.json();
    // 权限校验：仅管理员可操作
    const adminCheck = await env.DB.prepare(`
      SELECT role FROM admin WHERE username = ?
    `).bind(body.adminName).first();
    if(!adminCheck || adminCheck.role !== "admin"){
      return Response.json({ok:false,msg:"无管理员操作权限"},{headers:corsHeaders});
    }

    // 功能1：选手KD数据录入/编辑
    if(body.type === "editPlayerStat"){
      const {playerId, total_kill, total_match, total_win, total_damage, historical_total_kd} = body;
      // 判断是否已有数据，更新或新增
      const existStat = await env.DB.prepare(`SELECT id FROM player_stats WHERE player_id = ?`).bind(playerId).first();
      if(existStat){
        await env.DB.prepare(`
          UPDATE player_stats 
          SET total_kill=?,total_match=?,total_win=?,total_damage=?,historical_total_kd=? 
          WHERE player_id=?
        `).bind(total_kill, total_match, total_win, total_damage, historical_total_kd, playerId).run();
      }else{
        await env.DB.prepare(`
          INSERT INTO player_stats (player_id,total_kill,total_match,total_win,total_damage,historical_total_kd)
          VALUES (?,?,?,?,?,?)
        `).bind(playerId, total_kill, total_match, total_win, total_damage, historical_total_kd).run();
      }
      return Response.json({ok:true,msg:"选手数据修改保存成功"},{headers:corsHeaders});
    }

    // 功能2：战队报名审核（通过/驳回）
    if(body.type === "auditReg"){
      const {regId, newStatus} = body;
      await env.DB.prepare(`UPDATE registrations SET status = ? WHERE id = ?`).bind(newStatus, regId).run();
      return Response.json({ok:true,msg:"报名审核状态更新完成"},{headers:corsHeaders});
    }
  }

  return Response.json({ok:false,msg:"非法请求方式"},{status:405,headers:corsHeaders});
}
