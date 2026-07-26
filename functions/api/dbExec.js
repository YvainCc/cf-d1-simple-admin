import { jwtVerify } from 'jose';
const JWT_SECRET = new TextEncoder("DMN2026_SecretKey_99887766");
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type,Authorization"
};
function getBearerToken(req) {
  const auth = req.headers.get("Authorization") || "";
  return auth.startsWith("Bearer ") ? auth.slice(7) : null;
}
async function verifyLogin(req) {
  const token = getBearerToken(req);
  if (!token) throw new Error("未登录，请重新登录");
  const { payload } = await jwtVerify(token);
  return payload;
}

export async function onRequest({ request, env }) {
  if (request.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (request.method !== "POST") return Response.json({ok:false},{headers:corsHeaders});
  let loginInfo;
  try {
    loginInfo = await verifyLogin(request);
  } catch (e) {
    return Response.json({ ok:false, msg:e.message },{status:401, headers:corsHeaders});
  }
  // 仅super可用
  if(loginInfo.role !== "super"){
    return Response.json({ok:false,msg:"仅超级管理员可执行数据库操作"},{headers:corsHeaders});
  }
  const {sql} = await request.json();
  const lowSql = sql.toLowerCase();
  if((lowSql.includes("delete") || lowSql.includes("update")) && !lowSql.includes("where")){
    return Response.json({ok:false,msg:"禁止无WHERE全表修改数据"},{headers:corsHeaders});
  }
  try{
    let res;
    if(sql.trim().startsWith("select")){
      res = await env.DB.prepare(sql).all();
      return Response.json({ok:true,list:res.results,type:"query"},{headers:corsHeaders});
    }else{
      await env.DB.exec(sql);
      return Response.json({ok:true,type:"modify"},{headers:corsHeaders});
    }
  }catch(err){
    return Response.json({ok:false,msg:err.message},{headers:corsHeaders});
  }
}
