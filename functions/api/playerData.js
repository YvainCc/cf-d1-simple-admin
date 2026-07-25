// 全新重建
export async function onRequest({ request, env }) {
  try {
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type"
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }
    if (request.method !== "GET") {
      return Response.json({ ok: false, msg: "仅支持GET请求" }, { status: 405, headers: corsHeaders });
    }

    const url = new URL(request.url);
    const username = url.searchParams.get("username");
    const season = url.searchParams.get("season") || "all";

    if (!username) {
      return Response.json({ ok: false, msg: "缺少username参数" }, { headers: corsHeaders });
    }

    let sql, params;
    if (season === "all") {
      sql = `
        SELECT 
          IFNULL(SUM(s.total_kill),0) AS total_kill,
          IFNULL(SUM(s.total_match),0) AS total_match,
          IFNULL(SUM(s.total_win),0) AS total_win,
          IFNULL(SUM(s.total_damage),0) AS total_damage,
          IFNULL(SUM(s.total_death),0) AS total_death
        FROM admin a
        LEFT JOIN player_stats s ON a.id = s.player_id
        WHERE a.username = ? AND a.active = 1
      `;
      params = [username];
    } else {
      sql = `
        SELECT 
          IFNULL(s.total_kill,0) AS total_kill,
          IFNULL(s.total_match,0) AS total_match,
          IFNULL(s.total_win,0) AS total_win,
          IFNULL(s.total_damage,0) AS total_damage,
          IFNULL(s.total_death,0) AS total_death,
          IFNULL(s.historical_total_kd,0) AS historical_total_kd
        FROM admin a
        LEFT JOIN player_stats s ON a.id = s.player_id
        WHERE a.username = ? AND a.active = 1 AND s.season = ?
      `;
      params = [username, season];
    }

    const row = await env.DB.prepare(sql).bind(...params).first();
    const data = row || {
      total_kill:0,
      total_match:0,
      total_win:0,
      total_damage:0,
      total_death:0,
      historical_total_kd:0
    };
    data.username = username;

    if (season === "all") {
      const death = Number(data.total_death) || 0;
      const kill = Number(data.total_kill) || 0;
      data.historical_total_kd = death > 0 ? parseFloat((kill/death).toFixed(2)) : 0;
    }

    return Response.json({ ok:true, data }, { headers:corsHeaders });
  } catch (err) {
    return Response.json({
      ok: false,
      msg: "服务异常",
      error: err.message,
      stack: err.stack
    });
  }
}
