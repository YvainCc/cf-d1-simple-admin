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

  const url = new URL(request.url);
  const username = url.searchParams.get("username");
  const season = url.searchParams.get("season") || "all";

  // 不再执行数据库查询，直接原样返回前端传入参数
  return Response.json({
    receive_username: username,
    receive_season: season
  }, { headers: corsHeaders });
}
