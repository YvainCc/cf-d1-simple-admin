import { jwtVerify } from 'jose';
const JWT_SECRET = new TextEncoder("DMN2026_SecretKey_99887766");
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,OPTIONS",
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
  if (request.method !== "GET") return Response.json({ ok:false,msg:"仅支持GET" },{status:405,headers:corsHeaders});
  let loginInfo;
  try {
    loginInfo = await verifyLogin(request);
  } catch (e) {
    return Response.json({ ok:false, msg:e.message },{status:401, headers:corsHeaders});
  }
  const url = new URL(request.url);
  const type = url.searchParams.get("type") || "kill";
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
  if(type === "damage"){
    const res = await env.DB.prepare(`
      SELECT a.username, s.total_damage, s.historical_total_kd, tm.team_id, t.team_name
      FROM admin a
      LEFT JOIN player_stats s ON a.id = s.player_id
      LEFT JOIN team_members tm ON a.id = tm.team_id
      LEFT JOIN teams t ON tm.team_id = t.id
      ORDER BY s.total_damage DESC
    `).all();
    return Response.json({ok:true,list:res.results},{headers:corsHeaders});
  }
  if(type === "win"){
    const res = await env.DB.prepare(`
      SELECT a.username, s.total_win, s.historical_total_kd, tm.team_id, t.team_name
      FROM admin a
      LEFT JOIN player_stats s ON a.id = s.player_id
      LEFT JOIN team_members tm ON a.id = tm.team_id
      LEFT JOIN teams t ON tm.team_id = t.id
      ORDER BY s.total_win DESC
    `).all();
    return Response.json({ok:true,list:res.results},{headers:corsHeaders});
  }
  if(type === "kd"){
    const res = await env.DB.prepare(`
      SELECT a.username, s.historical_total_kd, s.total_kill, tm.team_id, t.team_name
      FROM admin a
      LEFT JOIN player_stats s ON a.id = s.player_id
      LEFT JOIN team_members tm ON a.id = tm.team_id
      LEFT JOIN teams t ON tm.team_id = t.id
      ORDER BY s.historical_total_kd DESC
    `).all();
    return Response.json({ok:true,list:res.results},{headers:corsHeaders});
  }
  if(type === "teamkill"){
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
