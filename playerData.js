export async function onRequest({ request, env }) {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
  };

  if (request.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  if (request.method !== "GET") {
    return Response.json({ ok: false, msg: "仅支持GET请求" }, { status:405, headers:corsHeaders });
  }

  try {
    // 读取url参数 username，后续登录后前端携带当前账号
    const url = new URL(request.url);
    const username = url.searchParams.get("username");
    if (!username) return Response.json({ok:false,msg:"缺少账号参数"},{headers:corsHeaders});

    // 查询选手基础信息+生涯数据
    const res = await env.DB.prepare(`
      SELECT a.username, s.total_kill, s.total_match, s.historical_total_kd, s.total_win, s.total_damage
      FROM admin a
      LEFT JOIN player_stats s ON a.id = s.player_id
      WHERE a.username = ?
    `).bind(username).first();

    return Response.json({
      ok:true,
      data: res || {
        username:username,
        total_kill:0,
        total_match:0,
        historical_total_kd:0,
        total_win:0,
        total_damage:0
      }
    },{headers:corsHeaders})
  } catch (err) {
    return Response.json({ok:false,msg:"数据读取失败："+err.message},{status:500,headers:corsHeaders})
  }
}