import * as XLSX from 'xlsx'; // 需在项目中安装 xlsx 库，或使用 CDN

export async function onRequest(context) {
    const { request, env } = context;
    if (request.method !== 'POST') {
        return new Response('Method Not Allowed', { status: 405 });
    }

    // 简单身份验证（可从 header 获取 token 验证，此处简化为检查用户名）
    // 实际应验证管理员权限（如 JWT）
    const authHeader = request.headers.get('Authorization');
    // 假设前端传用户名，真实项目应使用 token
    const formData = await request.formData();
    const file = formData.get('file');
    if (!file) return new Response('No file uploaded', { status: 400 });

    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: 'array' });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });

    const db = env.DB; // 绑定 D1

    // 清空表（重新导入）
    await db.prepare('DELETE FROM 人员表').run();

    // 逐行处理
    for (const row of rows) {
        const accountId = row['玩家账号ID']?.toString().trim();
        const currentName = row['玩家名称']?.toString().trim();
        const historyStr = row['历史名称']?.toString().trim() || '';

        if (!accountId || !currentName) continue;

        // 解析历史名称：用 " / " 分割，得到从旧到新的列表（包含当前名称）
        let nameList = [];
        if (historyStr) {
            nameList = historyStr.split('/').map(s => s.trim()).filter(Boolean);
        }
        // 如果历史名称中不含当前名称，则追加
        if (!nameList.includes(currentName)) {
            nameList.push(currentName);
        }

        // 现在 nameList 是从旧到新的完整列表
        for (let i = 0; i < nameList.length; i++) {
            const name = nameList[i];
            const previousName = i > 0 ? nameList[i-1] : null;
            const isCurrent = (i === nameList.length - 1) ? 1 : 0;

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
        }
    }

    return new Response(JSON.stringify({ ok: true, msg: '导入成功' }), { status: 200 });
}
