// functions/api/sponsorships.js
// 路由: /api/sponsorships (GET/POST)  /api/sponsorships/:id (PUT审核)

export async function onRequest(context) {
    const { request, env } = context;
    const db = env.DB;
    const method = request.method;
    const url = new URL(request.url);

    // 验证管理员权限
    const user = await getCurrentUser(request);
    if (!user || !['管理员', '超级管理员'].includes(user.role)) {
        return jsonResponse({ error: '权限不足' }, 403);
    }

    // ===== GET: 获取赞助列表 =====
    if (method === 'GET') {
        const season = url.searchParams.get('season');
        const type = url.searchParams.get('type');
        const status = url.searchParams.get('status');

        let query = 'SELECT * FROM sponsorships WHERE 1=1';
        const params = [];

        if (season) { query += ' AND season_id = ?'; params.push(season); }
        if (type) { query += ' AND type = ?'; params.push(type); }
        if (status) { query += ' AND status = ?'; params.push(status); }

        query += ' ORDER BY created_at DESC';

        const results = await db.prepare(query).bind(...params).all();
        return jsonResponse({ ok: true, data: results.results });
    }

    // ===== POST: 新增老板赞助 =====
    if (method === 'POST') {
        const { seasonId, bossName, amount, remark } = await request.json();

        if (!bossName) {
            return jsonResponse({ ok: false, msg: '老板姓名不能为空' }, 400);
        }

        const result = await db.prepare(
            `INSERT INTO sponsorships (season_id, type, boss_name, amount, admin_comment, status) 
             VALUES (?, 'boss', ?, ?, ?, 'pending')`
        ).bind(seasonId, bossName, amount, remark || '').run();

        return jsonResponse({ 
            ok: true, 
            id: result.meta.last_row_id,
            msg: '赞助记录已创建，等待审核'
        });
    }

    // ===== PUT: 审核赞助 =====
    if (method === 'PUT') {
        const id = url.pathname.split('/').pop();
        const { status, comment } = await request.json();

        await db.prepare(
            `UPDATE sponsorships 
             SET status = ?, admin_comment = ?, approved_at = CURRENT_TIMESTAMP 
             WHERE id = ?`
        ).bind(status, comment || '', id).run();

        return jsonResponse({ 
            ok: true, 
            msg: `赞助已${status === 'approved' ? '通过' : '驳回'}`
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
