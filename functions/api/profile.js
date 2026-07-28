// functions/api/profile.js
export async function onRequest(context) {
    const { request, env } = context;
    const url = new URL(request.url);
    const username = url.searchParams.get('username');
    const season = url.searchParams.get('season') || 'all'; // 默认全部赛季

    if (!username) {
        return new Response(JSON.stringify({ error: '缺少用户名' }), { status: 400 });
    }

    const db = env.DB;

    try {
        // 1. 根据当前名称查询账号ID
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

        const allNames = nameRows.results.map(row => row.游戏名称);
        if (allNames.length === 0) allNames = [username];

        // 3. 构建查询
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

        // 4. 计算指标
        const totalMatches = result.总场次 || 0;
        const totalKills = result.总击杀 || 0;
        const totalWins = result.吃鸡数 || 0;
        const totalTop10 = result.前十数 || 0;
        const totalDamage = result.总伤害 || 0;
        const totalSurvival = result.总生存时间 || 0;

        const kd = (totalMatches - totalWins) > 0 ? (totalKills / (totalMatches - totalWins)) : totalKills;
        const top10Rate = totalMatches > 0 ? (totalTop10 / totalMatches) * 100 : 0;
        const avgSurvival = totalMatches > 0 ? (totalSurvival / totalMatches / 60) : 0; // 分钟
        const avgKills = totalMatches > 0 ? (totalKills / totalMatches) : 0;
        const winRate = totalMatches > 0 ? (totalWins / totalMatches) * 100 : 0;

        // 最高击杀
        const maxQuery = `
            SELECT MAX(击杀数) AS 最高击杀 FROM 战绩表
            WHERE 玩家名称 IN (${placeholders}) ${seasonCondition}
        `;
        const maxParams = [...allNames];
        if (season !== 'all') maxParams.push(season);
        const maxRow = await db.prepare(maxQuery).bind(...maxParams).first();
        const maxKills = maxRow?.最高击杀 || 0;

        return new Response(JSON.stringify({
            ok: true,
            data: {
                总场次: totalMatches,
                总击杀: totalKills,
                吃鸡数: totalWins,
                前十数: totalTop10,
                总伤害: totalDamage,
                平均生存分钟: parseFloat(avgSurvival.toFixed(1)),
                最高击杀: maxKills,
                KD: parseFloat(kd.toFixed(1)),
                前十率: parseFloat(top10Rate.toFixed(1)),
                击杀场均: parseFloat(avgKills.toFixed(1)),
                吃鸡率: parseFloat(winRate.toFixed(1))
            }
        }), { headers: { 'Content-Type': 'application/json' } });

    } catch (err) {
        console.error('Profile API error:', err);
        return new Response(JSON.stringify({ error: '服务器错误' }), { status: 500 });
    }
}
