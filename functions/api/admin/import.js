export async function onRequest(context) {
    const { request, env } = context;
    if (request.method !== 'POST') {
        return new Response('Method Not Allowed', { status: 405 });
    }

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

    // 解析表头（支持中英文）
    const header = lines[0].split(',').map(h => h.trim());
    const nameIdx = header.findIndex(h => h.includes('玩家名称') || h.includes('name'));
    const historyIdx = header.findIndex(h => h.includes('历史名称') || h.includes('history'));
    if (nameIdx === -1) {
        return new Response(JSON.stringify({ ok: false, msg: '缺少必要列：玩家名称' }), { status: 400 });
    }

    const db = env.DB;

    // 清空表（全量覆盖）
    await db.prepare('DELETE FROM 人员表').run();

    let inserted = 0;
    // 用于生成账号ID的辅助函数
    function generateAccountId() {
        return 'account.' + crypto.randomUUID().replace(/-/g, '').substring(0, 32);
    }

    for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split(',').map(c => c.trim());
        const currentName = cols[nameIdx] || '';
        const historyStr = (historyIdx !== -1 && cols[historyIdx]) ? cols[historyIdx] : '';

        if (!currentName) continue;

        // 解析历史名称列表
        let nameList = [];
        if (historyStr) {
            nameList = historyStr.split('/').map(s => s.trim()).filter(Boolean);
        }
        // 如果当前名称不在列表中，追加到最后
        if (!nameList.includes(currentName)) {
            nameList.push(currentName);
        }
        // 否则保持列表顺序（历史名称列已包含当前名）

        // 为这一组名称生成一个统一的账号ID
        const accountId = generateAccountId();

        // 插入链式记录
        for (let j = 0; j < nameList.length; j++) {
            const name = nameList[j];
            const previousName = j > 0 ? nameList[j-1] : null;
            const isCurrent = (j === nameList.length - 1) ? 1 : 0;

            await db.prepare(`
                INSERT INTO 人员表 (账号ID, 游戏名称, 密码, 权限, 状态, 历史名称, 是否当前)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            `).bind(accountId, name, null, '队员', '正常', previousName, isCurrent).run();
            inserted++;
        }
    }

    return new Response(JSON.stringify({ ok: true, msg: '导入成功', count: inserted }), { status: 200 });
}
