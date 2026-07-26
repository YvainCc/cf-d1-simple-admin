import { corsHeaders, getAuthToken, verifyToken } from "./auth.js";
export async function onRequest({ request, env }) {
  if (request.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
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
    if (!teamId) return Response.json({ ok: false, msg: "缺少战队ID" }, { headers: corsHeaders });
    const captainCheck = await env.DB.prepare(`
      SELECT a.username FROM team_members tm
      LEFT JOIN admin a ON tm.player_id = a.id
      WHERE tm.team_id = ? AND tm.member_role = 'captain'
    `).bind(teamId).first();
    if(captainCheck?.username !== loginInfo.username && loginInfo.role !== "admin" && loginInfo.role !== "super"){
      return Response.json({ok:false,msg:"仅队长/管理员可查看阵容"},{headers:corsHeaders,status:403});
    }
    const memberList = await env.DB.prepare(`
      SELECT a.id playerId, a.username, tm.member_role, s.historical_total_kd
      FROM team_members tm
      LEFT JOIN admin a ON tm.player_id = a.id
      LEFT JOIN player_stats s ON tm.player_id = s.player_id
      WHERE tm.team_id = ?
    `).bind(teamId).all();
    const allMembers = memberList.results;
    const starters = allMembers.filter(item => item.member_role === "starter");
    const subs = allMembers.filter(item => item.member_role === "substitute");
    const captain = allMembers.find(item => item.member_role === "captain");
    let sumKd = 0;
    starters.forEach(item => sumKd += Number(item.historical_total_kd || 0));
    const needTax = sumKd > 4.5;
    return Response.json({
      ok: true,
      teamData: {
        captain,
        starters,
        substitute: subs,
        sumStarterKD: sumKd.toFixed(2),
        needLuxuryTax: needTax
      }
    }, { headers: corsHeaders });
  }
  if (request.method === "POST") {
    const body = await request.json();
    const { teamId, operatePlayerId, newRole, operateUsername } = body;
    if(operateUsername !== loginInfo.username){
      return Response.json({ok:false,msg:"操作账号与登录账号不一致"},{headers:corsHeaders,status:403});
    }
    const operatorInfo = await env.DB.prepare(`
      SELECT tm.member_role FROM team_members tm
      LEFT JOIN admin a ON tm.player_id = a.id
      WHERE tm.team_id = ? AND a.username = ?
    `).bind(teamId, operateUsername).first();
    if (!operatorInfo || operatorInfo.member_role !== "captain") {
      return Response.json({ ok: false, msg: "仅战队队长可修改阵容" }, { headers: corsHeaders });
    }
    if (newRole === "starter") {
      const starterCount = await env.DB.prepare(`
        SELECT COUNT(*) cnt FROM team_members WHERE team_id = ? AND member_role = "starter"
      `).bind(teamId).first();
      if (starterCount.cnt >= 4) return Response.json({ ok: false, msg: "首发位已满4人，无法新增首发" }, { headers: corsHeaders });
    }
    await env.DB.prepare(`
      UPDATE team_members SET member_role = ? WHERE team_id = ? AND player_id = ?
    `).bind(newRole, teamId, operatePlayerId).run();
    return Response.json({ ok: true, msg: "阵容修改成功" }, { headers: corsHeaders });
  }
  return Response.json({ ok: false, msg: "不支持该请求方式" }, { status: 405, headers: corsHeaders });
}
