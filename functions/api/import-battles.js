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
    return Response.json({ error: "仅支持 POST" }, { status: 405, headers: corsHeaders });
  }

  try {
    const rows = await request.json();
    if (!Array.isArray(rows) || rows.length === 0) {
      return Response.json({ error: "无效的数据格式" }, { status: 400, headers: corsHeaders });
    }

    if (!env.DB) {
      return Response.json({ error: "数据库未绑定" }, { status: 500, headers: corsHeaders });
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
    const sql = `INSERT INTO 战绩表 (${dbColumns.join(',')}) VALUES (${placeholders})`;

    // 数值字段列表（用于类型转换）
    const numericFields = [
      '队伍编号','队伍排名','队伍排名分数','击杀数','最终排名','总分数','总伤害量','击倒数',
      '助攻数','能量道具使用数','爆头击杀数','治疗道具使用数','击杀排名','连杀数','最长击杀距离',
      '救援队友数','载具行驶距离','载具击杀数','游泳距离','误伤队友击杀数','存活时间','载具摧毁数',
      '步行距离','拾取武器数'
    ];

    const BATCH_LIMIT = 50; // 减小批次大小，便于排查
    let totalInserted = 0;
    let errorRows = [];

    for (let i = 0; i < rows.length; i += BATCH_LIMIT) {
      const batch = rows.slice(i, i + BATCH_LIMIT);
      const stmts = [];

      for (let j = 0; j < batch.length; j++) {
        const row = batch[j];
        // 从 row 中按 Excel 列名取数
        const values = dbColumns.map(col => {
          const excelKey = Object.keys(fieldMap).find(k => fieldMap[k] === col);
          let val = row[excelKey];
          if (val === undefined || val === '') return null;
          if (numericFields.includes(col)) {
            const num = parseFloat(val);
            return isNaN(num) ? null : num;
          }
          // 文本字段，如果是数字但不应转换，保持字符串
          return String(val);
        });

        try {
          stmts.push(env.DB.prepare(sql).bind(...values));
        } catch (err) {
          errorRows.push({ index: i + j + 1, error: err.message, row });
        }
      }

      if (stmts.length === 0) continue;

      try {
        const result = await env.DB.batch(stmts);
        totalInserted += result.length;
      } catch (batchErr) {
        // 如果整批失败，尝试逐条插入，定位具体错误行
        console.error(`批次 ${i/BATCH_LIMIT+1} 整体失败:`, batchErr);
        // 回退逐条插入
        for (let k = 0; k < stmts.length; k++) {
          try {
            await stmts[k].run();
            totalInserted++;
          } catch (rowErr) {
            const rowIndex = i + k + 1;
            errorRows.push({ index: rowIndex, error: rowErr.message, row: batch[k] });
            console.error(`第 ${rowIndex} 行插入失败:`, rowErr);
          }
        }
      }
    }

    return Response.json({
      success: true,
      inserted: totalInserted,
      errors: errorRows.length > 0 ? errorRows : undefined
    }, { headers: corsHeaders });

  } catch (err) {
    console.error('导入异常:', err);
    return Response.json({ error: err.message || '服务器内部错误' }, { status: 500, headers: corsHeaders });
  }
}
