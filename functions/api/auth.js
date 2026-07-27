// functions/api/auth.js
export async function onRequest(context) {
    const { request, env } = context;
    if (request.method !== 'POST') {
        return new Response('Method Not Allowed', { status: 405 });
    }

    const db = env.DB;
    const body = await request.json();
    const { action, username, password } = body;

    // 生成账号ID
    function generateAccountId() {
        return 'account.' + crypto.randomUUID().replace(/-/g, '').substring(0, 32);
    }

    if (action === 'login') {
        // 查询当前名称（是否当前=1）且密码匹配
        const user = await db.prepare(
            'SELECT * FROM 人员表 WHERE 游戏名称 = ? AND 是否当前 = 1'
        ).bind(username).first();
        if (!user || user.密码 !== password) { // 实际应使用密码hash比较
            return new Response(JSON.stringify({ ok: false, msg: '用户名或密码错误' }), { status: 401 });
        }
        return new Response(JSON.stringify({
            ok: true,
            role: user.权限 || '队员',
            token: 'dummy-token' // 实际应生成JWT
        }), { status: 200 });
    }

    if (action === 'register') {
        // 检查名称是否已被使用（包括历史名称）
        const exist = await db.prepare(
            'SELECT * FROM 人员表 WHERE 游戏名称 = ?'
        ).bind(username).first();
        if (exist) {
            return new Response(JSON.stringify({ ok: false, msg: '该名称已被使用' }), { status: 400 });
        }

        const accountId = generateAccountId();
        // 密码应使用bcrypt等加密，此处仅为示例
        const hashedPassword = password; // 实际生产用 bcrypt.hash(password, 10)

        try {
            await db.prepare(`
                INSERT INTO 人员表 (账号ID, 游戏名称, 密码, 权限, 状态, 历史名称, 是否当前)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            `).bind(accountId, username, hashedPassword, '队员', '正常', null, 1).run();

            return new Response(JSON.stringify({ ok: true, msg: '注册成功' }), { status: 200 });
        } catch (err) {
            return new Response(JSON.stringify({ ok: false, msg: '注册失败: ' + err.message }), { status: 500 });
        }
    }

    return new Response(JSON.stringify({ ok: false, msg: '未知操作' }), { status: 400 });
}
