export async function onRequest(context) {
    try {
        const { request, env } = context;
        if (request.method !== 'POST') {
            return new Response(JSON.stringify({ ok: false, msg: 'Method Not Allowed' }), {
                status: 405,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        const formData = await request.formData();
        const file = formData.get('file');
        if (!file) {
            return new Response(JSON.stringify({ ok: false, msg: '未上传文件' }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        const buffer = await file.arrayBuffer();
        const uint8 = new Uint8Array(buffer);
        // 检测 .xlsx（ZIP 文件）
        if (uint8[0] === 0x50 && uint8[1] === 0x4B) {
            return new Response(JSON.stringify({
                ok: false,
                msg: '检测到 .xlsx/.xls 文件，请另存为 CSV（逗号分隔）再上传'
            }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        let text;
        try {
            text = new TextDecoder('utf-8').decode(buffer);
        } catch (e) {
            return new Response(JSON.stringify({
                ok: false,
                msg: '文件不是有效的文本格式，请另存为 UTF-8 编码的 CSV'
            }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        text = text.replace(/^\uFEFF/, '');
        const lines = text.split('\n').filter(line => line.trim() !== '');
        if (lines.length < 2) {
            return new Response(JSON.stringify({ ok: false, msg: '文件为空或格式不正确' }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        const firstLine = lines[0];
        // 检测乱码
        const hasGarbled = /[\uFFFD]/.test(firstLine) ||
            (/[^\x00-\x7F]/.test(firstLine) && !/[\u4e00-\u9fa5]/.test(firstLine));
        if (hasGarbled) {
            return new Response(JSON.stringify({
                ok: false,
                msg: '文件编码不是 UTF-8，请用记事本另存为 UTF-8 编码后再上传'
            }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        // 检测分隔符
        let delimiter = ',';
        if (firstLine.includes('\t')) delimiter = '\t';
        else if (firstLine.includes(';')) delimiter = ';';

        // 解析表头，过滤空列
        const header = firstLine.split(delimiter)
            .map(h => h.trim().replace(/^["']|["']$/g, ''))
            .filter(h => h !== '');

        const nameIdx = header.findIndex(h =>
            h.toLowerCase().includes('玩家名称') ||
            h.toLowerCase().includes('名称') ||
            h.toLowerCase().includes('name')
        );
        const historyIdx = header.findIndex(h =>
            h.toLowerCase().includes('历史名称') ||
            h.toLowerCase().includes('历史') ||
            h.toLowerCase().includes('history')
        );

        if (nameIdx === -1) {
            return new Response(JSON.stringify({
                ok: false,
                msg: `未找到"玩家名称"列，检测到的表头: [${header.join(', ')}]。请确保第一行包含"玩家名称"列。`
            }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        const db = env.DB;
        if (!db) {
            return new Response(JSON.stringify({
                ok: false,
                msg: '数据库未绑定，请确认 Pages 环境中绑定了 D1 数据库，绑定名称为 DB'
            }), {
                status: 500,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        // 清空表
        await db.prepare('DELETE FROM 人员表').run();

        function generateAccountId() {
            return 'account.' + crypto.randomUUID().replace(/-/g, '').substring(0, 32);
        }

        let inserted = 0;

        for (let i = 1; i < lines.length; i++) {
            const cols = lines[i].split(delimiter).map(c => c.trim().replace(/^["']|["']$/g, ''));
            const currentName = cols[nameIdx] || '';
            const historyStr = (historyIdx !== -1 && cols[historyIdx]) ? cols[historyIdx] : '';

            if (!currentName) continue;

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
                const previousName = j > 0 ? nameList[j - 1] : null;
                const isCurrent = (j === nameList.length - 1) ? 1 : 0;

                await db.prepare(`
                    INSERT INTO 人员表 (账号ID, 游戏名称, 密码, 权限, 状态, 历史名称, 是否当前)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                `).bind(accountId, name, null, '队员', '正常', previousName, isCurrent).run();
                inserted++;
            }
        }

        return new Response(JSON.stringify({
            ok: true,
            msg: '导入成功',
            count: inserted
        }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
        });
    } catch (err) {
        // 捕获任何未预期的错误并返回详细信息
        return new Response(JSON.stringify({
            ok: false,
            msg: '服务器错误: ' + err.message + '\n' + err.stack
        }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
}
