const JWT_SECRET_RAW = "DMN2026SecretKey_987654321";
const TOKEN_EXPIRE_HOUR = 168; // 7天免登录

let cachedKey = null;
async function getSecretKey() {
  if (cachedKey) return cachedKey;
  const encoder = new TextEncoder();
  const rawKey = encoder.encode(JWT_SECRET_RAW);
  cachedKey = await crypto.subtle.importKey(
    "raw",
    rawKey,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
  return cachedKey;
}

// 生成登录Token 替代 SignJWT
export async function createToken(username, role) {
  const key = await getSecretKey();
  const now = Math.floor(Date.now() / 1000);
  const exp = now + TOKEN_EXPIRE_HOUR * 3600;

  const header = btoa(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = btoa(JSON.stringify({ username, role, iat: now, exp }));
  const data = `${header}.${payload}`;

  const sigBuf = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  const signature = btoa(String.fromCharCode(...new Uint8Array(sigBuf)));
  return `${header}.${payload}.${signature}`;
}

// 校验Token，失败抛出异常 替代 jwtVerify
export async function verifyToken(token) {
  const key = await getSecretKey();
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("token无效/登录过期");
  const [header, body, sig] = parts;
  const data = `${header}.${body}`;
  const sigBytes = Uint8Array.from(atob(sig), c => c.charCodeAt(0));

  const ok = await crypto.subtle.verify("HMAC", key, sigBytes, new TextEncoder().encode(data));
  if (!ok) throw new Error("token无效/登录过期");

  const payload = JSON.parse(atob(body));
  const now = Math.floor(Date.now() / 1000);
  if (payload.exp < now) throw new Error("token无效/登录过期");
  return payload;
}

// 从请求头提取token
export function getAuthToken(request) {
  const authHeader = request.headers.get("Authorization") || "";
  const prefix = "Bearer ";
  if (!authHeader.startsWith(prefix)) return null;
  return authHeader.slice(prefix.length);
}

// 全局跨域配置
export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type,Authorization"
};
