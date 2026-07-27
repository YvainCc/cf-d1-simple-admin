// functions/api/leaderboard.js
// 路由: /api/leaderboard?type=kd&season=1&search=xxx

export async function onRequest(context) {
    const { request, env } = context;
    const url = new URL(request.url);

    const type = url.searchParams.get('type') || 'kd';
    const season = url.searchParams.get('season') || '1';
    const search = url.searchParams.get('search') || '';

    const db = env.DB; // 直接使用绑定的D1变量

    let query, params = [season];

    switch(type) {
        case 'kd':
            query = `
                SELECT u.id, u.username, ps.kd, ps.total_kills, ps.total_matches
                FROM player_stats ps
                JOIN users u ON ps.player_id = u.id
                WHERE ps.season_id = ?
                ORDER BY ps.kd DESC
                LIMIT 100
            `;
            break;
        case 'damage':
            query = `
                SELECT u.id, u.username, ps.total_damage, ps.total_matches
                FROM player_stats ps
                JOIN users u ON ps.player_id = u.id
                WHERE ps.season_id = ?
                ORDER BY ps.total_damage DESC
                LIMIT 100
            `;
            break;
        case 'survival':
            query = `
                SELECT u.id, u.username, ps.avg_survival
                FROM player_stats ps
                JOIN users u ON ps.player_id = u.id
                WHERE ps.season_id = ?
                ORDER BY ps.avg_survival DESC
                LIMIT 100
            `;
            break;
        case 'wins':
            query = `
                SELECT u.id, u.username, ps.total_wins
                FROM player_stats ps
                JOIN users u ON ps.player_id = u.id
                WHERE ps.season_id = ?
                ORDER BY ps.total_wins DESC
                LIMIT 100
            `;
            break;
        case 'teams':
            query = `
                SELECT t.id, t.name, COUNT(tm.player_id) as member_count,
                       SUM(ps.kd) as total_kd, AVG(ps.kd) as avg_kd
                FROM teams t
                JOIN team_members tm ON t.id = tm.team_id
                JOIN player_stats ps ON tm.player_id = ps.player_id
                WHERE t.season_id = ? AND ps.season_id = ?
                GROUP BY t.id
                ORDER BY avg_kd DESC
                LIMIT 50
            `;
            params = [season, season];
            break;
        default:
            return jsonResponse({ error: 'Invalid type' }, 400);
    }

    // 搜索过滤
    if (search && type !== 'teams') {
        query = query.replace('ORDER BY', ` AND u.username LIKE '%${search}%' ORDER BY`);
    }

    const results = await db.prepare(query).bind(...params).all();

    return jsonResponse({ 
        ok: true, 
        data: results.results,
        type,
        season
    });
}

function jsonResponse(data, status = 200) {
    return new Response(JSON.stringify(data), {
        status,
        headers: { 'Content-Type': 'application/json' }
    });
}
