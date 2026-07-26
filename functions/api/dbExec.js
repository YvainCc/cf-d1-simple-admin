const JWT_SECRET_RAW = "DMN2026_SecretKey_99887766";
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

async function verifyJWT(token) {
  const key = await getSecretKey();
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("未登录或Token格式错误");
  const [header, body, sig] = parts;
  const payload = JSON.parse(atob(body));
  const data = `${header}.${body}`;
  const sigBytes = Uint8Array.from(atob(sig), c => c.charCodeAt(0));
  const valid = await crypto.subtle.verify("HMAC", key, sigBytes, new TextEncoder().encode(data));
  if (!valid) throw new Error("登录凭证无效");
  const now = Math.floor(Date.now() / 1000);
  if (payload.exp < now) throw new Error("登录已过期，请重新登录");
  return payload;
}

function getBearerToken(req) {
  const auth = req.headers.get("Authorization") || "";
  return auth.startsWith("Bearer ") ? auth.slice(7) : null;
}

async function verifyLogin(req) {
  const token = getBearerToken(req);
  if (!token) throw new Error("未登录，请重新登录");
  return await verifyJWT(token);
}

export async function onRequest({ request, env }) {
  if (request.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  if (request.method !== "POST") {
    return Response.json({ ok: false }, { headers: corsHeaders });
  }
  let loginInfo;
  try {
    loginInfo = await verifyLogin(request);
  } catch (e) {
    return Response.json({ ok: false, msg: e.message }, { status: 401, headers: corsHeaders });
  }
  // 仅super可用
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
