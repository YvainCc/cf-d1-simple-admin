// functions/api/teams.js
// 路由: /api/teams (POST创建)  /api/teams/:id (GET详情)

export async function onRequest(context) {
    const { request, env } = context;
    const db = env.DB;
    const method = request.method;
    const url = new URL(request.url);

    // ===== 认证：从Header获取用户信息 =====
    const user = await getCurrentUser(request);
    if (!user) {
        return jsonResponse({ error: '请先登录' }, 401);
    }

    // ===== GET: 获取战队详情 =====
    if (method === 'GET') {
        const teamId = url.pathname.split('/').pop();
        if (!teamId || isNaN(teamId)) {
            return jsonResponse({ error: 'Invalid team ID' }, 400);
        }

        const team = await db.prepare(`
            SELECT t.*, u.username as captain_name 
            FROM teams t
            JOIN users u ON t.captain_id = u.id
            WHERE t.id = ?
        `).bind(teamId).first();

        if (!team) {
            return jsonResponse({ error: '战队不存在' }, 404);
        }

        const members = await db.prepare(`
            SELECT u.id, u.username, tm.role
            FROM team_members tm
            JOIN users u ON tm.player_id = u.id
            WHERE tm.team_id = ?
        `).bind(teamId).all();

        return jsonResponse({ 
            ok: true, 
            data: { ...team, members: members.results }
        });
    }

    // ===== POST: 创建战队 =====
    if (method === 'POST') {
        const { name, seasonId } = await request.json();

        // 校验赛季状态
        const season = await db.prepare(
            'SELECT status, max_teams FROM seasons WHERE id = ?'
        ).bind(seasonId).first();

        if (!season || season.status !== '报名中') {
            return jsonResponse({ ok: false, msg: '当前赛季未开放报名' }, 400);
        }

        // 校验战队名
        const existing = await db.prepare(
            'SELECT id FROM teams WHERE name = ? AND season_id = ?'
        ).bind(name, seasonId).first();

        if (existing) {
            return jsonResponse({ ok: false, msg: '战队名称已被使用' }, 400);
        }

        // 校验名额
        const count = await db.prepare(
            'SELECT COUNT(*) as count FROM teams WHERE season_id = ?'
        ).bind(seasonId).first();

        if (count.count >= season.max_teams) {
            return jsonResponse({ ok: false, msg: '报名已满' }, 400);
        }

        // 生成邀请码并创建
        const inviteCode = generateInviteCode();
        const result = await db.prepare(
            `INSERT INTO teams (name, captain_id, season_id, invite_code) 
             VALUES (?, ?, ?, ?)`
        ).bind(name, user.id, seasonId, inviteCode).run();

        const teamId = result.meta.last_row_id;

        // 添加队长
        await db.prepare(
            `INSERT INTO team_members (team_id, player_id, role) 
             VALUES (?, ?, 'captain')`
        ).bind(teamId, user.id).run();

        return jsonResponse({ 
            ok: true, 
            teamId,
            inviteCode,
            msg: '战队创建成功'
        });
    }

    // ===== PUT: 更新战队（如确认阵容） =====
    if (method === 'PUT') {
        const teamId = url.pathname.split('/')[2]; // /api/teams/:id/lineup
        const action = url.pathname.split('/')[3];

        // 确认首发阵容
        if (action === 'lineup') {
            const { lineupPlayerIds } = await request.json();

            // 校验队长权限
            const team = await db.prepare(
                'SELECT captain_id FROM teams WHERE id = ?'
            ).bind(teamId).first();

            if (!team || team.captain_id !== user.id) {
                return jsonResponse({ error: '只有队长可以确认阵容' }, 403);
            }

            // 更新阵容（4个首发）
            await db.prepare(
                `UPDATE team_members SET role = 'substitute' WHERE team_id = ?`
            ).bind(teamId).run();

            for (const playerId of lineupPlayerIds) {
                await db.prepare(
                    `UPDATE team_members SET role = 'starter' 
                     WHERE team_id = ? AND player_id = ?`
                ).bind(teamId, playerId).run();
            }

            return jsonResponse({ ok: true, msg: '阵容已更新' });
        }
    }

    return jsonResponse({ error: 'Not found' }, 404);
}

function jsonResponse(data, status = 200) {
    return new Response(JSON.stringify(data), {
        status,
        headers: { 'Content-Type': 'application/json' }
    });
}

function generateInviteCode() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
}

async function getCurrentUser(request) {
    const authHeader = request.headers.get('Authorization');
    const token = authHeader?.replace('Bearer ', '');
    if (!token) return null;
    try {
        const parts = token.split('.');
        if (parts.length !== 3) return null;
        const payload = JSON.parse(atob(parts[1]));
        if (payload.exp < Date.now()) return null;
        return payload;
    } catch {
        return null;
    }
}
