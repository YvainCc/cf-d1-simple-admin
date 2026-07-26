import { corsHeaders, getAuthToken, verifyToken } from "./auth.js";
export async function onRequest({ request, env }) {
  if (request.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  let loginInfo;
  try {
    const token = getAuthToken(request);
    loginInfo = await verifyToken(token);
  } catch (e) {
    return Response.json({ ok: false, msg: e.message }, { status: 401, headers: corsHeaders });
  }
  if (request.method === "GET") {
    const url = new URL(request.url);
    const teamId = url.searchParams.get("teamId");
    const seasonId = url.searchParams.get("seasonId") || 1;
    if (!teamId) return Response.json({ ok: false, msg: "缺少战队ID" }, { headers: corsHeaders });
    const captainCheck = await env.DB.prepare(`
      SELECT a.username FROM team_members tm
      LEFT JOIN admin a ON tm.player_id = a.id
      WHERE tm.team_id = ? AND tm.member_role = 'captain'
    `).bind(teamId).first();
    if(captainCheck?.username !== loginInfo.username && loginInfo.role !== "admin"){
      return Response.json({ok:false,msg:"仅队长/管理员查看报名"},{headers:corsHeaders,status:403});
    }
    const starterList = await env.DB.prepare(`
      SELECT s.historical_total_kd
      FROM team_members tm
      LEFT JOIN player_stats s ON tm.player_id = s.player_id
      WHERE tm.team_id = ? AND tm.member_role = 'starter'
    `).bind(teamId).all();
    let sumKD = 0;
    starterList.results.forEach(item => sumKD += Number(item.historical_total_kd || 0));
    const taxThreshold = 4.5;
    const luxuryTax = sumKD > taxThreshold ? Math.round((sumKD - taxThreshold) * 100) : 0;
    const regInfo = await env.DB.prepare(`
      SELECT id, status, luxury_tax FROM registrations
      WHERE team_id = ? AND season_id = ?
    `).bind(teamId, seasonId).first();
    return Response.json({
      ok: true,
      data: {
        sumStarterKD: sumKD.toFixed(2),
        taxThreshold: taxThreshold,
        luxuryTaxCost: luxuryTax,
        hasRegister: !!regInfo,
        registerStatus: regInfo?.status || null
      }
    }, { headers: corsHeaders });
  }
  if (request.method === "POST") {
    const body = await request.json();
    const { teamId, seasonId, captainUsername } = body;
    if(captainUsername !== loginInfo.username){
      return Response.json({ok:false,msg:"提交账号非登录队长"},{headers:corsHeaders,status:403});
    }
    if (!teamId || !captainUsername) return Response.json({ ok: false, msg: "参数缺失" }, { headers: corsHeaders });
    const captainCheck = await env.DB.prepare(`
      SELECT tm.member_role FROM team_members tm
      LEFT JOIN admin a ON tm.player_id = a.id
      WHERE tm.team_id = ? AND a.username = ?
    `).bind(teamId, captainUsername).first();
    if (!captainCheck || captainCheck.member_role !== "captain") {
      return Response.json({ ok: false, msg: "仅战队队长可提交报名" }, { headers: corsHeaders });
    }
    const existReg = await env.DB.prepare(`
      SELECT id FROM registrations WHERE team_id = ? AND season_id = ?
    `).bind(teamId, seasonId).first();
    if (existReg) return Response.json({ ok: false, msg: "该战队已提交本赛季报名，不可重复提交" }, { headers: corsHeaders });
    const starterList = await env.DB.prepare(`
      SELECT s.historical_total_kd
      FROM team_members tm
      LEFT JOIN player_stats s ON tm.player_id = s.player_id
      WHERE tm.team_id = ? AND tm.member_role = 'starter'
    `).bind(teamId).all();
    let sumKD = 0;
    starterList.results.forEach(item => sumKD += Number(item.historical_total_kd || 0));
    const luxuryTax = sumKD > 4.5 ? Math.round((sumKD - 4.5) * 100) : 0;
    await env.DB.prepare(`
      INSERT INTO registrations (team_id, season_id, sum_kd_at_submit, luxury_tax, status, create_time)
      VALUES (?, ?, ?, ?, 'pending', CURRENT_TIMESTAMP)
    `).bind(teamId, seasonId, sumKD, luxuryTax).run();
    return Response.json({ ok: true, msg: "赛季报名提交成功，等待管理员审核" }, { headers: corsHeaders });
  }
  return Response.json({ ok: false, msg: "不支持该请求方式" }, { status: 405, headers: corsHeaders });
}
