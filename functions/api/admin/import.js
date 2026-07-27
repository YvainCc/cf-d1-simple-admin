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
    // 去除 BOM（如果存在）
    const cleanText = text.replace(/^\uFEFF/, '');
    const lines = cleanText.split('\n').filter(line => line.trim() !== '');
    if (lines.length < 2) {
        return new Response(JSON.stringify({ ok: false, msg: '文件为空或格式不正确' }), { status: 400 });
    }

    // 自动检测分隔符（优先逗号，其次分号，其次制表符）
    const firstLine = lines[0];
    let delimiter = ',';
    if (firstLine.includes('\t')) delimiter = '\t';
    else if (firstLine.includes(';')) delimiter = ';';

    // 解析表头
    const header = firstLine.split(delimiter).map(h => h.trim().replace(/^["']|["']$/g, ''));
    
    // 查找列索引（更宽松的匹配）
    const nameIdx = header.findIndex(h => {
        const lower = h.toLowerCase();
        return lower.includes('玩家名称') || lower.includes('名称') || lower.includes('name');
    });
    const historyIdx = header.findIndex(h => {
        const lower = h.toLowerCase();
        return lower.includes('历史名称') || lower.includes('历史') || lower.includes('history');
    });

    // 如果没找到名称列，返回错误并显示检测到的表头
    if (nameIdx === -1) {
        return new Response(JSON.stringify({
            ok: false,
            msg: `未找到"玩家名称"列，检测到的表头为: [${header.join(', ')}]`
        }), { status: 400 });
    }

    const db = env.DB;

    // 清空表（全量覆盖）
    await db.prepare('DELETE FROM 人员表').run();

    let inserted = 0;
    // 生成账号ID
    function generateAccountId() {
        return 'account.' + crypto.randomUUID().replace(/-/g, '').substring(0, 32);
    }

    for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split(delimiter).map(c => c.trim().replace(/^["']|["']$/g, ''));
        const currentName = cols[nameIdx] || '';
        const historyStr = (historyIdx !== -1 && cols[historyIdx]) ? cols[historyIdx] : '';

        if (!currentName) continue;

        // 解析历史名称列表
        let nameList = [];
        if (historyStr) {
            nameList = historyStr.split('/').map(s => s.trim()).filter(Boolean);
        }
        if (!nameList.includes(currentName)) {
            nameList.push(currentName);
        }

        const accountId = generateAccountId();

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
