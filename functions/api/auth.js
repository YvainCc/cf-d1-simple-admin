import { SignJWT, jwtVerify } from 'jose';
// 密钥自行替换为随机长字符串，不要泄露
const JWT_SECRET = new TextEncoder("DMN2026SecretKey_987654321");
const TOKEN_EXPIRE_HOUR = 168; // 7天免登录

// 生成登录Token
export async function createToken(username, role) {
  const token = await new SignJWT({ username, role })
    .setIssuedAt()
    .setExpiration(`${TOKEN_EXPIRE_HOUR}h`)
    .sign(JWT_SECRET);
  return token;
}

// 校验Token，失败抛出异常
export async function verifyToken(token) {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    return payload;
  } catch (e) {
    throw new Error("token无效/登录过期");
  }
}

// 从请求头提取token
export function getAuthToken(request) {
  const authHeader = request.headers.get("Authorization") || "";
  const prefix = "Bearer ";
  if (!authHeader.startsWith(prefix)) return null;
  return auth.slice(prefix.length);
}

// 全局跨域配置
export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type,Authorization"
};
