export async function onRequest({ request, env }) {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
  };
  if (request.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  if (request.method !== "POST") {
    return Response.json({ ok: false, msg: "仅支持POST登录请求" }, { status: 405, headers: corsHeaders });
  }
  try {
    const reqBody = await request.json();
    const { action, username, password } = reqBody;
    if (action === "login") {
      const sqlRes = await env.DB.prepare(`SELECT id FROM admin WHERE username = ? AND password = ?`)
        .bind(username, password)
        .all();
      if (sqlRes.results.length > 0) {
        return Response.json({ ok: true, msg: "登录成功" }, { headers: corsHeaders });
      } else {
        return Response.json({ ok: false, msg: "账号或密码错误" }, { headers: corsHeaders });
      }
    }
    return Response.json({ ok: false, msg: "非法请求" }, { headers: corsHeaders });
  } catch (err) {
    return Response.json({ ok: false, msg: "服务异常：" + err.message }, { status: 500, headers: corsHeaders });
  }
}

const sqlRes = await env.DB.prepare(`SELECT id,role FROM admin WHERE username = ? AND password = ?`)
.bind(username, password)
.all();
if (sqlRes.results.length > 0) {
  // 返回角色给前端
  return Response.json({ ok: true, msg: "登录成功", role: sqlRes.results[0].role }, { headers: corsHeaders });
}
if(res.ok){
  if(res.role === "admin"){
    window.location.href = "dashboard.html"
  }else{
    window.location.href = "member.html"
  }
}