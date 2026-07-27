// functions/api/seasons.js
// 路由: /api/seasons  /api/seasons/current

export async function onRequest(context) {
    const { request, env } = context;
    const db = env.DB;
    const url = new URL(request.url);

    // ===== GET: 获取所有赛季 =====
    if (request.method === 'GET') {
        const current = url.searchParams.get('current');
        
        if (current === 'true') {
            const result = await db.prepare(
                `SELECT * FROM seasons WHERE status IN ('报名中', '进行中') 
                 ORDER BY created_at DESC LIMIT 1`
            ).first();
            return jsonResponse({ ok: true, data: result });
        }

        const results = await db.prepare(
            'SELECT * FROM seasons ORDER BY created_at DESC'
        ).all();
        return jsonResponse({ ok: true, data: results.results });
    }

    // ===== POST: 创建赛季（仅超级管理员） =====
    if (request.method === 'POST') {
        const user = await getCurrentUser(request);
        if (!user || user.role !== '超级管理员') {
            return jsonResponse({ error: '权限不足' }, 403);
        }

        const { name, registrationStart, registrationEnd, maxTeams } = await request.json();

        const result = await db.prepare(
            `INSERT INTO seasons (name, status, registration_start, registration_end, max_teams) 
             VALUES (?, '筹备中', ?, ?, ?)`
        ).bind(name, registrationStart, registrationEnd, maxTeams || 20).run();

        return jsonResponse({ 
            ok: true, 
            id: result.meta.last_row_id,
            msg: '赛季创建成功'
        });
    }

    return jsonResponse({ error: 'Method not allowed' }, 405);
}

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
