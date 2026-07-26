// /functions/api/playerData.js
export async function onRequest({ request, env }) {
    const corsHeaders = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET,OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type"
    };

    if (request.method === "OPTIONS") {
        return new Response(null, { headers: corsHeaders });
    }
    if (request.method !== "GET") {
        return Response.json({ ok: false, msg: "仅支持GET请求" }, { status: 405, headers: corsHeaders });
    }

    try {
        const url = new URL(request.url);
        const username = url.searchParams.get("username");
        const season = url.searchParams.get("season") || "all";

        if (!username) {
            return Response.json({ ok: false, msg: "缺少username参数" }, { headers: corsHeaders });
        }

        // 1. 根据用户名获取玩家ID（只查当前有效名称）
        const userSql = `SELECT id FROM 人员表 WHERE 游戏名称 = ? AND 是否当前 = 1 AND 状态 = 'active'`;
        const userResult = await env.DB.prepare(userSql).bind(username).first();
        if (!userResult) {
            return Response.json({ ok: false, msg: "用户不存在或已禁用" }, { headers: corsHeaders });
        }
        const playerId = userResult.id;

        // 2. 查询该玩家的战绩明细
        let detailSql, detailParams;
        if (season === "all") {
            detailSql = `
                SELECT 
                    赛季, 队伍排名, 击杀数, 死亡类型, 总伤害量, 
                    助攻数, 存活时间, 爆头击杀数, 最长击杀距离
                FROM 战绩表
                WHERE 玩家账号ID = ?
                ORDER BY 赛季 DESC
            `;
            detailParams = [playerId];
        } else {
            detailSql = `
                SELECT 
                    赛季, 队伍排名, 击杀数, 死亡类型, 总伤害量, 
                    助攻数, 存活时间, 爆头击杀数, 最长击杀距离
                FROM 战绩表
                WHERE 玩家账号ID = ? AND 赛季 = ?
                ORDER BY 赛季 DESC
            `;
            detailParams = [playerId, season];
        }

        const { results } = await env.DB.prepare(detailSql).bind(...detailParams).all();

        // 3. 计算当前玩家在该赛季（或全部）中的 KD 排名
        let rank = null;
        if (results && results.length > 0) {
            // 构建排名查询
            // 统计所有玩家在该赛季（或全部）的击杀、死亡
            let rankSql, rankParams;
            if (season === "all") {
                rankSql = `
                    WITH player_stats AS (
                        SELECT 
                            玩家账号ID,
                            SUM(击杀数) AS total_kill,
                            SUM(CASE WHEN 死亡类型 != 'alive' THEN 1 ELSE 0 END) AS total_death
                        FROM 战绩表
                        GROUP BY 玩家账号ID
                    ),
                    player_kd AS (
                        SELECT 
                            玩家账号ID,
                            CASE WHEN total_death = 0 THEN total_kill 
                                 ELSE CAST(total_kill AS REAL) / total_death 
                            END AS kd
                        FROM player_stats
                    )
                    SELECT 
                        COUNT(*) + 1 AS rank
                    FROM player_kd
                    WHERE kd > (SELECT kd FROM player_kd WHERE 玩家账号ID = ?)
                `;
                rankParams = [playerId];
            } else {
                rankSql = `
                    WITH player_stats AS (
                        SELECT 
                            玩家账号ID,
                            SUM(击杀数) AS total_kill,
                            SUM(CASE WHEN 死亡类型 != 'alive' THEN 1 ELSE 0 END) AS total_death
                        FROM 战绩表
                        WHERE 赛季 = ?
                        GROUP BY 玩家账号ID
                    ),
                    player_kd AS (
                        SELECT 
                            玩家账号ID,
                            CASE WHEN total_death = 0 THEN total_kill 
                                 ELSE CAST(total_kill AS REAL) / total_death 
                            END AS kd
                        FROM player_stats
                    )
                    SELECT 
                        COUNT(*) + 1 AS rank
                    FROM player_kd
                    WHERE kd > (SELECT kd FROM player_kd WHERE 玩家账号ID = ?)
                `;
                rankParams = [season, playerId];
            }

            const rankResult = await env.DB.prepare(rankSql).bind(...rankParams).first();
            if (rankResult) {
                rank = rankResult.rank;
            }
        }

        return Response.json({
            ok: true,
            data: results || [],
            rank: rank
        }, { headers: corsHeaders });

    } catch (err) {
        console.error('playerData error:', err);
        return Response.json({
            ok: false,
            msg: "服务异常",
            error: err.message,
            stack: err.stack
        }, { status: 500, headers: corsHeaders });
    }
}
