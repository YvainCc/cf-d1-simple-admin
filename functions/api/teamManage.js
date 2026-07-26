import { jwtVerify } from 'jose';
const JWT_SECRET = new TextEncoder("DMN2026_SecretKey_99887766");
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
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
  if (request.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  let loginInfo;
  try {
    loginInfo = await verifyLogin(request);
  } catch (e) {
    return Response.json({ ok:false, msg:e.message },{status:401, headers:corsHeaders});
  }
  // GET：获取战队完整阵容
  if (request.method === "GET") {
    const url = new URL(request.url);
    const teamId = url.searchParams.get("teamId");
    if (!teamId) return Response.json({ ok: false, msg: "缺少战队ID" }, { headers: corsHeaders });
    const memberList = await env.DB.prepare(`
      SELECT a.id playerId, a.username, tm.member_role, s.historical_total_kd
      FROM team_members tm
      LEFT JOIN admin a ON tm.player_id = a.id
      LEFT JOIN player_stats s ON tm.player_id = s.player_id
      WHERE tm.team_id = ?
    `).bind(teamId).all();
    const allMembers = member.results;
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
  // POST：队长切换首发替补
  if (request.method === "POST") {
    const body = await request.json();
    const { teamId, operatePlayerId, newRole } = body;
    // 校验操作者为本队队长
    const operatorInfo = await env.DB.prepare(`
      SELECT tm.member_role FROM team_members tm
      LEFT JOIN admin a ON tm.player_id = a.id
      WHERE tm.team_id = ? AND a.username = ?
    `).bind(teamId, loginInfo.username).first();
    if (!operatorInfo || operatorInfo.member_role !== "captain") {
      return Response.json({ ok: false, msg: "仅战队队长可修改阵容" }, { headers: corsHeaders });
    }
    if (newRole === "starter") {
      const starterCount = await env.DB.prepare(`
        SELECT COUNT(*) cnt FROM team_members WHERE team_id = ? AND member_role = "starter"
      `).bind(teamId).first();
      if (starterCount.cnt >= 4) return Response.json({ ok: false, msg: "首发位已满4人" }, { headers: corsHeaders });
    }
    await env.DB.prepare(`
      UPDATE team_members SET member_role = ? WHERE team_id = ? AND player_id = ?
    `).bind(newRole, teamId, operatePlayerId).run();
    return Response.json({ ok: true, msg: "阵容修改成功" }, { headers: corsHeaders });
  }
  return Response.json({ ok: false, msg: "不支持该请求方式" }, { status: 405, headers: corsHeaders });
}
