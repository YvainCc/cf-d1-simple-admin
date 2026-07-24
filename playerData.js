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
    const url = new URL(request.url);
    const username = url.searchParams.get("username");
    const season = url.searchParams.get("season") || "all";

    if (!username) return Response.json({ok:false,msg:"缺少账号参数"},{headers:corsHeaders});

    let sql;
    let bindParams = [];
    if(season === "all"){
      // 全部比赛：汇总所有赛季
      sql = `
        SELECT 
          a.username,
          SUM(s.total_kill) AS total_kill,
          SUM(s.total_match) AS total_match,
          SUM(s.total_win) AS total_win,
          SUM(s.total_damage) AS total_damage,
          SUM(s.total_death) AS total_death,
          CASE WHEN SUM(s.total_death) > 0 THEN ROUND(SUM(s.total_kill)*1.0 / SUM(s.total_death),2) ELSE 0 END AS historical_total_kd
        FROM admin a
        LEFT JOIN player_stats s ON a.id = s.player_id
        WHERE a.username = ? AND a.active = 1
        GROUP BY a.id,a.username
      `;
      bindParams = [username];
    }else{
      // 指定赛季：精准过滤赛季
      sql = `
        SELECT 
          a.username,
          s.total_kill,
          s.total_match,
          s.total_win,
          s.total_damage,
          s.total_death,
          s.historical_total_kd
        FROM admin a
        INNER JOIN player_stats s ON a.id = s.player_id
        WHERE a.username = ? AND a.active = 1 AND s.season = ?
      `;
      bindParams = [username, season];
    }

    const stmt = env.DB.prepare(sql);
    const res = await stmt.bind(...bindParams).first();

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
