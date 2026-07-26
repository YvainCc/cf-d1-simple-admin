export async function onRequest({ request, env }) {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
  };

  // 跨域预检
  if (request.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // GET 请求：查询当前用户战队信息
  if (request.method === "GET") {
    const url = new URL(request.url);
    const username = url.searchParams.get("username");
    if (!username) return Response.json({ok:false,msg:"缺少账号参数"},{headers:corsHeaders});

    // 查询选手id
    const user = await env.DB.prepare(`SELECT id FROM admin WHERE username = ?`).bind(username).first();
    if (!user) return Response.json({ok:false,msg:"账号不存在"},{headers:corsHeaders});
    const playerId = user.id;

    // 查询该选手所属战队基础信息
    const teamMember = await env.DB.prepare(`
      SELECT tm.member_role, t.id team_id, t.team_name, t.captain_id, t.invite_code
      FROM team_members tm
      LEFT JOIN teams t ON tm.team_id = t.id
      WHERE tm.player_id = ?
    `).bind(playerId).first();

    if (!teamMember) {
      return Response.json({
        ok:true,
        hasTeam:false,
        data:null
      },{headers:corsHeaders})
    }

    // 查询战队全部成员
    const memberList = await env.DB.prepare(`
      SELECT a.username, tm.member_role, s.historical_total_kd
      FROM team_members tm
      LEFT JOIN admin a ON tm.player_id = a.id
      LEFT JOIN player_stats s ON tm.player_id = s.player_id
      WHERE tm.team_id = ?
    `).bind(teamMember.team_id).all();

    return Response.json({
      ok:true,
      hasTeam:true,
      selfRole: teamMember.member_role,
      teamInfo:{
        id: teamMember.team_id,
        name: teamMember.team_name,
        inviteCode: teamMember.invite_code,
        captainId: teamMember.captain_id
      },
      memberList: memberList.results
    },{headers:corsHeaders})
  }

  // POST 请求：创建战队 / 邀请码入队
  if (request.method === "POST") {
    const body = await request.json();
    const { type, username, teamName, inviteCode } = body;

    // 获取选手ID
    const user = await env.DB.prepare(`SELECT id FROM admin WHERE username = ?`).bind(username).first();
    if (!user) return Response.json({ok:false,msg:"账号不存在"},{headers:corsHeaders});
    const playerId = user.id;

    // 创建战队分支
    if (type === "create") {
      if (!teamName) return Response.json({ok:false,msg:"战队名称不能为空"},{headers:corsHeaders});
      const existTeam = await env.DB.prepare(`SELECT id FROM teams WHERE team_name = ?`).bind(teamName).first();
      if(existTeam) return Response.json({ok:false,msg:"战队名称已存在"},{headers:corsHeaders});

      // 生成6位邀请码
      const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
      let code = "";
      for(let i=0;i<6;i++) code += chars[Math.floor(Math.random()*chars.length)];

      // 插入战队表
      const teamInsert = await env.DB.prepare(`
        INSERT INTO teams (team_name, captain_id, invite_code) VALUES (?,?,?)
      `).bind(teamName, playerId, code).run();
      const teamId = teamInsert.lastInsertRowid;

      // 插入队长成员记录
      await env.DB.prepare(`
        INSERT INTO team_members (team_id, player_id, member_role) VALUES (?,?,?)
      `).bind(teamId, playerId, "captain").run();

      return Response.json({
        ok:true,
        msg:"战队创建成功",
        inviteCode: code
      },{headers:corsHeaders})
    }

    // 加入战队分支
    if (type === "join") {
      if (!inviteCode) return Response.json({ok:false,msg:"请输入邀请码"},{headers:corsHeaders});
      const targetTeam = await env.DB.prepare(`SELECT id FROM teams WHERE invite_code = ?`).bind(inviteCode).first();
      if(!targetTeam) return Response.json({ok:false,msg:"邀请码无效"},{headers:corsHeaders});
      const teamId = targetTeam.id;

      // 判断是否已有战队
      const hasTeam = await env.DB.prepare(`SELECT id FROM team_members WHERE player_id = ?`).bind(playerId).first();
      if(hasTeam) return Response.json({ok:false,msg:"你已加入其他战队"},{headers:corsHeaders});

      // 人数上限9人校验
      const memberCount = await env.DB.prepare(`
        SELECT COUNT(*) cnt FROM team_members WHERE team_id = ?
      `).bind(teamId).first();
      if(memberCount.cnt >=9) return Response.json({ok:false,msg:"战队人数已满"},{headers:corsHeaders});

      // 插入替补队员
      await env.DB.prepare(`
        INSERT INTO team_members (team_id, player_id, member_role) VALUES (?,?,?)
      `).bind(teamId, playerId, "substitute").run();

      return Response.json({ok:true,msg:"成功加入战队"} ,{headers:corsHeaders})
    }

    return Response.json({ok:false,msg:"非法操作类型"},{headers:corsHeaders})
  }

  return Response.json({ok:false,msg:"仅支持GET/POST请求"},{status:405,headers:corsHeaders})
}