import { corsHeaders, getAuthToken, verifyToken } from "./auth.js";
export async function onRequest({ request, env }) {
  if (request.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  if (request.method !== "POST") {
    return Response.json({ ok: false }, { headers: corsHeaders });
  }
  let loginInfo;
  try {
    const token = getAuthToken(request);
    loginInfo = await verifyToken(token);
  } catch (e) {
    return Response.json({ ok: false, msg: e.message }, { status: 401, headers: corsHeaders });
  }
  if (loginInfo.role !== "super") {
    return Response.json({ ok: false, msg: "仅超级管理员可执行数据库操作" }, { headers: corsHeaders });
  }
  const { sql } = await request.json();
  const lowSql = sql.toLowerCase();
  if ((lowSql.includes("delete") || lowSql.includes("update")) && !lowSql.includes("where")) {
    return Response.json({ ok: false, msg: "禁止无WHERE全表修改数据" }, { headers: corsHeaders });
  }
  try {
    let res;
    if (sql.trim().startsWith("select")) {
      res = await env.DB.prepare(sql).all();
      return Response.json({ ok: true, list: res.results, type: "query" }, { headers: corsHeaders });
    } else {
      await env.DB.exec(sql);
      return Response.json({ ok: true, type: "modify" }, { headers: corsHeaders });
    }
  } catch (err) {
    return Response.json({ ok: false, msg: err.message }, { headers: corsHeaders });
  }
}
