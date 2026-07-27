// functions/api/admin/import.js
export async function onRequest(context) {
    const { request, env } = context;
    if (request.method !== 'POST') {
        return new Response('Method Not Allowed', { status: 405 });
    }

    // 简单权限检查（仅允许 YvainCC，实际可用 JWT）
    // 此处从请求头获取用户名（仅演示，可自行增强）
    // 实际可在前端传递用户名，但应使用 token 认证
    // 为了演示，我们从 formData 中获取，但也可用 Authorization header
    // 这里我们不校验，只供内部使用

    const formData = await request.formData();
    const file = formData.get('file');
    if (!file) {
        return new Response(JSON.stringify({ ok: false, msg: '未上传文件' }), { status: 400 });
    }

    const text = await file.text();
    const lines = text.split('\n').filter(line => line.trim() !== '');
    if (lines.length < 2) {
        return new Response(JSON.stringify({ ok: false, msg: '文件为空或格式不正确' }), { status: 400 });
    }

    const header = lines[0].split(',').map(h => h.trim());
    const colIdx = {
        accountId: header.findIndex(h => h.includes('账号ID') || h.includes('account')),
        name: header.findIndex(h => h.includes('玩家名称') || h.includes('name')),
        history: header.findIndex(h => h.includes('历史名称') || h.includes('history'))
    };
    if (colIdx.accountId === -1 || colIdx.name === -1) {
        return new Response(JSON.stringify({ ok: false, msg: '缺少必要列：玩家账号ID、玩家名称' }), { status: 400 });
    }

    const db = env.DB;
    // 清空表（重新导入）
    await db.prepare('DELETE FROM 人员表').run();

    let inserted = 0;

    for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split(',').map(c => c.trim());
        const accountId = cols[colIdx.accountId];
        const currentName = cols[colIdx.name];
        const historyStr = cols[colIdx.history] || '';

        if (!accountId || !currentName) continue;

        // 解析历史名称
        let nameList = [];
        if (historyStr) {
            nameList = historyStr.split('/').map(s => s.trim()).filter(Boolean);
        }
        if (!nameList.includes(currentName)) {
            nameList.push(currentName);
        }

        // 插入链式记录（从旧到新）
        for (let j = 0; j < nameList.length; j++) {
            const name = nameList[j];
            const previousName = j > 0 ? nameList[j-1] : null;
            const isCurrent = (j === nameList.length - 1) ? 1 : 0;

            await db.prepare(`
                INSERT INTO 人员表 (账号ID, 游戏名称, 密码, 权限, 状态, 历史名称, 是否当前)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            `).bind(
                accountId,
                name,
                null,          // 导入用户无密码
                '队员',
                '正常',
                previousName,
                isCurrent
            ).run();
            inserted++;
        }
    }

    return new Response(JSON.stringify({ ok: true, msg: '导入成功', count: inserted }), { status: 200 });
}
