// ============================================================
// 文件：functions/api/auth.js
// 路由：/api/auth
// 使用 onRequestPost 强制只处理 POST
// ============================================================

export async function onRequestPost(context) {
    const { request, env } = context;

    // ----- 1. 解析 URL 获取 action -----
    const url = new URL(request.url);
    const action = url.pathname.split('/').pop(); // 'login' 或 'register'

    // ----- 2. 解析 JSON Body -----
    let body;
    try {
        body = await request.json();
    } catch (err) {
        return new Response(JSON.stringify({
            ok: false,
            msg: '无效的JSON数据'
        }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    const { username, password } = body;

    // ----- 3. 参数校验 -----
    if (!username || !password) {
        return new Response(JSON.stringify({
            ok: false,
            msg: '账号密码不能为空'
        }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    // ----- 4. 获取 D1 数据库 -----
    const db = env.DB;
    if (!db) {
        return new Response(JSON.stringify({
            ok: false,
            msg: '系统错误：数据库未绑定'
        }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    // ============================================================
    // 登录逻辑
    // ============================================================
    if (action === 'login') {
        try {
            const user = await db.prepare(
                'SELECT id, "游戏名称" as username, "密码" as password FROM "人员表" WHERE "游戏名称" = ? AND "状态" = 1'
            ).bind(username).first();

            if (!user) {
                return new Response(JSON.stringify({
                    ok: false,
                    msg: '账号不存在或已被停用'
                }), {
                    status: 401,
                    headers: { 'Content-Type': 'application/json' }
                });
            }

            if (user.password !== password) {
                return new Response(JSON.stringify({
                    ok: false,
                    msg: '密码错误'
                }), {
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
        } catch (err) {
            return new Response(JSON.stringify({
                ok: false,
                msg: '数据库查询失败: ' + err.message
            }), {
                status: 500,
                headers: { 'Content-Type': 'application/json' }
            });
        }
    }

    // ============================================================
    // 注册逻辑
    // ============================================================
    if (action === 'register') {
        try {
            // 检查是否已存在
            const existing = await db.prepare(
                'SELECT id FROM "人员表" WHERE "游戏名称" = ? AND "状态" = 1'
            ).bind(username).first();

            if (existing) {
                return new Response(JSON.stringify({
                    ok: false,
                    msg: '该游戏名称已被注册'
                }), {
                    status: 400,
                    headers: { 'Content-Type': 'application/json' }
                });
            }

            // 插入新用户
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
        } catch (err) {
            return new Response(JSON.stringify({
                ok: false,
                msg: '注册失败: ' + err.message
            }), {
                status: 500,
                headers: { 'Content-Type': 'application/json' }
            });
        }
    }

    // action 无效
    return new Response(JSON.stringify({
        ok: false,
        msg: '无效的操作类型，请使用 login 或 register'
    }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
    });
}
