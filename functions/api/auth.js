// ============================================================
// 文件：functions/api/auth.js
// 路由：/api/auth（POST）
// 支持 action: login 和 action: register
// 表名：人员表，字段：游戏名称、密码、状态（1有效）
// ============================================================

export async function onRequest(context) {
    const { request, env } = context;

    // ----- 1. 只允许 POST -----
    if (request.method !== 'POST') {
        return new Response(JSON.stringify({
            ok: false,
            msg: '请使用 POST 请求'
        }), {
            status: 405,
            headers: { 'Content-Type': 'application/json' }
        });
    }

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

    // ----- 3. 提取参数 -----
    const { username, password, action } = body;

    if (!username || !password) {
        return new Response(JSON.stringify({
            ok: false,
            msg: '账号密码不能为空'
        }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    // ----- 4. 获取 D1 数据库绑定 -----
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

    // ----- 5. 根据 action 分发 -----
    try {
        if (action === 'register') {
            // ========== 注册 ==========
            // 检查是否已存在有效账号
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

            // 插入新用户（状态默认1）
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
        else if (action === 'login') {
            // ========== 登录 ==========
            // 查询状态=1的用户
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

            // 密码比对（明文）
            if (user.password !== password) {
                return new Response(JSON.stringify({
                    ok: false,
                    msg: '密码错误'
                }), {
                    status: 401,
                    headers: { 'Content-Type': 'application/json' }
                });
            }

            // 生成简易Token（可扩展）
            const token = 'dmn-token-' + Date.now();

            return new Response(JSON.stringify({
                ok: true,
                token: token,
                role: '队员',
                username: user.username
            }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' }
            });
        } 
        else {
            // action 无效
            return new Response(JSON.stringify({
                ok: false,
                msg: '无效的操作类型，请使用 login 或 register'
            }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' }
            });
        }
    } catch (err) {
        // 数据库异常
        return new Response(JSON.stringify({
            ok: false,
            msg: '数据库错误: ' + err.message
        }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
}
