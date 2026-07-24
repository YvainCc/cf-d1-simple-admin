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
      // 全部赛季：正常汇总所有赛季数据
      sql = `
        SELECT 
          SUM(s.total_kill) AS total_kill,
          SUM(s.total_match) AS total_match,
          SUM(s.total_win) AS total_win,
          SUM(s.total_damage) AS total_damage,
          SUM(s.total_death) AS total_death,
          CASE WHEN SUM(s.total_death) > 0 THEN ROUND(SUM(s.total_kill)*1.0 / SUM(s.total_death),2) ELSE 0 END AS historical_total_kd
        FROM admin a
        LEFT JOIN player_stats s ON a.id = s.player_id
        WHERE a.username = ? AND a.active = 1
      `;
      bindParams = [username];
    }else{
      // 指定赛季：精准单赛季查询
      sql = `
        SELECT 
          s.total_kill,
          s.total_match,
          s.total_win,
          s.total_damage,
          s.total_death,
          s.historical_total_kd
        FROM admin a
        LEFT JOIN player_stats s ON a.id = s.player_id
        WHERE a.username = ? AND a.active = 1 AND s.season = ?
      `;
      bindParams = [username, season];
    }

    const row = await env.DB.prepare(sql).bind(...bindParams).first();

    const data = row ?? {
      total_kill:0,
      total_match:0,
      historical_total_kd:0,
      total_win:0,
      total_damage:0
    };
    data.username = username;

    return Response.json({ok:true, data}, {headers:corsHeaders});
  } catch (err) {
    return Response.json({ok:false,msg:"数据读取失败："+err.message},{status:500,headers:corsHeaders})
  }
}
