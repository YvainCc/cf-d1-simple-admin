export async function onRequest(context) {
    const { request, env } = context;

    if (request.method !== 'POST') {
        return new Response(JSON.stringify({ error: 'Method not allowed' }), {
            status: 405,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    const url = new URL(request.url);
    const action = url.pathname.split('/').pop();

    let body;
    try {
        body = await request.json();
    } catch (err) {
        return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    const { username, password } = body;
    if (!username || !password) {
        return new Response(JSON.stringify({ error: 'Missing username or password' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    const db = env.DB;
    if (!db) {
        return new Response(JSON.stringify({ error: 'Database not bound' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    if (action === 'login') {
        const user = await db.prepare(
            'SELECT id, "游戏名称" as username, "密码" as password FROM "人员表" WHERE "游戏名称" = ? AND "状态" = 1'
        ).bind(username).first();

        if (!user) {
            return new Response(JSON.stringify({ ok: false, msg: '账号不存在或已被停用' }), {
                status: 401,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        if (user.password !== password) {
            return new Response(JSON.stringify({ ok: false, msg: '密码错误' }), {
                status: 401,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        return new Response(JSON.stringify({
            ok: true,
            token: 'dmn-token-' + Date.now(),
            role: '队员',
            username: user.username
        }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    if (action === 'register') {
        const existing = await db.prepare(
            'SELECT id FROM "人员表" WHERE "游戏名称" = ? AND "状态" = 1'
        ).bind(username).first();

        if (existing) {
            return new Response(JSON.stringify({ ok: false, msg: '该游戏名称已被注册' }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        const result = await db.prepare(
            `INSERT INTO "人员表" ("游戏名称", "密码", "状态") VALUES (?, ?, 1)`
        ).bind(username, password).run();

        return new Response(JSON.stringify({
            ok: true,
            msg: '注册成功',
            userId: result.meta.last_row_id
        }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    return new Response(JSON.stringify({ error: 'Invalid action' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
    });
}
