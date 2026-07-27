// functions/api/registration.js
// 路由: /api/registration/*

export async function onRequest(context) {
    const { request, env } = context;
    const db = env.DB;
    const method = request.method;
    const url = new URL(request.url);

    // ===== 认证：获取当前用户 =====
    const user = await getCurrentUser(request);
    if (!user) {
        return jsonResponse({ ok: false, msg: '请先登录' }, 401);
    }

    // =============================================================
    // 1. GET /api/registration/status - 获取当前用户报名状态
    // =============================================================
    if (method === 'GET' && url.pathname === '/api/registration/status') {
        // 查询用户所在战队
        const teamMember = await db.prepare(`
            SELECT tm.team_id, tm.role, t.name as team_name, t.captain_id, t.season_id
            FROM team_members tm
            JOIN teams t ON tm.team_id = t.id
            WHERE tm.player_id = ?
        `).bind(user.id).first();

        if (!teamMember) {
            return jsonResponse({
                ok: true,
                hasTeam: false,
                msg: '您尚未加入任何战队'
            });
        }

        // 查询报名状态
        const registration = await db.prepare(`
            SELECT r.*, 
                   (SELECT COUNT(*) FROM registrations WHERE season_id = r.season_id AND status = 'approved') as current_teams
            FROM registrations r
            WHERE r.team_id = ? AND r.season_id = ?
        `).bind(teamMember.team_id, teamMember.season_id).first();

        return jsonResponse({
            ok: true,
            hasTeam: true,
            teamId: teamMember.team_id,
            teamName: teamMember.team_name,
            role: teamMember.role,
            isCaptain: teamMember.captain_id === user.id,
            registration: registration || null,
            currentTeams: registration?.current_teams || 0
        });
    }

    // =============================================================
    // 2. GET /api/registration/parking - 获取20个车位状态
    // =============================================================
    if (method === 'GET' && url.pathname === '/api/registration/parking') {
        const seasonId = url.searchParams.get('season') || '1';

        // 获取当前赛季已报名队伍
        const approved = await db.prepare(`
            SELECT r.team_id, r.status, r.submit_time, t.name as team_name
            FROM registrations r
            JOIN teams t ON r.team_id = t.id
            WHERE r.season_id = ? AND r.status IN ('approved', 'pending')
            ORDER BY r.submit_time ASC
        `).bind(seasonId).all();

        // 获取最大队伍数
        const season = await db.prepare(
            'SELECT max_teams FROM seasons WHERE id = ?'
        ).bind(seasonId).first();

        const maxTeams = season?.max_teams || 20;
        const slots = [];

        for (let i = 0; i < maxTeams; i++) {
            const team = approved.results[i];
            slots.push({
                index: i,
                status: team ? team.status : 'available',
                teamName: team?.team_name || null,
                teamId: team?.team_id || null,
                submitTime: team?.submit_time || null
            });
        }

        return jsonResponse({
            ok: true,
            total: maxTeams,
            filled: approved.results.filter(r => r.status === 'approved').length,
            pending: approved.results.filter(r => r.status === 'pending').length,
            slots: slots
        });
    }

    // =============================================================
    // 3. POST /api/registration/team - 创建战队
    // =============================================================
    if (method === 'POST' && url.pathname === '/api/registration/team') {
        const { teamName, seasonId } = await request.json();

        // 检查用户是否已在其他战队
        const existing = await db.prepare(
            'SELECT team_id FROM team_members WHERE player_id = ?'
        ).bind(user.id).first();

        if (existing) {
            return jsonResponse({ ok: false, msg: '您已在其他战队中' }, 400);
        }

        // 检查赛季是否开放报名
        const season = await db.prepare(
            'SELECT status, max_teams FROM seasons WHERE id = ?'
        ).bind(seasonId).first();

        if (!season || season.status !== '报名中') {
            return jsonResponse({ ok: false, msg: '当前赛季未开放报名' }, 400);
        }

        // 检查战队名是否重复
        const nameExists = await db.prepare(
            'SELECT id FROM teams WHERE name = ? AND season_id = ?'
        ).bind(teamName, seasonId).first();

        if (nameExists) {
            return jsonResponse({ ok: false, msg: '战队名称已被使用' }, 400);
        }

        // 检查名额是否已满
        const teamCount = await db.prepare(
            'SELECT COUNT(*) as count FROM teams WHERE season_id = ?'
        ).bind(seasonId).first();

        if (teamCount.count >= season.max_teams) {
            return jsonResponse({ ok: false, msg: '报名已满' }, 400);
        }

        // 生成邀请码
        const inviteCode = generateInviteCode();

        // 创建战队
        const result = await db.prepare(
            `INSERT INTO teams (name, captain_id, season_id, invite_code, created_at) 
             VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)`
        ).bind(teamName, user.id, seasonId, inviteCode).run();

        const teamId = result.meta.last_row_id;

        // 添加队长为成员（角色为captain）
        await db.prepare(
            `INSERT INTO team_members (team_id, player_id, role, join_time) 
             VALUES (?, ?, 'captain', CURRENT_TIMESTAMP)`
        ).bind(teamId, user.id).run();

        return jsonResponse({
            ok: true,
            teamId: teamId,
            teamName: teamName,
            inviteCode: inviteCode,
            msg: '战队创建成功，邀请码已生成'
        });
    }

    // =============================================================
    // 4. POST /api/registration/join - 加入战队（使用邀请码）
    // =============================================================
    if (method === 'POST' && url.pathname === '/api/registration/join') {
        const { inviteCode } = await request.json();

        // 检查用户是否已在其他战队
        const existing = await db.prepare(
            'SELECT team_id FROM team_members WHERE player_id = ?'
        ).bind(user.id).first();

        if (existing) {
            return jsonResponse({ ok: false, msg: '您已在其他战队中' }, 400);
        }

        // 查询邀请码对应的战队
        const team = await db.prepare(`
            SELECT t.id, t.name, t.captain_id, t.season_id, s.status as season_status
            FROM teams t
            JOIN seasons s ON t.season_id = s.id
            WHERE t.invite_code = ?
        `).bind(inviteCode).first();

        if (!team) {
            return jsonResponse({ ok: false, msg: '邀请码无效' }, 400);
        }

        if (team.season_status !== '报名中') {
            return jsonResponse({ ok: false, msg: '当前赛季未开放报名' }, 400);
        }

        // 检查队伍人数（最多9人：4首发+4替补+1队长）
        const memberCount = await db.prepare(
            'SELECT COUNT(*) as count FROM team_members WHERE team_id = ?'
        ).bind(team.id).first();

        if (memberCount.count >= 9) {
            return jsonResponse({ ok: false, msg: '战队人数已满（最多9人）' }, 400);
        }

        // 加入战队（默认为替补）
        await db.prepare(
            `INSERT INTO team_members (team_id, player_id, role, join_time) 
             VALUES (?, ?, 'substitute', CURRENT_TIMESTAMP)`
        ).bind(team.id, user.id).run();

        return jsonResponse({
            ok: true,
            teamId: team.id,
            teamName: team.name,
            msg: `成功加入 ${team.name}`
        });
    }

    // =============================================================
    // 5. GET /api/registration/team/:teamId/members - 获取队员列表
    // =============================================================
    if (method === 'GET' && url.pathname.startsWith('/api/registration/team/')) {
        const parts = url.pathname.split('/');
        const teamId = parts[parts.length - 2]; // /api/registration/team/123/members
        const action = parts[parts.length - 1];

        if (action === 'members') {
            // 获取队员列表
            const members = await db.prepare(`
                SELECT u.id, u.username, tm.role, 
                       (SELECT historical_total_kd FROM player_stats WHERE player_id = u.id AND season_id = t.season_id) as kd
                FROM team_members tm
                JOIN users u ON tm.player_id = u.id
                JOIN teams t ON tm.team_id = t.id
                WHERE tm.team_id = ?
            `).bind(teamId).all();

            // 获取战队基本信息
            const team = await db.prepare(`
                SELECT t.*, u.username as captain_name
                FROM teams t
                JOIN users u ON t.captain_id = u.id
                WHERE t.id = ?
            `).bind(teamId).first();

            return jsonResponse({
                ok: true,
                team: team,
                members: members.results
            });
        }
    }

    // =============================================================
    // 6. PUT /api/registration/lineup - 确认首发阵容（队长操作）
    // =============================================================
    if (method === 'PUT' && url.pathname === '/api/registration/lineup') {
        const { teamId, lineupPlayerIds } = await request.json();

        // 校验队长权限
        const team = await db.prepare(
            'SELECT captain_id, season_id FROM teams WHERE id = ?'
        ).bind(teamId).first();

        if (!team) {
            return jsonResponse({ ok: false, msg: '战队不存在' }, 404);
        }

        if (team.captain_id !== user.id) {
            return jsonResponse({ ok: false, msg: '只有队长可以确认阵容' }, 403);
        }

        // 校验首发人数是否为4
        if (!lineupPlayerIds || lineupPlayerIds.length !== 4) {
            return jsonResponse({ ok: false, msg: '请选择4名首发队员' }, 400);
        }

        // 校验所有队员是否在战队中
        for (const pid of lineupPlayerIds) {
            const member = await db.prepare(
                'SELECT id FROM team_members WHERE team_id = ? AND player_id = ?'
            ).bind(teamId, pid).first();
            if (!member) {
                return jsonResponse({ ok: false, msg: `队员 ${pid} 不在战队中` }, 400);
            }
        }

        // 更新阵容：先将所有人设为替补
        await db.prepare(
            'UPDATE team_members SET role = ? WHERE team_id = ?'
        ).bind('substitute', teamId).run();

        // 设置首发
        for (const pid of lineupPlayerIds) {
            await db.prepare(
                'UPDATE team_members SET role = ? WHERE team_id = ? AND player_id = ?'
            ).bind('starter', teamId, pid).run();
        }

        // 计算奢侈税
        const taxInfo = await calculateLuxuryTax(db, teamId, team.season_id, lineupPlayerIds);

        return jsonResponse({
            ok: true,
            msg: '阵容确认成功',
            lineup: lineupPlayerIds,
            tax: taxInfo
        });
    }

    // =============================================================
    // 7. POST /api/registration/submit - 提交报名审核
    // =============================================================
    if (method === 'POST' && url.pathname === '/api/registration/submit') {
        const { teamId } = await request.json();

        // 校验队长权限
        const team = await db.prepare(`
            SELECT t.*, s.status as season_status, s.max_teams
            FROM teams t
            JOIN seasons s ON t.season_id = s.id
            WHERE t.id = ?
        `).bind(teamId).first();

        if (!team) {
            return jsonResponse({ ok: false, msg: '战队不存在' }, 404);
        }

        if (team.captain_id !== user.id) {
            return jsonResponse({ ok: false, msg: '只有队长可以提交报名' }, 403);
        }

        if (team.season_status !== '报名中') {
            return jsonResponse({ ok: false, msg: '当前赛季未开放报名' }, 400);
        }

        // 检查是否已报名
        const existingReg = await db.prepare(
            'SELECT id, status FROM registrations WHERE team_id = ? AND season_id = ?'
        ).bind(teamId, team.season_id).first();

        if (existingReg) {
            if (existingReg.status === 'pending') {
                return jsonResponse({ ok: false, msg: '报名已提交，请等待审核' }, 400);
            }
            if (existingReg.status === 'approved') {
                return jsonResponse({ ok: false, msg: '已报名成功，无需重复提交' }, 400);
            }
        }

        // 获取4名首发
        const starters = await db.prepare(`
            SELECT u.id, u.username, 
                   (SELECT historical_total_kd FROM player_stats WHERE player_id = u.id AND season_id = ?) as kd
            FROM team_members tm
            JOIN users u ON tm.player_id = u.id
            WHERE tm.team_id = ? AND tm.role = 'starter'
        `).bind(team.season_id, teamId).all();

        if (starters.results.length !== 4) {
            return jsonResponse({ ok: false, msg: '请先确认4名首发阵容' }, 400);
        }

        // 计算奢侈税
        const lineupIds = starters.results.map(s => s.id);
        const taxInfo = await calculateLuxuryTax(db, teamId, team.season_id, lineupIds);

        // 获取当前已报名队伍数
        const currentTeams = await db.prepare(
            'SELECT COUNT(*) as count FROM registrations WHERE season_id = ? AND status = ?'
        ).bind(team.season_id, 'approved').first();

        if (currentTeams.count >= team.max_teams) {
            return jsonResponse({ ok: false, msg: '报名已满' }, 400);
        }

        // 创建报名记录
        const result = await db.prepare(
            `INSERT INTO registrations 
             (team_id, season_id, lineup_player_ids, sum_kd_at_submit, luxury_tax, status, submit_time) 
             VALUES (?, ?, ?, ?, ?, 'pending', CURRENT_TIMESTAMP)`
        ).bind(
            teamId,
            team.season_id,
            JSON.stringify(lineupIds),
            taxInfo.totalKd,
            taxInfo.taxAmount
        ).run();

        const regId = result.meta.last_row_id;

        // 如果奢侈税 > 0，生成赞助记录
        if (taxInfo.taxAmount > 0) {
            await db.prepare(
                `INSERT INTO sponsorships 
                 (season_id, type, amount, registrant_id, status, created_at) 
                 VALUES (?, 'luxury_tax', ?, ?, 'pending', CURRENT_TIMESTAMP)`
            ).bind(team.season_id, taxInfo.taxAmount, regId).run();
        }

        return jsonResponse({
            ok: true,
            registrationId: regId,
            tax: taxInfo,
            msg: '报名已提交，等待管理员审核'
        });
    }

    // =============================================================
    // 8. GET /api/registration/admin/list - 管理员获取报名列表
    // =============================================================
    if (method === 'GET' && url.pathname === '/api/registration/admin/list') {
        // 校验管理员权限
        if (!['管理员', '超级管理员'].includes(user.role)) {
            return jsonResponse({ ok: false, msg: '权限不足' }, 403);
        }

        const seasonId = url.searchParams.get('season') || '1';
        const status = url.searchParams.get('status') || 'pending';

        const registrations = await db.prepare(`
            SELECT r.*, t.name as team_name, u.username as captain_name,
                   (SELECT amount FROM sponsorships WHERE registrant_id = r.id AND type = 'luxury_tax') as tax_amount
            FROM registrations r
            JOIN teams t ON r.team_id = t.id
            JOIN users u ON t.captain_id = u.id
            WHERE r.season_id = ? AND r.status = ?
            ORDER BY r.submit_time ASC
        `).bind(seasonId, status).all();

        return jsonResponse({
            ok: true,
            data: registrations.results
        });
    }

    // =============================================================
    // 9. PUT /api/registration/admin/:id - 管理员审核报名
    // =============================================================
    if (method === 'PUT' && url.pathname.startsWith('/api/registration/admin/')) {
        // 校验管理员权限
        if (!['管理员', '超级管理员'].includes(user.role)) {
            return jsonResponse({ ok: false, msg: '权限不足' }, 403);
        }

        const regId = url.pathname.split('/').pop();
        const { action, comment } = await request.json();

        if (!['approved', 'rejected'].includes(action)) {
            return jsonResponse({ ok: false, msg: '无效操作' }, 400);
        }

        // 获取报名信息
        const reg = await db.prepare(
            'SELECT * FROM registrations WHERE id = ?'
        ).bind(regId).first();

        if (!reg) {
            return jsonResponse({ ok: false, msg: '报名不存在' }, 404);
        }

        // 更新报名状态
        await db.prepare(
            `UPDATE registrations 
             SET status = ?, approve_time = CURRENT_TIMESTAMP, admin_comment = ? 
             WHERE id = ?`
        ).bind(action, comment || '', regId).run();

        // 如果通过，更新奢侈税状态
        if (action === 'approved') {
            await db.prepare(
                `UPDATE sponsorships 
                 SET status = 'approved', approved_at = CURRENT_TIMESTAMP 
                 WHERE registrant_id = ? AND type = 'luxury_tax'`
            ).bind(regId).run();
        } else {
            await db.prepare(
                `UPDATE sponsorships 
                 SET status = 'rejected', approved_at = CURRENT_TIMESTAMP 
                 WHERE registrant_id = ? AND type = 'luxury_tax'`
            ).bind(regId).run();
        }

        // 记录审计日志
        await db.prepare(
            `INSERT INTO audit_logs (admin_id, action, target_type, target_id, reason) 
             VALUES (?, ?, 'registration', ?, ?)`
        ).bind(user.id, action === 'approved' ? 'approve_reg' : 'reject_reg', regId, comment || '').run();

        return jsonResponse({
            ok: true,
            msg: action === 'approved' ? '报名已通过' : '报名已驳回'
        });
    }

    // =============================================================
    // 10. POST /api/registration/substitution - 申请换人（队长）
    // =============================================================
    if (method === 'POST' && url.pathname === '/api/registration/substitution') {
        const { teamId, outPlayerId, inPlayerId } = await request.json();

        // 校验队长权限
        const team = await db.prepare(
            'SELECT captain_id, season_id FROM teams WHERE id = ?'
        ).bind(teamId).first();

        if (!team || team.captain_id !== user.id) {
            return jsonResponse({ ok: false, msg: '只有队长可以申请换人' }, 403);
        }

        // 检查换人次数（每赛季最多3次）
        const subCount = await db.prepare(
            'SELECT COUNT(*) as count FROM substitution_applications WHERE team_id = ? AND season_id = ? AND status = ?'
        ).bind(teamId, team.season_id, 'approved').first();

        if (subCount.count >= 3) {
            return jsonResponse({ ok: false, msg: '本赛季换人次数已达上限（3次）' }, 400);
        }

        // 获取当前首发
        const starters = await db.prepare(
            'SELECT player_id FROM team_members WHERE team_id = ? AND role = ?'
        ).bind(teamId, 'starter').all();

        const starterIds = starters.results.map(s => s.player_id);

        // 校验下场球员是否在首发中
        if (!starterIds.includes(parseInt(outPlayerId))) {
            return jsonResponse({ ok: false, msg: '该球员不在首发阵容中' }, 400);
        }

        // 校验上场球员是否在替补中
        const subCheck = await db.prepare(
            'SELECT id FROM team_members WHERE team_id = ? AND player_id = ? AND role = ?'
        ).bind(teamId, inPlayerId, 'substitute').first();

        if (!subCheck) {
            return jsonResponse({ ok: false, msg: '该球员不在替补席中' }, 400);
        }

        // 计算新旧奢侈税
        const newStarters = starterIds.map(id => parseInt(id) === parseInt(outPlayerId) ? parseInt(inPlayerId) : parseInt(id));
        const oldTax = await calculateLuxuryTax(db, teamId, team.season_id, starterIds);
        const newTax = await calculateLuxuryTax(db, teamId, team.season_id, newStarters);

        const extraFee = Math.max(0, newTax.taxAmount - oldTax.taxAmount);

        // 创建换人申请
        const result = await db.prepare(
            `INSERT INTO substitution_applications 
             (team_id, season_id, out_player_id, in_player_id, old_tax, new_tax, extra_fee, status, created_at) 
             VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', CURRENT_TIMESTAMP)`
        ).bind(
            teamId,
            team.season_id,
            outPlayerId,
            inPlayerId,
            oldTax.taxAmount,
            newTax.taxAmount,
            extraFee
        ).run();

        const subId = result.meta.last_row_id;

        // 如果需要补缴，生成奢侈税记录
        if (extraFee > 0) {
            await db.prepare(
                `INSERT INTO sponsorships 
                 (season_id, type, amount, registrant_id, status, created_at) 
                 VALUES (?, 'luxury_tax', ?, ?, 'pending', CURRENT_TIMESTAMP)`
            ).bind(team.season_id, extraFee, subId).run();
        }

        return jsonResponse({
            ok: true,
            substitutionId: subId,
            oldTax: oldTax.taxAmount,
            newTax: newTax.taxAmount,
            extraFee: extraFee,
            needPay: extraFee > 0,
            msg: extraFee > 0 ? `换人申请已提交，需补缴奢侈税 ${extraFee} 元` : '换人申请已提交，无需补缴'
        });
    }

    // =============================================================
    // 11. GET /api/registration/substitution/:teamId - 获取换人记录
    // =============================================================
    if (method === 'GET' && url.pathname.startsWith('/api/registration/substitution/')) {
        const teamId = url.pathname.split('/').pop();

        const subs = await db.prepare(`
            SELECT s.*, 
                   u1.username as out_name,
                   u2.username as in_name
            FROM substitution_applications s
            JOIN users u1 ON s.out_player_id = u1.id
            JOIN users u2 ON s.in_player_id = u2.id
            WHERE s.team_id = ?
            ORDER BY s.created_at DESC
        `).bind(teamId).all();

        return jsonResponse({
            ok: true,
            data: subs.results
        });
    }

    // =============================================================
    // 12. PUT /api/registration/substitution/admin/:id - 审核换人
    // =============================================================
    if (method === 'PUT' && url.pathname.startsWith('/api/registration/substitution/admin/')) {
        // 校验管理员权限
        if (!['管理员', '超级管理员'].includes(user.role)) {
            return jsonResponse({ ok: false, msg: '权限不足' }, 403);
        }

        const subId = url.pathname.split('/').pop();
        const { action, comment } = await request.json();

        if (!['approved', 'rejected'].includes(action)) {
            return jsonResponse({ ok: false, msg: '无效操作' }, 400);
        }

        // 获取换人申请详情
        const sub = await db.prepare(
            'SELECT * FROM substitution_applications WHERE id = ?'
        ).bind(subId).first();

        if (!sub) {
            return jsonResponse({ ok: false, msg: '申请不存在' }, 404);
        }

        if (action === 'approved') {
            // 执行换人：更新角色
            await db.prepare(
                `UPDATE team_members SET role = 'substitute' WHERE team_id = ? AND player_id = ?`
            ).bind(sub.team_id, sub.out_player_id).run();

            await db.prepare(
                `UPDATE team_members SET role = 'starter' WHERE team_id = ? AND player_id = ?`
            ).bind(sub.team_id, sub.in_player_id).run();

            // 如果有补缴，更新赞助状态
            if (sub.extra_fee > 0) {
                await db.prepare(
                    `UPDATE sponsorships SET status = 'approved', approved_at = CURRENT_TIMESTAMP 
                     WHERE registrant_id = ? AND type = 'luxury_tax'`
                ).bind(subId).run();
            }
        }

        // 更新换人申请状态
        await db.prepare(
            `UPDATE substitution_applications 
             SET status = ?, approved_at = CURRENT_TIMESTAMP 
             WHERE id = ?`
        ).bind(action, subId).run();

        return jsonResponse({
            ok: true,
            msg: action === 'approved' ? '换人已生效' : '换人已驳回'
        });
    }

    return jsonResponse({ ok: false, msg: '接口不存在' }, 404);
}

// =============================================================
// 工具函数
// =============================================================

function jsonResponse(data, status = 200) {
    return new Response(JSON.stringify(data), {
        status,
        headers: { 'Content-Type': 'application/json' }
    });
}

function generateInviteCode() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
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

// =============================================================
// 奢侈税计算
// =============================================================
async function calculateLuxuryTax(db, teamId, seasonId, lineupPlayerIds) {
    // 获取4名首发的KD
    let totalKd = 0;
    const players = [];

    for (const pid of lineupPlayerIds) {
        const stats = await db.prepare(
            'SELECT historical_total_kd FROM player_stats WHERE player_id = ? AND season_id = ?'
        ).bind(pid, seasonId).first();

        const kd = stats?.historical_total_kd || 0;
        totalKd += kd;
        players.push({ playerId: pid, kd: kd });
    }

    // 计算奢侈税：总和KD > 4.5 时，(总和 - 4.5) * 1000
    const threshold = 4.5;
    let taxAmount = 0;
    if (totalKd > threshold) {
        taxAmount = Math.round((totalKd - threshold) * 1000);
    }

    return {
        totalKd: Math.round(totalKd * 100) / 100,
        players: players,
        threshold: threshold,
        taxAmount: taxAmount
    };
}
