import { corsHeaders, getAuthToken, verifyToken } from "./auth.js";

export async function onRequest({ request, env }) {
  if (request.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  if (request.method !== "POST") {
    return Response.json({ ok: false, msg: "仅支持POST" }, { status: 405, headers: corsHeaders });
  }

  // 权限校验：只允许 super 超管
  let loginInfo;
  try {
    const token = getAuthToken(request);
    loginInfo = await verifyToken(token);
    if (loginInfo.role !== "super") {
      return Response.json({ ok: false, msg: "权限不足，仅超级管理员可导入对局数据" }, { status: 403, headers: corsHeaders });
    }
  } catch (e) {
    return Response.json({ ok: false, msg: e.message }, { status: 401, headers: corsHeaders });
  }

  try {
    const { sqlList } = await request.json();
    if (!Array.isArray(sqlList) || sqlList.length === 0) {
      return Response.json({ ok: false, msg: "无导入语句" }, { headers: corsHeaders });
    }
    // 循环分批执行
    for (const sql of sqlList) {
      await env.DB.exec(sql);
    }
    return Response.json({ ok: true, msg: `成功导入${sqlList.length}批对局记录` }, { headers: corsHeaders });
  } catch (err) {
    return Response.json({ ok: false, msg: "导入失败：" + err.message }, { status: 500, headers: corsHeaders });
  }
}
