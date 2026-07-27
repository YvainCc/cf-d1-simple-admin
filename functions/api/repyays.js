// functions/api/replays.js
// 路由: /api/replays (GET/POST)

export async function onRequest(context) {
    const { request, env } = context;
    const db = env.DB;
    const bucket = env.BUCKET; // R2存储桶绑定变量
    const method = request.method;
    const url = new URL(request.url);

    // ===== GET: 获取回放列表 =====
    if (method === 'GET') {
        const season = url.searchParams.get('season');
        let query = 'SELECT * FROM replays';
        const params = [];
        if (season) {
            query += ' WHERE season_id = ?';
            params.push(season);
        }
        query += ' ORDER BY created_at DESC';

        const results = await db.prepare(query).bind(...params).all();
        return jsonResponse({ ok: true, data: results.results });
    }

    // ===== POST: 上传回放（管理员） =====
    if (method === 'POST') {
        const user = await getCurrentUser(request);
        if (!user || !['管理员', '超级管理员'].includes(user.role)) {
            return jsonResponse({ error: '权限不足' }, 403);
        }

        const formData = await request.formData();
        const title = formData.get('title');
        const seasonId = formData.get('seasonId');
        const matchInfo = formData.get('matchInfo');
        const videoFile = formData.get('video');

        if (!videoFile) {
            return jsonResponse({ ok: false, msg: '请选择视频文件' }, 400);
        }

        // 上传到R2
        const fileName = `replays/${Date.now()}_${videoFile.name}`;
        await bucket.put(fileName, videoFile.stream(), {
            httpMetadata: { contentType: videoFile.type }
        });

        // 保存记录到D1
        const result = await db.prepare(
            `INSERT INTO replays (season_id, title, video_url, match_info, uploader_id) 
             VALUES (?, ?, ?, ?, ?)`
        ).bind(seasonId, title, fileName, matchInfo || '', user.id).run();

        return jsonResponse({ 
            ok: true, 
            id: result.meta.last_row_id,
            videoUrl: `/api/replays/file/${fileName}`,
            msg: '上传成功'
        });
    }

    return jsonResponse({ error: 'Method not allowed' }, 405);
}

function jsonResponse(data, status = 200) {
    return new Response(JSON.stringify(data), {
        status,
        headers: { 'Content-Type': 'application/json' }
    });
}

async function getCurrentUser(request) {
    const authHeader = request.headers.get('Authorization');
    const token = authHeader?.replace('Bearer ', '');
    if (!token) return null;
    try {
        const parts = token.split('.');
        if (parts.length !== 3) return null;
        const payload = JSON.parse(atob(parts[1]));
        if (payload.exp < Date.now()) return null;
        return payload;
    } catch {
        return null;
    }
}
