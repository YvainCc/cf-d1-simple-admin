// functions/api/auth.js
// 路由: /api/auth/login   /api/auth/register

export async function onRequest(context) {
    const { request, env } = context;

    if (request.method !== 'POST') {
        return jsonResponse({ error: 'Method not allowed' }, 405);
    }

    const url = new URL(request.url);
    const action = url.pathname.split('/').pop(); // 'login' 或 'register'
    const body = await request.json();
    const { username, password } = body;

    // ===== 直接使用 env.DB（您绑定的D1变量） =====
    const db = env.DB;

    // ============ 注册 ============
    if (action === 'register') {
        // 检查用户名是否存在
        const existing = await db.prepare(
            'SELECT id FROM users WHERE username = ?'
        ).bind(username).first();

        if (existing) {
            return jsonResponse({ ok: false, msg: '该游戏名称已被注册' }, 400);
        }

        // 密码哈希
        const hashedPassword = await hashPassword(password);

        // 插入用户
        const result = await db.prepare(
            `INSERT INTO users (username, password, role, register_time) 
             VALUES (?, ?, '队员', CURRENT_TIMESTAMP)`
        ).bind(username, hashedPassword).run();

        // 插入选手战绩数据
        const userId = result.meta.last_row_id;
        await db.prepare(
            `INSERT INTO player_stats (player_id, season_id, historical_total_kd) 
             VALUES (?, 1, 0)`
        ).bind(userId).run();

        return jsonResponse({ ok: true, msg: '注册成功', userId });
    }

    // ============ 登录 ============
    if (action === 'login') {
        const hashedPassword = await hashPassword(password);

        const user = await db.prepare(
            'SELECT id, username, role FROM users WHERE username = ? AND password = ?'
        ).bind(username, hashedPassword).first();

        if (!user) {
            return jsonResponse({ ok: false, msg: '账号或密码错误' }, 401);
        }

        // 更新最后登录时间
        await db.prepare(
            'UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?'
        ).bind(user.id).run();

        // 生成Token
        const token = generateToken({ 
            id: user.id, 
            username: user.username, 
            role: user.role 
        });

        return jsonResponse({ 
            ok: true, 
            token,
            role: user.role,
            username: user.username
        });
    }

    return jsonResponse({ error: 'Invalid action' }, 400);
}

// ===== 工具函数 =====
function jsonResponse(data, status = 200) {
    return new Response(JSON.stringify(data), {
        status,
        headers: { 'Content-Type': 'application/json' }
    });
}

async function hashPassword(password) {
    const encoder = new TextEncoder();
    const data = encoder.encode(password);
    const hash = await crypto.subtle.digest('SHA-256', data);
    return btoa(String.fromCharCode(...new Uint8Array(hash)));
}

function generateToken(payload) {
    const header = { alg: 'HS256', typ: 'JWT' };
    const encodedHeader = btoa(JSON.stringify(header));
    const encodedPayload = btoa(JSON.stringify({
        ...payload,
        exp: Date.now() + 7 * 24 * 60 * 60 * 1000
    }));
    const signature = btoa(encodedHeader + '.' + encodedPayload);
    return encodedHeader + '.' + encodedPayload + '.' + signature;
}
