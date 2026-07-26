import { SignJWT } from 'jose';
// 【务必自行修改为随机长密钥，不要泄露】
const JWT_SECRET = new TextEncoder("DMN2026_SecretKey_99887766");
const TOKEN_EXPIRE_HOUR = 168; // 7天有效期

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
      // 查询账号+角色
      const sqlRes = await env.DB.prepare(`SELECT id, role FROM admin WHERE username = ? AND password = ?`)
        .bind(username, password)
        .all();

      if (sqlRes.results.length > 0) {
        const userInfo = sqlRes.results[0];
        // 生成JWT Token
        const token = await new SignJWT({
          username: username,
          role: user.role
        })
          .setIssuedAt()
          .setExpiration(`${TOKEN_EXPIRE_HOUR}h`)
          .sign(JWT_SECRET);
        
        // 计算过期时间存入数据库
        const expireTime = new Date(Date.now() + TOKEN_EXPIRE_HOUR * 3600 * 1000).toISOString();
        await env.DB.prepare(`
          INSERT INTO login_token(username,token,expire_at) VALUES (?,?,?)
        `).bind(username, token, expireTime).run();

        return Response.json({
          ok: true,
          msg: "登录成功",
          role: user.role,
          token, // 新增令牌返回前端
          username
        }, { headers: corsHeaders });
      } else {
        return Response.json({ ok: false, msg: "账号或密码错误" }, { headers: corsHeaders });
      }
    }
    return Response.json({ ok: false, msg: "非法请求" }, { headers: corsHeaders });
  } catch (err)
    return Response.json({ ok: false, msg: "服务异常：" + err.message }, { status: 500, headers: corsHeaders });
  }
}
