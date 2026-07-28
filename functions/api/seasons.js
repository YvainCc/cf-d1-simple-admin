// functions/api/seasons.js
export async function onRequest(context) {
    const { env } = context;
    const db = env.DB;

    try {
        const result = await db.prepare(
            'SELECT DISTINCT 赛季 FROM 战绩表 ORDER BY 赛季 DESC'
        ).all();

        const seasons = result.results.map(row => row.赛季).filter(Boolean);

        return new Response(JSON.stringify({
            ok: true,
            seasons: seasons
        }), { headers: { 'Content-Type': 'application/json' } });

    } catch (err) {
        console.error('Seasons API error:', err);
        return new Response(JSON.stringify({
            error: '获取赛季列表失败'
        }), { status: 500 });
    }
}
