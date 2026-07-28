// functions/api/leaderboard.js
export async function onRequest(context) {
    const { request, env } = context;
    const url = new URL(request.url);
    const sort = url.searchParams.get('sort') || 'kd';

    const db = env.DB;

    try {
        // 直接按玩家名称汇总战绩（不再关联人员表，直接用战绩表中的玩家名称）
        // 因为战绩表中的玩家名称就是当时对局的名称，直接聚合即可
        const query = `
            SELECT 
                玩家名称,
                COUNT(*) AS 场次,
                SUM(击杀数) AS 击杀,
                SUM(总伤害量) AS 伤害,
                SUM(存活时间) AS 总存活时间,
                SUM(CASE WHEN 最终排名 = 1 THEN 0 ELSE 1 END) AS 死亡,
                SUM(CASE WHEN 最终排名 = 1 THEN 1 ELSE 0 END) AS 吃鸡数,
                SUM(CASE WHEN 最终排名 <= 10 THEN 1 ELSE 0 END) AS 前十数
            FROM 战绩表
            GROUP BY 玩家名称
            ORDER BY 击杀 DESC
        `;

        const result = await db.prepare(query).all();
        const players = result.results.map(row => {
            const 场次 = row.场次 || 0;
            const 击杀 = row.击杀 || 0;
            const 死亡 = row.死亡 || 0;
            const 伤害 = row.伤害 || 0;
            const 总存活时间 = row.总存活时间 || 0;
            const 吃鸡数 = row.吃鸡数 || 0;
            const 前十数 = row.前十数 || 0;

            const kd = 死亡 > 0 ? (击杀 / 死亡) : 击杀;
            const avgSurvivalMinutes = 场次 > 0 ? (总存活时间 / 场次 / 60) : 0;
            const winRate = 场次 > 0 ? (吃鸡数 / 场次) * 100 : 0;
            const top10Rate = 场次 > 0 ? (前十数 / 场次) * 100 : 0;

            return {
                当前名称: row.玩家名称,
                场次,
                击杀,
                死亡,
                伤害: Math.round(伤害),
                总存活时间: Math.round(总存活时间 / 60), // 转分钟
                平均存活时间: Math.round(avgSurvivalMinutes * 10) / 10,
                KD: Math.round(kd * 100) / 100,
                吃鸡数,
                前十数,
                吃鸡率: Math.round(winRate * 10) / 10,
                前十率: Math.round(top10Rate * 10) / 10
            };
        });

        // 排序
        let sorted = [];
        if (sort === 'kd') {
            sorted = players.sort((a, b) => b.KD - a.KD);
        } else if (sort === 'damage') {
            sorted = players.sort((a, b) => b.伤害 - a.伤害);
        } else if (sort === 'survival') {
            sorted = players.sort((a, b) => b.平均存活时间 - a.平均存活时间);
        } else {
            sorted = players;
        }

        // 添加排名
        const ranked = sorted.map((item, index) => ({
            ...item,
            排名: index + 1
        }));

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
