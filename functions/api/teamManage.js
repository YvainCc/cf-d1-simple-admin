export async function onRequest({ request, env }) {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
  };
  if (request.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  // GET：获取战队完整阵容、全队KD、首发总KD
  if (request.method === "GET") {
    const url = new URL(request.url);
    const teamId = url.searchParams.get("teamId");
    if (!teamId) return Response.json({ ok: false, msg: "缺少战队ID" }, { headers: corsHeaders });

    // 查询战队所有成员+KD数据
    const memberList = await env.DB.prepare(`
      SELECT a.id playerId, a.username, tm.member_role, s.historical_total_kd
      FROM team_members tm
      LEFT JOIN admin a ON tm.player_id = a.id
      LEFT JOIN player_stats s ON tm.player_id = s.player_id
      WHERE tm.team_id = ?
    `).bind(teamId).all();

    // 拆分首发、替补
    const allMembers = memberList.results;
    const starters = allMembers.filter(item => item.member_role === "starter");
    const subs = allMembers.filter(item => item.member_role === "substitute");
    const captain = allMembers.find(item => item.member_role === "captain");

    // 计算首发总KD
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

  // POST：队长修改队员身份（首发/替补切换）
  if (request.method === "POST") {
    const body = await request.json();
    const { teamId, operatePlayerId, newRole, operateUsername } = body;

    // 校验操作者是该战队队长
    const operatorInfo = await env.DB.prepare(`
      SELECT tm.member_role FROM team_members tm
      LEFT JOIN admin a ON tm.player_id = a.id
      WHERE tm.team_id = ? AND a.username = ?
    `).bind(teamId, operateUsername).first();
    if (!operatorInfo || operatorInfo.member_role !== "captain") {
      return Response.json({ ok: false, msg: "仅战队队长可修改阵容" }, { headers: corsHeaders });
    }

    // 限制首发最多4人
    if (newRole === "starter") {
      const starterCount = await env.DB.prepare(`
        SELECT COUNT(*) cnt FROM team_members WHERE team_id = ? AND member_role = "starter"
      `).bind(teamId).first();
      if (starterCount.cnt >= 4) return Response.json({ ok: false, msg: "首发位已满4人，无法新增首发" }, { headers: corsHeaders });
    }

    // 更新队员身份
    await env.DB.prepare(`
      UPDATE team_members SET member_role = ? WHERE team_id = ? AND player_id = ?
    `).bind(newRole, teamId, operatePlayerId).run();

    return Response.json({ ok: true, msg: "阵容修改成功" }, { headers: corsHeaders });
  }

  return Response.json({ ok: false, msg: "不支持该请求方式" }, { status: 405, headers: corsHeaders });
}