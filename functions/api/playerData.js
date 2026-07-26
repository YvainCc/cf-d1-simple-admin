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

        // 1. 根据用户名获取玩家ID（仅查当前有效名称）
        const userSql = `SELECT id FROM 人员表 WHERE 游戏名称 = ? AND 是否当前 = 1 AND 状态 = 'active'`;
        const userResult = await env.DB.prepare(userSql).bind(username).first();
        if (!userResult) {
            return Response.json({ ok: false, msg: "用户不存在或已禁用" }, { headers: corsHeaders });
        }
        const playerId = userResult.id;

        // 2. 构建战绩查询
        let sql, params;
        if (season === "all") {
            sql = `
                SELECT 
                    赛季, 队伍排名, 击杀数, 死亡类型, 总伤害量, 
                    助攻数, 存活时间, 爆头击杀数
                FROM 战绩表
                WHERE 玩家账号ID = ?
                ORDER BY 赛季 DESC
            `;
            params = [playerId];
        } else {
            sql = `
                SELECT 
                    赛季, 队伍排名, 击杀数, 死亡类型, 总伤害量, 
                    助攻数, 存活时间, 爆头击杀数
                FROM 战绩表
                WHERE 玩家账号ID = ? AND 赛季 = ?
                ORDER BY 赛季 DESC
            `;
            params = [playerId, season];
        }

        const { results } = await env.DB.prepare(sql).bind(...params).all();

        return Response.json({
            ok: true,
            data: results || []
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
