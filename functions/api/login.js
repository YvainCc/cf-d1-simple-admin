const JWT_SECRET_RAW = "DMN2026_SecretKey_99887766";
async function getSecretKey() {
  const encoder = new TextEncoder();
  const rawKey = encoder.encode(JWT_SECRET_RAW);
  return crypto.subtle.importKey("raw", rawKey, { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}
async function signJWT(payload) {
  const key = await getSecretKey();
  const header = btoa(JSON.stringify({ alg:"HS256", typ:"JWT" }));
  const body = btoa(JSON.stringify(payload));
  const data = `${header}.${body}`;
  const sigBuf = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  const sig = btoa(String.fromCharCode(...new Uint8Array(sigBuf)));
  return `${header}.${body}.${sig}`;
}

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
      const sqlRes = await env.DB.prepare(`SELECT id, role FROM admin WHERE username = ? AND password = ?`)
        .bind(username, password)
        .all();

      if (sqlRes.results.length > 0) {
        const user = sqlRes.results[0];
        // 生成JWT，有效期1天
        const token = await signJWT({
          username: username,
          role: user.role,
          exp: Math.floor(Date.now() / 1000) + 86400
        });
        return Response.json({
          ok: true,
          msg: "登录成功",
          role: user.role,
          token: token
        }, { headers: corsHeaders });
      } else {
        return Response.json({ ok: false, msg: "账号或密码错误" }, { headers: corsHeaders });
      }
    }
    return Response.json({ ok: false, msg: "非法请求" }, { headers: corsHeaders });
  } catch (err) {
    return Response.json({ ok: false, msg: "服务异常：" + err.message }, { status: 500, headers: corsHeaders });
  }
}
