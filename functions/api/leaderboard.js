// functions/api/leaderboard.js
export async function onRequest(context) {
    const { request, env } = context;
    const url = new URL(request.url);
    const sort = url.searchParams.get('sort') || 'kd';

    const db = env.DB;

    try {
        // 1. 获取所有当前有效的玩家
        const players = await db.prepare(
            'SELECT 账号ID, 游戏名称 FROM 人员表 WHERE 是否当前 = 1'
        ).all();

        if (!players.results.length) {
            return new Response(JSON.stringify({ ok: true, data: [] }), {
                headers: { 'Content-Type': 'application/json' }
            });
        }

        const allStats = [];
        for (const player of players.results) {
            const accountId = player.账号ID;
            const currentName = player.游戏名称;

            // 查询该账号所有名称（历史名称汇总）
            const nameRows = await db.prepare(
                'SELECT 游戏名称 FROM 人员表 WHERE 账号ID = ?'
            ).bind(accountId).all();
            const names = nameRows.results.map(row => row.游戏名称);
            if (names.length === 0) continue;

            const placeholders = names.map(() => '?').join(',');

            // 汇总战绩（存活时间字段存储秒数，最后转换为分钟）
            const query = `
                SELECT 
                    COUNT(*) AS 场次,
                    SUM(击杀数) AS 击杀,
                    SUM(总伤害量) AS 伤害,
                    SUM(存活时间) AS 总存活时间,
                    SUM(CASE WHEN 死亡类型 != 'alive' THEN 1 ELSE 0 END) AS 死亡
                FROM 战绩表
                WHERE 玩家名称 IN (${placeholders})
            `;
            const result = await db.prepare(query).bind(...names).first();

            const 场次 = result.场次 || 0;
            const 击杀 = result.击杀 || 0;
            const 伤害 = result.伤害 || 0;
            const 总存活时间秒 = result.总存活时间 || 0;
            const 死亡 = result.死亡 || 0;

            // 注意：此处死亡判断可能不准确，但按您逻辑保留
            const kd = 死亡 > 0 ? (击杀 / 死亡) : 击杀;
            const avgSurvivalMinutes = 场次 > 0 ? (总存活时间秒 / 场次 / 60) : 0;

            allStats.push({
                账号ID: accountId,
                当前名称: currentName,
                场次,
                击杀,
                死亡,
                伤害,
                平均存活时间: avgSurvivalMinutes,
                KD: kd,
            });
        }

        // 2. 根据排序参数排序
        let sorted = [];
        if (sort === 'kd') {
            sorted = allStats.sort((a, b) => b.KD - a.KD);
        } else if (sort === 'damage') {
            sorted = allStats.sort((a, b) => b.伤害 - a.伤害);
        } else if (sort === 'survival') {
            sorted = allStats.sort((a, b) => b.平均存活时间 - a.平均存活时间);
        } else {
            sorted = allStats;
        }

        const ranked = sorted.map((item, index) => ({
            ...item,
            排名: index + 1
        }));

        // ✅ 关键：增加 ok: true
        return new Response(JSON.stringify({ ok: true, data: ranked }), {
            headers: { 'Content-Type': 'application/json' }
        });

    } catch (err) {
        console.error('Leaderboard API error:', err);
        return new Response(JSON.stringify({ ok: false, error: err.message }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
}
