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
  if (loginInfo.role !== "admin" && loginInfo.role !== "super") {
    return Response.json({ ok: false, msg: "仅管理员可执行赛季聚合" }, { headers: corsHeaders });
  }
  const url = new URL(request.url);
  const season = url.searchParams.get("season");
  if (!season) {
    return Response.json({ ok: false, msg: "请传入赛季参数如S6" }, { headers: corsHeaders });
  }
  await env.DB.prepare(`DELETE FROM player_stats WHERE season = ?`).bind(season).run();
  const aggData = await env.DB.prepare(`
    SELECT pm.player_id,a.username,
    SUM(pm.kills) total_kill,
    SUM(pm.deaths) total_death,
    SUM(pm.assists) total_assist,
    SUM(pm.damage) total_damage,
    SUM(pm.win) total_win,
    COUNT(pm.id) total_match,
    ROUND(SUM(pm.kills)*1.0 / MAX(COUNT(pm.id),1),2) historical_total_kd
    FROM player_match pm
    LEFT JOIN admin a ON pm.player_id = a.id
    WHERE pm.season = ?
    GROUP BY pm.player_id,a.username
  `).bind(season).all();
  const insertStmt = env.DB.prepare(`
    INSERT INTO player_stats(player_id,season,total_kill,total_death,total_assist,total_damage,total_win,total_match,historical_total_kd)
    VALUES (?,?,?,?,?,?,?,?,?)
  `);
  for (const row of aggData.results) {
    await insert.bind(
      row.player_id,
      season,
      row.total_kill,
      row.total_death,
      row.total_assist,
      row.total_damage,
      row.total_win,
      row.total_match,
      row.historical_total_kd
    ).run();
  }
  return Response.json({ ok: true, msg: `${season}赛季聚合完成，共${aggData.results.length}名选手数据` }, { headers: corsHeaders });
}
