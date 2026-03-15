const express = require('express');
const Database = require('better-sqlite3');
const crypto = require('crypto');
const path = require('path');

const app = express();
app.use(express.json());

// ====== 数据库初始化 ======
const db = new Database(path.join(__dirname, 'licenses.db'));
db.pragma('journal_mode = WAL');

db.exec(`
    CREATE TABLE IF NOT EXISTS licenses (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        license_key TEXT UNIQUE NOT NULL,
        device_id TEXT DEFAULT NULL,
        created_at TEXT DEFAULT (datetime('now')),
        expires_at TEXT NOT NULL,
        is_active INTEGER DEFAULT 1,
        note TEXT DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS admin_tokens (
        token TEXT PRIMARY KEY
    );

    CREATE TABLE IF NOT EXISTS verify_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        license_key TEXT,
        device_id TEXT,
        result TEXT,
        ip TEXT,
        created_at TEXT DEFAULT (datetime('now'))
    );
`);

// ====== 管理员密钥（首次运行自动生成） ======
const adminRow = db.prepare('SELECT token FROM admin_tokens LIMIT 1').get();
if (!adminRow) {
    const adminToken = crypto.randomBytes(32).toString('hex');
    db.prepare('INSERT INTO admin_tokens (token) VALUES (?)').run(adminToken);
    console.log('========================================');
    console.log('首次运行！你的管理员密钥（请保存）：');
    console.log(adminToken);
    console.log('========================================');
}

// ====== 中间件：管理员鉴权 ======
const requireAdmin = (req, res, next) => {
    const token = req.headers['x-admin-token'];
    if (!token) return res.status(401).json({ error: '缺少管理员密钥' });
    const row = db.prepare('SELECT token FROM admin_tokens WHERE token = ?').get(token);
    if (!row) return res.status(403).json({ error: '密钥无效' });
    next();
};

// ====== 生成序列号 ======
function generateKey() {
    // 格式: XDSQ-XXXX-XXXX-XXXX (下单神器)
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 去掉容易混淆的 0OI1
    const segment = () => Array.from({ length: 4 }, () => chars[crypto.randomInt(chars.length)]).join('');
    return `XDSQ-${segment()}-${segment()}-${segment()}`;
}

// ==========================================
//  APP 端接口（不需要管理员密钥）
// ==========================================

// 验证序列号
app.post('/api/verify', (req, res) => {
    const { license_key, device_id } = req.body;
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;

    if (!license_key || !device_id) {
        return res.json({ valid: false, msg: '参数不完整' });
    }

    const key = license_key.trim().toUpperCase();
    const row = db.prepare('SELECT * FROM licenses WHERE license_key = ?').get(key);

    // 记录验证日志
    const logResult = (result) => {
        db.prepare('INSERT INTO verify_log (license_key, device_id, result, ip) VALUES (?, ?, ?, ?)').run(key, device_id, result, ip);
    };

    if (!row) {
        logResult('not_found');
        return res.json({ valid: false, msg: '序列号不存在' });
    }

    if (!row.is_active) {
        logResult('disabled');
        return res.json({ valid: false, msg: '序列号已被禁用' });
    }

    // 检查过期
    const now = new Date().toISOString();
    if (now > row.expires_at) {
        logResult('expired');
        return res.json({ valid: false, msg: '序列号已过期，请续费', expired: true });
    }

    // 设备绑定
    if (!row.device_id) {
        // 首次使用，绑定设备
        db.prepare('UPDATE licenses SET device_id = ? WHERE license_key = ?').run(device_id, key);
        logResult('bound_new');
        return res.json({
            valid: true,
            msg: '激活成功',
            expires_at: row.expires_at
        });
    }

    if (row.device_id !== device_id) {
        logResult('wrong_device');
        return res.json({ valid: false, msg: '此序列号已绑定其他设备' });
    }

    logResult('ok');
    return res.json({
        valid: true,
        msg: '验证通过',
        expires_at: row.expires_at
    });
});

// ==========================================
//  管理后台接口（需要管理员密钥）
// ==========================================

// 批量生成序列号
app.post('/api/admin/generate', requireAdmin, (req, res) => {
    const count = Math.min(req.body.count || 1, 100);
    const days = req.body.days || 30; // 有效天数
    const note = req.body.note || '';

    const expires = new Date();
    expires.setDate(expires.getDate() + days);
    const expiresAt = expires.toISOString();

    const insert = db.prepare('INSERT INTO licenses (license_key, expires_at, note) VALUES (?, ?, ?)');
    const keys = [];

    const tx = db.transaction(() => {
        for (let i = 0; i < count; i++) {
            const key = generateKey();
            insert.run(key, expiresAt, note);
            keys.push(key);
        }
    });
    tx();

    res.json({
        msg: `已生成 ${count} 个序列号，有效 ${days} 天`,
        expires_at: expiresAt,
        keys
    });
});

// 查看所有序列号
app.get('/api/admin/licenses', requireAdmin, (req, res) => {
    const rows = db.prepare(`
        SELECT id, license_key, device_id, created_at, expires_at, is_active, note,
               CASE WHEN datetime('now') > expires_at THEN 1 ELSE 0 END as is_expired
        FROM licenses ORDER BY created_at DESC
    `).all();
    res.json({ total: rows.length, licenses: rows });
});

// 查看单个序列号详情
app.get('/api/admin/license/:key', requireAdmin, (req, res) => {
    const key = req.params.key.toUpperCase();
    const row = db.prepare('SELECT * FROM licenses WHERE license_key = ?').get(key);
    if (!row) return res.status(404).json({ error: '序列号不存在' });

    const logs = db.prepare('SELECT * FROM verify_log WHERE license_key = ? ORDER BY created_at DESC LIMIT 20').all(key);
    res.json({ license: row, recent_logs: logs });
});

// 禁用序列号
app.post('/api/admin/disable', requireAdmin, (req, res) => {
    const key = (req.body.license_key || '').toUpperCase();
    const result = db.prepare('UPDATE licenses SET is_active = 0 WHERE license_key = ?').run(key);
    if (result.changes === 0) return res.status(404).json({ error: '序列号不存在' });
    res.json({ msg: '已禁用', license_key: key });
});

// 启用序列号
app.post('/api/admin/enable', requireAdmin, (req, res) => {
    const key = (req.body.license_key || '').toUpperCase();
    const result = db.prepare('UPDATE licenses SET is_active = 1 WHERE license_key = ?').run(key);
    if (result.changes === 0) return res.status(404).json({ error: '序列号不存在' });
    res.json({ msg: '已启用', license_key: key });
});

// 续费（延长有效期）
app.post('/api/admin/renew', requireAdmin, (req, res) => {
    const key = (req.body.license_key || '').toUpperCase();
    const days = req.body.days || 30;

    const row = db.prepare('SELECT * FROM licenses WHERE license_key = ?').get(key);
    if (!row) return res.status(404).json({ error: '序列号不存在' });

    // 从当前到期日或今天（取较晚者）开始续
    const base = new Date(Math.max(new Date(row.expires_at).getTime(), Date.now()));
    base.setDate(base.getDate() + days);
    const newExpiry = base.toISOString();

    db.prepare('UPDATE licenses SET expires_at = ?, is_active = 1 WHERE license_key = ?').run(newExpiry, key);
    res.json({ msg: `已续费 ${days} 天`, license_key: key, new_expires_at: newExpiry });
});

// 解绑设备（换机用）
app.post('/api/admin/unbind', requireAdmin, (req, res) => {
    const key = (req.body.license_key || '').toUpperCase();
    const result = db.prepare('UPDATE licenses SET device_id = NULL WHERE license_key = ?').run(key);
    if (result.changes === 0) return res.status(404).json({ error: '序列号不存在' });
    res.json({ msg: '已解绑设备，用户可在新设备上激活', license_key: key });
});

// 统计面板
app.get('/api/admin/stats', requireAdmin, (req, res) => {
    const total = db.prepare('SELECT COUNT(*) as c FROM licenses').get().c;
    const active = db.prepare("SELECT COUNT(*) as c FROM licenses WHERE is_active = 1 AND datetime('now') <= expires_at").get().c;
    const expired = db.prepare("SELECT COUNT(*) as c FROM licenses WHERE datetime('now') > expires_at").get().c;
    const bound = db.prepare("SELECT COUNT(*) as c FROM licenses WHERE device_id IS NOT NULL").get().c;
    const disabled = db.prepare("SELECT COUNT(*) as c FROM licenses WHERE is_active = 0").get().c;
    const todayVerifies = db.prepare("SELECT COUNT(*) as c FROM verify_log WHERE date(created_at) = date('now')").get().c;

    res.json({ total, active, expired, bound, disabled, today_verifies: todayVerifies });
});

// ====== 启动 ======
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`下单神器验证服务运行中: http://localhost:${PORT}`);
    console.log('接口列表:');
    console.log('  POST /api/verify              - App验证序列号');
    console.log('  POST /api/admin/generate       - 生成序列号');
    console.log('  GET  /api/admin/licenses        - 查看所有序列号');
    console.log('  GET  /api/admin/license/:key    - 查看单个详情');
    console.log('  POST /api/admin/disable         - 禁用序列号');
    console.log('  POST /api/admin/enable          - 启用序列号');
    console.log('  POST /api/admin/renew           - 续费');
    console.log('  POST /api/admin/unbind          - 解绑设备');
    console.log('  GET  /api/admin/stats            - 统计面板');
});
