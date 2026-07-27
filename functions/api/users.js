// functions/api/users.js
// 路由: /api/users/me  /api/users/stats  /api/users/check

export async function onRequest(context) {
    const { request, env } = context;
    const db = env.DB;
    const url = new URL(request.url);
    const method = request.method;

    // ===== 认证 =====
    const user = await getCurrentUser(request);
    if (!user) {
        return jsonResponse({ ok: false, msg: '请先登录' }, 401);
    }

    // =============================================================
    // GET /api/users/me - 获取当前用户信息
    // =============================================================
    if (method === 'GET' && url.pathname === '/api/users/me') {
        const result = await db.prepare(`
            SELECT u.id, u.username, u.role, u.register_time, u.last_login,
                   t.id as team_id, t.name as team_name, t.captain_id,
                   r.status as registration_status
            FROM users u
            LEFT JOIN team_members tm ON u.id = tm.player_id
            LEFT JOIN teams t ON tm.team_id = t.id
            LEFT JOIN registrations r ON t.id = r.team_id AND r.status != 'rejected'
            WHERE u.id = ?
        `).bind(user.id).first();

        if (!result) {
            return jsonResponse({ ok: false, msg: '用户不存在' }, 404);
        }

        return jsonResponse({
            ok: true,
            data: {
                id: result.id,
                username: result.username,
                role: result.role,
                team: result.team_name || null,
                teamId: result.team_id || null,
                isCaptain: result.captain_id === user.id,
                registrationStatus: result.registration_status || null,
                registerTime: result.register_time,
                lastLogin: result.last_login
            }
        });
    }

    // =============================================================
    // GET /api/users/stats - 获取选手战绩
    // =============================================================
    if (method === 'GET' && url.pathname === '/api/users/stats') {
        const season = url.searchParams.get('season') || '1';

        const stats = await db.prepare(`
            SELECT ps.*
            FROM player_stats ps
            WHERE ps.player_id = ? AND ps.season_id = ?
        `).bind(user.id, season).first();

        if (!stats) {
            // 如果无数据返回默认值
            return jsonResponse({
                ok: true,
                data: {
                    kd: 0,
                    total_kills: 0,
                    total_damage: 0,
                    total_matches: 0,
                    total_wins: 0,
                    top10_rate: '0%',
                    avg_survival: '0min',
                    max_kills: 0,
                    historical_total_kd: 0
                }
            });
        }

        return jsonResponse({
            ok: true,
            data: {
                kd: stats.kd || 0,
                total_kills: stats.total_kills || 0,
                total_damage: stats.total_damage || 0,
                total_matches: stats.total_matches || 0,
                total_wins: stats.total_wins || 0,
                top10_rate: stats.top10_rate ? stats.top10_rate + '%' : '0%',
                avg_survival: stats.avg_survival ? stats.avg_survival + 'min' : '0min',
                max_kills: stats.max_kills || 0,
                historical_total_kd: stats.historical_total_kd || 0
            }
        });
    }

    // =============================================================
    // GET /api/users/check - 检查用户名是否存在（注册用）
    // =============================================================
    if (method === 'GET' && url.pathname === '/api/users/check') {
        const username = url.searchParams.get('username');
        if (!username) {
            return jsonResponse({ ok: false, msg: '缺少用户名参数' }, 400);
        }

        const result = await db.prepare(
            'SELECT id FROM users WHERE username = ?'
        ).bind(username).first();

        return jsonResponse({
            ok: true,
            exists: !!result
        });
    }

    return jsonResponse({ ok: false, msg: '接口不存在' }, 404);
}

// ===== 工具函数 =====
function jsonResponse(data, status = 200) {
    return new Response(JSON.stringify(data), {
        status,
        headers: { 'Content-Type': 'application/json' }
    });
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
