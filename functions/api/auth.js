// functions/api/auth.js
export async function onRequest(context) {
    const { request, env } = context;

    // 只接受 POST
    if (request.method !== 'POST') {
        return new Response('Method Not Allowed', { status: 405 });
    }

    const db = env.DB;
    const body = await request.json();

    // 统一使用英文键名（与前端匹配）
    const { action, username, password } = body;

    // 生成 32 位账号 ID
    function generateAccountId() {
        return 'account.' + crypto.randomUUID().replace(/-/g, '').substring(0, 32);
    }

    // ---------- 登录 ----------
    if (action === 'login') {
        // 查询当前名称（是否当前 = 1）且密码匹配（明文比对，生产请用 bcrypt）
        const user = await db.prepare(
            'SELECT * FROM 人员表 WHERE 游戏名称 = ? AND 是否当前 = 1'
        ).bind(username).first();

        if (!user || user.密码 !== password) {
            return new Response(
                JSON.stringify({ ok: false, msg: '用户名或密码错误' }),
                { status: 401, headers: { 'Content-Type': 'application/json' } }
            );
        }

        // 生成临时 token（生产请换为 JWT）
        const token = 'dummy-token-' + Date.now();

        return new Response(
            JSON.stringify({
                ok: true,
                token: token,
                role: user.权限 || '队员'
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
    }

    // ---------- 注册 ----------
    if (action === 'register') {
        // 检查名称是否已被使用（包括历史，可根据业务调整）
        const exist = await db.prepare(
            'SELECT * FROM 人员表 WHERE 游戏名称 = ?'
        ).bind(username).first();

        if (exist) {
            return new Response(
                JSON.stringify({ ok: false, msg: '该游戏名称已被注册' }),
                { status: 400, headers: { 'Content-Type': 'application/json' } }
            );
        }

        const accountId = generateAccountId();
        // ⚠️ 生产环境必须使用 bcrypt 哈希密码，此处仅为演示
        const hashedPassword = password;

        try {
            await db.prepare(`
                INSERT INTO 人员表 (账号ID, 游戏名称, 密码, 权限, 状态, 历史名称, 是否当前)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            `).bind(accountId, username, hashedPassword, '队员', '正常', null, 1).run();

            // 注册成功后返回 token，方便自动登录（也可返回 ok）
            const token = 'dummy-token-' + Date.now();

            return new Response(
                JSON.stringify({
                    ok: true,
                    token: token,
                    msg: '注册成功',
                    role: '队员'
                }),
                { status: 200, headers: { 'Content-Type': 'application/json' } }
            );
        } catch (err) {
            // 生产环境避免暴露内部错误信息
            return new Response(
                JSON.stringify({ ok: false, msg: '注册失败，请稍后重试' }),
                { status: 500, headers: { 'Content-Type': 'application/json' } }
            );
        }
    }

    // 未知 action
    return new Response(
        JSON.stringify({ ok: false, msg: '无效的操作类型' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
}
