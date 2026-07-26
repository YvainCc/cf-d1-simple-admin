import { SignJWT } from 'jose';
const JWT_SECRET = new TextEncoder("DMN2026_SecretKey_99887766");
const TOKEN_EXPIRE_HOUR = 168; //7天免登

export async function onRequest({ request, env }) {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type,Authorization"
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
      // 查询admin账号表
      const sqlRes = await env.DB.prepare(`SELECT id, role FROM admin WHERE username = ? AND password = ?`)
        .bind(username, password)
        .all();

      if (sqlRes.results.length > 0) {
        const user = sqlRes.results[0];
        // 生成JWT
        const token = await new SignJWT({ username, role: user.role })
          .setIssuedAt()
          .setExpiration(`${TOKEN_EXPIRE_HOUR}h`)
          .sign(JWT_SECRET);
        // 存入token表
        const expireISO = new Date(Date.now() + TOKEN_EXPIRE_HOUR * 3600 * 1000).toISOString();
        await env.DB.prepare(`INSERT INTO login_token(username,token,expire_at) VALUES (?,?,?)`)
          .bind(username, token, expireISO).run();

        return Response.json({
          ok: true,
          msg: "登录成功",
          role: user.role,
          token,
          username
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
