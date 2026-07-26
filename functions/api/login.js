import { createToken, corsHeaders } from "./auth.js";

export async function onRequest({ request, env }) {
  // 处理跨域预检OPTIONS
  if (request.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  // 只允许POST
  if (request.method !== "POST") {
    return Response.json({ ok: false, msg: "仅支持POST" }, { status: 405, headers: corsHeaders });
  }
  try {
    const body = await request.json();
    const { action, username, password } = body;
    if (action !== "login") throw new Error("非法操作");
    // 查询账号
    const res = await env.DB.prepare(`SELECT username,role FROM admin WHERE username=? AND password=?`)
      .bind(username, password)
      .first();
    if (!res) {
      return Response.json({ ok: false, msg: "账号或密码错误" }, { headers: corsHeaders });
    }
    const token = await createToken(username, res.role);
    return Response.json({
      ok: true,
      msg: "登录成功",
      role: res.role,
      token: token
    }, { headers: corsHeaders });
  } catch (err) {
    return Response.json({ ok: false, msg: err.message }, { status: 500, headers: corsHeaders });
  }
}
