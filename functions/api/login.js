const JWT_SECRET_RAW = "DMN2026_SecretKey_99887766";
const TOKEN_EXPIRE_HOUR = 168;
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type,Authorization"
};

async function getSecretKey() {
  const encoder = new TextEncoder();
  const rawKey = encoder.encode(JWT_SECRET_RAW);
  return crypto.subtle.importKey("raw", rawKey, { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

async function createJWT(payload, hours) {
  const key = await getSecretKey();
  const now = Math.floor(Date.now() / 1000);
  const exp = now + hours * 3600;
  const header = btoa(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = btoa(JSON.stringify({ ...payload, iat: now, exp }));
  const signRaw = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${header}.${body}`));
  const signature = btoa(String.fromCharCode(...new Uint8Array(signRaw)));
  return `${header}.${body}.${signature}`;
}

async function verifyJWT(token) {
  const key = await getSecretKey();
  const [header, body, sig] = token.split(".");
  if (!header || !body || !sig) throw new Error("Token格式错误");
  const data = `${header}.${body}`;
  const sigBytes = Uint8Array.from(atob(sig), c => c.charCodeAt(0));
  const isValid = await crypto.subtle.verify("HMAC", key, sigBytes, new TextEncoder().encode(data));
  if (!isValid) throw new Error("Token非法");
  const payload = JSON.parse(atob(body));
  const now = Math.floor(Date.now() / 1000);
  if (payload.exp < now) throw new Error("Token已过期");
  return payload;
}

export async function onRequest({ request, env }) {
  if (request.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  if (request.method !== "POST") {
    return Response.json({ ok: false, msg: "仅支持POST登录" }, { status: 405, headers: corsHeaders });
  }
  try {
    const reqBody = await request.json();
    const { action, username, password } = reqBody;
    if (action !== "login") {
      return Response.json({ ok: false, msg: "非法请求" }, { headers: corsHeaders });
    }
    const sqlRes = await env.DB.prepare(`SELECT id, role FROM admin WHERE username = ? AND password = ?`)
      .bind(username, password).all();
    if (sqlRes.results.length === 0) {
      return Response.json({ ok: false, msg: "账号或密码错误" }, { headers: corsHeaders });
    }
    const user = sqlRes.results[0];
    const token = await createJWT({ username, role: user.role }, TOKEN_EXPIRE_HOUR);
    const expireISO = new Date(Date.now() + TOKEN_EXPIRE_HOUR * 3600 * 1000).toISOString();
    await env.DB.prepare(`INSERT INTO login_token(username,token,expire_at) VALUES (?,?,?)`)
      .bind(username, token).run();
    return Response.json({
      ok: true,
      msg: "登录成功",
      token,
      role: user.role,
      username
    }, { headers: corsHeaders });
  } catch (err) {
    return Response.json({ ok: false, msg: "服务异常：" + err.message }, { status: 500, headers: corsHeaders });
  }
}
