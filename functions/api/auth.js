const JWT_SECRET_RAW = "DMN2026_SecretKey_99887766";
const TOKEN_EXPIRE_HOUR = 168;
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

export async function verifyToken(token) {
  const key = await getSecretKey();
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("token无效/未登录");
  const [header, body, sig] = parts;
  const data = `${header}.${body}`;
  const sigBytes = Uint8Array.from(atob(sig), c => c.charCodeAt(0));
  const valid = await crypto.subtle.verify("HMAC", key, sigBytes, new TextEncoder().encode(data));
  if (!valid) throw new Error("登录凭证无效");
  const payload = JSON.parse(atob(body));
  const now = Math.floor(Date.now());
  if (payload.exp < now) throw new Error("登录已过期，请重新登录");
  return payload;
}

export function getAuthToken(request) {
  const auth = request.headers.get("Authorization") || "";
  return auth.startsWith("Bearer ") ? auth.slice(7) : null;
}

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type,Authorization"
};
