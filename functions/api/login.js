// functions/api/login.js
export async function onRequest({ request, env }) {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
  };

  // 处理预检请求
  if (request.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // 仅允许 POST
  if (request.method !== "POST") {
    return Response.json(
      { ok: false, msg: "仅支持POST请求" },
      { status: 405, headers: corsHeaders }
    );
  }

  try {
    const reqBody = await request.json();
    const { action, username, password } = reqBody;

    // 只处理 login 动作
    if (action !== "login") {
      return Response.json(
        { ok: false, msg: "非法请求" },
        { headers: corsHeaders }
      );
    }

    // 检查 D1 是否绑定
    if (!env.DB) {
      return Response.json(
        { ok: false, msg: "数据库未绑定" },
        { status: 500, headers: corsHeaders }
      );
    }

    // 查询人员表（只查当前有效名称，且状态为 active）
    const sqlRes = await env.DB.prepare(`
      SELECT id, 游戏名称, 权限, 状态 
      FROM 人员表 
      WHERE 游戏名称 = ? AND 密码 = ? AND 状态 = 'active' AND 是否当前 = 1
    `)
      .bind(username, password)
      .all();

    if (sqlRes.results && sqlRes.results.length > 0) {
      const user = sqlRes.results[0];
      return Response.json({
        ok: true,
        msg: "登录成功",
        role: user.权限,          // 直接返回权限字段（admin/user）
        userName: user.游戏名称,
        userId: user.id
      }, { headers: corsHeaders });
    } else {
      return Response.json(
        { ok: false, msg: "账号或密码错误，或账号已被禁用" },
        { headers: corsHeaders }
      );
    }
  } catch (err) {
    // 返回详细错误便于调试（生产环境可简化）
    return Response.json(
      { ok: false, msg: "服务异常：" + err.message },
      { status: 500, headers: corsHeaders }
    );
  }
}
