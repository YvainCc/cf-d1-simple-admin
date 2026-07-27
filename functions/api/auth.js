// ============================================================
// 路由：/api/auth/login   /api/auth/register
// 适配表名：人员表（中文名）
// 字段：游戏名称（文本）、密码（文本）、状态（整数，1=有效，0=历史）
// 登录条件：游戏名称存在 且 状态=1 且 密码匹配
// ============================================================

/**
 * Cloudflare Pages Functions 入口
 * 处理 POST /api/auth/login 和 POST /api/auth/register
 */
export async function onRequest(context) {
    const { request, env } = context;

    // ----- 1. 只允许 POST 方法 -----
    if (request.method !== 'POST') {
        return jsonResponse({ error: 'Method not allowed' }, 405);
    }

    // ----- 2. 解析请求路径和参数 -----
    const url = new URL(request.url);
    const action = url.pathname.split('/').pop(); // 'login' 或 'register'

    let body;
    try {
        body = await request.json();
    } catch (err) {
        return jsonResponse({ error: 'Invalid JSON body' }, 400);
    }

    const { username, password } = body;
    if (!username || !password) {
        return jsonResponse({ error: 'Missing username or password' }, 400);
    }

    // ----- 3. 获取 D1 数据库绑定 -----
    const db = env.DB;
    if (!db) {
        console.error('D1 database binding "DB" not found.');
        return jsonResponse({ error: 'Server configuration error' }, 500);
    }

    // ----- 4. 路由分发 -----
    if (action === 'register') {
        return await handleRegister(db, username, password);
    } else if (action === 'login') {
        return await handleLogin(db, username, password);
    } else {
        return jsonResponse({ error: 'Invalid action' }, 400);
    }
}

// ============================================================
// 注册处理
// ============================================================
async function handleRegister(db, username, password) {
    // 检查当前有效（状态=1）的同名记录是否存在
    const existing = await db.prepare(
        'SELECT id FROM "人员表" WHERE "游戏名称" = ? AND "状态" = 1'
    ).bind(username).first();

    if (existing) {
        return jsonResponse({ ok: false, msg: '该游戏名称已被注册（当前有效）' }, 400);
    }

    // 插入新记录，状态默认为 1（有效）
    try {
        const result = await db.prepare(
            `INSERT INTO "人员表" ("游戏名称", "密码", "状态") VALUES (?, ?, 1)`
        ).bind(username, password).run();

        return jsonResponse({
            ok: true,
            msg: '注册成功',
            userId: result.meta.last_row_id
        }, 200);
    } catch (err) {
        console.error('Register insert error:', err);
        return jsonResponse({ error: 'Database error' }, 500);
    }
}

// ============================================================
// 登录处理（核心：状态必须为 1）
// ============================================================
async function handleLogin(db, username, password) {
    // 查询状态为 1 的记录
    const user = await db.prepare(
        'SELECT id, "游戏名称" as username, "密码" as password FROM "人员表" WHERE "游戏名称" = ? AND "状态" = 1'
    ).bind(username).first();

    // 用户不存在或状态不为 1
    if (!user) {
        return jsonResponse({ ok: false, msg: '账号不存在或已被停用' }, 401);
    }

    // 密码比对（此处为明文比对，与您现有数据一致）
    if (user.password !== password) {
        return jsonResponse({ ok: false, msg: '密码错误' }, 401);
    }

    // 生成简易 JWT Token（用于后续鉴权，可选）
    const token = generateToken({
        id: user.id,
        username: user.username
    });

    // 登录成功
    return jsonResponse({
        ok: true,
        token: token,
        role: '队员',           // 固定角色，如需可从表里读取
        username: user.username
    }, 200);
}

// ============================================================
// 工具函数
// ============================================================

/**
 * 统一 JSON 响应
 */
function jsonResponse(data, status = 200) {
    return new Response(JSON.stringify(data), {
        status,
        headers: {
            'Content-Type': 'application/json',
            // 如需跨域，可在此添加 CORS 头
            // 'Access-Control-Allow-Origin': '*',
        }
    });
}

/**
 * 简单 JWT 生成（仅用于演示，实际生产应使用更安全的库）
 * 这里使用 base64 编码，并非加密签名，仅作为标识。
 * 如需安全签名，可使用 HMAC-SHA256 并设置密钥。
 */
function generateToken(payload) {
    const header = { alg: 'HS256', typ: 'JWT' };
    const encodedHeader = btoa(JSON.stringify(header));
    const encodedPayload = btoa(JSON.stringify({
        ...payload,
        exp: Date.now() + 7 * 24 * 60 * 60 * 1000 // 7天有效期
    }));
    // 简单签名（实际应使用 HMAC-SHA256）
    const signature = btoa(encodedHeader + '.' + encodedPayload);
    return encodedHeader + '.' + encodedPayload + '.' + signature;
}
