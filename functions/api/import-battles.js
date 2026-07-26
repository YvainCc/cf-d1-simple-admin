// functions/api/import-battles.js
export async function onRequest({ request, env }) {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
  };

  if (request.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (request.method !== "POST") {
    return Response.json(
      { error: "仅支持 POST" },
      { status: 405, headers: corsHeaders }
    );
  }

  try {
    const rows = await request.json();
    if (!Array.isArray(rows) || rows.length === 0) {
      return Response.json(
        { error: "无效的数据格式" },
        { status: 400, headers: corsHeaders }
      );
    }

    if (!env.DB) {
      return Response.json(
        { error: "数据库未绑定" },
        { status: 500, headers: corsHeaders }
      );
    }

    // 字段映射（Excel列名 → 数据库字段）
    const fieldMap = {
      '队伍编号': '队伍编号',
      '队伍排名': '队伍排名',
      '队伍排名分数': '队伍排名分数',
      '玩家名称': '玩家名称',
      '击杀数': '击杀数',
      '最终排名': '最终排名',
      '总分数': '总分数',
      '总伤害量': '总伤害量',
      '击倒数': '击倒数',
      '助攻数': '助攻数',
      '能量道具使用数': '能量道具使用数',
      '死亡类型': '死亡类型',
      '爆头击杀数': '爆头击杀数',
      '治疗道具使用数': '治疗道具使用数',
      '击杀排名': '击杀排名',
      '连杀数': '连杀数',
      '最长击杀距离（米）': '最长击杀距离',
      '玩家账号ID': '玩家账号ID',
      '救援队友数': '救援队友数',
      '载具行驶距离（米）': '载具行驶距离',
      '载具击杀数': '载具击杀数',
      '游泳距离（米）': '游泳距离',
      '误伤队友击杀数': '误伤队友击杀数',
      '存活时间（秒）': '存活时间',
      '载具摧毁数': '载具摧毁数',
      '步行距离（米）': '步行距离',
      '拾取武器数': '拾取武器数',
      '赛季': '赛季',
    };

    const dbColumns = Object.values(fieldMap);
    const placeholders = dbColumns.map(() => '?').join(',');

    // 构建 INSERT 语句
    const sql = `INSERT INTO 战绩表 (${dbColumns.join(',')}) VALUES (${placeholders})`;

    // 分批执行（D1 batch 限制 100 条/次）
    const BATCH_LIMIT = 100;
    let totalInserted = 0;

    for (let i = 0; i < rows.length; i += BATCH_LIMIT) {
      const batch = rows.slice(i, i + BATCH_LIMIT);
      const stmts = batch.map(row => {
        const values = dbColumns.map(col => {
          const val = row[col];
          if (val === undefined || val === '') return null;
          return val;
        });
        return env.DB.prepare(sql).bind(...values);
      });
      const result = await env.DB.batch(stmts);
      totalInserted += result.length;
    }

    return Response.json(
      { success: true, inserted: totalInserted },
      { headers: corsHeaders }
    );

  } catch (err) {
    console.error('导入错误:', err);
    return Response.json(
      { error: err.message || '服务器内部错误' },
      { status: 500, headers: corsHeaders }
    );
  }
}
