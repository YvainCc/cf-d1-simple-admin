// functions/api/profile.js
export async function onRequest(context) {
    const { request, env } = context;
    const url = new URL(request.url);
    const username = url.searchParams.get('username');
    const season = url.searchParams.get('season') || 'all';

    if (!username) {
        return new Response(JSON.stringify({ error: '缺少用户名' }), { status: 400 });
    }

    const db = env.DB;

    try {
        // 1. 根据当前游戏名称查询账号ID
        const player = await db.prepare(
            'SELECT 账号ID FROM 人员表 WHERE 游戏名称 = ? AND 是否当前 = 1'
        ).bind(username).first();

        if (!player) {
            return new Response(JSON.stringify({ error: '用户不存在' }), { status: 404 });
        }

        const accountId = player.账号ID;

        // 2. 获取该账号下所有名称（包括历史）
        const nameRows = await db.prepare(
            'SELECT 游戏名称 FROM 人员表 WHERE 账号ID = ?'
        ).bind(accountId).all();

        let allNames = nameRows.results.map(row => row.游戏名称);
        if (allNames.length === 0) allNames = [username];

        // 3. 构建查询（根据赛季是否过滤）
        const placeholders = allNames.map(() => '?').join(',');
        let seasonCondition = '';
        const params = [...allNames];
        if (season !== 'all') {
            seasonCondition = ' AND 赛季 = ?';
            params.push(season);
        }

        const query = `
            SELECT 
                COUNT(*) AS 总场次,
                SUM(击杀数) AS 总击杀,
                SUM(总伤害量) AS 总伤害,
                SUM(存活时间) AS 总生存时间,
                SUM(CASE WHEN 最终排名 = 1 THEN 1 ELSE 0 END) AS 吃鸡数,
                SUM(CASE WHEN 最终排名 <= 10 THEN 1 ELSE 0 END) AS 前十数
            FROM 战绩表
            WHERE 玩家名称 IN (${placeholders}) ${seasonCondition}
        `;

        const result = await db.prepare(query).bind(...params).first();

        // 4. 计算各项指标（符合 PUBG 官方规则）
        const totalMatches = result.总场次 || 0;
        const totalKills = result.总击杀 || 0;
        const totalWins = result.吃鸡数 || 0;
        const totalTop10 = result.前十数 || 0;
        const totalDamage = result.总伤害 || 0;
        const totalSurvival = result.总生存时间 || 0;

        // KD = 总击杀 / (总场次 - 吃鸡数)  ，若死亡数为0则KD等于总击杀
        const deaths = totalMatches - totalWins;
        let kd = 0;
        if (deaths > 0) {
            kd = totalKills / deaths;
        } else {
            kd = totalKills; // 无死亡时（所有场次都吃鸡）
        }
        // 四舍五入保留两位小数（PUBG 官方显示两位）
        const kdFinal = Math.round(kd * 100) / 100;

        // 前十率（百分比，保留一位小数）
        const top10Rate = totalMatches > 0 ? Math.round((totalTop10 / totalMatches) * 1000) / 10 : 0;
        // 击杀场均（保留一位小数）
        const avgKills = totalMatches > 0 ? Math.round((totalKills / totalMatches) * 10) / 10 : 0;
        // 吃鸡率（百分比，保留一位小数）
        const winRate = totalMatches > 0 ? Math.round((totalWins / totalMatches) * 1000) / 10 : 0;
        // 平均生存分钟（保留一位小数）
        const avgSurvival = totalMatches > 0 ? Math.round((totalSurvival / totalMatches / 60) * 10) / 10 : 0;

        // 最高击杀
        const maxQuery = `
            SELECT MAX(击杀数) AS 最高击杀 FROM 战绩表
            WHERE 玩家名称 IN (${placeholders}) ${seasonCondition}
        `;
        const maxParams = [...allNames];
        if (season !== 'all') maxParams.push(season);
        const maxRow = await db.prepare(maxQuery).bind(...maxParams).first();
        const maxKills = maxRow?.最高击杀 || 0;

        // 返回数据
        return new Response(JSON.stringify({
            ok: true,
            data: {
                总场次: totalMatches,
                总击杀: totalKills,
                吃鸡数: totalWins,
                前十数: totalTop10,
                总伤害: totalDamage,
                平均生存分钟: avgSurvival,
                最高击杀: maxKills,
                KD: kdFinal,                 // 两位小数
                前十率: top10Rate,           // 一位小数（百分比值）
                击杀场均: avgKills,          // 一位小数
                吃鸡率: winRate              // 一位小数（百分比值）
            }
        }), { headers: { 'Content-Type': 'application/json' } });

    } catch (err) {
        console.error('Profile API error:', err);
        return new Response(JSON.stringify({ error: '服务器错误' }), { status: 500 });
    }
}
