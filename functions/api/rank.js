export async function onRequest({ request, env }) {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
  };
  if (request.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (request.method !== "GET") return Response.json({ ok:false,msg:"仅支持GET" },{status:405,headers:corsHeaders});

  const url = new URL(request.url);
  const type = url.searchParams.get("type") || "kill";

  // 分支1：战神榜（总击杀排序）
  if(type === "kill"){
    const res = await env.DB.prepare(`
      SELECT a.username, s.total_kill, s.historical_total_kd, tm.team_id, t.team_name
      FROM admin a
      LEFT JOIN player_stats s ON a.id = s.player_id
      LEFT JOIN team_members tm ON a.id = tm.player_id
      LEFT JOIN teams t ON tm.team_id = t.id
      ORDER BY s.total_kill DESC
    `).all();
    return Response.json({ok:true,list:res.results},{headers:corsHeaders});
  }
  // 分支2：伤害榜
  if(type === "dmg"){
    const res = await env.DB.prepare(`
      SELECT a.username, s.total_damage, s.historical_total_kd, tm.team_id, t.team_name
      FROM admin a
      LEFT JOIN player_stats s ON a.id = s.player_id
      LEFT JOIN team_members tm ON a.id = tm.player_id
      LEFT JOIN teams t ON tm.team_id = t.id
      ORDER BY s.total_damage DESC
    `).all();
    return Response.json({ok:true,list:res.results},{headers:corsHeaders});
  }
  // 分支3：吃鸡榜（总胜利场次）
  if(type === "win"){
    const res = await env.DB.prepare(`
      SELECT a.username, s.total_win, s.historical_total_kd, tm.team_id, t.team_name
      FROM admin a
      LEFT JOIN player_stats s ON a.id = s.player_id
      LEFT JOIN team_members tm ON a.id = tm.player_id
      LEFT JOIN teams t ON tm.team_id = t.id
      ORDER BY s.total_win DESC
    `).all();
    return Response.json({ok:true,list:res.results},{headers:corsHeaders});
  }
  // 分支4：KD榜
  if(type === "kd"){
    const res = await env.DB.prepare(`
      SELECT a.username, s.historical_total_kd, s.total_kill, tm.team_id, t.team_name
      FROM admin a
      LEFT JOIN player_stats s ON a.id = s.player_id
      LEFT JOIN team_members tm ON a.id = tm.player_id
      LEFT JOIN teams t ON tm.team_id = t.id
      ORDER BY s.historical_total_kd DESC
    `).all();
    return Response.json({ok:true,list:res.results},{headers:corsHeaders});
  }
  // 分支5：战队榜（全队总击杀）
  if(type === "team"){
    const res = await env.DB.prepare(`
      SELECT t.team_name, SUM(s.total_kill) totalTeamKill
      FROM teams t
      LEFT JOIN team_members tm ON t.id = tm.team_id
      LEFT JOIN player_stats s ON tm.player_id = s.player_id
      GROUP BY t.id,t.team_name
      ORDER BY totalTeamKill DESC
    `).all();
    return Response.json({ok:true,list:res.results},{headers:corsHeaders});
  }

  return Response.json({ok:false,msg:"榜单类型错误"},{headers:corsHeaders});
}